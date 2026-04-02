import { describe, expect, it } from "vitest";
import type { TreeNodeDto } from "../../../domain/ports/epic-processor.port";
import { resolveWorkspaceResources } from "../../../shared/utils/workspace-resources";

function createIssueNode(overrides?: {
	number?: number;
	url?: string;
	children?: readonly TreeNodeDto[];
}): TreeNodeDto {
	return {
		kind: {
			type: "issue",
			number: overrides?.number ?? 42,
			title: "Test issue",
			url: overrides?.url ?? "https://github.com/owner/repo/issues/42",
			state: "OPEN",
			labels: [],
		},
		children: overrides?.children ?? [],
		depth: 1,
	};
}

function createPrChild(url: string, number: number): TreeNodeDto {
	return {
		kind: {
			type: "pullRequest",
			number,
			title: "Test PR",
			url,
			prData: {
				additions: 10,
				deletions: 5,
				ciStatus: "Passed",
				approvalStatus: "Approved",
				mergeableStatus: "MERGEABLE",
				isDraft: false,
				sizeLabel: "S",
				unresolvedCommentCount: 0,
			},
		},
		children: [],
		depth: 2,
	};
}

function createSessionChild(url: string, issueNumber: number): TreeNodeDto {
	return {
		kind: {
			type: "session",
			title: "Investigate Issue #42",
			url,
			issueNumber,
		},
		children: [],
		depth: 2,
	};
}

describe("resolveWorkspaceResources", () => {
	it("should resolve all resources when issue has PR and session children", () => {
		const node = createIssueNode({
			children: [
				createPrChild("https://github.com/owner/repo/pull/123", 123),
				createSessionChild("https://claude.ai/code/session-1", 42),
			],
		});
		const result = resolveWorkspaceResources(node);
		expect(result).toEqual({
			issueNumber: 42,
			issueUrl: "https://github.com/owner/repo/issues/42",
			prUrl: "https://github.com/owner/repo/pull/123",
			sessionUrl: "https://claude.ai/code/session-1",
		});
	});

	it("should return null prUrl when no PR children exist", () => {
		const node = createIssueNode({
			children: [createSessionChild("https://claude.ai/code/session-1", 42)],
		});
		const result = resolveWorkspaceResources(node);
		expect(result.prUrl).toBeNull();
		expect(result.sessionUrl).toBe("https://claude.ai/code/session-1");
	});

	it("should return null sessionUrl when no session children exist", () => {
		const node = createIssueNode({
			children: [createPrChild("https://github.com/owner/repo/pull/123", 123)],
		});
		const result = resolveWorkspaceResources(node);
		expect(result.sessionUrl).toBeNull();
		expect(result.prUrl).toBe("https://github.com/owner/repo/pull/123");
	});

	it("should return null for both when issue has no children", () => {
		const node = createIssueNode({ children: [] });
		const result = resolveWorkspaceResources(node);
		expect(result.prUrl).toBeNull();
		expect(result.sessionUrl).toBeNull();
	});

	it("should pick the first PR when multiple PR children exist", () => {
		const node = createIssueNode({
			children: [
				createPrChild("https://github.com/owner/repo/pull/100", 100),
				createPrChild("https://github.com/owner/repo/pull/200", 200),
			],
		});
		const result = resolveWorkspaceResources(node);
		expect(result.prUrl).toBe("https://github.com/owner/repo/pull/100");
	});

	it("should pick the first session when multiple session children exist", () => {
		const node = createIssueNode({
			children: [
				createSessionChild("https://claude.ai/code/session-a", 42),
				createSessionChild("https://claude.ai/code/session-b", 42),
			],
		});
		const result = resolveWorkspaceResources(node);
		expect(result.sessionUrl).toBe("https://claude.ai/code/session-a");
	});

	it("should ignore epic children", () => {
		const epicChild: TreeNodeDto = {
			kind: { type: "epic", number: 1, title: "Epic" },
			children: [],
			depth: 2,
		};
		const node = createIssueNode({ children: [epicChild] });
		const result = resolveWorkspaceResources(node);
		expect(result.prUrl).toBeNull();
		expect(result.sessionUrl).toBeNull();
	});
});
