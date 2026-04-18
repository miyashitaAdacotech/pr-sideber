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
			/**
			 * 正規 URL から抽出したセッション ID (`extractSessionIdFromUrl` の戻り値)。
			 * URL が壊れていて抽出できない場合は `null`。
			 * Rust 側の `session_id: Option<String>` と対応 (Issue #47)。
			 * LinkSessionDialog 表示判定および手動マッピング書き込み時のキーに使う。
			 */
			readonly sessionId: string | null;
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
