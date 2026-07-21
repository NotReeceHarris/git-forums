import { fetchArchiveIndex, fetchArchiveMeta } from './archive/client';
import { swr } from './cache';
import { forumConfig } from './config';
import { getOverview } from './github/api';
import { auth } from './github/auth.svelte';
import type {
	Category,
	DiscussionListItem,
	DiscussionPage,
	RepositoryPermission
} from './github/types';
import { repOf, requiredRep, type RepLedger } from './rep/engine';
import { fetchLedger } from './rep/ledger';

/** Small cross-component UI state */
export const ui = $state({
	signInOpen: false,
	categories: [] as Category[],
	categoriesLoaded: false,
	viewerPermission: 'READ' as RepositoryPermission,
	/** First page of the all-topics feed, shared by layout bootstrap and home */
	home: null as DiscussionPage | null,
	/** Discussions pinned on github.com, shown above regular lists */
	pinned: [] as DiscussionListItem[],
	/** Actions-maintained rep ledger (null until loaded / when unavailable) */
	repLedger: null as RepLedger | null,
	repLoaded: false,
	/**
	 * The overview was booted from the read-only archive (signed-out visitor).
	 * Signing in re-runs the bootstrap against the live API.
	 */
	bootedFromArchive: false
});

/**
 * Read-only archive mode: the visitor is signed out and the forum has a
 * cold-store archive to serve instead of the (auth-only) GitHub API.
 */
export function archiveMode(): boolean {
	return forumConfig.archive.enabled && !auth.signedIn;
}

/** Config include/exclude filtering, mirroring the API bootstrap */
function visibleSlug(slug: string): boolean {
	const { include, exclude } = forumConfig.content.topics;
	return (include.length === 0 || include.includes(slug)) && !exclude.includes(slug);
}

/**
 * Boot the forum in one GraphQL round-trip: categories, viewer permission and
 * the home feed. Safe to call repeatedly — the layout and the home page both
 * call it, sharing a single in-flight request; later calls revalidate.
 *
 * Signed-out visitors with the archive enabled boot from the archived
 * snapshot instead — same shapes, no auth, read-only.
 */
export async function loadOverview() {
	if (archiveMode()) {
		const [meta, index] = await Promise.all([fetchArchiveMeta(), fetchArchiveIndex()]);
		// no archive yet (workflow hasn't run) — leave the sign-in prompt up
		if (!meta || !index) return;
		ui.categories = meta.categories.filter((c) => visibleSlug(c.slug));
		ui.viewerPermission = 'READ';
		const nodes = index.discussions.filter((d) => visibleSlug(d.category.slug));
		ui.home = {
			totalCount: nodes.length,
			pageInfo: { endCursor: null, hasNextPage: false },
			nodes
		};
		ui.pinned = meta.pinned.filter((d) => visibleSlug(d.category.slug));
		ui.categoriesLoaded = true;
		ui.bootedFromArchive = true;
		return;
	}
	const revalidate = ui.categoriesLoaded && !ui.bootedFromArchive;
	await swr('overview', () => getOverview({ fresh: revalidate }), (data) => {
		ui.categories = data.categories;
		ui.viewerPermission = data.viewerPermission;
		ui.home = data.discussions;
		ui.pinned = data.pinned;
		ui.categoriesLoaded = true;
		ui.bootedFromArchive = false;
	});
}

export function isAdmin(login: string | undefined | null): boolean {
	return !!login && forumConfig.admins.logins.includes(login);
}

/** Custom badge labels held by this user (config `badges`) */
export function badgesFor(login: string): string[] {
	return Object.entries(forumConfig.badges)
		.filter(([, logins]) => logins.includes(login))
		.map(([label]) => label);
}

/** Whether the signed-in user has push access to the forum repository */
export function isMaintainer(): boolean {
	return ['WRITE', 'MAINTAIN', 'ADMIN'].includes(ui.viewerPermission);
}

/** Load the rep ledger once per session (no-op when the feature is off). */
export async function loadRep(): Promise<void> {
	if (!forumConfig.rep.enabled || ui.repLoaded) return;
	ui.repLoaded = true;
	ui.repLedger = await fetchLedger();
}

/**
 * A user's rep for display; null only when the feature is off. Before the
 * ledger loads (or exists) everyone reads 0, so rep is visible immediately
 * after enabling the feature.
 */
export function repFor(login: string | null | undefined): number | null {
	if (!forumConfig.rep.enabled) return null;
	return repOf(ui.repLedger, login);
}

/** Minimum rep required to post in a topic (0 = ungated) */
export function repRequirement(slug: string): number {
	return requiredRep(forumConfig.rep, slug);
}

/** Whether the signed-in user bypasses rep gates (maintainer/config admin) */
function repExempt(): boolean {
	return (
		(forumConfig.rep.exemptMaintainers && isMaintainer()) || isAdmin(auth.viewer?.login)
	);
}

/**
 * Whether the signed-in user may create a discussion in this category.
 * Restricted (announcement-format) categories require maintainer access;
 * GitHub enforces the same rule server-side. Rep-gated topics additionally
 * require the configured minimum rep — enforced reactively by the rep
 * workflow, so this gate fails open while the ledger hasn't loaded.
 */
export function canPostIn(category: Pick<Category, 'slug'>): boolean {
	if (forumConfig.content.topics.restricted.includes(category.slug) && !isMaintainer()) {
		return false;
	}
	const need = repRequirement(category.slug);
	if (need > 0 && !repExempt() && ui.repLedger) {
		return repOf(ui.repLedger, auth.viewer?.login) >= need;
	}
	return true;
}

/** Categories the signed-in user may post in */
export function postableCategories(): Category[] {
	return ui.categories.filter(canPostIn);
}

export function toggleTheme() {
	const dark = document.documentElement.classList.toggle('dark');
	localStorage.setItem('dk:theme', dark ? 'dark' : 'light');
}
