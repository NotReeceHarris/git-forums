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
		/** GitHub logins of forum admins — they get a badge next to their name */
		logins: string[];
		/** Badge text shown next to admin usernames */
		badgeLabel: string;
	};
	/**
	 * Custom badges shown next to usernames, keyed by badge label:
	 *   badges: { 'Moderator': ['alice'], 'Contributor': ['bob', 'carol'] }
	 * A user can hold any number of badges (in addition to the admin badge).
	 */
	badges: Record<string, string[]>;
	content: {
		/** Discussions fetched per page */
		pageSize: number;
		/** List ordering */
		sort: 'CREATED_AT' | 'UPDATED_AT';
		/**
		 * Show a two-line body excerpt on list rows. Disabling this (together
		 * with `articles.enabled`) lets list queries skip fetching post bodies
		 * entirely, which drastically shrinks payloads on busy forums.
		 */
		listExcerpts: boolean;
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
			/**
			 * Category slugs that only repository maintainers can post in
			 * (GitHub's "announcement" format categories). The API doesn't expose
			 * a category's format, so list them here; the forum then checks the
			 * viewer's repository permission (write/maintain/admin) before showing
			 * posting UI for them. GitHub enforces this server-side regardless.
			 */
			restricted: string[];
		};
	};
	features: {
		search: boolean;
		reactions: boolean;
		upvotes: boolean;
	};
	/**
	 * Optional reputation system: users earn rep for forum activity, and topics
	 * can require a minimum rep to post. The UI gates topics client-side; the
	 * `rep.yml` GitHub Actions workflow maintains the ledger and enforces the
	 * same rules against posts made directly on github.com (reactively — GitHub
	 * has no pre-post hook, so violating posts exist briefly before the
	 * workflow acts on them).
	 */
	rep: {
		/** Master switch — everything below is inert when false */
		enabled: boolean;
		/** Rep awarded per action */
		gains: {
			post: number;
			comment: number;
			/** Granted by others, so it's weighted higher and never capped */
			answerAccepted: number;
		};
		/**
		 * Anti-farming: max rep a user can earn per UTC day from each action
		 * type (0 = uncapped). Accepted answers are never capped.
		 */
		dailyCaps: { post: number; comment: number };
		/** Category slug → minimum rep required to post there */
		topics: Record<string, number>;
		/** What the enforcement workflow does with an under-rep post */
		onViolation: 'move' | 'lock' | 'delete';
		/** Category slug posts are moved to when `onViolation` is 'move' */
		fallbackTopic: string;
		/** Users with push access (and config admins) bypass rep gates */
		exemptMaintainers: boolean;
		/** Data branch holding the Actions-maintained `profiles/` rep files */
		dataBranch: string;
	};
	/**
	 * Optional cold-store archive: the data-sync workflow snapshots every
	 * discussion (rendered HTML + comments) to the data branch, and signed-out
	 * visitors browse that snapshot read-only instead of hitting the GitHub
	 * API (which requires auth). Public repositories only — the raw file URLs
	 * the SPA reads are not accessible anonymously on private repos.
	 */
	archive: {
		/** Master switch for the archive and the anonymous read-only mode */
		enabled: boolean;
		/** Branch holding the archived `posts/` and `meta.json` (orphan, machine-written) */
		dataBranch: string;
	};
	cache: {
		/**
		 * Stale-while-revalidate caching of GraphQL responses in localStorage:
		 * pages render instantly from the last known data while a background
		 * request revalidates and updates them.
		 */
		enabled: boolean;
		/** Hard expiry — entries older than this are never served (seconds) */
		ttlSeconds: number;
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
		name: 'Discussion Kit',
		description: 'A community forum powered by GitHub Discussions',
		logo: '',
		footer: ''
	},
	repo: {
		owner: '',
		name: ''
	},
	nav: [],
	auth: {
		allowToken: true,
		oauth: { clientId: '', proxyUrl: '' }
	},
	admins: {
		logins: [],
		badgeLabel: 'ADMIN'
	},
	badges: {},
	content: {
		pageSize: 25,
		sort: 'CREATED_AT',
		listExcerpts: true,
		articles: {
			enabled: true,
			marker: '<!-- dk:article -->'
		},
		topics: { include: [], exclude: [], restricted: [] }
	},
	features: {
		search: true,
		reactions: true,
		upvotes: true
	},
	rep: {
		enabled: false,
		gains: { post: 5, comment: 2, answerAccepted: 15 },
		dailyCaps: { post: 25, comment: 10 },
		topics: {},
		onViolation: 'move',
		fallbackTopic: '',
		exemptMaintainers: true,
		dataBranch: 'data'
	},
	archive: {
		enabled: false,
		dataBranch: 'data'
	},
	cache: {
		enabled: true,
		ttlSeconds: 3600
	},
	theme: { light: {}, dark: {} }
};

export function mergeConfig(user: UserForumConfig): ForumConfig {
	// deep-clone so the resolved config never shares (or mutates) the defaults
	const result = structuredClone(defaultConfig) as unknown as Record<string, unknown>;
	const apply = (target: Record<string, unknown>, over: Record<string, unknown>) => {
		for (const [key, value] of Object.entries(over)) {
			if (value === undefined) continue;
			const current = target[key];
			if (
				value !== null &&
				typeof value === 'object' &&
				!Array.isArray(value) &&
				current !== null &&
				typeof current === 'object' &&
				!Array.isArray(current)
			) {
				apply(current as Record<string, unknown>, value as Record<string, unknown>);
			} else {
				target[key] = structuredClone(value);
			}
		}
	};
	apply(result, user);
	return result as unknown as ForumConfig;
}

/**
 * Fill in repo.owner/name from a "owner/name" string (the GITHUB_REPOSITORY
 * value injected at build time) when the config leaves them empty.
 */
export function applyRepoFallback(config: ForumConfig, repository: string): void {
	if (config.repo.owner && config.repo.name) return;
	const [owner, name] = repository.split('/');
	if (owner && name) {
		config.repo.owner ||= owner;
		config.repo.name ||= name;
	}
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
