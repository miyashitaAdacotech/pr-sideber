export interface TreeLabel {
	readonly name: string;
	readonly color: string;
}

export interface TreePrData {
	readonly additions: number;
	readonly deletions: number;
	readonly ciStatus: string;
	readonly approvalStatus: string;
	readonly mergeableStatus: string;
	readonly isDraft: boolean;
	readonly sizeLabel: string;
	readonly unresolvedCommentCount: number;
}

export type TreeNodeKind =
	| { readonly type: "epic"; readonly number: number; readonly title: string }
	| {
			readonly type: "issue";
			readonly number: number;
			readonly title: string;
			readonly url: string;
			readonly state: string;
			readonly labels: readonly TreeLabel[];
	  }
	| {
			readonly type: "pullRequest";
			readonly number: number;
			readonly title: string;
			readonly url: string;
			readonly prData: TreePrData;
	  }
	| {
			readonly type: "session";
			readonly title: string;
			readonly url: string;
			readonly issueNumber: number;
	  };

export interface TreeNodeDto {
	readonly kind: TreeNodeKind;
	readonly children: readonly TreeNodeDto[];
	readonly depth: number;
}

export interface EpicTreeDto {
	readonly roots: readonly TreeNodeDto[];
}

export interface EpicProcessorPort {
	processEpicTree(issuesJson: string, prsJson: string): EpicTreeDto | Promise<EpicTreeDto>;
}
