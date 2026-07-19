<script lang="ts">
	import { page } from '$app/state';
	import DiscussionRow from '$lib/components/DiscussionRow.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import SignInPrompt from '$lib/components/SignInPrompt.svelte';
	import { forumConfig } from '$lib/config';
	import { searchDiscussions } from '$lib/github/api';
	import { auth } from '$lib/github/auth.svelte';
	import type { SearchResult } from '$lib/github/types';

	let result = $state<SearchResult | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const query = $derived(page.url.searchParams.get('q') ?? '');

	let lastQuery: string | null = null;
	$effect(() => {
		if (auth.signedIn && query && query !== lastQuery) {
			lastQuery = query;
			run(query);
		}
	});

	async function run(q: string) {
		loading = true;
		error = null;
		try {
			result = await searchDiscussions(q);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Search failed.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Search — {forumConfig.site.name}</title>
</svelte:head>

{#if auth.loading}
	<Loading />
{:else if !auth.signedIn}
	<SignInPrompt />
{:else}
	<h1 class="mb-1 text-2xl font-bold tracking-tight">Search</h1>
	{#if query}
		<p class="mb-6 text-sm text-fd-muted-foreground">
			{#if result}{result.discussionCount} result{result.discussionCount === 1 ? '' : 's'} for{:else}Searching for{/if}
			<span class="font-medium text-fd-foreground">“{query}”</span>
		</p>
	{:else}
		<p class="mb-6 text-sm text-fd-muted-foreground">
			Type a query in the search box above to find discussions.
		</p>
	{/if}

	{#if loading}
		<Loading />
	{:else if error}
		<p class="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">{error}</p>
	{:else if result && result.nodes.length === 0}
		<div class="rounded-2xl border border-dashed border-fd-border py-16 text-center">
			<p class="font-medium">No results</p>
			<p class="mt-1 text-sm text-fd-muted-foreground">Try a different search term.</p>
		</div>
	{:else if result}
		<div class="flex flex-col gap-3">
			{#each result.nodes as discussion (discussion.id)}
				<DiscussionRow {discussion} />
			{/each}
		</div>
	{/if}
{/if}
