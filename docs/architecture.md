# Architecture

Discussion Kit is a **fully client-side SvelteKit SPA with no backend and no database**. GitHub Discussions is the data store, the GitHub GraphQL API is the data layer, and GitHub Pages serves the static build.

```
┌────────────────────┐         GraphQL (auth required)        ┌──────────────────┐
│  Browser (SPA)     │ ─────────────────────────────────────► │  GitHub API      │
│  SvelteKit static  │                                        │  (Discussions)   │
│  build on Pages    │ ◄───────────────────────────────────── │                  │
└────────────────────┘         raw file fetch (no auth)       └──────────────────┘
          ▲                                                            ▲
          │              ┌──────────────────┐   scans + writes         │
          └───reads──────│  `data` branch   │◄────── GitHub Actions ───┘
                         │  (machine-owned) │        (data-sync.yml)
                         └──────────────────┘
```

## Core pieces

- **Routing / pages** (`src/routes/`) — home feed, topic pages (`/t/[slug]`), threads (`/d/[number]`), user profiles (`/u/[login]`), search, new-post composer. The build is a static SPA (`adapter-static` with a `404.html` fallback), so dynamic routes work on GitHub Pages via the client router.
- **API layer** (`src/lib/github/api.ts`) — every GraphQL query/mutation the app makes. Discussions, comments, reactions, upvotes, search, markdown rendering, and user profiles. Responses GitHub can't be fully trusted on (per-user activity scoping) are re-filtered client-side.
- **Auth** (`src/lib/github/auth.svelte.ts`) — each visitor authenticates with *their own* GitHub account, either by pasting a fine-grained PAT or via OAuth through a tiny Cloudflare Worker proxy (`oauth-proxy/`) that holds the client secret. Tokens live in `localStorage` only and are sent solely to `api.github.com`.
- **Cache** (`src/lib/cache.ts`) — stale-while-revalidate over `localStorage`: pages paint instantly from the last known data while a background request refreshes them. Entries are versioned, scoped per signed-in user, and wiped on sign-out.
- **Config** (`forum.config.ts` + `src/lib/config/schema.ts`) — everything is optional and deep-merged over defaults; the repo can be auto-detected from the Actions build environment so forks deploy with zero code changes.
- **Machine-written data** (the `data` branch) — reputation files and the cold-store archive, maintained by GitHub Actions and read by the SPA over raw URLs. See [Data syncing](data-sync.md).

## Trust model

- GitHub enforces all permissions server-side (posting, editing, deleting, moderation) — the UI only mirrors them.
- Post bodies are rendered by GitHub (`bodyHTML`), so markdown rendering and HTML sanitisation are GitHub's, not ours.
- Anything the workflow writes to the `data` branch is derived and recomputable; nothing on it is hand-edited or authoritative beyond the last sync.

## Why sign-in is required for live data

The GraphQL API refuses anonymous calls and there is no server to hold a shared token. Signed-out visitors either see a sign-in prompt or — when the [archive](archive.md) is enabled — browse a read-only snapshot served from the `data` branch.
