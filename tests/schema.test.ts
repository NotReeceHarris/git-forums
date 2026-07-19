import { describe, expect, it } from 'vitest';
import {
	applyRepoFallback,
	buildThemeCss,
	defaultConfig,
	defineForumConfig,
	mergeConfig
} from '$lib/config/schema';

describe('defineForumConfig', () => {
	it('returns the config unchanged (identity helper)', () => {
		const cfg = { site: { name: 'X' } };
		expect(defineForumConfig(cfg)).toBe(cfg);
	});
});

describe('mergeConfig', () => {
	it('returns defaults for an empty user config', () => {
		expect(mergeConfig({})).toEqual(defaultConfig);
	});

	it('deep-merges nested sections without dropping sibling defaults', () => {
		const merged = mergeConfig({ site: { name: 'Acme' } });
		expect(merged.site.name).toBe('Acme');
		expect(merged.site.description).toBe(defaultConfig.site.description);
		expect(merged.features.search).toBe(true);
	});

	it('merges deeply nested objects (content.articles)', () => {
		const merged = mergeConfig({ content: { articles: { enabled: false } } });
		expect(merged.content.articles.enabled).toBe(false);
		expect(merged.content.articles.marker).toBe(defaultConfig.content.articles.marker);
		expect(merged.content.pageSize).toBe(defaultConfig.content.pageSize);
	});

	it('replaces arrays wholesale instead of merging them', () => {
		const merged = mergeConfig({ admins: { logins: ['alice'] } });
		expect(merged.admins.logins).toEqual(['alice']);
		expect(merged.admins.badgeLabel).toBe('ADMIN');
	});

	it('ignores undefined values', () => {
		const merged = mergeConfig({ site: { name: undefined } });
		expect(merged.site.name).toBe(defaultConfig.site.name);
	});

	it('does not mutate the defaults', () => {
		mergeConfig({ site: { name: 'Mutant' } });
		expect(defaultConfig.site.name).toBe('Discussion Kit');
	});
});

describe('applyRepoFallback', () => {
	it('fills empty owner/name from "owner/name"', () => {
		const cfg = mergeConfig({});
		applyRepoFallback(cfg, 'octocat/hello');
		expect(cfg.repo).toEqual({ owner: 'octocat', name: 'hello' });
	});

	it('keeps explicitly configured values', () => {
		const cfg = mergeConfig({ repo: { owner: 'me', name: 'mine' } });
		applyRepoFallback(cfg, 'octocat/hello');
		expect(cfg.repo).toEqual({ owner: 'me', name: 'mine' });
	});

	it('fills only the missing half', () => {
		const cfg = mergeConfig({ repo: { owner: 'me' } });
		applyRepoFallback(cfg, 'octocat/hello');
		expect(cfg.repo).toEqual({ owner: 'me', name: 'hello' });
	});

	it('does nothing for a malformed repository string', () => {
		const cfg = mergeConfig({});
		applyRepoFallback(cfg, 'not-a-repo');
		expect(cfg.repo).toEqual({ owner: '', name: '' });
		applyRepoFallback(cfg, '');
		expect(cfg.repo).toEqual({ owner: '', name: '' });
	});
});

describe('buildThemeCss', () => {
	it('returns an empty string when nothing is overridden', () => {
		expect(buildThemeCss({ light: {}, dark: {} })).toBe('');
	});

	it('compiles light overrides into :root', () => {
		expect(buildThemeCss({ light: { primary: 'red' }, dark: {} })).toBe(
			':root{--fd-primary:red;}'
		);
	});

	it('compiles dark overrides into .dark', () => {
		expect(buildThemeCss({ light: {}, dark: { background: '#000' } })).toBe(
			'.dark{--fd-background:#000;}'
		);
	});

	it('compiles both schemes and maps camelCase tokens to CSS vars', () => {
		const css = buildThemeCss({
			light: { mutedForeground: 'gray', link: 'blue' },
			dark: { primaryForeground: 'white' }
		});
		expect(css).toBe(
			':root{--fd-muted-foreground:gray;--fd-link:blue;}.dark{--fd-primary-foreground:white;}'
		);
	});
});
