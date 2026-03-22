use domain::entity::PullRequest;
use serde::Deserialize;

use crate::error::WasmError;

// --- GraphQL レスポンスの serde 構造体 ---
// GitHub GraphQL API の search query レスポンスに対応。
// TS 側の SearchEdge / GraphQLResponse 型と同等の構造。

#[derive(Debug, Deserialize)]
pub struct GraphQLResponse {
    pub data: Option<GraphQLData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphQLData {
    pub my_prs: Option<SearchResultConnection>,
    pub review_requested: Option<SearchResultConnection>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultConnection {
    pub edges: Vec<SearchEdge>,
}

#[derive(Debug, Deserialize)]
pub struct SearchEdge {
    pub node: Option<PrNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrNode {
    pub id: String,
    pub title: String,
    pub url: String,
    pub number: u32,
    pub is_draft: bool,
    pub review_decision: Option<String>,
    pub author: AuthorRef,
    pub commits: CommitConnection,
    pub repository: RepositoryRef,
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AuthorRef {
    pub login: String,
}

#[derive(Debug, Deserialize)]
pub struct CommitConnection {
    pub nodes: Vec<CommitNode>,
}

#[derive(Debug, Deserialize)]
pub struct CommitNode {
    pub commit: CommitInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub status_check_rollup: Option<StatusCheckRollup>,
}

#[derive(Debug, Deserialize)]
pub struct StatusCheckRollup {
    pub state: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryRef {
    pub name_with_owner: String,
}

/// GraphQL レスポンスの JSON 文字列をパースし、PR ノードの Vec に変換する。
/// null ノードはスキップする。
pub fn parse_pull_request_nodes(json: &str) -> Result<Vec<PullRequest>, WasmError> {
    let response: GraphQLResponse = serde_json::from_str(json)?;

    let data = match response.data {
        Some(d) => d,
        None => return Err(WasmError::EmptyResponse),
    };

    let my_pr_edges = data.my_prs.map_or_else(Vec::new, |conn| conn.edges);
    let review_edges = data
        .review_requested
        .map_or_else(Vec::new, |conn| conn.edges);

    let mut result = Vec::with_capacity(my_pr_edges.len() + review_edges.len());

    for edge in my_pr_edges {
        if let Some(node) = edge.node {
            result.push(convert_node_to_pull_request(node)?);
        }
    }

    for edge in review_edges {
        if let Some(node) = edge.node {
            result.push(convert_node_to_pull_request(node)?);
        }
    }

    Ok(result)
}

/// 単一の PrNode を domain の PullRequest に変換する。
/// 所有権を取得し、不要な String clone を排除する。
pub fn convert_node_to_pull_request(node: PrNode) -> Result<PullRequest, WasmError> {
    let approval_status =
        usecase::determine::determine_approval_status(node.review_decision.as_deref())?;

    let ci_state = node
        .commits
        .nodes
        .last()
        .and_then(|cn| cn.commit.status_check_rollup.as_ref())
        .map(|rollup| rollup.state.as_str());
    let ci_status = usecase::determine::determine_ci_status(ci_state)?;

    let pr = PullRequest::new(
        node.id,
        node.number,
        node.title,
        node.author.login,
        node.url,
        node.repository.name_with_owner,
        node.is_draft,
        approval_status,
        ci_status,
        node.additions.unwrap_or(0),
        node.deletions.unwrap_or(0),
        node.created_at,
        node.updated_at,
    )?;

    Ok(pr)
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::status::{ApprovalStatus, CiStatus};

    /// 正常な PR ノードを含む最小限の GraphQL レスポンス JSON。
    fn valid_single_pr_json() -> &'static str {
        r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_kwDOTest1",
                                "title": "feat: add new feature",
                                "url": "https://github.com/owner/repo/pull/42",
                                "number": 42,
                                "isDraft": false,
                                "reviewDecision": "APPROVED",
                                "author": { "login": "octocat" },
                                "commits": {
                                    "nodes": [
                                        {
                                            "commit": {
                                                "statusCheckRollup": {
                                                    "state": "SUCCESS"
                                                }
                                            }
                                        }
                                    ]
                                },
                                "repository": {
                                    "nameWithOwner": "owner/repo"
                                },
                                "additions": 100,
                                "deletions": 20,
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": {
                    "edges": []
                }
            }
        }"#
    }

    /// テスト用の最小ノード JSON を生成するヘルパー。
    #[allow(dead_code)]
    fn make_node_json(node_content: &str) -> String {
        format!(
            r#"{{"data": {{"myPrs": {{"edges": [{{"node": {node_content}}}]}}, "reviewRequested": {{"edges": []}}}}}}"#,
        )
    }

    #[test]
    fn parse_valid_pr_node_to_pull_request() {
        let result = parse_pull_request_nodes(valid_single_pr_json());
        assert!(result.is_ok(), "should parse valid JSON: {result:?}");
        let prs = result.unwrap();
        assert_eq!(prs.len(), 1);

        let pr = &prs[0];
        assert_eq!(pr.id(), "PR_kwDOTest1");
        assert_eq!(pr.number(), 42);
        assert_eq!(pr.title(), "feat: add new feature");
        assert_eq!(pr.author(), "octocat");
        assert_eq!(pr.url(), "https://github.com/owner/repo/pull/42");
        assert_eq!(pr.repository(), "owner/repo");
        assert!(!pr.is_draft());
        assert_eq!(pr.approval_status(), ApprovalStatus::Approved);
        assert_eq!(pr.ci_status(), CiStatus::Passed);
        assert_eq!(pr.additions(), 100);
        assert_eq!(pr.deletions(), 20);
        assert_eq!(pr.created_at(), "2026-01-01T00:00:00Z");
        assert_eq!(pr.updated_at(), "2026-01-02T00:00:00Z");
    }

    #[test]
    fn review_decision_null_maps_to_pending() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "test pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "alice" },
                                "commits": {
                                    "nodes": [
                                        {
                                            "commit": {
                                                "statusCheckRollup": {
                                                    "state": "SUCCESS"
                                                }
                                            }
                                        }
                                    ]
                                },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs[0].approval_status(), ApprovalStatus::Pending);
    }

    #[test]
    fn status_check_rollup_null_maps_to_ci_none() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "test pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": "APPROVED",
                                "author": { "login": "alice" },
                                "commits": {
                                    "nodes": [
                                        {
                                            "commit": {
                                                "statusCheckRollup": null
                                            }
                                        }
                                    ]
                                },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs[0].ci_status(), CiStatus::None);
    }

    #[test]
    fn empty_commits_nodes_maps_to_ci_none() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "test pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": "APPROVED",
                                "author": { "login": "alice" },
                                "commits": {
                                    "nodes": []
                                },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs[0].ci_status(), CiStatus::None);
    }

    #[test]
    fn null_node_is_skipped() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        { "node": null },
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "valid pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "alice" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs.len(), 1, "null node should be skipped");
        assert_eq!(prs[0].title(), "valid pr");
    }

    #[test]
    fn invalid_json_returns_parse_error() {
        let result = parse_pull_request_nodes("not valid json at all");
        let err = result.expect_err("invalid JSON should return error");
        assert!(
            matches!(err, WasmError::ParseError(_)),
            "should be ParseError variant, got: {err:?}"
        );
    }

    #[test]
    fn missing_required_field_returns_error() {
        // title フィールドが欠損
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "alice" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let result = parse_pull_request_nodes(json);
        assert!(
            result.is_err(),
            "missing required field should return error"
        );
    }

    #[test]
    fn empty_edges_returns_empty_vec() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": []
                },
                "reviewRequested": {
                    "edges": []
                }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse empty edges");
        assert!(prs.is_empty());
    }

    #[test]
    fn additions_deletions_default_to_zero_when_absent() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "no additions/deletions",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "alice" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs[0].additions(), 0);
        assert_eq!(prs[0].deletions(), 0);
    }

    #[test]
    fn both_my_prs_and_review_requested_are_parsed() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "my pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "alice" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_2",
                                "title": "review pr",
                                "url": "https://github.com/o/r/pull/2",
                                "number": 2,
                                "isDraft": true,
                                "reviewDecision": "CHANGES_REQUESTED",
                                "author": { "login": "bob" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-03T00:00:00Z"
                            }
                        }
                    ]
                }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs.len(), 2);
        assert_eq!(prs[0].id(), "PR_1", "myPrs should come first");
        assert_eq!(prs[1].id(), "PR_2", "reviewRequested should come second");
    }

    #[test]
    fn data_null_returns_empty_response_error() {
        let json = r#"{"data": null}"#;
        let result = parse_pull_request_nodes(json);
        let err = result.expect_err("data:null should return error");
        assert!(
            matches!(err, WasmError::EmptyResponse),
            "should be EmptyResponse variant, got: {err:?}"
        );
    }

    #[test]
    fn review_decision_changes_requested_maps_correctly() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "test pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": "CHANGES_REQUESTED",
                                "author": { "login": "alice" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs[0].approval_status(), ApprovalStatus::ChangesRequested);
    }

    #[test]
    fn review_decision_review_required_maps_correctly() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "test pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": "REVIEW_REQUIRED",
                                "author": { "login": "alice" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs[0].approval_status(), ApprovalStatus::ReviewRequired);
    }

    #[test]
    fn ci_state_failure_maps_to_failed() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "test pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "alice" },
                                "commits": {
                                    "nodes": [
                                        {
                                            "commit": {
                                                "statusCheckRollup": {
                                                    "state": "FAILURE"
                                                }
                                            }
                                        }
                                    ]
                                },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs[0].ci_status(), CiStatus::Failed);
    }

    #[test]
    fn ci_state_pending_maps_to_pending() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "test pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "alice" },
                                "commits": {
                                    "nodes": [
                                        {
                                            "commit": {
                                                "statusCheckRollup": {
                                                    "state": "PENDING"
                                                }
                                            }
                                        }
                                    ]
                                },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs[0].ci_status(), CiStatus::Pending);
    }

    #[test]
    fn ci_state_error_maps_to_failed() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "test pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "alice" },
                                "commits": {
                                    "nodes": [
                                        {
                                            "commit": {
                                                "statusCheckRollup": {
                                                    "state": "ERROR"
                                                }
                                            }
                                        }
                                    ]
                                },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse");
        assert_eq!(prs[0].ci_status(), CiStatus::Failed);
    }

    #[test]
    fn unknown_ci_state_returns_error() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "test pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "alice" },
                                "commits": {
                                    "nodes": [
                                        {
                                            "commit": {
                                                "statusCheckRollup": {
                                                    "state": "UNKNOWN_STATE"
                                                }
                                            }
                                        }
                                    ]
                                },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let result = parse_pull_request_nodes(json);
        assert!(result.is_err(), "unknown CI state should return error");
    }

    #[test]
    fn my_prs_null_with_review_requested_present() {
        let json = r#"{
            "data": {
                "myPrs": null,
                "reviewRequested": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "review pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "bob" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                }
            }
        }"#;

        let prs = parse_pull_request_nodes(json).expect("should parse when myPrs is null");
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].id(), "PR_1");
    }

    #[test]
    fn review_requested_null_with_my_prs_present() {
        let json = r#"{
            "data": {
                "myPrs": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "my pr",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "alice" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z"
                            }
                        }
                    ]
                },
                "reviewRequested": null
            }
        }"#;

        let prs =
            parse_pull_request_nodes(json).expect("should parse when reviewRequested is null");
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].id(), "PR_1");
    }
}
