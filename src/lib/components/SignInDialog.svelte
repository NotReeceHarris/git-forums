<script lang="ts">
	import { resolve } from '$app/paths';
	import { forumConfig } from '$lib/config';
	import { auth } from '$lib/github/auth.svelte';
	import { ui } from '$lib/ui.svelte';

	let token = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function submitToken(e: SubmitEvent) {
		e.preventDefault();
		if (!token.trim()) return;
		busy = true;
		error = null;
		try {
			await auth.signInWithToken(token);
			token = '';
			ui.signInOpen = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Sign in failed.';
		} finally {
			busy = false;
		}
	}

	function startOAuth() {
		auth.beginOAuth(`${location.origin}${resolve('/auth/callback')}`);
	}

	function close() {
		ui.signInOpen = false;
		error = null;
	}

	// OAuth takes over completely when configured — token sign-in is only a
	// zero-infrastructure fallback.
	const tokenSignIn = $derived(!auth.oauthAvailable && forumConfig.auth.allowToken);
</script>

{#if ui.signInOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		onclick={(e) => e.target === e.currentTarget && close()}
		onkeydown={(e) => e.key === 'Escape' && close()}
		role="presentation"
	>
		<div
			class="w-full max-w-md rounded-2xl border border-fd-border bg-fd-card p-6 shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Sign in with GitHub"
		>
			<div class="mb-1 flex items-center justify-between">
				<h2 class="text-lg font-semibold">Sign in with GitHub</h2>
				<button
					type="button"
					onclick={close}
					class="rounded-md p-1 text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground"
					aria-label="Close"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
						><path d="M18 6 6 18M6 6l12 12" /></svg
					>
				</button>
			</div>
			<p class="mb-4 text-sm text-fd-muted-foreground">
				The forum runs entirely on the GitHub API, so a GitHub account is required to browse and
				post.
			</p>

			{#if auth.oauthAvailable}
				<button
					type="button"
					onclick={startOAuth}
					class="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
				>
					<svg class="size-4" viewBox="0 0 16 16" fill="currentColor">
						<path
							d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
						/>
					</svg>
					Continue with GitHub
				</button>
			{:else if !tokenSignIn}
				<p class="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
					No sign-in method is enabled — set <code>auth.allowToken</code> or configure OAuth in
					<code>forum.config.ts</code>.
				</p>
			{/if}

			{#if tokenSignIn}
			<form onsubmit={submitToken}>
				<label class="mb-1 block text-sm font-medium" for="dk-token">Personal access token</label>
				<input
					id="dk-token"
					type="password"
					bind:value={token}
					placeholder="github_pat_…"
					autocomplete="off"
					class="mb-2 w-full rounded-lg border border-fd-border bg-fd-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fd-ring"
				/>
				<p class="mb-3 text-xs text-fd-muted-foreground">
					Create a
					<a
						class="font-medium text-fd-link hover:underline"
						href="https://github.com/settings/personal-access-tokens/new"
						target="_blank"
						rel="noreferrer">fine-grained token</a
					>
					with read/write access to <span class="font-mono">Discussions</span> on the forum
					repository. It is stored only in this browser.
				</p>
				{#if error}
					<p class="mb-3 text-sm text-red-500">{error}</p>
				{/if}
				<button
					type="submit"
					disabled={busy || !token.trim()}
					class="inline-flex w-full items-center justify-center rounded-lg border border-fd-border bg-fd-accent px-4 py-2 text-sm font-medium text-fd-accent-foreground transition-colors hover:bg-fd-muted disabled:opacity-50"
				>
					{busy ? 'Signing in…' : 'Sign in with token'}
				</button>
			</form>
			{/if}
		</div>
	</div>
{/if}
