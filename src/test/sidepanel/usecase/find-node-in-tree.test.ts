import { describe, expect, it } from "vitest";
import type { EpicTreeDto, TreeNodeDto } from "../../../domain/ports/epic-processor.port";
import { findNodeInTree, nodeKeyFor } from "../../../sidepanel/usecase/find-node-in-tree";

function epic(num: number, children: readonly TreeNodeDto[] = [], depth = 0): TreeNodeDto {
	return { kind: { type: "epic", number: num, title: `Epic #${num}` }, children, depth };
}

function issue(num: number, children: readonly TreeNodeDto[] = [], depth = 1): TreeNodeDto {
	return {
		kind: {
			type: "issue",
			number: num,
			title: `Issue #${num}`,
			url: `https://github.com/owner/repo/issues/${num}`,
			state: "OPEN",
			labels: [],
		},
		children,
		depth,
	};
}

function pr(num: number, children: readonly TreeNodeDto[] = [], depth = 2): TreeNodeDto {
	return {
		kind: {
			type: "pullRequest",
			number: num,
			title: `PR #${num}`,
			url: `https://github.com/owner/repo/pull/${num}`,
			prData: {
				additions: 0,
				deletions: 0,
				ciStatus: "Passed",
				approvalStatus: "Approved",
				mergeableStatus: "Mergeable",
				isDraft: false,
				sizeLabel: "S",
				unresolvedCommentCount: 0,
			},
		},
		children,
		depth,
	};
}

describe("findNodeInTree", () => {
	it("ルート直下の epic を番号で検索できる", () => {
		const tree: EpicTreeDto = { roots: [epic(1), epic(2)] };
		const result = findNodeInTree(tree, 2);
		expect(result).not.toBeNull();
		expect(result?.kind.type).toBe("epic");
		if (result?.kind.type === "epic") expect(result.kind.number).toBe(2);
	});

	it("深い階層の issue を番号で検索できる", () => {
		const tree: EpicTreeDto = {
			roots: [epic(1, [epic(2, [issue(100, [issue(200, [], 3)], 2)], 1)])],
		};
		const result = findNodeInTree(tree, 200);
		expect(result).not.toBeNull();
		expect(result?.kind.type).toBe("issue");
		if (result?.kind.type === "issue") expect(result.kind.number).toBe(200);
	});

	it("pull request も番号で検索できる", () => {
		const tree: EpicTreeDto = {
			roots: [epic(1, [issue(10, [pr(999)], 1)])],
		};
		const result = findNodeInTree(tree, 999);
		expect(result).not.toBeNull();
		expect(result?.kind.type).toBe("pullRequest");
		if (result?.kind.type === "pullRequest") expect(result.kind.number).toBe(999);
	});

	it("見つからない場合は null を返す", () => {
		const tree: EpicTreeDto = { roots: [epic(1, [issue(10)])] };
		expect(findNodeInTree(tree, 999)).toBeNull();
	});

	it("空のツリーに対して null を返す", () => {
		const tree: EpicTreeDto = { roots: [] };
		expect(findNodeInTree(tree, 1)).toBeNull();
	});

	it("同じ番号の epic と issue がある場合、先に見つかった方（DFS 順）を返す", () => {
		const tree: EpicTreeDto = {
			roots: [epic(42, [issue(42)])],
		};
		const result = findNodeInTree(tree, 42);
		expect(result?.kind.type).toBe("epic");
	});

	it("session ノードは検索対象外（issueNumber でマッチしない）", () => {
		const sessionNode: TreeNodeDto = {
			kind: {
				type: "session",
				title: "Claude session",
				url: "https://claude.ai/code/session_abc",
				issueNumber: 500,
				isManuallyMapped: false,
				sessionId: "session_abc",
			},
			children: [],
			depth: 2,
		};
		const tree: EpicTreeDto = {
			roots: [epic(1, [issue(10, [sessionNode], 1)])],
		};
		expect(findNodeInTree(tree, 500)).toBeNull();
	});

	it("元のツリーは変更しない（純粋関数）", () => {
		const tree: EpicTreeDto = { roots: [epic(1, [issue(10)])] };
		const snapshot = JSON.stringify(tree);
		findNodeInTree(tree, 10);
		expect(JSON.stringify(tree)).toBe(snapshot);
	});
});

describe("nodeKeyFor", () => {
	it("epic ノードのキーは epic-<number>", () => {
		expect(nodeKeyFor({ type: "epic", number: 7, title: "Epic" })).toBe("epic-7");
	});

	it("issue ノードのキーは issue-<number>", () => {
		expect(
			nodeKeyFor({
				type: "issue",
				number: 88,
				title: "Issue",
				url: "https://example.com/88",
				state: "OPEN",
				labels: [],
			}),
		).toBe("issue-88");
	});

	it("pullRequest ノードのキーは pr-<number>", () => {
		expect(
			nodeKeyFor({
				type: "pullRequest",
				number: 42,
				title: "PR",
				url: "https://example.com/42",
				prData: {
					additions: 0,
					deletions: 0,
					ciStatus: "Passed",
					approvalStatus: "Approved",
					mergeableStatus: "Mergeable",
					isDraft: false,
					sizeLabel: "S",
					unresolvedCommentCount: 0,
				},
			}),
		).toBe("pr-42");
	});

	it("session ノードのキーは session-<issueNumber>-<url>", () => {
		expect(
			nodeKeyFor({
				type: "session",
				title: "S",
				url: "https://claude.ai/code/session_abc",
				issueNumber: 10,
				isManuallyMapped: false,
				sessionId: "session_abc",
			}),
		).toBe("session-10-https://claude.ai/code/session_abc");
	});
});
