use domain::entity::PullRequest;

use crate::classify::classify_pull_requests;
use crate::sort::sort_by_updated_at_desc;

pub struct ProcessedPrs {
    pub my_prs: Vec<PullRequest>,
    pub review_requests: Vec<PullRequest>,
}

pub fn process_pull_requests(login: &str, pull_requests: Vec<PullRequest>) -> ProcessedPrs {
    let mut classified = classify_pull_requests(login, pull_requests);

    sort_by_updated_at_desc(&mut classified.my_prs);
    sort_by_updated_at_desc(&mut classified.review_requests);

    ProcessedPrs {
        my_prs: classified.my_prs,
        review_requests: classified.review_requests,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::status::{ApprovalStatus, CiStatus};

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
            10,
            5,
            "2026-01-01T00:00:00Z".to_string(),
            updated_at.to_string(),
        )
        .expect("test PR should be valid")
    }

    #[test]
    fn process_multiple_prs_correctly() {
        let prs = vec![
            make_pr("alice", 1, "2026-01-01T00:00:00Z"),
            make_pr("bob", 2, "2026-01-03T00:00:00Z"),
            make_pr("alice", 3, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests("alice", prs);

        assert_eq!(result.my_prs.len(), 2);
        assert_eq!(result.review_requests.len(), 1);

        // my_prs should be sorted by updated_at desc
        assert_eq!(result.my_prs[0].number(), 3);
        assert_eq!(result.my_prs[1].number(), 1);

        // review_requests
        assert_eq!(result.review_requests[0].number(), 2);
    }

    #[test]
    fn process_empty_list_returns_empty() {
        let result = process_pull_requests("alice", vec![]);
        assert!(result.my_prs.is_empty());
        assert!(result.review_requests.is_empty());
    }

    #[test]
    fn process_only_my_prs() {
        let prs = vec![
            make_pr("alice", 1, "2026-01-01T00:00:00Z"),
            make_pr("alice", 2, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests("alice", prs);
        assert_eq!(result.my_prs.len(), 2);
        assert!(result.review_requests.is_empty());
    }

    #[test]
    fn process_only_review_requests() {
        let prs = vec![
            make_pr("bob", 1, "2026-01-01T00:00:00Z"),
            make_pr("charlie", 2, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests("alice", prs);
        assert!(result.my_prs.is_empty());
        assert_eq!(result.review_requests.len(), 2);
    }

    #[test]
    fn review_requests_sorted_by_updated_at_desc() {
        let prs = vec![
            make_pr("bob", 1, "2026-01-01T00:00:00Z"),
            make_pr("charlie", 2, "2026-01-03T00:00:00Z"),
            make_pr("dave", 3, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests("alice", prs);
        assert_eq!(result.review_requests.len(), 3);
        assert_eq!(result.review_requests[0].number(), 2);
        assert_eq!(result.review_requests[1].number(), 3);
        assert_eq!(result.review_requests[2].number(), 1);
    }

    #[test]
    fn pr_fields_preserved_after_processing() {
        let prs = vec![make_pr("alice", 42, "2026-01-15T12:00:00Z")];
        let result = process_pull_requests("alice", prs);
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
