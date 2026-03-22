import type { FetchPullRequestsResult } from "../../shared/types/github";

export interface GitHubApiPort {
	fetchPullRequests(): Promise<FetchPullRequestsResult>;
}
