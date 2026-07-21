import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfig, getOverview, mockAuth, fetchLedger } = vi.hoisted(() => ({
	mockConfig: {
		admins: { logins: ['root'], badgeLabel: 'ADMIN' },
		badges: {
			Moderator: ['mod', 'both'],
			Contributor: ['both']
		} as Record<string, string[]>,
		content: {
			topics: { include: [] as string[], exclude: [] as string[], restricted: ['announcements'] }
		},
		rep: {
			enabled: false,
			gains: { post: 5, comment: 2, answerAccepted: 15 },
			dailyCaps: { post: 25, comment: 10 },
			topics: {} as Record<string, number>,
			onViolation: 'move',
			fallbackTopic: 'general',
			exemptMaintainers: true,
			dataBranch: 'rep-data'
		}
	},
	getOverview: vi.fn(),
	mockAuth: { viewer: null as { login: string } | null },
	fetchLedger: vi.fn()
}));

vi.mock('$lib/config', () => ({ forumConfig: mockConfig }));
vi.mock('$lib/github/api', () => ({ getOverview }));
vi.mock('$lib/github/auth.svelte', () => ({ auth: mockAuth }));
vi.mock('$lib/rep/ledger', () => ({ fetchLedger }));
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
	mockConfig.rep.enabled = false;
	mockConfig.rep.topics = {};
	mockConfig.rep.exemptMaintainers = true;
	mockAuth.viewer = { login: 'guest' };
	fetchLedger.mockReset().mockResolvedValue(null);
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

describe('reputation', () => {
	const ledger = { version: 1 as const, updatedAt: 'T', users: { guest: 12, root: 0 } };

	const enableRep = () => {
		mockConfig.rep.enabled = true;
		mockConfig.rep.topics = { showcase: 50 };
	};

	describe('loadRep', () => {
		it('is a no-op when the feature is disabled', async () => {
			await mod.loadRep();
			expect(fetchLedger).not.toHaveBeenCalled();
			expect(mod.ui.repLoaded).toBe(false);
		});

		it('loads the ledger once', async () => {
			enableRep();
			fetchLedger.mockResolvedValue(ledger);
			await mod.loadRep();
			await mod.loadRep();
			expect(fetchLedger).toHaveBeenCalledTimes(1);
			expect(mod.ui.repLedger).toEqual(ledger);
			expect(mod.ui.repLoaded).toBe(true);
		});
	});

	describe('repFor', () => {
		it('returns null when disabled, 0 before the ledger loads', async () => {
			expect(mod.repFor('guest')).toBeNull();
			enableRep();
			expect(mod.repFor('guest')).toBe(0);
		});

		it('reads rep from the loaded ledger', async () => {
			enableRep();
			fetchLedger.mockResolvedValue(ledger);
			await mod.loadRep();
			expect(mod.repFor('guest')).toBe(12);
			expect(mod.repFor('stranger')).toBe(0);
		});
	});

	describe('repRequirement', () => {
		it('mirrors the configured thresholds when enabled', () => {
			expect(mod.repRequirement('showcase')).toBe(0);
			enableRep();
			expect(mod.repRequirement('showcase')).toBe(50);
			expect(mod.repRequirement('general')).toBe(0);
		});
	});

	describe('canPostIn with rep gates', () => {
		beforeEach(() => enableRep());

		it('fails open while the ledger is unavailable', () => {
			expect(mod.canPostIn({ slug: 'showcase' })).toBe(true);
		});

		it('gates by the viewer rep once the ledger is loaded', async () => {
			fetchLedger.mockResolvedValue(ledger);
			await mod.loadRep();
			expect(mod.canPostIn({ slug: 'showcase' })).toBe(false);
			expect(mod.canPostIn({ slug: 'general' })).toBe(true);
			mod.ui.repLedger = { ...ledger, users: { guest: 50 } };
			expect(mod.canPostIn({ slug: 'showcase' })).toBe(true);
		});

		it('exempts maintainers unless configured otherwise', async () => {
			fetchLedger.mockResolvedValue(ledger);
			await mod.loadRep();
			mod.ui.viewerPermission = 'WRITE';
			expect(mod.canPostIn({ slug: 'showcase' })).toBe(true);
			mockConfig.rep.exemptMaintainers = false;
			expect(mod.canPostIn({ slug: 'showcase' })).toBe(false);
		});

		it('exempts config admins', async () => {
			fetchLedger.mockResolvedValue(ledger);
			await mod.loadRep();
			mockAuth.viewer = { login: 'root' };
			expect(mod.canPostIn({ slug: 'showcase' })).toBe(true);
		});

		it('still enforces maintainer-only topics regardless of rep', async () => {
			fetchLedger.mockResolvedValue({ ...ledger, users: { guest: 999 } });
			await mod.loadRep();
			expect(mod.canPostIn({ slug: 'announcements' })).toBe(false);
		});
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
