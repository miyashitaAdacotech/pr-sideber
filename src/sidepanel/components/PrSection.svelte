<script lang="ts">
	import type { PrItemDto } from "../../domain/ports/pr-processor.port";
	import PrItem from "./PrItem.svelte";

	type Props = {
		title: string;
		items: readonly PrItemDto[];
		isOpen?: boolean;
		onNavigate?: (url: string) => void;
	};

	const { title, items, isOpen: initialOpen = true, onNavigate }: Props = $props();

	let open = $state(initialOpen);

	function toggle() {
		open = !open;
	}
</script>

<section class="pr-section">
	<button class="section-header" onclick={toggle}>
		<span class="toggle-icon">{open ? "▼" : "▶"}</span>
		<h2 class="section-title">{title}</h2>
		<span class="section-count">{items.length}</span>
	</button>

	{#if open}
		<div class="section-body">
			{#if items.length === 0}
				<p class="empty-message">PR がありません</p>
			{:else}
				{#each items as pr (pr.url)}
					<PrItem {pr} {onNavigate} />
				{/each}
			{/if}
		</div>
	{/if}
</section>

<style>
	.pr-section {
		margin-bottom: 0.75rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: 4px;
		transition: background 0.15s;
		color: var(--color-text-primary);
	}

	.section-header:hover {
		background: var(--color-bg-hover);
	}

	.section-header:active {
		background: var(--color-bg-secondary);
	}

	.toggle-icon {
		font-size: 0.625rem;
		color: var(--color-text-secondary);
	}

	.section-title {
		font-size: 0.8125rem;
		font-weight: 600;
		margin: 0;
		flex: 1;
		color: var(--color-text-primary);
	}

	.section-count {
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
		background: var(--color-bg-secondary);
		padding: 0.0625rem 0.375rem;
		border-radius: 10px;
	}

	.section-body {
		padding-left: 1rem;
	}

	.empty-message {
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		font-style: italic;
	}
</style>
