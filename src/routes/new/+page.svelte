<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Loading from '$lib/components/Loading.svelte';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
	import SignInPrompt from '$lib/components/SignInPrompt.svelte';
	import { forumConfig } from '$lib/config';
	import { createDiscussion } from '$lib/github/api';
	import { auth } from '$lib/github/auth.svelte';
	import { ui } from '$lib/ui.svelte';

	let title = $state('');
	let body = $state('');
	let categoryId = $state('');
	let kind = $state<'post' | 'article'>('post');
	let busy = $state(false);
	let error = $state<string | null>(null);

	// preselect ?topic=<slug> once categories arrive
	$effect(() => {
		if (!categoryId && ui.categories.length > 0) {
			const slug = page.url.searchParams.get('topic');
			const match = slug ? ui.categories.find((c) => c.slug === slug) : undefined;
			categoryId = (match ?? ui.categories[0]).id;
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim() || !body.trim() || !categoryId) return;
		busy = true;
		error = null;
		try {
			const number = await createDiscussion({
				categoryId,
				title: title.trim(),
				body,
				article: kind === 'article'
			});
			await goto(resolve('/d/[number]', { number: String(number) }));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create the post.';
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>New post — {forumConfig.site.name}</title>
</svelte:head>

{#if auth.loading}
	<Loading />
{:else if !auth.signedIn}
	<SignInPrompt />
{:else if !ui.categoriesLoaded}
	<Loading />
{:else}
	<div class="mx-auto max-w-3xl">
		<h1 class="mb-6 text-2xl font-bold tracking-tight">Create a new {kind}</h1>

		<form onsubmit={submit} class="flex flex-col gap-5">
			{#if forumConfig.content.articles.enabled}
			<div class="flex gap-1 rounded-lg border border-fd-border bg-fd-muted/50 p-1 text-sm w-fit">
				{#each [{ id: 'post', label: 'Post' }, { id: 'article', label: 'Article' }] as const as option (option.id)}
					<button
						type="button"
						onclick={() => (kind = option.id)}
						class="rounded-md px-4 py-1.5 transition-colors {kind === option.id
							? 'bg-fd-background font-medium shadow-sm'
							: 'text-fd-muted-foreground hover:text-fd-foreground'}"
					>
						{option.label}
					</button>
				{/each}
			</div>
			<p class="-mt-3 text-xs text-fd-muted-foreground">
				{kind === 'article'
					? 'Articles are long-form writeups, shown with a distinct reading layout.'
					: 'Posts are regular forum threads.'}
			</p>
			{/if}

			<div>
				<label class="mb-1 block text-sm font-medium" for="gf-topic">Topic</label>
				<select
					id="gf-topic"
					bind:value={categoryId}
					class="w-full rounded-lg border border-fd-border bg-fd-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fd-ring sm:max-w-xs"
				>
					{#each ui.categories as category (category.id)}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label class="mb-1 block text-sm font-medium" for="gf-title">Title</label>
				<input
					id="gf-title"
					type="text"
					bind:value={title}
					maxlength="256"
					placeholder="A clear, descriptive title"
					class="w-full rounded-lg border border-fd-border bg-fd-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fd-ring"
				/>
			</div>

			<div>
				<span class="mb-1 block text-sm font-medium">Body</span>
				<MarkdownEditor bind:value={body} rows={12} />
			</div>

			{#if error}
				<p class="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
					{error}
				</p>
			{/if}

			<div class="flex justify-end gap-2">
				<a
					href={resolve('/')}
					class="rounded-lg px-4 py-2 text-sm text-fd-muted-foreground hover:bg-fd-accent"
				>
					Cancel
				</a>
				<button
					type="submit"
					disabled={busy || !title.trim() || !body.trim()}
					class="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{busy ? 'Publishing…' : `Publish ${kind}`}
				</button>
			</div>
		</form>
	</div>
{/if}
