import { describe, expect, it } from 'vitest';
import { configIncomplete, forumConfig, themeCss } from '$lib/config';

// Exercises the real resolution pipeline: root forum.config.ts merged over
// defaults, repo fallback applied, theme compiled.
describe('resolved config', () => {
	it('merges the root forum.config.ts over defaults', () => {
		expect(forumConfig.repo.owner).toBe('NotReeceHarris');
		expect(forumConfig.repo.name).toBe('discussion-kit');
		expect(forumConfig.site.name).toBe('Discussion Kit');
		// default that forum.config.ts does not override
		expect(forumConfig.content.articles.marker).toBe('<!-- gf:article -->');
	});

	it('is not incomplete when a repo is configured', () => {
		expect(configIncomplete).toBe(false);
	});

	it('compiles theme overrides (none in the shipped config)', () => {
		expect(themeCss).toBe('');
	});
});
