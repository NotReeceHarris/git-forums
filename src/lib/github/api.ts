import { invalidateCache } from '$lib/cache';
import { forumConfig } from '$lib/config';
import { auth } from './auth.svelte';
import type {
	Category,
	Discussion,
	DiscussionListItem,
	DiscussionPage,
	ReactionContent,
	Reply,
	RepositoryPermission,
	SearchResult,
	UserProfile,
	Viewer
} from './types';

class GitHubError extends Error {
	constructor(
		message: string,
		public status?: number
	) {
		super(message);
	}
}

async function gql<T>(
	query: string,
	variables: Record<string, unknown> = {},
	opts: {
		/**
		 * Return the partial data when the only errors are NOT_FOUND — used for
		 * queries with optional parts (e.g. a profile README repo that may not
		 * exist), where GitHub nulls the missing field but still reports it.
		 */
		tolerateNotFound?: boolean;
	} = {}
): Promise<T> {
	if (!auth.token) {
		throw new GitHubError('Sign in to browse the forum — GitHub Discussions requires an API token.', 401);
	}
	const res = await fetch('https://api.github.com/graphql', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${auth.token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ query, variables })
	});
	if (res.status === 401) {
		auth.signOut();
		throw new GitHubError('Your GitHub token is no longer valid — please sign in again.', 401);
	}
	if (!res.ok) throw new GitHubError(`GitHub API error (${res.status}).`, res.status);
	const json = await res.json();
	if (json.errors?.length) {
		const onlyNotFound = json.errors.every(
			(e: { type?: string }) => e.type === 'NOT_FOUND'
		);
		if (!(opts.tolerateNotFound && onlyNotFound && json.data)) {
			throw new GitHubError(json.errors[0].message);
		}
	}
	return json.data as T;
}

const ACTOR = `author { login avatarUrl url }`;
const REACTIONS = `reactionGroups { content viewerHasReacted reactors { totalCount } }`;
// Bodies are only needed in lists for excerpts and article detection — skip
// the (potentially very large) field entirely when neither feature wants it.
const LIST_NEEDS_BODY = forumConfig.content.listExcerpts || forumConfig.content.articles.enabled;
const LIST_ITEM = `
	id number title ${LIST_NEEDS_BODY ? 'body' : ''} createdAt upvoteCount
	${ACTOR}
	category { id name slug emojiHTML }
	comments { totalCount }
`;
const CATEGORY_FIELDS = `id name slug emojiHTML description isAnswerable`;
const DISCUSSIONS_PAGE = `
	totalCount
	pageInfo { endCursor hasNextPage }
	nodes { ${LIST_ITEM} }
`;

/* ------------------------------------------------------------------ */
/* Articles are ordinary discussions tagged with a hidden HTML comment */
/* ------------------------------------------------------------------ */

const { marker } = forumConfig.content.articles;

export function isArticle(body: string | undefined): boolean {
	return forumConfig.content.articles.enabled && !!body && body.startsWith(marker);
}

export function stripMarker(body: string): string {
	return body.startsWith(marker) ? body.slice(marker.length).trimStart() : body;
}

/* ----------------- */
/* Repository lookup */
/* ----------------- */

let repoId: string | null = null;
let overviewPromise: Promise<ForumOverview> | null = null;

export interface ForumOverview {
	categories: Category[];
	viewerPermission: RepositoryPermission;
	/** First page of the all-topics feed (the home page) */
	discussions: DiscussionPage;
	/**
	 * Discussions pinned on github.com (maintainers pin via the GitHub UI —
	 * the API only exposes reading them). Shown above the regular list.
	 */
	pinned: DiscussionListItem[];
}

/**
 * Everything the app needs to boot, in a single GraphQL round-trip:
 * categories, the viewer's permission, and the first page of discussions.
 * The session-level promise deduplicates concurrent callers; pass
 * `fresh: true` to force a revalidation.
 */
export function getOverview(opts: { fresh?: boolean } = {}): Promise<ForumOverview> {
	if (!overviewPromise || opts.fresh) {
		overviewPromise = fetchOverview().catch((error) => {
			// don't cache failures — the next call retries
			overviewPromise = null;
			throw error;
		});
	}
	return overviewPromise;
}

async function fetchOverview(): Promise<ForumOverview> {
	const data = await gql<{
		repository: {
			id: string;
			viewerPermission: RepositoryPermission | null;
			discussionCategories: { nodes: Category[] };
			discussions: DiscussionPage;
			pinnedDiscussions: { nodes: { discussion: DiscussionListItem }[] };
		};
	}>(
		`query ($owner: String!, $repo: String!, $first: Int!) {
			repository(owner: $owner, name: $repo) {
				id
				viewerPermission
				discussionCategories(first: 25) { nodes { ${CATEGORY_FIELDS} } }
				discussions(first: $first, orderBy: { field: ${forumConfig.content.sort}, direction: DESC }) {
					${DISCUSSIONS_PAGE}
				}
				pinnedDiscussions(first: 10) { nodes { discussion { ${LIST_ITEM} } } }
			}
		}`,
		{
			owner: forumConfig.repo.owner,
			repo: forumConfig.repo.name,
			first: forumConfig.content.pageSize
		}
	);
	repoId = data.repository.id;
	const { include, exclude } = forumConfig.content.topics;
	const visible = (slug: string) =>
		(include.length === 0 || include.includes(slug)) && !exclude.includes(slug);
	return {
		categories: data.repository.discussionCategories.nodes.filter((c) => visible(c.slug)),
		viewerPermission: data.repository.viewerPermission ?? 'READ',
		discussions: data.repository.discussions,
		pinned: data.repository.pinnedDiscussions.nodes
			.map((n) => n.discussion)
			.filter((d) => visible(d.category.slug))
	};
}

export async function getCategories(): Promise<Category[]> {
	return (await getOverview()).categories;
}

/** The signed-in user's permission on the forum repository (READ for outsiders). */
export async function getViewerPermission(): Promise<RepositoryPermission> {
	return (await getOverview()).viewerPermission;
}

async function getRepoId(): Promise<string> {
	if (!repoId) await getOverview();
	return repoId!;
}

/* ----------- */
/* Discussions */
/* ----------- */

export async function listDiscussions(opts: {
	categoryId?: string;
	after?: string | null;
	first?: number;
}): Promise<DiscussionPage> {
	const data = await gql<{ repository: { discussions: DiscussionPage } }>(
		`query ($owner: String!, $repo: String!, $first: Int!, $after: String, $categoryId: ID) {
			repository(owner: $owner, name: $repo) {
				discussions(
					first: $first, after: $after, categoryId: $categoryId,
					orderBy: { field: ${forumConfig.content.sort}, direction: DESC }
				) {
					${DISCUSSIONS_PAGE}
				}
			}
		}`,
		{
			owner: forumConfig.repo.owner,
			repo: forumConfig.repo.name,
			first: opts.first ?? forumConfig.content.pageSize,
			after: opts.after ?? null,
			categoryId: opts.categoryId ?? null
		}
	);
	return data.repository.discussions;
}

export async function getDiscussion(number: number): Promise<Discussion> {
	const data = await gql<{ repository: { discussion: Discussion } }>(
		`query ($owner: String!, $repo: String!, $number: Int!) {
			repository(owner: $owner, name: $repo) {
				discussion(number: $number) {
					id number title body bodyHTML url createdAt lastEditedAt
					upvoteCount viewerHasUpvoted locked
					${ACTOR}
					category { id name slug emojiHTML description isAnswerable }
					${REACTIONS}
					comments(first: 100) {
						totalCount
						pageInfo { endCursor hasNextPage }
						nodes {
							id bodyHTML createdAt isAnswer
							${ACTOR}
							${REACTIONS}
							replies(first: 100) {
								totalCount
								nodes {
									id bodyHTML createdAt
									${ACTOR}
									${REACTIONS}
								}
							}
						}
					}
				}
			}
		}`,
		{ owner: forumConfig.repo.owner, repo: forumConfig.repo.name, number }
	);
	if (!data.repository.discussion) throw new GitHubError('Discussion not found.', 404);
	return data.repository.discussion;
}

export async function searchDiscussions(term: string): Promise<SearchResult> {
	const q = `repo:${forumConfig.repo.owner}/${forumConfig.repo.name} ${term}`;
	const data = await gql<{ search: SearchResult }>(
		`query ($q: String!) {
			search(query: $q, type: DISCUSSION, first: 25) {
				discussionCount
				nodes { ... on Discussion { ${LIST_ITEM} } }
			}
		}`,
		{ q }
	);
	return data.search;
}

/* -------------- */
/* User profiles  */
/* -------------- */

const PROFILE_COMMENT = `id bodyText createdAt author { login } discussion { number title repository { nameWithOwner } }`;
// The `repositoryId` scoping on repositoryDiscussions/-Comments is not
// reliably honoured by GitHub's API, and repositoryDiscussionComments has been
// observed returning comments *other users* wrote. Every node therefore also
// carries its repository and author so results are re-checked client-side.
const PROFILE_DISCUSSIONS_PAGE = `
	totalCount
	pageInfo { endCursor hasNextPage }
	nodes { ${LIST_ITEM} repository { nameWithOwner } }
`;

function forumRepoName(): string {
	return `${forumConfig.repo.owner}/${forumConfig.repo.name}`;
}

/**
 * Keep only nodes that are in the forum repository AND authored by the profile
 * user. When nothing was dropped the server-side scoping worked and its
 * totalCount is trusted; otherwise the count degrades to the number of
 * matching nodes actually fetched.
 */
function ownProfileNodes<
	T extends { author: { login: string } | null; repository?: { nameWithOwner: string } }
>(login: string, page: { totalCount: number; nodes: T[] }): { totalCount: number; nodes: T[] } {
	const user = login.toLowerCase();
	const nodes = page.nodes.filter(
		(n) =>
			n.author?.login.toLowerCase() === user &&
			n.repository?.nameWithOwner === forumRepoName()
	);
	return {
		totalCount: nodes.length === page.nodes.length ? page.totalCount : nodes.length,
		nodes
	};
}

/**
 * Everything the profile page needs in one round-trip: the user's identity,
 * their github.com profile README (the README.md of their `login/login` repo,
 * when that repo is public), and their posts and comments scoped to the forum
 * repository.
 */
export async function getUserProfile(login: string): Promise<UserProfile> {
	const repositoryId = await getRepoId();
	const data = await gql<{
		user: {
			login: string;
			name: string | null;
			avatarUrl: string;
			url: string;
			bio: string | null;
			createdAt: string;
			repository: { object: { text: string } | null } | null;
			repositoryDiscussions: DiscussionPage;
			repositoryDiscussionComments: {
				totalCount: number;
				nodes: UserProfile['comments']['nodes'];
			};
		} | null;
	}>(
		`query ($login: String!, $repositoryId: ID!, $first: Int!) {
			user(login: $login) {
				login name avatarUrl url bio createdAt
				repository(name: $login) {
					object(expression: "HEAD:README.md") { ... on Blob { text } }
				}
				repositoryDiscussions(
					first: $first, repositoryId: $repositoryId,
					orderBy: { field: CREATED_AT, direction: DESC }
				) {
					${PROFILE_DISCUSSIONS_PAGE}
				}
				repositoryDiscussionComments(first: 100, repositoryId: $repositoryId) {
					totalCount
					nodes { ${PROFILE_COMMENT} }
				}
			}
		}`,
		{ login, repositoryId, first: forumConfig.content.pageSize },
		// the login/login profile-README repo often doesn't exist — GitHub
		// reports it as a NOT_FOUND error alongside the (complete) profile data
		{ tolerateNotFound: true }
	);
	if (!data.user) throw new GitHubError('User not found.', 404);
	const discussions = ownProfileNodes(data.user.login, data.user.repositoryDiscussions);
	// comments carry their repository on the parent discussion — lift it so
	// they go through the same filter as posts
	const comments = ownProfileNodes(data.user.login, {
		totalCount: data.user.repositoryDiscussionComments.totalCount,
		nodes: data.user.repositoryDiscussionComments.nodes.map((c) => ({
			...c,
			repository: c.discussion.repository
		}))
	});
	return {
		login: data.user.login,
		name: data.user.name,
		avatarUrl: data.user.avatarUrl,
		url: data.user.url,
		bio: data.user.bio,
		createdAt: data.user.createdAt,
		readme: data.user.repository?.object?.text ?? null,
		discussions: { ...data.user.repositoryDiscussions, ...discussions },
		comments
	};
}

/** Next page of a user's forum posts (profile page "Load more"). */
export async function listUserDiscussions(
	login: string,
	after: string | null
): Promise<DiscussionPage> {
	const repositoryId = await getRepoId();
	const data = await gql<{ user: { repositoryDiscussions: DiscussionPage } | null }>(
		`query ($login: String!, $repositoryId: ID!, $first: Int!, $after: String) {
			user(login: $login) {
				repositoryDiscussions(
					first: $first, after: $after, repositoryId: $repositoryId,
					orderBy: { field: CREATED_AT, direction: DESC }
				) {
					${PROFILE_DISCUSSIONS_PAGE}
				}
			}
		}`,
		{ login, repositoryId, first: forumConfig.content.pageSize, after }
	);
	if (!data.user) throw new GitHubError('User not found.', 404);
	const page = data.user.repositoryDiscussions;
	return { ...page, ...ownProfileNodes(login, page) };
}

/* --------- */
/* Mutations */
/* --------- */

/**
 * Edit a discussion's title, body, and/or category. GitHub only permits this
 * for the author and users with repository write access; the UI gates on the
 * same rule, and the API enforces it server-side regardless.
 */
export async function updateDiscussion(
	discussionId: string,
	changes: { title?: string; body?: string; categoryId?: string }
): Promise<Pick<Discussion, 'title' | 'body' | 'bodyHTML' | 'category'>> {
	const data = await gql<{
		updateDiscussion: { discussion: Pick<Discussion, 'title' | 'body' | 'bodyHTML' | 'category'> };
	}>(
		`mutation ($input: UpdateDiscussionInput!) {
			updateDiscussion(input: $input) {
				discussion { title body bodyHTML category { ${CATEGORY_FIELDS} } }
			}
		}`,
		{ input: { discussionId, ...changes } }
	);
	invalidateCache('discussion');
	return data.updateDiscussion.discussion;
}

/** Permanently delete a discussion (author or repository write access only). */
export async function deleteDiscussion(id: string): Promise<void> {
	await gql(
		`mutation ($input: DeleteDiscussionInput!) {
			deleteDiscussion(input: $input) { clientMutationId }
		}`,
		{ input: { id } }
	);
	invalidateCache('discussion');
}

export async function createDiscussion(opts: {
	categoryId: string;
	title: string;
	body: string;
	article?: boolean;
}): Promise<number> {
	const repositoryId = await getRepoId();
	const body = opts.article ? `${marker}\n\n${opts.body}` : opts.body;
	const data = await gql<{ createDiscussion: { discussion: { number: number } } }>(
		`mutation ($input: CreateDiscussionInput!) {
			createDiscussion(input: $input) { discussion { number } }
		}`,
		{ input: { repositoryId, categoryId: opts.categoryId, title: opts.title, body } }
	);
	invalidateCache('discussions');
	return data.createDiscussion.discussion.number;
}

/**
 * Post a comment (or a reply when `replyToId` is set) and return the created
 * node with everything needed to render it — callers insert it into the
 * thread optimistically instead of refetching the whole discussion.
 */
export async function addComment(
	discussionId: string,
	body: string,
	replyToId?: string
): Promise<Reply> {
	const data = await gql<{ addDiscussionComment: { comment: Reply } }>(
		`mutation ($input: AddDiscussionCommentInput!) {
			addDiscussionComment(input: $input) {
				comment { id bodyHTML createdAt ${ACTOR} ${REACTIONS} }
			}
		}`,
		{ input: { discussionId, body, ...(replyToId ? { replyToId } : {}) } }
	);
	// comment counts in lists and the thread itself are now stale
	invalidateCache('discussion');
	return data.addDiscussionComment.comment;
}

export async function toggleReaction(subjectId: string, content: ReactionContent, on: boolean) {
	const mutation = on ? 'addReaction' : 'removeReaction';
	await gql(
		`mutation ($input: ${on ? 'AddReactionInput' : 'RemoveReactionInput'}!) {
			${mutation}(input: $input) { clientMutationId }
		}`,
		{ input: { subjectId, content } }
	);
	invalidateCache('discussion');
}

export async function toggleUpvote(subjectId: string, on: boolean) {
	const mutation = on ? 'addUpvote' : 'removeUpvote';
	await gql(
		`mutation ($input: ${on ? 'AddUpvoteInput' : 'RemoveUpvoteInput'}!) {
			${mutation}(input: $input) { clientMutationId }
		}`,
		{ input: { subjectId } }
	);
	invalidateCache('discussion');
}

/* ---------------- */
/* Markdown preview */
/* ---------------- */

/**
 * Render markdown via the GitHub API. `gfm` mode (the default) matches how
 * GitHub renders comments — single newlines become hard breaks. Documents like
 * profile READMEs must use `markdown` mode, which flows single newlines like
 * github.com's file renderer does.
 */
export async function renderMarkdown(
	text: string,
	opts: { context?: string; mode?: 'gfm' | 'markdown' } = {}
): Promise<string> {
	const res = await fetch('https://api.github.com/markdown', {
		method: 'POST',
		headers: {
			...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			text,
			mode: opts.mode ?? 'gfm',
			context: opts.context ?? `${forumConfig.repo.owner}/${forumConfig.repo.name}`
		})
	});
	if (!res.ok) throw new GitHubError('Markdown preview failed.', res.status);
	return res.text();
}

export type { Viewer };
