import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const { mockConfig, mockAuth } = vi.hoisted(() => {
	const mockAuth = { token: 'tok' as string | null, signOut: vi.fn() };
	const mockConfig = {
		repo: { owner: 'o', name: 'r' },
		content: {
			pageSize: 25,
			sort: 'CREATED_AT',
			articles: { enabled: true, marker: '<!-- gf:article -->' },
			topics: { include: [] as string[], exclude: [] as string[], restricted: [] as string[] }
		}
	};
	return { mockConfig, mockAuth };
});

vi.mock('$lib/config', () => ({ forumConfig: mockConfig }));
vi.mock('$lib/github/auth.svelte', () => ({ auth: mockAuth }));

let api: typeof import('$lib/github/api');
let fetchMock: Mock;

const gqlOk = (data: unknown) => ({
	ok: true,
	status: 200,
	json: async () => ({ data })
});

const categoriesData = (nodes: unknown[], viewerPermission: string | null = 'READ') => ({
	repository: { id: 'RID', viewerPermission, discussionCategories: { nodes } }
});

const cat = (slug: string) => ({
	id: `id-${slug}`,
	name: slug,
	slug,
	emojiHTML: '<div>🎉</div>',
	description: null,
	isAnswerable: false
});

beforeEach(async () => {
	vi.resetModules();
	mockAuth.token = 'tok';
	mockAuth.signOut.mockClear();
	mockConfig.content.topics.include = [];
	mockConfig.content.topics.exclude = [];
	mockConfig.content.articles.enabled = true;
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	api = await import('$lib/github/api');
});

describe('article helpers', () => {
	it('detects the marker at the start of a body', () => {
		expect(api.isArticle('<!-- gf:article -->\n\nhi')).toBe(true);
		expect(api.isArticle('hi <!-- gf:article -->')).toBe(false);
	});

	it('never reports articles when the feature is disabled', () => {
		mockConfig.content.articles.enabled = false;
		expect(api.isArticle('<!-- gf:article -->\n\nhi')).toBe(false);
	});

	it('strips the marker only when present', () => {
		expect(api.stripMarker('<!-- gf:article -->\n\nbody')).toBe('body');
		expect(api.stripMarker('plain body')).toBe('plain body');
	});
});

describe('gql error handling (via getCategories)', () => {
	it('rejects when signed out', async () => {
		mockAuth.token = null;
		await expect(api.getCategories()).rejects.toThrow(/Sign in/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('signs out and rejects on a 401', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 401 });
		await expect(api.getCategories()).rejects.toThrow(/no longer valid/);
		expect(mockAuth.signOut).toHaveBeenCalled();
	});

	it('rejects on other HTTP errors', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 502 });
		await expect(api.getCategories()).rejects.toThrow(/502/);
	});

	it('rejects with the first GraphQL error message', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ errors: [{ message: 'Boom' }] })
		});
		await expect(api.getCategories()).rejects.toThrow('Boom');
	});
});

describe('getCategories', () => {
	it('fetches, filters via include/exclude, and caches', async () => {
		mockConfig.content.topics.include = ['a', 'b'];
		mockConfig.content.topics.exclude = ['b'];
		fetchMock.mockResolvedValue(
			gqlOk(categoriesData([cat('a'), cat('b'), cat('c')], 'WRITE'))
		);
		const first = await api.getCategories();
		expect(first.map((c) => c.slug)).toEqual(['a']);
		const second = await api.getCategories();
		expect(second).toBe(first);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('getViewerPermission', () => {
	it('loads categories on demand and reports the permission', async () => {
		fetchMock.mockResolvedValue(gqlOk(categoriesData([cat('a')], 'WRITE')));
		expect(await api.getViewerPermission()).toBe('WRITE');
	});

	it('defaults to READ for anonymous-permission repos', async () => {
		fetchMock.mockResolvedValue(gqlOk(categoriesData([cat('a')], null)));
		expect(await api.getViewerPermission()).toBe('READ');
	});

	it('serves repeat calls from the cache', async () => {
		fetchMock.mockResolvedValue(gqlOk(categoriesData([cat('a')], 'ADMIN')));
		await api.getViewerPermission();
		expect(await api.getViewerPermission()).toBe('ADMIN');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('listDiscussions', () => {
	const page = {
		totalCount: 1,
		pageInfo: { endCursor: 'X', hasNextPage: false },
		nodes: [{ id: 'd1' }]
	};

	it('uses the configured page size by default', async () => {
		fetchMock.mockResolvedValue(gqlOk({ repository: { discussions: page } }));
		const out = await api.listDiscussions({});
		expect(out).toEqual(page);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.variables).toMatchObject({ owner: 'o', repo: 'r', first: 25, after: null, categoryId: null });
		expect(body.query).toContain('CREATED_AT');
	});

	it('passes explicit paging and category options', async () => {
		fetchMock.mockResolvedValue(gqlOk({ repository: { discussions: page } }));
		await api.listDiscussions({ first: 5, after: 'CUR', categoryId: 'CID' });
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.variables).toMatchObject({ first: 5, after: 'CUR', categoryId: 'CID' });
	});
});

describe('getDiscussion', () => {
	it('returns the discussion', async () => {
		fetchMock.mockResolvedValue(gqlOk({ repository: { discussion: { id: 'D', number: 7 } } }));
		expect(await api.getDiscussion(7)).toEqual({ id: 'D', number: 7 });
	});

	it('throws when it does not exist', async () => {
		fetchMock.mockResolvedValue(gqlOk({ repository: { discussion: null } }));
		await expect(api.getDiscussion(999)).rejects.toThrow(/not found/i);
	});
});

describe('searchDiscussions', () => {
	it('scopes the query to the configured repo', async () => {
		fetchMock.mockResolvedValue(gqlOk({ search: { discussionCount: 0, nodes: [] } }));
		const out = await api.searchDiscussions('hello');
		expect(out.discussionCount).toBe(0);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.variables.q).toBe('repo:o/r hello');
	});
});

describe('createDiscussion', () => {
	const setup = () => {
		fetchMock
			.mockResolvedValueOnce(gqlOk(categoriesData([cat('a')])))
			.mockResolvedValueOnce(gqlOk({ createDiscussion: { discussion: { number: 42 } } }));
	};

	it('resolves the repo id, then creates a plain post', async () => {
		setup();
		const number = await api.createDiscussion({ categoryId: 'C', title: 'T', body: 'B' });
		expect(number).toBe(42);
		const body = JSON.parse(fetchMock.mock.calls[1][1].body);
		expect(body.variables.input).toEqual({ repositoryId: 'RID', categoryId: 'C', title: 'T', body: 'B' });
	});

	it('prepends the article marker for articles', async () => {
		setup();
		await api.createDiscussion({ categoryId: 'C', title: 'T', body: 'B', article: true });
		const body = JSON.parse(fetchMock.mock.calls[1][1].body);
		expect(body.variables.input.body).toBe('<!-- gf:article -->\n\nB');
	});

	it('reuses the cached repo id on later posts', async () => {
		setup();
		await api.createDiscussion({ categoryId: 'C', title: 'T', body: 'B' });
		fetchMock.mockResolvedValueOnce(
			gqlOk({ createDiscussion: { discussion: { number: 43 } } })
		);
		expect(await api.createDiscussion({ categoryId: 'C', title: 'T2', body: 'B2' })).toBe(43);
		// one categories lookup + two mutations
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});

describe('addComment', () => {
	it('sends a top-level comment', async () => {
		fetchMock.mockResolvedValue(gqlOk({ addDiscussionComment: { comment: { id: 'c' } } }));
		await api.addComment('DID', 'hello');
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.variables.input).toEqual({ discussionId: 'DID', body: 'hello' });
	});

	it('sends a threaded reply', async () => {
		fetchMock.mockResolvedValue(gqlOk({ addDiscussionComment: { comment: { id: 'c' } } }));
		await api.addComment('DID', 'hello', 'PARENT');
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.variables.input).toEqual({ discussionId: 'DID', body: 'hello', replyToId: 'PARENT' });
	});
});

describe('reactions and upvotes', () => {
	it.each([
		[true, 'addReaction'],
		[false, 'removeReaction']
	])('toggleReaction(on=%s) calls %s', async (on, mutation) => {
		fetchMock.mockResolvedValue(gqlOk({ [mutation]: {} }));
		await api.toggleReaction('SID', 'HEART', on as boolean);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.query).toContain(mutation);
		expect(body.variables.input).toEqual({ subjectId: 'SID', content: 'HEART' });
	});

	it.each([
		[true, 'addUpvote'],
		[false, 'removeUpvote']
	])('toggleUpvote(on=%s) calls %s', async (on, mutation) => {
		fetchMock.mockResolvedValue(gqlOk({ [mutation]: {} }));
		await api.toggleUpvote('SID', on as boolean);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.query).toContain(mutation);
		expect(body.variables.input).toEqual({ subjectId: 'SID' });
	});
});

describe('renderMarkdown', () => {
	it('POSTs to the markdown API with auth and returns HTML', async () => {
		fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '<p>hi</p>' });
		expect(await api.renderMarkdown('hi')).toBe('<p>hi</p>');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.github.com/markdown');
		expect(init.headers.Authorization).toBe('Bearer tok');
		expect(JSON.parse(init.body)).toMatchObject({ text: 'hi', mode: 'gfm', context: 'o/r' });
	});

	it('omits the auth header when signed out', async () => {
		mockAuth.token = null;
		fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'x' });
		await api.renderMarkdown('hi');
		expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
	});

	it('throws when the request fails', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 403 });
		await expect(api.renderMarkdown('hi')).rejects.toThrow(/preview failed/i);
	});
});
