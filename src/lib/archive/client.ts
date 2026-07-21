/**
 * Read access to the cold-store archive the data-sync workflow maintains on
 * the data branch. Served raw off GitHub's CDN with `Access-Control-Allow-
 * Origin: *`, so signed-out visitors can browse the forum read-only without
 * touching the (auth-only) GitHub API. Public repositories only; ~5 min CDN
 * cache lag is the accepted freshness trade.
 *
 * Every fetcher returns null on any failure — the caller decides whether that
 * means "show sign-in" or "not yet archived".
 */
import { forumConfig } from '$lib/config';
import type { Category, Discussion, DiscussionListItem } from '$lib/github/types';

export interface ArchiveMeta {
	archivedAt: string;
	categories: Category[];
	pinned: DiscussionListItem[];
}

export interface ArchiveIndex {
	archivedAt: string;
	discussions: DiscussionListItem[];
}

/** Per-user rep file (`profiles/<login>/rep.json`) */
export interface ProfileRep {
	rep: number;
	updatedAt: string;
	/** Raw action counts (uncapped) — doubles as post/comment counters */
	breakdown: { post: number; comment: number; answerAccepted: number };
}

function rawUrl(path: string): string {
	const { owner, name } = forumConfig.repo;
	return `https://raw.githubusercontent.com/${owner}/${name}/${forumConfig.archive.dataBranch}/${path}`;
}

async function fetchJson<T>(path: string): Promise<T | null> {
	try {
		const res = await fetch(rawUrl(path), { cache: 'no-cache' });
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

export function fetchArchiveMeta(): Promise<ArchiveMeta | null> {
	return fetchJson<ArchiveMeta>('meta.json');
}

export function fetchArchiveIndex(): Promise<ArchiveIndex | null> {
	return fetchJson<ArchiveIndex>('posts/index.json');
}

export function fetchArchivedDiscussion(number: number): Promise<Discussion | null> {
	return fetchJson<Discussion>(`posts/${number}/content.json`);
}

export function fetchProfileRep(login: string): Promise<ProfileRep | null> {
	return fetchJson<ProfileRep>(`profiles/${login.toLowerCase()}/rep.json`);
}
