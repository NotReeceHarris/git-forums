import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { excerpt, formatDate, timeAgo } from '$lib/utils';

describe('timeAgo', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-19T12:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	const at = (secondsAgo: number) =>
		new Date(Date.now() - secondsAgo * 1000).toISOString();

	it('returns "just now" for under a minute', () => {
		expect(timeAgo(at(5))).toBe('just now');
		expect(timeAgo(at(59))).toBe('just now');
	});

	it('formats minutes, hours, days, weeks, months and years', () => {
		expect(timeAgo(at(60))).toBe('1m ago');
		expect(timeAgo(at(60 * 59))).toBe('59m ago');
		expect(timeAgo(at(3600 * 3))).toBe('3h ago');
		expect(timeAgo(at(86400 * 2))).toBe('2d ago');
		expect(timeAgo(at(86400 * 7))).toBe('1w ago');
		expect(timeAgo(at(86400 * 40))).toBe('1mo ago');
		expect(timeAgo(at(86400 * 800))).toBe('2y ago');
	});

	it('treats future timestamps as "just now"', () => {
		expect(timeAgo(at(-100))).toBe('just now');
	});
});

describe('formatDate', () => {
	it('renders a locale date containing the year', () => {
		expect(formatDate('2026-01-15T00:00:00Z')).toContain('2026');
	});
});

describe('excerpt', () => {
	it('strips HTML comments (the article marker)', () => {
		expect(excerpt('<!-- gf:article -->\n\nHello world')).toBe('Hello world');
	});

	it('strips fenced code blocks', () => {
		expect(excerpt('before\n```js\nconst x = 1;\n```\nafter')).toBe('before after');
	});

	it('drops images but keeps link text', () => {
		expect(excerpt('![alt](http://x/y.png) see [the docs](http://x)')).toBe('see the docs');
	});

	it('removes markdown formatting characters', () => {
		expect(excerpt('# Title\n> quote *bold* `code`')).toBe('Title quote bold code');
	});

	it('truncates long text with an ellipsis', () => {
		const out = excerpt('word '.repeat(100), 20);
		expect(out.length).toBeLessThanOrEqual(21);
		expect(out.endsWith('…')).toBe(true);
	});

	it('returns short text unchanged', () => {
		expect(excerpt('short text')).toBe('short text');
	});
});
