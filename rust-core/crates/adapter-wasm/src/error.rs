use domain::error::DomainError;
use std::fmt;

/// adapter-wasm crate 固有のエラー型。
/// GraphQL JSON パースエラーと domain エラーを統一的に扱う。
#[derive(Debug)]
pub enum WasmError {
    /// JSON デシリアライズに失敗した場合。
    ParseError(serde_json::Error),
    /// domain 層のバリデーションエラー。
    DomainError(DomainError),
    /// GraphQL レスポンスの data フィールドが null だった場合。
    EmptyResponse,
}

impl fmt::Display for WasmError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WasmError::ParseError(err) => write!(f, "JSON parse error: {err}"),
            WasmError::DomainError(err) => write!(f, "domain error: {err}"),
            WasmError::EmptyResponse => write!(f, "GraphQL response data is null"),
        }
    }
}

impl std::error::Error for WasmError {}

impl From<serde_json::Error> for WasmError {
    fn from(err: serde_json::Error) -> Self {
        WasmError::ParseError(err)
    }
}

impl From<DomainError> for WasmError {
    fn from(err: DomainError) -> Self {
        WasmError::DomainError(err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_parse_error() {
        let serde_err: serde_json::Error =
            serde_json::from_str::<String>("not valid json").unwrap_err();
        let err = WasmError::ParseError(serde_err);
        let msg = err.to_string();
        assert!(
            msg.contains("parse"),
            "Display should mention 'parse', got: {msg}"
        );
    }

    #[test]
    fn display_domain_error() {
        let domain_err = DomainError::InvalidField {
            field: "title".to_string(),
            reason: "must not be empty".to_string(),
        };
        let err = WasmError::DomainError(domain_err);
        let msg = err.to_string();
        assert!(
            msg.contains("domain") || msg.contains("title"),
            "Display should mention domain context, got: {msg}"
        );
    }

    #[test]
    fn from_serde_json_error() {
        let serde_err: serde_json::Error = serde_json::from_str::<String>("invalid").unwrap_err();
        let wasm_err: WasmError = serde_err.into();
        assert!(
            matches!(wasm_err, WasmError::ParseError(_)),
            "should convert to ParseError variant"
        );
    }

    #[test]
    fn from_domain_error() {
        let domain_err = DomainError::InvalidState {
            message: "bad state".to_string(),
        };
        let wasm_err: WasmError = domain_err.into();
        assert!(
            matches!(wasm_err, WasmError::DomainError(_)),
            "should convert to DomainError variant"
        );
    }
}
