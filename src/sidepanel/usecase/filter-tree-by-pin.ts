import type { EpicTreeDto, TreeNodeDto } from "../../domain/ports/epic-processor.port";

export type PinnedTabRef =
	| { readonly type: "epic"; readonly number: number }
	| { readonly type: "issue"; readonly number: number };

/**
 * 指定された Pin 参照に一致するノードを部分木として抽出し、新しいルートとして返す。
 * depth はルートを 0 として再計算する (Drill-Down 表示で常に浅く見せるため)。
 * 該当ノードが存在しない場合は null を返し、呼び出し側で「オーフェン Pin」として扱う。
 *
 * 純粋関数: 入力ツリーは変更しない。
 */
export function filterTreeByPin(tree: EpicTreeDto, pin: PinnedTabRef): EpicTreeDto | null {
	const found = findNode(tree.roots, pin);
	if (!found) return null;
	return { roots: [resetDepth(found, 0)] };
}

function findNode(nodes: readonly TreeNodeDto[], pin: PinnedTabRef): TreeNodeDto | null {
	for (const node of nodes) {
		if (matches(node, pin)) return node;
		const child = findNode(node.children, pin);
		if (child) return child;
	}
	return null;
}

function matches(node: TreeNodeDto, pin: PinnedTabRef): boolean {
	if (pin.type === "epic" && node.kind.type === "epic") {
		return node.kind.number === pin.number;
	}
	if (pin.type === "issue" && node.kind.type === "issue") {
		return node.kind.number === pin.number;
	}
	return false;
}

function resetDepth(node: TreeNodeDto, depth: number): TreeNodeDto {
	return {
		...node,
		depth,
		children: node.children.map((c) => resetDepth(c, depth + 1)),
	};
}
