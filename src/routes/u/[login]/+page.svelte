<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { swr } from '$lib/cache';
	import DiscussionRow from '$lib/components/DiscussionRow.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import SignInPrompt from '$lib/components/SignInPrompt.svelte';
	import UserBadges from '$lib/components/UserBadges.svelte';
	import { forumConfig } from '$lib/config';
	import { getUserProfile, listUserDiscussions, renderMarkdown } from '$lib/github/api';
	import { auth } from '$lib/github/auth.svelte';
	import { repFor } from '$lib/ui.svelte';
	import type { UserProfile } from '$lib/github/types';
	import { excerpt, formatDate, timeAgo } from '$lib/utils';

	let profile = $state<UserProfile | null>(null);
	let readmeHTML = $state<string | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);

	type Tab = 'overview' | 'posts' | 'comments';
	let tab = $state<Tab>('posts');

	const login = $derived(page.params.login ?? '');

	let loadedFor: string | null = null;
	$effect(() => {
		if (auth.signedIn && login && loadedFor !== login) {
			loadedFor = login;
			load(login);
		}
	});

	async function load(user: string) {
		loading = true;
		error = null;
		profile = null;
		readmeHTML = null;
		tab = 'posts';
		try {
			await swr(`profile:${user}`, () => getUserProfile(user), (fresh) => {
				profile = fresh;
				loading = false;
			});
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load profile.';
		} finally {
			loading = false;
		}
	}

	// The README is raw markdown from the user's profile repo — render it via
	// the GitHub markdown API with that repo as context so relative links and
	// images resolve. Rendered per profile, cached alongside the profile data.
	let renderedFor: string | null = null;
	$effect(() => {
		const p = profile;
		if (p?.readme && renderedFor !== p.login) {
			renderedFor = p.login;
			swr(
				`profile:readme:${p.login}`,
				() => renderMarkdown(p.readme!, { context: `${p.login}/${p.login}`, mode: 'markdown' }),
				(html) => {
					readmeHTML = html;
					if (tab === 'posts' && p.discussions.nodes.length === 0) tab = 'overview';
				}
			).catch(() => {
				// README is decoration — the profile still works without it
			});
		}
	});

	async function loadMore() {
		if (!profile?.discussions.pageInfo.hasNextPage || loadingMore) return;
		loadingMore = true;
		try {
			const next = await listUserDiscussions(profile.login, profile.discussions.pageInfo.endCursor);
			profile.discussions.nodes = [...profile.discussions.nodes, ...next.nodes];
			profile.discussions.pageInfo = next.pageInfo;
		} finally {
			loadingMore = false;
		}
	}

	const tabs = $derived(
		[
			...(readmeHTML ? [{ id: 'overview' as Tab, label: 'Overview' }] : []),
			{ id: 'posts' as Tab, label: `Posts` },
			{ id: 'comments' as Tab, label: `Comments` }
		]
	);
</script>

<svelte:head>
	<title>{login ? `@${login} — ${forumConfig.site.name}` : forumConfig.site.name}</title>
</svelte:head>

{#if auth.loading}
	<Loading />
{:else if !auth.signedIn}
	<SignInPrompt />
{:else if loading}
	<Loading />
{:else if error || !profile}
	<div class="rounded-2xl border border-dashed border-fd-border py-16 text-center">
		<p class="font-medium">{error ?? 'Profile not found'}</p>
		<a href={resolve('/')} class="mt-2 inline-block text-sm text-fd-link hover:underline">
			Back to all discussions
		</a>
	</div>
{:else}
	<div class="mb-6 flex flex-col gap-4 rounded-2xl border border-fd-border bg-fd-card p-5 sm:flex-row sm:items-start sm:gap-5">
		<img
			src={profile.avatarUrl}
			alt={profile.login}
			class="size-20 shrink-0 rounded-full border border-fd-border"
		/>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="text-xl font-bold tracking-tight">
					{profile.name ?? profile.login}
				</h1>
				<span class="text-fd-muted-foreground">@{profile.login}</span>
				<UserBadges login={profile.login} />
			</div>
			{#if profile.bio}
				<p class="mt-1 text-sm text-fd-muted-foreground">{profile.bio}</p>
			{/if}
			<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-fd-muted-foreground">
				<span title="Posts on this forum">
					<strong class="font-semibold text-fd-foreground">{profile.discussions.totalCount}</strong>
					{profile.discussions.totalCount === 1 ? 'post' : 'posts'}
				</span>
				<span title="Comments on this forum">
					<strong class="font-semibold text-fd-foreground">{profile.comments.totalCount}</strong>
					{profile.comments.totalCount === 1 ? 'comment' : 'comments'}
				</span>
				{#if repFor(profile.login) !== null}
					<span title="Reputation earned on this forum">
						<strong class="font-semibold text-fd-foreground">{repFor(profile.login)}</strong>
						rep
					</span>
				{/if}
				<span title={formatDate(profile.createdAt)}>
					Joined GitHub {formatDate(profile.createdAt)}
				</span>
				<a
					href={profile.url}
					target="_blank"
					rel="noreferrer"
					class="inline-flex items-center gap-1.5 text-fd-link hover:underline"
				>
					<svg class="size-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" /></svg>
					GitHub profile
				</a>
			</div>
		</div>
	</div>

	<div class="mb-4 flex w-fit gap-1 rounded-lg border border-fd-border bg-fd-muted/50 p-1 text-sm">
		{#each tabs as t (t.id)}
			<button
				type="button"
				onclick={() => (tab = t.id)}
				class="rounded-md px-3 py-1 transition-colors {tab === t.id
					? 'bg-fd-background font-medium shadow-sm'
					: 'text-fd-muted-foreground hover:text-fd-foreground'}"
			>
				{t.label}
			</button>
		{/each}
	</div>

	{#if tab === 'overview' && readmeHTML}
		<div class="rounded-2xl border border-fd-border bg-fd-card p-5">
			<div class="markdown">
				{@html readmeHTML}
			</div>
		</div>
	{:else if tab === 'posts'}
		{#if profile.discussions.nodes.length === 0}
			<div class="rounded-2xl border border-dashed border-fd-border py-16 text-center">
				<p class="font-medium">No posts yet</p>
				<p class="mt-1 text-sm text-fd-muted-foreground">
					@{profile.login} hasn't started any discussions.
				</p>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				{#each profile.discussions.nodes as discussion (discussion.id)}
					<DiscussionRow {discussion} />
				{/each}
			</div>
			{#if profile.discussions.pageInfo.hasNextPage}
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
	{:else if tab === 'comments'}
		{#if profile.comments.nodes.length === 0}
			<div class="rounded-2xl border border-dashed border-fd-border py-16 text-center">
				<p class="font-medium">No comments yet</p>
				<p class="mt-1 text-sm text-fd-muted-foreground">
					@{profile.login} hasn't commented on any discussions.
				</p>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				{#each profile.comments.nodes as comment (comment.id)}
					<a
						href="{resolve('/d/[number]', { number: String(comment.discussion.number) })}#{comment.id}"
						class="group rounded-xl border border-fd-border bg-fd-card p-4 transition-colors hover:border-fd-ring/50 hover:bg-fd-accent/40"
					>
						<p class="line-clamp-2 text-sm">{excerpt(comment.bodyText)}</p>
						<p class="mt-2 text-xs text-fd-muted-foreground">
							on <span class="font-medium text-fd-foreground/80 group-hover:underline">{comment.discussion.title}</span>
							· {timeAgo(comment.createdAt)}
						</p>
					</a>
				{/each}
			</div>
			{#if profile.comments.totalCount > profile.comments.nodes.length}
				<p class="mt-4 text-center text-xs text-fd-muted-foreground">
					Showing the {profile.comments.nodes.length} most recent of {profile.comments.totalCount} comments.
				</p>
			{/if}
		{/if}
	{/if}
{/if}
