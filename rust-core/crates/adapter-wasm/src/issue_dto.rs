use serde::Serialize;
use tsify_next::Tsify;

use domain::issue::{Issue, IssueState, Label};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Tsify)]
#[cfg_attr(test, derive(serde::Deserialize))]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct IssueItemDto {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub url: String,
    pub state: IssueState,
    pub labels: Vec<LabelDto>,
    pub assignees: Vec<String>,
    pub updated_at: String,
    pub parent_number: Option<u32>,
    pub parent_title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Tsify)]
#[cfg_attr(test, derive(serde::Deserialize))]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct LabelDto {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Tsify)]
#[cfg_attr(test, derive(serde::Deserialize))]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct IssueListDto {
    pub items: Vec<IssueItemDto>,
    pub total_count: u32,
}

impl From<Label> for LabelDto {
    fn from(label: Label) -> Self {
        Self {
            name: label.name().to_string(),
            color: label.color().to_string(),
        }
    }
}

impl From<Issue> for IssueItemDto {
    fn from(issue: Issue) -> Self {
        let (
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
        ) = issue.into_parts();
        Self {
            id,
            number,
            title,
            url,
            state,
            labels: labels.into_iter().map(LabelDto::from).collect(),
            assignees,
            updated_at,
            parent_number,
            parent_title,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_issue_item() -> IssueItemDto {
        IssueItemDto {
            id: "ISSUE_1".to_string(),
            number: 42,
            title: "Fix the bug".to_string(),
            url: "https://github.com/o/r/issues/42".to_string(),
            state: IssueState::Open,
            labels: vec![LabelDto {
                name: "bug".to_string(),
                color: "d73a4a".to_string(),
            }],
            assignees: vec!["alice".to_string()],
            updated_at: "2026-03-01T00:00:00Z".to_string(),
            parent_number: Some(100),
            parent_title: Some("Epic: CI/CD".to_string()),
        }
    }

    #[test]
    fn issue_item_dto_serde_roundtrip() {
        let original = make_issue_item();
        let json = serde_json::to_string(&original).expect("serialize should succeed");
        let restored: IssueItemDto =
            serde_json::from_str(&json).expect("deserialize should succeed");
        assert_eq!(original, restored);
    }

    #[test]
    fn issue_item_dto_serde_camel_case_fields() {
        let item = make_issue_item();
        let json = serde_json::to_string(&item).expect("serialize should succeed");
        assert!(json.contains("\"updatedAt\""));
        assert!(json.contains("\"parentNumber\""));
        assert!(json.contains("\"parentTitle\""));
    }

    #[test]
    fn issue_state_serializes_as_screaming_snake_case() {
        let item = make_issue_item();
        let json = serde_json::to_string(&item).expect("serialize should succeed");
        assert!(
            json.contains("\"state\":\"OPEN\""),
            "IssueState::Open should serialize to OPEN, got: {json}"
        );
    }

    #[test]
    fn label_dto_serde_roundtrip() {
        let label = LabelDto {
            name: "enhancement".to_string(),
            color: "a2eeef".to_string(),
        };
        let json = serde_json::to_string(&label).expect("serialize should succeed");
        let restored: LabelDto = serde_json::from_str(&json).expect("deserialize should succeed");
        assert_eq!(label, restored);
    }

    #[test]
    fn from_issue_produces_matching_dto() {
        let issue = Issue::new(
            "ISSUE_99".to_string(),
            99,
            "Add feature Z".to_string(),
            "https://github.com/org/repo/issues/99".to_string(),
            IssueState::Closed,
            vec![
                Label::new("bug".to_string(), "d73a4a".to_string()),
                Label::new("help wanted".to_string(), "008672".to_string()),
            ],
            vec!["alice".to_string(), "bob".to_string()],
            "2026-03-15T18:30:00Z".to_string(),
            Some(50),
            Some("Parent Epic".to_string()),
        )
        .expect("test Issue should be valid");

        let dto = IssueItemDto::from(issue);

        assert_eq!(dto.id, "ISSUE_99");
        assert_eq!(dto.number, 99);
        assert_eq!(dto.title, "Add feature Z");
        assert_eq!(dto.url, "https://github.com/org/repo/issues/99");
        assert_eq!(dto.state, IssueState::Closed);
        assert_eq!(dto.labels.len(), 2);
        assert_eq!(dto.labels[0].name, "bug");
        assert_eq!(dto.labels[0].color, "d73a4a");
        assert_eq!(dto.labels[1].name, "help wanted");
        assert_eq!(dto.labels[1].color, "008672");
        assert_eq!(dto.assignees, vec!["alice", "bob"]);
        assert_eq!(dto.updated_at, "2026-03-15T18:30:00Z");
        assert_eq!(dto.parent_number, Some(50));
        assert_eq!(dto.parent_title, Some("Parent Epic".to_string()));
    }

    #[test]
    fn from_issue_without_parent() {
        let issue = Issue::new(
            "ISSUE_1".to_string(),
            1,
            "Simple task".to_string(),
            "https://github.com/o/r/issues/1".to_string(),
            IssueState::Open,
            vec![],
            vec![],
            "2026-01-01T00:00:00Z".to_string(),
            None,
            None,
        )
        .expect("test Issue should be valid");

        let dto = IssueItemDto::from(issue);

        assert_eq!(dto.parent_number, None);
        assert_eq!(dto.parent_title, None);
        assert!(dto.labels.is_empty());
        assert!(dto.assignees.is_empty());
    }

    #[test]
    fn issue_list_dto_empty() {
        let list = IssueListDto {
            items: vec![],
            total_count: 0,
        };
        let json = serde_json::to_string(&list).expect("serialize should succeed");
        let restored: IssueListDto =
            serde_json::from_str(&json).expect("deserialize should succeed");
        assert_eq!(list, restored);
        assert_eq!(restored.items.len(), 0);
        assert_eq!(restored.total_count, 0);
    }

    #[test]
    fn issue_list_dto_multiple_items() {
        let mut item1 = make_issue_item();
        item1.number = 1;
        let mut item2 = make_issue_item();
        item2.number = 2;

        let list = IssueListDto {
            items: vec![item1, item2],
            total_count: 2,
        };
        let json = serde_json::to_string(&list).expect("serialize should succeed");
        let restored: IssueListDto =
            serde_json::from_str(&json).expect("deserialize should succeed");
        assert_eq!(list, restored);
        assert_eq!(restored.items.len(), 2);
    }

    #[test]
    fn issue_list_dto_serde_camel_case() {
        let list = IssueListDto {
            items: vec![],
            total_count: 5,
        };
        let json = serde_json::to_string(&list).expect("serialize should succeed");
        assert!(json.contains("\"totalCount\""));
    }

    #[test]
    fn issue_item_dto_clone() {
        let original = make_issue_item();
        let cloned = original.clone();
        assert_eq!(original, cloned);
    }
}
