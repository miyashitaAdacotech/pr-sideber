<script lang="ts">
	import { untrack } from "svelte";
	import LoginScreen from "./components/LoginScreen.svelte";
	import MainScreen from "./components/MainScreen.svelte";
	import type { DeviceFlowState, createAuthUseCase } from "../shared/usecase/auth.usecase.js";

	type Props = { authUseCase: ReturnType<typeof createAuthUseCase> };
	const { authUseCase }: Props = $props();

	let authenticated = $state(false);
	let loading = $state(true);

	/** Device Flow 開始時に取得した情報を保持する */
	let pendingDeviceCode = $state<string | null>(null);
	let pendingInterval = $state(5);
	let pendingExpiresIn = $state(900);

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

	async function handleStartDeviceFlow(): Promise<{
		userCode: string;
		verificationUri: string;
	}> {
		const result = await authUseCase.requestDeviceCode();
		pendingDeviceCode = result.deviceCode;
		pendingInterval = result.interval;
		pendingExpiresIn = result.expiresIn;
		return {
			userCode: result.userCode,
			verificationUri: result.verificationUri,
		};
	}

	async function handleWaitForAuthorization(
		onStateChange: (state: DeviceFlowState) => void,
	): Promise<void> {
		if (!pendingDeviceCode) {
			throw new Error("No pending device code");
		}
		await authUseCase.waitForAuthorization(
			pendingDeviceCode,
			pendingInterval,
			pendingExpiresIn,
			onStateChange,
		);
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
	<LoginScreen
		onStartDeviceFlow={handleStartDeviceFlow}
		onWaitForAuthorization={handleWaitForAuthorization}
	/>
{/if}
