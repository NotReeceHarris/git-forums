# Git Forums

A fully featured forum site powered entirely by **GitHub Discussions** — no backend, no database. It builds to plain static files and runs on **GitHub Pages**. Styled after [Fumadocs](https://github.com/fuma-nama/fumadocs), built with **SvelteKit** (Svelte 5) and **Tailwind CSS v4**.

## How it works

- **Topics** are your repository's Discussion categories.
- **Posts and articles** are discussions. Articles are marked with a hidden `<!-- gf:article -->` comment and get a long-form reading layout plus an "Articles" tab per topic.
- **Comments, threaded replies, reactions, and upvotes** map 1:1 to Discussions features via the GitHub GraphQL API.
- **Search** uses GitHub's discussion search scoped to the repo.
- **Admins** are declared in [`meta/admins.json`](meta/admins.json) (fetched from `raw.githubusercontent.com` at runtime) and get an `ADMIN` badge everywhere they post.
- Post bodies are rendered by GitHub itself (`bodyHTML`), so you get GitHub-flavoured markdown, syntax highlighting markup, and sanitisation for free.

> **Why is sign-in required to read?** GitHub Discussions is only exposed through the GraphQL API, which always requires authentication. There is no server here to hold a shared token, so each visitor authenticates with their own GitHub account.

## Use it for your own forum

1. **Fork / use this repo as a template.**
2. **Enable Discussions** on your repository (Settings → General → Features → Discussions) and create the categories you want as forum topics.
3. **Enable GitHub Pages** (Settings → Pages → Source: *GitHub Actions*) and push to `main` — [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and deploys automatically. The repository is **auto-detected** from the Actions environment, so this works with zero code changes.
4. Optionally customise [`forum.config.ts`](forum.config.ts) (project root) and [`meta/admins.json`](meta/admins.json).

## Configuration

Everything lives in [`forum.config.ts`](forum.config.ts). Every option is optional; the full schema with defaults is in [`src/lib/config/schema.ts`](src/lib/config/schema.ts).

| Section | Options |
| --- | --- |
| `site` | `name`, `description`, `logo` (emoji replacing the default icon), `footer` |
| `repo` | `owner`, `name` (omit both to auto-detect in GitHub Actions), `branch` |
| `nav` | Extra header links: `{ label, href, external? }[]` |
| `auth` | `allowToken` (PAT sign-in on/off), `oauth.clientId` + `oauth.proxyUrl` (enables "Continue with GitHub") |
| `admins` | `source` (JSON path in the repo, default `meta/admins.json`, `''` disables), `logins` (inline admins), `badgeLabel` |
| `content` | `pageSize`, `sort` (`CREATED_AT`/`UPDATED_AT`), `articles.enabled` + `articles.marker`, `topics.include`/`topics.exclude` (category slugs) |
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

Two modes, controlled by `forumConfig.oauth`:

- **Personal access token (default, zero infrastructure).** Users create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) with read/write **Discussions** permission on the forum repo and paste it into the sign-in dialog. It is stored in `localStorage` only.
- **"Sign in with GitHub" OAuth.** GitHub's token-exchange endpoint blocks browser CORS, so you need a tiny proxy. A ready-to-deploy Cloudflare Worker is included in [`oauth-proxy/`](oauth-proxy/) — see its [README](oauth-proxy/README.md) for the 3-step setup (create OAuth app → deploy Worker → set `oauth.clientId` + `oauth.proxyUrl` in `forum.config.ts`).

## Development

```sh
npm install
npm run dev        # dev server
npm run check      # type-check
npm run build      # static build (set BASE_PATH=/<repo> for GitHub Pages)
npm run preview    # preview the production build
```

The app is a static SPA: `adapter-static` with a `404.html` fallback (GitHub Pages serves it for dynamic routes like `/d/42`, which the client router then handles), a `.nojekyll` file so `_app/` isn't ignored, and prerendered shells for the static routes.
