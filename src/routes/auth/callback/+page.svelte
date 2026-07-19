<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Loading from '$lib/components/Loading.svelte';
	import { auth } from '$lib/github/auth.svelte';

	let error = $state<string | null>(null);

	$effect(() => {
		const code = page.url.searchParams.get('code');
		const state = page.url.searchParams.get('state');
		if (!code || !state) {
			error = 'Missing OAuth parameters.';
			return;
		}
		auth
			.completeOAuth(code, state)
			.then(() => goto(resolve('/'), { replaceState: true }))
			.catch((err) => {
				error = err instanceof Error ? err.message : 'Sign in failed.';
			});
	});
</script>

{#if error}
	<div class="rounded-2xl border border-dashed border-fd-border py-16 text-center">
		<p class="font-medium text-red-500">{error}</p>
		<a href={resolve('/')} class="mt-2 inline-block text-sm text-fd-link hover:underline">Back to the forum</a>
	</div>
{:else}
	<Loading />
	<p class="text-center text-sm text-fd-muted-foreground">Completing sign in…</p>
{/if}
