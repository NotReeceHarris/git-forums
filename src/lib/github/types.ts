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
	body: string;
	createdAt: string;
	upvoteCount: number;
	author: Actor | null;
	category: Pick<Category, 'id' | 'name' | 'slug' | 'emojiHTML'>;
	comments: { totalCount: number };
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
