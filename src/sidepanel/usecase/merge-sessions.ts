import type { EpicTreeDto, TreeNodeDto } from "../../domain/ports/epic-processor.port";
import type { ClaudeSession, ClaudeSessionStorage } from "../../shared/types/claude-session";

/**
 * 同一タイトルのセッションを重複排除し、各タイトルで最新のもののみ残す。
 * 同じ Issue に対して複数セッション URL が存在するケースに対応。
 */
function deduplicateSessionsByTitle(sessions: readonly ClaudeSession[]): readonly ClaudeSession[] {
	const byTitle = new Map<string, ClaudeSession>();
	for (const s of sessions) {
		const existing = byTitle.get(s.title);
		if (!existing || s.detectedAt > existing.detectedAt) {
			byTitle.set(s.title, s);
		}
	}
	return [...byTitle.values()];
}

/**
 * セッション情報をエピックツリーにマージする。
 * Issue ノードの子として、対応するセッションノードを追加する。
 * 純粋関数: 元のツリーは変更しない。
 */
export function mergeSessionsIntoTree(
	tree: EpicTreeDto,
	sessions: ClaudeSessionStorage,
): EpicTreeDto {
	return {
		roots: tree.roots.map((root) => mergeSessionsIntoNode(root, sessions)),
	};
}

function mergeSessionsIntoNode(node: TreeNodeDto, sessions: ClaudeSessionStorage): TreeNodeDto {
	if (node.kind.type === "issue") {
		const issueNumber = node.kind.number;
		const issueSessions = sessions[String(issueNumber)] ?? [];
		// 同一タイトルのセッションは最新のもののみ表示 (複数セッション URL の重複を防ぐ)
		const uniqueSessions = deduplicateSessionsByTitle(issueSessions);
		const sessionChildren: readonly TreeNodeDto[] = uniqueSessions.map((s) => ({
			kind: {
				type: "session" as const,
				title: s.title,
				url: s.sessionUrl,
				issueNumber: s.issueNumber,
			},
			children: [] as readonly TreeNodeDto[],
			depth: node.depth + 1,
		}));

		return {
			...node,
			children: [
				...node.children.map((c) => mergeSessionsIntoNode(c, sessions)),
				...sessionChildren,
			],
		};
	}

	return {
		...node,
		children: node.children.map((c) => mergeSessionsIntoNode(c, sessions)),
	};
}
