use serde::Serialize;

use crate::status::{ApprovalStatus, CiStatus};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    id: String,
    number: u32,
    title: String,
    author: String,
    url: String,
    repository: String,
    is_draft: bool,
    approval_status: ApprovalStatus,
    ci_status: CiStatus,
    additions: u32,
    deletions: u32,
    /// ISO 8601 形式の文字列 (例: "2026-01-01T00:00:00Z")。
    /// chrono を使わず String にしているのは WASM バイナリサイズ削減のため。
    /// ISO 8601 は辞書順ソートで時系列順が保証される。
    created_at: String,
    /// ISO 8601 形式の文字列 (例: "2026-01-02T00:00:00Z")。
    /// `created_at` と同じ理由で String を採用。
    updated_at: String,
}

impl PullRequest {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: String,
        number: u32,
        title: String,
        author: String,
        url: String,
        repository: String,
        is_draft: bool,
        approval_status: ApprovalStatus,
        ci_status: CiStatus,
        additions: u32,
        deletions: u32,
        created_at: String,
        updated_at: String,
    ) -> Result<Self, crate::error::DomainError> {
        use crate::error::DomainError;

        // NOTE: trim() はバリデーション判定のみに使用。格納値は trim しない（入力値をそのまま保持する設計）。
        if id.trim().is_empty() {
            return Err(DomainError::InvalidField {
                field: "id".to_string(),
                reason: "must not be empty".to_string(),
            });
        }
        if title.trim().is_empty() {
            return Err(DomainError::InvalidField {
                field: "title".to_string(),
                reason: "must not be empty".to_string(),
            });
        }
        if author.trim().is_empty() {
            return Err(DomainError::InvalidField {
                field: "author".to_string(),
                reason: "must not be empty".to_string(),
            });
        }
        if url.trim().is_empty() {
            return Err(DomainError::InvalidField {
                field: "url".to_string(),
                reason: "must not be empty".to_string(),
            });
        }
        if !url.starts_with("https://") {
            return Err(DomainError::InvalidField {
                field: "url".to_string(),
                reason: "must start with https://".to_string(),
            });
        }
        if repository.trim().is_empty() {
            return Err(DomainError::InvalidField {
                field: "repository".to_string(),
                reason: "must not be empty".to_string(),
            });
        }
        if created_at.trim().is_empty() {
            return Err(DomainError::InvalidField {
                field: "created_at".to_string(),
                reason: "must not be empty".to_string(),
            });
        }
        if updated_at.trim().is_empty() {
            return Err(DomainError::InvalidField {
                field: "updated_at".to_string(),
                reason: "must not be empty".to_string(),
            });
        }
        if number == 0 {
            return Err(DomainError::InvalidField {
                field: "number".to_string(),
                reason: "must be positive".to_string(),
            });
        }

        Ok(Self {
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
        })
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn number(&self) -> u32 {
        self.number
    }

    pub fn title(&self) -> &str {
        &self.title
    }

    pub fn author(&self) -> &str {
        &self.author
    }

    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn repository(&self) -> &str {
        &self.repository
    }

    pub fn is_draft(&self) -> bool {
        self.is_draft
    }

    pub fn approval_status(&self) -> ApprovalStatus {
        self.approval_status
    }

    pub fn ci_status(&self) -> CiStatus {
        self.ci_status
    }

    pub fn additions(&self) -> u32 {
        self.additions
    }

    pub fn deletions(&self) -> u32 {
        self.deletions
    }

    pub fn created_at(&self) -> &str {
        &self.created_at
    }

    pub fn updated_at(&self) -> &str {
        &self.updated_at
    }

    /// PullRequest を分解してフィールドの所有権を返す。
    /// adapter 層で不要なアロケーションを避けるために使用する。
    #[allow(clippy::type_complexity)]
    pub fn into_parts(
        self,
    ) -> (
        String,
        u32,
        String,
        String,
        String,
        String,
        bool,
        ApprovalStatus,
        CiStatus,
        u32,
        u32,
        String,
        String,
    ) {
        (
            self.id,
            self.number,
            self.title,
            self.author,
            self.url,
            self.repository,
            self.is_draft,
            self.approval_status,
            self.ci_status,
            self.additions,
            self.deletions,
            self.created_at,
            self.updated_at,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::DomainError;
    use crate::status::{ApprovalStatus, CiStatus};

    /// ヘルパー: バリデーション付きコンストラクタで有効な PR を生成。
    /// テスト内で `.expect()` を個別に呼ばなくて済むよう、ここで unwrap する。
    fn make_valid_pr() -> PullRequest {
        PullRequest::new(
            "PR_123".to_string(),
            42,
            "Add feature X".to_string(),
            "octocat".to_string(),
            "https://github.com/owner/repo/pull/42".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Approved,
            CiStatus::Passed,
            100,
            20,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        )
        .expect("make_valid_pr: all fields are valid")
    }

    #[test]
    fn pull_request_construction() {
        let pr = make_valid_pr();
        assert_eq!(pr.number(), 42);
        assert_eq!(pr.title(), "Add feature X");
        assert_eq!(pr.author(), "octocat");
        assert!(!pr.is_draft());
        assert_eq!(pr.approval_status(), ApprovalStatus::Approved);
        assert_eq!(pr.ci_status(), CiStatus::Passed);
    }

    #[test]
    fn pull_request_serde_roundtrip() {
        let pr = make_valid_pr();
        let json = serde_json::to_string(&pr).expect("serialize should succeed");
        assert!(json.contains("\"id\":\"PR_123\""));
        assert!(json.contains("\"number\":42"));
        assert!(json.contains("\"title\":\"Add feature X\""));
        assert!(json.contains("\"author\":\"octocat\""));
        assert!(json.contains("\"isDraft\":false"));
        assert!(json.contains("\"additions\":100"));
        assert!(json.contains("\"deletions\":20"));
    }

    #[test]
    fn pull_request_serde_camel_case_fields() {
        let pr = make_valid_pr();
        let json = serde_json::to_string(&pr).expect("serialize should succeed");
        // camelCase field names
        assert!(json.contains("\"isDraft\""));
        assert!(json.contains("\"approvalStatus\""));
        assert!(json.contains("\"ciStatus\""));
        assert!(json.contains("\"createdAt\""));
        assert!(json.contains("\"updatedAt\""));
    }

    #[test]
    fn pull_request_clone() {
        let original = make_valid_pr();
        let cloned = original.clone();
        assert_eq!(original, cloned);
    }

    // --- Validation tests ---

    #[test]
    fn new_with_valid_fields_succeeds() {
        let result = PullRequest::new(
            "PR_123".to_string(),
            42,
            "Add feature X".to_string(),
            "octocat".to_string(),
            "https://github.com/owner/repo/pull/42".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Approved,
            CiStatus::Passed,
            100,
            20,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn new_with_empty_id_fails() {
        let result = PullRequest::new(
            "".to_string(),
            42,
            "title".to_string(),
            "author".to_string(),
            "https://example.com".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Approved,
            CiStatus::Passed,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "id" && reason == "must not be empty"
        ));
    }

    #[test]
    fn new_with_empty_title_fails() {
        let result = PullRequest::new(
            "PR_1".to_string(),
            1,
            "".to_string(),
            "author".to_string(),
            "https://example.com".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "title" && reason == "must not be empty"
        ));
    }

    #[test]
    fn new_with_empty_author_fails() {
        let result = PullRequest::new(
            "PR_1".to_string(),
            1,
            "title".to_string(),
            "".to_string(),
            "https://example.com".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "author" && reason == "must not be empty"
        ));
    }

    #[test]
    fn new_with_empty_url_fails() {
        let result = PullRequest::new(
            "PR_1".to_string(),
            1,
            "title".to_string(),
            "author".to_string(),
            "".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "url" && reason == "must not be empty"
        ));
    }

    #[test]
    fn new_with_empty_repository_fails() {
        let result = PullRequest::new(
            "PR_1".to_string(),
            1,
            "title".to_string(),
            "author".to_string(),
            "https://example.com".to_string(),
            "".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "repository" && reason == "must not be empty"
        ));
    }

    #[test]
    fn new_with_empty_created_at_fails() {
        let result = PullRequest::new(
            "PR_1".to_string(),
            1,
            "title".to_string(),
            "author".to_string(),
            "https://example.com".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "created_at" && reason == "must not be empty"
        ));
    }

    #[test]
    fn new_with_empty_updated_at_fails() {
        let result = PullRequest::new(
            "PR_1".to_string(),
            1,
            "title".to_string(),
            "author".to_string(),
            "https://example.com".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "".to_string(),
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "updated_at" && reason == "must not be empty"
        ));
    }

    #[test]
    fn new_with_zero_number_fails() {
        let result = PullRequest::new(
            "PR_1".to_string(),
            0,
            "title".to_string(),
            "author".to_string(),
            "https://example.com".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "number" && reason == "must be positive"
        ));
    }

    #[test]
    fn new_with_whitespace_only_title_fails() {
        let result = PullRequest::new(
            "PR_1".to_string(),
            1,
            "   ".to_string(),
            "author".to_string(),
            "https://example.com".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "title" && reason == "must not be empty"
        ));
    }

    #[test]
    fn new_with_whitespace_only_id_fails() {
        let result = PullRequest::new(
            "   ".to_string(),
            1,
            "title".to_string(),
            "author".to_string(),
            "https://example.com".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "id" && reason == "must not be empty"
        ));
    }

    #[test]
    fn new_with_non_https_url_fails() {
        let result = PullRequest::new(
            "PR_1".to_string(),
            1,
            "title".to_string(),
            "author".to_string(),
            "javascript:alert(1)".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason } if field == "url" && reason == "must start with https://"
        ));
    }

    #[test]
    fn new_with_zero_additions_and_deletions_succeeds() {
        let result = PullRequest::new(
            "PR_1".to_string(),
            1,
            "title".to_string(),
            "author".to_string(),
            "https://example.com".to_string(),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Pending,
            CiStatus::None,
            0,
            0,
            "2026-01-01T00:00:00Z".to_string(),
            "2026-01-02T00:00:00Z".to_string(),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn getters_return_correct_values() {
        let pr = make_valid_pr();
        assert_eq!(pr.id(), "PR_123");
        assert_eq!(pr.number(), 42);
        assert_eq!(pr.title(), "Add feature X");
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
}
