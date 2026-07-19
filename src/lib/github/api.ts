import { forumConfig } from '$lib/config';
import { auth } from './auth.svelte';
import type {
	Category,
	Discussion,
	DiscussionPage,
	ReactionContent,
	RepositoryPermission,
	SearchResult,
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

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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
	if (json.errors?.length) throw new GitHubError(json.errors[0].message);
	return json.data as T;
}

const ACTOR = `author { login avatarUrl url }`;
const REACTIONS = `reactionGroups { content viewerHasReacted reactors { totalCount } }`;
const LIST_ITEM = `
	id number title body createdAt upvoteCount
	${ACTOR}
	category { id name slug emojiHTML }
	comments { totalCount }
`;

/* ------------------------------------------------------------------ */
/* Articles are ordinary discussions tagged with a hidden HTML comment */
/* ------------------------------------------------------------------ */

const { marker } = forumConfig.content.articles;

export function isArticle(body: string): boolean {
	return forumConfig.content.articles.enabled && body.startsWith(marker);
}

export function stripMarker(body: string): string {
	return body.startsWith(marker) ? body.slice(marker.length).trimStart() : body;
}

/* ----------------- */
/* Repository lookup */
/* ----------------- */

let repoId: string | null = null;
let categoriesCache: Category[] | null = null;
let viewerPermissionCache: RepositoryPermission | null = null;

export async function getCategories(): Promise<Category[]> {
	if (categoriesCache) return categoriesCache;
	const data = await gql<{
		repository: {
			id: string;
			viewerPermission: RepositoryPermission | null;
			discussionCategories: { nodes: Category[] };
		};
	}>(
		`query ($owner: String!, $repo: String!) {
			repository(owner: $owner, name: $repo) {
				id
				viewerPermission
				discussionCategories(first: 25) {
					nodes { id name slug emojiHTML description isAnswerable }
				}
			}
		}`,
		{ owner: forumConfig.repo.owner, repo: forumConfig.repo.name }
	);
	repoId = data.repository.id;
	viewerPermissionCache = data.repository.viewerPermission ?? 'READ';
	const { include, exclude } = forumConfig.content.topics;
	categoriesCache = data.repository.discussionCategories.nodes.filter(
		(c) => (include.length === 0 || include.includes(c.slug)) && !exclude.includes(c.slug)
	);
	return categoriesCache;
}

/** The signed-in user's permission on the forum repository (READ for outsiders). */
export async function getViewerPermission(): Promise<RepositoryPermission> {
	if (!viewerPermissionCache) await getCategories();
	// getCategories always fills the cache (falling back to READ)
	return viewerPermissionCache!;
}

async function getRepoId(): Promise<string> {
	if (!repoId) await getCategories();
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
					totalCount
					pageInfo { endCursor hasNextPage }
					nodes { ${LIST_ITEM} }
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
					id number title body bodyHTML createdAt lastEditedAt
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

/* --------- */
/* Mutations */
/* --------- */

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
	return data.createDiscussion.discussion.number;
}

export async function addComment(discussionId: string, body: string, replyToId?: string) {
	await gql(
		`mutation ($input: AddDiscussionCommentInput!) {
			addDiscussionComment(input: $input) { comment { id } }
		}`,
		{ input: { discussionId, body, ...(replyToId ? { replyToId } : {}) } }
	);
}

export async function toggleReaction(subjectId: string, content: ReactionContent, on: boolean) {
	const mutation = on ? 'addReaction' : 'removeReaction';
	await gql(
		`mutation ($input: ${on ? 'AddReactionInput' : 'RemoveReactionInput'}!) {
			${mutation}(input: $input) { clientMutationId }
		}`,
		{ input: { subjectId, content } }
	);
}

export async function toggleUpvote(subjectId: string, on: boolean) {
	const mutation = on ? 'addUpvote' : 'removeUpvote';
	await gql(
		`mutation ($input: ${on ? 'AddUpvoteInput' : 'RemoveUpvoteInput'}!) {
			${mutation}(input: $input) { clientMutationId }
		}`,
		{ input: { subjectId } }
	);
}

/* ---------------- */
/* Markdown preview */
/* ---------------- */

export async function renderMarkdown(text: string): Promise<string> {
	const res = await fetch('https://api.github.com/markdown', {
		method: 'POST',
		headers: {
			...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			text,
			mode: 'gfm',
			context: `${forumConfig.repo.owner}/${forumConfig.repo.name}`
		})
	});
	if (!res.ok) throw new GitHubError('Markdown preview failed.', res.status);
	return res.text();
}

export type { Viewer };
