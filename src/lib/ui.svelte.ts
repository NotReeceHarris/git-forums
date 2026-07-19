import { forumConfig } from './config';
import { getCategories, getViewerPermission } from './github/api';
import type { Category, RepositoryPermission } from './github/types';

/** Small cross-component UI state */
export const ui = $state({
	signInOpen: false,
	categories: [] as Category[],
	categoriesLoaded: false,
	viewerPermission: 'READ' as RepositoryPermission
});

/** Requires a signed-in user (GraphQL). Safe to call repeatedly. */
export async function loadCategories() {
	if (ui.categoriesLoaded) return;
	ui.categories = await getCategories();
	ui.viewerPermission = await getViewerPermission();
	ui.categoriesLoaded = true;
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

/**
 * Whether the signed-in user may create a discussion in this category.
 * Restricted (announcement-format) categories require maintainer access;
 * GitHub enforces the same rule server-side.
 */
export function canPostIn(category: Pick<Category, 'slug'>): boolean {
	return !forumConfig.content.topics.restricted.includes(category.slug) || isMaintainer();
}

/** Categories the signed-in user may post in */
export function postableCategories(): Category[] {
	return ui.categories.filter(canPostIn);
}

export function toggleTheme() {
	const dark = document.documentElement.classList.toggle('dark');
	localStorage.setItem('gf:theme', dark ? 'dark' : 'light');
}
