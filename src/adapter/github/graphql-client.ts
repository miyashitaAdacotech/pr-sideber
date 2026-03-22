import type { GitHubApiPort } from "../../domain/ports/github-api.port";
import { GitHubApiError } from "../../shared/types/errors";
import type {
	FetchPullRequestsResult,
	PullRequest,
	ReviewDecision,
	StatusState,
} from "../../shared/types/github";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

// --- Adapter 内部型 (export しない) ---

type SearchEdge = {
	readonly node: {
		readonly title: string;
		readonly url: string;
		readonly number: number;
		readonly isDraft: boolean;
		readonly reviewDecision: ReviewDecision;
		readonly commits: {
			readonly nodes: ReadonlyArray<{
				readonly commit: {
					readonly statusCheckRollup: {
						readonly state: StatusState;
					} | null;
				};
			}>;
		};
		readonly repository: {
			readonly nameWithOwner: string;
		};
		readonly createdAt: string;
		readonly updatedAt: string;
	} | null;
};

type SearchResultConnection = {
	readonly edges: readonly SearchEdge[];
	readonly pageInfo: {
		readonly hasNextPage: boolean;
	};
};

type GraphQLResponse = {
	readonly data?: {
		readonly myPrs: SearchResultConnection | null;
		readonly reviewRequested: SearchResultConnection | null;
	};
	readonly errors?: ReadonlyArray<{
		readonly message: string;
	}>;
};

// --- GraphQL クエリ (Fragment 化) ---

const PR_FIELDS_FRAGMENT = `
fragment PrFields on PullRequest {
  title
  url
  number
  isDraft
  reviewDecision
  commits(last: 1) {
    nodes {
      commit {
        statusCheckRollup {
          state
        }
      }
    }
  }
  repository {
    nameWithOwner
  }
  createdAt
  updatedAt
}`;

const PULL_REQUESTS_QUERY = `
${PR_FIELDS_FRAGMENT}
query {
  myPrs: search(query: "author:@me is:open is:pr", type: ISSUE, first: 50) {
    edges {
      node {
        ...PrFields
      }
    }
    pageInfo {
      hasNextPage
    }
  }
  reviewRequested: search(query: "review-requested:@me is:open is:pr", type: ISSUE, first: 50) {
    edges {
      node {
        ...PrFields
      }
    }
    pageInfo {
      hasNextPage
    }
  }
}
`;

export class GitHubGraphQLClient implements GitHubApiPort {
	constructor(private readonly getAccessToken: () => Promise<string>) {}

	async fetchPullRequests(): Promise<FetchPullRequestsResult> {
		const token = await this.getAccessToken();
		const response = await this.executeQuery(token);
		const body = await this.parseResponseBody(response);

		this.checkGraphQLErrors(body);

		if (!body.data) {
			throw new GitHubApiError("unknown", "GraphQL response missing data field");
		}

		const myPrsConnection = body.data.myPrs;
		const reviewRequestedConnection = body.data.reviewRequested;

		const myPrsEdges = myPrsConnection?.edges ?? [];
		const reviewRequestedEdges = reviewRequestedConnection?.edges ?? [];

		const hasMore =
			(myPrsConnection?.pageInfo.hasNextPage ?? false) ||
			(reviewRequestedConnection?.pageInfo.hasNextPage ?? false);

		return {
			myPrs: myPrsEdges
				.filter((edge): edge is SearchEdge & { node: NonNullable<SearchEdge["node"]> } => edge.node !== null)
				.map(mapEdgeToPullRequest),
			reviewRequested: reviewRequestedEdges
				.filter((edge): edge is SearchEdge & { node: NonNullable<SearchEdge["node"]> } => edge.node !== null)
				.map(mapEdgeToPullRequest),
			hasMore,
		};
	}

	private async executeQuery(token: string): Promise<Response> {
		let response: Response;
		try {
			response = await fetch(GRAPHQL_ENDPOINT, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ query: PULL_REQUESTS_QUERY }),
			});
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : undefined;
			throw new GitHubApiError("network_error", "Network request failed", undefined, details);
		}

		if (!response.ok) {
			throw new GitHubApiError(
				mapHttpStatusToErrorCode(response.status),
				`GitHub API error: ${response.status} ${response.statusText}`,
				response.status,
			);
		}

		return response;
	}

	private async parseResponseBody(response: Response): Promise<GraphQLResponse> {
		try {
			return (await response.json()) as GraphQLResponse;
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : undefined;
			throw new GitHubApiError("unknown", "Failed to parse API response", undefined, details);
		}
	}

	// Partial error (data + errors 同時) も安全側に倒して reject する。
	// 部分的に有効なデータがあっても、整合性が保証できないため一律エラー扱い。
	private checkGraphQLErrors(body: GraphQLResponse): void {
		if (body.errors && body.errors.length > 0) {
			const details = body.errors.map((e) => e.message).join("; ");
			throw new GitHubApiError(
				"graphql_error",
				"GitHub API returned GraphQL errors",
				undefined,
				details,
			);
		}
	}
}

function mapHttpStatusToErrorCode(status: number): GitHubApiError["code"] {
	if (status === 401) return "unauthorized";
	if (status === 403) return "forbidden";
	if (status === 429) return "rate_limited";
	if (status >= 500) return "server_error";
	return "unknown";
}

function mapEdgeToPullRequest(edge: { node: NonNullable<SearchEdge["node"]> }): PullRequest {
	const node = edge.node;
	const lastCommit = node.commits.nodes.length > 0 ? node.commits.nodes[0] : null;
	const statusState = lastCommit?.commit.statusCheckRollup?.state ?? null;

	return {
		title: node.title,
		url: node.url,
		number: node.number,
		isDraft: node.isDraft,
		reviewDecision: node.reviewDecision,
		commitStatusState: statusState,
		repository: {
			nameWithOwner: node.repository.nameWithOwner,
		},
		createdAt: node.createdAt,
		updatedAt: node.updatedAt,
	};
}
