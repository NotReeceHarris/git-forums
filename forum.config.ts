import { defineForumConfig } from './src/lib/config/schema';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Git Forums configuration
 * ─────────────────────────────────────────────────────────────────────────────
 *  Every option is optional — anything you omit falls back to a sensible
 *  default (see src/lib/config/schema.ts for the full schema and defaults).
 *
 *  Quick start for your own forum:
 *    1. Enable Discussions on your repository and create some categories.
 *    2. Set `site` to your branding.
 *    3. Either set `repo.owner` / `repo.name`, or delete them — when built by
 *       the included GitHub Actions workflow they are auto-detected, so a fork
 *       can deploy without touching any code.
 *    4. Optionally list admins in meta/admins.json (or inline below).
 */
export default defineForumConfig({
	site: {
		name: 'Git Forums',
		description: 'A community forum powered by GitHub Discussions',
		// logo: '💬',                        // emoji shown instead of the default icon
		footer: 'Powered by GitHub Discussions'
	},

	repo: {
		// Omit owner/name to auto-detect when building in GitHub Actions.
		owner: 'NotReeceHarris',
		name: 'git-forums',
		branch: 'main'
	},

	// Extra header links
	nav: [
		// { label: 'Docs', href: 'https://example.com/docs', external: true }
	],

	auth: {
		allowToken: true,
		oauth: {
			// Fill both to enable the "Continue with GitHub" button (see README):
			clientId: 'Ov23li1QctsLGHqbcIwq',
			proxyUrl: 'https://git-forums-oauth.reeceharris.workers.dev'
		}
	},

	admins: {
		source: 'meta/admins.json', // fetched from the repo at runtime; '' disables
		logins: [],                 // extra inline admins
		badgeLabel: 'ADMIN'
	},

	content: {
		pageSize: 25,
		sort: 'CREATED_AT',         // or 'UPDATED_AT'
		articles: { enabled: true },
		topics: {
			include: [],              // only these category slugs (empty = all)
			exclude: []               // hide these category slugs
		}
	},

	features: {
		search: true,
		reactions: true,
		upvotes: true
	},

	// Override any CSS token per scheme, e.g. a blue primary:
	theme: {
		light: {
			// primary: 'hsl(221 83% 53%)',
			// primaryForeground: 'hsl(0 0% 100%)'
		},
		dark: {
			// primary: 'hsl(217 91% 60%)'
		}
	}
});
