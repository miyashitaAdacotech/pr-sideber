import type { FetchRawPullRequestsResult } from "../types/github";

export interface GitHubApiPort {
	fetchPullRequests(): Promise<FetchRawPullRequestsResult>;
}
