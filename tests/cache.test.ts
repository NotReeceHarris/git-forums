import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfig } = vi.hoisted(() => ({
	mockConfig: { cache: { enabled: true, ttlSeconds: 3600 } }
}));
vi.mock('$lib/config', () => ({ forumConfig: mockConfig }));

let cache: typeof import('$lib/cache');

beforeEach(async () => {
	vi.resetModules();
	localStorage.clear();
	mockConfig.cache = { enabled: true, ttlSeconds: 3600 };
	cache = await import('$lib/cache');
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('read/write round-trip', () => {
	it('stores and retrieves values', () => {
		cache.writeCache('k', { a: 1 });
		expect(cache.readCache('k')).toEqual({ a: 1 });
	});

	it('returns null for missing keys', () => {
		expect(cache.readCache('missing')).toBeNull();
	});

	it('is a no-op when disabled', () => {
		mockConfig.cache.enabled = false;
		cache.writeCache('k', 1);
		expect(localStorage.length).toBe(0);
		localStorage.setItem('dk:cache:v1:anon:k', JSON.stringify({ t: Date.now(), data: 1 }));
		expect(cache.readCache('k')).toBeNull();
	});

	it('drops corrupt entries', () => {
		localStorage.setItem('dk:cache:v1:anon:bad', 'not json');
		expect(cache.readCache('bad')).toBeNull();
		expect(localStorage.getItem('dk:cache:v1:anon:bad')).toBeNull();
	});

	it('drops entries without a numeric timestamp', () => {
		localStorage.setItem('dk:cache:v1:anon:odd', JSON.stringify({ data: 1 }));
		expect(cache.readCache('odd')).toBeNull();
	});

	it('expires entries past the TTL', () => {
		vi.useFakeTimers();
		cache.writeCache('k', 'v');
		vi.advanceTimersByTime(3601 * 1000);
		expect(cache.readCache('k')).toBeNull();
		expect(localStorage.getItem('dk:cache:v1:anon:k')).toBeNull();
	});
});

describe('user scoping', () => {
	it('isolates entries per user and falls back to anon', () => {
		cache.setCacheScope('alice');
		cache.writeCache('k', 'alice-data');
		cache.setCacheScope('bob');
		expect(cache.readCache('k')).toBeNull();
		cache.setCacheScope('alice');
		expect(cache.readCache('k')).toBe('alice-data');
		cache.setCacheScope(null);
		expect(cache.readCache('k')).toBeNull();
	});
});

describe('quota handling', () => {
	it('prunes the oldest entries and retries the write', () => {
		vi.useFakeTimers();
		cache.writeCache('old', 1);
		vi.advanceTimersByTime(1000);
		cache.writeCache('new', 2);
		localStorage.setItem('dk:cache:v1:anon:corrupt', 'junk'); // treated as oldest
		localStorage.setItem('dk:cache:v1:anon:no-t', JSON.stringify({ data: 1 })); // also oldest
		localStorage.setItem('unrelated', 'kept');

		const original = Storage.prototype.setItem;
		const spy = vi
			.spyOn(Storage.prototype, 'setItem')
			.mockImplementationOnce(() => {
				throw new DOMException('quota', 'QuotaExceededError');
			});
		spy.mockImplementation(original as never);

		cache.writeCache('k', 3);
		expect(cache.readCache('k')).toBe(3);
		// oldest half evicted (the two unreadable zero-timestamp entries)
		expect(localStorage.getItem('dk:cache:v1:anon:corrupt')).toBeNull();
		expect(localStorage.getItem('dk:cache:v1:anon:no-t')).toBeNull();
		expect(cache.readCache('old')).toBe(1);
		expect(cache.readCache('new')).toBe(2);
		expect(localStorage.getItem('unrelated')).toBe('kept');
	});

	it('degrades to network-only when storage stays full', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('quota', 'QuotaExceededError');
		});
		expect(() => cache.writeCache('k', 1)).not.toThrow();
		expect(cache.readCache('k')).toBeNull();
	});
});

describe('invalidateCache', () => {
	it('removes matching prefixes for the current user only', () => {
		cache.writeCache('discussions:all', 1);
		cache.writeCache('discussions:cat:X', 2);
		cache.writeCache('meta', 3);
		cache.setCacheScope('alice');
		cache.writeCache('discussions:all', 4);
		cache.setCacheScope(null);

		cache.invalidateCache('discussions');
		expect(cache.readCache('discussions:all')).toBeNull();
		expect(cache.readCache('discussions:cat:X')).toBeNull();
		expect(cache.readCache('meta')).toBe(3);
		cache.setCacheScope('alice');
		expect(cache.readCache('discussions:all')).toBe(4);
	});
});

describe('clearCache', () => {
	it('wipes every scope and version but nothing else', () => {
		cache.writeCache('k', 1);
		cache.setCacheScope('alice');
		cache.writeCache('k', 2);
		localStorage.setItem('dk:cache:v0:anon:legacy', 'x');
		localStorage.setItem('dk:token', 'keep');

		cache.clearCache();
		expect(Object.keys(localStorage)).toEqual(['dk:token']);
	});
});

describe('swr', () => {
	it('applies cached data first, then the fresh result', async () => {
		cache.writeCache('k', 'stale');
		const apply = vi.fn();
		await cache.swr('k', async () => 'fresh', apply);
		expect(apply.mock.calls).toEqual([
			['stale', { fromCache: true }],
			['fresh', { fromCache: false }]
		]);
		expect(cache.readCache('k')).toBe('fresh');
	});

	it('applies only the fresh result on a cold cache', async () => {
		const apply = vi.fn();
		await cache.swr('k', async () => 'fresh', apply);
		expect(apply.mock.calls).toEqual([['fresh', { fromCache: false }]]);
	});

	it('keeps stale data when revalidation fails', async () => {
		cache.writeCache('k', 'stale');
		const apply = vi.fn();
		await cache.swr(
			'k',
			async () => {
				throw new Error('offline');
			},
			apply
		);
		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply).toHaveBeenCalledWith('stale', { fromCache: true });
	});

	it('rethrows when there is nothing cached to fall back on', async () => {
		await expect(
			cache.swr(
				'k',
				async () => {
					throw new Error('offline');
				},
				vi.fn()
			)
		).rejects.toThrow('offline');
	});
});
