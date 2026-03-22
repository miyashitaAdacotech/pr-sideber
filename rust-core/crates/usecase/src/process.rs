use domain::dto::{PrItemDto, PrListDto};
use domain::entity::PullRequest;

use crate::classify::classify_pull_requests;
use crate::sort::sort_by_updated_at_desc;

pub struct ProcessedPrs {
    pub my_prs: PrListDto,
    pub review_requests: PrListDto,
}

pub fn process_pull_requests(login: &str, pull_requests: Vec<PullRequest>) -> ProcessedPrs {
    let mut classified = classify_pull_requests(login, pull_requests);

    sort_by_updated_at_desc(&mut classified.my_prs);
    sort_by_updated_at_desc(&mut classified.review_requests);

    let my_items: Vec<PrItemDto> = classified.my_prs.iter().map(to_pr_item_dto).collect();
    let review_items: Vec<PrItemDto> = classified
        .review_requests
        .iter()
        .map(to_pr_item_dto)
        .collect();

    let my_prs = PrListDto {
        // ページネーション未実装のため items.len() を使用
        total_count: my_items.len() as u32,
        items: my_items,
    };

    let review_requests = PrListDto {
        // ページネーション未実装のため items.len() を使用
        total_count: review_items.len() as u32,
        items: review_items,
    };

    ProcessedPrs {
        my_prs,
        review_requests,
    }
}

fn to_pr_item_dto(pr: &PullRequest) -> PrItemDto {
    PrItemDto {
        id: pr.id().to_string(),
        number: pr.number(),
        title: pr.title().to_string(),
        author: pr.author().to_string(),
        url: pr.url().to_string(),
        repository: pr.repository().to_string(),
        is_draft: pr.is_draft(),
        approval_status: pr.approval_status(),
        ci_status: pr.ci_status(),
        additions: pr.additions(),
        deletions: pr.deletions(),
        created_at: pr.created_at().to_string(),
        updated_at: pr.updated_at().to_string(),
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

        assert_eq!(result.my_prs.items.len(), 2);
        assert_eq!(result.review_requests.items.len(), 1);

        // my_prs should be sorted by updated_at desc
        assert_eq!(result.my_prs.items[0].number, 3);
        assert_eq!(result.my_prs.items[1].number, 1);

        // review_requests
        assert_eq!(result.review_requests.items[0].number, 2);
    }

    #[test]
    fn process_empty_list_returns_empty_dtos() {
        let result = process_pull_requests("alice", vec![]);
        assert!(result.my_prs.items.is_empty());
        assert_eq!(result.my_prs.total_count, 0);
        assert!(result.review_requests.items.is_empty());
        assert_eq!(result.review_requests.total_count, 0);
    }

    #[test]
    fn process_only_my_prs() {
        let prs = vec![
            make_pr("alice", 1, "2026-01-01T00:00:00Z"),
            make_pr("alice", 2, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests("alice", prs);
        assert_eq!(result.my_prs.items.len(), 2);
        assert!(result.review_requests.items.is_empty());
        assert_eq!(result.review_requests.total_count, 0);
    }

    #[test]
    fn process_only_review_requests() {
        let prs = vec![
            make_pr("bob", 1, "2026-01-01T00:00:00Z"),
            make_pr("charlie", 2, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests("alice", prs);
        assert!(result.my_prs.items.is_empty());
        assert_eq!(result.my_prs.total_count, 0);
        assert_eq!(result.review_requests.items.len(), 2);
    }

    #[test]
    fn review_requests_sorted_by_updated_at_desc() {
        let prs = vec![
            make_pr("bob", 1, "2026-01-01T00:00:00Z"),
            make_pr("charlie", 2, "2026-01-03T00:00:00Z"),
            make_pr("dave", 3, "2026-01-02T00:00:00Z"),
        ];
        let result = process_pull_requests("alice", prs);
        assert_eq!(result.review_requests.items.len(), 3);
        assert_eq!(result.review_requests.items[0].number, 2);
        assert_eq!(result.review_requests.items[1].number, 3);
        assert_eq!(result.review_requests.items[2].number, 1);
    }

    /// ページネーション未実装時点では total_count == items.len()。
    /// ページネーション導入時にはこのテストの更新が必要。
    #[test]
    fn total_count_matches_items_len() {
        let prs = vec![
            make_pr("alice", 1, "2026-01-01T00:00:00Z"),
            make_pr("bob", 2, "2026-01-02T00:00:00Z"),
            make_pr("alice", 3, "2026-01-03T00:00:00Z"),
        ];
        let result = process_pull_requests("alice", prs);
        assert_eq!(result.my_prs.total_count, result.my_prs.items.len() as u32);
        assert_eq!(
            result.review_requests.total_count,
            result.review_requests.items.len() as u32
        );
    }

    #[test]
    fn dto_fields_match_original_pull_request() {
        let prs = vec![make_pr("alice", 42, "2026-01-15T12:00:00Z")];
        let result = process_pull_requests("alice", prs);
        let dto = &result.my_prs.items[0];
        assert_eq!(dto.number, 42);
        assert_eq!(dto.author, "alice");
        assert_eq!(dto.title, "PR #42");
        assert_eq!(dto.repository, "owner/repo");
        assert_eq!(dto.additions, 10);
        assert_eq!(dto.deletions, 5);
        assert_eq!(dto.updated_at, "2026-01-15T12:00:00Z");
    }
}
