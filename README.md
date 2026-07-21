# Discussion Kit

[![Follow us on product hunt](https://api.producthunt.com/widgets/embed-image/v1/follow.svg?product_id=1273493&theme=light&size=small)](https://www.producthunt.com/products/git-forum?utm_source=badge-follow&utm_medium=badge&utm_source=badge-git&#0045;forum)

A fully featured forum site powered entirely by **GitHub Discussions** — no backend, no database. It builds to plain static files and runs on **GitHub Pages**. Built with **SvelteKit** (Svelte 5) and **Tailwind CSS v4**.

Deep-dive documentation lives in [`docs/`](docs/README.md) — architecture, [data syncing](docs/data-sync.md) (with flow diagram), [reputation](docs/reputation.md), and the [read-only archive](docs/archive.md).

## How it works

- **Topics** are your repository's Discussion categories.
- **Posts and articles** are discussions. Articles are marked with a hidden `<!-- dk:article -->` comment and get a long-form reading layout plus an "Articles" tab per topic.
- **Comments, threaded replies, reactions, and upvotes** map 1:1 to Discussions features via the GitHub GraphQL API.
- **Search** uses GitHub's discussion search scoped to the repo.
- **Admins** are declared in [`forum.config.ts`](forum.config.ts) (`admins.logins`) and get an `ADMIN` badge everywhere they post.
- **Moderation**: post authors and repository maintainers can edit a post's title, body, and topic, or delete it, straight from the thread page (GitHub enforces the same permissions server-side). Every post has a **Report** link that opens GitHub's report-content form.
- **Pinned posts**: discussions pinned on github.com (Discussions → ⋯ → *Pin discussion*, maintainers only, up to 4) appear in a dedicated **Pinned** section above the list on the home page and on their topic's page. The GitHub API only exposes *reading* pins, so pinning/unpinning itself happens on github.com.
- Post bodies are rendered by GitHub itself (`bodyHTML`), so you get GitHub-flavoured markdown, syntax highlighting markup, and sanitisation for free.

> **Why is sign-in required to read?** GitHub Discussions is only exposed through the GraphQL API, which always requires authentication. There is no server here to hold a shared token, so each visitor authenticates with their own GitHub account. Enable the [read-only archive](#read-only-archive-anonymous-mode) to let signed-out visitors browse a snapshot of the forum anyway.

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
| `content` | `pageSize`, `sort` (`CREATED_AT`/`UPDATED_AT`), `listExcerpts` (disable together with articles to skip fetching post bodies in lists), `articles.enabled` + `articles.marker`, `topics.include`/`topics.exclude` (category slugs), `topics.restricted` (announcement-format slugs where only maintainers can post — the UI hides posting there unless the signed-in user has write access) |
| `features` | `search`, `reactions`, `upvotes` — toggle whole features off |
| `rep` | Optional reputation system (off by default): `enabled`, `gains` (rep per `post`/`comment`/`answerAccepted`), `dailyCaps` (anti-farming, per UTC day, 0 = uncapped), `topics` (slug → min rep to post), `onViolation` (`move`/`lock`/`delete`), `fallbackTopic`, `exemptMaintainers`, `dataBranch` — see [Reputation system](#reputation-system) |
| `archive` | Optional cold-store archive + anonymous read-only mode (off by default, public repos only): `enabled`, `dataBranch` — see [Read-only archive](#read-only-archive-anonymous-mode) |
| `cache` | `enabled` (default `true`), `ttlSeconds` (default `3600`) — stale-while-revalidate caching of GraphQL responses in `localStorage`: pages paint instantly from the last known data while a background request refreshes them; entries are versioned, scoped per signed-in user, invalidated on posting, and wiped on sign-out |
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

## Reputation system

An optional rep system: users earn rep for forum activity, and topics can require a minimum rep to post — a middle ground between fully open topics and maintainer-only announcements. Off by default; enable it in [`forum.config.ts`](forum.config.ts):

```ts
rep: {
	enabled: true,
	gains: { post: 5, comment: 2, answerAccepted: 15 },
	dailyCaps: { post: 25, comment: 10 },  // rep per UTC day, 0 = uncapped
	topics: { showcase: 50 },              // slug → min rep to post
	onViolation: 'move',                   // 'move' | 'lock' | 'delete'
	fallbackTopic: 'general'
}
```

How it works:

- **Rep data lives on the machine-written [`data` branch](#the-data-branch)** as `profiles/index.json` (compact login → rep map, one fetch for list badges) plus `profiles/<login>/rep.json` (rep + action breakdown), maintained exclusively by the [`data-sync.yml`](.github/workflows/data-sync.yml) workflow. On every discussion/comment event it **recomputes rep from scratch** by scanning all forum activity — deterministic, idempotent, and self-healing (deleted content simply stops counting).
- **Earning**: posts, comments, and accepted answers award rep. Daily caps (per UTC day, per action type) blunt farming; accepted answers are never capped since someone else grants them.
- **Enforcement is reactive.** GitHub has no pre-post hook, so a low-rep user *can* momentarily post into a gated topic via github.com — the workflow then sweeps recent posts in gated topics and moves (default), locks, or deletes violations, leaving an explanatory comment. A post's own rep gain doesn't count toward clearing its own gate.
- **Exemptions**: repository maintainers (unless `exemptMaintainers: false`) and configured `admins.logins` bypass rep gates.
- **Caveats**: the raw-URL rep data is CDN-cached (~5 min lag); the enforcement sweep only looks at the last 48 hours, so if a maintainer moves a violating post *back* into a gated topic within that window the workflow will move it out again.

## Read-only archive (anonymous mode)

Normally signed-out visitors can read nothing (the GitHub API refuses anonymous calls). With the archive enabled, the data-sync workflow snapshots every discussion — GitHub-rendered HTML, comments, replies, reaction counts — and **signed-out visitors browse that snapshot read-only**: home, topics, threads, and lightweight profiles all work, with a banner and sign-in prompts on every interactive control.

```ts
archive: { enabled: true }
```

- **Public repositories only** — the SPA reads the snapshot from `raw.githubusercontent.com`, which requires auth on private repos.
- **Freshness**: event-driven updates land within a minute or two (workflow runtime + ~5 min CDN cache). Reactions/upvotes have no webhook, so they refresh on the 6-hourly scheduled sync.
- **Degradations while signed out**: no posting, reactions, or search; brand-new posts show a "not yet archived" notice; profile pages show archived posts and rep but not comment details or the GitHub README.

## The data branch

Both features above write to a single orphan branch (default `data`) that contains **only machine-generated files** — it never merges with `main`, so branch rulesets on `main` (PRs, tests, coverage) are unaffected:

```
data
├── meta.json                    # categories, pinned posts, archivedAt
├── profiles/
│   ├── index.json               # login → rep map
│   └── <login>/rep.json         # rep + action breakdown
└── posts/
    ├── index.json               # discussion list rows
    └── <number>/content.json    # full archived thread
```

- **Zero setup**: the workflow force-pushes a fresh single-commit snapshot on every run, which *creates the branch automatically* if it doesn't exist. Enabling the feature and letting the workflow run once (or triggering **Data sync** manually from the Actions tab) is all it takes.
- Every run rewrites the whole tree, so deleted posts and renamed users disappear without cleanup logic, and the branch never accumulates history.
- **If you use repository rulesets**, make sure they target `main` (or otherwise exclude the data branch) — a ruleset covering all branches would block the workflow's push.

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

The deploy output prints your Worker URL, e.g. `https://discussion-kit-oauth.<account>.workers.dev`.

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
		proxyUrl: 'https://discussion-kit-oauth.<account>.workers.dev'
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
