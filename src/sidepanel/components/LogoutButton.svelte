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
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: transparent;
		color: #586069;
	}

	button:hover {
		background: #f6f8fa;
	}

	.error {
		color: #d73a49;
		font-size: 0.875rem;
	}
</style>
