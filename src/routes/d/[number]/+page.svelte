<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CommentCard from '$lib/components/CommentCard.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
	import ReactionBar from '$lib/components/ReactionBar.svelte';
	import SignInPrompt from '$lib/components/SignInPrompt.svelte';
	import UserBadges from '$lib/components/UserBadges.svelte';
	import { forumConfig } from '$lib/config';
	import { addComment, getDiscussion, isArticle, toggleUpvote } from '$lib/github/api';
	import { auth } from '$lib/github/auth.svelte';
	import type { Discussion } from '$lib/github/types';
	import { formatDate, timeAgo } from '$lib/utils';

	let discussion = $state<Discussion | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let commentBody = $state('');
	let posting = $state(false);
	let postError = $state<string | null>(null);
	let upvoteBusy = $state(false);

	const number = $derived(Number(page.params.number));
	const article = $derived(discussion ? isArticle(discussion.body) : false);

	let loadedFor: number | null = null;
	$effect(() => {
		if (auth.signedIn && Number.isFinite(number) && loadedFor !== number) {
			loadedFor = number;
			load();
		}
	});

	async function load() {
		loading = true;
		error = null;
		try {
			discussion = await getDiscussion(number);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load discussion.';
		} finally {
			loading = false;
		}
	}

	/** Silent refetch after posting a comment/reply */
	async function refresh() {
		try {
			discussion = await getDiscussion(number);
		} catch {
			// keep showing the stale thread
		}
	}

	async function submitComment(e: SubmitEvent) {
		e.preventDefault();
		if (!discussion || !commentBody.trim()) return;
		posting = true;
		postError = null;
		try {
			await addComment(discussion.id, commentBody);
			commentBody = '';
			await refresh();
		} catch (err) {
			postError = err instanceof Error ? err.message : 'Failed to post comment.';
		} finally {
			posting = false;
		}
	}

	async function upvote() {
		if (!discussion || upvoteBusy) return;
		upvoteBusy = true;
		const on = !discussion.viewerHasUpvoted;
		discussion.viewerHasUpvoted = on;
		discussion.upvoteCount += on ? 1 : -1;
		try {
			await toggleUpvote(discussion.id, on);
		} catch {
			discussion.viewerHasUpvoted = !on;
			discussion.upvoteCount += on ? -1 : 1;
		} finally {
			upvoteBusy = false;
		}
	}
</script>

<svelte:head>
	<title>{discussion ? `${discussion.title} — ${forumConfig.site.name}` : forumConfig.site.name}</title>
</svelte:head>

{#if auth.loading}
	<Loading />
{:else if !auth.signedIn}
	<SignInPrompt />
{:else if loading}
	<Loading />
{:else if error || !discussion}
	<div class="rounded-2xl border border-dashed border-fd-border py-16 text-center">
		<p class="font-medium">{error ?? 'Discussion not found.'}</p>
		<a href={resolve('/')} class="mt-2 inline-block text-sm text-fd-link hover:underline">
			Back to all discussions
		</a>
	</div>
{:else}
	<article class={article ? 'mx-auto max-w-3xl' : ''}>
		<nav class="mb-4 text-sm text-fd-muted-foreground">
			<a href={resolve('/')} class="hover:text-fd-foreground">Forum</a>
			<span class="mx-1.5">/</span>
			<a href={resolve('/t/[slug]', { slug: discussion.category.slug })} class="hover:text-fd-foreground">
				{discussion.category.name}
			</a>
		</nav>

		{#if article}
			<p class="mb-2 text-xs font-semibold tracking-widest text-fd-link uppercase">Article</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">{discussion.title}</h1>
		{:else}
			<h1 class="text-2xl font-bold tracking-tight">{discussion.title}</h1>
		{/if}

		<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fd-muted-foreground">
			{#if discussion.author}
				<span class="inline-flex items-center gap-2">
					<img
						src={discussion.author.avatarUrl}
						alt={discussion.author.login}
						class="size-6 rounded-full border border-fd-border"
					/>
					<a
						href={discussion.author.url}
						target="_blank"
						rel="noreferrer"
						class="font-medium text-fd-foreground hover:underline"
					>
						{discussion.author.login}
					</a>
					<UserBadges login={discussion.author.login} />
				</span>
			{/if}
			<span title={formatDate(discussion.createdAt)}>{timeAgo(discussion.createdAt)}</span>
			{#if discussion.locked}
				<span class="inline-flex items-center gap-1 rounded-full border border-fd-border px-2 py-0.5 text-xs">
					<svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
					Locked
				</span>
			{/if}
		</div>

		<div class="markdown mt-6 {article ? 'text-base leading-8' : ''}">
			{@html discussion.bodyHTML}
		</div>

		<div class="mt-6 flex flex-wrap items-center gap-3 border-b border-fd-border pb-6">
			{#if forumConfig.features.upvotes}
			<button
				type="button"
				onclick={upvote}
				class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors {discussion.viewerHasUpvoted
					? 'border-fd-ring bg-fd-accent font-medium'
					: 'border-fd-border hover:bg-fd-accent'}"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
				{discussion.upvoteCount}
			</button>
			{/if}
			{#if forumConfig.features.reactions}
				<ReactionBar subjectId={discussion.id} groups={discussion.reactionGroups} />
			{/if}
		</div>

		<section class="mt-8">
			<h2 class="mb-4 text-lg font-semibold">
				{discussion.comments.totalCount}
				{discussion.comments.totalCount === 1 ? 'comment' : 'comments'}
			</h2>

			<div class="flex flex-col gap-4">
				{#each discussion.comments.nodes as comment (comment.id)}
					<CommentCard
						{comment}
						discussionId={discussion.id}
						locked={discussion.locked}
						onposted={refresh}
					/>
				{/each}
			</div>

			{#if discussion.locked}
				<p class="mt-6 rounded-xl border border-fd-border bg-fd-muted/50 p-4 text-sm text-fd-muted-foreground">
					This discussion is locked. New comments are disabled.
				</p>
			{:else}
				<form onsubmit={submitComment} class="mt-6">
					<h3 class="mb-2 text-sm font-medium">Add a comment</h3>
					<MarkdownEditor bind:value={commentBody} />
					{#if postError}<p class="mt-2 text-sm text-red-500">{postError}</p>{/if}
					<div class="mt-3 flex justify-end">
						<button
							type="submit"
							disabled={posting || !commentBody.trim()}
							class="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{posting ? 'Posting…' : 'Comment'}
						</button>
					</div>
				</form>
			{/if}
		</section>
	</article>
{/if}
