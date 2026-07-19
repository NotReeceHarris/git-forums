# git-forums

[![Follow us on product hunt](https://api.producthunt.com/widgets/embed-image/v1/follow.svg?product_id=1273493&theme=light&size=small)](https://www.producthunt.com/products/git-forum?utm_source=badge-follow&utm_medium=badge&utm_source=badge-git&#0045;forum)

A fully featured forum site powered entirely by **GitHub Discussions** — no backend, no database. It builds to plain static files and runs on **GitHub Pages**. Built with **SvelteKit** (Svelte 5) and **Tailwind CSS v4**.

## How it works

- **Topics** are your repository's Discussion categories.
- **Posts and articles** are discussions. Articles are marked with a hidden `<!-- gf:article -->` comment and get a long-form reading layout plus an "Articles" tab per topic.
- **Comments, threaded replies, reactions, and upvotes** map 1:1 to Discussions features via the GitHub GraphQL API.
- **Search** uses GitHub's discussion search scoped to the repo.
- **Admins** are declared in [`forum.config.ts`](forum.config.ts) (`admins.logins`) and get an `ADMIN` badge everywhere they post.
- Post bodies are rendered by GitHub itself (`bodyHTML`), so you get GitHub-flavoured markdown, syntax highlighting markup, and sanitisation for free.

> **Why is sign-in required to read?** GitHub Discussions is only exposed through the GraphQL API, which always requires authentication. There is no server here to hold a shared token, so each visitor authenticates with their own GitHub account.

## Use it for your own forum

1. **Fork / use this repo as a template.**
2. **Enable Discussions** on your repository (Settings → General → Features → Discussions) and create the categories you want as forum topics.
3. **Enable GitHub Pages** (Settings → Pages → Source: *GitHub Actions*) and push to `main` — [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and deploys automatically. The repository is **auto-detected** from the Actions environment, so this works with zero code changes.
4. Optionally customise [`forum.config.ts`](forum.config.ts) (project root) — branding, admins, features, theme.

## Configuration

Everything lives in [`forum.config.ts`](forum.config.ts). Every option is optional; the full schema with defaults is in [`src/lib/config/schema.ts`](src/lib/config/schema.ts).

| Section | Options |
| --- | --- |
| `site` | `name`, `description`, `logo` (emoji replacing the default icon), `footer` |
| `repo` | `owner`, `name` (omit both to auto-detect in GitHub Actions), `branch` |
| `nav` | Extra header links: `{ label, href, external? }[]` |
| `auth` | `allowToken` (PAT sign-in on/off), `oauth.clientId` + `oauth.proxyUrl` (enables "Continue with GitHub") |
| `admins` | `logins` (GitHub usernames that get the admin badge), `badgeLabel` |
| `badges` | Custom badges next to usernames, keyed by label: `{ 'Moderator': ['alice'], 'Contributor': ['bob', 'carol'] }` — users can hold several |
| `content` | `pageSize`, `sort` (`CREATED_AT`/`UPDATED_AT`), `articles.enabled` + `articles.marker`, `topics.include`/`topics.exclude` (category slugs), `topics.restricted` (announcement-format slugs where only maintainers can post — the UI hides posting there unless the signed-in user has write access) |
| `features` | `search`, `reactions`, `upvotes` — toggle whole features off |
| `theme` | Per-scheme CSS token overrides (`light`/`dark`): `background`, `foreground`, `muted`, `mutedForeground`, `card`, `cardForeground`, `border`, `primary`, `primaryForeground`, `accent`, `accentForeground`, `ring`, `link` |

Example — blue accent and a docs link:

```ts
export default defineForumConfig({
	site: { name: 'Acme Forum', logo: '🚀' },
	nav: [{ label: 'Docs', href: 'https://docs.acme.dev', external: true }],
	theme: {
		light: { primary: 'hsl(221 83% 53%)', primaryForeground: 'hsl(0 0% 100%)' },
		dark: { primary: 'hsl(217 91% 60%)' }
	}
});
```

If no repository is configured or detectable, the site renders a friendly setup screen instead of breaking.

## Signing in

Two modes, controlled by `forumConfig.auth`:

- **Personal access token (default, zero infrastructure).** Users create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) with read/write **Discussions** permission on the forum repo and paste it into the sign-in dialog. It is stored in `localStorage` only.
- **"Sign in with GitHub" OAuth.** A proper one-click sign-in via a tiny Cloudflare Worker proxy (setup below). Once OAuth is configured, token sign-in is automatically disabled — users only ever see the **Continue with GitHub** button.

## Setting up the OAuth proxy

GitHub's token-exchange endpoint (`github.com/login/oauth/access_token`) blocks browser CORS requests, so a static site can't complete the OAuth flow alone. The [`oauth-proxy/`](oauth-proxy/) folder contains a ready-to-deploy Cloudflare Worker (~50 lines, free tier is plenty) that holds your OAuth app's client secret and does exactly one thing: `POST { code }` → `{ access_token }`.

### 1. Create a GitHub OAuth app

Go to [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**:

- **Homepage URL**: `https://<user>.github.io/<repo>`
- **Authorization callback URL**: `https://<user>.github.io/<repo>/auth/callback`

Save the **Client ID**, then generate and copy a **Client Secret** (shown only once).

### 2. Deploy the Worker

**Option A — wrangler CLI:**

```sh
cd oauth-proxy
# edit wrangler.toml first:
#   ALLOWED_ORIGINS  = "https://<user>.github.io,http://localhost:5173"   (CSV of allowed origins)
#   GITHUB_CLIENT_ID = "<your client id>"
npx wrangler login
npx wrangler deploy
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the client secret when prompted
```

The deploy output prints your Worker URL, e.g. `https://git-forums-oauth.<account>.workers.dev`.

**Option B — Cloudflare dashboard (no CLI):**

1. [dash.cloudflare.com](https://dash.cloudflare.com) → *Workers & Pages* → *Create Worker*, deploy the hello-world, then *Edit code* and paste in [`oauth-proxy/worker.js`](oauth-proxy/worker.js).
2. Under *Settings → Variables and Secrets* add `ALLOWED_ORIGINS` (text, comma-separated origins), `GITHUB_CLIENT_ID` (text), and `GITHUB_CLIENT_SECRET` (**secret**, not plain text).
3. Deploy and note the `*.workers.dev` URL.

### 3. Point the forum at it

In [`forum.config.ts`](forum.config.ts):

```ts
auth: {
	oauth: {
		clientId: '<your client id>',
		proxyUrl: 'https://git-forums-oauth.<account>.workers.dev'
	}
}
```

Push, let Pages redeploy, and the sign-in dialog now shows **Continue with GitHub**.

### Notes

- The Worker rejects any request whose `Origin` header isn't in `ALLOWED_ORIGINS`, so other sites can't ride on your proxy; the forum additionally validates an OAuth `state` nonce client-side.
- The client secret never reaches the browser — it lives only in the Worker.
- Tokens are requested with the `public_repo` scope, which covers reading and posting to Discussions on public repositories.
- For local dev, just include `http://localhost:5173` in `ALLOWED_ORIGINS` — one Worker can serve production and local development.

## Development

```sh
npm install
npm run dev            # dev server
npm run check          # type-check
npm run test           # unit tests (vitest)
npm run test:coverage  # unit tests + coverage (100% enforced on logic modules)
npm run build          # static build (set BASE_PATH=/<repo> for GitHub Pages)
npm run preview        # preview the production build
```

Unit tests live in [`tests/`](tests/) and cover all logic modules (config merging/theming, the GitHub API layer, auth, permissions/badges, utilities) at 100% statement/branch/function/line coverage, enforced by thresholds in [`vitest.config.ts`](vitest.config.ts). CI runs them on every pull request ([`test.yml`](.github/workflows/test.yml)) and as a gate before every Pages deploy ([`deploy.yml`](.github/workflows/deploy.yml)).

The app is a static SPA: `adapter-static` with a `404.html` fallback (GitHub Pages serves it for dynamic routes like `/d/42`, which the client router then handles), a `.nojekyll` file so `_app/` isn't ignored, and prerendered shells for the static routes.
