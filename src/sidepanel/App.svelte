<script lang="ts">
	import { loadGreeting } from "../wasm/index.js";

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
	<h1>PR Sidebar</h1>
	<p>{message}</p>
</main>
