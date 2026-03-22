<script lang="ts">
	import LoginScreen from "./components/LoginScreen.svelte";
	import MainScreen from "./components/MainScreen.svelte";
	import { login, logout, checkAuth } from "./usecase/auth.usecase.js";

	let authenticated = $state(false);
	let loading = $state(true);

	async function initialize() {
		try {
			authenticated = await checkAuth();
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : "Unknown error";
			console.error("Auth check failed:", message);
			authenticated = false;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		initialize();
	});

	async function handleLogin(): Promise<void> {
		await login();
		authenticated = true;
	}

	async function handleLogout(): Promise<void> {
		await logout();
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
