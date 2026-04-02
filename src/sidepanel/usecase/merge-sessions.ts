import type { EpicTreeDto, TreeNodeDto } from "../../domain/ports/epic-processor.port";
import type { ClaudeSessionStorage } from "../../shared/types/claude-session";

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
		const sessionChildren: readonly TreeNodeDto[] = issueSessions.map((s) => ({
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
