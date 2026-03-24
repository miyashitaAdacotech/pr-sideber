<script lang="ts">
	import { untrack } from "svelte";
	import LoginScreen from "./components/LoginScreen.svelte";
	import MainScreen from "./components/MainScreen.svelte";
	import type { createAuthUseCase } from "../shared/usecase/auth.usecase.js";
	import type { createPrUseCase } from "../shared/usecase/pr.usecase.js";
	import type { DeviceFlowController } from "../shared/usecase/device-flow.controller.js";

	type Props = {
		authUseCase: Pick<ReturnType<typeof createAuthUseCase>, "checkAuth" | "logout">;
		prUseCase: ReturnType<typeof createPrUseCase>;
		deviceFlowController: DeviceFlowController;
		subscribeToMessages: (callback: (message: unknown) => void) => () => void;
		onNavigate?: (url: string) => void;
		getCurrentTabUrl?: () => Promise<string | null>;
	};
	const { authUseCase, prUseCase, deviceFlowController, subscribeToMessages, onNavigate, getCurrentTabUrl }: Props = $props();

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

	$effect(() => {
		return deviceFlowController.subscribe((state) => {
			if (state.phase === "success") {
				authenticated = true;
			}
		});
	});

	async function handleLogout(): Promise<void> {
		await authUseCase.logout();
		authenticated = false;
	}
</script>

{#if loading}
	<div class="loading">
		<p>Loading...</p>
	</div>
{:else if authenticated}
	<MainScreen onLogout={handleLogout} fetchPrs={() => prUseCase.fetchPrs()} getCachedPrs={() => prUseCase.getCachedPrs()} loadPrsWithCache={(minutes: number) => prUseCase.loadPrsWithCache(minutes)} {subscribeToMessages} {onNavigate} {getCurrentTabUrl} />
{:else}
	<LoginScreen controller={deviceFlowController} />
{/if}

<style>
	.loading {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}
</style>
