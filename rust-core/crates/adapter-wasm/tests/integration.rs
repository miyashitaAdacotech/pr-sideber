use adapter_wasm::parser::parse_pull_request_nodes;

const VALID_JSON: &str = include_str!("fixtures/valid_response.json");
const EMPTY_JSON: &str = include_str!("fixtures/empty_response.json");
const INVALID_JSON: &str = include_str!("fixtures/invalid_response.json");

#[test]
fn valid_fixture_produces_correct_prs() {
    let parsed = parse_pull_request_nodes(VALID_JSON).expect("valid fixture should parse");
    assert_eq!(parsed.my_prs.len(), 2, "should have 2 myPrs");
    assert_eq!(
        parsed.review_requests.len(),
        1,
        "should have 1 reviewRequested"
    );

    // PR #10 (myPrs)
    let pr10 = parsed
        .my_prs
        .iter()
        .find(|p| p.number() == 10)
        .expect("PR #10");
    assert_eq!(pr10.title(), "feat: add authentication");
    assert_eq!(pr10.author(), "alice");
    assert_eq!(pr10.repository(), "owner/repo");
    assert!(!pr10.is_draft());
    assert_eq!(pr10.additions(), 150);
    assert_eq!(pr10.deletions(), 30);

    // PR #5 (reviewRequested)
    let pr5 = parsed
        .review_requests
        .iter()
        .find(|p| p.number() == 5)
        .expect("PR #5");
    assert_eq!(pr5.author(), "bob");
    assert_eq!(pr5.repository(), "other/lib");
}

#[test]
fn valid_fixture_processes_to_sorted_lists() {
    let parsed = parse_pull_request_nodes(VALID_JSON).expect("valid fixture should parse");
    let processed = usecase::process::process_pull_requests(parsed.my_prs, parsed.review_requests);

    assert_eq!(processed.my_prs.len(), 2, "alice has 2 PRs");
    assert_eq!(processed.review_requests.len(), 1, "1 review request");

    // my_prs sorted by updated_at desc: PR #10 (Jan 5) before PR #11 (Jan 3)
    assert_eq!(processed.my_prs[0].number(), 10);
    assert_eq!(processed.my_prs[1].number(), 11);

    // review_requests
    assert_eq!(processed.review_requests[0].number(), 5);
}

#[test]
fn empty_fixture_returns_empty_lists() {
    let parsed = parse_pull_request_nodes(EMPTY_JSON).expect("empty fixture should parse");
    assert!(parsed.my_prs.is_empty());
    assert!(parsed.review_requests.is_empty());

    let processed = usecase::process::process_pull_requests(parsed.my_prs, parsed.review_requests);
    assert!(processed.my_prs.is_empty());
    assert!(processed.review_requests.is_empty());
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
