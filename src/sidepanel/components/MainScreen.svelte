<script lang="ts">
	import { tick, untrack } from "svelte";
	import type { EpicTreeDto } from "../../domain/ports/epic-processor.port";
	import type { ProcessedPrsResult } from "../../domain/ports/pr-processor.port";
	import type { CachedPrData } from "../../shared/types/cache";
	import type { ClaudeSessionStorage, SessionIssueMapping } from "../../shared/types/claude-session";
	import {
		isCacheUpdatedEvent,
		isClaudeSessionsUpdatedEvent,
		isTabUrlChangedEvent,
	} from "../../shared/types/events";
	import { mergeSessionsIntoTree } from "../usecase/merge-sessions";
	import type { WorkspaceResources } from "../../shared/utils/workspace-resources";
	import { filterTreeByPin } from "../usecase/filter-tree-by-pin";
	import { findNodeInTree, nodeKeyFor } from "../usecase/find-node-in-tree";
	import type { PinnedTabsStore } from "../stores/pinned-tabs.svelte";
	import EpicSection from "./EpicSection.svelte";
	import EpicTabBar from "./EpicTabBar.svelte";
	import IssueSearchBox from "./IssueSearchBox.svelte";
	import LogoutButton from "./LogoutButton.svelte";
	import RelativeTime from "./RelativeTime.svelte";
	import type { DebugState } from "../../shared/types/messages";
	import DebugPanel from "./DebugPanel.svelte";
	import PrSection from "./PrSection.svelte";

	type Props = {
		onLogout: () => Promise<void>;
		fetchPrs: () => Promise<ProcessedPrsResult & { hasMore: boolean }>;
		fetchEpicTree: () => Promise<{ tree: EpicTreeDto; prsRawJson: string }>;
		getClaudeSessions: () => Promise<ClaudeSessionStorage>;
		getSessionIssueMappings: () => Promise<SessionIssueMapping>;
		getCachedPrs: () => Promise<CachedPrData | null>;
		loadPrsWithCache: (minutes: number) => Promise<(ProcessedPrsResult & { hasMore: boolean }) | null>;
		subscribeToMessages: (callback: (message: unknown) => void) => () => void;
		subscribeToMappingChanges?: (callback: () => void) => () => void;
		pinnedTabsStore: PinnedTabsStore;
		onNavigate?: (url: string) => void;
		onOpenWorkspace?: (resources: WorkspaceResources) => void;
		getCurrentTabUrl?: () => Promise<string | null>;
		getDebugState?: () => Promise<DebugState>;
	};

	const { onLogout, fetchPrs, fetchEpicTree, getClaudeSessions, getSessionIssueMappings, getCachedPrs, loadPrsWithCache, subscribeToMessages, subscribeToMappingChanges, pinnedTabsStore, onNavigate, onOpenWorkspace, getCurrentTabUrl, getDebugState }: Props = $props();

	/**
	 * sessions と mapping を並行取得する。
	 * mapping 側が reject しても sessions だけでツリーを構築できるよう allSettled を使い、
	 * 失敗時は空 mapping にフォールバックしつつ DEV ビルドで warn を残す。
	 * `getClaudeSessions` が reject した場合は従来通り上位 catch で epicError を表示する。
	 */
	async function fetchSessionsAndMapping(): Promise<{
		sessions: ClaudeSessionStorage;
		mapping: SessionIssueMapping;
	}> {
		const [sessionsResult, mappingResult] = await Promise.allSettled([
			getClaudeSessions(),
			getSessionIssueMappings(),
		]);
		if (sessionsResult.status === "rejected") {
			throw sessionsResult.reason;
		}
		if (mappingResult.status === "rejected") {
			if (import.meta.env.DEV) {
				console.warn(
					"[MainScreen] getSessionIssueMappings failed; falling back to empty mapping:",
					mappingResult.reason,
				);
			}
			return { sessions: sessionsResult.value, mapping: {} };
		}
		return { sessions: sessionsResult.value, mapping: mappingResult.value };
	}

	let showDebugPanel = $state(false);
	let searchNotFoundMessage = $state<string | null>(null);
	const SEARCH_HIT_ANIMATION_MS = 2500;
	const SEARCH_NOT_FOUND_TIMEOUT_MS = 3000;
	let searchNotFoundTimer: ReturnType<typeof setTimeout> | null = null;
	let searchHitTimer: ReturnType<typeof setTimeout> | null = null;

	function handlePin(tab: { type: "epic" | "issue"; number: number; title: string }): void {
		void pinnedTabsStore.pin(tab);
	}

	async function scrollAndFlash(nodeKey: string): Promise<void> {
		// Pin タブ切替などで DOM が差し替わる可能性があるため、Svelte の更新を待つ
		await tick();
		const el = document.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(nodeKey)}"]`);
		if (!el) {
			// findNodeInTree で存在確認済みでも親が折りたたまれていると DOM には無い。
			// サイレントにせずユーザーに伝える。
			showNotFound("該当ノードが現在表示されていません (親が折りたたまれている可能性)");
			return;
		}
		el.scrollIntoView({ behavior: "smooth", block: "center" });
		if (searchHitTimer) clearTimeout(searchHitTimer);
		el.classList.remove("search-hit");
		// Svelte の class バインディングではアニメーション再スタートが保証できないため、
		// reflow を強制して同一要素に再度 .search-hit を付与し animation を再生する
		void el.offsetWidth;
		el.classList.add("search-hit");
		searchHitTimer = setTimeout(() => {
			el.classList.remove("search-hit");
			searchHitTimer = null;
		}, SEARCH_HIT_ANIMATION_MS);
	}

	function showNotFound(message: string): void {
		searchNotFoundMessage = message;
		if (searchNotFoundTimer) clearTimeout(searchNotFoundTimer);
		searchNotFoundTimer = setTimeout(() => {
			searchNotFoundMessage = null;
			searchNotFoundTimer = null;
		}, SEARCH_NOT_FOUND_TIMEOUT_MS);
	}

	function handleSearchIssue(issueNumber: number): void {
		if (!epicData) {
			showNotFound("ツリーがまだロードされていません");
			return;
		}
		const node = findNodeInTree(epicData, issueNumber);
		if (!node) {
			showNotFound(`#${issueNumber} は現在のツリーに存在しません`);
			return;
		}
		searchNotFoundMessage = null;

		// Pin タブでフィルタされている場合、該当ノードが表示範囲外なら All タブに切り替える
		const key = pinnedTabsStore.activeKey;
		if (key && displayedTree && !findNodeInTree(displayedTree, issueNumber)) {
			void pinnedTabsStore.activate(null);
		}

		void scrollAndFlash(nodeKeyFor(node.kind));
	}

	$effect(() => {
		return () => {
			if (searchNotFoundTimer) clearTimeout(searchNotFoundTimer);
			if (searchHitTimer) clearTimeout(searchHitTimer);
		};
	});

	// activeKey から PinnedTabRef を導出してツリーをフィルタする
	const displayedTree = $derived.by(() => {
		if (!epicData) return null;
		const key = pinnedTabsStore.activeKey;
		if (!key) return epicData;
		const match = pinnedTabsStore.pinned.find((p) => `${p.type}-${p.number}` === key);
		if (!match) return epicData;
		const filtered = filterTreeByPin(epicData, { type: match.type, number: match.number });
		return filtered ?? epicData;
	});

	let loading = $state(true);
	let error = $state<string | null>(null);
	let data = $state<(ProcessedPrsResult & { hasMore: boolean }) | null>(null);
	let lastUpdatedAt = $state<string | undefined>(undefined);
	let activeTabUrl = $state<string | null>(null);
	let epicData = $state<EpicTreeDto | null>(null);
	let epicError = $state<string | null>(null);
	let activeWorkspaceIssueNumber = $state<number | null>(null);
	// session 未マージ状態のツリーを保持する。session / mapping イベントの再マージ時は
	// 必ずこれを source に使うことで、epicData (= session マージ済み) を再入力して
	// session ノードが累積するバグ (Phase 4 HIGH-3) を防ぐ。
	let treeWithPrs = $state<EpicTreeDto | null>(null);

	/**
	 * sessions と mapping を取得し、保持している treeWithPrs と結合して epicData を更新する。
	 * `isClaudeSessionsUpdatedEvent` と `subscribeToMappingChanges` の両方から呼ばれる。
	 * 両者は重複発火の可能性があるが、source が固定された treeWithPrs なので冪等。
	 * 失敗時は epicError にメッセージを設定し、本番でも console.error でログする
	 * (サイレントフォールバック禁止)。
	 */
	async function reloadSessionsAndMapping(): Promise<void> {
		try {
			const { sessions, mapping } = await fetchSessionsAndMapping();
			if (treeWithPrs) {
				epicData = mergeSessionsIntoTree(treeWithPrs, sessions, mapping);
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Failed to reload sessions";
			console.error("[MainScreen] reloadSessionsAndMapping failed:", err);
			epicError = message;
		}
	}

	function handleOpenWorkspace(resources: WorkspaceResources): void {
		activeWorkspaceIssueNumber = resources.issueNumber;
		onOpenWorkspace?.(resources);
	}

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

		try {
			// PR-Issue リンクは Rust/WASM (processEpicTree) 内で merge 済み。tree をそのまま採用する。
			const { tree } = await fetchEpicTree();
			// treeWithPrs は session 未マージ状態。再マージ時の source として保持する。
			const { sessions, mapping } = await fetchSessionsAndMapping();
			treeWithPrs = tree;
			epicData = mergeSessionsIntoTree(tree, sessions, mapping);
			epicError = null;
		} catch (e: unknown) {
			epicError = e instanceof Error ? e.message : "Failed to fetch epic tree";
		}
	}

	// 初期ロード: キャッシュ → loadPrsWithCache (新鮮度チェック付き)
	$effect(() => {
		let cancelled = false;

		untrack(async () => {
			// Pin タブの永続状態を復元
			try {
				await pinnedTabsStore.load();
			} catch (err: unknown) {
				if (import.meta.env.DEV) {
					console.warn("[MainScreen] pinnedTabsStore.load failed:", err);
				}
			}

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

			// Epic ツリーを取得し、Claude セッション情報をマージ
			// PR-Issue リンクは Rust/WASM (processEpicTree) 内で merge 済み。
			try {
				const { tree } = await fetchEpicTree();
				// session 未マージ状態のツリーを保持し、再マージ時の source とする。
				const { sessions, mapping } = await fetchSessionsAndMapping();
				if (!cancelled) {
					treeWithPrs = tree;
					epicData = mergeSessionsIntoTree(tree, sessions, mapping);
				}
			} catch (e: unknown) {
				if (!cancelled) {
					epicError = e instanceof Error ? e.message : "Failed to fetch epic tree";
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
			if (isClaudeSessionsUpdatedEvent(message)) {
				// subscribeToMappingChanges と重複発火する可能性があるが、
				// reloadSessionsAndMapping は treeWithPrs を source とするため冪等。
				void reloadSessionsAndMapping();
			}
		}

		const unsubscribe = subscribeToMessages(onMessage);

		return () => {
			unsubscribe();
		};
	});

	// sessionIssueMapping の更新 (LinkSessionDialog からの書き込み等) を購読して
	// 手動マッピング反映後にツリーを即座に再構築する。
	// isClaudeSessionsUpdatedEvent と重複発火する可能性があるが冪等 (common reloader)。
	$effect(() => {
		if (!subscribeToMappingChanges) return;
		const unsubscribe = subscribeToMappingChanges(() => {
			void reloadSessionsAndMapping();
		});
		return () => {
			unsubscribe();
		};
	});
</script>

<main>
	<header>
		<div class="header-top">
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
				{#if getDebugState}
					<button
						class="debug-toggle"
						class:active={showDebugPanel}
						onclick={() => { showDebugPanel = !showDebugPanel; }}
						aria-label="Toggle debug panel"
					>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
							<path d="M4.978.855a.5.5 0 1 0-.956.29l.41 1.352A4.985 4.985 0 0 0 3 6h10a4.985 4.985 0 0 0-1.432-3.503l.41-1.352a.5.5 0 1 0-.956-.29l-.291.956A4.978 4.978 0 0 0 8 1a4.979 4.979 0 0 0-2.731.811l-.29-.956zM13 6v1H8.5V3.556a4.024 4.024 0 0 1 2.231.811l.291-.956zM6 .278l.291.956A4.028 4.028 0 0 0 4.018 3.5L3 6v1h4.5V3.556A4.094 4.094 0 0 1 6 .278zM1 8.5A.5.5 0 0 1 1.5 8H6v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5H1.5a.5.5 0 0 1-.5-.5zm9.5-.5H15a.5.5 0 0 1 0 1h-1.5V12a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V8.5z"/>
						</svg>
					</button>
				{/if}
				<LogoutButton {onLogout} />
			</div>
		</div>
		<IssueSearchBox onSearch={handleSearchIssue} notFoundMessage={searchNotFoundMessage} />
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
		{#if epicError}
			<div class="error-banner"><p class="error-text">{epicError}</p></div>
		{/if}
		<EpicTabBar store={pinnedTabsStore} />
		<EpicSection tree={displayedTree} onPin={handlePin} {onNavigate} onOpenWorkspace={handleOpenWorkspace} {activeTabUrl} {activeWorkspaceIssueNumber} />
		<PrSection title="Review Requests" items={data.reviewRequests.items} {onNavigate} {activeTabUrl} />
	{/if}

	{#if showDebugPanel && getDebugState}
		<DebugPanel {getDebugState} />
	{/if}
</main>

<style>
	header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--color-border-primary);
		position: sticky;
		top: 0;
		background: var(--color-bg-primary);
		z-index: 10;
	}

	.header-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
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

	.debug-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: none;
		border: 1px solid transparent;
		border-radius: 3px;
		cursor: pointer;
		color: var(--color-text-secondary);
		transition: color 0.15s, border-color 0.15s;
	}

	.debug-toggle:hover {
		color: var(--color-accent-primary);
		border-color: var(--color-border-primary);
	}

	.debug-toggle.active {
		color: var(--color-accent-primary);
		border-color: var(--color-accent-primary);
	}
</style>
