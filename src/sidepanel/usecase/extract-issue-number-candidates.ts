/**
 * LinkSessionDialog のサジェストチップ用。セッションタイトルから
 * 「Issue 番号っぽい数字」を抽出する純粋関数。
 *
 * 仕様:
 * - 最小桁数 `MIN_DIGIT_COUNT` 以上の連続数字のみ拾う (2 桁以下はノイズ率が高いため除外)
 * - 先頭ゼロ ("001" 等) は除外する (Number.parseInt で "1" に潰れ UI 表示と書き込み値が乖離するため)
 * - 重複除去 (出現順を保つ)
 * - 最大 `MAX_SUGGESTION_COUNT` 件 (UI のチップ描画上限)
 */

/** チップ描画の上限。DOM の視認性 (3-5 チップ) を考慮した値。 */
export const MAX_SUGGESTION_COUNT = 5;

/** Issue 番号として有意とみなす最小桁数。2 桁以下はノイズ (日付・優先度等) が多い。 */
export const MIN_DIGIT_COUNT = 3;

const DIGIT_PATTERN = new RegExp(`\\d{${MIN_DIGIT_COUNT},}`, "g");

export function extractIssueNumberCandidates(title: string): readonly string[] {
	const matches = title.match(DIGIT_PATTERN);
	if (matches === null) return [];
	// 先頭ゼロ ("001") は Number.parseInt で 1 に潰れ、UI 表示 (チップ文字列) と
	// mapping 書き込み値 (整数) で乖離が発生する。LinkSessionDialog の input も
	// 先頭ゼロを invalid 扱いするため、候補提示の段階で除外する。
	const withoutLeadingZero = matches.filter((m) => !m.startsWith("0"));
	// Set で重複排除しつつ、挿入順 (出現順) を維持する。
	const unique = Array.from(new Set(withoutLeadingZero));
	return unique.slice(0, MAX_SUGGESTION_COUNT);
}
