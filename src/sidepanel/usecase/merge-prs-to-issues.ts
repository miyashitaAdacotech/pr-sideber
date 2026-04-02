import type { EpicTreeDto, TreeNodeDto } from "../../domain/ports/epic-processor.port";

type PrEdge = {
	readonly node?: {
		readonly number?: number;
		readonly closingIssuesReferences?: {
			readonly nodes: ReadonlyArray<{ readonly number: number }>;
		};
		readonly linkedIssues?: { readonly nodes: ReadonlyArray<{ readonly number: number }> };
	};
};

type PrSearchResponse = {
	readonly data?: {
		readonly myPrs?: { readonly edges: readonly PrEdge[] };
		readonly reviewRequested?: { readonly edges: readonly PrEdge[] };
	};
};

/**
 * PR の closingIssuesReferences と linkedIssues から PR番号 → Issue番号[] のマッピングを抽出する。
 * myPrs / reviewRequested 両エッジを走査し、同一 PR が両方にある場合はリンク先をマージする。
 */
export function extractPrIssueLinks(prsRawJson: string): ReadonlyMap<number, readonly number[]> {
	const map = new Map<number, Set<number>>();
	try {
		const parsed = JSON.parse(prsRawJson) as PrSearchResponse;
		const myEdges = parsed?.data?.myPrs?.edges ?? [];
		const reviewEdges = parsed?.data?.reviewRequested?.edges ?? [];
		for (const edge of [...myEdges, ...reviewEdges]) {
			collectIssueNumbers(edge, map);
		}
	} catch (error: unknown) {
		// rawJson が壊れている異常事態。PR-Issue リンクなしとして動作継続し、Epic ツリー表示への影響を局所化する
		console.warn(
			"[extractPrIssueLinks] JSON parse failed:",
			error instanceof Error ? error.message : String(error),
		);
	}
	return new Map([...map].map(([pr, issues]) => [pr, [...issues]]));
}

/** 1つの PR エッジから closingIssuesReferences + linkedIssues の Issue 番号を収集する */
function collectIssueNumbers(edge: PrEdge, map: Map<number, Set<number>>): void {
	const node = edge.node;
	if (!node?.number) return;
	const closingRefs = node.closingIssuesReferences?.nodes ?? [];
	const linkedRefs = node.linkedIssues?.nodes ?? [];
	const allRefs = [...closingRefs, ...linkedRefs];
	if (allRefs.length === 0) return;
	const existing = map.get(node.number) ?? new Set<number>();
	for (const ref of allRefs) {
		existing.add(ref.number);
	}
	map.set(node.number, existing);
}

/**
 * Epic ツリー内の PR ノードを「Epic なし」から対応する Issue ノードの子に移動する。
 * 純粋関数: 元のツリーは変更しない。
 */
export function movePrsToLinkedIssues(
	tree: EpicTreeDto,
	prIssueLinks: ReadonlyMap<number, readonly number[]>,
): EpicTreeDto {
	if (prIssueLinks.size === 0) return tree;

	// Issue番号 → PR番号[] の逆マップを構築
	const issueToPrs = new Map<number, number[]>();
	for (const [prNumber, issueNumbers] of prIssueLinks) {
		for (const issueNumber of issueNumbers) {
			const existing = issueToPrs.get(issueNumber) ?? [];
			existing.push(prNumber);
			issueToPrs.set(issueNumber, existing);
		}
	}

	// PR番号 → PRノードのマップ（"Epic なし" から収集）
	const prNodes = new Map<number, TreeNodeDto>();
	const movedPrNumbers = new Set<number>();

	// "Epic なし" グループから PR ノードを収集
	for (const root of tree.roots) {
		if (root.kind.type === "epic" && root.kind.number === 0) {
			for (const child of root.children) {
				if (child.kind.type === "pullRequest") {
					prNodes.set(child.kind.number, child);
				}
			}
		}
	}

	// Issue ノードに PR を追加する再帰関数
	function addPrsToIssue(node: TreeNodeDto): TreeNodeDto {
		if (node.kind.type === "issue") {
			const linkedPrNumbers = issueToPrs.get(node.kind.number) ?? [];
			const prsToAdd: TreeNodeDto[] = [];
			for (const prNum of linkedPrNumbers) {
				const prNode = prNodes.get(prNum);
				if (prNode) {
					prsToAdd.push({ ...prNode, depth: node.depth + 1 });
					movedPrNumbers.add(prNum);
				}
			}
			if (prsToAdd.length > 0) {
				return {
					...node,
					children: [...node.children.map(addPrsToIssue), ...prsToAdd],
				};
			}
		}
		return {
			...node,
			children: node.children.map(addPrsToIssue),
		};
	}

	// ツリーを再構築（PR を Issue の下に移動）
	const newRoots = tree.roots.map((root) => {
		const updated = addPrsToIssue(root);
		// "Epic なし" グループから移動済み PR を除去
		if (root.kind.type === "epic" && root.kind.number === 0) {
			return {
				...updated,
				children: updated.children.filter((child) => {
					if (child.kind.type === "pullRequest" && movedPrNumbers.has(child.kind.number)) {
						return false;
					}
					return true;
				}),
			};
		}
		return updated;
	});

	// "Epic なし" が空になったら除去
	const filteredRoots = newRoots.filter((root) => {
		if (root.kind.type === "epic" && root.kind.number === 0 && root.children.length === 0) {
			return false;
		}
		return true;
	});

	return { roots: filteredRoots };
}
