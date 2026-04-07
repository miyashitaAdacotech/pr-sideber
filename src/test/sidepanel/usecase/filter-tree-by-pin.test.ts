import { describe, expect, it } from "vitest";
import type { EpicTreeDto, TreeNodeDto } from "../../../domain/ports/epic-processor.port";
import { filterTreeByPin } from "../../../sidepanel/usecase/filter-tree-by-pin";

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

describe("filterTreeByPin", () => {
	it("epic を pin したらそのノードがルートになり depth が 0 にリセットされる", () => {
		const tree: EpicTreeDto = {
			roots: [epic(1, [epic(2, [issue(10, [], 2)], 1)])],
		};

		const result = filterTreeByPin(tree, { type: "epic", number: 2 });

		expect(result).not.toBeNull();
		expect(result?.roots).toHaveLength(1);
		const root = result?.roots[0];
		expect(root?.kind.type).toBe("epic");
		if (root?.kind.type === "epic") expect(root.kind.number).toBe(2);
		expect(root?.depth).toBe(0);
		expect(root?.children[0]?.depth).toBe(1);
	});

	it("issue を pin した場合も同様にルートとして抽出される", () => {
		const tree: EpicTreeDto = {
			roots: [epic(1, [issue(100, [issue(200, [], 2)], 1)])],
		};

		const result = filterTreeByPin(tree, { type: "issue", number: 100 });

		expect(result?.roots[0]?.kind.type).toBe("issue");
		expect(result?.roots[0]?.depth).toBe(0);
		expect(result?.roots[0]?.children[0]?.depth).toBe(1);
	});

	it("見つからない場合は null を返す (オーフェン Pin)", () => {
		const tree: EpicTreeDto = { roots: [epic(1)] };
		expect(filterTreeByPin(tree, { type: "epic", number: 999 })).toBeNull();
	});

	it("元のツリーは変更しない (純粋関数)", () => {
		const tree: EpicTreeDto = { roots: [epic(1, [issue(10, [], 1)])] };
		const snapshot = JSON.stringify(tree);
		filterTreeByPin(tree, { type: "epic", number: 1 });
		expect(JSON.stringify(tree)).toBe(snapshot);
	});
});
