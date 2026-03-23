<script lang="ts">
	type Props = {
		onLogout: () => Promise<void>;
	};

	const { onLogout }: Props = $props();

	let error = $state<string | null>(null);

	async function handleLogout() {
		error = null;
		try {
			await onLogout();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : "Unknown error";
		}
	}
</script>

<button onclick={handleLogout}>Logout</button>

{#if error}
	<span class="error">{error}</span>
{/if}

<style>
	button {
		padding: 0.25rem 0.625rem;
		font-size: 0.75rem;
		cursor: pointer;
		border: 1px solid var(--color-border-primary);
		border-radius: 4px;
		background: transparent;
		color: var(--color-text-secondary);
		transition: background 0.15s, color 0.15s;
	}

	button:hover {
		background: var(--color-bg-hover);
		color: var(--color-text-primary);
	}

	.error {
		color: var(--color-badge-red);
		font-size: 0.75rem;
	}
</style>
