import type { FetchPullRequestsResult } from "../types/github";

export interface GitHubApiPort {
	fetchPullRequests(): Promise<FetchPullRequestsResult>;
}
