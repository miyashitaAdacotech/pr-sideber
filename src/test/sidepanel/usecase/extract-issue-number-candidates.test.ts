import { describe, expect, it } from "vitest";
import { extractIssueNumberCandidates } from "../../../sidepanel/usecase/extract-issue-number-candidates";

/**
 * LinkSessionDialog のサジェスト候補生成用 usecase のテスト。
 * セッションタイトルから「Issue 番号っぽい数字」を抽出する。
 *
 * 仕様:
 * - 3 桁以上の連続数字のみ拾う (2 桁以下はノイズ率が高いため除外)
 * - 重複除去
 * - 最大 5 件 (UI のチップ描画上限)
 * - 空文字列や数字が無い場合は空配列
 * - `#` や文字は数字抽出に影響しない
 */
describe("extractIssueNumberCandidates", () => {
	it("単一の 3 桁以上の数字を抽出する", () => {
		expect(extractIssueNumberCandidates("Fix #123")).toEqual(["123"]);
	});

	it("複数の 3 桁以上の数字を出現順に抽出する", () => {
		expect(extractIssueNumberCandidates("Issue 456 related to 789")).toEqual(["456", "789"]);
	});

	it("2 桁以下の数字は除外する", () => {
		// `12` はノイズ (日付・優先度など) の可能性が高いため除外される
		expect(extractIssueNumberCandidates("Fix 12")).toEqual([]);
	});

	it("最大 5 件まで (先頭 5 件を保持)", () => {
		expect(extractIssueNumberCandidates("111 222 333 444 555 666 777")).toEqual([
			"111",
			"222",
			"333",
			"444",
			"555",
		]);
	});

	it("重複する数字を除去する", () => {
		expect(extractIssueNumberCandidates("#123 again #123")).toEqual(["123"]);
	});

	it("空文字列では空配列を返す", () => {
		expect(extractIssueNumberCandidates("")).toEqual([]);
	});

	it("非数値文字 (`abc`, `##`) が混入していても数字のみ抽出する", () => {
		expect(extractIssueNumberCandidates("abc ##123")).toEqual(["123"]);
	});

	// Phase 4 レビュー CRITICAL-1 / MEDIUM-2:
	// 先頭ゼロの候補 ("001" 等) は Number.parseInt で 1 に潰れ、
	// UI 表示 (input 値) と mapping 書き込み値で乖離が発生する。
	// サジェスト段階で除外することで、ユーザーがチップを押しても
	// 有効な submit 値になることを保証する。
	it("先頭ゼロの数字は候補から除外する", () => {
		expect(extractIssueNumberCandidates("Fix #001")).toEqual([]);
	});

	it("先頭ゼロの数字は除外し、有効なものだけを返す", () => {
		expect(extractIssueNumberCandidates("Issue 100 related to 002")).toEqual(["100"]);
	});
});
