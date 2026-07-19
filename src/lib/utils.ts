/** "3h ago" style relative timestamps */
export function timeAgo(iso: string): string {
	const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	if (seconds < 60) return 'just now';
	const units: [number, string][] = [
		[60 * 60 * 24 * 365, 'y'],
		[60 * 60 * 24 * 30, 'mo'],
		[60 * 60 * 24 * 7, 'w'],
		[60 * 60 * 24, 'd'],
		[60 * 60, 'h']
	];
	for (const [size, label] of units) {
		if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`;
	}
	return `${Math.floor(seconds / 60)}m ago`;
}

export function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/** Rough plain-text excerpt from raw markdown for list previews */
export function excerpt(markdown: string, length = 160): string {
	const text = markdown
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/```[\s\S]*?```/g, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[#>*_`~|-]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}
