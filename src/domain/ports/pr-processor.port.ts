export type ApprovalStatus = "Approved" | "ChangesRequested" | "ReviewRequired" | "Pending";
export type CiStatus = "Passed" | "Failed" | "Running" | "Pending" | "None";
export type MergeableStatus = "Mergeable" | "Conflicting" | "Unknown";

/** Rust の domain::dto::PrItemDto に対応する TypeScript 型 */
export interface PrItemDto {
	readonly id: string;
	readonly number: number;
	readonly title: string;
	readonly author: string;
	readonly url: string;
	readonly repository: string;
	readonly isDraft: boolean;
	readonly approvalStatus: ApprovalStatus;
	readonly ciStatus: CiStatus;
	readonly mergeableStatus: MergeableStatus;
	readonly additions: number;
	readonly deletions: number;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly sizeLabel: string;
	readonly unresolvedCommentCount: number;
}

/** Rust の domain::dto::PrListDto に対応する TypeScript 型 */
export interface PrListDto {
	readonly items: readonly PrItemDto[];
	readonly totalCount: number;
}

export type ProcessedPrsResult = {
	readonly myPrs: PrListDto;
	readonly reviewRequests: PrListDto;
	readonly reviewRequestBadgeCount: number;
};

export interface PrProcessorPort {
	processPullRequests(rawJson: string): ProcessedPrsResult | Promise<ProcessedPrsResult>;
}
