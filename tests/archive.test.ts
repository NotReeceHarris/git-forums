import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const { mockConfig } = vi.hoisted(() => ({
	mockConfig: {
		repo: { owner: 'o', name: 'r' },
		archive: { enabled: true, dataBranch: 'data' }
	}
}));
vi.mock('$lib/config', () => ({ forumConfig: mockConfig }));

let client: typeof import('$lib/archive/client');
let fetchMock: Mock;

const ok = (data: unknown) => ({ ok: true, json: async () => data });

beforeEach(async () => {
	vi.resetModules();
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	client = await import('$lib/archive/client');
});

describe('archive client', () => {
	it('fetches meta.json from the data branch', async () => {
		const meta = { archivedAt: 'T', categories: [], pinned: [] };
		fetchMock.mockResolvedValue(ok(meta));
		expect(await client.fetchArchiveMeta()).toEqual(meta);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://raw.githubusercontent.com/o/r/data/meta.json',
			{ cache: 'no-cache' }
		);
	});

	it('fetches the post index', async () => {
		const index = { archivedAt: 'T', discussions: [{ id: 'd1' }] };
		fetchMock.mockResolvedValue(ok(index));
		expect(await client.fetchArchiveIndex()).toEqual(index);
		expect(fetchMock.mock.calls[0][0]).toContain('/data/posts/index.json');
	});

	it('fetches an archived discussion by number', async () => {
		fetchMock.mockResolvedValue(ok({ number: 42 }));
		expect(await client.fetchArchivedDiscussion(42)).toEqual({ number: 42 });
		expect(fetchMock.mock.calls[0][0]).toContain('/data/posts/42/content.json');
	});

	it('fetches a profile rep file with the login lowercased', async () => {
		const rep = { rep: 12, updatedAt: 'T', breakdown: { post: 1, comment: 2, answerAccepted: 0 } };
		fetchMock.mockResolvedValue(ok(rep));
		expect(await client.fetchProfileRep('Alice')).toEqual(rep);
		expect(fetchMock.mock.calls[0][0]).toContain('/data/profiles/alice/rep.json');
	});

	it('returns null on HTTP errors (not yet archived)', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 404 });
		expect(await client.fetchArchiveMeta()).toBeNull();
	});

	it('returns null on network failure', async () => {
		fetchMock.mockRejectedValue(new TypeError('offline'));
		expect(await client.fetchArchivedDiscussion(1)).toBeNull();
	});
});
