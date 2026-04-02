use std::collections::HashMap;

use domain::entity::PullRequest;
use domain::epic::{TreeLabel, TreeNode, TreeNodeKind, TreePrData};
use domain::issue::Issue;

use crate::determine::determine_pr_size;

/// Epic ツリーを構築する。
///
/// 返り値は Epic ノードのリスト。Epic に属さない項目は number=0 の「Epic なし」ノードに格納。
pub fn build_epic_tree(issues: Vec<Issue>, prs: Vec<PullRequest>) -> Vec<TreeNode> {
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
        let tree = build_epic_tree(issues, vec![]);
        assert_eq!(tree.len(), 2);
        assert_eq!(tree[0].children.len(), 2); // Epic 100
        assert_eq!(tree[1].children.len(), 1); // Epic 200
    }

    #[test]
    fn no_epic_group() {
        let issues = vec![make_issue(1, None, None)];
        let prs = vec![make_pr(10)];
        let tree = build_epic_tree(issues, prs);
        assert_eq!(tree.len(), 1); // "Epic なし"
        assert_eq!(tree[0].children.len(), 2);
    }

    #[test]
    fn empty_input() {
        let tree = build_epic_tree(vec![], vec![]);
        assert!(tree.is_empty());
    }

    #[test]
    fn mixed_epic_and_no_epic() {
        let issues = vec![
            make_issue(1, Some(100), Some("Epic")),
            make_issue(2, None, None),
        ];
        let tree = build_epic_tree(issues, vec![]);
        assert_eq!(tree.len(), 2);
    }

    #[test]
    fn epic_nodes_have_depth_zero() {
        let issues = vec![make_issue(1, Some(100), Some("Epic"))];
        let tree = build_epic_tree(issues, vec![]);
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
        let tree = build_epic_tree(issues, vec![]);
        match &tree[0].kind {
            TreeNodeKind::Epic { number, .. } => assert_eq!(*number, 100),
            _ => panic!("expected Epic"),
        }
        match &tree[1].kind {
            TreeNodeKind::Epic { number, .. } => assert_eq!(*number, 200),
            _ => panic!("expected Epic"),
        }
    }
}
