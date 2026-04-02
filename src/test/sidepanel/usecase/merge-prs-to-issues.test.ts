import { describe, expect, it } from "vitest";
import type { EpicTreeDto, TreeNodeDto } from "../../../domain/ports/epic-processor.port";
import {
	extractPrIssueLinks,
	movePrsToLinkedIssues,
} from "../../../sidepanel/usecase/merge-prs-to-issues";

// --- ヘルパー ---

function makeGraphQLResponse(options: {
	myPrs?: Array<{
		number: number;
		closingIssuesReferences?: number[];
		linkedIssues?: number[];
	}>;
	reviewRequested?: Array<{
		number: number;
		closingIssuesReferences?: number[];
		linkedIssues?: number[];
	}>;
}): string {
	function buildEdges(
		prs: Array<{
			number: number;
			closingIssuesReferences?: number[];
			linkedIssues?: number[];
		}>,
	) {
		return prs.map((pr) => ({
			node: {
				number: pr.number,
				...(pr.closingIssuesReferences
					? {
							closingIssuesReferences: {
								nodes: pr.closingIssuesReferences.map((n) => ({ number: n })),
							},
						}
					: {}),
				...(pr.linkedIssues
					? {
							linkedIssues: {
								nodes: pr.linkedIssues.map((n) => ({ number: n })),
							},
						}
					: {}),
			},
		}));
	}

	return JSON.stringify({
		data: {
			...(options.myPrs ? { myPrs: { edges: buildEdges(options.myPrs) } } : {}),
			...(options.reviewRequested
				? { reviewRequested: { edges: buildEdges(options.reviewRequested) } }
				: {}),
		},
	});
}

function makeEpicNode(
	number: number,
	children: readonly TreeNodeDto[] = [],
	depth = 0,
): TreeNodeDto {
	return {
		kind: { type: "epic", number, title: `Epic #${number}` },
		children,
		depth,
	};
}

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

function makePrNode(number: number, depth = 1): TreeNodeDto {
	return {
		kind: {
			type: "pullRequest",
			number,
			title: `PR #${number}`,
			url: `https://github.com/owner/repo/pull/${number}`,
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
		depth,
	};
}

// "Epic なし" グループ (number=0) を作る
function makeNoEpicGroup(children: readonly TreeNodeDto[]): TreeNodeDto {
	return makeEpicNode(0, children);
}

// --- extractPrIssueLinks ---

describe("extractPrIssueLinks", () => {
	it("closingIssuesReferences のみの PR から Issue リンクを抽出する", () => {
		const json = makeGraphQLResponse({
			myPrs: [{ number: 42, closingIssuesReferences: [10, 20] }],
		});

		const result = extractPrIssueLinks(json);

		expect(result.get(42)).toEqual([10, 20]);
		expect(result.size).toBe(1);
	});

	it("linkedIssues のみの PR から Issue リンクを抽出する", () => {
		const json = makeGraphQLResponse({
			myPrs: [{ number: 42, linkedIssues: [10, 20] }],
		});

		const result = extractPrIssueLinks(json);

		// linkedIssues 未対応のため、現在は失敗する (RED)
		expect(result.get(42)).toEqual([10, 20]);
		expect(result.size).toBe(1);
	});

	it("closingIssuesReferences と linkedIssues の両方がある場合、マージして重複排除する", () => {
		const json = makeGraphQLResponse({
			myPrs: [
				{
					number: 42,
					closingIssuesReferences: [10, 20],
					linkedIssues: [20, 30],
				},
			],
		});

		const result = extractPrIssueLinks(json);

		// 重複する 20 は1つにまとめる
		const issues = result.get(42);
		expect(issues).toBeDefined();
		expect(issues).toHaveLength(3);
		expect([...new Set(issues)]).toHaveLength(3);
		expect(new Set(issues)).toEqual(new Set([10, 20, 30]));
	});

	it("myPrs と reviewRequested の両方のエッジを走査する", () => {
		const json = makeGraphQLResponse({
			myPrs: [{ number: 42, closingIssuesReferences: [10] }],
			reviewRequested: [{ number: 99, closingIssuesReferences: [30] }],
		});

		const result = extractPrIssueLinks(json);

		// reviewRequested 未対応のため、現在は PR#99 が取れない (RED)
		expect(result.get(42)).toEqual([10]);
		expect(result.get(99)).toEqual([30]);
		expect(result.size).toBe(2);
	});

	it("reviewRequested 側の PR が linkedIssues を持つ場合も抽出する", () => {
		const json = makeGraphQLResponse({
			myPrs: [{ number: 42, closingIssuesReferences: [10] }],
			reviewRequested: [{ number: 99, linkedIssues: [30, 40] }],
		});

		const result = extractPrIssueLinks(json);

		expect(result.get(42)).toEqual([10]);
		expect(result.get(99)).toEqual([30, 40]);
		expect(result.size).toBe(2);
	});

	it("同一 PR が myPrs と reviewRequested 両方にある場合、リンク先をマージする", () => {
		const json = makeGraphQLResponse({
			myPrs: [{ number: 42, closingIssuesReferences: [10] }],
			reviewRequested: [{ number: 42, linkedIssues: [20] }],
		});

		const result = extractPrIssueLinks(json);

		// PR #42 は両方のセクションに登場するので [10, 20] にマージされる
		const issues = result.get(42);
		expect(issues).toBeDefined();
		expect(issues).toHaveLength(2);
		expect(new Set(issues)).toEqual(new Set([10, 20]));
		expect(result.size).toBe(1);
	});

	it("どちらのフィールドもない PR は空マップを返す", () => {
		const json = makeGraphQLResponse({
			myPrs: [{ number: 42 }],
		});

		const result = extractPrIssueLinks(json);

		expect(result.size).toBe(0);
	});

	it("不正な JSON は空マップを返す", () => {
		const result = extractPrIssueLinks("{{invalid json");

		expect(result.size).toBe(0);
	});

	it("data が null の JSON は空マップを返す", () => {
		const result = extractPrIssueLinks(JSON.stringify({ data: null }));

		expect(result.size).toBe(0);
	});

	it("想定外の構造の JSON は空マップを返す", () => {
		const result = extractPrIssueLinks(JSON.stringify({ unexpected: true }));

		expect(result.size).toBe(0);
	});
});

// --- movePrsToLinkedIssues ---

describe("movePrsToLinkedIssues", () => {
	it("リンクがある PR を Issue の子に移動する", () => {
		const pr = makePrNode(42);
		const issue = makeIssueNode(10);
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [issue]), makeNoEpicGroup([pr])],
		};
		const links: ReadonlyMap<number, readonly number[]> = new Map([[42, [10]]]);

		const result = movePrsToLinkedIssues(tree, links);

		// Issue #10 の子に PR #42 が移動している
		const epicRoot = result.roots[0];
		const issueNode = epicRoot.children[0];
		expect(issueNode.kind.type).toBe("issue");
		expect(issueNode.children).toHaveLength(1);
		expect(issueNode.children[0].kind.type).toBe("pullRequest");
		if (issueNode.children[0].kind.type === "pullRequest") {
			expect(issueNode.children[0].kind.number).toBe(42);
		}

		// "Epic なし" グループから PR が除去されている（空なので除去される）
		const noEpicGroup = result.roots.find(
			(r: TreeNodeDto) => r.kind.type === "epic" && r.kind.number === 0,
		);
		expect(noEpicGroup).toBeUndefined();
	});

	it("空のリンクマップではツリーを変更しない", () => {
		const pr = makePrNode(42);
		const issue = makeIssueNode(10);
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [issue]), makeNoEpicGroup([pr])],
		};
		const links: ReadonlyMap<number, readonly number[]> = new Map();

		const result = movePrsToLinkedIssues(tree, links);

		// ツリーがそのまま返される（参照同一）
		expect(result).toBe(tree);
	});

	it("1つの PR が複数 Issue にリンクしている場合、各 Issue の子に複製される", () => {
		const pr = makePrNode(42);
		const issue10 = makeIssueNode(10);
		const issue20 = makeIssueNode(20);
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [issue10, issue20]), makeNoEpicGroup([pr])],
		};
		const links: ReadonlyMap<number, readonly number[]> = new Map([[42, [10, 20]]]);

		const result = movePrsToLinkedIssues(tree, links);

		// Issue #10 の子に PR #42 がある
		const epicRoot = result.roots[0];
		const issueNode10 = epicRoot.children[0];
		expect(issueNode10.kind.type).toBe("issue");
		expect(issueNode10.children).toHaveLength(1);
		expect(issueNode10.children[0].kind.type).toBe("pullRequest");
		if (issueNode10.children[0].kind.type === "pullRequest") {
			expect(issueNode10.children[0].kind.number).toBe(42);
		}

		// Issue #20 の子にも PR #42 がある
		const issueNode20 = epicRoot.children[1];
		expect(issueNode20.kind.type).toBe("issue");
		expect(issueNode20.children).toHaveLength(1);
		expect(issueNode20.children[0].kind.type).toBe("pullRequest");
		if (issueNode20.children[0].kind.type === "pullRequest") {
			expect(issueNode20.children[0].kind.number).toBe(42);
		}

		// "Epic なし" グループから PR が除去されている
		const noEpicGroup = result.roots.find(
			(r: TreeNodeDto) => r.kind.type === "epic" && r.kind.number === 0,
		);
		expect(noEpicGroup).toBeUndefined();
	});

	it("リンク先 Issue がツリー内に存在しない場合、PR は元の位置に残る", () => {
		const pr = makePrNode(42);
		const issue10 = makeIssueNode(10);
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [issue10]), makeNoEpicGroup([pr])],
		};
		// PR #42 は Issue #999 にリンクしているが、ツリーに #999 は存在しない
		const links: ReadonlyMap<number, readonly number[]> = new Map([[42, [999]]]);

		const result = movePrsToLinkedIssues(tree, links);

		// PR は移動できないので "Epic なし" グループに残る
		const noEpicGroup = result.roots.find(
			(r: TreeNodeDto) => r.kind.type === "epic" && r.kind.number === 0,
		);
		expect(noEpicGroup).toBeDefined();
		expect(noEpicGroup?.children).toHaveLength(1);
		expect(noEpicGroup?.children[0].kind.type).toBe("pullRequest");
		if (noEpicGroup?.children[0].kind.type === "pullRequest") {
			expect(noEpicGroup?.children[0].kind.number).toBe(42);
		}

		// Issue #10 には子がない
		const epicRoot = result.roots[0];
		expect(epicRoot.children[0].children).toHaveLength(0);
	});
});
