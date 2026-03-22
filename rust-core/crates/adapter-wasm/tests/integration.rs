use adapter_wasm::parser::parse_pull_request_nodes;

const VALID_JSON: &str = include_str!("fixtures/valid_response.json");
const EMPTY_JSON: &str = include_str!("fixtures/empty_response.json");
const INVALID_JSON: &str = include_str!("fixtures/invalid_response.json");

#[test]
fn valid_fixture_produces_correct_prs() {
    let prs = parse_pull_request_nodes(VALID_JSON).expect("valid fixture should parse");
    // 2 myPrs + 1 reviewRequested = 3 total
    assert_eq!(prs.len(), 3, "should have 3 PRs total");

    // PR #10
    let pr10 = prs.iter().find(|p| p.number() == 10).expect("PR #10");
    assert_eq!(pr10.title(), "feat: add authentication");
    assert_eq!(pr10.author(), "alice");
    assert_eq!(pr10.repository(), "owner/repo");
    assert!(!pr10.is_draft());
    assert_eq!(pr10.additions(), 150);
    assert_eq!(pr10.deletions(), 30);

    // PR #5 (review requested)
    let pr5 = prs.iter().find(|p| p.number() == 5).expect("PR #5");
    assert_eq!(pr5.author(), "bob");
    assert_eq!(pr5.repository(), "other/lib");
}

#[test]
fn valid_fixture_processes_to_classified_dtos() {
    let prs = parse_pull_request_nodes(VALID_JSON).expect("valid fixture should parse");
    let processed = usecase::process::process_pull_requests("alice", prs);

    assert_eq!(processed.my_prs.items.len(), 2, "alice has 2 PRs");
    assert_eq!(processed.review_requests.items.len(), 1, "1 review request");

    // my_prs sorted by updated_at desc: PR #10 (Jan 5) before PR #11 (Jan 3)
    assert_eq!(processed.my_prs.items[0].number, 10);
    assert_eq!(processed.my_prs.items[1].number, 11);

    // review_requests
    assert_eq!(processed.review_requests.items[0].number, 5);
}

#[test]
fn empty_fixture_returns_empty_lists() {
    let prs = parse_pull_request_nodes(EMPTY_JSON).expect("empty fixture should parse");
    assert!(prs.is_empty());

    let processed = usecase::process::process_pull_requests("alice", prs);
    assert!(processed.my_prs.items.is_empty());
    assert!(processed.review_requests.items.is_empty());
    assert_eq!(processed.my_prs.total_count, 0);
    assert_eq!(processed.review_requests.total_count, 0);
}

#[test]
fn invalid_fixture_returns_error() {
    let result = parse_pull_request_nodes(INVALID_JSON);
    assert!(result.is_err(), "invalid fixture should return error");
}

#[test]
fn completely_broken_json_returns_error() {
    let result = parse_pull_request_nodes("}{not json at all");
    assert!(result.is_err(), "broken JSON should return error");
}
