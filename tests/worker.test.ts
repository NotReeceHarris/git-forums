import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
// @ts-expect-error plain-JS Cloudflare Worker module
import worker, { parseAllowedOrigins } from '../oauth-proxy/worker.js';

const env = {
	ALLOWED_ORIGINS: 'https://user.github.io, http://localhost:5173/',
	GITHUB_CLIENT_ID: 'cid',
	GITHUB_CLIENT_SECRET: 'secret'
};

const req = (opts: { method?: string; origin?: string | null; body?: unknown } = {}) =>
	new Request('https://proxy.example', {
		method: opts.method ?? 'POST',
		headers: opts.origin ? { Origin: opts.origin } : {},
		body:
			opts.method === 'OPTIONS' || opts.method === 'GET'
				? undefined
				: typeof opts.body === 'string'
					? opts.body
					: JSON.stringify(opts.body ?? { code: 'abc' })
	});

let fetchMock: Mock;
beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});

describe('parseAllowedOrigins', () => {
	it('splits, trims, and strips trailing slashes', () => {
		expect(parseAllowedOrigins('https://a.io, http://b:1/ ,')).toEqual([
			'https://a.io',
			'http://b:1'
		]);
	});

	it('handles missing config', () => {
		expect(parseAllowedOrigins(undefined)).toEqual([]);
	});
});

describe('worker fetch', () => {
	it('answers preflight with the caller origin when allowed', async () => {
		const res = await worker.fetch(req({ method: 'OPTIONS', origin: 'http://localhost:5173' }), env);
		expect(res.status).toBe(200);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
	});

	it('omits the CORS allow header for unknown origins', async () => {
		const res = await worker.fetch(req({ method: 'OPTIONS', origin: 'https://evil.example' }), env);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
	});

	it('rejects non-POST methods', async () => {
		const res = await worker.fetch(req({ method: 'GET', origin: 'https://user.github.io' }), env);
		expect(res.status).toBe(405);
	});

	it('rejects disallowed or missing origins', async () => {
		expect((await worker.fetch(req({ origin: 'https://evil.example' }), env)).status).toBe(403);
		expect((await worker.fetch(req({}), env)).status).toBe(403);
	});

	it('rejects malformed JSON and missing codes', async () => {
		const origin = 'https://user.github.io';
		expect((await worker.fetch(req({ origin, body: 'not json' }), env)).status).toBe(400);
		expect((await worker.fetch(req({ origin, body: {} }), env)).status).toBe(400);
		expect((await worker.fetch(req({ origin, body: { code: 42 } }), env)).status).toBe(400);
	});

	it('exchanges the code and returns only the access token', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ access_token: 'tok', scope: 'public_repo', extra: 'x' })
		});
		const res = await worker.fetch(req({ origin: 'https://user.github.io' }), env);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ access_token: 'tok' });
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://user.github.io');
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body).toEqual({ client_id: 'cid', client_secret: 'secret', code: 'abc' });
	});

	it('maps GitHub transport failures to 502', async () => {
		fetchMock.mockResolvedValue({ ok: false });
		const res = await worker.fetch(req({ origin: 'https://user.github.io' }), env);
		expect(res.status).toBe(502);
	});

	it('surfaces GitHub exchange errors as 400', async () => {
		fetchMock.mockResolvedValue({ ok: true, json: async () => ({ error: 'bad_verification_code' }) });
		const res = await worker.fetch(req({ origin: 'https://user.github.io' }), env);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'bad_verification_code' });
	});

	it('falls back to a generic error label', async () => {
		fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
		const res = await worker.fetch(req({ origin: 'https://user.github.io' }), env);
		expect(await res.json()).toEqual({ error: 'exchange_failed' });
	});
});
