import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		svelte({
			compilerOptions: { runes: true }
		})
	],
	define: {
		__GF_REPOSITORY__: JSON.stringify('')
	},
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, 'src/lib')
		},
		// prevent duplicate svelte runtime copies in tests
		conditions: ['browser']
	},
	test: {
		environment: 'jsdom',
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			// Logic modules only — .svelte component markup is exercised via the
			// production build + browser verification, not unit tests.
			include: ['src/lib/**/*.ts', 'oauth-proxy/worker.js'],
			exclude: ['src/lib/github/types.ts', 'src/lib/index.ts'],
			// cobertura feeds GitHub's code-coverage merge protection (uploaded in CI)
			reporter: ['text', 'html', 'json-summary', 'cobertura'],
			thresholds: {
				statements: 100,
				branches: 100,
				functions: 100,
				lines: 100
			}
		}
	}
});
