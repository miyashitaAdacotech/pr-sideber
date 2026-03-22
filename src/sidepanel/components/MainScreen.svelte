<script lang="ts">
	import { untrack } from "svelte";
	import { loadGreeting } from "../../wasm/index.js";
	import LogoutButton from "./LogoutButton.svelte";

	type Props = {
		onLogout: () => Promise<void>;
	};

	const { onLogout }: Props = $props();

	let message = $state("Loading WASM...");

	$effect(() => {
		let cancelled = false;

		untrack(async () => {
			try {
				const greeting = await loadGreeting("PR Sidebar");
				if (!cancelled) {
					message = greeting;
				}
			} catch (e: unknown) {
				if (!cancelled) {
					const errorMessage =
						e instanceof Error ? e.message : "Unknown error";
					message = `WASM init failed: ${errorMessage}`;
				}
			}
		});

		return () => {
			cancelled = true;
		};
	});
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
