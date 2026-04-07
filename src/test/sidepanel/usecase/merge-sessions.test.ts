import { describe, expect, it } from "vitest";
import type { EpicTreeDto, TreeNodeDto } from "../../../domain/ports/epic-processor.port";
import type { ClaudeSessionStorage } from "../../../shared/types/claude-session";
import { mergeSessionsIntoTree } from "../../../sidepanel/usecase/merge-sessions";

function makeIssueNode(
	number: number,
	children: readonly TreeNodeDto[] = [],
	depth = 1,
): TreeNodeDto {
	return {
		kind: {
			type: "issue",
			number,
			title: `Issue #${number}`,
			url: `https://github.com/owner/repo/issues/${number}`,
			state: "OPEN",
			labels: [],
		},
		children,
		depth,
	};
}

function makeEpicNode(
	number: number,
	children: readonly TreeNodeDto[] = [],
	depth = 0,
): TreeNodeDto {
	return {
		kind: {
			type: "epic",
			number,
			title: `Epic #${number}`,
		},
		children,
		depth,
	};
}

describe("mergeSessionsIntoTree", () => {
	it("returns the tree unchanged when sessions storage is empty", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10)])],
		};
		const sessions: ClaudeSessionStorage = {};

		const result = mergeSessionsIntoTree(tree, sessions);

		expect(result.roots).toHaveLength(1);
		expect(result.roots[0].children).toHaveLength(1);
	});

	it("appends session nodes as children of the matching Issue node", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10)])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/session-1",
					title: "Inv #10 fix tests",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: true,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions);

		const issueNode = result.roots[0].children[0];
		expect(issueNode.children).toHaveLength(1);
		expect(issueNode.children[0].kind.type).toBe("session");
		if (issueNode.children[0].kind.type === "session") {
			expect(issueNode.children[0].kind.title).toBe("Inv #10 fix tests");
			expect(issueNode.children[0].kind.url).toBe("https://claude.ai/code/session-1");
			expect(issueNode.children[0].kind.issueNumber).toBe(10);
		}
	});

	it("sets the session node depth to parent issue depth + 1", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10, [], 2)])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/s1",
					title: "#10 session",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions);

		const sessionNode = result.roots[0].children[0].children[0];
		expect(sessionNode.depth).toBe(3);
	});

	it("appends multiple sessions for the same Issue", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10)])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/s1",
					title: "#10 session A",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: true,
				},
				{
					sessionUrl: "https://claude.ai/code/s2",
					title: "#10 session B",
					issueNumber: 10,
					detectedAt: "2026-04-01T01:00:00Z",
					isLive: false,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions);

		const issueNode = result.roots[0].children[0];
		expect(issueNode.children).toHaveLength(2);
	});

	it("preserves existing children of the Issue node alongside sessions", () => {
		const prChild: TreeNodeDto = {
			kind: {
				type: "pullRequest",
				number: 50,
				title: "PR #50",
				url: "https://github.com/owner/repo/pull/50",
				prData: {
					additions: 10,
					deletions: 5,
					ciStatus: "Passed",
					approvalStatus: "Approved",
					mergeableStatus: "Mergeable",
					isDraft: false,
					sizeLabel: "S",
					unresolvedCommentCount: 0,
				},
			},
			children: [],
			depth: 2,
		};
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10, [prChild])])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/s1",
					title: "#10 session",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions);

		const issueNode = result.roots[0].children[0];
		expect(issueNode.children).toHaveLength(2);
		expect(issueNode.children[0].kind.type).toBe("pullRequest");
		expect(issueNode.children[1].kind.type).toBe("session");
	});

	it("does not mutate the original tree (immutability)", () => {
		const originalIssue = makeIssueNode(10);
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [originalIssue])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/s1",
					title: "#10 session",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
			],
		};

		mergeSessionsIntoTree(tree, sessions);

		// Original tree must be unchanged
		expect(originalIssue.children).toHaveLength(0);
		expect(tree.roots[0].children[0].children).toHaveLength(0);
	});

	it("handles deeply nested Issue nodes", () => {
		const deepIssue = makeIssueNode(20, [], 3);
		const midIssue = makeIssueNode(10, [deepIssue], 2);
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [midIssue])],
		};
		const sessions: ClaudeSessionStorage = {
			"20": [
				{
					sessionUrl: "https://claude.ai/code/s1",
					title: "#20 deep session",
					issueNumber: 20,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: true,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions);

		const deepNode = result.roots[0].children[0].children[0];
		expect(deepNode.children).toHaveLength(1);
		expect(deepNode.children[0].kind.type).toBe("session");
		expect(deepNode.children[0].depth).toBe(4);
	});

	it("session nodes have empty children array", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10)])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/s1",
					title: "#10 session",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions);

		expect(result.roots[0].children[0].children[0].children).toEqual([]);
	});

	it("ignores sessions for Issue numbers not present in the tree", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10)])],
		};
		const sessions: ClaudeSessionStorage = {
			"999": [
				{
					sessionUrl: "https://claude.ai/code/s1",
					title: "#999 orphan session",
					issueNumber: 999,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions);

		expect(result.roots[0].children[0].children).toHaveLength(0);
	});

	it("同一タイトルのセッションは最新のもののみ表示される", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10)])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/session_old",
					title: "Investigate issue 10",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
				{
					sessionUrl: "https://claude.ai/code/session_mid",
					title: "Investigate issue 10",
					issueNumber: 10,
					detectedAt: "2026-04-03T00:00:00Z",
					isLive: false,
				},
				{
					sessionUrl: "https://claude.ai/code/session_new",
					title: "Investigate issue 10",
					issueNumber: 10,
					detectedAt: "2026-04-05T00:00:00Z",
					isLive: true,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions);

		const issueNode = result.roots[0].children[0];
		// 3つのセッションが同一タイトルなので最新の1つだけ表示
		expect(issueNode.children).toHaveLength(1);
		if (issueNode.children[0].kind.type === "session") {
			expect(issueNode.children[0].kind.url).toBe("https://claude.ai/code/session_new");
		}
	});

	it("異なるタイトルのセッションはそれぞれ表示される", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10)])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/session_a",
					title: "Investigate issue 10",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
				{
					sessionUrl: "https://claude.ai/code/session_b",
					title: "[close] issue 10 hotfix",
					issueNumber: 10,
					detectedAt: "2026-04-03T00:00:00Z",
					isLive: true,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions);

		const issueNode = result.roots[0].children[0];
		// タイトルが異なるので両方表示
		expect(issueNode.children).toHaveLength(2);
	});

	it("returns tree with empty roots unchanged", () => {
		const tree: EpicTreeDto = { roots: [] };
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/s1",
					title: "#10 session",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions);

		expect(result.roots).toHaveLength(0);
	});
});
