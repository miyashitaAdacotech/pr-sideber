use serde::{Deserialize, Serialize};
use tsify_next::Tsify;

use crate::status::{ApprovalStatus, CiStatus};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct PrItemDto {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub author: String,
    pub url: String,
    pub repository: String,
    pub is_draft: bool,
    pub approval_status: ApprovalStatus,
    pub ci_status: CiStatus,
    pub additions: u32,
    pub deletions: u32,
    /// ISO 8601 形式の文字列。chrono 不使用で WASM バイナリサイズを削減。
    pub created_at: String,
    /// ISO 8601 形式の文字列。chrono 不使用で WASM バイナリサイズを削減。
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct PrListDto {
    pub items: Vec<PrItemDto>,
    /// ページネーション用の全体件数。
    /// 現在のページの `items.len()` とは一致しない場合がある。
    pub total_count: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::status::{ApprovalStatus, CiStatus};

    fn make_pr_item() -> PrItemDto {
        PrItemDto {
            id: "PR_123".to_string(),
            number: 42,
            title: "Add feature X".to_string(),
            author: "octocat".to_string(),
            url: "https://github.com/owner/repo/pull/42".to_string(),
            repository: "owner/repo".to_string(),
            is_draft: false,
            approval_status: ApprovalStatus::Approved,
            ci_status: CiStatus::Passed,
            additions: 100,
            deletions: 20,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-02T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn pr_item_dto_serde_roundtrip() {
        let original = make_pr_item();
        let json = serde_json::to_string(&original).expect("serialize should succeed");
        let restored: PrItemDto = serde_json::from_str(&json).expect("deserialize should succeed");
        assert_eq!(original, restored);
    }

    #[test]
    fn pr_item_dto_serde_camel_case_fields() {
        let item = make_pr_item();
        let json = serde_json::to_string(&item).expect("serialize should succeed");
        assert!(json.contains("\"isDraft\""));
        assert!(json.contains("\"approvalStatus\""));
        assert!(json.contains("\"ciStatus\""));
        assert!(json.contains("\"createdAt\""));
        assert!(json.contains("\"updatedAt\""));
    }

    #[test]
    fn pr_list_dto_empty() {
        let list = PrListDto {
            items: vec![],
            total_count: 0,
        };
        let json = serde_json::to_string(&list).expect("serialize should succeed");
        let restored: PrListDto = serde_json::from_str(&json).expect("deserialize should succeed");
        assert_eq!(list, restored);
        assert_eq!(restored.items.len(), 0);
        assert_eq!(restored.total_count, 0);
    }

    #[test]
    fn pr_list_dto_multiple_items() {
        let mut item1 = make_pr_item();
        item1.number = 1;
        let mut item2 = make_pr_item();
        item2.number = 2;
        let mut item3 = make_pr_item();
        item3.number = 3;

        let list = PrListDto {
            items: vec![item1, item2, item3],
            total_count: 3,
        };
        let json = serde_json::to_string(&list).expect("serialize should succeed");
        let restored: PrListDto = serde_json::from_str(&json).expect("deserialize should succeed");
        assert_eq!(list, restored);
        assert_eq!(restored.items.len(), 3);
        assert_eq!(restored.total_count, 3);
    }

    #[test]
    fn pr_list_dto_serde_camel_case() {
        let list = PrListDto {
            items: vec![],
            total_count: 5,
        };
        let json = serde_json::to_string(&list).expect("serialize should succeed");
        assert!(json.contains("\"totalCount\""));
    }

    #[test]
    fn pr_item_dto_clone() {
        let original = make_pr_item();
        let cloned = original.clone();
        assert_eq!(original, cloned);
    }
}
