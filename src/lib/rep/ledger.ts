/**
 * SPA-side access to the rep index the data-sync workflow maintains on the
 * data branch (`profiles/index.json` — one compact login → rep map, so list
 * chips need a single fetch). Served raw off github's CDN — no auth needed,
 * ~5 min cache lag is acceptable for display and soft UI gating (the
 * workflow is the enforcer). Per-user detail lives in `profiles/<login>/
 * rep.json`, fetched via $lib/archive/client.
 */
import { forumConfig } from '$lib/config';
import type { RepLedger } from './engine';

/** Fetch the rep index; null when missing or unreachable (degrades softly). */
export async function fetchLedger(): Promise<RepLedger | null> {
	const { owner, name } = forumConfig.repo;
	const url = `https://raw.githubusercontent.com/${owner}/${name}/${forumConfig.rep.dataBranch}/profiles/index.json`;
	try {
		const res = await fetch(url, { cache: 'no-cache' });
		if (!res.ok) return null;
		return (await res.json()) as RepLedger;
	} catch {
		return null;
	}
}
