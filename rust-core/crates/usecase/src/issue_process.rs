use domain::issue::Issue;

/// Issue を updated_at 降順でソートする（既存の PR ソートと同じ方針）。
pub fn sort_issues_by_updated_at_desc(issues: &mut [Issue]) {
    issues.sort_by(|a, b| b.updated_at().cmp(a.updated_at()));
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::issue::{Issue, IssueState};

    fn make_issue(number: u32, updated_at: &str) -> Issue {
        Issue::new(
            format!("I_{number}"),
            number,
            format!("Issue {number}"),
            format!("https://github.com/o/r/issues/{number}"),
            IssueState::Open,
            vec![],
            vec!["alice".to_string()],
            updated_at.to_string(),
            None,
            None,
        )
        .expect("valid")
    }

    #[test]
    fn sorts_by_updated_at_desc() {
        let mut issues = vec![
            make_issue(1, "2026-01-01T00:00:00Z"),
            make_issue(3, "2026-03-01T00:00:00Z"),
            make_issue(2, "2026-02-01T00:00:00Z"),
        ];
        sort_issues_by_updated_at_desc(&mut issues);
        assert_eq!(issues[0].number(), 3);
        assert_eq!(issues[1].number(), 2);
        assert_eq!(issues[2].number(), 1);
    }

    #[test]
    fn empty_slice_is_noop() {
        let mut issues: Vec<Issue> = vec![];
        sort_issues_by_updated_at_desc(&mut issues);
        assert!(issues.is_empty());
    }
}
