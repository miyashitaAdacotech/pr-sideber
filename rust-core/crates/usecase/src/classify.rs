use domain::entity::PullRequest;

pub struct ClassifiedPrs {
    pub my_prs: Vec<PullRequest>,
    pub review_requests: Vec<PullRequest>,
}

pub fn classify_pull_requests(login: &str, pull_requests: Vec<PullRequest>) -> ClassifiedPrs {
    let (my_prs, review_requests) = pull_requests
        .into_iter()
        .partition(|pr| pr.author().eq_ignore_ascii_case(login));

    ClassifiedPrs {
        my_prs,
        review_requests,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::status::{ApprovalStatus, CiStatus};

    fn make_pr(author: &str, number: u32) -> PullRequest {
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
            "2026-01-02T00:00:00Z".to_string(),
        )
        .expect("test PR should be valid")
    }

    #[test]
    fn all_my_prs() {
        let prs = vec![make_pr("alice", 1), make_pr("alice", 2)];
        let result = classify_pull_requests("alice", prs);
        assert_eq!(result.my_prs.len(), 2);
        assert!(result.review_requests.is_empty());
    }

    #[test]
    fn all_review_requests() {
        let prs = vec![make_pr("bob", 1), make_pr("charlie", 2)];
        let result = classify_pull_requests("alice", prs);
        assert!(result.my_prs.is_empty());
        assert_eq!(result.review_requests.len(), 2);
    }

    #[test]
    fn mixed_prs_classified_correctly() {
        let prs = vec![make_pr("alice", 1), make_pr("bob", 2), make_pr("alice", 3)];
        let result = classify_pull_requests("alice", prs);
        assert_eq!(result.my_prs.len(), 2);
        assert_eq!(
            result
                .my_prs
                .iter()
                .map(|pr| pr.number())
                .collect::<Vec<_>>(),
            vec![1, 3]
        );
        assert_eq!(result.review_requests.len(), 1);
        assert_eq!(result.review_requests[0].number(), 2);
    }

    #[test]
    fn empty_list_returns_both_empty() {
        let prs: Vec<PullRequest> = vec![];
        let result = classify_pull_requests("alice", prs);
        assert!(result.my_prs.is_empty());
        assert!(result.review_requests.is_empty());
    }

    #[test]
    fn case_insensitive_login_comparison() {
        let prs = vec![make_pr("Alice", 1), make_pr("alice", 2)];
        let result = classify_pull_requests("alice", prs);
        assert_eq!(result.my_prs.len(), 2);
        assert!(result.review_requests.is_empty());
    }

    #[test]
    fn empty_login_classifies_all_as_review_requests() {
        let prs = vec![make_pr("alice", 1), make_pr("bob", 2)];
        let result = classify_pull_requests("", prs);
        assert!(result.my_prs.is_empty());
        assert_eq!(result.review_requests.len(), 2);
    }
}
