import { describe, expect, it } from "vitest";
import type { EpicTreeDto, TreeNodeDto } from "../../../domain/ports/epic-processor.port";
import type {
	ClaudeSessionStorage,
	SessionIssueMapping,
} from "../../../shared/types/claude-session";
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

		const result = mergeSessionsIntoTree(tree, sessions, {});

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

		const result = mergeSessionsIntoTree(tree, sessions, {});

		const issueNode = result.roots[0].children[0];
		expect(issueNode.children).toHaveLength(1);
		expect(issueNode.children[0].kind.type).toBe("session");
		if (issueNode.children[0].kind.type === "session") {
			expect(issueNode.children[0].kind.title).toBe("Inv #10 fix tests");
			expect(issueNode.children[0].kind.url).toBe("https://claude.ai/code/session-1");
			expect(issueNode.children[0].kind.issueNumber).toBe(10);
			// URL が `session_XXX` パターンに合致しないため sessionId は null になる
			// sessionId フィールドは Phase 3 で TreeNodeKind に追加される予定。
			// 追加前は型に存在しないため unknown 経由でアクセスし、実行時 undefined で
			// null 比較が失敗することで RED を成立させる。
			expect(
				(issueNode.children[0].kind as unknown as { sessionId: string | null }).sessionId,
			).toBeNull();
		}
	});

	// Phase 3 (Issue #47): sessionId フィールドを session ノードに埋める
	it("正常な URL から sessionId を抽出して session ノードに載せる", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10)])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/session_abc123def456",
					title: "Inv #10",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: true,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions, {});

		const issueNode = result.roots[0].children[0];
		expect(issueNode.children).toHaveLength(1);
		const child = issueNode.children[0];
		expect(child.kind.type).toBe("session");
		if (child.kind.type === "session") {
			expect((child.kind as unknown as { sessionId: string | null }).sessionId).toBe(
				"session_abc123def456",
			);
		}
	});

	it("不正な URL からは sessionId が null になる", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10)])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://example.com/foo",
					title: "Inv #10",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions, {});

		const issueNode = result.roots[0].children[0];
		expect(issueNode.children).toHaveLength(1);
		const child = issueNode.children[0];
		expect(child.kind.type).toBe("session");
		if (child.kind.type === "session") {
			expect((child.kind as unknown as { sessionId: string | null }).sessionId).toBeNull();
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

		const result = mergeSessionsIntoTree(tree, sessions, {});

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

		const result = mergeSessionsIntoTree(tree, sessions, {});

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

		const result = mergeSessionsIntoTree(tree, sessions, {});

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

		mergeSessionsIntoTree(tree, sessions, {});

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

		const result = mergeSessionsIntoTree(tree, sessions, {});

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

		const result = mergeSessionsIntoTree(tree, sessions, {});

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

		const result = mergeSessionsIntoTree(tree, sessions, {});

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

		const result = mergeSessionsIntoTree(tree, sessions, {});

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

		const result = mergeSessionsIntoTree(tree, sessions, {});

		const issueNode = result.roots[0].children[0];
		// タイトルが異なるので両方表示
		expect(issueNode.children).toHaveLength(2);
	});

	// Issue #34: 同一 sessionUrl が複数 Issue にまたがる場合の防御的重複排除
	it("同一 sessionUrl が複数 Issue に存在する場合、最新の detectedAt のみ残る", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10), makeIssueNode(20)])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/session_CROSS",
					title: "Inv #10 old title",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
			],
			"20": [
				{
					sessionUrl: "https://claude.ai/code/session_CROSS",
					title: "Investigate issue 20",
					issueNumber: 20,
					detectedAt: "2026-04-05T00:00:00Z",
					isLive: true,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions, {});

		const issue10 = result.roots[0].children[0];
		const issue20 = result.roots[0].children[1];
		// Issue #10 からは除去、Issue #20 にのみ残る
		expect(issue10.children).toHaveLength(0);
		expect(issue20.children).toHaveLength(1);
		if (issue20.children[0].kind.type === "session") {
			expect(issue20.children[0].kind.url).toBe("https://claude.ai/code/session_CROSS");
		}
	});

	it("cross-issue 重複排除で、重複していない URL は影響を受けない", () => {
		const tree: EpicTreeDto = {
			roots: [makeEpicNode(1, [makeIssueNode(10), makeIssueNode(20)])],
		};
		const sessions: ClaudeSessionStorage = {
			"10": [
				{
					sessionUrl: "https://claude.ai/code/session_CROSS",
					title: "Inv #10",
					issueNumber: 10,
					detectedAt: "2026-04-01T00:00:00Z",
					isLive: false,
				},
				{
					sessionUrl: "https://claude.ai/code/session_UNIQUE_A",
					title: "Inv #10 other",
					issueNumber: 10,
					detectedAt: "2026-04-02T00:00:00Z",
					isLive: false,
				},
			],
			"20": [
				{
					sessionUrl: "https://claude.ai/code/session_CROSS",
					title: "Investigate issue 20",
					issueNumber: 20,
					detectedAt: "2026-04-05T00:00:00Z",
					isLive: true,
				},
				{
					sessionUrl: "https://claude.ai/code/session_UNIQUE_B",
					title: "Investigate issue 20 v2",
					issueNumber: 20,
					detectedAt: "2026-04-06T00:00:00Z",
					isLive: true,
				},
			],
		};

		const result = mergeSessionsIntoTree(tree, sessions, {});

		const issue10 = result.roots[0].children[0];
		const issue20 = result.roots[0].children[1];
		// Issue #10: CROSS は除去、UNIQUE_A は残る
		expect(issue10.children).toHaveLength(1);
		if (issue10.children[0].kind.type === "session") {
			expect(issue10.children[0].kind.url).toBe("https://claude.ai/code/session_UNIQUE_A");
		}
		// Issue #20: CROSS と UNIQUE_B の両方残る
		expect(issue20.children).toHaveLength(2);
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

		const result = mergeSessionsIntoTree(tree, sessions, {});

		expect(result.roots).toHaveLength(0);
	});

	// Phase 2 (Issue #46): 手動マッピング統合
	describe("SessionIssueMapping 統合", () => {
		it("regex 抽出が null でも手動マッピングがあれば該当 Issue 配下に配置される", () => {
			// 規模: storage には regex で拾えなかったため該当セッションが存在しないシナリオを
			// 「規定外 issueNumber (tree に存在しない) 配下に格納されている」で模する。
			// 手動マッピングで tree 内の Issue 10 に付け替える。
			const tree: EpicTreeDto = {
				roots: [makeEpicNode(1, [makeIssueNode(10)])],
			};
			const sessions: ClaudeSessionStorage = {
				"999": [
					{
						sessionUrl: "https://claude.ai/code/session_manual01",
						title: "no issue keyword in title",
						issueNumber: 999,
						detectedAt: "2026-04-10T00:00:00Z",
						isLive: false,
					},
				],
			};
			const mapping: SessionIssueMapping = { session_manual01: 10 };

			const result = mergeSessionsIntoTree(tree, sessions, mapping);

			const issueNode = result.roots[0].children[0];
			expect(issueNode.children).toHaveLength(1);
			const child = issueNode.children[0];
			expect(child.kind.type).toBe("session");
			if (child.kind.type === "session") {
				expect(child.kind.url).toBe("https://claude.ai/code/session_manual01");
				expect(child.kind.isManuallyMapped).toBe(true);
			}
		});

		it("手動マッピングは regex 抽出結果より優先される", () => {
			const tree: EpicTreeDto = {
				roots: [makeEpicNode(1, [makeIssueNode(10), makeIssueNode(20)])],
			};
			const sessions: ClaudeSessionStorage = {
				"20": [
					{
						sessionUrl: "https://claude.ai/code/session_override1",
						title: "Investigate #20",
						issueNumber: 20,
						detectedAt: "2026-04-10T00:00:00Z",
						isLive: true,
					},
				],
			};
			const mapping: SessionIssueMapping = { session_override1: 10 };

			const result = mergeSessionsIntoTree(tree, sessions, mapping);

			const issue10 = result.roots[0].children[0];
			const issue20 = result.roots[0].children[1];
			expect(issue10.children).toHaveLength(1);
			expect(issue20.children).toHaveLength(0);
			if (issue10.children[0].kind.type === "session") {
				expect(issue10.children[0].kind.isManuallyMapped).toBe(true);
			}
		});

		it("手動マッピングなし・regex ありでは既存動作を維持する", () => {
			const tree: EpicTreeDto = {
				roots: [makeEpicNode(1, [makeIssueNode(10)])],
			};
			const sessions: ClaudeSessionStorage = {
				"10": [
					{
						sessionUrl: "https://claude.ai/code/session_plain1",
						title: "Inv #10",
						issueNumber: 10,
						detectedAt: "2026-04-10T00:00:00Z",
						isLive: true,
					},
				],
			};

			const result = mergeSessionsIntoTree(tree, sessions, {});

			const issueNode = result.roots[0].children[0];
			expect(issueNode.children).toHaveLength(1);
			const child = issueNode.children[0];
			if (child.kind.type === "session") {
				expect(child.kind.issueNumber).toBe(10);
				expect(child.kind.isManuallyMapped).toBe(false);
			}
		});

		it("マッピング先 Issue がツリーに存在しない場合、セッションはツリー外になる", () => {
			// 後続 Phase で orphan セクションとして扱う。Phase 2 ではどこにも表示しない。
			const tree: EpicTreeDto = {
				roots: [makeEpicNode(1, [makeIssueNode(10)])],
			};
			const sessions: ClaudeSessionStorage = {
				"10": [
					{
						sessionUrl: "https://claude.ai/code/session_orphan1",
						title: "#10 session",
						issueNumber: 10,
						detectedAt: "2026-04-10T00:00:00Z",
						isLive: true,
					},
				],
			};
			const mapping: SessionIssueMapping = { session_orphan1: 777 };

			const result = mergeSessionsIntoTree(tree, sessions, mapping);

			const issue10 = result.roots[0].children[0];
			expect(issue10.children).toHaveLength(0);
		});

		it("同タイトル衝突時、手動マッピング済みセッションが regex のみのセッションより優先される", () => {
			// detectedAt だけを基準にすると、新しい regex セッションが古い手動マッピングセッションを
			// 飲み込んで UI から消える。手動操作は意図的行為なので保護する。
			const tree: EpicTreeDto = {
				roots: [makeEpicNode(1, [makeIssueNode(10)])],
			};
			const sessions: ClaudeSessionStorage = {
				"999": [
					{
						sessionUrl: "https://claude.ai/code/session_manualOld",
						title: "Same title",
						issueNumber: 999,
						detectedAt: "2026-04-01T00:00:00Z",
						isLive: false,
					},
				],
				"10": [
					{
						sessionUrl: "https://claude.ai/code/session_regexNew",
						title: "Same title",
						issueNumber: 10,
						detectedAt: "2026-04-10T00:00:00Z",
						isLive: true,
					},
				],
			};
			const mapping: SessionIssueMapping = { session_manualOld: 10 };

			const result = mergeSessionsIntoTree(tree, sessions, mapping);

			const issueNode = result.roots[0].children[0];
			expect(issueNode.children).toHaveLength(1);
			if (issueNode.children[0].kind.type === "session") {
				expect(issueNode.children[0].kind.url).toBe("https://claude.ai/code/session_manualOld");
				expect(issueNode.children[0].kind.isManuallyMapped).toBe(true);
			}
		});

		it("storage key が非正整数 ('0'/'-1'/'abc') のセッションは effective issue 判定から除外される", () => {
			// Number(issueKey) が NaN/0/負値のケースは watcher 側で発生し得ないが、
			// storage 汚染や旧スキーマ混入への防御としてガードする。
			const tree: EpicTreeDto = {
				roots: [makeEpicNode(1, [makeIssueNode(10)])],
			};
			const sessions: ClaudeSessionStorage = {
				"0": [
					{
						sessionUrl: "https://claude.ai/code/session_badKey",
						title: "bad key session",
						issueNumber: 0,
						detectedAt: "2026-04-10T00:00:00Z",
						isLive: false,
					},
				],
				abc: [
					{
						sessionUrl: "https://claude.ai/code/session_alphaKey",
						title: "alpha key session",
						issueNumber: 0,
						detectedAt: "2026-04-10T00:00:00Z",
						isLive: false,
					},
				],
			};

			// 手動マッピングなしでは tree に現れない (規定外 key は NaN/0 バケットに入って無視される)
			const result = mergeSessionsIntoTree(tree, sessions, {});

			const issueNode = result.roots[0].children[0];
			expect(issueNode.children).toHaveLength(0);
		});

		it("storage key が非正整数でも手動マッピングがあれば Issue 配下に配置される", () => {
			// 非正整数 key のセッション本体は storage に存在するため、手動マッピング経由で救済できる。
			const tree: EpicTreeDto = {
				roots: [makeEpicNode(1, [makeIssueNode(10)])],
			};
			const sessions: ClaudeSessionStorage = {
				"0": [
					{
						sessionUrl: "https://claude.ai/code/session_rescueMe",
						title: "rescued session",
						issueNumber: 0,
						detectedAt: "2026-04-10T00:00:00Z",
						isLive: false,
					},
				],
			};
			const mapping: SessionIssueMapping = { session_rescueMe: 10 };

			const result = mergeSessionsIntoTree(tree, sessions, mapping);

			const issueNode = result.roots[0].children[0];
			expect(issueNode.children).toHaveLength(1);
			if (issueNode.children[0].kind.type === "session") {
				expect(issueNode.children[0].kind.isManuallyMapped).toBe(true);
			}
		});

		it("sessionUrl から sessionId を抽出できない場合、手動マッピングの評価から除外される", () => {
			// 壊れた URL の場合 regex 抽出結果にフォールバック (isManuallyMapped=false)。
			const tree: EpicTreeDto = {
				roots: [makeEpicNode(1, [makeIssueNode(10)])],
			};
			const sessions: ClaudeSessionStorage = {
				"10": [
					{
						sessionUrl: "https://example.com/not-a-session-url",
						title: "#10 weird url",
						issueNumber: 10,
						detectedAt: "2026-04-10T00:00:00Z",
						isLive: false,
					},
				],
			};
			const mapping: SessionIssueMapping = { session_dummy: 10 };

			const result = mergeSessionsIntoTree(tree, sessions, mapping);

			const issueNode = result.roots[0].children[0];
			expect(issueNode.children).toHaveLength(1);
			if (issueNode.children[0].kind.type === "session") {
				expect(issueNode.children[0].kind.isManuallyMapped).toBe(false);
			}
		});
	});
});
