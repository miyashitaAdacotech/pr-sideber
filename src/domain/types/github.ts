export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

export type StatusState = "EXPECTED" | "ERROR" | "FAILURE" | "PENDING" | "SUCCESS";

export type PullRequest = {
	readonly title: string;
	readonly url: string;
	readonly number: number;
	readonly isDraft: boolean;
	readonly reviewDecision: ReviewDecision;
	readonly commitStatusState: StatusState | null;
	readonly repository: {
		readonly nameWithOwner: string;
	};
	readonly createdAt: string;
	readonly updatedAt: string;
};

export type FetchPullRequestsResult = {
	readonly myPrs: readonly PullRequest[];
	readonly reviewRequested: readonly PullRequest[];
	readonly hasMore: boolean;
};
