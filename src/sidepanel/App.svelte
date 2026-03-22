<script lang="ts">
	import { untrack } from "svelte";
	import LoginScreen from "./components/LoginScreen.svelte";
	import MainScreen from "./components/MainScreen.svelte";
	import { createAuthUseCase } from "./usecase/auth.usecase.js";

	const authUseCase = createAuthUseCase((msg) => chrome.runtime.sendMessage(msg));

	let authenticated = $state(false);
	let loading = $state(true);

	$effect(() => {
		let cancelled = false;

		untrack(async () => {
			const result = await authUseCase.checkAuth();
			if (!cancelled) {
				authenticated = result;
				loading = false;
			}
		});

		return () => {
			cancelled = true;
		};
	});

	async function handleLogin(): Promise<void> {
		await authUseCase.login();
		authenticated = true;
	}

	async function handleLogout(): Promise<void> {
		await authUseCase.logout();
		authenticated = false;
	}
</script>

{#if loading}
	<p>Loading...</p>
{:else if authenticated}
	<MainScreen onLogout={handleLogout} />
{:else}
	<LoginScreen onLogin={handleLogin} />
{/if}
