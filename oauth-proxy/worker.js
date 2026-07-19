/**
 * GitHub OAuth token-exchange proxy for Discussion Kit.
 *
 * GitHub's /login/oauth/access_token endpoint doesn't allow browser CORS,
 * so this tiny Worker performs the exchange server-side. It holds the OAuth
 * app's client secret and does nothing else: POST { code } → { access_token }.
 *
 * Deploy with wrangler (see oauth-proxy/README.md) or paste into the
 * Cloudflare dashboard editor.
 *
 * Required configuration:
 *   ALLOWED_ORIGINS       comma-separated list of allowed origins, e.g.
 *                         "https://your-user.github.io,http://localhost:5173"  (var)
 *   GITHUB_CLIENT_ID      OAuth app client id                                  (var)
 *   GITHUB_CLIENT_SECRET  OAuth app client secret                              (secret!)
 */

/**
 * @typedef {{ ALLOWED_ORIGINS?: string, GITHUB_CLIENT_ID: string, GITHUB_CLIENT_SECRET: string }} Env
 */

/**
 * Parse the ALLOWED_ORIGINS CSV into a clean list.
 * @param {string | undefined} csv
 * @returns {string[]}
 */
export function parseAllowedOrigins(csv) {
	return (csv ?? '')
		.split(',')
		.map((origin) => origin.trim().replace(/\/+$/, ''))
		.filter(Boolean);
}

export default {
	/**
	 * @param {Request} request
	 * @param {Env} env
	 * @returns {Promise<Response>}
	 */
	async fetch(request, env) {
		const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
		const origin = request.headers.get('Origin');
		const originAllowed = origin !== null && allowed.includes(origin);

		// CORS headers echo the specific caller origin (never the whole list)
		const cors = {
			...(originAllowed ? { 'Access-Control-Allow-Origin': origin } : {}),
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			Vary: 'Origin'
		};
		/**
		 * @param {unknown} body
		 * @param {number} [status]
		 */
		const json = (body, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json', ...cors }
			});

		if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
		if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

		// Only accept calls from the forum itself
		if (!originAllowed) return json({ error: 'forbidden_origin' }, 403);

		let code;
		try {
			({ code } = await request.json());
		} catch {
			return json({ error: 'invalid_json' }, 400);
		}
		if (!code || typeof code !== 'string') return json({ error: 'missing_code' }, 400);

		const res = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({
				client_id: env.GITHUB_CLIENT_ID,
				client_secret: env.GITHUB_CLIENT_SECRET,
				code
			})
		});
		if (!res.ok) return json({ error: 'github_unreachable' }, 502);

		const data = await res.json();
		if (!data.access_token) return json({ error: data.error ?? 'exchange_failed' }, 400);

		// Never forward anything but the token itself
		return json({ access_token: data.access_token });
	}
};
