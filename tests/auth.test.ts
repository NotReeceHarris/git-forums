import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const { mockConfig } = vi.hoisted(() => ({
	mockConfig: {
		repo: { owner: 'o', name: 'r' },
		auth: { allowToken: true, oauth: { clientId: '', proxyUrl: '' } }
	}
}));

vi.mock('$lib/config', () => ({ forumConfig: mockConfig }));

let auth: (typeof import('$lib/github/auth.svelte'))['auth'];
let fetchMock: Mock;

const viewer = { login: 'alice', name: 'Alice', avatarUrl: 'http://a', url: 'http://u' };
const viewerOk = {
	ok: true,
	status: 200,
	json: async () => ({ data: { viewer } })
};

beforeEach(async () => {
	vi.resetModules();
	localStorage.clear();
	sessionStorage.clear();
	mockConfig.auth.oauth = { clientId: '', proxyUrl: '' };
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	({ auth } = await import('$lib/github/auth.svelte'));
});

describe('init', () => {
	it('finishes signed out with no stored token', async () => {
		await auth.init();
		expect(auth.loading).toBe(false);
		expect(auth.token).toBeNull();
		expect(auth.signedIn).toBe(false);
	});

	it('restores a valid stored token', async () => {
		localStorage.setItem('gf:token', 'stored');
		fetchMock.mockResolvedValue(viewerOk);
		await auth.init();
		expect(auth.token).toBe('stored');
		expect(auth.viewer).toEqual(viewer);
		expect(auth.signedIn).toBe(true);
	});

	it('drops a revoked stored token silently', async () => {
		localStorage.setItem('gf:token', 'revoked');
		fetchMock.mockResolvedValue({ ok: false, status: 401 });
		await auth.init();
		expect(auth.token).toBeNull();
		expect(localStorage.getItem('gf:token')).toBeNull();
		expect(auth.loading).toBe(false);
	});
});

describe('signInWithToken', () => {
	it('trims, validates and persists the token', async () => {
		fetchMock.mockResolvedValue(viewerOk);
		await auth.signInWithToken('  tok  ');
		expect(auth.token).toBe('tok');
		expect(auth.viewer).toEqual(viewer);
		expect(localStorage.getItem('gf:token')).toBe('tok');
		const init = fetchMock.mock.calls[0][1];
		expect(init.headers.Authorization).toBe('Bearer tok');
	});

	it('rejects on GraphQL errors without persisting', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ errors: [{ message: 'Bad credentials' }] })
		});
		await expect(auth.signInWithToken('bad')).rejects.toThrow('Bad credentials');
		expect(localStorage.getItem('gf:token')).toBeNull();
	});
});

describe('oauth', () => {
	it('reports availability only when fully configured', () => {
		expect(auth.oauthAvailable).toBe(false);
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		expect(auth.oauthAvailable).toBe(true);
	});

	it('beginOAuth stores a state nonce', () => {
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		auth.beginOAuth('http://site/auth/callback');
		expect(sessionStorage.getItem('gf:oauth-state')).toBeTruthy();
	});

	it('completeOAuth rejects on a state mismatch', async () => {
		await expect(auth.completeOAuth('code', 'wrong')).rejects.toThrow(/state mismatch/i);
	});

	it('completeOAuth rejects when the proxy fails', async () => {
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		sessionStorage.setItem('gf:oauth-state', 'S');
		fetchMock.mockResolvedValue({ ok: false, status: 500 });
		await expect(auth.completeOAuth('code', 'S')).rejects.toThrow(/exchange failed/i);
	});

	it('completeOAuth rejects when no token is returned', async () => {
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		sessionStorage.setItem('gf:oauth-state', 'S');
		fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
		await expect(auth.completeOAuth('code', 'S')).rejects.toThrow(/no token/i);
	});

	it('completeOAuth exchanges the code and signs in', async () => {
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		sessionStorage.setItem('gf:oauth-state', 'S');
		fetchMock
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'oat' }) })
			.mockResolvedValueOnce(viewerOk);
		await auth.completeOAuth('code', 'S');
		expect(auth.token).toBe('oat');
		expect(auth.viewer).toEqual(viewer);
		// proxy call carried the code
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: 'code' });
		// nonce is single-use
		expect(sessionStorage.getItem('gf:oauth-state')).toBeNull();
	});
});

describe('signOut', () => {
	it('clears all auth state', async () => {
		fetchMock.mockResolvedValue(viewerOk);
		await auth.signInWithToken('tok');
		auth.signOut();
		expect(auth.token).toBeNull();
		expect(auth.viewer).toBeNull();
		expect(localStorage.getItem('gf:token')).toBeNull();
	});
});
