<script lang="ts">
	import { resolve } from '$app/paths';
	import { forumConfig } from '$lib/config';
	import { addComment } from '$lib/github/api';
	import { auth } from '$lib/github/auth.svelte';
	import type { Comment, Reply } from '$lib/github/types';
	import { ui } from '$lib/ui.svelte';
	import { timeAgo } from '$lib/utils';
	import MarkdownEditor from './MarkdownEditor.svelte';
	import ReactionBar from './ReactionBar.svelte';
	import UserBadges from './UserBadges.svelte';

	let {
		comment,
		discussionId,
		locked = false,
		onposted
	}: {
		comment: Comment;
		discussionId: string;
		locked?: boolean;
		/** Called with the created reply — the parent inserts it into the thread */
		onposted: (reply: Reply) => void;
	} = $props();

	let replying = $state(false);
	let replyBody = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	function startReply() {
		if (!auth.signedIn) {
			ui.signInOpen = true;
			return;
		}
		replying = true;
	}

	async function submitReply(e: SubmitEvent) {
		e.preventDefault();
		if (!replyBody.trim()) return;
		busy = true;
		error = null;
		try {
			const reply = await addComment(discussionId, replyBody, comment.id);
			replyBody = '';
			replying = false;
			onposted(reply);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to post reply.';
		} finally {
			busy = false;
		}
	}
</script>

{#snippet authorLine(author: Comment['author'], createdAt: string)}
	{#if author}
		<img
			src={author.avatarUrl}
			alt={author.login}
			class="size-7 rounded-full border border-fd-border"
			loading="lazy"
		/>
		<a
			href={resolve('/u/[login]', { login: author.login })}
			class="text-sm font-medium hover:underline"
		>
			{author.login}
		</a>
		<UserBadges login={author.login} />
	{:else}
		<div class="size-7 rounded-full bg-fd-muted"></div>
		<span class="text-sm font-medium text-fd-muted-foreground">ghost</span>
	{/if}
	<span class="text-xs text-fd-muted-foreground">{timeAgo(createdAt)}</span>
{/snippet}

<article
	class="rounded-xl border bg-fd-card {comment.isAnswer
		? 'border-green-500/40'
		: 'border-fd-border'}"
	id={comment.id}
>
	<div class="flex items-center gap-2 border-b border-fd-border px-4 py-2.5">
		{@render authorLine(comment.author, comment.createdAt)}
		{#if comment.isAnswer}
			<span
				class="ml-auto inline-flex items-center gap-1 rounded-full border border-green-500/40 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400"
			>
				<svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
				Answer
			</span>
		{/if}
	</div>

	<div class="markdown px-4 py-3">
		{@html comment.bodyHTML}
	</div>

	<div class="flex items-center gap-3 px-4 pb-3">
		{#if forumConfig.features.reactions}
			<ReactionBar subjectId={comment.id} groups={comment.reactionGroups} />
		{/if}
		{#if !locked}
			<button
				type="button"
				onclick={startReply}
				class="ml-auto text-xs font-medium text-fd-muted-foreground hover:text-fd-foreground"
			>
				Reply
			</button>
		{/if}
	</div>

	{#if comment.replies.nodes.length > 0 || replying}
		<div class="space-y-3 border-t border-fd-border bg-fd-muted/30 px-4 py-3">
			{#each comment.replies.nodes as reply (reply.id)}
				<div class="flex gap-2.5">
					<div class="mt-1 w-0.5 shrink-0 rounded bg-fd-border"></div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							{@render authorLine(reply.author, reply.createdAt)}
						</div>
						<div class="markdown mt-1 text-sm">
							{@html reply.bodyHTML}
						</div>
						{#if forumConfig.features.reactions}
							<div class="mt-1.5">
								<ReactionBar subjectId={reply.id} groups={reply.reactionGroups} />
							</div>
						{/if}
					</div>
				</div>
			{/each}

			{#if replying}
				<form onsubmit={submitReply} class="pt-1">
					<MarkdownEditor bind:value={replyBody} rows={3} placeholder="Write a reply…" />
					{#if error}<p class="mt-2 text-sm text-red-500">{error}</p>{/if}
					<div class="mt-2 flex justify-end gap-2">
						<button
							type="button"
							onclick={() => (replying = false)}
							class="rounded-lg px-3 py-1.5 text-sm text-fd-muted-foreground hover:bg-fd-accent"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={busy || !replyBody.trim()}
							class="rounded-lg bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{busy ? 'Posting…' : 'Post reply'}
						</button>
					</div>
				</form>
			{/if}
		</div>
	{/if}
</article>
