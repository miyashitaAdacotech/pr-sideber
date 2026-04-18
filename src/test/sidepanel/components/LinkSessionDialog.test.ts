import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
// LinkSessionDialog.svelte は Phase 3 の GREEN フェーズで新規作成される。
// svelte-check はプロジェクト設定上、未解決モジュールの import を型エラー扱いしないため
// 通常 import で記述する。vitest 実行時にはモジュール解決が走り、
// 未作成のためテストが全て RED (失敗) になる。
import LinkSessionDialog from "../../../sidepanel/components/LinkSessionDialog.svelte";

/**
 * LinkSessionDialog の単体テスト (Phase 3 / Issue #47)。
 *
 * このダイアログは TreeNode の session 分岐から開かれ、
 * ユーザーが Issue 番号を手動入力してセッションを任意 Issue に紐付ける。
 *
 * Props 設計:
 *   - title:      入力済みセッションタイトル (サジェスト候補抽出元)
 *   - sessionId:  紐付け対象のセッション ID (SESSION_ID_PATTERN 準拠)
 *   - onClose:    閉じる要求コールバック (Esc / キャンセル / 送信完了時)
 *   - setMapping: chrome.storage 書き込み関数 (DI 設計でテスタビリティを優先)
 *
 * テスト全体がモジュール未存在により RED となる。
 */

describe("LinkSessionDialog", () => {
	let component: ReturnType<typeof mount> | null = null;

	afterEach(() => {
		if (component) {
			unmount(component);
			component = null;
		}
		document.body.innerHTML = "";
	});

	function defaultProps(
		overrides: Partial<{
			title: string;
			sessionId: string;
			onClose: () => void;
			setMapping: (sessionId: string, issueNumber: number) => Promise<void>;
		}> = {},
	) {
		return {
			title: overrides.title ?? "Fix #123 related to 456",
			sessionId: overrides.sessionId ?? "session_abcdef123456",
			onClose: overrides.onClose ?? vi.fn(),
			setMapping: overrides.setMapping ?? vi.fn(async () => {}),
		};
	}

	it("title/sessionId を Props で渡してマウントできる", () => {
		component = mount(LinkSessionDialog, {
			target: document.body,
			props: defaultProps(),
		});
		const dialog = document.querySelector(".link-session-dialog");
		expect(dialog).not.toBeNull();
	});

	it("title から抽出したサジェストチップが最大 5 件描画される", () => {
		component = mount(LinkSessionDialog, {
			target: document.body,
			props: defaultProps({ title: "111 222 333 444 555 666 777" }),
		});
		const chips = document.querySelectorAll(".issue-suggest-chip");
		expect(chips.length).toBeLessThanOrEqual(5);
		expect(chips.length).toBe(5);
	});

	it("サジェストチップをクリックすると input にその数字が入る", () => {
		component = mount(LinkSessionDialog, {
			target: document.body,
			props: defaultProps({ title: "Fix #123" }),
		});
		const chip = document.querySelector(".issue-suggest-chip") as HTMLElement | null;
		expect(chip).not.toBeNull();
		chip?.click();
		const input = document.querySelector(".issue-number-input") as HTMLInputElement | null;
		expect(input).not.toBeNull();
		expect(input?.value).toBe("123");
	});

	it("空 input で submit しても setMapping は呼ばれない", () => {
		const setMapping = vi.fn(async () => {});
		component = mount(LinkSessionDialog, {
			target: document.body,
			props: defaultProps({ setMapping }),
		});
		const form = document.querySelector(".link-session-form") as HTMLFormElement | null;
		expect(form).not.toBeNull();
		form?.requestSubmit();
		expect(setMapping).not.toHaveBeenCalled();
	});

	it("不正な値 (0 / 先頭ゼロ / 負数 / 非数値 / 小数) では setMapping は呼ばれない", () => {
		const setMapping = vi.fn(async () => {});
		// Phase 4 レビュー CRITICAL-1: "001" のような先頭ゼロは Number.parseInt で 1 に
		// 縮退する。UI 表示と実際の書き込み値が乖離するため invalid として弾く。
		const invalidValues = ["0", "001", "-1", "abc", "1.5"];
		for (const value of invalidValues) {
			// 各ケースで独立に mount/unmount する (テスト間で DOM 状態を分離)
			const localComponent = mount(LinkSessionDialog, {
				target: document.body,
				props: defaultProps({ setMapping }),
			});
			const input = document.querySelector(".issue-number-input") as HTMLInputElement | null;
			const form = document.querySelector(".link-session-form") as HTMLFormElement | null;
			expect(input).not.toBeNull();
			expect(form).not.toBeNull();
			if (input) {
				input.value = value;
				input.dispatchEvent(new Event("input", { bubbles: true }));
			}
			form?.requestSubmit();
			unmount(localComponent);
			document.body.innerHTML = "";
		}
		expect(setMapping).not.toHaveBeenCalled();
	});

	it("正当な入力 + submit で setMapping(sessionId, number) が 1 回呼ばれ、その後 onClose が呼ばれる", async () => {
		const setMapping = vi.fn(async () => {});
		const onClose = vi.fn();
		component = mount(LinkSessionDialog, {
			target: document.body,
			props: defaultProps({
				sessionId: "session_testmapping01",
				setMapping,
				onClose,
			}),
		});
		const input = document.querySelector(".issue-number-input") as HTMLInputElement | null;
		expect(input).not.toBeNull();
		if (input) {
			input.value = "42";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
		const form = document.querySelector(".link-session-form") as HTMLFormElement | null;
		expect(form).not.toBeNull();
		form?.requestSubmit();
		// setMapping が await されるため micro task を流す
		await Promise.resolve();
		await Promise.resolve();
		expect(setMapping).toHaveBeenCalledTimes(1);
		expect(setMapping).toHaveBeenCalledWith("session_testmapping01", 42);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("Esc キー押下で onClose が呼ばれる", () => {
		const onClose = vi.fn();
		component = mount(LinkSessionDialog, {
			target: document.body,
			props: defaultProps({ onClose }),
		});
		const dialog = document.querySelector(".link-session-dialog") as HTMLElement | null;
		expect(dialog).not.toBeNull();
		const escEvent = new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true,
			cancelable: true,
		});
		(dialog ?? document).dispatchEvent(escEvent);
		expect(onClose).toHaveBeenCalled();
	});

	it("キャンセルボタンで onClose が呼ばれ、setMapping は呼ばれない", () => {
		const setMapping = vi.fn(async () => {});
		const onClose = vi.fn();
		component = mount(LinkSessionDialog, {
			target: document.body,
			props: defaultProps({ setMapping, onClose }),
		});
		const cancel = document.querySelector(".cancel-btn") as HTMLElement | null;
		expect(cancel).not.toBeNull();
		cancel?.click();
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(setMapping).not.toHaveBeenCalled();
	});

	it("overlay クリックでは閉じない (onClose が呼ばれない)", () => {
		const onClose = vi.fn();
		component = mount(LinkSessionDialog, {
			target: document.body,
			props: defaultProps({ onClose }),
		});
		const overlay = document.querySelector(".link-session-overlay") as HTMLElement | null;
		expect(overlay).not.toBeNull();
		overlay?.click();
		expect(onClose).not.toHaveBeenCalled();
	});

	// HIGH-2 (Phase 3b レビュー指摘): setMapping が reject した場合、
	// ダイアログ内にエラーを表示し、onClose は呼ばない。
	// サイレントフォールバック (try/catch での握りつぶし) を検知するため、
	// rejection 発生時に利用者がエラーを認識できる UI になっていることを保証する。
	it("setMapping が reject した場合、エラー表示が出て onClose は呼ばれない", async () => {
		const rejectionMessage = "storage quota exceeded";
		const setMapping = vi.fn(async () => {
			throw new Error(rejectionMessage);
		});
		const onClose = vi.fn();
		component = mount(LinkSessionDialog, {
			target: document.body,
			props: defaultProps({
				sessionId: "session_errortest0001",
				setMapping,
				onClose,
			}),
		});
		const input = document.querySelector(".issue-number-input") as HTMLInputElement | null;
		expect(input).not.toBeNull();
		if (input) {
			input.value = "7";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
		const form = document.querySelector(".link-session-form") as HTMLFormElement | null;
		expect(form).not.toBeNull();
		form?.requestSubmit();
		// setMapping の promise rejection がハンドリングされ、UI に反映されるまで
		// micro task キューを数回流す (正常系の await パターンと揃える)。
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(setMapping).toHaveBeenCalledTimes(1);
		expect(onClose).not.toHaveBeenCalled();

		// エラー表示要素を検出する。
		// 専用クラス `.link-session-error` またはエラー文言 (message の一部 or 「エラー」)
		// のいずれかが DOM 上に存在すれば合格とする (実装の自由度を許容)。
		const errorElement = document.querySelector(".link-session-error");
		const bodyText = document.body.textContent ?? "";
		const hasErrorText = bodyText.includes(rejectionMessage) || bodyText.includes("エラー");
		expect(errorElement !== null || hasErrorText).toBe(true);
	});

	// HIGH-3 (Phase 3b レビュー指摘): submit 中の多重クリックで setMapping が
	// 複数回呼ばれないこと (busy state による多重 submit ガード) を保証する。
	// 同じ sessionId への不要な書き込み / race condition を防ぐ。
	it("submit 中に連続で requestSubmit しても setMapping は 1 回しか呼ばれない", async () => {
		// Promise を外部から resolve できる形にして「処理中」状態を作る。
		let resolve!: () => void;
		const setMapping = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolve = r;
				}),
		);
		component = mount(LinkSessionDialog, {
			target: document.body,
			props: defaultProps({
				sessionId: "session_busystate00001",
				setMapping,
			}),
		});
		const input = document.querySelector(".issue-number-input") as HTMLInputElement | null;
		expect(input).not.toBeNull();
		if (input) {
			input.value = "9";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
		const form = document.querySelector(".link-session-form") as HTMLFormElement | null;
		expect(form).not.toBeNull();

		// 3 回連続 submit (多重クリック相当)
		form?.requestSubmit();
		form?.requestSubmit();
		form?.requestSubmit();
		await Promise.resolve();
		await Promise.resolve();

		expect(setMapping).toHaveBeenCalledTimes(1);

		// クリーンアップ: 保留中の promise を resolve してテスト終了時の
		// unhandled pending promise を防ぐ。
		resolve();
		await Promise.resolve();
	});
});
