<script lang="ts">
	import { untrack } from "svelte";
	import type { EpicTreeDto } from "../domain/ports/epic-processor.port";
	import type { ClaudeSessionStorage } from "../shared/types/claude-session";
	import LoginScreen from "./components/LoginScreen.svelte";
	import MainScreen from "./components/MainScreen.svelte";
	import type { createAuthUseCase } from "../shared/usecase/auth.usecase.js";
	import type { createPrUseCase } from "../shared/usecase/pr.usecase.js";
	import type { DeviceFlowController } from "../shared/usecase/device-flow.controller.js";
	import type { WorkspaceResources } from "../shared/utils/workspace-resources";
	import type { PinnedTabsStore } from "./stores/pinned-tabs.svelte";

	type Props = {
		authUseCase: Pick<ReturnType<typeof createAuthUseCase>, "checkAuth" | "logout">;
		prUseCase: ReturnType<typeof createPrUseCase>;
		fetchEpicTree: () => Promise<{ tree: EpicTreeDto; prsRawJson: string }>;
		getClaudeSessions: () => Promise<ClaudeSessionStorage>;
		deviceFlowController: DeviceFlowController;
		subscribeToMessages: (callback: (message: unknown) => void) => () => void;
		pinnedTabsStore: PinnedTabsStore;
		onNavigate?: (url: string) => void;
		onOpenWorkspace?: (resources: WorkspaceResources) => void;
		getCurrentTabUrl?: () => Promise<string | null>;
	};
	const { authUseCase, prUseCase, fetchEpicTree, getClaudeSessions, deviceFlowController, subscribeToMessages, pinnedTabsStore, onNavigate, onOpenWorkspace, getCurrentTabUrl }: Props = $props();

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
	<MainScreen onLogout={handleLogout} fetchPrs={() => prUseCase.fetchPrs()} {fetchEpicTree} {getClaudeSessions} getCachedPrs={() => prUseCase.getCachedPrs()} loadPrsWithCache={(minutes: number) => prUseCase.loadPrsWithCache(minutes)} {subscribeToMessages} {pinnedTabsStore} {onNavigate} {onOpenWorkspace} {getCurrentTabUrl} />
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
