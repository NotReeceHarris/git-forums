/**
 * Forum configuration schema, defaults, and helpers.
 *
 * User-facing configuration lives in `forum.config.ts` at the project root —
 * everything there is optional and deep-merged over the defaults below.
 */

/** CSS theme tokens that can be overridden per colour scheme */
export type ThemeToken =
	| 'background'
	| 'foreground'
	| 'muted'
	| 'mutedForeground'
	| 'card'
	| 'cardForeground'
	| 'border'
	| 'primary'
	| 'primaryForeground'
	| 'accent'
	| 'accentForeground'
	| 'ring'
	| 'link';

export type ThemeOverrides = Partial<Record<ThemeToken, string>>;

export interface NavLink {
	label: string;
	href: string;
	/** Opens in a new tab */
	external?: boolean;
}

export interface ForumConfig {
	site: {
		/** Forum name, shown in the header and page titles */
		name: string;
		/** Short tagline shown on the home page */
		description: string;
		/** Optional emoji used as the header logo instead of the default icon */
		logo: string;
		/** Optional footer line (supports no markup, plain text) */
		footer: string;
	};
	repo: {
		/**
		 * GitHub repository whose Discussions power the forum.
		 * Leave both empty to auto-detect from the GitHub Actions build
		 * environment (GITHUB_REPOSITORY) — forks then need no code changes.
		 */
		owner: string;
		name: string;
		/** Branch that admins.json is fetched from */
		branch: string;
	};
	/** Extra links shown in the header next to the logo */
	nav: NavLink[];
	auth: {
		/** Allow sign-in by pasting a fine-grained personal access token */
		allowToken: boolean;
		/**
		 * "Sign in with GitHub" OAuth web flow. Requires a tiny token-exchange
		 * proxy (see README) because GitHub blocks browser CORS on the token
		 * endpoint. The proxy receives POST { code } → { access_token }.
		 */
		oauth: {
			clientId: string;
			proxyUrl: string;
		};
	};
	admins: {
		/**
		 * Path (in the repo, on `repo.branch`) of a JSON file listing admins:
		 * { "admins": ["login", ...] }. Set to '' to disable fetching.
		 */
		source: string;
		/** Additional admin logins declared inline */
		logins: string[];
		/** Badge text shown next to admin usernames */
		badgeLabel: string;
	};
	content: {
		/** Discussions fetched per page */
		pageSize: number;
		/** List ordering */
		sort: 'CREATED_AT' | 'UPDATED_AT';
		articles: {
			/** Enable the long-form "article" post type */
			enabled: boolean;
			/** Hidden marker prepended to article bodies */
			marker: string;
		};
		topics: {
			/** Only show these category slugs (empty = all) */
			include: string[];
			/** Hide these category slugs */
			exclude: string[];
		};
	};
	features: {
		search: boolean;
		reactions: boolean;
		upvotes: boolean;
	};
	theme: {
		light: ThemeOverrides;
		dark: ThemeOverrides;
	};
}

/** Everything optional, one level deep per section */
export type UserForumConfig = {
	[K in keyof ForumConfig]?: ForumConfig[K] extends object ? DeepPartial<ForumConfig[K]> : ForumConfig[K];
};

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Identity helper so user config files get full type hints */
export function defineForumConfig(config: UserForumConfig): UserForumConfig {
	return config;
}

export const defaultConfig: ForumConfig = {
	site: {
		name: 'Git Forums',
		description: 'A community forum powered by GitHub Discussions',
		logo: '',
		footer: ''
	},
	repo: {
		owner: '',
		name: '',
		branch: 'main'
	},
	nav: [],
	auth: {
		allowToken: true,
		oauth: { clientId: '', proxyUrl: '' }
	},
	admins: {
		source: 'meta/admins.json',
		logins: [],
		badgeLabel: 'ADMIN'
	},
	content: {
		pageSize: 25,
		sort: 'CREATED_AT',
		articles: {
			enabled: true,
			marker: '<!-- gf:article -->'
		},
		topics: { include: [], exclude: [] }
	},
	features: {
		search: true,
		reactions: true,
		upvotes: true
	},
	theme: { light: {}, dark: {} }
};

export function mergeConfig(user: UserForumConfig): ForumConfig {
	const merge = <T extends Record<string, unknown>>(base: T, over?: Record<string, unknown>): T => {
		if (!over) return base;
		const out = { ...base } as Record<string, unknown>;
		for (const [key, value] of Object.entries(over)) {
			if (value === undefined) continue;
			const current = out[key];
			if (
				value !== null &&
				typeof value === 'object' &&
				!Array.isArray(value) &&
				current !== null &&
				typeof current === 'object' &&
				!Array.isArray(current)
			) {
				out[key] = merge(current as Record<string, unknown>, value as Record<string, unknown>);
			} else {
				out[key] = value;
			}
		}
		return out as T;
	};
	return merge(defaultConfig as unknown as Record<string, unknown>, user) as unknown as ForumConfig;
}

const TOKEN_TO_VAR: Record<ThemeToken, string> = {
	background: '--fd-background',
	foreground: '--fd-foreground',
	muted: '--fd-muted',
	mutedForeground: '--fd-muted-foreground',
	card: '--fd-card',
	cardForeground: '--fd-card-foreground',
	border: '--fd-border',
	primary: '--fd-primary',
	primaryForeground: '--fd-primary-foreground',
	accent: '--fd-accent',
	accentForeground: '--fd-accent-foreground',
	ring: '--fd-ring',
	link: '--fd-link'
};

/** Compile theme overrides into a CSS string ('' when nothing is overridden) */
export function buildThemeCss(theme: ForumConfig['theme']): string {
	const rules = (overrides: ThemeOverrides) =>
		Object.entries(overrides)
			.map(([token, value]) => `${TOKEN_TO_VAR[token as ThemeToken]}:${value};`)
			.join('');
	const light = rules(theme.light);
	const dark = rules(theme.dark);
	let css = '';
	if (light) css += `:root{${light}}`;
	if (dark) css += `.dark{${dark}}`;
	return css;
}
