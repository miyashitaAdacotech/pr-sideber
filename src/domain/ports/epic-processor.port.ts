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
			/**
			 * `true` のとき、この session ノードはユーザーが手動で Issue に紐付けた
			 * `SessionIssueMapping` 経由で配置されていることを示す (Epic #43)。
			 * regex 抽出のみで配置された場合は `false`。UI バッジ表示用。
			 */
			readonly isManuallyMapped: boolean;
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
