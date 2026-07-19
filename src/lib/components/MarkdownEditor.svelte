<script lang="ts">
	import { renderMarkdown } from '$lib/github/api';

	let {
		value = $bindable(''),
		placeholder = 'Write in Markdown…',
		rows = 6
	}: { value?: string; placeholder?: string; rows?: number } = $props();

	let tab = $state<'write' | 'preview'>('write');
	let previewHTML = $state('');
	let previewLoading = $state(false);

	async function showPreview() {
		tab = 'preview';
		if (!value.trim()) {
			previewHTML = '<p class="text-fd-muted-foreground">Nothing to preview.</p>';
			return;
		}
		previewLoading = true;
		try {
			previewHTML = await renderMarkdown(value);
		} catch {
			previewHTML = '<p class="text-red-500">Preview failed.</p>';
		} finally {
			previewLoading = false;
		}
	}
</script>

<div class="overflow-hidden rounded-xl border border-fd-border bg-fd-card">
	<div class="flex border-b border-fd-border bg-fd-muted/50 text-sm">
		<button
			type="button"
			onclick={() => (tab = 'write')}
			class="px-4 py-2 transition-colors {tab === 'write'
				? 'border-b-2 border-fd-primary bg-fd-card font-medium'
				: 'text-fd-muted-foreground hover:text-fd-foreground'}"
		>
			Write
		</button>
		<button
			type="button"
			onclick={showPreview}
			class="px-4 py-2 transition-colors {tab === 'preview'
				? 'border-b-2 border-fd-primary bg-fd-card font-medium'
				: 'text-fd-muted-foreground hover:text-fd-foreground'}"
		>
			Preview
		</button>
	</div>

	{#if tab === 'write'}
		<textarea
			bind:value
			{placeholder}
			{rows}
			class="block w-full resize-y bg-transparent p-3 font-mono text-sm outline-none placeholder:text-fd-muted-foreground"
		></textarea>
	{:else}
		<div class="markdown min-h-24 p-3">
			{#if previewLoading}
				<p class="text-sm text-fd-muted-foreground">Rendering…</p>
			{:else}
				{@html previewHTML}
			{/if}
		</div>
	{/if}
</div>
