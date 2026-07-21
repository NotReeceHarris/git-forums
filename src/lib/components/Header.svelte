<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { forumConfig } from '$lib/config';
	import { auth } from '$lib/github/auth.svelte';
	import { ui } from '$lib/ui.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let query = $state('');

	function search(e: SubmitEvent) {
		e.preventDefault();
		if (query.trim()) goto(`${resolve('/search')}?q=${encodeURIComponent(query.trim())}`);
	}
</script>

<header
	class="sticky top-0 z-40 border-b border-fd-border bg-fd-background/80 backdrop-blur-lg"
>
	<div class="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
		<a href={resolve('/')} class="flex items-center gap-2.5 font-semibold tracking-tight">
			{#if forumConfig.site.logo}
				<span class="text-lg leading-none">{forumConfig.site.logo}</span>
			{:else}
				<svg class="size-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path
						d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM14.5 4.75a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.458 1.458 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.22v-2.19a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z"
					/>
				</svg>
			{/if}
			{forumConfig.site.name}
		</a>

		{#if forumConfig.nav.length > 0}
			<nav class="hidden items-center gap-1 text-sm lg:flex">
				{#each forumConfig.nav as link (link.href)}
					<a
						href={link.href}
						target={link.external ? '_blank' : undefined}
						rel={link.external ? 'noreferrer' : undefined}
						class="rounded-lg px-2.5 py-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
					>
						{link.label}
					</a>
				{/each}
			</nav>
		{/if}

		{#if forumConfig.features.search}
		<form onsubmit={search} class="ml-auto hidden max-w-xs flex-1 sm:block">
			<div class="relative">
				<svg
					class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fd-muted-foreground"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				>
					<circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
				</svg>
				<input
					type="search"
					bind:value={query}
					placeholder="Search forum…"
					class="w-full rounded-lg border border-fd-border bg-fd-muted/50 py-1.5 pr-3 pl-8 text-sm text-fd-foreground outline-none transition-colors placeholder:text-fd-muted-foreground focus:bg-fd-background focus:ring-2 focus:ring-fd-ring"
				/>
			</div>
		</form>
		{/if}

		<div class="ml-auto flex items-center gap-2 sm:ml-0">
			<ThemeToggle />
			{#if auth.loading}
				<div class="size-8 animate-pulse rounded-full bg-fd-muted"></div>
			{:else if auth.viewer}
				<a
					href={resolve('/new')}
					class="hidden items-center gap-1.5 rounded-lg bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90 sm:inline-flex"
				>
					<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
					New post
				</a>
				<details class="relative">
					<summary
						class="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden"
					>
						<img
							src={auth.viewer.avatarUrl}
							alt={auth.viewer.login}
							class="size-8 rounded-full border border-fd-border"
						/>
					</summary>
					<div
						class="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-fd-border bg-fd-card py-1 shadow-xl"
					>
						<a
							href={resolve('/u/[login]', { login: auth.viewer.login })}
							class="block px-3 py-2 text-sm hover:bg-fd-accent"
						>
							<span class="block font-medium">{auth.viewer.name ?? auth.viewer.login}</span>
							<span class="block text-xs text-fd-muted-foreground">@{auth.viewer.login}</span>
						</a>
						<a href={resolve('/new')} class="block px-3 py-2 text-sm hover:bg-fd-accent sm:hidden">
							New post
						</a>
						<button
							type="button"
							onclick={() => auth.signOut()}
							class="block w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-fd-accent"
						>
							Sign out
						</button>
					</div>
				</details>
			{:else}
				<button
					type="button"
					onclick={() => (ui.signInOpen = true)}
					class="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
				>
					Sign in
				</button>
			{/if}
		</div>
	</div>
</header>
