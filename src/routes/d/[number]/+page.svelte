<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { swr, writeCache } from '$lib/cache';
	import CommentCard from '$lib/components/CommentCard.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
	import ReactionBar from '$lib/components/ReactionBar.svelte';
	import SignInPrompt from '$lib/components/SignInPrompt.svelte';
	import UserBadges from '$lib/components/UserBadges.svelte';
	import { forumConfig } from '$lib/config';
	import {
		addComment,
		deleteDiscussion,
		getDiscussion,
		isArticle,
		stripMarker,
		toggleUpvote,
		updateDiscussion
	} from '$lib/github/api';
	import { auth } from '$lib/github/auth.svelte';
	import type { Comment, Discussion, Reply } from '$lib/github/types';
	import { isMaintainer, ui } from '$lib/ui.svelte';
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

	// GitHub only allows the author and users with repo write access to edit
	// or delete a discussion — mirror that in the UI
	const canModerate = $derived(
		!!discussion &&
			!!auth.viewer &&
			(auth.viewer.login === discussion.author?.login || isMaintainer())
	);
	const reportUrl = $derived(
		discussion
			? `https://github.com/contact/report-content?content_url=${encodeURIComponent(discussion.url)}`
			: '#'
	);

	// inline moderation editor
	let editing = $state(false);
	let editTitle = $state('');
	let editCategoryId = $state('');
	let editBody = $state('');
	let editBusy = $state(false);
	let editError = $state<string | null>(null);

	function startEdit() {
		if (!discussion) return;
		editTitle = discussion.title;
		editCategoryId = discussion.category.id;
		editBody = stripMarker(discussion.body);
		editError = null;
		editing = true;
	}

	async function saveEdit(e: SubmitEvent) {
		e.preventDefault();
		if (!discussion || !editTitle.trim() || !editBody.trim()) return;
		editBusy = true;
		editError = null;
		try {
			// preserve the post's article/post type
			const body = article
				? `${forumConfig.content.articles.marker}\n\n${editBody}`
				: editBody;
			const updated = await updateDiscussion(discussion.id, {
				title: editTitle.trim(),
				body,
				categoryId: editCategoryId
			});
			Object.assign(discussion, updated);
			persist();
			editing = false;
		} catch (err) {
			editError = err instanceof Error ? err.message : 'Failed to save changes.';
		} finally {
			editBusy = false;
		}
	}

	let deleteBusy = $state(false);
	async function removeDiscussion() {
		if (!discussion || deleteBusy) return;
		if (!confirm('Permanently delete this post and all its comments?')) return;
		deleteBusy = true;
		try {
			await deleteDiscussion(discussion.id);
			await goto(resolve('/'));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete the post.';
			deleteBusy = false;
		}
	}

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
			await swr(`discussion:${number}`, () => getDiscussion(number), (fresh) => {
				discussion = fresh;
				loading = false;
			});
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load discussion.';
		} finally {
			loading = false;
		}
	}

	/** Persist the locally-updated thread so the cache stays fresh */
	function persist() {
		if (discussion) writeCache(`discussion:${number}`, $state.snapshot(discussion));
	}

	async function submitComment(e: SubmitEvent) {
		e.preventDefault();
		if (!discussion || !commentBody.trim()) return;
		posting = true;
		postError = null;
		try {
			// the mutation returns the created comment — insert it directly
			// instead of refetching the whole thread
			const created = await addComment(discussion.id, commentBody);
			discussion.comments.nodes.push({
				...created,
				isAnswer: false,
				replies: { totalCount: 0, nodes: [] }
			});
			discussion.comments.totalCount += 1;
			commentBody = '';
			persist();
		} catch (err) {
			postError = err instanceof Error ? err.message : 'Failed to post comment.';
		} finally {
			posting = false;
		}
	}

	function onReplyPosted(comment: Comment, reply: Reply) {
		comment.replies.nodes.push(reply);
		comment.replies.totalCount += 1;
		persist();
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
						href={resolve('/u/[login]', { login: discussion.author.login })}
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
			{#if ui.pinned.some((p) => p.number === discussion?.number)}
				<span class="inline-flex items-center gap-1 rounded-full border border-fd-border px-2 py-0.5 text-xs">
					<svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" /></svg>
					Pinned
				</span>
			{/if}

			<span class="ml-auto inline-flex items-center gap-1 text-xs">
				{#if canModerate && !editing}
					<button
						type="button"
						onclick={startEdit}
						class="rounded-md px-2 py-1 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
					>
						Edit
					</button>
					<button
						type="button"
						onclick={removeDiscussion}
						disabled={deleteBusy}
						class="rounded-md px-2 py-1 font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
					>
						{deleteBusy ? 'Deleting…' : 'Delete'}
					</button>
				{/if}
				<a
					href={reportUrl}
					target="_blank"
					rel="noreferrer"
					title="Report this content to GitHub"
					class="rounded-md px-2 py-1 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
				>
					Report
				</a>
			</span>
		</div>

		{#if editing}
			<form onsubmit={saveEdit} class="mt-6 flex flex-col gap-4 rounded-2xl border border-fd-border bg-fd-card p-4">
				<div>
					<label class="mb-1 block text-sm font-medium" for="dk-edit-title">Title</label>
					<input
						id="dk-edit-title"
						type="text"
						bind:value={editTitle}
						maxlength="256"
						class="w-full rounded-lg border border-fd-border bg-fd-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fd-ring"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium" for="dk-edit-topic">Topic</label>
					<select
						id="dk-edit-topic"
						bind:value={editCategoryId}
						class="w-full rounded-lg border border-fd-border bg-fd-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fd-ring sm:max-w-xs"
					>
						{#each ui.categories as category (category.id)}
							<option value={category.id}>{category.name}</option>
						{/each}
					</select>
				</div>
				<div>
					<span class="mb-1 block text-sm font-medium">Body</span>
					<MarkdownEditor bind:value={editBody} rows={10} />
				</div>
				{#if editError}
					<p class="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">{editError}</p>
				{/if}
				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={() => (editing = false)}
						class="rounded-lg px-4 py-2 text-sm text-fd-muted-foreground hover:bg-fd-accent"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={editBusy || !editTitle.trim() || !editBody.trim()}
						class="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{editBusy ? 'Saving…' : 'Save changes'}
					</button>
				</div>
			</form>
		{:else}
			<div class="markdown mt-6 {article ? 'text-base leading-8' : ''}">
				{@html discussion.bodyHTML}
			</div>
		{/if}

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
						onposted={(reply) => onReplyPosted(comment, reply)}
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
