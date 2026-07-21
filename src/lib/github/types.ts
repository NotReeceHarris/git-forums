export interface Actor {
	login: string;
	avatarUrl: string;
	url: string;
}

export interface Category {
	id: string;
	name: string;
	slug: string;
	emojiHTML: string;
	description: string | null;
	isAnswerable: boolean;
}

export interface ReactionGroup {
	content: ReactionContent;
	viewerHasReacted: boolean;
	reactors: { totalCount: number };
}

export type ReactionContent =
	| 'THUMBS_UP'
	| 'THUMBS_DOWN'
	| 'LAUGH'
	| 'HOORAY'
	| 'CONFUSED'
	| 'HEART'
	| 'ROCKET'
	| 'EYES';

export interface DiscussionListItem {
	id: string;
	number: number;
	title: string;
	/** Raw markdown; only fetched when excerpts or articles are enabled */
	body?: string;
	createdAt: string;
	upvoteCount: number;
	author: Actor | null;
	category: Pick<Category, 'id' | 'name' | 'slug' | 'emojiHTML'>;
	comments: { totalCount: number };
	/** Present only while filtering API results to the forum repo */
	repository?: { nameWithOwner: string };
}

export interface DiscussionPage {
	totalCount: number;
	pageInfo: PageInfo;
	nodes: DiscussionListItem[];
}

export interface PageInfo {
	endCursor: string | null;
	hasNextPage: boolean;
}

export interface Reply {
	id: string;
	bodyHTML: string;
	createdAt: string;
	author: Actor | null;
	reactionGroups: ReactionGroup[];
}

export interface Comment extends Reply {
	isAnswer: boolean;
	replies: { totalCount: number; nodes: Reply[] };
}

export interface Discussion {
	id: string;
	number: number;
	title: string;
	body: string;
	bodyHTML: string;
	/** Canonical github.com URL (used for the report-content link) */
	url: string;
	createdAt: string;
	lastEditedAt: string | null;
	upvoteCount: number;
	viewerHasUpvoted: boolean;
	locked: boolean;
	author: Actor | null;
	category: Category;
	reactionGroups: ReactionGroup[];
	comments: { totalCount: number; pageInfo: PageInfo; nodes: Comment[] };
}

export type RepositoryPermission = 'ADMIN' | 'MAINTAIN' | 'WRITE' | 'TRIAGE' | 'READ';

/** A comment a user left somewhere on the forum, for their profile page */
export interface ProfileComment {
	id: string;
	bodyText: string;
	createdAt: string;
	/** Fetched to re-check authorship — the API's user scoping is unreliable */
	author: { login: string } | null;
	discussion: {
		number: number;
		title: string;
		/** Present only while filtering API results to the forum repo */
		repository?: { nameWithOwner: string };
	};
}

export interface UserProfile {
	login: string;
	name: string | null;
	avatarUrl: string;
	url: string;
	bio: string | null;
	createdAt: string;
	/** Raw markdown of the user's github.com profile README (login/login repo), if public */
	readme: string | null;
	/** Discussions the user authored in the forum repository */
	discussions: DiscussionPage;
	/** Comments the user posted in the forum repository (most recent first) */
	comments: { totalCount: number; nodes: ProfileComment[] };
}

export interface Viewer {
	login: string;
	name: string | null;
	avatarUrl: string;
	url: string;
}

export interface SearchResult {
	discussionCount: number;
	nodes: DiscussionListItem[];
}
