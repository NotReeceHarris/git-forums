/**
 * Stale-while-revalidate cache for GraphQL data, backed by localStorage.
 *
 * Reads are served from cache instantly (when present and unexpired), then a
 * network fetch always revalidates in the background and updates both the
 * cache and the caller. Entries are:
 *
 *  - versioned    — a schema bump invalidates every old entry
 *  - user-scoped  — responses contain viewer-specific fields (reactions,
 *                   permissions), so entries are keyed by the signed-in login
 *                   and wiped on sign-out
 *  - TTL-bounded  — entries older than `cache.ttlSeconds` are never served
 *  - quota-safe   — writes that overflow localStorage prune the oldest
 *                   entries and retry once, then degrade to network-only
 */
import { forumConfig } from './config';

/** Bump when the shape of cached GraphQL data changes */
const VERSION = 1;
const BASE = 'dk:cache:';
const PREFIX = `${BASE}v${VERSION}:`;

let scope = 'anon';

/** Isolate cache entries per signed-in user (null → anonymous). */
export function setCacheScope(login: string | null): void {
	scope = login ?? 'anon';
}

function storageKey(key: string): string {
	return `${PREFIX}${scope}:${key}`;
}

interface Entry<T> {
	/** written-at timestamp (ms) */
	t: number;
	data: T;
}

export function readCache<T>(key: string): T | null {
	if (!forumConfig.cache.enabled) return null;
	const raw = localStorage.getItem(storageKey(key));
	if (raw === null) return null;
	try {
		const entry = JSON.parse(raw) as Entry<T>;
		if (typeof entry.t !== 'number' || Date.now() - entry.t > forumConfig.cache.ttlSeconds * 1000) {
			localStorage.removeItem(storageKey(key));
			return null;
		}
		return entry.data;
	} catch {
		// corrupt entry — drop it
		localStorage.removeItem(storageKey(key));
		return null;
	}
}

export function writeCache<T>(key: string, data: T): void {
	if (!forumConfig.cache.enabled) return;
	const payload = JSON.stringify({ t: Date.now(), data } satisfies Entry<T>);
	try {
		localStorage.setItem(storageKey(key), payload);
	} catch {
		// quota exceeded — evict the oldest half and retry once
		prune();
		try {
			localStorage.setItem(storageKey(key), payload);
		} catch {
			// still full: run network-only, the app works fine without cache
		}
	}
}

/** Remove the oldest half of all cache entries (any scope/version). */
function prune(): void {
	const entries: [string, number][] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i)!;
		if (!key.startsWith(BASE)) continue;
		let t = 0;
		try {
			t = (JSON.parse(localStorage.getItem(key)!) as Entry<unknown>).t ?? 0;
		} catch {
			// unreadable — treat as oldest
		}
		entries.push([key, t]);
	}
	entries.sort((a, b) => a[1] - b[1]);
	for (const [key] of entries.slice(0, Math.max(1, Math.ceil(entries.length / 2)))) {
		localStorage.removeItem(key);
	}
}

/** Drop every entry for the current user whose key starts with `prefix`. */
export function invalidateCache(prefix: string): void {
	const match = storageKey(prefix);
	for (const key of Object.keys(localStorage)) {
		if (key.startsWith(match)) localStorage.removeItem(key);
	}
}

/** Drop every cache entry for every user and version (used on sign-out). */
export function clearCache(): void {
	for (const key of Object.keys(localStorage)) {
		if (key.startsWith(BASE)) localStorage.removeItem(key);
	}
}

/**
 * Stale-while-revalidate: `apply` is called with the cached value immediately
 * (if any), then again with the fresh network result. A failed revalidation is
 * swallowed when cached data was already shown (degrade to stale) and rethrown
 * when there was nothing to show.
 */
export async function swr<T>(
	key: string,
	fetcher: () => Promise<T>,
	apply: (data: T, meta: { fromCache: boolean }) => void
): Promise<void> {
	const cached = readCache<T>(key);
	if (cached !== null) apply(cached, { fromCache: true });
	try {
		const fresh = await fetcher();
		writeCache(key, fresh);
		apply(fresh, { fromCache: false });
	} catch (error) {
		if (cached === null) throw error;
		// stale data is already on screen; keep it rather than erroring the page
	}
}
