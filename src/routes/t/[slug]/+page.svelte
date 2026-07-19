<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { swr } from '$lib/cache';
	import DiscussionRow from '$lib/components/DiscussionRow.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import SignInPrompt from '$lib/components/SignInPrompt.svelte';
	import { forumConfig } from '$lib/config';
	import { isArticle, listDiscussions } from '$lib/github/api';
	import { auth } from '$lib/github/auth.svelte';
	import type { DiscussionListItem, PageInfo } from '$lib/github/types';
	import { canPostIn, ui } from '$lib/ui.svelte';

	const category = $derived(ui.categories.find((c) => c.slug === page.params.slug));

	let discussions = $state<DiscussionListItem[]>([]);
	let pageInfo = $state<PageInfo | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);
	let filter = $state<'all' | 'posts' | 'articles'>('all');

	const filtered = $derived(
		discussions.filter((d) =>
			filter === 'all' ? true : filter === 'articles' ? isArticle(d.body) : !isArticle(d.body)
		)
	);

	let loadedFor: string | null = null;
	$effect(() => {
		if (category && loadedFor !== category.id) {
			loadedFor = category.id;
			load(category.id);
		}
	});

	async function load(categoryId: string) {
		loading = true;
		error = null;
		discussions = [];
		filter = 'all';
		try {
			await swr(`discussions:cat:${categoryId}`, () => listDiscussions({ categoryId }), (result) => {
				discussions = result.nodes;
				pageInfo = result.pageInfo;
				loading = false;
			});
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load topic.';
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		if (!pageInfo?.hasNextPage || !category) return;
		loadingMore = true;
		try {
			const result = await listDiscussions({ categoryId: category.id, after: pageInfo.endCursor });
			discussions = [...discussions, ...result.nodes];
			pageInfo = result.pageInfo;
		} finally {
			loadingMore = false;
		}
	}

	const tabs = [
		{ id: 'all', label: 'All' },
		{ id: 'posts', label: 'Posts' },
		{ id: 'articles', label: 'Articles' }
	] as const;
</script>

<svelte:head>
	<title>{category ? `${category.name} — ${forumConfig.site.name}` : forumConfig.site.name}</title>
</svelte:head>

{#if auth.loading}
	<Loading />
{:else if !auth.signedIn}
	<SignInPrompt />
{:else if !ui.categoriesLoaded}
	<Loading />
{:else if !category}
	<div class="rounded-2xl border border-dashed border-fd-border py-16 text-center">
		<p class="font-medium">Topic not found</p>
		<a href={resolve('/')} class="mt-2 inline-block text-sm text-fd-link hover:underline">
			Back to all discussions
		</a>
	</div>
{:else}
	<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
				<span class="leading-none">{@html category.emojiHTML}</span>
				{category.name}
			</h1>
			{#if category.description}
				<p class="mt-1 text-sm text-fd-muted-foreground">{category.description}</p>
			{/if}
		</div>
		{#if canPostIn(category)}
			<a
				href="{resolve('/new')}?topic={category.slug}"
				class="inline-flex items-center gap-1.5 rounded-lg bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
			>
				<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
				New post
			</a>
		{:else}
			<span
				class="inline-flex items-center gap-1.5 rounded-lg border border-fd-border px-3 py-1.5 text-sm text-fd-muted-foreground"
				title="Only repository maintainers can post in this topic"
			>
				<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
				Maintainers only
			</span>
		{/if}
	</div>

	{#if forumConfig.content.articles.enabled}
	<div class="mb-4 flex gap-1 rounded-lg border border-fd-border bg-fd-muted/50 p-1 text-sm w-fit">
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				onclick={() => (filter = tab.id)}
				class="rounded-md px-3 py-1 transition-colors {filter === tab.id
					? 'bg-fd-background font-medium shadow-sm'
					: 'text-fd-muted-foreground hover:text-fd-foreground'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>
	{/if}

	{#if loading}
		<Loading />
	{:else if error}
		<p class="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">{error}</p>
	{:else if filtered.length === 0}
		<div class="rounded-2xl border border-dashed border-fd-border py-16 text-center">
			<p class="font-medium">Nothing here yet</p>
			<p class="mt-1 text-sm text-fd-muted-foreground">
				No {filter === 'all' ? 'discussions' : filter} in this topic.
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each filtered as discussion (discussion.id)}
				<DiscussionRow {discussion} showCategory={false} />
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
