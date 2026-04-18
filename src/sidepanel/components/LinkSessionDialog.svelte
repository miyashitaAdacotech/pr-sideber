<script lang="ts">
	import { flushSync, onDestroy } from "svelte";
	import { setMapping as defaultSetMapping } from "../../shared/utils/session-mapping-store";
	import { extractIssueNumberCandidates } from "../usecase/extract-issue-number-candidates";

	type Props = {
		title: string;
		sessionId: string;
		onClose: () => void;
		setMapping?: (sessionId: string, issueNumber: number) => Promise<void>;
	};

	const { title, sessionId, onClose, setMapping = defaultSetMapping }: Props = $props();

	let inputValue = $state("");
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);
	// ダイアログ本体 (role=dialog の div) への参照。Esc の keydown をここで受けるのと、
	// mount 直後に初期フォーカスを当てるために使う。
	let dialogEl: HTMLDivElement | null = $state(null);

	// submit の await 中にコンポーネントが unmount された場合に destroyed state への
	// 書き込みを防ぐためのフラグ。onDestroy で false にする。
	let mounted = true;
	onDestroy(() => {
		mounted = false;
	});

	const candidates = $derived(extractIssueNumberCandidates(title));

	// `Number.parseInt` は "1.5" も 1 として受理し、さらに "001" を 1 に潰すため、
	// 入力文字列が「先頭ゼロなしの正整数」であることを正規表現で追加検証する。
	// これにより「0」「001」「負数」「小数」「非数値」を submit 前に弾き、
	// UI 表示 (文字列) と mapping 書き込み (整数) の乖離を防ぐ。
	const INTEGER_PATTERN = /^[1-9]\d*$/;
	const parsed = $derived(Number.parseInt(inputValue, 10));
	const isValid = $derived(
		INTEGER_PATTERN.test(inputValue) && Number.isInteger(parsed) && parsed > 0,
	);

	function handleChipClick(candidate: string): void {
		// テストで同期的に DOM 状態を検証できるよう、および連続したユーザー操作で
		// ちらつきを防ぐため明示的に同期化する。
		flushSync(() => {
			inputValue = candidate;
		});
	}

	function handleCancel(): void {
		onClose();
	}

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!isValid || busy) return;
		busy = true;
		errorMessage = null;
		try {
			await setMapping(sessionId, parsed);
			// unmount 後の state 書き込みを避ける (onClose の呼び出しは許容)。
			if (!mounted) return;
			onClose();
		} catch (e: unknown) {
			if (!mounted) return;
			// サイレントフォールバックを避けるため、ログ + UI 両方で通知する。
			const message = e instanceof Error ? e.message : String(e);
			errorMessage = message;
			console.error("[LinkSessionDialog] setMapping failed:", e);
		} finally {
			// unmount 後の $state 書き込みは Svelte のランタイム警告を招くため mounted を確認。
			if (mounted) busy = false;
		}
	}

	// Esc キーはダイアログ本体 (focus が当たっている間) のみで処理する。
	// window 登録だと複数ダイアログが同時オープンしたとき全てが反応する問題があるため
	// ダイアログ要素に限定し、かつ stopPropagation で外側に伝播させない。
	function handleKeydown(e: KeyboardEvent): void {
		if (e.key !== "Escape") return;
		e.stopPropagation();
		e.preventDefault();
		onClose();
	}

	// mount 後、Esc を受け取れるようにダイアログ本体に初期フォーカスを当てる。
	// tabindex="-1" により JS からの focus() が可能。ユーザーはチップ / input に
	// Tab で移動できる (最低限の focus 起点提供; 完全な focus trap は別 Issue)。
	$effect(() => {
		dialogEl?.focus();
	});
</script>

<!-- overlay はクリックで閉じない設計 (誤操作で未送信状態を失わないため) -->
<div class="link-session-overlay">
	<div
		bind:this={dialogEl}
		class="link-session-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="link-session-dialog-title"
		tabindex="-1"
		onkeydown={handleKeydown}
	>
		<h2 id="link-session-dialog-title" class="link-session-title">Issue に紐付け</h2>
		<p class="link-session-subtitle">{title}</p>

		{#if candidates.length > 0}
			<div class="suggest-chips">
				{#each candidates as candidate (candidate)}
					<button
						type="button"
						class="issue-suggest-chip"
						onclick={() => handleChipClick(candidate)}
					>
						#{candidate}
					</button>
				{/each}
			</div>
		{/if}

		<form class="link-session-form" onsubmit={handleSubmit}>
			<label class="input-label" for="issue-number-input">
				Issue 番号
				<input
					id="issue-number-input"
					class="issue-number-input"
					type="text"
					inputmode="numeric"
					bind:value={inputValue}
					placeholder="例: 123"
					disabled={busy}
				/>
			</label>

			{#if errorMessage}
				<div class="link-session-error" role="alert">{errorMessage}</div>
			{/if}

			<div class="button-row">
				<button type="button" class="cancel-btn" onclick={handleCancel} disabled={busy}>
					キャンセル
				</button>
				<button type="submit" class="submit-btn" disabled={!isValid || busy}>
					紐付ける
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	/* overlay は最前面で表示する (サイドパネル内の他要素より上)。 */
	.link-session-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		/* header (z-index: 10) より上で表示する。将来グローバル定義を導入しやすいよう
		   CSS 変数 `--z-modal` を優先し、未定義時は 1000 にフォールバックする。 */
		z-index: var(--z-modal, 1000);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.link-session-dialog {
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border-primary);
		border-radius: 6px;
		/* sidebar 幅 (~400px) に収まるよう最大幅を絞る */
		max-width: 360px;
		width: 100%;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		color: var(--color-text-primary);
	}

	.link-session-dialog:focus {
		/* tabindex="-1" による focus リングを出すと UX 上ノイズのため抑制する。 */
		outline: none;
	}

	.link-session-title {
		font-size: 0.9375rem;
		font-weight: 600;
		margin: 0;
	}

	.link-session-subtitle {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.suggest-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.issue-suggest-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.1875rem 0.5rem;
		font-size: 0.75rem;
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border-primary);
		border-radius: 10px;
		color: var(--color-text-primary);
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.issue-suggest-chip:hover {
		background: var(--color-bg-hover);
		border-color: var(--color-accent-primary);
	}

	.link-session-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.issue-number-input {
		padding: 0.375rem 0.5rem;
		font-size: 0.875rem;
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border-primary);
		border-radius: 4px;
		color: var(--color-text-primary);
	}

	.issue-number-input:focus {
		outline: none;
		border-color: var(--color-accent-primary);
	}

	.link-session-error {
		padding: 0.375rem 0.5rem;
		background: rgba(248, 81, 73, 0.1);
		border: 1px solid var(--color-badge-red);
		border-radius: 4px;
		color: var(--color-badge-red);
		font-size: 0.75rem;
	}

	.button-row {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.cancel-btn,
	.submit-btn {
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		border-radius: 4px;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.cancel-btn {
		background: none;
		border: 1px solid var(--color-border-primary);
		color: var(--color-text-primary);
	}

	.submit-btn {
		background: var(--color-accent-primary);
		border: 1px solid var(--color-accent-primary);
		color: var(--color-bg-primary);
	}

	.cancel-btn:disabled,
	.submit-btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
