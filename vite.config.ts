import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	define: {
		// Lets forum.config.ts auto-detect the repo when building in GitHub Actions
		__GF_REPOSITORY__: JSON.stringify(process.env.GITHUB_REPOSITORY ?? '')
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static SPA build for GitHub Pages: every non-prerendered URL is
			// served by the 404.html fallback, which boots the client router.
			adapter: adapter({
				fallback: '404.html'
			}),

			paths: {
				// Set BASE_PATH=/repo-name when deploying to <user>.github.io/<repo-name>
				base: (process.env.BASE_PATH as `/${string}` | undefined) || ''
			}
		})
	]
});
