use serde::{Deserialize, Serialize};

use crate::error::DomainError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    id: String,
    number: u32,
    title: String,
    url: String,
    state: IssueState,
    labels: Vec<Label>,
    assignees: Vec<String>,
    /// ISO 8601 形式の文字列 (例: "2026-01-01T00:00:00Z")。
    /// chrono を使わず String にしているのは WASM バイナリサイズ削減のため。
    updated_at: String,
    parent_number: Option<u32>,
    parent_title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IssueState {
    Open,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    name: String,
    color: String,
}

impl Issue {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: String,
        number: u32,
        title: String,
        url: String,
        state: IssueState,
        labels: Vec<Label>,
        assignees: Vec<String>,
        updated_at: String,
        parent_number: Option<u32>,
        parent_title: Option<String>,
    ) -> Result<Self, DomainError> {
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

        Ok(Self {
            id,
            number,
            title,
            url,
            state,
            labels,
            assignees,
            updated_at,
            parent_number,
            parent_title,
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

    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn state(&self) -> &IssueState {
        &self.state
    }

    pub fn labels(&self) -> &[Label] {
        &self.labels
    }

    pub fn assignees(&self) -> &[String] {
        &self.assignees
    }

    pub fn updated_at(&self) -> &str {
        &self.updated_at
    }

    pub fn parent_number(&self) -> Option<u32> {
        self.parent_number
    }

    pub fn parent_title(&self) -> Option<&str> {
        self.parent_title.as_deref()
    }

    /// Issue を分解してフィールドの所有権を返す。
    /// adapter 層で不要なアロケーションを避けるために使用する。
    #[allow(clippy::type_complexity)]
    pub fn into_parts(
        self,
    ) -> (
        String,
        u32,
        String,
        String,
        IssueState,
        Vec<Label>,
        Vec<String>,
        String,
        Option<u32>,
        Option<String>,
    ) {
        (
            self.id,
            self.number,
            self.title,
            self.url,
            self.state,
            self.labels,
            self.assignees,
            self.updated_at,
            self.parent_number,
            self.parent_title,
        )
    }
}

impl Label {
    pub fn new(name: String, color: String) -> Self {
        Self { name, color }
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn color(&self) -> &str {
        &self.color
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ヘルパー: バリデーション付きコンストラクタで有効な Issue を生成。
    fn make_valid_issue() -> Issue {
        Issue::new(
            "ISSUE_1".to_string(),
            42,
            "Fix the bug".to_string(),
            "https://github.com/o/r/issues/42".to_string(),
            IssueState::Open,
            vec![Label::new("bug".to_string(), "d73a4a".to_string())],
            vec!["alice".to_string()],
            "2026-03-01T00:00:00Z".to_string(),
            Some(100),
            Some("Epic: CI/CD".to_string()),
        )
        .expect("make_valid_issue: all fields are valid")
    }

    #[test]
    fn construction_success() {
        let issue = make_valid_issue();
        assert_eq!(issue.number(), 42);
        assert_eq!(issue.title(), "Fix the bug");
        assert_eq!(issue.parent_number(), Some(100));
    }

    #[test]
    fn empty_id_fails() {
        let result = Issue::new(
            "".to_string(),
            1,
            "title".to_string(),
            "url".to_string(),
            IssueState::Open,
            vec![],
            vec![],
            "2026-01-01T00:00:00Z".to_string(),
            None,
            None,
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason }
                if field == "id" && reason == "must not be empty"
        ));
    }

    #[test]
    fn empty_title_fails() {
        let result = Issue::new(
            "ID_1".to_string(),
            1,
            "  ".to_string(),
            "url".to_string(),
            IssueState::Open,
            vec![],
            vec![],
            "2026-01-01T00:00:00Z".to_string(),
            None,
            None,
        );
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason }
                if field == "title" && reason == "must not be empty"
        ));
    }

    #[test]
    fn no_parent_is_none() {
        let issue = Issue::new(
            "ID_1".to_string(),
            1,
            "title".to_string(),
            "url".to_string(),
            IssueState::Open,
            vec![],
            vec![],
            "2026-01-01T00:00:00Z".to_string(),
            None,
            None,
        )
        .expect("valid");
        assert_eq!(issue.parent_number(), None);
        assert_eq!(issue.parent_title(), None);
    }

    #[test]
    fn into_parts_roundtrip() {
        let issue = make_valid_issue();
        let (id, number, title, ..) = issue.into_parts();
        assert_eq!(id, "ISSUE_1");
        assert_eq!(number, 42);
        assert_eq!(title, "Fix the bug");
    }

    #[test]
    fn getters_return_correct_values() {
        let issue = make_valid_issue();
        assert_eq!(issue.id(), "ISSUE_1");
        assert_eq!(issue.number(), 42);
        assert_eq!(issue.title(), "Fix the bug");
        assert_eq!(issue.url(), "https://github.com/o/r/issues/42");
        assert_eq!(issue.state(), &IssueState::Open);
        assert_eq!(issue.labels().len(), 1);
        assert_eq!(issue.labels()[0].name(), "bug");
        assert_eq!(issue.labels()[0].color(), "d73a4a");
        assert_eq!(issue.assignees(), &["alice".to_string()]);
        assert_eq!(issue.updated_at(), "2026-03-01T00:00:00Z");
        assert_eq!(issue.parent_number(), Some(100));
        assert_eq!(issue.parent_title(), Some("Epic: CI/CD"));
    }

    #[test]
    fn serde_camel_case_fields() {
        let issue = make_valid_issue();
        let json = serde_json::to_string(&issue).expect("serialize should succeed");
        assert!(json.contains("\"updatedAt\""));
        assert!(json.contains("\"parentNumber\""));
        assert!(json.contains("\"parentTitle\""));
    }

    #[test]
    fn serde_issue_state_screaming_snake_case() {
        let issue = make_valid_issue();
        let json = serde_json::to_string(&issue).expect("serialize should succeed");
        assert!(
            json.contains("\"state\":\"OPEN\""),
            "IssueState::Open should serialize to OPEN, got: {json}"
        );

        let closed_issue = Issue::new(
            "ID_2".to_string(),
            2,
            "Done".to_string(),
            "url".to_string(),
            IssueState::Closed,
            vec![],
            vec![],
            "2026-01-01T00:00:00Z".to_string(),
            None,
            None,
        )
        .expect("valid");
        let json = serde_json::to_string(&closed_issue).expect("serialize should succeed");
        assert!(
            json.contains("\"state\":\"CLOSED\""),
            "IssueState::Closed should serialize to CLOSED, got: {json}"
        );
    }

    #[test]
    fn whitespace_only_id_fails() {
        let result = Issue::new(
            "   ".to_string(),
            1,
            "title".to_string(),
            "url".to_string(),
            IssueState::Open,
            vec![],
            vec![],
            "2026-01-01T00:00:00Z".to_string(),
            None,
            None,
        );
        assert!(matches!(
            result.unwrap_err(),
            DomainError::InvalidField { field, reason }
                if field == "id" && reason == "must not be empty"
        ));
    }

    #[test]
    fn clone_equality() {
        let original = make_valid_issue();
        let cloned = original.clone();
        assert_eq!(original, cloned);
    }
}
