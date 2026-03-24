use domain::entity::PullRequest;

use crate::sort::sort_by_updated_at_desc;

pub struct ProcessedPrs {
    pub my_prs: Vec<PullRequest>,
    pub review_requests: Vec<PullRequest>,
    /// DRAFT PR を除外したレビューリクエスト件数 (バッジ表示用)
    pub review_request_badge_count: u32,
}

/// パーサーが分類済みの my_prs / review_requests を受け取り、ソートして返す。
pub fn process_pull_requests(
    mut my_prs: Vec<PullRequest>,
    mut review_requests: Vec<PullRequest>,
) -> ProcessedPrs {
    sort_by_updated_at_desc(&mut my_prs);
    sort_by_updated_at_desc(&mut review_requests);

    let review_request_badge_count =
        review_requests.iter().filter(|pr| !pr.is_draft()).count() as u32;

    ProcessedPrs {
        my_prs,
        review_requests,
        review_request_badge_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::status::{ApprovalStatus, CiStatus, MergeableStatus};

    fn make_pr(author: &str, number: u32, updated_at: &str) -> PullRequest {
        PullRequest::new(
            format!("PR_{number}"),
            number,
            format!("PR #{number}"),
            author.to_string(),
            format!("https://github.com/owner/repo/pull/{number}"),
            "owner/repo".to_string(),
            false,
            ApprovalStatus::Approved,
            CiStatus::Passed,
            MergeableStatus::Unknown,
            10,
            5,
            "2026-01-01T00:00:00Z".to_string(),
            updated_at.to_string(),
            0,
        )
        .expect("test PR should be valid")
    }

    #[test]
    fn process_sorts_both_lists_by_updated_at_desc() {
        let my_prs = vec![
            make_pr("alice", 1, "2026-01-01T00:00:00Z"),
            make_pr("alice", 3, "2026-01-02T00:00:00Z"),
        ];
        let review_requests = vec![make_pr("bob", 2, "2026-01-03T00:00:00Z")];
        let result = process_pull_requests(my_prs, review_requests);

        assert_eq!(result.my_prs.len(), 2);
        assert_eq!(result.review_requests.len(), 1);

        // my_prs should be sorted by updated_at desc
        assert_eq!(result.my_prs[0].number(), 3);
        assert_eq!(result.my_prs[1].number(), 1);

        // review_requests
        assert_eq!(result.review_requests[0].number(), 2);
    }

    #[test]
    fn process_empty_lists_returns_empty() {
        let result = process_pull_requests(vec![], vec![]);
        assert!(result.my_prs.is_empty());
        assert!(result.review_requests.is_empty());
    }

    #[test]
    fn process_only_my_prs() {
        let my_prs = vec![
            make_pr("alice", 1, "2026-01-01T00:00:00Z"),
            make_pr("alice", 2, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests(my_prs, vec![]);
        assert_eq!(result.my_prs.len(), 2);
        assert!(result.review_requests.is_empty());
    }

    #[test]
    fn process_only_review_requests() {
        let review_requests = vec![
            make_pr("bob", 1, "2026-01-01T00:00:00Z"),
            make_pr("charlie", 2, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests(vec![], review_requests);
        assert!(result.my_prs.is_empty());
        assert_eq!(result.review_requests.len(), 2);
    }

    #[test]
    fn review_requests_sorted_by_updated_at_desc() {
        let review_requests = vec![
            make_pr("bob", 1, "2026-01-01T00:00:00Z"),
            make_pr("charlie", 2, "2026-01-03T00:00:00Z"),
            make_pr("dave", 3, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests(vec![], review_requests);
        assert_eq!(result.review_requests.len(), 3);
        assert_eq!(result.review_requests[0].number(), 2);
        assert_eq!(result.review_requests[1].number(), 3);
        assert_eq!(result.review_requests[2].number(), 1);
    }

    fn make_draft_pr(author: &str, number: u32, updated_at: &str) -> PullRequest {
        PullRequest::new(
            format!("PR_{number}"),
            number,
            format!("PR #{number}"),
            author.to_string(),
            format!("https://github.com/owner/repo/pull/{number}"),
            "owner/repo".to_string(),
            true, // is_draft = true
            ApprovalStatus::Pending,
            CiStatus::None,
            MergeableStatus::Unknown,
            10,
            5,
            "2026-01-01T00:00:00Z".to_string(),
            updated_at.to_string(),
            0,
        )
        .expect("test draft PR should be valid")
    }

    // --- review_request_badge_count tests (Issue #169) ---

    #[test]
    fn review_request_badge_count_excludes_draft() {
        // DRAFT PR を先頭に配置して、先頭 DRAFT でもカウント除外されることを検証
        let review_requests = vec![
            make_draft_pr("charlie", 2, "2026-01-02T00:00:00Z"),
            make_pr("bob", 1, "2026-01-01T00:00:00Z"),
            make_pr("dave", 3, "2026-01-03T00:00:00Z"),
        ];
        let result = process_pull_requests(vec![], review_requests);
        // DRAFT でも一覧からは除外しない
        assert_eq!(result.review_requests.len(), 3);
        // 3 件中 1 件が DRAFT なので badge count は 2
        assert_eq!(result.review_request_badge_count, 2);
    }

    #[test]
    fn review_request_badge_count_all_draft() {
        let review_requests = vec![
            make_draft_pr("bob", 1, "2026-01-01T00:00:00Z"),
            make_draft_pr("charlie", 2, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests(vec![], review_requests);
        // 全 DRAFT でも一覧からは除外しない
        assert_eq!(result.review_requests.len(), 2);
        assert_eq!(result.review_request_badge_count, 0);
    }

    #[test]
    fn review_request_badge_count_no_draft() {
        let review_requests = vec![
            make_pr("bob", 1, "2026-01-01T00:00:00Z"),
            make_pr("charlie", 2, "2026-01-02T00:00:00Z"),
            make_pr("dave", 3, "2026-01-03T00:00:00Z"),
        ];
        let result = process_pull_requests(vec![], review_requests);
        assert_eq!(result.review_request_badge_count, 3);
    }

    #[test]
    fn review_request_badge_count_empty() {
        let result = process_pull_requests(vec![], vec![]);
        assert_eq!(result.review_request_badge_count, 0);
    }

    #[test]
    fn pr_fields_preserved_after_processing() {
        let my_prs = vec![make_pr("alice", 42, "2026-01-15T12:00:00Z")];
        let result = process_pull_requests(my_prs, vec![]);
        let pr = &result.my_prs[0];
        assert_eq!(pr.number(), 42);
        assert_eq!(pr.author(), "alice");
        assert_eq!(pr.title(), "PR #42");
        assert_eq!(pr.repository(), "owner/repo");
        assert_eq!(pr.additions(), 10);
        assert_eq!(pr.deletions(), 5);
        assert_eq!(pr.updated_at(), "2026-01-15T12:00:00Z");
    }
}
