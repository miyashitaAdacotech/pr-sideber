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
        /// 正規 URL から抽出したセッション ID (TS 側 `extractSessionIdFromUrl` 相当)。
        /// URL が壊れていて抽出できない場合は `None` となる (Issue #47)。
        /// `#[serde(default)]` で旧キャッシュ JSON (このフィールド無し) を `None` に
        /// フォールバックさせる。TS 側の `sessionId: string | null` と整合させるため、
        /// `skip_serializing_if` は付けず、`None` のとき `"sessionId":null` を必ず出力する。
        #[serde(rename = "sessionId", default)]
        session_id: Option<String>,
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
                session_id: None,
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

    // Phase 3 (Issue #47): Session バリアントに `session_id: Option<String>` を追加する。
    // TS 側の `TreeNodeKind` (session バリアント) と同じスキーマを持たせ、
    // sidepanel UI の Link ボタン表示判定で使う。
    //
    // このテストは Session に `session_id` フィールドが未定義のためコンパイルエラーで
    // RED になる。GREEN フェーズでフィールドを追加した時点で解消する想定。

    /// Session ノードをシリアライズすると `"sessionId"` (camelCase) を含むことを確認する。
    /// Rust 側は `session_id: Option<String>` で、`#[serde(rename = "sessionId")]` を付けて
    /// TS 側の命名と揃える。
    #[test]
    fn session_node_json_has_camel_case_session_id() {
        let node = TreeNode::new(
            TreeNodeKind::Session {
                title: "Inv #42".to_string(),
                url: "https://claude.ai/code/session_abc".to_string(),
                issue_number: 42,
                is_manually_mapped: false,
                session_id: Some("session_abc".to_string()),
            },
            2,
        );
        let json = serde_json::to_string(&node).expect("serialize");
        eprintln!("Session node JSON: {json}");
        assert!(
            json.contains("\"sessionId\""),
            "expected sessionId in JSON, got: {json}"
        );
        assert!(
            json.contains("\"session_abc\""),
            "expected session_abc value in JSON, got: {json}"
        );
    }

    /// LOW-4 (Phase 3b レビュー指摘): `session_id` が `None` のときも
    /// JSON 出力に `"sessionId":null` が含まれることを保証する。
    /// TS 側の `sessionId: string | null` と整合させるため、
    /// `#[serde(skip_serializing_if = "Option::is_none")]` を付けて undefined 扱いに
    /// してしまうと TS 側の型契約と破綻する。明示的に null 出力されることを契約として固定する。
    #[test]
    fn session_node_json_emits_null_when_session_id_is_none() {
        let node = TreeNode::new(
            TreeNodeKind::Session {
                title: "No session id".to_string(),
                url: "https://claude.ai/code/unknown".to_string(),
                issue_number: 1,
                is_manually_mapped: false,
                session_id: None,
            },
            2,
        );
        let json = serde_json::to_string(&node).expect("serialize");
        eprintln!("Session node JSON (None): {json}");
        assert!(
            json.contains("\"sessionId\":null"),
            "expected sessionId:null in JSON, got: {json}"
        );
    }

    /// `sessionId` フィールドを持たない旧キャッシュ JSON を deserialize しても
    /// `#[serde(default)]` で `session_id == None` にフォールバックすることを確認する。
    #[test]
    fn session_node_deserializes_legacy_json_without_session_id() {
        let legacy_json = r#"{
            "kind": {
                "type": "session",
                "title": "legacy session without sessionId",
                "url": "https://claude.ai/code/session_legacy2",
                "issueNumber": 99,
                "isManuallyMapped": false
            },
            "children": [],
            "depth": 2
        }"#;
        let node: TreeNode = serde_json::from_str(legacy_json).expect("deserialize legacy JSON");
        match node.kind {
            TreeNodeKind::Session { session_id, .. } => assert_eq!(session_id, None),
            other => panic!("expected Session variant, got {other:?}"),
        }
    }
}
