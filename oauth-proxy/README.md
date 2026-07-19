# OAuth token-exchange proxy

Enables the "Continue with GitHub" button on the forum. GitHub's token
endpoint blocks browser CORS, so this ~50-line Cloudflare Worker swaps the
OAuth `code` for an access token. It stores the client secret and returns
`{ access_token }` — nothing else. Free-tier Workers are more than enough.

## 1. Create a GitHub OAuth app

[github.com/settings/developers](https://github.com/settings/developers) → *New OAuth App*:

- **Homepage URL**: `https://<user>.github.io/<repo>`
- **Authorization callback URL**: `https://<user>.github.io/<repo>/auth/callback`

Save the **Client ID** and generate a **Client Secret**.

## 2. Deploy the Worker

### Option A — wrangler CLI

```sh
cd oauth-proxy
# edit wrangler.toml: set ALLOWED_ORIGINS (CSV) and GITHUB_CLIENT_ID
npx wrangler login
npx wrangler deploy
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the secret when prompted
```

The deploy output prints your Worker URL, e.g.
`https://git-forums-oauth.<account>.workers.dev`.

### Option B — Cloudflare dashboard (no CLI)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → *Workers & Pages* → *Create Worker* → deploy the hello-world, then *Edit code* and paste `worker.js`.
2. Under *Settings → Variables and Secrets* add:
   - `ALLOWED_ORIGINS` (text) — comma-separated, e.g. `https://<user>.github.io,http://localhost:5173`
   - `GITHUB_CLIENT_ID` (text)
   - `GITHUB_CLIENT_SECRET` (**secret**)
3. Deploy and note the `*.workers.dev` URL.

## 3. Point the forum at it

In `forum.config.ts`:

```ts
auth: {
	oauth: {
		clientId: '<your client id>',
		proxyUrl: 'https://git-forums-oauth.<account>.workers.dev'
	}
}
```

Push, let Pages redeploy, and the sign-in dialog now shows
**Continue with GitHub** (token sign-in is automatically disabled once
OAuth is configured).

## Notes

- The Worker rejects requests whose `Origin` isn't in `ALLOWED_ORIGINS`, so other
  sites can't use your proxy. (This is CSRF protection, not a secret — the
  forum also validates an OAuth `state` nonce client-side.)
- For local dev, include `http://localhost:5173` in `ALLOWED_ORIGINS`.
- Tokens are issued with the `public_repo` scope, which is what lets users
  read and post to Discussions on public repositories.
