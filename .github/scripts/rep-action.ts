/**
 * Reputation workflow entrypoint (run via `npx tsx` from rep.yml).
 *
 * On every discussion / discussion_comment event this script:
 *  1. rescans all discussions and recomputes the rep ledger from scratch
 *     (deterministic + idempotent — see src/lib/rep/engine.ts), writing it to
 *     $LEDGER_PATH for the workflow to commit to the data branch;
 *  2. sweeps recent discussions in rep-gated topics and moderates any whose
 *     author is below the required rep (move/lock/delete + explanatory
 *     comment). Sweeping instead of checking only the triggering event makes
 *     enforcement self-healing when workflow runs are skipped or superseded.
 *
 * Thin I/O wrapper by design: all rep math lives in src/lib/rep/engine.ts,
 * which is unit-tested at 100% coverage.
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
const ledgerPath = process.env.LEDGER_PATH ?? 'rep.json';

if (!cfg.rep.enabled) {
	console.log('rep: feature disabled in forum.config.ts — nothing to do');
	process.exit(0);
}
if (!owner || !repo || !token) {
	console.error('rep: GITHUB_REPOSITORY / GITHUB_TOKEN missing');
	process.exit(1);
}

interface Actor {
	login: string;
}
interface ScanComment {
	author: Actor | null;
	createdAt: string;
	replies: { nodes: { author: Actor | null; createdAt: string }[] };
}
interface ScanDiscussion {
	id: string;
	number: number;
	createdAt: string;
	author: Actor | null;
	category: { id: string; slug: string };
	answerChosenAt: string | null;
	answer: { author: Actor | null } | null;
	comments: { nodes: ScanComment[] };
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

/** Scan every discussion (posts, comments, replies, accepted answers). */
async function scan(): Promise<{
	discussions: ScanDiscussion[];
	categories: { id: string; slug: string }[];
}> {
	const discussions: ScanDiscussion[] = [];
	let categories: { id: string; slug: string }[] = [];
	let after: string | null = null;
	for (;;) {
		const data: {
			repository: {
				discussionCategories: { nodes: { id: string; slug: string }[] };
				discussions: {
					pageInfo: { hasNextPage: boolean; endCursor: string | null };
					nodes: ScanDiscussion[];
				};
			};
		} = await gql(
			`query ($owner: String!, $repo: String!, $after: String) {
				repository(owner: $owner, name: $repo) {
					discussionCategories(first: 25) { nodes { id slug } }
					discussions(first: 50, after: $after) {
						pageInfo { hasNextPage endCursor }
						nodes {
							id number createdAt author { login }
							category { id slug }
							answerChosenAt answer { author { login } }
							comments(first: 100) {
								nodes {
									author { login } createdAt
									replies(first: 100) { nodes { author { login } createdAt } }
								}
							}
						}
					}
				}
			}`,
			{ owner, repo, after }
		);
		categories = data.repository.discussionCategories.nodes;
		discussions.push(...data.repository.discussions.nodes);
		if (!data.repository.discussions.pageInfo.hasNextPage) break;
		after = data.repository.discussions.pageInfo.endCursor;
	}
	return { discussions, categories };
}

function toActivity(discussions: ScanDiscussion[]): RepActivity[] {
	const activity: RepActivity[] = [];
	for (const d of discussions) {
		if (d.author) {
			activity.push({
				login: d.author.login,
				action: 'post',
				createdAt: d.createdAt,
				discussionId: d.id
			});
		}
		for (const c of d.comments.nodes) {
			if (c.author) {
				activity.push({
					login: c.author.login,
					action: 'comment',
					createdAt: c.createdAt,
					discussionId: d.id
				});
			}
			for (const r of c.replies.nodes) {
				if (r.author) {
					activity.push({
						login: r.author.login,
						action: 'comment',
						createdAt: r.createdAt,
						discussionId: d.id
					});
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

/** Does this login bypass rep gates? (config admin or push access) */
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

async function moderate(
	d: ScanDiscussion,
	rep: number,
	need: number,
	categories: { id: string; slug: string }[]
): Promise<void> {
	const reason =
		`Posting in this topic requires **${need} rep** — you currently have **${rep}**. ` +
		`Earn rep by posting, commenting, and having answers accepted elsewhere on the forum.`;
	if (cfg.rep.onViolation === 'delete') {
		await gql(`mutation ($id: ID!) { deleteDiscussion(input: { id: $id }) { clientMutationId } }`, {
			id: d.id
		});
		console.log(`rep: deleted #${d.number} (author below ${need} rep)`);
		return;
	}
	if (cfg.rep.onViolation === 'lock') {
		await gql(
			`mutation ($id: ID!, $body: String!) {
				addDiscussionComment(input: { discussionId: $id, body: $body }) { clientMutationId }
			}`,
			{ id: d.id, body: `${reason} This post has been locked.` }
		);
		await gql(`mutation ($id: ID!) { lockLockable(input: { lockableId: $id }) { clientMutationId } }`, {
			id: d.id
		});
		console.log(`rep: locked #${d.number} (author below ${need} rep)`);
		return;
	}
	// default: move to the fallback topic
	const fallback = categories.find((c) => c.slug === cfg.rep.fallbackTopic);
	if (!fallback) {
		console.error(
			`rep: cannot move #${d.number} — fallbackTopic '${cfg.rep.fallbackTopic}' does not match any category slug`
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
	console.log(`rep: moved #${d.number} to '${cfg.rep.fallbackTopic}' (author below ${need} rep)`);
}

async function main() {
	const { discussions, categories } = await scan();
	const activity = toActivity(discussions);

	// 1. recompute + write the ledger
	const ledger = computeLedger(activity, cfg.rep);
	writeFileSync(ledgerPath, JSON.stringify(ledger, null, '\t') + '\n');
	console.log(`rep: ledger written (${Object.keys(ledger.users).length} users) to ${ledgerPath}`);

	// 2. enforcement sweep over recent posts in gated topics
	const cutoff = Date.now() - SWEEP_HOURS * 3600 * 1000;
	const exemptCache = new Map<string, boolean>();
	for (const d of discussions) {
		const need = requiredRep(cfg.rep, d.category.slug);
		if (need === 0 || !d.author || new Date(d.createdAt).getTime() < cutoff) continue;
		const login = d.author.login;
		if (!exemptCache.has(login)) exemptCache.set(login, await isExempt(login));
		// the post's own gain must not help clear its own gate — recompute
		// this author's rep without the candidate post
		const rep = repOf(
			computeLedger(
				activity.filter((a) => !(a.discussionId === d.id && a.action === 'post')),
				cfg.rep
			),
			login
		);
		if (!meetsRequirement(cfg.rep, d.category.slug, rep, exemptCache.get(login)!)) {
			await moderate(d, rep, need, categories);
		}
	}

	// event context is only logged — the sweep already covers the trigger
	const eventName = process.env.GITHUB_EVENT_NAME ?? 'unknown';
	const eventPath = process.env.GITHUB_EVENT_PATH;
	const action = eventPath
		? (JSON.parse(readFileSync(eventPath, 'utf8')) as { action?: string }).action
		: undefined;
	console.log(`rep: run complete (trigger: ${eventName}${action ? `/${action}` : ''})`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
