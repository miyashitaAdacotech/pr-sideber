pub mod dto;
pub mod epic_dto;
pub mod error;
pub mod issue_dto;
pub mod issue_parser;
pub mod parser;

use crate::dto::{PrItemDto, PrListDto};
use crate::epic_dto::EpicTreeDto;
use crate::issue_dto::{IssueItemDto, IssueListDto};
use wasm_bindgen::prelude::*;

/// WASM モジュール初期化。パニック時にコンソールにエラーを出力するフックを設定する。
#[wasm_bindgen(js_name = "initWasm")]
pub fn init_wasm() {
    console_error_panic_hook::set_once();
}

/// 名前を受け取り、Greeting を JSON (JsValue) で返す。
/// シリアライズに失敗した場合はエラーログを出力し JsValue::NULL を返す。
#[wasm_bindgen]
pub fn greet(name: &str) -> JsValue {
    let greeting = usecase::create_greeting(name);
    match serde_wasm_bindgen::to_value(&greeting) {
        Ok(val) => val,
        Err(e) => {
            web_sys::console::error_1(&format!("serialize failed: {e}").into());
            JsValue::NULL
        }
    }
}

fn to_pr_list_dto(prs: Vec<domain::entity::PullRequest>) -> PrListDto {
    let total_count = prs.len() as u32;
    let items = prs.into_iter().map(PrItemDto::from).collect();
    PrListDto { items, total_count }
}

fn to_issue_list_dto(issues: Vec<domain::issue::Issue>) -> IssueListDto {
    let total_count = issues.len() as u32;
    let items = issues.into_iter().map(IssueItemDto::from).collect();
    IssueListDto { items, total_count }
}

/// GraphQL レスポンス JSON を受け取り、分類・ソート済みの PR リストを返す。
///
/// # Arguments
/// * `raw_json` - GitHub GraphQL API のレスポンス JSON 文字列
///
/// # Returns
/// * `my_prs` - 自分が author の PR リスト (JsValue にシリアライズ)
/// * `review_requests` - レビューリクエストされた PR リスト (JsValue にシリアライズ)
#[wasm_bindgen(js_name = "processPullRequests")]
pub fn process_pull_requests(raw_json: &str) -> Result<JsValue, JsError> {
    let parsed =
        parser::parse_pull_request_nodes(raw_json).map_err(|e| JsError::new(&e.to_string()))?;

    let processed = usecase::process::process_pull_requests(parsed.my_prs, parsed.review_requests);

    serde_wasm_bindgen::to_value(&ProcessedPrsResult {
        my_prs: to_pr_list_dto(processed.my_prs),
        review_requests: to_pr_list_dto(processed.review_requests),
        review_request_badge_count: processed.review_request_badge_count,
    })
    .map_err(|e| JsError::new(&e.to_string()))
}

/// GraphQL レスポンス JSON を受け取り、ソート済みの Issue リストを返す。
#[wasm_bindgen(js_name = "processIssues")]
pub fn process_issues(raw_json: &str) -> Result<JsValue, JsError> {
    let mut issues =
        issue_parser::parse_issue_nodes(raw_json).map_err(|e| JsError::new(&e.to_string()))?;

    usecase::issue_process::sort_issues_by_updated_at_desc(&mut issues);

    let dto = to_issue_list_dto(issues);
    serde_wasm_bindgen::to_value(&dto).map_err(|e| JsError::new(&e.to_string()))
}

/// Issue + PR の JSON を受け取り、Epic ツリーを返す。
#[wasm_bindgen(js_name = "processEpicTree")]
pub fn process_epic_tree(issues_json: &str, prs_json: &str) -> Result<JsValue, JsError> {
    let issues =
        issue_parser::parse_issue_nodes(issues_json).map_err(|e| JsError::new(&e.to_string()))?;

    let parsed_prs =
        parser::parse_pull_request_nodes(prs_json).map_err(|e| JsError::new(&e.to_string()))?;

    let all_prs = {
        let processed =
            usecase::process::process_pull_requests(parsed_prs.my_prs, parsed_prs.review_requests);
        processed.my_prs
    };

    let tree = usecase::epic_process::build_epic_tree(issues, all_prs);

    let dto = EpicTreeDto { roots: tree };
    // serde_wasm_bindgen は internally tagged enum の #[serde(rename)] を正しく処理しない場合がある。
    // serde_json 経由で JSON 文字列化 → JS の JSON.parse で JsValue に変換する安全パスを使用。
    let json_str = serde_json::to_string(&dto).map_err(|e| JsError::new(&e.to_string()))?;
    js_sys::JSON::parse(&json_str).map_err(|e| JsError::new(&format!("JSON parse failed: {e:?}")))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessedPrsResult {
    my_prs: PrListDto,
    review_requests: PrListDto,
    review_request_badge_count: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_wasm_does_not_panic() {
        init_wasm();
    }

    #[test]
    fn greet_delegates_to_usecase() {
        let greeting = usecase::create_greeting("Test");
        assert_eq!(greeting.message, "Hello, Test!");
    }

    #[test]
    fn parse_and_process_with_valid_json() {
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
                                "reviewDecision": "APPROVED",
                                "author": { "login": "alice" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "additions": 10,
                                "deletions": 5,
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z",
                                "mergeable": null
                            }
                        }
                    ]
                },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let parsed = parser::parse_pull_request_nodes(json).expect("should parse");
        let processed =
            usecase::process::process_pull_requests(parsed.my_prs, parsed.review_requests);
        assert_eq!(processed.my_prs.len(), 1);
        assert_eq!(processed.my_prs[0].number(), 1);
        assert!(processed.review_requests.is_empty());
    }

    #[test]
    fn parse_and_process_with_empty_json() {
        let json = r#"{
            "data": {
                "myPrs": { "edges": [] },
                "reviewRequested": { "edges": [] }
            }
        }"#;

        let parsed = parser::parse_pull_request_nodes(json).expect("should parse");
        let processed =
            usecase::process::process_pull_requests(parsed.my_prs, parsed.review_requests);
        assert!(processed.my_prs.is_empty());
        assert!(processed.review_requests.is_empty());
    }

    #[test]
    fn parse_with_invalid_json_returns_error() {
        let result = parser::parse_pull_request_nodes("not json");
        assert!(result.is_err());
    }

    #[test]
    fn parse_and_process_separates_by_graphql_query() {
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
                                "updatedAt": "2026-01-02T00:00:00Z",
                                "mergeable": null
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
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "bob" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-03T00:00:00Z",
                                "mergeable": null
                            }
                        }
                    ]
                }
            }
        }"#;

        let parsed = parser::parse_pull_request_nodes(json).expect("should parse");
        let processed =
            usecase::process::process_pull_requests(parsed.my_prs, parsed.review_requests);
        assert_eq!(processed.my_prs.len(), 1);
        assert_eq!(processed.my_prs[0].id(), "PR_1");
        assert_eq!(processed.review_requests.len(), 1);
        assert_eq!(processed.review_requests[0].id(), "PR_2");
    }

    #[test]
    fn review_request_badge_count_excludes_draft_in_adapter() {
        let json = r#"{
            "data": {
                "myPrs": { "edges": [] },
                "reviewRequested": {
                    "edges": [
                        {
                            "node": {
                                "id": "PR_1",
                                "title": "non-draft review",
                                "url": "https://github.com/o/r/pull/1",
                                "number": 1,
                                "isDraft": false,
                                "reviewDecision": null,
                                "author": { "login": "bob" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-02T00:00:00Z",
                                "mergeable": null
                            }
                        },
                        {
                            "node": {
                                "id": "PR_2",
                                "title": "draft review",
                                "url": "https://github.com/o/r/pull/2",
                                "number": 2,
                                "isDraft": true,
                                "reviewDecision": null,
                                "author": { "login": "charlie" },
                                "commits": { "nodes": [] },
                                "repository": { "nameWithOwner": "o/r" },
                                "createdAt": "2026-01-01T00:00:00Z",
                                "updatedAt": "2026-01-03T00:00:00Z",
                                "mergeable": null
                            }
                        }
                    ]
                }
            }
        }"#;

        let parsed = parser::parse_pull_request_nodes(json).expect("should parse");
        let processed =
            usecase::process::process_pull_requests(parsed.my_prs, parsed.review_requests);
        // 一覧には DRAFT 含め 2 件
        assert_eq!(processed.review_requests.len(), 2);
        // バッジカウントは DRAFT 除外で 1 件
        assert_eq!(processed.review_request_badge_count, 1);
    }

    // --- processIssues テスト ---

    #[test]
    fn parse_and_process_issues_with_valid_json() {
        let json = r#"{
            "data": {
                "issues": {
                    "edges": [
                        {
                            "node": {
                                "id": "ISSUE_1",
                                "number": 1,
                                "title": "Oldest",
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
                                "id": "ISSUE_3",
                                "number": 3,
                                "title": "Newest",
                                "url": "https://github.com/o/r/issues/3",
                                "state": "OPEN",
                                "labels": { "nodes": [] },
                                "assignees": { "nodes": [] },
                                "updatedAt": "2026-03-01T00:00:00Z",
                                "parent": null
                            }
                        },
                        {
                            "node": {
                                "id": "ISSUE_2",
                                "number": 2,
                                "title": "Middle",
                                "url": "https://github.com/o/r/issues/2",
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

        let mut issues = issue_parser::parse_issue_nodes(json).expect("should parse");
        usecase::issue_process::sort_issues_by_updated_at_desc(&mut issues);
        let dto = to_issue_list_dto(issues);

        assert_eq!(dto.total_count, 3);
        assert_eq!(dto.items[0].number, 3);
        assert_eq!(dto.items[1].number, 2);
        assert_eq!(dto.items[2].number, 1);
    }

    #[test]
    fn parse_and_process_issues_empty() {
        let json = r#"{
            "data": {
                "issues": {
                    "edges": []
                }
            }
        }"#;

        let mut issues = issue_parser::parse_issue_nodes(json).expect("should parse");
        usecase::issue_process::sort_issues_by_updated_at_desc(&mut issues);
        let dto = to_issue_list_dto(issues);

        assert_eq!(dto.total_count, 0);
        assert!(dto.items.is_empty());
    }

    #[test]
    fn process_issues_invalid_json_returns_error() {
        let result = issue_parser::parse_issue_nodes("not json");
        assert!(result.is_err());
    }
}
