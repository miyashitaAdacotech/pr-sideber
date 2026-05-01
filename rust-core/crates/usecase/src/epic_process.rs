use std::collections::{HashMap, HashSet};

use domain::entity::PullRequest;
use domain::epic::{TreeLabel, TreeNode, TreeNodeKind, TreePrData};
use domain::issue::Issue;

use crate::determine::determine_pr_size;

/// Epic ツリーを構築する。
///
/// 返り値は Epic ノードのリスト。Epic に属さない項目は number=0 の「Epic なし」ノードに格納。
///
/// `pr_issue_links` が指定されると、「Epic なし」グループ配下の PR を、
/// リンクされた Issue ノードの子に移動する。空の HashMap を渡せば移動は発生しない。
pub fn build_epic_tree(
    issues: Vec<Issue>,
    prs: Vec<PullRequest>,
    pr_issue_links: HashMap<u32, Vec<u32>>,
) -> Vec<TreeNode> {
    let mut tree = build_epic_tree_internal(issues, prs);
    if !pr_issue_links.is_empty() {
        move_prs_to_linked_issues(&mut tree, &pr_issue_links);
    }
    tree
}

/// 既存の build_epic_tree 本体ロジック (PR-Issue リンクは扱わない)。
fn build_epic_tree_internal(issues: Vec<Issue>, prs: Vec<PullRequest>) -> Vec<TreeNode> {
    let mut epic_map: HashMap<u32, (String, Vec<Issue>)> = HashMap::new();
    let mut no_epic_issues: Vec<Issue> = Vec::new();

    for issue in issues {
        match (issue.parent_number(), issue.parent_title()) {
            (Some(parent_num), Some(parent_title)) => {
                epic_map
                    .entry(parent_num)
                    .or_insert_with(|| (parent_title.to_string(), Vec::new()))
                    .1
                    .push(issue);
            }
            _ => no_epic_issues.push(issue),
        }
    }

    let mut result: Vec<TreeNode> = Vec::new();

    // Epic ごとにツリーノードを構築（番号昇順で安定した表示順を保証）
    let mut epic_entries: Vec<(u32, String, Vec<Issue>)> = epic_map
        .into_iter()
        .map(|(num, (title, issues))| (num, title, issues))
        .collect();
    epic_entries.sort_by_key(|(num, _, _)| *num);

    for (epic_number, epic_title, mut epic_issues) in epic_entries {
        let mut epic_node = TreeNode::new(
            TreeNodeKind::Epic {
                number: epic_number,
                title: epic_title,
            },
            0,
        );

        epic_issues.sort_by(|a, b| b.updated_at().cmp(a.updated_at()));

        for issue in epic_issues {
            let issue_labels: Vec<TreeLabel> = issue
                .labels()
                .iter()
                .map(|l| TreeLabel {
                    name: l.name().to_string(),
                    color: l.color().to_string(),
                })
                .collect();

            let state_str = match issue.state() {
                domain::issue::IssueState::Open => "OPEN",
                domain::issue::IssueState::Closed => "CLOSED",
            };

            let issue_node = TreeNode::new(
                TreeNodeKind::Issue {
                    number: issue.number(),
                    title: issue.title().to_string(),
                    url: issue.url().to_string(),
                    state: state_str.to_string(),
                    labels: issue_labels,
                },
                1,
            );
            epic_node.add_child(issue_node);
        }

        result.push(epic_node);
    }

    // Epic なしグループ
    if !no_epic_issues.is_empty() || !prs.is_empty() {
        let mut no_epic_node = TreeNode::new(
            TreeNodeKind::Epic {
                number: 0,
                title: "Epic なし".to_string(),
            },
            0,
        );

        no_epic_issues.sort_by(|a, b| b.updated_at().cmp(a.updated_at()));

        for issue in no_epic_issues {
            let issue_labels: Vec<TreeLabel> = issue
                .labels()
                .iter()
                .map(|l| TreeLabel {
                    name: l.name().to_string(),
                    color: l.color().to_string(),
                })
                .collect();
            let state_str = match issue.state() {
                domain::issue::IssueState::Open => "OPEN",
                domain::issue::IssueState::Closed => "CLOSED",
            };
            let issue_node = TreeNode::new(
                TreeNodeKind::Issue {
                    number: issue.number(),
                    title: issue.title().to_string(),
                    url: issue.url().to_string(),
                    state: state_str.to_string(),
                    labels: issue_labels,
                },
                1,
            );
            no_epic_node.add_child(issue_node);
        }

        // PR を「Epic なし」に追加（Phase 2 では PR-Issue リンクは未実装のため全 PR をここに格納）
        for pr in prs {
            let (
                _id,
                number,
                title,
                _author,
                url,
                _repo,
                is_draft,
                approval,
                ci,
                mergeable,
                additions,
                deletions,
                _created,
                _updated,
                unresolved,
            ) = pr.into_parts();
            let pr_node = TreeNode::new(
                TreeNodeKind::PullRequest {
                    number,
                    title,
                    url,
                    pr_data: TreePrData {
                        additions,
                        deletions,
                        ci_status: format!("{ci:?}"),
                        approval_status: format!("{approval:?}"),
                        mergeable_status: format!("{mergeable:?}"),
                        is_draft,
                        size_label: determine_pr_size(additions, deletions)
                            .as_label()
                            .to_string(),
                        unresolved_comment_count: unresolved,
                    },
                },
                1,
            );
            no_epic_node.add_child(pr_node);
        }

        result.push(no_epic_node);
    }

    result
}

/// 「Epic なし」グループ配下の PR を、`pr_issue_links` に従ってリンク先 Issue ノードの子に移動する。
///
/// - 1 PR が複数 Issue にリンクしている場合、各 Issue の子に複製される
/// - リンク先 Issue がツリー内に存在しない場合は PR は元の位置に残る
/// - 移動した結果「Epic なし」グループが空になったら除去する
fn move_prs_to_linked_issues(tree: &mut Vec<TreeNode>, pr_issue_links: &HashMap<u32, Vec<u32>>) {
    // Issue 番号 → リンクされた PR 番号一覧の逆引きマップを構築
    let mut issue_to_prs: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pr_num, issue_nums) in pr_issue_links {
        for issue_num in issue_nums {
            issue_to_prs.entry(*issue_num).or_default().push(*pr_num);
        }
    }

    // "Epic なし" グループ (number=0) から PR ノードを収集する
    let mut pr_nodes: HashMap<u32, TreeNode> = HashMap::new();
    for root in tree.iter() {
        if matches!(root.kind, TreeNodeKind::Epic { number: 0, .. }) {
            for child in &root.children {
                if let TreeNodeKind::PullRequest { number, .. } = child.kind {
                    pr_nodes.insert(number, child.clone());
                }
            }
        }
    }

    // 各 Issue ノードに対し、リンクされた PR を子として追加 (移動済み番号を記録)
    let mut moved_pr_numbers: HashSet<u32> = HashSet::new();
    for root in tree.iter_mut() {
        add_prs_to_issue_recursive(root, &issue_to_prs, &pr_nodes, &mut moved_pr_numbers);
    }

    // 移動済み PR を "Epic なし" から除去
    for root in tree.iter_mut() {
        if matches!(root.kind, TreeNodeKind::Epic { number: 0, .. }) {
            root.children.retain(|child| {
                if let TreeNodeKind::PullRequest { number, .. } = child.kind {
                    !moved_pr_numbers.contains(&number)
                } else {
                    true
                }
            });
        }
    }

    // "Epic なし" が空になったら除去
    tree.retain(|root| {
        if matches!(root.kind, TreeNodeKind::Epic { number: 0, .. }) {
            !root.children.is_empty()
        } else {
            true
        }
    });
}

/// Issue ノードを再帰的に走査し、リンクされた PR を子として追加する。
fn add_prs_to_issue_recursive(
    node: &mut TreeNode,
    issue_to_prs: &HashMap<u32, Vec<u32>>,
    pr_nodes: &HashMap<u32, TreeNode>,
    moved_pr_numbers: &mut HashSet<u32>,
) {
    if let TreeNodeKind::Issue { number, .. } = node.kind {
        if let Some(linked_pr_numbers) = issue_to_prs.get(&number) {
            for &pr_num in linked_pr_numbers {
                if let Some(pr_node) = pr_nodes.get(&pr_num) {
                    let mut cloned = pr_node.clone();
                    cloned.depth = node.depth + 1;
                    node.children.push(cloned);
                    moved_pr_numbers.insert(pr_num);
                }
            }
        }
    }
    // 既存の children と新規追加した PR ノードを再帰的に走査する。
    // PR ノードは Issue ではないため再帰しても追加処理は走らず安全。
    for child in node.children.iter_mut() {
        add_prs_to_issue_recursive(child, issue_to_prs, pr_nodes, moved_pr_numbers);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::entity::PullRequest;
    use domain::epic::TreeNodeKind;
    use domain::issue::{Issue, IssueState};
    use domain::status::{ApprovalStatus, CiStatus, MergeableStatus};

    fn make_issue(number: u32, parent_number: Option<u32>, parent_title: Option<&str>) -> Issue {
        Issue::new(
            format!("I_{number}"),
            number,
            format!("Issue {number}"),
            format!("https://github.com/o/r/issues/{number}"),
            IssueState::Open,
            vec![],
            vec!["alice".to_string()],
            format!("2026-03-{:02}T00:00:00Z", number.min(28)),
            parent_number,
            parent_title.map(|s| s.to_string()),
        )
        .expect("valid")
    }

    fn make_pr(number: u32) -> PullRequest {
        PullRequest::new(
            format!("PR_{number}"),
            number,
            format!("PR {number}"),
            "author".to_string(),
            format!("https://github.com/o/r/pull/{number}"),
            "o/r".to_string(),
            false,
            ApprovalStatus::Approved,
            CiStatus::Passed,
            MergeableStatus::Unknown,
            10,
            5,
            "2026-03-01T00:00:00Z".to_string(),
            "2026-03-02T00:00:00Z".to_string(),
            0,
        )
        .expect("valid")
    }

    #[test]
    fn groups_by_epic() {
        let issues = vec![
            make_issue(1, Some(100), Some("Epic A")),
            make_issue(2, Some(100), Some("Epic A")),
            make_issue(3, Some(200), Some("Epic B")),
        ];
        let tree = build_epic_tree(issues, vec![], HashMap::new());
        assert_eq!(tree.len(), 2);
        assert_eq!(tree[0].children.len(), 2); // Epic 100
        assert_eq!(tree[1].children.len(), 1); // Epic 200
    }

    #[test]
    fn no_epic_group() {
        let issues = vec![make_issue(1, None, None)];
        let prs = vec![make_pr(10)];
        let tree = build_epic_tree(issues, prs, HashMap::new());
        assert_eq!(tree.len(), 1); // "Epic なし"
        assert_eq!(tree[0].children.len(), 2);
    }

    #[test]
    fn empty_input() {
        let tree = build_epic_tree(vec![], vec![], HashMap::new());
        assert!(tree.is_empty());
    }

    #[test]
    fn mixed_epic_and_no_epic() {
        let issues = vec![
            make_issue(1, Some(100), Some("Epic")),
            make_issue(2, None, None),
        ];
        let tree = build_epic_tree(issues, vec![], HashMap::new());
        assert_eq!(tree.len(), 2);
    }

    #[test]
    fn epic_nodes_have_depth_zero() {
        let issues = vec![make_issue(1, Some(100), Some("Epic"))];
        let tree = build_epic_tree(issues, vec![], HashMap::new());
        assert_eq!(tree[0].depth, 0);
        assert_eq!(tree[0].children[0].depth, 1);
    }

    #[test]
    fn epics_sorted_by_number() {
        let issues = vec![
            make_issue(1, Some(300), Some("Epic C")),
            make_issue(2, Some(100), Some("Epic A")),
            make_issue(3, Some(200), Some("Epic B")),
        ];
        let tree = build_epic_tree(issues, vec![], HashMap::new());
        match &tree[0].kind {
            TreeNodeKind::Epic { number, .. } => assert_eq!(*number, 100),
            _ => panic!("expected Epic"),
        }
        match &tree[1].kind {
            TreeNodeKind::Epic { number, .. } => assert_eq!(*number, 200),
            _ => panic!("expected Epic"),
        }
    }

    // --- Issue #9: PR-Issue リンクマージ ---

    #[test]
    fn pr_with_link_moves_to_issue() {
        // Issue #10 を持つ Epic、PR #42 が Issue #10 にリンクされている
        let issues = vec![
            make_issue(10, Some(100), Some("Epic A")),
            make_issue(99, None, None), // 別の Issue (Epic なし)
        ];
        let prs = vec![make_pr(42)];
        let mut links = HashMap::new();
        links.insert(42, vec![10]);

        let tree = build_epic_tree(issues, prs, links);

        // Epic A 配下の Issue #10 に PR #42 が子として移動している
        let epic_node = &tree[0];
        assert_eq!(epic_node.children.len(), 1);
        let issue_node = &epic_node.children[0];
        assert!(matches!(
            issue_node.kind,
            TreeNodeKind::Issue { number: 10, .. }
        ));
        assert_eq!(issue_node.children.len(), 1);
        assert!(matches!(
            issue_node.children[0].kind,
            TreeNodeKind::PullRequest { number: 42, .. }
        ));
        // 移動した PR の depth は親 Issue + 1
        assert_eq!(issue_node.children[0].depth, issue_node.depth + 1);

        // "Epic なし" グループには Issue #99 のみ残る (PR は移動済み)
        let no_epic = tree
            .iter()
            .find(|n| matches!(n.kind, TreeNodeKind::Epic { number: 0, .. }));
        assert!(
            no_epic.is_some(),
            "Epic なしグループは残るべき (Issue #99 が居る)"
        );
        let no_epic = no_epic.unwrap();
        assert_eq!(no_epic.children.len(), 1);
        assert!(matches!(
            no_epic.children[0].kind,
            TreeNodeKind::Issue { number: 99, .. }
        ));
    }

    #[test]
    fn empty_links_does_not_move_prs() {
        let issues = vec![make_issue(10, Some(100), Some("Epic A"))];
        let prs = vec![make_pr(42)];

        let tree = build_epic_tree(issues, prs, HashMap::new());

        // Epic A 配下の Issue #10 には PR が紐づかない
        assert_eq!(tree[0].children.len(), 1);
        assert!(tree[0].children[0].children.is_empty());
        // PR は "Epic なし" にそのまま残る
        let no_epic = tree
            .iter()
            .find(|n| matches!(n.kind, TreeNodeKind::Epic { number: 0, .. }));
        assert!(no_epic.is_some());
        assert_eq!(no_epic.unwrap().children.len(), 1);
    }

    #[test]
    fn pr_linked_to_multiple_issues_is_duplicated() {
        let issues = vec![
            make_issue(10, Some(100), Some("Epic A")),
            make_issue(20, Some(100), Some("Epic A")),
        ];
        let prs = vec![make_pr(42)];
        let mut links = HashMap::new();
        links.insert(42, vec![10, 20]);

        let tree = build_epic_tree(issues, prs, links);

        // Issue #10 と Issue #20 の両方に PR #42 が複製されている
        let epic_node = &tree[0];
        assert_eq!(epic_node.children.len(), 2);
        for issue_node in &epic_node.children {
            assert_eq!(issue_node.children.len(), 1);
            assert!(matches!(
                issue_node.children[0].kind,
                TreeNodeKind::PullRequest { number: 42, .. }
            ));
        }

        // "Epic なし" グループは空になり除去される
        let no_epic = tree
            .iter()
            .find(|n| matches!(n.kind, TreeNodeKind::Epic { number: 0, .. }));
        assert!(no_epic.is_none(), "Epic なしは空なので除去される");
    }

    #[test]
    fn pr_with_unknown_link_target_stays_in_no_epic() {
        // PR #42 が Issue #999 にリンクされているが、ツリーに #999 は存在しない
        let issues = vec![make_issue(10, Some(100), Some("Epic A"))];
        let prs = vec![make_pr(42)];
        let mut links = HashMap::new();
        links.insert(42, vec![999]);

        let tree = build_epic_tree(issues, prs, links);

        // Epic A 配下の Issue #10 には PR が紐づかない
        let epic_node = &tree[0];
        assert!(epic_node.children[0].children.is_empty());

        // PR は "Epic なし" に残る
        let no_epic = tree
            .iter()
            .find(|n| matches!(n.kind, TreeNodeKind::Epic { number: 0, .. }));
        assert!(no_epic.is_some());
        let no_epic = no_epic.unwrap();
        assert_eq!(no_epic.children.len(), 1);
        assert!(matches!(
            no_epic.children[0].kind,
            TreeNodeKind::PullRequest { number: 42, .. }
        ));
    }
}
