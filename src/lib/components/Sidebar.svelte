<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Category } from '$lib/github/types';

	let { categories }: { categories: Category[] } = $props();

	const current = $derived(page.params.slug);
</script>

<nav class="flex flex-col gap-0.5 text-sm" aria-label="Topics">
	<p class="mb-1 px-2 text-xs font-medium tracking-wide text-fd-muted-foreground uppercase">
		Topics
	</p>
	<a
		href={resolve('/')}
		class="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors {page.url.pathname.endsWith('/search') || current
			? 'text-fd-muted-foreground hover:bg-fd-accent/50 hover:text-fd-accent-foreground'
			: 'bg-fd-accent font-medium text-fd-accent-foreground'}"
	>
		<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
		All discussions
	</a>
	{#each categories as category (category.id)}
		<a
			href={resolve('/t/[slug]', { slug: category.slug })}
			title={category.description ?? category.name}
			class="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors {current === category.slug
				? 'bg-fd-accent font-medium text-fd-accent-foreground'
				: 'text-fd-muted-foreground hover:bg-fd-accent/50 hover:text-fd-accent-foreground'}"
		>
			<span class="w-4 shrink-0 text-center leading-none">{@html category.emojiHTML}</span>
			<span class="truncate">{category.name}</span>
		</a>
	{/each}
</nav>
