use domain::issue::{Issue, IssueState, Label};
use serde::Deserialize;

use crate::error::WasmError;

// --- GraphQL レスポンスの serde 構造体 ---
// GitHub GraphQL API の Issue 検索レスポンスに対応。

#[derive(Debug, Deserialize)]
pub struct IssueGraphQLResponse {
    pub data: Option<IssueGraphQLData>,
}

#[derive(Debug, Deserialize)]
pub struct IssueGraphQLData {
    pub issues: Option<IssueSearchConnection>,
}

#[derive(Debug, Deserialize)]
pub struct IssueSearchConnection {
    pub edges: Vec<IssueEdge>,
}

#[derive(Debug, Deserialize)]
pub struct IssueEdge {
    pub node: Option<IssueNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueNode {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub url: String,
    pub state: String,
    pub labels: Option<LabelConnection>,
    pub assignees: Option<AssigneeConnection>,
    pub updated_at: String,
    pub parent: Option<ParentRef>,
}

#[derive(Debug, Deserialize)]
pub struct LabelConnection {
    pub nodes: Vec<LabelNode>,
}

#[derive(Debug, Deserialize)]
pub struct LabelNode {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct AssigneeConnection {
    pub nodes: Vec<AssigneeNode>,
}

#[derive(Debug, Deserialize)]
pub struct AssigneeNode {
    pub login: String,
}

#[derive(Debug, Deserialize)]
pub struct ParentRef {
    pub number: u32,
    pub title: String,
}

/// GraphQL レスポンスの JSON 文字列をパースし、Issue エンティティのリストを返す。
/// 個別の Issue ノードが不正な場合はスキップしてログを出力する。
pub fn parse_issue_nodes(raw_json: &str) -> Result<Vec<Issue>, WasmError> {
    let response: IssueGraphQLResponse = serde_json::from_str(raw_json)?;

    let data = match response.data {
        Some(d) => d,
        None => return Err(WasmError::EmptyResponse),
    };

    let edges = data.issues.map_or_else(Vec::new, |conn| conn.edges);

    let mut issues = Vec::with_capacity(edges.len());
    for edge in edges {
        let node = match edge.node {
            Some(n) => n,
            None => continue,
        };
        match convert_node_to_issue(node) {
            Ok(issue) => issues.push(issue),
            Err(e) => {
                #[cfg(target_arch = "wasm32")]
                web_sys::console::warn_1(&format!("skipping invalid issue: {e}").into());
                #[cfg(not(target_arch = "wasm32"))]
                eprintln!("skipping invalid issue: {e}");
            }
        }
    }

    Ok(issues)
}

/// IssueNode の state 文字列を domain の IssueState に変換する。
fn parse_issue_state(state: &str) -> Result<IssueState, WasmError> {
    match state {
        "OPEN" => Ok(IssueState::Open),
        "CLOSED" => Ok(IssueState::Closed),
        other => Err(WasmError::DomainError(
            domain::error::DomainError::InvalidField {
                field: "state".to_string(),
                reason: format!("unknown issue state: {other}"),
            },
        )),
    }
}

/// 単一の IssueNode を domain の Issue に変換する。
fn convert_node_to_issue(node: IssueNode) -> Result<Issue, WasmError> {
    let state = parse_issue_state(&node.state)?;

    let labels = node.labels.map_or_else(Vec::new, |conn| {
        conn.nodes
            .into_iter()
            .map(|ln| Label::new(ln.name, ln.color))
            .collect()
    });

    let assignees = node.assignees.map_or_else(Vec::new, |conn| {
        conn.nodes.into_iter().map(|a| a.login).collect()
    });

    let (parent_number, parent_title) = match node.parent {
        Some(p) => (Some(p.number), Some(p.title)),
        None => (None, None),
    };

    let issue = Issue::new(
        node.id,
        node.number,
        node.title,
        node.url,
        state,
        labels,
        assignees,
        node.updated_at,
        parent_number,
        parent_title,
    )?;

    Ok(issue)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_issue_json() -> &'static str {
        r#"{
            "data": {
                "issues": {
                    "edges": [
                        {
                            "node": {
                                "id": "ISSUE_1",
                                "number": 42,
                                "title": "Fix the bug",
                                "url": "https://github.com/o/r/issues/42",
                                "state": "OPEN",
                                "labels": {
                                    "nodes": [
                                        { "name": "bug", "color": "d73a4a" },
                                        { "name": "priority", "color": "ff0000" }
                                    ]
                                },
                                "assignees": {
                                    "nodes": [
                                        { "login": "alice" },
                                        { "login": "bob" }
                                    ]
                                },
                                "updatedAt": "2026-03-01T00:00:00Z",
                                "parent": {
                                    "number": 100,
                                    "title": "Epic: CI/CD"
                                }
                            }
                        }
                    ]
                }
            }
        }"#
    }

    #[test]
    fn parse_valid_issue_node() {
        let result = parse_issue_nodes(valid_issue_json());
        assert!(result.is_ok(), "should parse valid JSON: {result:?}");
        let issues = result.unwrap();
        assert_eq!(issues.len(), 1);

        let issue = &issues[0];
        assert_eq!(issue.id(), "ISSUE_1");
        assert_eq!(issue.number(), 42);
        assert_eq!(issue.title(), "Fix the bug");
        assert_eq!(issue.url(), "https://github.com/o/r/issues/42");
        assert_eq!(issue.state(), &IssueState::Open);
        assert_eq!(issue.labels().len(), 2);
        assert_eq!(issue.labels()[0].name(), "bug");
        assert_eq!(issue.labels()[0].color(), "d73a4a");
        assert_eq!(issue.labels()[1].name(), "priority");
        assert_eq!(issue.assignees(), &["alice", "bob"]);
        assert_eq!(issue.updated_at(), "2026-03-01T00:00:00Z");
        assert_eq!(issue.parent_number(), Some(100));
        assert_eq!(issue.parent_title(), Some("Epic: CI/CD"));
    }

    #[test]
    fn parse_issue_without_parent() {
        let json = r#"{
            "data": {
                "issues": {
                    "edges": [
                        {
                            "node": {
                                "id": "ISSUE_2",
                                "number": 10,
                                "title": "Simple task",
                                "url": "https://github.com/o/r/issues/10",
                                "state": "CLOSED",
                                "labels": { "nodes": [] },
                                "assignees": { "nodes": [] },
                                "updatedAt": "2026-02-01T00:00:00Z",
                                "parent": null
                            }
                        }
                    ]
                }
            }
        }"#;

        let issues = parse_issue_nodes(json).expect("should parse");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].state(), &IssueState::Closed);
        assert_eq!(issues[0].parent_number(), None);
        assert_eq!(issues[0].parent_title(), None);
        assert!(issues[0].labels().is_empty());
        assert!(issues[0].assignees().is_empty());
    }

    #[test]
    fn parse_empty_edges_returns_empty_vec() {
        let json = r#"{
            "data": {
                "issues": {
                    "edges": []
                }
            }
        }"#;

        let issues = parse_issue_nodes(json).expect("should parse empty edges");
        assert!(issues.is_empty());
    }

    #[test]
    fn parse_invalid_json_returns_parse_error() {
        let result = parse_issue_nodes("not valid json at all");
        let err = result.expect_err("invalid JSON should return error");
        assert!(
            matches!(err, WasmError::ParseError(_)),
            "should be ParseError variant, got: {err:?}"
        );
    }

    #[test]
    fn parse_data_null_returns_empty_response_error() {
        let json = r#"{"data": null}"#;
        let result = parse_issue_nodes(json);
        let err = result.expect_err("data:null should return error");
        assert!(
            matches!(err, WasmError::EmptyResponse),
            "should be EmptyResponse variant, got: {err:?}"
        );
    }

    #[test]
    fn null_node_is_skipped() {
        let json = r#"{
            "data": {
                "issues": {
                    "edges": [
                        { "node": null },
                        {
                            "node": {
                                "id": "ISSUE_1",
                                "number": 1,
                                "title": "Valid issue",
                                "url": "https://github.com/o/r/issues/1",
                                "state": "OPEN",
                                "labels": { "nodes": [] },
                                "assignees": { "nodes": [] },
                                "updatedAt": "2026-01-01T00:00:00Z",
                                "parent": null
                            }
                        }
                    ]
                }
            }
        }"#;

        let issues = parse_issue_nodes(json).expect("should parse");
        assert_eq!(issues.len(), 1, "null node should be skipped");
        assert_eq!(issues[0].title(), "Valid issue");
    }

    #[test]
    fn invalid_individual_issue_is_skipped() {
        // 2つ目の Issue は title が空でドメインバリデーションに失敗する
        let json = r#"{
            "data": {
                "issues": {
                    "edges": [
                        {
                            "node": {
                                "id": "ISSUE_1",
                                "number": 1,
                                "title": "Valid issue",
                                "url": "https://github.com/o/r/issues/1",
                                "state": "OPEN",
                                "labels": { "nodes": [] },
                                "assignees": { "nodes": [] },
                                "updatedAt": "2026-01-01T00:00:00Z",
                                "parent": null
                            }
                        },
                        {
                            "node": {
                                "id": "ISSUE_2",
                                "number": 2,
                                "title": "",
                                "url": "https://github.com/o/r/issues/2",
                                "state": "OPEN",
                                "labels": { "nodes": [] },
                                "assignees": { "nodes": [] },
                                "updatedAt": "2026-01-01T00:00:00Z",
                                "parent": null
                            }
                        }
                    ]
                }
            }
        }"#;

        let issues = parse_issue_nodes(json).expect("should parse, skipping invalid");
        assert_eq!(issues.len(), 1, "invalid issue should be skipped");
        assert_eq!(issues[0].title(), "Valid issue");
    }

    #[test]
    fn issues_null_returns_empty_vec() {
        let json = r#"{
            "data": {
                "issues": null
            }
        }"#;

        let issues = parse_issue_nodes(json).expect("should parse when issues is null");
        assert!(issues.is_empty());
    }

    #[test]
    fn labels_and_assignees_null_produce_empty_vecs() {
        let json = r#"{
            "data": {
                "issues": {
                    "edges": [
                        {
                            "node": {
                                "id": "ISSUE_1",
                                "number": 1,
                                "title": "No labels or assignees",
                                "url": "https://github.com/o/r/issues/1",
                                "state": "OPEN",
                                "labels": null,
                                "assignees": null,
                                "updatedAt": "2026-01-01T00:00:00Z",
                                "parent": null
                            }
                        }
                    ]
                }
            }
        }"#;

        let issues = parse_issue_nodes(json).expect("should parse");
        assert_eq!(issues.len(), 1);
        assert!(issues[0].labels().is_empty());
        assert!(issues[0].assignees().is_empty());
    }

    #[test]
    fn unknown_state_skips_issue() {
        let json = r#"{
            "data": {
                "issues": {
                    "edges": [
                        {
                            "node": {
                                "id": "ISSUE_1",
                                "number": 1,
                                "title": "Unknown state",
                                "url": "https://github.com/o/r/issues/1",
                                "state": "DRAFT",
                                "labels": { "nodes": [] },
                                "assignees": { "nodes": [] },
                                "updatedAt": "2026-01-01T00:00:00Z",
                                "parent": null
                            }
                        }
                    ]
                }
            }
        }"#;

        let issues = parse_issue_nodes(json).expect("should parse, skipping unknown state");
        assert!(
            issues.is_empty(),
            "issue with unknown state should be skipped"
        );
    }

    #[test]
    fn multiple_valid_issues_all_parsed() {
        let json = r#"{
            "data": {
                "issues": {
                    "edges": [
                        {
                            "node": {
                                "id": "ISSUE_1",
                                "number": 1,
                                "title": "First",
                                "url": "https://github.com/o/r/issues/1",
                                "state": "OPEN",
                                "labels": { "nodes": [] },
                                "assignees": { "nodes": [] },
                                "updatedAt": "2026-01-01T00:00:00Z",
                                "parent": null
                            }
                        },
                        {
                            "node": {
                                "id": "ISSUE_2",
                                "number": 2,
                                "title": "Second",
                                "url": "https://github.com/o/r/issues/2",
                                "state": "CLOSED",
                                "labels": { "nodes": [{ "name": "done", "color": "0e8a16" }] },
                                "assignees": { "nodes": [{ "login": "charlie" }] },
                                "updatedAt": "2026-02-01T00:00:00Z",
                                "parent": { "number": 50, "title": "Parent" }
                            }
                        }
                    ]
                }
            }
        }"#;

        let issues = parse_issue_nodes(json).expect("should parse multiple issues");
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].number(), 1);
        assert_eq!(issues[0].title(), "First");
        assert_eq!(issues[1].number(), 2);
        assert_eq!(issues[1].title(), "Second");
        assert_eq!(issues[1].parent_number(), Some(50));
    }
}
