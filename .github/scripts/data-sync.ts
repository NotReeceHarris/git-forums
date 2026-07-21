/**
 * Data-sync workflow entrypoint (run via `npx tsx` from data-sync.yml).
 *
 * One scan of all discussions feeds two outputs, written to $OUT_DIR for the
 * workflow to snapshot-force-push onto the data branch:
 *
 *   profiles/index.json          compact login → rep map (rep.enabled)
 *   profiles/<login>/rep.json    per-user rep + action breakdown
 *   meta.json                    categories + pinned + archivedAt (archive.enabled)
 *   posts/index.json             list rows for home/topic feeds
 *   posts/<number>/content.json  full thread: bodyHTML + comments/replies
 *
 * Everything is a deterministic recompute — idempotent, race-proof, and
 * self-healing (deleted content simply stops appearing). The rep enforcement
 * sweep (move/lock/delete under-rep posts in gated topics) also runs here.
 *
 * Thin I/O wrapper by design: rep math lives in src/lib/rep/engine.ts, which
 * is unit-tested at 100% coverage.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import userConfig from '../../forum.config';
import { mergeConfig } from '../../src/lib/config/schema';
import {
	computeLedger,
	meetsRequirement,
	repOf,
	requiredRep,
	type RepActivity
} from '../../src/lib/rep/engine';

/** How far back the enforcement sweep looks (older posts are left alone) */
const SWEEP_HOURS = 48;

const cfg = mergeConfig(userConfig);
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '/').split('/');
const token = process.env.GITHUB_TOKEN;
const outDir = process.env.OUT_DIR ?? '.data-out';

if (!cfg.rep.enabled && !cfg.archive.enabled) {
	console.log('data-sync: rep and archive are both disabled — nothing to do');
	process.exit(0);
}
if (!owner || !repo || !token) {
	console.error('data-sync: GITHUB_REPOSITORY / GITHUB_TOKEN missing');
	process.exit(1);
}

// both features share one data branch; archive wins when they diverge
const dataBranch = cfg.archive.enabled ? cfg.archive.dataBranch : cfg.rep.dataBranch;
if (process.env.GITHUB_OUTPUT) {
	appendFileSync(process.env.GITHUB_OUTPUT, `branch=${dataBranch}\n`);
}

interface Actor {
	login: string;
	avatarUrl: string;
	url: string;
}
interface ReactionGroup {
	content: string;
	reactors: { totalCount: number };
}
interface ScanReply {
	id: string;
	bodyHTML: string;
	createdAt: string;
	author: Actor | null;
	reactionGroups: ReactionGroup[];
}
interface ScanComment extends ScanReply {
	isAnswer: boolean;
	replies: { totalCount: number; nodes: ScanReply[] };
}
interface Category {
	id: string;
	name: string;
	slug: string;
	emojiHTML: string;
	description: string | null;
	isAnswerable: boolean;
}
interface ScanDiscussion {
	id: string;
	number: number;
	title: string;
	body: string;
	bodyHTML: string;
	url: string;
	createdAt: string;
	lastEditedAt: string | null;
	upvoteCount: number;
	locked: boolean;
	author: Actor | null;
	category: Category;
	answerChosenAt: string | null;
	answer: { author: Actor | null } | null;
	reactionGroups: ReactionGroup[];
	comments: { totalCount: number; nodes: ScanComment[] };
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
	const res = await fetch('https://api.github.com/graphql', {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables })
	});
	if (!res.ok) throw new Error(`GitHub GraphQL HTTP ${res.status}`);
	const json = (await res.json()) as { data: T; errors?: { message: string }[] };
	if (json.errors?.length) throw new Error(json.errors[0].message);
	return json.data;
}

const ACTOR = `author { login avatarUrl url }`;
const REACTIONS = `reactionGroups { content reactors { totalCount } }`;

/** Scan every discussion with full content, plus categories and pins. */
async function scan(): Promise<{
	discussions: ScanDiscussion[];
	categories: Category[];
	pinnedIds: string[];
}> {
	const discussions: ScanDiscussion[] = [];
	let categories: Category[] = [];
	let pinnedIds: string[] = [];
	let after: string | null = null;
	for (;;) {
		const data: {
			repository: {
				discussionCategories: { nodes: Category[] };
				pinnedDiscussions: { nodes: { discussion: { id: string } }[] };
				discussions: {
					pageInfo: { hasNextPage: boolean; endCursor: string | null };
					nodes: ScanDiscussion[];
				};
			};
		} = await gql(
			`query ($owner: String!, $repo: String!, $after: String) {
				repository(owner: $owner, name: $repo) {
					discussionCategories(first: 25) {
						nodes { id name slug emojiHTML description isAnswerable }
					}
					pinnedDiscussions(first: 10) { nodes { discussion { id } } }
					discussions(first: 25, after: $after) {
						pageInfo { hasNextPage endCursor }
						nodes {
							id number title body bodyHTML url createdAt lastEditedAt
							upvoteCount locked ${ACTOR}
							category { id name slug emojiHTML description isAnswerable }
							answerChosenAt answer { author { login avatarUrl url } }
							${REACTIONS}
							comments(first: 100) {
								totalCount
								nodes {
									id bodyHTML createdAt isAnswer ${ACTOR} ${REACTIONS}
									replies(first: 100) {
										totalCount
										nodes { id bodyHTML createdAt ${ACTOR} ${REACTIONS} }
									}
								}
							}
						}
					}
				}
			}`,
			{ owner, repo, after }
		);
		categories = data.repository.discussionCategories.nodes;
		pinnedIds = data.repository.pinnedDiscussions.nodes.map((n) => n.discussion.id);
		discussions.push(...data.repository.discussions.nodes);
		if (!data.repository.discussions.pageInfo.hasNextPage) break;
		after = data.repository.discussions.pageInfo.endCursor;
	}
	return { discussions, categories, pinnedIds };
}

function toActivity(discussions: ScanDiscussion[]): RepActivity[] {
	const activity: RepActivity[] = [];
	for (const d of discussions) {
		if (d.author) {
			activity.push({ login: d.author.login, action: 'post', createdAt: d.createdAt, discussionId: d.id });
		}
		for (const c of d.comments.nodes) {
			if (c.author) {
				activity.push({ login: c.author.login, action: 'comment', createdAt: c.createdAt, discussionId: d.id });
			}
			for (const r of c.replies.nodes) {
				if (r.author) {
					activity.push({ login: r.author.login, action: 'comment', createdAt: r.createdAt, discussionId: d.id });
				}
			}
		}
		if (d.answer?.author && d.answerChosenAt) {
			activity.push({
				login: d.answer.author.login,
				action: 'answerAccepted',
				createdAt: d.answerChosenAt,
				discussionId: d.id
			});
		}
	}
	return activity;
}

function writeJson(path: string, data: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(data, null, '\t') + '\n');
}

/* ------- archive output: shapes mirror the SPA's github/types.ts ------- */

/** Neutralise viewer-specific fields — the archive is the same for everyone */
const neutralReactions = (groups: ReactionGroup[]) =>
	groups.map((g) => ({ content: g.content, viewerHasReacted: false, reactors: g.reactors }));

function toListItem(d: ScanDiscussion) {
	return {
		id: d.id,
		number: d.number,
		title: d.title,
		body: d.body,
		createdAt: d.createdAt,
		upvoteCount: d.upvoteCount,
		author: d.author,
		category: { id: d.category.id, name: d.category.name, slug: d.category.slug, emojiHTML: d.category.emojiHTML },
		comments: { totalCount: d.comments.totalCount }
	};
}

function toArchivedDiscussion(d: ScanDiscussion) {
	return {
		id: d.id,
		number: d.number,
		title: d.title,
		body: d.body,
		bodyHTML: d.bodyHTML,
		url: d.url,
		createdAt: d.createdAt,
		lastEditedAt: d.lastEditedAt,
		upvoteCount: d.upvoteCount,
		viewerHasUpvoted: false,
		locked: d.locked,
		author: d.author,
		category: d.category,
		reactionGroups: neutralReactions(d.reactionGroups),
		comments: {
			totalCount: d.comments.totalCount,
			pageInfo: { endCursor: null, hasNextPage: false },
			nodes: d.comments.nodes.map((c) => ({
				id: c.id,
				bodyHTML: c.bodyHTML,
				createdAt: c.createdAt,
				isAnswer: c.isAnswer,
				author: c.author,
				reactionGroups: neutralReactions(c.reactionGroups),
				replies: {
					totalCount: c.replies.totalCount,
					nodes: c.replies.nodes.map((r) => ({
						id: r.id,
						bodyHTML: r.bodyHTML,
						createdAt: r.createdAt,
						author: r.author,
						reactionGroups: neutralReactions(r.reactionGroups)
					}))
				}
			}))
		}
	};
}

/* ---------------------- rep enforcement (unchanged) ---------------------- */

async function isExempt(login: string): Promise<boolean> {
	if (cfg.admins.logins.includes(login)) return true;
	if (!cfg.rep.exemptMaintainers) return false;
	const res = await fetch(
		`https://api.github.com/repos/${owner}/${repo}/collaborators/${login}/permission`,
		{ headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
	);
	if (!res.ok) return false; // not a collaborator
	const { permission } = (await res.json()) as { permission: string };
	return ['admin', 'write', 'maintain'].includes(permission);
}

async function moderate(d: ScanDiscussion, rep: number, need: number, categories: Category[]) {
	const reason =
		`Posting in this topic requires **${need} rep** — you currently have **${rep}**. ` +
		`Earn rep by posting, commenting, and having answers accepted elsewhere on the forum.`;
	if (cfg.rep.onViolation === 'delete') {
		await gql(`mutation ($id: ID!) { deleteDiscussion(input: { id: $id }) { clientMutationId } }`, { id: d.id });
		console.log(`data-sync: deleted #${d.number} (author below ${need} rep)`);
		return;
	}
	if (cfg.rep.onViolation === 'lock') {
		await gql(
			`mutation ($id: ID!, $body: String!) {
				addDiscussionComment(input: { discussionId: $id, body: $body }) { clientMutationId }
			}`,
			{ id: d.id, body: `${reason} This post has been locked.` }
		);
		await gql(`mutation ($id: ID!) { lockLockable(input: { lockableId: $id }) { clientMutationId } }`, { id: d.id });
		console.log(`data-sync: locked #${d.number} (author below ${need} rep)`);
		return;
	}
	const fallback = categories.find((c) => c.slug === cfg.rep.fallbackTopic);
	if (!fallback) {
		console.error(
			`data-sync: cannot move #${d.number} — fallbackTopic '${cfg.rep.fallbackTopic}' does not match any category slug`
		);
		return;
	}
	await gql(
		`mutation ($id: ID!, $categoryId: ID!) {
			updateDiscussion(input: { discussionId: $id, categoryId: $categoryId }) { clientMutationId }
		}`,
		{ id: d.id, categoryId: fallback.id }
	);
	await gql(
		`mutation ($id: ID!, $body: String!) {
			addDiscussionComment(input: { discussionId: $id, body: $body }) { clientMutationId }
		}`,
		{ id: d.id, body: `${reason} Your post has been moved to a topic open to everyone.` }
	);
	console.log(`data-sync: moved #${d.number} to '${cfg.rep.fallbackTopic}' (author below ${need} rep)`);
}

/* --------------------------------- main --------------------------------- */

async function main() {
	const { discussions, categories, pinnedIds } = await scan();
	const activity = toActivity(discussions);
	const now = new Date().toISOString();

	if (cfg.rep.enabled) {
		const ledger = computeLedger(activity, cfg.rep, now);
		writeJson(join(outDir, 'profiles', 'index.json'), ledger);
		// per-user files: rep + raw action counts (the profile page's counters)
		const breakdowns = new Map<string, { post: number; comment: number; answerAccepted: number }>();
		for (const a of activity) {
			const key = a.login.toLowerCase();
			const b = breakdowns.get(key) ?? { post: 0, comment: 0, answerAccepted: 0 };
			b[a.action] += 1;
			breakdowns.set(key, b);
		}
		for (const [login, rep] of Object.entries(ledger.users)) {
			writeJson(join(outDir, 'profiles', login, 'rep.json'), {
				rep,
				updatedAt: now,
				breakdown: breakdowns.get(login) ?? { post: 0, comment: 0, answerAccepted: 0 }
			});
		}
		console.log(`data-sync: wrote ${Object.keys(ledger.users).length} profiles`);
	}

	if (cfg.archive.enabled) {
		const byNewest = [...discussions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		writeJson(join(outDir, 'meta.json'), {
			archivedAt: now,
			categories,
			pinned: byNewest.filter((d) => pinnedIds.includes(d.id)).map(toListItem)
		});
		writeJson(join(outDir, 'posts', 'index.json'), {
			archivedAt: now,
			discussions: byNewest.map(toListItem)
		});
		for (const d of discussions) {
			writeJson(join(outDir, 'posts', String(d.number), 'content.json'), toArchivedDiscussion(d));
		}
		console.log(`data-sync: archived ${discussions.length} posts`);
	}

	// rep enforcement sweep over recent posts in gated topics
	if (cfg.rep.enabled) {
		const cutoff = Date.now() - SWEEP_HOURS * 3600 * 1000;
		const exemptCache = new Map<string, boolean>();
		for (const d of discussions) {
			const need = requiredRep(cfg.rep, d.category.slug);
			if (need === 0 || !d.author || new Date(d.createdAt).getTime() < cutoff) continue;
			const login = d.author.login;
			if (!exemptCache.has(login)) exemptCache.set(login, await isExempt(login));
			// the post's own gain must not help clear its own gate
			const rep = repOf(
				computeLedger(activity.filter((a) => !(a.discussionId === d.id && a.action === 'post')), cfg.rep),
				login
			);
			if (!meetsRequirement(cfg.rep, d.category.slug, rep, exemptCache.get(login)!)) {
				await moderate(d, rep, need, categories);
			}
		}
	}

	const eventName = process.env.GITHUB_EVENT_NAME ?? 'unknown';
	const eventPath = process.env.GITHUB_EVENT_PATH;
	const action = eventPath
		? (JSON.parse(readFileSync(eventPath, 'utf8')) as { action?: string }).action
		: undefined;
	console.log(`data-sync: run complete (trigger: ${eventName}${action ? `/${action}` : ''})`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
