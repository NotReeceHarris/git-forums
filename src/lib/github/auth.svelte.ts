import { clearCache, setCacheScope } from '$lib/cache';
import { forumConfig } from '$lib/config';
import type { Viewer } from './types';

const TOKEN_KEY = 'dk:token';
const STATE_KEY = 'dk:oauth-state';

class Auth {
	token = $state<string | null>(null);
	viewer = $state<Viewer | null>(null);
	/** true while the stored token is being validated on boot */
	loading = $state(true);

	get signedIn() {
		return this.viewer !== null;
	}

	/** Restore a persisted token and resolve the viewer behind it. */
	async init() {
		const stored = localStorage.getItem(TOKEN_KEY);
		if (stored) {
			this.token = stored;
			try {
				await this.fetchViewer();
			} catch {
				// token revoked/expired — drop it silently
				this.signOut();
			}
		}
		this.loading = false;
	}

	async signInWithToken(token: string) {
		this.token = token.trim();
		await this.fetchViewer();
		localStorage.setItem(TOKEN_KEY, this.token);
	}

	get oauthAvailable() {
		return Boolean(forumConfig.auth.oauth.clientId && forumConfig.auth.oauth.proxyUrl);
	}

	/** Kick off the GitHub OAuth web flow (requires a token-exchange proxy). */
	beginOAuth(redirectUri: string) {
		const state = crypto.randomUUID();
		sessionStorage.setItem(STATE_KEY, state);
		const url = new URL('https://github.com/login/oauth/authorize');
		url.searchParams.set('client_id', forumConfig.auth.oauth.clientId);
		url.searchParams.set('redirect_uri', redirectUri);
		url.searchParams.set('scope', 'public_repo');
		url.searchParams.set('state', state);
		location.href = url.toString();
	}

	/** Complete the OAuth flow on the callback page. */
	async completeOAuth(code: string, state: string) {
		const expected = sessionStorage.getItem(STATE_KEY);
		sessionStorage.removeItem(STATE_KEY);
		if (!expected || expected !== state) {
			throw new Error('OAuth state mismatch — please try signing in again.');
		}
		const res = await fetch(forumConfig.auth.oauth.proxyUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
		});
		if (!res.ok) throw new Error('Token exchange failed.');
		const data = (await res.json()) as { access_token?: string };
		if (!data.access_token) throw new Error('Token exchange returned no token.');
		await this.signInWithToken(data.access_token);
	}

	signOut() {
		this.token = null;
		this.viewer = null;
		localStorage.removeItem(TOKEN_KEY);
		// cached GraphQL data may contain viewer-specific fields — drop it all
		clearCache();
		setCacheScope(null);
	}

	private async fetchViewer() {
		const res = await fetch('https://api.github.com/graphql', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ query: '{ viewer { login name avatarUrl url } }' })
		});
		if (!res.ok) throw new Error(`GitHub rejected the token (${res.status}).`);
		const json = await res.json();
		if (json.errors?.length) throw new Error(json.errors[0].message);
		this.viewer = json.data.viewer as Viewer;
		// cache entries are isolated per signed-in user
		setCacheScope(this.viewer.login);
	}
}

export const auth = new Auth();
