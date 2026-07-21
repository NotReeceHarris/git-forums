import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const { mockConfig, mockAuth, invalidateCache } = vi.hoisted(() => {
	const invalidateCache = vi.fn();
	const mockAuth = { token: 'tok' as string | null, signOut: vi.fn() };
	const mockConfig = {
		repo: { owner: 'o', name: 'r' },
		content: {
			pageSize: 25,
			sort: 'CREATED_AT',
			listExcerpts: true,
			articles: { enabled: true, marker: '<!-- dk:article -->' },
			topics: { include: [] as string[], exclude: [] as string[], restricted: [] as string[] }
		}
	};
	return { mockConfig, mockAuth, invalidateCache };
});

vi.mock('$lib/config', () => ({ forumConfig: mockConfig }));
vi.mock('$lib/github/auth.svelte', () => ({ auth: mockAuth }));
vi.mock('$lib/cache', () => ({ invalidateCache }));

let api: typeof import('$lib/github/api');
let fetchMock: Mock;

const gqlOk = (data: unknown) => ({
	ok: true,
	status: 200,
	json: async () => ({ data })
});

const feed = {
	totalCount: 1,
	pageInfo: { endCursor: 'X', hasNextPage: false },
	nodes: [{ id: 'd1' }]
};

// the combined bootstrap query: categories + permission + home feed + pins
const categoriesData = (
	nodes: unknown[],
	viewerPermission: string | null = 'READ',
	pinned: unknown[] = []
) => ({
	repository: {
		id: 'RID',
		viewerPermission,
		discussionCategories: { nodes },
		discussions: feed,
		pinnedDiscussions: { nodes: pinned.map((discussion) => ({ discussion })) }
	}
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
	mockConfig.content.listExcerpts = true;
	invalidateCache.mockClear();
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	api = await import('$lib/github/api');
});

describe('article helpers', () => {
	it('detects the marker at the start of a body', () => {
		expect(api.isArticle('<!-- dk:article -->\n\nhi')).toBe(true);
		expect(api.isArticle('hi <!-- dk:article -->')).toBe(false);
	});

	it('never reports articles when the feature is disabled', () => {
		mockConfig.content.articles.enabled = false;
		expect(api.isArticle('<!-- dk:article -->\n\nhi')).toBe(false);
	});

	it('strips the marker only when present', () => {
		expect(api.stripMarker('<!-- dk:article -->\n\nbody')).toBe('body');
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

describe('getOverview', () => {
	it('fetches everything in one round-trip and includes the home feed', async () => {
		fetchMock.mockResolvedValue(gqlOk(categoriesData([cat('a')], 'WRITE')));
		const overview = await api.getOverview();
		expect(overview.discussions).toEqual(feed);
		expect(overview.viewerPermission).toBe('WRITE');
		expect(overview.pinned).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.query).toContain('discussionCategories');
		expect(body.query).toContain('discussions(first: $first');
		expect(body.query).toContain('pinnedDiscussions');
	});

	it('returns pins but hides those in excluded topics', async () => {
		mockConfig.content.topics.exclude = ['hidden'];
		const pin = (slug: string, id: string) => ({ id, category: { slug } });
		fetchMock.mockResolvedValue(
			gqlOk(categoriesData([cat('a')], 'READ', [pin('a', 'p1'), pin('hidden', 'p2')]))
		);
		const overview = await api.getOverview();
		expect(overview.pinned.map((p) => p.id)).toEqual(['p1']);
	});

	it('deduplicates concurrent callers but honours fresh', async () => {
		fetchMock.mockResolvedValue(gqlOk(categoriesData([cat('a')])));
		await Promise.all([api.getOverview(), api.getOverview()]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await api.getOverview({ fresh: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not cache failures', async () => {
		fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
		await expect(api.getOverview()).rejects.toThrow(/500/);
		fetchMock.mockResolvedValue(gqlOk(categoriesData([cat('a')])));
		await expect(api.getOverview()).resolves.toBeTruthy();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe('list body field trimming', () => {
	const load = async () => {
		vi.resetModules();
		return await import('$lib/github/api');
	};

	it('keeps body when only articles are enabled', async () => {
		mockConfig.content.listExcerpts = false;
		mockConfig.content.articles.enabled = true;
		const trimmed = await load();
		fetchMock.mockResolvedValue(gqlOk({ repository: { discussions: feed } }));
		await trimmed.listDiscussions({});
		expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).toMatch(/\bbody\b/);
	});

	it('omits body when excerpts and articles are both disabled', async () => {
		mockConfig.content.listExcerpts = false;
		mockConfig.content.articles.enabled = false;
		const trimmed = await load();
		fetchMock.mockResolvedValue(gqlOk({ repository: { discussions: feed } }));
		await trimmed.listDiscussions({});
		expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).not.toMatch(/\bbody\b/);
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
		expect(invalidateCache).toHaveBeenCalledWith('discussions');
	});

	it('prepends the article marker for articles', async () => {
		setup();
		await api.createDiscussion({ categoryId: 'C', title: 'T', body: 'B', article: true });
		const body = JSON.parse(fetchMock.mock.calls[1][1].body);
		expect(body.variables.input.body).toBe('<!-- dk:article -->\n\nB');
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
		expect(invalidateCache).toHaveBeenCalledWith('discussion');
	});

	it('sends a threaded reply', async () => {
		fetchMock.mockResolvedValue(gqlOk({ addDiscussionComment: { comment: { id: 'c' } } }));
		await api.addComment('DID', 'hello', 'PARENT');
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.variables.input).toEqual({ discussionId: 'DID', body: 'hello', replyToId: 'PARENT' });
	});
});

describe('updateDiscussion', () => {
	it('sends the changed fields and returns the updated discussion', async () => {
		const updated = { title: 'New', body: 'B2', bodyHTML: '<p>B2</p>', category: cat('a') };
		fetchMock.mockResolvedValue(gqlOk({ updateDiscussion: { discussion: updated } }));
		const result = await api.updateDiscussion('DID', {
			title: 'New',
			body: 'B2',
			categoryId: 'CID'
		});
		expect(result).toEqual(updated);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.query).toContain('updateDiscussion');
		expect(body.variables.input).toEqual({
			discussionId: 'DID',
			title: 'New',
			body: 'B2',
			categoryId: 'CID'
		});
		expect(invalidateCache).toHaveBeenCalledWith('discussion');
	});
});

describe('deleteDiscussion', () => {
	it('deletes by node id and invalidates caches', async () => {
		fetchMock.mockResolvedValue(gqlOk({ deleteDiscussion: { clientMutationId: null } }));
		await api.deleteDiscussion('DID');
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.query).toContain('deleteDiscussion');
		expect(body.variables.input).toEqual({ id: 'DID' });
		expect(invalidateCache).toHaveBeenCalledWith('discussion');
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
		expect(invalidateCache).toHaveBeenCalledWith('discussion');
	});
});

describe('user profiles', () => {
	const gqlWithErrors = (data: unknown, errors: unknown[]) => ({
		ok: true,
		status: 200,
		json: async () => ({ data, errors })
	});

	const ownPost = (id: string, login = 'Alice') => ({
		id,
		author: { login },
		repository: { nameWithOwner: 'o/r' }
	});

	const ownComment = (id: string, login = 'Alice', repo = 'o/r') => ({
		id,
		bodyText: 'hi',
		createdAt: '2026-01-01T00:00:00Z',
		author: login ? { login } : null,
		discussion: { number: 1, title: 'T', repository: { nameWithOwner: repo } }
	});

	const profileUser = (over: Record<string, unknown> = {}) => ({
		login: 'alice',
		name: 'Alice',
		avatarUrl: 'a.png',
		url: 'https://github.com/alice',
		bio: 'hey',
		createdAt: '2020-01-01T00:00:00Z',
		repository: { object: { text: '# readme' } },
		repositoryDiscussions: {
			totalCount: 2,
			pageInfo: { endCursor: 'C', hasNextPage: false },
			nodes: [ownPost('d1'), ownPost('d2')]
		},
		repositoryDiscussionComments: {
			totalCount: 2,
			nodes: [ownComment('c1'), ownComment('c2')]
		},
		...over
	});

	// every profile call resolves the repo id first (one overview round-trip)
	const setup = (profileResponse: unknown) => {
		fetchMock.mockResolvedValueOnce(gqlOk(categoriesData([cat('a')])));
		fetchMock.mockResolvedValueOnce(profileResponse as never);
	};

	describe('getUserProfile', () => {
		it('returns identity, readme, posts, and comments (case-insensitive author match)', async () => {
			setup(gqlOk({ user: profileUser() }));
			const profile = await api.getUserProfile('alice');
			expect(profile).toMatchObject({
				login: 'alice',
				name: 'Alice',
				readme: '# readme',
				discussions: { totalCount: 2 },
				comments: { totalCount: 2 }
			});
			expect(profile.discussions.nodes.map((n) => n.id)).toEqual(['d1', 'd2']);
			expect(profile.comments.nodes.map((n) => n.id)).toEqual(['c1', 'c2']);
			const body = JSON.parse(fetchMock.mock.calls[1][1].body);
			expect(body.variables).toMatchObject({ login: 'alice', repositoryId: 'RID', first: 25 });
		});

		it('drops posts and comments leaked from other authors or repos, degrading counts', async () => {
			setup(
				gqlOk({
					user: profileUser({
						repositoryDiscussions: {
							totalCount: 9,
							pageInfo: { endCursor: 'C', hasNextPage: false },
							nodes: [ownPost('d1'), ownPost('leak-author', 'mallory')]
						},
						repositoryDiscussionComments: {
							totalCount: 9,
							nodes: [
								ownComment('c1'),
								ownComment('leak-author', 'mallory'),
								ownComment('leak-repo', 'Alice', 'other/repo'),
								ownComment('leak-ghost', '')
							]
						}
					})
				})
			);
			const profile = await api.getUserProfile('alice');
			expect(profile.discussions.totalCount).toBe(1);
			expect(profile.discussions.nodes.map((n) => n.id)).toEqual(['d1']);
			expect(profile.comments.totalCount).toBe(1);
			expect(profile.comments.nodes.map((n) => n.id)).toEqual(['c1']);
		});

		it('returns a null readme when the profile repo is missing (tolerated NOT_FOUND)', async () => {
			setup(
				gqlWithErrors({ user: profileUser({ repository: null }) }, [
					{ type: 'NOT_FOUND', message: "Could not resolve to a Repository with the name 'alice/alice'." }
				])
			);
			const profile = await api.getUserProfile('alice');
			expect(profile.readme).toBeNull();
		});

		it('returns a null readme when the repo exists without a README', async () => {
			setup(gqlOk({ user: profileUser({ repository: { object: null } }) }));
			expect((await api.getUserProfile('alice')).readme).toBeNull();
		});

		it('still rejects on non-NOT_FOUND errors', async () => {
			setup(gqlWithErrors({ user: profileUser() }, [{ type: 'FORBIDDEN', message: 'nope' }]));
			await expect(api.getUserProfile('alice')).rejects.toThrow('nope');
		});

		it('rejects when NOT_FOUND comes without data', async () => {
			setup(gqlWithErrors(null, [{ type: 'NOT_FOUND', message: 'gone' }]));
			await expect(api.getUserProfile('alice')).rejects.toThrow('gone');
		});

		it('throws a 404 when the user does not exist', async () => {
			setup(
				gqlWithErrors({ user: null }, [
					{ type: 'NOT_FOUND', message: "Could not resolve to a User with the login of 'nobody'." }
				])
			);
			await expect(api.getUserProfile('nobody')).rejects.toThrow(/User not found/);
		});
	});

	describe('listUserDiscussions', () => {
		it('pages with the cursor and filters leaked nodes', async () => {
			setup(
				gqlOk({
					user: {
						repositoryDiscussions: {
							totalCount: 9,
							pageInfo: { endCursor: 'C2', hasNextPage: true },
							nodes: [ownPost('d3'), ownPost('leak', 'mallory')]
						}
					}
				})
			);
			const out = await api.listUserDiscussions('alice', 'CUR');
			expect(out.pageInfo).toEqual({ endCursor: 'C2', hasNextPage: true });
			expect(out.totalCount).toBe(1);
			expect(out.nodes.map((n) => n.id)).toEqual(['d3']);
			const body = JSON.parse(fetchMock.mock.calls[1][1].body);
			expect(body.variables).toMatchObject({ login: 'alice', after: 'CUR', repositoryId: 'RID' });
		});

		it('trusts the server totalCount when nothing was dropped', async () => {
			setup(
				gqlOk({
					user: {
						repositoryDiscussions: {
							totalCount: 7,
							pageInfo: { endCursor: null, hasNextPage: false },
							nodes: [ownPost('d1')]
						}
					}
				})
			);
			expect((await api.listUserDiscussions('alice', null)).totalCount).toBe(7);
		});

		it('throws a 404 when the user does not exist', async () => {
			setup(gqlOk({ user: null }));
			await expect(api.listUserDiscussions('nobody', null)).rejects.toThrow(/User not found/);
		});
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

	it('honours an explicit mode and context (profile READMEs)', async () => {
		fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'x' });
		await api.renderMarkdown('hi', { context: 'alice/alice', mode: 'markdown' });
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
			mode: 'markdown',
			context: 'alice/alice'
		});
	});

	it('throws when the request fails', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 403 });
		await expect(api.renderMarkdown('hi')).rejects.toThrow(/preview failed/i);
	});
});
