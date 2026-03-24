<script lang="ts">
	import { untrack } from "svelte";
	import type { ProcessedPrsResult } from "../../domain/ports/pr-processor.port";
	import type { CachedPrData } from "../../shared/types/cache";
	import { isCacheUpdatedEvent, isTabUrlChangedEvent } from "../../shared/types/events";
	import LogoutButton from "./LogoutButton.svelte";
	import RelativeTime from "./RelativeTime.svelte";
	import PrSection from "./PrSection.svelte";

	type Props = {
		onLogout: () => Promise<void>;
		fetchPrs: () => Promise<ProcessedPrsResult & { hasMore: boolean }>;
		getCachedPrs: () => Promise<CachedPrData | null>;
		loadPrsWithCache: (minutes: number) => Promise<(ProcessedPrsResult & { hasMore: boolean }) | null>;
		subscribeToMessages: (callback: (message: unknown) => void) => () => void;
		onNavigate?: (url: string) => void;
		getCurrentTabUrl?: () => Promise<string | null>;
	};

	const { onLogout, fetchPrs, getCachedPrs, loadPrsWithCache, subscribeToMessages, onNavigate, getCurrentTabUrl }: Props = $props();

	let loading = $state(true);
	let error = $state<string | null>(null);
	let data = $state<(ProcessedPrsResult & { hasMore: boolean }) | null>(null);
	let lastUpdatedAt = $state<string | undefined>(undefined);
	let activeTabUrl = $state<string | null>(null);

	async function loadPrs(): Promise<void> {
		loading = true;
		error = null;
		try {
			data = await fetchPrs();
			lastUpdatedAt = new Date().toISOString();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : "Unknown error";
		} finally {
			loading = false;
		}
	}

	// 初期ロード: キャッシュ → loadPrsWithCache (新鮮度チェック付き)
	$effect(() => {
		let cancelled = false;

		untrack(async () => {
			// まずキャッシュから表示
			try {
				const cached = await getCachedPrs();
				if (!cancelled && cached) {
					data = cached.data;
					lastUpdatedAt = cached.lastUpdatedAt;
					loading = false;
				}
			} catch (err: unknown) {
				if (import.meta.env.DEV) {
					console.warn("[MainScreen] cache read failed:", err);
				}
			}

			// loadPrsWithCache で新鮮度チェック付きフェッチ
			try {
				const result = await loadPrsWithCache(2);
				if (!cancelled && result) {
					data = result;
					// loadPrsWithCache 内でキャッシュが更新されているので getCachedPrs で最新の lastUpdatedAt を取得
					const freshCache = await getCachedPrs();
					if (!cancelled && freshCache) {
						lastUpdatedAt = freshCache.lastUpdatedAt;
					}
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

			// 現在のタブ URL を取得してハイライトに使う
			try {
				const url = await getCurrentTabUrl?.();
				if (!cancelled && url) {
					activeTabUrl = url;
				}
			} catch (err: unknown) {
				if (import.meta.env.DEV) {
					console.warn("[MainScreen] getCurrentTabUrl failed:", err);
				}
			}
		});

		return () => {
			cancelled = true;
		};
	});

	// CACHE_UPDATED リスナー
	$effect(() => {
		function onMessage(message: unknown): void {
			if (isCacheUpdatedEvent(message)) {
				getCachedPrs()
					.then((cached) => {
						if (cached) {
							data = cached.data;
							lastUpdatedAt = cached.lastUpdatedAt;
						}
					})
					.catch((err: unknown) => {
						if (import.meta.env.DEV) {
							console.warn("[MainScreen] cache reload failed:", err);
						}
					});
			}
			if (isTabUrlChangedEvent(message)) {
				activeTabUrl = message.url;
			}
		}

		const unsubscribe = subscribeToMessages(onMessage);

		return () => {
			unsubscribe();
		};
	});
</script>

<main>
	<header>
		<div class="header-left">
			<h1>PR Sidebar</h1>
			<button
				class="reload-button"
				class:spinning={loading}
				onclick={loadPrs}
				disabled={loading}
				aria-label="Reload"
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
					<path d="M8 3a5 5 0 0 0-4.546 2.914.5.5 0 1 1-.908-.428A6 6 0 1 1 2.25 9.665a.5.5 0 1 1 .958.286A5 5 0 1 0 8 3z"/>
					<path d="M8 1.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V2a.5.5 0 0 1 .5-.5z"/>
					<path d="M5.146 3.854a.5.5 0 0 1 0-.708l2.5-2.5a.5.5 0 0 1 .708.708l-2.5 2.5a.5.5 0 0 1-.708 0z"/>
				</svg>
			</button>
		</div>
		<div class="header-right">
			{#if lastUpdatedAt}
				<span class="last-updated"><RelativeTime dateStr={lastUpdatedAt} /></span>
			{/if}
			<LogoutButton {onLogout} />
		</div>
	</header>

	{#if loading && !data}
		<p>Loading...</p>
	{:else if error && !data}
		<div class="error-container">
			<p class="error">{error}</p>
			<button class="retry-button" onclick={loadPrs}>再試行</button>
		</div>
	{:else if data}
		{#if error}
			<div class="error-banner">
				<p class="error-text">{error}</p>
			</div>
		{/if}
		<PrSection title="My PRs" items={data.myPrs.items} {onNavigate} {activeTabUrl} />
		<PrSection title="Review Requests" items={data.reviewRequests.items} {onNavigate} {activeTabUrl} />
	{/if}
</main>

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--color-border-primary);
		position: sticky;
		top: 0;
		background: var(--color-bg-primary);
		z-index: 10;
	}

	h1 {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	main {
		padding: 0.75rem;
		min-height: 100vh;
		background: var(--color-bg-primary);
	}

	.reload-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: none;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		cursor: pointer;
		color: #586069;
		transition: color 0.15s;
	}

	.reload-button:hover:not(:disabled) {
		color: #0366d6;
		border-color: #0366d6;
	}

	.reload-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.reload-button.spinning svg {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.last-updated {
		font-size: 0.75rem;
		color: #6a737d;
	}

	.error-banner {
		background: #fff3cd;
		border: 1px solid #ffc107;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.75rem;
	}

	.error-text {
		color: #856404;
		font-size: 0.875rem;
		margin: 0;
	}

	.error-container {
		text-align: center;
		padding: 1rem 0;
	}

	.error {
		color: var(--color-badge-red);
	}

	.retry-button {
		margin-top: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: var(--color-accent-primary);
		color: var(--color-bg-primary);
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.875rem;
		transition: opacity 0.15s;
	}

	.retry-button:hover {
		opacity: 0.85;
	}

	.retry-button:active {
		opacity: 0.7;
	}
</style>
