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
	};
	const { authUseCase, prUseCase, deviceFlowController }: Props = $props();

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
	<p>Loading...</p>
{:else if authenticated}
	<MainScreen onLogout={handleLogout} fetchPrs={() => prUseCase.fetchPrs("@me")} getCachedPrs={() => prUseCase.getCachedPrs()} />
{:else}
	<LoginScreen controller={deviceFlowController} />
{/if}
