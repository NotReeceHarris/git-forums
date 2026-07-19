<script lang="ts">
	import type { DiscussionListItem } from '$lib/github/types';
	import DiscussionRow from './DiscussionRow.svelte';

	let {
		discussions,
		showCategory = true
	}: { discussions: DiscussionListItem[]; showCategory?: boolean } = $props();
</script>

{#if discussions.length > 0}
	<section class="mb-6">
		<h2 class="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-fd-muted-foreground uppercase">
			<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
			</svg>
			Pinned
		</h2>
		<div class="flex flex-col gap-3">
			{#each discussions as discussion (discussion.id)}
				<DiscussionRow {discussion} {showCategory} />
			{/each}
		</div>
	</section>
{/if}
