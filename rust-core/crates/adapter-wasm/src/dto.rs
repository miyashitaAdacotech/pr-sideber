use serde::Serialize;
use tsify_next::Tsify;

use domain::entity::PullRequest;
use domain::status::{ApprovalStatus, CiStatus};
use usecase::determine::determine_pr_size;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Tsify)]
#[cfg_attr(test, derive(serde::Deserialize))]
#[tsify(into_wasm_abi)]
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
    /// PR の変更規模ラベル ("XS", "S", "M", "L", "XL")。
    pub size_label: String,
}

impl From<PullRequest> for PrItemDto {
    fn from(pr: PullRequest) -> Self {
        let (
            id,
            number,
            title,
            author,
            url,
            repository,
            is_draft,
            approval_status,
            ci_status,
            additions,
            deletions,
            created_at,
            updated_at,
        ) = pr.into_parts();
        Self {
            id,
            number,
            title,
            author,
            url,
            repository,
            is_draft,
            approval_status,
            ci_status,
            additions,
            deletions,
            created_at,
            updated_at,
            size_label: determine_pr_size(additions, deletions)
                .as_label()
                .to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Tsify)]
#[cfg_attr(test, derive(serde::Deserialize))]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct PrListDto {
    pub items: Vec<PrItemDto>,
    /// ページネーション用の全体件数。
    /// 現在のページの `items.len()` とは一致しない場合がある。
    pub total_count: u32,
}

#[cfg(test)]
mod tests {
    use crate::dto::{PrItemDto, PrListDto};
    use domain::status::{ApprovalStatus, CiStatus};

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
            size_label: "M".to_string(),
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
        assert!(json.contains("\"sizeLabel\""));
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

    #[test]
    fn from_pull_request_produces_matching_dto() {
        use domain::entity::PullRequest;

        let pr = PullRequest::new(
            "PR_456".to_string(),
            99,
            "Implement feature Y".to_string(),
            "monalisa".to_string(),
            "https://github.com/org/repo/pull/99".to_string(),
            "org/repo".to_string(),
            true,
            ApprovalStatus::ChangesRequested,
            CiStatus::Failed,
            250,
            80,
            "2026-03-01T12:00:00Z".to_string(),
            "2026-03-15T18:30:00Z".to_string(),
        )
        .expect("test PR should be valid");

        let dto = PrItemDto::from(pr);

        assert_eq!(dto.id, "PR_456");
        assert_eq!(dto.number, 99);
        assert_eq!(dto.title, "Implement feature Y");
        assert_eq!(dto.author, "monalisa");
        assert_eq!(dto.url, "https://github.com/org/repo/pull/99");
        assert_eq!(dto.repository, "org/repo");
        assert!(dto.is_draft);
        assert_eq!(dto.approval_status, ApprovalStatus::ChangesRequested);
        assert_eq!(dto.ci_status, CiStatus::Failed);
        assert_eq!(dto.additions, 250);
        assert_eq!(dto.deletions, 80);
        assert_eq!(dto.created_at, "2026-03-01T12:00:00Z");
        assert_eq!(dto.updated_at, "2026-03-15T18:30:00Z");
        // additions=250 + deletions=80 = 330 → L (201..=500)
        assert_eq!(dto.size_label, "L");
    }

    #[test]
    fn from_pull_request_with_all_status_variants() {
        use domain::entity::PullRequest;

        // ApprovalStatus: Approved, ChangesRequested, ReviewRequired, Pending
        // CiStatus: Passed, Failed, Running, Pending, None
        // 5 combinations covering every variant at least once
        let cases: Vec<(ApprovalStatus, CiStatus)> = vec![
            (ApprovalStatus::Approved, CiStatus::Passed),
            (ApprovalStatus::ChangesRequested, CiStatus::Failed),
            (ApprovalStatus::ReviewRequired, CiStatus::Running),
            (ApprovalStatus::Pending, CiStatus::Pending),
            (ApprovalStatus::Approved, CiStatus::None),
        ];

        for (i, (approval, ci)) in cases.into_iter().enumerate() {
            let n = (i + 1) as u32;
            let pr = PullRequest::new(
                format!("PR_{n}"),
                n,
                format!("PR number {n}"),
                "author".to_string(),
                format!("https://github.com/org/repo/pull/{n}"),
                "org/repo".to_string(),
                false,
                approval,
                ci,
                10,
                5,
                "2026-03-20T00:00:00Z".to_string(),
                "2026-03-21T10:00:00Z".to_string(),
            )
            .expect("test PR should be valid");

            let dto = PrItemDto::from(pr);

            assert_eq!(
                dto.approval_status, approval,
                "approval mismatch at index {i}"
            );
            assert_eq!(dto.ci_status, ci, "ci mismatch at index {i}");
            assert_eq!(dto.number, n, "number mismatch at index {i}");
        }
    }

    #[test]
    fn pr_list_dto_total_count_independent_of_items_len() {
        let item = make_pr_item();
        let list = PrListDto {
            items: vec![item],
            total_count: 42,
        };

        let json = serde_json::to_string(&list).expect("serialize should succeed");
        let restored: PrListDto = serde_json::from_str(&json).expect("deserialize should succeed");

        assert_eq!(restored.items.len(), 1);
        assert_eq!(restored.total_count, 42);
    }
}
