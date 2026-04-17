use serde::{Deserialize, Serialize};

/// ツリーのインデント上限。4階層目以降はこの深さで表示する。
pub const MAX_INDENT_DEPTH: u32 = 3;

/// ツリーノードの種別。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum TreeNodeKind {
    Epic {
        number: u32,
        title: String,
    },
    Issue {
        number: u32,
        title: String,
        url: String,
        state: String,
        labels: Vec<TreeLabel>,
    },
    PullRequest {
        number: u32,
        title: String,
        url: String,
        #[serde(rename = "prData")]
        pr_data: TreePrData,
    },
    Session {
        title: String,
        url: String,
        #[serde(rename = "issueNumber")]
        issue_number: u32,
        /// `true` のとき、ユーザーが手動で `SessionIssueMapping` 経由で配置した
        /// セッションであることを示す (Epic #43)。TS 側の TreeNodeDto とスキーマを一致させる。
        /// `#[serde(default)]` により、このフィールドを含まない旧キャッシュ JSON を
        /// 読んだ場合は `false` にフォールバックして後方互換を保つ。
        #[serde(rename = "isManuallyMapped", default)]
        is_manually_mapped: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreePrData {
    pub additions: u32,
    pub deletions: u32,
    pub ci_status: String,
    pub approval_status: String,
    pub mergeable_status: String,
    pub is_draft: bool,
    pub size_label: String,
    pub unresolved_comment_count: u32,
}

/// ツリーの1ノード。子ノードを再帰的に持つ。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub kind: TreeNodeKind,
    pub children: Vec<TreeNode>,
    /// 実際のネスト深さ。表示時のインデントは min(depth, MAX_INDENT_DEPTH) で計算。
    pub depth: u32,
}

impl TreeNode {
    pub fn new(kind: TreeNodeKind, depth: u32) -> Self {
        Self {
            kind,
            children: vec![],
            depth,
        }
    }

    /// 表示用インデント深さ。MAX_INDENT_DEPTH でキャップされる。
    pub fn display_depth(&self) -> u32 {
        self.depth.min(MAX_INDENT_DEPTH)
    }

    pub fn add_child(&mut self, child: TreeNode) {
        self.children.push(child);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_depth_within_limit() {
        let node = TreeNode {
            kind: TreeNodeKind::Epic {
                number: 1,
                title: "Epic".to_string(),
            },
            children: vec![],
            depth: 2,
        };
        assert_eq!(node.display_depth(), 2);
    }

    #[test]
    fn display_depth_capped_at_max() {
        let node = TreeNode {
            kind: TreeNodeKind::Issue {
                number: 1,
                title: "Deep".to_string(),
                url: "url".to_string(),
                state: "OPEN".to_string(),
                labels: vec![],
            },
            children: vec![],
            depth: 5,
        };
        assert_eq!(node.display_depth(), MAX_INDENT_DEPTH);
    }

    #[test]
    fn display_depth_at_exact_limit() {
        let node = TreeNode {
            kind: TreeNodeKind::Epic {
                number: 1,
                title: "Epic".to_string(),
            },
            children: vec![],
            depth: MAX_INDENT_DEPTH,
        };
        assert_eq!(node.display_depth(), MAX_INDENT_DEPTH);
    }

    #[test]
    fn add_children() {
        let mut parent = TreeNode::new(
            TreeNodeKind::Epic {
                number: 1,
                title: "Epic".to_string(),
            },
            0,
        );
        let child = TreeNode::new(
            TreeNodeKind::Issue {
                number: 2,
                title: "Issue".to_string(),
                url: "url".to_string(),
                state: "OPEN".to_string(),
                labels: vec![],
            },
            1,
        );
        parent.add_child(child);
        assert_eq!(parent.children.len(), 1);
    }

    #[test]
    fn serde_roundtrip() {
        let mut node = TreeNode::new(
            TreeNodeKind::Epic {
                number: 1,
                title: "Test Epic".to_string(),
            },
            0,
        );
        node.add_child(TreeNode::new(
            TreeNodeKind::Issue {
                number: 2,
                title: "Child Issue".to_string(),
                url: "https://github.com/o/r/issues/2".to_string(),
                state: "OPEN".to_string(),
                labels: vec![TreeLabel {
                    name: "bug".to_string(),
                    color: "d73a4a".to_string(),
                }],
            },
            1,
        ));
        let json = serde_json::to_string(&node).expect("serialize");
        let restored: TreeNode = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(node, restored);
    }

    #[test]
    fn pr_node_json_has_camel_case_pr_data() {
        let node = TreeNode::new(
            TreeNodeKind::PullRequest {
                number: 42,
                title: "Test PR".to_string(),
                url: "https://github.com/o/r/pull/42".to_string(),
                pr_data: TreePrData {
                    additions: 10,
                    deletions: 5,
                    ci_status: "Passed".to_string(),
                    approval_status: "Approved".to_string(),
                    mergeable_status: "Unknown".to_string(),
                    is_draft: false,
                    size_label: "XS".to_string(),
                    unresolved_comment_count: 0,
                },
            },
            1,
        );
        let json = serde_json::to_string(&node).expect("serialize");
        // Print for debugging
        eprintln!("PR node JSON: {json}");
        // Verify camelCase field names
        assert!(
            json.contains("\"prData\""),
            "expected prData in JSON, got: {json}"
        );
        assert!(
            json.contains("\"isDraft\""),
            "expected isDraft in JSON, got: {json}"
        );
        assert!(
            json.contains("\"ciStatus\""),
            "expected ciStatus in JSON, got: {json}"
        );
        assert!(
            json.contains("\"type\":\"pullRequest\""),
            "expected type:pullRequest in JSON, got: {json}"
        );
    }

    #[test]
    fn session_node_json_has_camel_case_issue_number() {
        let node = TreeNode::new(
            TreeNodeKind::Session {
                title: "Inv #1882".to_string(),
                url: "https://claude.ai/code/session_123".to_string(),
                issue_number: 1882,
                is_manually_mapped: false,
            },
            2,
        );
        let json = serde_json::to_string(&node).expect("serialize");
        eprintln!("Session node JSON: {json}");
        assert!(
            json.contains("\"issueNumber\""),
            "expected issueNumber in JSON, got: {json}"
        );
    }

    /// `isManuallyMapped` を含まない旧スキーマ JSON をデシリアライズしても、
    /// `#[serde(default)]` により `false` フォールバックして後方互換を保つことを確認する。
    #[test]
    fn session_node_deserializes_legacy_json_without_is_manually_mapped() {
        let legacy_json = r#"{
            "kind": {
                "type": "session",
                "title": "legacy",
                "url": "https://claude.ai/code/session_legacy",
                "issueNumber": 42
            },
            "children": [],
            "depth": 2
        }"#;
        let node: TreeNode = serde_json::from_str(legacy_json).expect("deserialize legacy JSON");
        match node.kind {
            TreeNodeKind::Session {
                is_manually_mapped, ..
            } => assert!(!is_manually_mapped),
            other => panic!("expected Session variant, got {other:?}"),
        }
    }
}
