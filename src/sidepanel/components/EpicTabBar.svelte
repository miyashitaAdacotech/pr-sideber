<script lang="ts">
	import type { PinnedTabsStore } from "../stores/pinned-tabs.svelte";
	import { tabKey } from "../stores/pinned-tabs.svelte";

	type Props = {
		store: PinnedTabsStore;
	};

	const { store }: Props = $props();

	function activate(key: string | null): void {
		void store.activate(key);
	}

	function unpin(event: MouseEvent, key: string): void {
		event.stopPropagation();
		event.preventDefault();
		void store.unpin(key);
	}
</script>

<nav class="epic-tab-bar" aria-label="Epic タブ">
	<button
		type="button"
		class="tab"
		class:active={store.activeKey === null}
		onclick={() => activate(null)}
	>
		All
	</button>
	{#each store.pinned as tab (tabKey(tab))}
		{@const key = tabKey(tab)}
		<div
			class="tab"
			class:active={store.activeKey === key}
			role="button"
			tabindex="0"
			onclick={() => activate(key)}
			onkeydown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					activate(key);
				}
			}}
		>
			<span class="tab-icon">{tab.type === "epic" ? "📁" : "📋"}</span>
			<span class="tab-label">#{tab.number}</span>
			<span class="tab-title">{tab.title}</span>
			<button
				type="button"
				class="close-btn"
				aria-label="ピン解除"
				onclick={(e) => unpin(e, key)}
			>×</button>
		</div>
	{/each}
</nav>

<style>
	.epic-tab-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		padding: 0.375rem 0.25rem;
		border-bottom: 1px solid var(--color-border-primary);
		background: var(--color-bg-primary);
		position: sticky;
		top: 2.25rem;
		z-index: 9;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border-primary);
		border-radius: 4px;
		cursor: pointer;
		max-width: 14rem;
		min-width: 0;
	}

	.tab:hover {
		background: var(--color-bg-hover);
	}

	.tab.active {
		background: var(--color-accent-primary);
		color: var(--color-bg-primary);
		border-color: var(--color-accent-primary);
	}

	.tab-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.tab-icon {
		flex-shrink: 0;
	}

	.tab-label {
		flex-shrink: 0;
		font-weight: 600;
	}

	.close-btn {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		font-size: 0.875rem;
		line-height: 1;
		padding: 0 0.125rem;
		opacity: 0.7;
		flex-shrink: 0;
	}

	.close-btn:hover {
		opacity: 1;
	}
</style>
