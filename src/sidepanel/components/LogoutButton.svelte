<script lang="ts">
	type Props = {
		onLogout: () => Promise<void>;
	};

	const { onLogout }: Props = $props();
</script>

<button onclick={onLogout}>Logout</button>

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
</style>
