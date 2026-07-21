import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
	computeLedger,
	emptyLedger,
	meetsRequirement,
	repOf,
	requiredRep,
	type RepActivity,
	type RepConfig
} from '../src/lib/rep/engine';

const cfg = (over: Partial<RepConfig> = {}): RepConfig => ({
	enabled: true,
	gains: { post: 5, comment: 2, answerAccepted: 15 },
	dailyCaps: { post: 25, comment: 10 },
	topics: { showcase: 50 },
	onViolation: 'move',
	fallbackTopic: 'general',
	exemptMaintainers: true,
	dataBranch: 'rep-data',
	...over
});

const act = (
	login: string,
	action: RepActivity['action'],
	createdAt: string,
	discussionId = 'D1'
): RepActivity => ({ login, action, createdAt, discussionId });

describe('emptyLedger', () => {
	it('creates a versioned ledger with no users', () => {
		expect(emptyLedger('2026-01-01T00:00:00Z')).toEqual({
			version: 1,
			updatedAt: '2026-01-01T00:00:00Z',
			users: {}
		});
	});

	it('defaults updatedAt to the epoch', () => {
		expect(emptyLedger().updatedAt).toBe(new Date(0).toISOString());
	});
});

describe('computeLedger', () => {
	it('sums gains per action type', () => {
		const ledger = computeLedger(
			[
				act('alice', 'post', '2026-01-01T10:00:00Z'),
				act('alice', 'comment', '2026-01-01T11:00:00Z'),
				act('alice', 'answerAccepted', '2026-01-01T12:00:00Z'),
				act('bob', 'comment', '2026-01-01T13:00:00Z')
			],
			cfg(),
			'2026-01-02T00:00:00Z'
		);
		expect(ledger.users).toEqual({ alice: 22, bob: 2 });
		expect(ledger.updatedAt).toBe('2026-01-02T00:00:00Z');
	});

	it('defaults updatedAt to now', () => {
		expect(Date.parse(computeLedger([], cfg()).updatedAt)).not.toBeNaN();
	});

	it('keys users by lowercased login', () => {
		const ledger = computeLedger(
			[act('Alice', 'post', '2026-01-01T10:00:00Z'), act('ALICE', 'post', '2026-01-01T11:00:00Z')],
			cfg()
		);
		expect(ledger.users).toEqual({ alice: 10 });
	});

	it('caps per-day gains per action type, resetting on a new UTC day', () => {
		// comment gain 2, daily cap 10 → 5 comments/day count, the rest earn 0
		const day1 = Array.from({ length: 8 }, (_, i) =>
			act('alice', 'comment', `2026-01-01T0${i}:00:00Z`)
		);
		const day2 = [act('alice', 'comment', '2026-01-02T00:00:00Z')];
		const ledger = computeLedger([...day1, ...day2], cfg());
		expect(ledger.users.alice).toBe(10 + 2);
	});

	it('caps partially when a gain straddles the cap boundary', () => {
		// post gain 5, cap 12 → 5 + 5 + 2 (partial) + 0
		const posts = Array.from({ length: 4 }, (_, i) =>
			act('alice', 'post', `2026-01-01T0${i}:00:00Z`)
		);
		const ledger = computeLedger(posts, cfg({ dailyCaps: { post: 12, comment: 10 } }));
		expect(ledger.users.alice).toBe(12);
	});

	it('never caps accepted answers', () => {
		const answers = Array.from({ length: 10 }, (_, i) =>
			act('alice', 'answerAccepted', `2026-01-01T0${i}:00:00Z`)
		);
		expect(computeLedger(answers, cfg()).users.alice).toBe(150);
	});

	it('treats a zero cap as uncapped', () => {
		const posts = Array.from({ length: 9 }, (_, i) =>
			act('alice', 'post', `2026-01-01T0${i}:00:00Z`)
		);
		expect(computeLedger(posts, cfg({ dailyCaps: { post: 0, comment: 10 } })).users.alice).toBe(45);
	});

	it('is independent of input ordering', () => {
		const activity = [
			act('alice', 'comment', '2026-01-01T06:00:00Z'),
			act('alice', 'comment', '2026-01-01T01:00:00Z'),
			act('alice', 'comment', '2026-01-01T03:00:00Z')
		];
		const shuffled = [activity[2], activity[0], activity[1]];
		expect(computeLedger(activity, cfg()).users).toEqual(computeLedger(shuffled, cfg()).users);
	});
});

describe('repOf', () => {
	it('reads rep case-insensitively and defaults to 0', () => {
		const ledger = computeLedger([act('Alice', 'post', '2026-01-01T00:00:00Z')], cfg());
		expect(repOf(ledger, 'ALICE')).toBe(5);
		expect(repOf(ledger, 'nobody')).toBe(0);
		expect(repOf(ledger, null)).toBe(0);
		expect(repOf(ledger, undefined)).toBe(0);
		expect(repOf(null, 'alice')).toBe(0);
	});
});

describe('requiredRep', () => {
	it('reads the topic threshold, 0 for ungated topics', () => {
		expect(requiredRep(cfg(), 'showcase')).toBe(50);
		expect(requiredRep(cfg(), 'general')).toBe(0);
	});

	it('is always 0 when the feature is disabled', () => {
		expect(requiredRep(cfg({ enabled: false }), 'showcase')).toBe(0);
	});
});

describe('meetsRequirement', () => {
	it('compares rep against the threshold', () => {
		expect(meetsRequirement(cfg(), 'showcase', 50, false)).toBe(true);
		expect(meetsRequirement(cfg(), 'showcase', 49, false)).toBe(false);
		expect(meetsRequirement(cfg(), 'general', 0, false)).toBe(true);
	});

	it('always passes exempt users', () => {
		expect(meetsRequirement(cfg(), 'showcase', 0, true)).toBe(true);
	});
});

describe('fetchLedger', () => {
	const { mockConfig } = vi.hoisted(() => ({
		mockConfig: {
			repo: { owner: 'o', name: 'r' },
			rep: { enabled: true, dataBranch: 'data' }
		}
	}));
	vi.mock('$lib/config', () => ({ forumConfig: mockConfig }));

	let fetchLedger: typeof import('$lib/rep/ledger')['fetchLedger'];
	let fetchMock: Mock;

	beforeEach(async () => {
		vi.resetModules();
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		({ fetchLedger } = await import('$lib/rep/ledger'));
	});

	it('fetches the rep index from the data branch raw URL', async () => {
		const ledger = { version: 1, updatedAt: 'T', users: { alice: 5 } };
		fetchMock.mockResolvedValue({ ok: true, json: async () => ledger });
		expect(await fetchLedger()).toEqual(ledger);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://raw.githubusercontent.com/o/r/data/profiles/index.json',
			{ cache: 'no-cache' }
		);
	});

	it('returns null when the ledger does not exist yet', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 404 });
		expect(await fetchLedger()).toBeNull();
	});

	it('returns null on network failure', async () => {
		fetchMock.mockRejectedValue(new TypeError('offline'));
		expect(await fetchLedger()).toBeNull();
	});
});
