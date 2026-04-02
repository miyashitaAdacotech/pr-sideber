import { GitHubApiError } from "../../shared/types/errors";
import { devOnlyDetails, devOnlyMessage } from "./dev-details";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

const ISSUE_FIELDS_FRAGMENT = `
fragment IssueFields on Issue {
  id
  number
  title
  url
  state
  labels(first: 10) {
    nodes {
      name
      color
    }
  }
  assignees(first: 5) {
    nodes {
      login
    }
  }
  updatedAt
  parent {
    id
    number
    title
  }
}`;

const ISSUES_QUERY = `
${ISSUE_FIELDS_FRAGMENT}
query {
  issues: search(query: "assignee:@me is:issue is:open", type: ISSUE, first: 50) {
    edges {
      node {
        ...IssueFields
      }
    }
  }
}
`;

type GraphQLResponse = {
	readonly data?: unknown;
	readonly errors?: ReadonlyArray<{ readonly message: string }>;
};

export class IssueGraphQLClient {
	private readonly getAccessToken: () => Promise<string>;

	constructor(getAccessToken: () => Promise<string>) {
		this.getAccessToken = getAccessToken;
	}

	/** Issue 一覧を取得し、WASM 処理用の生 JSON 文字列を返す */
	async fetchIssues(): Promise<string> {
		const token = await this.getAccessToken();
		const response = await this.executeQuery(token);
		const rawJson = await this.parseResponseBody(response);

		let body: GraphQLResponse;
		try {
			body = JSON.parse(rawJson) as GraphQLResponse;
		} catch (error: unknown) {
			throw new GitHubApiError(
				"unknown",
				"Failed to parse API response",
				undefined,
				devOnlyDetails(error),
			);
		}

		this.checkGraphQLErrors(body);

		if (!body.data) {
			throw new GitHubApiError("unknown", "GraphQL response missing data field");
		}

		return rawJson;
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
				body: JSON.stringify({ query: ISSUES_QUERY }),
			});
		} catch (error: unknown) {
			throw new GitHubApiError(
				"network_error",
				"Network request failed",
				undefined,
				devOnlyDetails(error),
			);
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

	private async parseResponseBody(response: Response): Promise<string> {
		try {
			return await response.text();
		} catch (error: unknown) {
			throw new GitHubApiError(
				"unknown",
				"Failed to parse API response",
				undefined,
				devOnlyDetails(error),
			);
		}
	}

	// Partial error (data + errors 同時) も安全側に倒して reject する。
	// 部分的に有効なデータがあっても、整合性が保証できないため一律エラー扱い。
	private checkGraphQLErrors(body: GraphQLResponse): void {
		if (body.errors && body.errors.length > 0) {
			const details = devOnlyMessage(body.errors.map((e) => e.message).join("; "));
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
