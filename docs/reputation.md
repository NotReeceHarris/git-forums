# Reputation system

Optional (off by default). Users earn rep for forum activity; topics can require a minimum rep to post — a middle ground between fully open topics and maintainer-only announcements. Enabled and tuned entirely from [`forum.config.ts`](../forum.config.ts):

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

## Earning rep

| Action | Default rep | Daily cap |
| --- | --- | --- |
| Creating a post | +5 | 25/day |
| Commenting or replying | +2 | 10/day |
| Having an answer accepted | +15 | never capped |

Design notes:

- **Rep is a pure function of forum activity.** The [data-sync workflow](data-sync.md) recomputes the entire ledger from scratch on every run ([`src/lib/rep/engine.ts`](../src/lib/rep/engine.ts) — unit-tested at 100 % coverage). There are no increments to lose or corrupt, and deleting content automatically removes the rep it granted.
- **Daily caps** bucket per user, per UTC day, per action type, applied in chronological order so the result is deterministic regardless of scan order. They exist to blunt farming: past the cap, more spam earns nothing.
- **Accepted answers are uncapped** because someone *else* grants them — the one signal that can't be self-farmed.
- Logins are lowercased everywhere (GitHub treats them case-insensitively).

## Where rep is stored and shown

The workflow writes to the `data` branch:

- `profiles/index.json` — compact `login → rep` map. One fetch powers every rep chip next to usernames in lists, comments, and threads.
- `profiles/<login>/rep.json` — per-user detail: total rep plus a raw action breakdown (`post` / `comment` / `answerAccepted` counts).

The SPA shows rep next to usernames (beside badges), on profile pages (before the post/comment counters), and uses it to gate the topic picker. Before the first sync lands, everyone displays **0 rep**.

## Gating and enforcement

Two layers, one honest limitation:

1. **UI gating (soft).** Gated topics disappear from the `/new` topic picker and show a "Requires N rep" chip on their topic page. This gate *fails open* while the rep data hasn't loaded — the UI is a mirror, not the enforcer.
2. **Workflow enforcement (authoritative, but reactive).** GitHub has no pre-post hook, so a low-rep user can momentarily post into a gated topic straight on github.com. Each sync run sweeps posts from the **last 48 hours** in gated topics and moderates violations per `onViolation`:
   - `move` (default): move to `fallbackTopic` + explanatory bot comment — non-destructive
   - `lock`: comment + lock the thread
   - `delete`: remove the discussion entirely

   A post's own rep gain is excluded when checking its own gate (otherwise a `+5` post could clear a 5-rep threshold by existing).

**Exemptions**: users with push access (`exemptMaintainers`, default on) and everyone in `admins.logins`.

## Caveats

- Rep display lags the CDN cache (~5 min) and the sweep window is 48 h — a maintainer moving a violating post *back* into a gated topic within that window will see the workflow move it out again.
- Farming resistance comes from cap/weight tuning, not structure. If a community finds a loophole, tune `gains`/`dailyCaps` rather than expecting the engine to catch intent.
