import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfig, getOverview } = vi.hoisted(() => ({
	mockConfig: {
		admins: { logins: ['root'], badgeLabel: 'ADMIN' },
		badges: {
			Moderator: ['mod', 'both'],
			Contributor: ['both']
		} as Record<string, string[]>,
		content: {
			topics: { include: [] as string[], exclude: [] as string[], restricted: ['announcements'] }
		}
	},
	getOverview: vi.fn()
}));

vi.mock('$lib/config', () => ({ forumConfig: mockConfig }));
vi.mock('$lib/github/api', () => ({ getOverview }));
// pass-through swr: run the fetcher and apply the fresh result
vi.mock('$lib/cache', () => ({
	swr: async <T,>(
		_key: string,
		fetcher: () => Promise<T>,
		apply: (data: T, meta: { fromCache: boolean }) => void
	) => apply(await fetcher(), { fromCache: false })
}));

let mod: typeof import('$lib/ui.svelte');

const cats = [
	{ id: '1', slug: 'general' },
	{ id: '2', slug: 'announcements' }
];
const feed = { totalCount: 1, pageInfo: { endCursor: null, hasNextPage: false }, nodes: [] };

beforeEach(async () => {
	vi.resetModules();
	getOverview.mockReset().mockResolvedValue({
		categories: cats,
		viewerPermission: 'READ',
		discussions: feed,
		pinned: [{ id: 'p1' }]
	});
	localStorage.clear();
	document.documentElement.className = '';
	mod = await import('$lib/ui.svelte');
});

describe('loadOverview', () => {
	it('populates categories, permission, and the home feed', async () => {
		await mod.loadOverview();
		expect(mod.ui.categories).toEqual(cats);
		expect(mod.ui.viewerPermission).toBe('READ');
		expect(mod.ui.home).toEqual(feed);
		expect(mod.ui.pinned).toEqual([{ id: 'p1' }]);
		expect(mod.ui.categoriesLoaded).toBe(true);
		expect(getOverview).toHaveBeenCalledWith({ fresh: false });
	});

	it('revalidates with a fresh fetch on later calls', async () => {
		await mod.loadOverview();
		await mod.loadOverview();
		expect(getOverview).toHaveBeenLastCalledWith({ fresh: true });
	});
});

describe('isAdmin', () => {
	it('matches configured logins only', () => {
		expect(mod.isAdmin('root')).toBe(true);
		expect(mod.isAdmin('guest')).toBe(false);
		expect(mod.isAdmin(null)).toBe(false);
		expect(mod.isAdmin(undefined)).toBe(false);
	});
});

describe('badgesFor', () => {
	it('collects every badge a user holds', () => {
		expect(mod.badgesFor('mod')).toEqual(['Moderator']);
		expect(mod.badgesFor('both')).toEqual(['Moderator', 'Contributor']);
		expect(mod.badgesFor('nobody')).toEqual([]);
	});
});

describe('permissions', () => {
	it('isMaintainer reflects write access', () => {
		expect(mod.isMaintainer()).toBe(false);
		mod.ui.viewerPermission = 'WRITE';
		expect(mod.isMaintainer()).toBe(true);
		mod.ui.viewerPermission = 'ADMIN';
		expect(mod.isMaintainer()).toBe(true);
	});

	it('canPostIn gates restricted topics by maintainership', () => {
		expect(mod.canPostIn({ slug: 'general' })).toBe(true);
		expect(mod.canPostIn({ slug: 'announcements' })).toBe(false);
		mod.ui.viewerPermission = 'MAINTAIN';
		expect(mod.canPostIn({ slug: 'announcements' })).toBe(true);
	});

	it('postableCategories filters restricted topics for readers', async () => {
		await mod.loadOverview();
		expect(mod.postableCategories().map((c) => c.slug)).toEqual(['general']);
		mod.ui.viewerPermission = 'WRITE';
		expect(mod.postableCategories().map((c) => c.slug)).toEqual(['general', 'announcements']);
	});
});

describe('toggleTheme', () => {
	it('toggles the dark class and persists the choice', () => {
		mod.toggleTheme();
		expect(document.documentElement.classList.contains('dark')).toBe(true);
		expect(localStorage.getItem('dk:theme')).toBe('dark');
		mod.toggleTheme();
		expect(document.documentElement.classList.contains('dark')).toBe(false);
		expect(localStorage.getItem('dk:theme')).toBe('light');
	});
});
