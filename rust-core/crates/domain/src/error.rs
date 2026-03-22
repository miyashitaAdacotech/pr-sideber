use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DomainError {
    InvalidField { field: String, reason: String },
    InvalidState { message: String },
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DomainError::InvalidField { field, reason } => {
                write!(f, "invalid field '{field}': {reason}")
            }
            DomainError::InvalidState { message } => {
                write!(f, "invalid state: {message}")
            }
        }
    }
}

impl std::error::Error for DomainError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_field_display() {
        let err = DomainError::InvalidField {
            field: "title".to_string(),
            reason: "must not be empty".to_string(),
        };
        assert_eq!(err.to_string(), "invalid field 'title': must not be empty");
    }

    #[test]
    fn invalid_state_display() {
        let err = DomainError::InvalidState {
            message: "PR is already merged".to_string(),
        };
        assert_eq!(err.to_string(), "invalid state: PR is already merged");
    }

    #[test]
    fn domain_error_partial_eq() {
        let a = DomainError::InvalidField {
            field: "title".to_string(),
            reason: "empty".to_string(),
        };
        let b = DomainError::InvalidField {
            field: "title".to_string(),
            reason: "empty".to_string(),
        };
        let c = DomainError::InvalidState {
            message: "bad".to_string(),
        };
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn domain_error_serde_roundtrip_invalid_field() {
        let err = DomainError::InvalidField {
            field: "number".to_string(),
            reason: "must be positive".to_string(),
        };
        let json = serde_json::to_string(&err).expect("serialize should succeed");
        let restored: DomainError =
            serde_json::from_str(&json).expect("deserialize should succeed");
        assert_eq!(err, restored);
    }

    #[test]
    fn domain_error_serde_roundtrip_invalid_state() {
        let err = DomainError::InvalidState {
            message: "unexpected".to_string(),
        };
        let json = serde_json::to_string(&err).expect("serialize should succeed");
        let restored: DomainError =
            serde_json::from_str(&json).expect("deserialize should succeed");
        assert_eq!(err, restored);
    }

    #[test]
    fn domain_error_implements_std_error() {
        let err = DomainError::InvalidField {
            field: "x".to_string(),
            reason: "y".to_string(),
        };
        let std_err: &dyn std::error::Error = &err;
        // source is None for our simple variants
        assert!(std_err.source().is_none());
    }
}
