<script lang="ts">
	import { loadGreeting } from "../../wasm/index.js";
	import LogoutButton from "./LogoutButton.svelte";

	type Props = {
		onLogout: () => Promise<void>;
	};

	const { onLogout }: Props = $props();

	let message = $state("Loading WASM...");

	async function load() {
		try {
			message = await loadGreeting("PR Sidebar");
		} catch (e: unknown) {
			const errorMessage =
				e instanceof Error ? e.message : "Unknown error";
			message = `WASM init failed: ${errorMessage}`;
		}
	}

	load();
</script>

<main>
	<header>
		<h1>PR Sidebar</h1>
		<LogoutButton {onLogout} />
	</header>
	<p>{message}</p>
</main>

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	main {
		padding: 1rem;
	}
</style>
