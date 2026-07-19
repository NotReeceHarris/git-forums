<script lang="ts">
	import { resolve } from '$app/paths';
	import DiscussionRow from '$lib/components/DiscussionRow.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import SignInPrompt from '$lib/components/SignInPrompt.svelte';
	import { forumConfig } from '$lib/config';
	import { listDiscussions } from '$lib/github/api';
	import { auth } from '$lib/github/auth.svelte';
	import type { DiscussionListItem, PageInfo } from '$lib/github/types';
	import { ui } from '$lib/ui.svelte';

	let discussions = $state<DiscussionListItem[]>([]);
	let pageInfo = $state<PageInfo | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);

	let started = false;
	$effect(() => {
		if (auth.signedIn && !started) {
			started = true;
			load();
		}
	});

	async function load() {
		loading = true;
		error = null;
		try {
			const page = await listDiscussions({});
			discussions = page.nodes;
			pageInfo = page.pageInfo;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load discussions.';
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		if (!pageInfo?.hasNextPage) return;
		loadingMore = true;
		try {
			const page = await listDiscussions({ after: pageInfo.endCursor });
			discussions = [...discussions, ...page.nodes];
			pageInfo = page.pageInfo;
		} finally {
			loadingMore = false;
		}
	}
</script>

<svelte:head>
	<title>{forumConfig.site.name} — Home</title>
</svelte:head>

{#if auth.loading}
	<Loading />
{:else if !auth.signedIn}
	<div class="mx-auto max-w-2xl pt-10">
		<h1 class="mb-2 text-center text-3xl font-bold tracking-tight">{forumConfig.site.name}</h1>
		<p class="mb-8 text-center text-fd-muted-foreground">{forumConfig.site.description}</p>
		<SignInPrompt />
	</div>
{:else}
	<div class="mb-6">
		<h1 class="text-2xl font-bold tracking-tight">Latest discussions</h1>
		<p class="mt-1 text-sm text-fd-muted-foreground">{forumConfig.site.description}</p>
	</div>

	{#if ui.categories.length > 0}
		<div class="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each ui.categories as category (category.id)}
				<a
					href={resolve('/t/[slug]', { slug: category.slug })}
					class="rounded-xl border border-fd-border bg-fd-card p-4 transition-colors hover:border-fd-ring/50 hover:bg-fd-accent/40"
				>
					<div class="flex items-center gap-2">
						<span class="text-lg leading-none">{@html category.emojiHTML}</span>
						<h2 class="font-medium">{category.name}</h2>
					</div>
					{#if category.description}
						<p class="mt-1.5 line-clamp-2 text-sm text-fd-muted-foreground">
							{category.description}
						</p>
					{/if}
				</a>
			{/each}
		</div>
	{/if}

	{#if loading}
		<Loading />
	{:else if error}
		<p class="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">{error}</p>
	{:else if discussions.length === 0}
		<div class="rounded-2xl border border-dashed border-fd-border py-16 text-center">
			<p class="font-medium">No discussions yet</p>
			<p class="mt-1 text-sm text-fd-muted-foreground">Be the first to start one.</p>
			<a
				href={resolve('/new')}
				class="mt-4 inline-flex rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground hover:opacity-90"
			>
				New post
			</a>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each discussions as discussion (discussion.id)}
				<DiscussionRow {discussion} />
			{/each}
		</div>
		{#if pageInfo?.hasNextPage}
			<div class="mt-6 flex justify-center">
				<button
					type="button"
					onclick={loadMore}
					disabled={loadingMore}
					class="rounded-lg border border-fd-border px-4 py-2 text-sm font-medium hover:bg-fd-accent disabled:opacity-50"
				>
					{loadingMore ? 'Loading…' : 'Load more'}
				</button>
			</div>
		{/if}
	{/if}
{/if}
