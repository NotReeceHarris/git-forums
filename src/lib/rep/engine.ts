/**
 * Reputation engine — pure functions shared by the SPA (display, UI gating)
 * and the GitHub Actions workflow (ledger recompute, enforcement).
 *
 * Rep is a deterministic function of repository activity: the workflow rescans
 * all discussions on every event and recomputes the ledger from scratch. That
 * makes updates idempotent and race-proof (concurrent runs produce identical
 * output), lets deletions reflect automatically, and keeps this module free of
 * incremental-update state.
 *
 * This file must stay importable outside Vite (the workflow runs it via tsx),
 * so no `$lib` aliases and no Svelte imports.
 */
import type { ForumConfig } from '../config/schema';

export type RepConfig = ForumConfig['rep'];

export type RepAction = 'post' | 'comment' | 'answerAccepted';

/** A single rep-earning event derived from repository activity */
export interface RepActivity {
	/** Author login (any case; ledger keys are lowercased) */
	login: string;
	action: RepAction;
	/** ISO timestamp — daily caps bucket by its UTC day */
	createdAt: string;
	/** Node id of the discussion this activity belongs to */
	discussionId: string;
}

export interface RepLedger {
	version: 1;
	/** When the ledger was last recomputed (ISO timestamp) */
	updatedAt: string;
	/** Lowercased login → total rep */
	users: Record<string, number>;
}

export function emptyLedger(updatedAt = new Date(0).toISOString()): RepLedger {
	return { version: 1, updatedAt, users: {} };
}

/**
 * Recompute the full ledger from activity. Daily caps apply per user, UTC day,
 * and action type, processing activity in chronological order so the outcome
 * is independent of input ordering. Accepted answers are never capped —
 * they're granted by someone else, which makes them farming-resistant.
 */
export function computeLedger(
	activity: RepActivity[],
	cfg: RepConfig,
	updatedAt = new Date().toISOString()
): RepLedger {
	const users: Record<string, number> = {};
	const dayGains = new Map<string, number>();
	const ordered = [...activity].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	for (const item of ordered) {
		const login = item.login.toLowerCase();
		let awarded = cfg.gains[item.action];
		const cap = item.action === 'answerAccepted' ? 0 : cfg.dailyCaps[item.action];
		if (cap > 0) {
			const key = `${login}|${item.createdAt.slice(0, 10)}|${item.action}`;
			const used = dayGains.get(key) ?? 0;
			awarded = Math.max(0, Math.min(awarded, cap - used));
			dayGains.set(key, used + awarded);
		}
		users[login] = (users[login] ?? 0) + awarded;
	}
	return { version: 1, updatedAt, users };
}

export function repOf(
	ledger: Pick<RepLedger, 'users'> | null,
	login: string | null | undefined
): number {
	if (!ledger || !login) return 0;
	return ledger.users[login.toLowerCase()] ?? 0;
}

/** Minimum rep required to post in a topic (0 = ungated or feature disabled) */
export function requiredRep(cfg: RepConfig, slug: string): number {
	return cfg.enabled ? (cfg.topics[slug] ?? 0) : 0;
}

/** Whether a user with `rep` may post in `slug` (`exempt` bypasses the gate) */
export function meetsRequirement(
	cfg: RepConfig,
	slug: string,
	rep: number,
	exempt: boolean
): boolean {
	return exempt || rep >= requiredRep(cfg, slug);
}
