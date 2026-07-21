<script lang="ts">
	import { resolve } from '$app/paths';
	import { forumConfig } from '$lib/config';
	import { isArticle } from '$lib/github/api';
	import type { DiscussionListItem } from '$lib/github/types';
	import { excerpt, timeAgo } from '$lib/utils';
	import UserBadges from './UserBadges.svelte';

	let {
		discussion,
		showCategory = true
	}: { discussion: DiscussionListItem; showCategory?: boolean } = $props();

	const article = $derived(isArticle(discussion.body));
	const href = $derived(resolve('/d/[number]', { number: String(discussion.number) }));
</script>

<!-- The whole card is clickable via the title's stretched overlay link; the
     author avatar/name are separate links (to the profile page) layered above
     it, since anchors can't nest. -->
<div
	class="group relative flex gap-3 rounded-xl border border-fd-border bg-fd-card p-4 transition-colors hover:border-fd-ring/50 hover:bg-fd-accent/40"
>
	{#if discussion.author}
		<a
			href={resolve('/u/[login]', { login: discussion.author.login })}
			class="relative z-10 mt-0.5 shrink-0 self-start"
			title="View @{discussion.author.login}'s profile"
		>
			<img
				src={discussion.author.avatarUrl}
				alt={discussion.author.login}
				class="size-9 rounded-full border border-fd-border"
				loading="lazy"
			/>
		</a>
	{:else}
		<div class="mt-0.5 size-9 shrink-0 rounded-full bg-fd-muted"></div>
	{/if}

	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<h3 class="truncate font-medium group-hover:text-fd-foreground">
				<a {href} class="after:absolute after:inset-0">
					{discussion.title}
				</a>
			</h3>
			{#if article}
				<span
					class="shrink-0 rounded-full border border-fd-border bg-fd-muted px-2 py-0.5 text-[11px] font-medium text-fd-muted-foreground"
				>
					Article
				</span>
			{/if}
		</div>
		{#if forumConfig.content.listExcerpts && discussion.body}
			<p class="mt-0.5 line-clamp-2 text-sm text-fd-muted-foreground">
				{excerpt(discussion.body)}
			</p>
		{/if}
		<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fd-muted-foreground">
			{#if discussion.author}
				<span class="inline-flex items-center gap-1 font-medium text-fd-foreground/80">
					<a
						href={resolve('/u/[login]', { login: discussion.author.login })}
						class="relative z-10 hover:underline"
					>
						{discussion.author.login}
					</a>
					<UserBadges login={discussion.author.login} />
				</span>
			{/if}
			<span>{timeAgo(discussion.createdAt)}</span>
			{#if showCategory}
				<span class="inline-flex items-center gap-1">
					<span class="leading-none">{@html discussion.category.emojiHTML}</span>
					{discussion.category.name}
				</span>
			{/if}
			<span class="ml-auto inline-flex items-center gap-3">
				{#if forumConfig.features.upvotes}
				<span class="inline-flex items-center gap-1" title="Upvotes">
					<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
					{discussion.upvoteCount}
				</span>
				{/if}
				<span class="inline-flex items-center gap-1" title="Comments">
					<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 1 1 16.1-3.8z" /></svg>
					{discussion.comments.totalCount}
				</span>
			</span>
		</div>
	</div>
</div>
