<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import SignInDialog from '$lib/components/SignInDialog.svelte';
	import { auth } from '$lib/github/auth.svelte';
	import { configIncomplete, forumConfig, themeCss } from '$lib/config';
	import { loadOverview, loadRep, ui } from '$lib/ui.svelte';

	let { children } = $props();

	$effect(() => {
		if (configIncomplete) return;
		auth.init();
	});

	// forum data needs an authenticated GraphQL call; one combined query
	// bootstraps categories, permission, and the home feed
	$effect(() => {
		if (auth.signedIn && !ui.categoriesLoaded) loadOverview();
	});

	// rep ledger is public raw content — load as soon as the app boots
	$effect(() => {
		loadRep();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{forumConfig.site.name}</title>
	{#if themeCss}
		{@html `<style>${themeCss}</style>`}
	{/if}
</svelte:head>

{#if configIncomplete}
	<main class="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
		<h1 class="text-2xl font-bold tracking-tight">Almost there…</h1>
		<p class="text-fd-muted-foreground">
			No repository is configured. Set <code class="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">repo.owner</code>
			and <code class="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">repo.name</code> in
			<code class="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">forum.config.ts</code>,
			or deploy with the included GitHub Actions workflow to auto-detect them.
		</p>
	</main>
{:else}
	<Header />
	<SignInDialog />

	<div class="mx-auto flex w-full max-w-[1400px] gap-8 px-4">
		{#if auth.signedIn && ui.categories.length > 0}
			<aside class="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto py-6 md:block">
				<Sidebar categories={ui.categories} />
			</aside>
		{/if}
		<main class="min-w-0 flex-1 py-6">
			{@render children()}
		</main>
	</div>

	{#if forumConfig.site.footer}
		<footer class="border-t border-fd-border py-6 text-center text-sm text-fd-muted-foreground">
			{forumConfig.site.footer}
		</footer>
	{/if}
{/if}
