/**
 * SPA-side access to the rep ledger the Actions workflow maintains on the
 * data branch. Served raw off github's CDN — no auth needed, ~5 min cache lag
 * is acceptable for display and soft UI gating (the workflow is the enforcer).
 */
import { forumConfig } from '$lib/config';
import type { RepLedger } from './engine';

/** Fetch the ledger; null when missing or unreachable (feature degrades softly). */
export async function fetchLedger(): Promise<RepLedger | null> {
	const { owner, name } = forumConfig.repo;
	const url = `https://raw.githubusercontent.com/${owner}/${name}/${forumConfig.rep.dataBranch}/rep.json`;
	try {
		const res = await fetch(url, { cache: 'no-cache' });
		if (!res.ok) return null;
		return (await res.json()) as RepLedger;
	} catch {
		return null;
	}
}
