<script lang="ts">
	import type { PullRequest } from "../../domain/types/github";
	import PrItem from "./PrItem.svelte";

	type Props = {
		title: string;
		items: readonly PullRequest[];
		isOpen?: boolean;
	};

	const { title, items, isOpen: initialOpen = true }: Props = $props();

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
					<PrItem {pr} />
				{/each}
			{/if}
		</div>
	{/if}
</section>

<style>
	.pr-section {
		margin-bottom: 1rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.section-header:hover {
		background: #f6f8fa;
	}

	.toggle-icon {
		font-size: 0.75rem;
		color: #586069;
	}

	.section-title {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
		flex: 1;
	}

	.section-count {
		font-size: 0.75rem;
		color: #586069;
		background: #e1e4e8;
		padding: 0.125rem 0.5rem;
		border-radius: 10px;
	}

	.section-body {
		padding-left: 1.25rem;
	}

	.empty-message {
		color: #586069;
		font-size: 0.875rem;
		font-style: italic;
	}
</style>
