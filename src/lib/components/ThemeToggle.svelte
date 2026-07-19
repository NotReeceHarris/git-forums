<script lang="ts">
	import { toggleTheme } from '$lib/ui.svelte';
</script>

<button
	type="button"
	onclick={toggleTheme}
	class="inline-flex size-8 items-center justify-center rounded-full border border-fd-border text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
	aria-label="Toggle theme"
	title="Toggle theme"
>
	<!-- sun (shown in light) -->
	<svg
		class="size-4 dark:hidden"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<circle cx="12" cy="12" r="4" />
		<path
			d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
		/>
	</svg>
	<!-- moon (shown in dark) -->
	<svg
		class="hidden size-4 dark:block"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
	</svg>
</button>
