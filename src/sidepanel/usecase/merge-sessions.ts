import type { EpicTreeDto, TreeNodeDto } from "../../domain/ports/epic-processor.port";
import type {
	ClaudeSession,
	ClaudeSessionStorage,
	SessionIssueMapping,
} from "../../shared/types/claude-session";
import { extractSessionIdFromUrl } from "../../shared/utils/session-id";

/**
 * ツリー配置決定済みのセッション。`isManuallyMapped` は UI バッジ表示用 (Epic #43)、
 * `sessionId` は LinkSessionDialog 表示判定および手動マッピング書き込みキー (Issue #47)。
 * URL から抽出できなかった場合は `null`。
 */
type ResolvedSession = ClaudeSession & {
	readonly isManuallyMapped: boolean;
	readonly sessionId: string | null;
};

/**
 * 同一タイトルのセッションを重複排除し、各タイトルで代表 1 件のみ残す。
 *
 * tiebreaker:
 *   1. 手動マッピング済み (`isManuallyMapped: true`) を優先する。ユーザーの明示的操作を
 *      新しい regex 由来セッションが飲み込んで UI から消すのを防ぐ。
 *   2. 同じ `isManuallyMapped` の場合は `detectedAt` が新しい方を採用する。
 */
function deduplicateSessionsByTitle(
	sessions: readonly ResolvedSession[],
): readonly ResolvedSession[] {
	const byTitle = new Map<string, ResolvedSession>();
	for (const s of sessions) {
		const existing = byTitle.get(s.title);
		if (!existing) {
			byTitle.set(s.title, s);
			continue;
		}
		// 手動マッピング優先 (既存が手動なら置き換えない)
		if (existing.isManuallyMapped && !s.isManuallyMapped) continue;
		// 新規が手動で既存が非手動なら置き換え、それ以外は detectedAt で決定
		if (s.isManuallyMapped && !existing.isManuallyMapped) {
			byTitle.set(s.title, s);
			continue;
		}
		if (s.detectedAt > existing.detectedAt) {
			byTitle.set(s.title, s);
		}
	}
	return [...byTitle.values()];
}

/**
 * 同一 sessionUrl が複数 Issue にまたがる場合、最新の detectedAt を持つ方のみ残す。
 * Storage 層で防ぐのが本筋だが、既存データへの防御として merge 時にも除去する (Issue #34)。
 */
function deduplicateSessionsAcrossIssues(sessions: ClaudeSessionStorage): ClaudeSessionStorage {
	// URL → { key, detectedAt } の最新エントリを収集
	const latestByUrl = new Map<string, { key: string; detectedAt: string }>();
	for (const [key, list] of Object.entries(sessions)) {
		for (const s of list) {
			const existing = latestByUrl.get(s.sessionUrl);
			if (!existing || s.detectedAt > existing.detectedAt) {
				latestByUrl.set(s.sessionUrl, { key, detectedAt: s.detectedAt });
			}
		}
	}

	// 最新でない key からは該当 URL を除去
	const result: Record<string, readonly ClaudeSession[]> = {};
	for (const [key, list] of Object.entries(sessions)) {
		result[key] = list.filter((s) => {
			const latest = latestByUrl.get(s.sessionUrl);
			return latest !== undefined && latest.key === key;
		});
	}
	return result;
}

/**
 * storage に載っている全セッションに対し、regex 抽出結果と手動マッピングの union で
 * 最終的な配置 issueNumber を決定する。
 *
 * 手動マッピング (sessionId → issueNumber) が regex 抽出結果より優先される。
 * sessionId が URL から抽出できないセッションは手動マッピング評価の対象外とし、
 * regex 抽出結果 (= storage の key) でそのまま配置する。
 */
function resolveEffectivePlacement(
	sessions: ClaudeSessionStorage,
	mapping: SessionIssueMapping,
): ReadonlyMap<number, readonly ResolvedSession[]> {
	const result = new Map<number, ResolvedSession[]>();
	for (const [issueKey, list] of Object.entries(sessions)) {
		const regexIssueNum = Number(issueKey);
		const hasValidRegexKey = Number.isInteger(regexIssueNum) && regexIssueNum > 0;
		for (const session of list) {
			const sessionId = extractSessionIdFromUrl(session.sessionUrl);
			const manualIssueNum = sessionId !== null ? mapping[sessionId] : undefined;
			const isManuallyMapped = manualIssueNum !== undefined;
			// regex key が非正整数 (NaN/0/負値/非数値) の場合は手動マッピングがあれば救済し、
			// なければ effective placement を諦める (どの Issue ノードにも合致しない)。
			if (manualIssueNum === undefined && !hasValidRegexKey) continue;
			const effectiveIssueNum = manualIssueNum ?? regexIssueNum;
			const placed: ResolvedSession = { ...session, isManuallyMapped, sessionId };
			const bucket = result.get(effectiveIssueNum);
			if (bucket) {
				bucket.push(placed);
			} else {
				result.set(effectiveIssueNum, [placed]);
			}
		}
	}
	return result;
}

/**
 * セッション情報をエピックツリーにマージする。
 * Issue ノードの子として、対応するセッションノードを追加する。
 * 純粋関数: 元のツリーは変更しない。
 *
 * @param mapping regex 抽出を上書きする手動マッピング (Epic #43)。未設定時は空オブジェクト。
 */
export function mergeSessionsIntoTree(
	tree: EpicTreeDto,
	sessions: ClaudeSessionStorage,
	mapping: SessionIssueMapping,
): EpicTreeDto {
	const cleaned = deduplicateSessionsAcrossIssues(sessions);
	const byEffectiveIssue = resolveEffectivePlacement(cleaned, mapping);
	return {
		roots: tree.roots.map((root) => mergeSessionsIntoNode(root, byEffectiveIssue)),
	};
}

function mergeSessionsIntoNode(
	node: TreeNodeDto,
	byEffectiveIssue: ReadonlyMap<number, readonly ResolvedSession[]>,
): TreeNodeDto {
	if (node.kind.type === "issue") {
		const issueNumber = node.kind.number;
		const issueSessions = byEffectiveIssue.get(issueNumber) ?? [];
		const uniqueSessions = deduplicateSessionsByTitle(issueSessions);
		const sessionChildren: readonly TreeNodeDto[] = uniqueSessions.map((s) => ({
			kind: {
				type: "session" as const,
				title: s.title,
				url: s.sessionUrl,
				// 配置先 issue に合わせて effective issueNumber を採用する
				// (手動マッピングで移動したセッションは移動先を指す)
				issueNumber,
				isManuallyMapped: s.isManuallyMapped,
				// URL 抽出結果をそのまま伝播。壊れた URL は null で UI 側が Link ボタンを隠す。
				sessionId: s.sessionId,
			},
			children: [] as readonly TreeNodeDto[],
			depth: node.depth + 1,
		}));

		return {
			...node,
			children: [
				...node.children.map((c) => mergeSessionsIntoNode(c, byEffectiveIssue)),
				...sessionChildren,
			],
		};
	}

	return {
		...node,
		children: node.children.map((c) => mergeSessionsIntoNode(c, byEffectiveIssue)),
	};
}
