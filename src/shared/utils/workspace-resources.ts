import type { TreeNodeDto } from "../../domain/ports/epic-processor.port";

export interface WorkspaceResources {
	readonly issueNumber: number;
	readonly issueUrl: string;
	readonly prUrl: string | null;
	readonly sessionUrl: string | null;
}

/**
 * Issue ノードの子ノードから PR URL と Claude Session URL を抽出する。
 * 複数ある場合はツリー内の最初のものを選択する。
 */
export function resolveWorkspaceResources(issueNode: TreeNodeDto): WorkspaceResources {
	if (issueNode.kind.type !== "issue") {
		throw new Error(`Expected issue node, got ${issueNode.kind.type}`);
	}

	let prUrl: string | null = null;
	let sessionUrl: string | null = null;

	for (const child of issueNode.children) {
		if (prUrl === null && child.kind.type === "pullRequest") {
			prUrl = child.kind.url;
		}
		if (sessionUrl === null && child.kind.type === "session") {
			sessionUrl = child.kind.url;
		}
		if (prUrl !== null && sessionUrl !== null) break;
	}

	return {
		issueNumber: issueNode.kind.number,
		issueUrl: issueNode.kind.url,
		prUrl,
		sessionUrl,
	};
}
