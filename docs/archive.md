# Read-only archive (anonymous mode)

Optional (off by default). Solves Discussion Kit's biggest UX limitation: the GitHub API refuses anonymous calls, so without this feature signed-out visitors can read **nothing**.

```ts
archive: { enabled: true }
```

With it enabled, the [data-sync workflow](data-sync.md) snapshots every discussion to the `data` branch, and **signed-out visitors browse that snapshot read-only** — served straight from `raw.githubusercontent.com`, which allows anonymous, CORS-open fetches on public repositories.

## What's stored

```
data
├── meta.json                    # categories, pinned posts, archivedAt
└── posts/
    ├── index.json               # list rows for the home/topic feeds
    └── <number>/content.json    # one full thread
```

Every file is shaped **exactly like the SPA's own API types** (`Discussion`, `DiscussionListItem`), so the existing pages and components render archive data unchanged — anonymous mode is a different *data source*, not a different UI. Threads store GitHub-rendered `bodyHTML` (GFM, syntax highlighting, sanitisation all done by GitHub), and viewer-specific fields (`viewerHasReacted`, `viewerHasUpvoted`) are neutralised since the snapshot is identical for everyone.

## What a signed-out visitor gets

| Works | Doesn't (routes to sign-in) |
| --- | --- |
| Home feed, category cards, pinned posts | Posting, commenting, replying |
| Topic pages with post/article filtering | Reactions and upvotes |
| Full threads: rendered bodies, comments, replies, reaction counts | Search (API-only) |
| Lightweight profiles: archived posts, rep, comment count | Profile READMEs, comment details, GitHub join date |

Plus a persistent banner — *"Read-only snapshot — sign in to post, comment, and react."* — and a "not yet archived" notice on posts created after the last sync. Signing in mid-session re-boots the app onto the live API transparently.

## How the SPA decides which source to use

`archiveMode()` in [`src/lib/ui.svelte.ts`](../src/lib/ui.svelte.ts) is true when `archive.enabled && !signedIn`. On boot:

- **Signed in** → the normal authenticated GraphQL bootstrap (categories, permission, home feed) with SWR caching.
- **Signed out + archive enabled** → fetch `meta.json` + `posts/index.json`, apply the same topic include/exclude filtering, and mark the session as archive-booted. Thread and profile pages then fetch their archive files on demand.
- **Signed out + no archive yet** (workflow never ran) → the classic sign-in prompt, unchanged.

## Constraints

- **Public repositories only.** Raw URLs require auth on private repos, which would defeat the purpose.
- **Freshness**: a few minutes behind live (workflow runtime + ~5 min CDN cache); reactions/upvotes refresh on the 6-hourly cron. See [Data syncing → Freshness](data-sync.md#freshness).
- The archive is a *mirror*, not a backup with history — each sync replaces the previous snapshot entirely.
