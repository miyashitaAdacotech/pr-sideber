<script lang="ts">
	import { untrack } from "svelte";
	import type { FetchPullRequestsResult } from "../../domain/types/github";
	import LogoutButton from "./LogoutButton.svelte";
	import PrSection from "./PrSection.svelte";

	type Props = {
		onLogout: () => Promise<void>;
		fetchPrs: () => Promise<FetchPullRequestsResult>;
	};

	const { onLogout, fetchPrs }: Props = $props();

	let loading = $state(true);
	let error = $state<string | null>(null);
	let data = $state<FetchPullRequestsResult | null>(null);

	async function loadPrs(): Promise<void> {
		loading = true;
		error = null;
		try {
			data = await fetchPrs();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : "Unknown error";
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		let cancelled = false;

		untrack(async () => {
			loading = true;
			error = null;
			try {
				const result = await fetchPrs();
				if (!cancelled) {
					data = result;
				}
			} catch (e: unknown) {
				if (!cancelled) {
					error = e instanceof Error ? e.message : "Unknown error";
				}
			} finally {
				if (!cancelled) {
					loading = false;
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

	{#if loading}
		<p>Loading...</p>
	{:else if error}
		<div class="error-container">
			<p class="error">{error}</p>
			<button class="retry-button" onclick={loadPrs}>再試行</button>
		</div>
	{:else if data}
		<PrSection title="My PRs" items={data.myPrs} />
		<PrSection title="Review Requests" items={data.reviewRequested} />
	{/if}
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

	.error-container {
		text-align: center;
		padding: 1rem 0;
	}

	.error {
		color: #d73a49;
	}

	.retry-button {
		margin-top: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: #0366d6;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.retry-button:hover {
		background: #0256b9;
	}
</style>
