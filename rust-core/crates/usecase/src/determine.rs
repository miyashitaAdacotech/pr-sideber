use domain::error::DomainError;
use domain::status::{ApprovalStatus, CiStatus};

pub fn determine_approval_status(
    review_decision: Option<&str>,
) -> Result<ApprovalStatus, DomainError> {
    match review_decision {
        None => Ok(ApprovalStatus::Pending),
        Some("APPROVED") => Ok(ApprovalStatus::Approved),
        Some("CHANGES_REQUESTED") => Ok(ApprovalStatus::ChangesRequested),
        Some("REVIEW_REQUIRED") => Ok(ApprovalStatus::ReviewRequired),
        Some(other) => Err(DomainError::InvalidField {
            field: "review_decision".into(),
            reason: format!("unknown review decision: {other}"),
        }),
    }
}

pub fn determine_ci_status(status_check_rollup: Option<&str>) -> Result<CiStatus, DomainError> {
    match status_check_rollup {
        None => Ok(CiStatus::None),
        Some("SUCCESS") | Some("EXPECTED") => Ok(CiStatus::Passed),
        Some("FAILURE") | Some("ERROR") => Ok(CiStatus::Failed),
        Some("IN_PROGRESS") => Ok(CiStatus::Running),
        Some("PENDING") => Ok(CiStatus::Pending),
        Some(other) => Err(DomainError::InvalidField {
            field: "status_check_rollup".into(),
            reason: format!("unknown status check rollup: {other}"),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::error::DomainError;
    use domain::status::{ApprovalStatus, CiStatus};

    // --- determine_approval_status ---

    #[test]
    fn approval_status_approved() {
        let result = determine_approval_status(Some("APPROVED")).expect("APPROVED should be valid");
        assert_eq!(result, ApprovalStatus::Approved);
    }

    #[test]
    fn approval_status_changes_requested() {
        let result = determine_approval_status(Some("CHANGES_REQUESTED"))
            .expect("CHANGES_REQUESTED should be valid");
        assert_eq!(result, ApprovalStatus::ChangesRequested);
    }

    #[test]
    fn approval_status_review_required() {
        let result = determine_approval_status(Some("REVIEW_REQUIRED"))
            .expect("REVIEW_REQUIRED should be valid");
        assert_eq!(result, ApprovalStatus::ReviewRequired);
    }

    #[test]
    fn approval_status_none_returns_pending() {
        let result = determine_approval_status(None).expect("None should map to Pending");
        assert_eq!(result, ApprovalStatus::Pending);
    }

    #[test]
    fn approval_status_unknown_value_returns_error() {
        let result = determine_approval_status(Some("UNKNOWN_VALUE"));
        assert!(result.is_err(), "unknown value should return an error");
        match result {
            Err(DomainError::InvalidField { field, .. }) => {
                assert_eq!(field, "review_decision");
            }
            other => panic!("expected InvalidField error, got {other:?}"),
        }
    }

    #[test]
    fn approval_status_empty_string_returns_error() {
        let result = determine_approval_status(Some(""));
        assert!(result.is_err(), "empty string should return an error");
        match result {
            Err(DomainError::InvalidField { field, .. }) => {
                assert_eq!(field, "review_decision");
            }
            other => panic!("expected InvalidField error, got {other:?}"),
        }
    }

    // --- determine_ci_status ---

    #[test]
    fn ci_status_success() {
        let result = determine_ci_status(Some("SUCCESS")).expect("SUCCESS should be valid");
        assert_eq!(result, CiStatus::Passed);
    }

    #[test]
    fn ci_status_failure() {
        let result = determine_ci_status(Some("FAILURE")).expect("FAILURE should be valid");
        assert_eq!(result, CiStatus::Failed);
    }

    #[test]
    fn ci_status_pending() {
        let result = determine_ci_status(Some("PENDING")).expect("PENDING should be valid");
        assert_eq!(result, CiStatus::Pending);
    }

    #[test]
    fn ci_status_error_maps_to_failed() {
        let result = determine_ci_status(Some("ERROR")).expect("ERROR should be valid");
        assert_eq!(result, CiStatus::Failed);
    }

    #[test]
    fn ci_status_expected_maps_to_passed() {
        let result = determine_ci_status(Some("EXPECTED")).expect("EXPECTED should be valid");
        assert_eq!(result, CiStatus::Passed);
    }

    #[test]
    fn ci_status_in_progress_maps_to_running() {
        let result = determine_ci_status(Some("IN_PROGRESS")).expect("IN_PROGRESS should be valid");
        assert_eq!(result, CiStatus::Running);
    }

    #[test]
    fn ci_status_none_returns_ci_none() {
        let result = determine_ci_status(None).expect("None should map to CiStatus::None");
        assert_eq!(result, CiStatus::None);
    }

    #[test]
    fn ci_status_empty_string_returns_error() {
        let result = determine_ci_status(Some(""));
        assert!(result.is_err(), "empty string should return an error");
        match result {
            Err(DomainError::InvalidField { field, .. }) => {
                assert_eq!(field, "status_check_rollup");
            }
            other => panic!("expected InvalidField error, got {other:?}"),
        }
    }

    #[test]
    fn approval_status_lowercase_returns_error() {
        let result = determine_approval_status(Some("approved"));
        assert!(
            result.is_err(),
            "lowercase should return an error (only uppercase accepted)"
        );
    }

    #[test]
    fn ci_status_unknown_value_returns_error() {
        let result = determine_ci_status(Some("UNKNOWN"));
        assert!(result.is_err(), "unknown value should return an error");
        match result {
            Err(DomainError::InvalidField { field, .. }) => {
                assert_eq!(field, "status_check_rollup");
            }
            other => panic!("expected InvalidField error, got {other:?}"),
        }
    }
}
