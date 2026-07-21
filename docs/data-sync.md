# Data syncing

One GitHub Actions workflow — [`data-sync.yml`](../.github/workflows/data-sync.yml) running [`data-sync.ts`](../.github/scripts/data-sync.ts) — maintains everything on the machine-owned `data` branch: the [reputation](reputation.md) files and the [read-only archive](archive.md). This page walks the full pipeline from a user action to the data landing back in someone's browser.

## The flow

```mermaid
flowchart TD
    subgraph triggers ["1 · Triggers"]
        U1["User posts / comments / replies<br/>(forum UI or github.com)"]
        U2["Post or comment edited,<br/>deleted, moved, answered"]
        CRON["Cron — every 6 h<br/>(reactions have no webhook)"]
        MANUAL["Manual run<br/>(workflow_dispatch)"]
    end

    U1 --> EV["GitHub event<br/>discussion / discussion_comment"]
    U2 --> EV
    EV --> Q
    CRON --> Q
    MANUAL --> Q

    subgraph workflow ["2 · Data-sync workflow (GitHub Actions)"]
        Q["Concurrency queue<br/>(one run at a time, no races)"]
        SCAN["Scan ALL discussions via GraphQL<br/>posts · comments · replies ·<br/>answers · reactions · categories · pins"]
        COMPUTE["Recompute from scratch<br/>rep ledger (engine.ts: gains, daily caps)<br/>+ archive JSON (bodyHTML, neutralised)"]
        ENFORCE{"Under-rep post in<br/>a gated topic?"}
        MOD["Moderate via API:<br/>move / lock / delete + bot comment"]
        SNAP["Write snapshot tree to OUT_DIR"]

        Q --> SCAN --> COMPUTE --> ENFORCE
        ENFORCE -- yes --> MOD --> SNAP
        ENFORCE -- no --> SNAP
    end

    subgraph storage ["3 · Storage — data branch (orphan, machine-owned)"]
        PUSH["git force-push single fresh commit<br/>(creates the branch if missing)"]
        TREE["meta.json<br/>posts/index.json · posts/&lt;n&gt;/content.json<br/>profiles/index.json · profiles/&lt;login&gt;/rep.json"]
        PUSH --> TREE
    end

    SNAP --> PUSH

    subgraph fetching ["4 · Fetching — browser (SPA)"]
        CDN["raw.githubusercontent.com<br/>(no auth · CORS * · ~5 min CDN cache)"]
        ANON["Signed-out visitor<br/>browses archive read-only:<br/>home · topics · threads · profiles"]
        AUTHED["Signed-in visitor<br/>live GraphQL data +<br/>rep badges & topic gating from profiles/"]
    end

    TREE --> CDN
    CDN --> ANON
    CDN --> AUTHED
```

## Why "recompute from scratch"?

Every run rescans the whole forum and rebuilds every file, instead of incrementally patching:

- **Idempotent** — two runs over the same forum state produce byte-identical output, so concurrent or repeated triggers can never corrupt anything; the concurrency queue just serialises pushes.
- **Lossless under load** — GitHub keeps at most one queued run per concurrency group. With incremental updates a superseded run would mean lost events; with recompute, whichever run lands last has everything.
- **Self-healing** — deleted posts stop being counted and archived automatically; a failed run is fully repaired by the next one.

## Why snapshot force-pushes?

The branch holds only derived, recomputable data, so its git history has no value. Each run commits one fresh snapshot and force-pushes it:

- The branch stays at **one commit forever** — no repo bloat from thousands of tiny data commits.
- Stale files (deleted posts, renamed users) vanish because the whole tree is rewritten.
- A force-push to a branch that doesn't exist **creates it** — which is the entire bootstrap story. No manual setup, no seed commit.

## Interaction with branch protection

`main` keeps its rulesets (PRs, tests, 100 % coverage) untouched — the workflow never pushes there. The `data` branch is an orphan with no shared history, so the two can never be merged into each other accidentally. If your rulesets target *all* branches rather than `main`, exclude the data branch or add an Actions bypass, otherwise the workflow's push is rejected.

## Freshness

| Path | Latency |
| --- | --- |
| Post/comment/edit events | workflow runtime (~30–60 s) + raw-URL CDN cache (~5 min) |
| Reactions & upvotes | next 6-hourly cron (no webhook exists for them) |
| Manual dispatch | same as events |
