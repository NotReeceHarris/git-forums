import { getAdmins, getCategories } from './github/api';
import type { Category } from './github/types';

/** Small cross-component UI state */
export const ui = $state({
	signInOpen: false,
	admins: [] as string[],
	categories: [] as Category[],
	categoriesLoaded: false
});

export async function loadAdmins() {
	ui.admins = await getAdmins();
}

/** Requires a signed-in user (GraphQL). Safe to call repeatedly. */
export async function loadCategories() {
	if (ui.categoriesLoaded) return;
	ui.categories = await getCategories();
	ui.categoriesLoaded = true;
}

export function isAdmin(login: string | undefined | null): boolean {
	return !!login && ui.admins.includes(login);
}

export function toggleTheme() {
	const dark = document.documentElement.classList.toggle('dark');
	localStorage.setItem('gf:theme', dark ? 'dark' : 'light');
}
