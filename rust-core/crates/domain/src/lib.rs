pub mod entity;
pub mod error;
pub mod status;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Greeting {
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greeting_serializes_to_json() {
        let greeting = Greeting {
            message: "Hello, World!".to_string(),
        };
        let json = serde_json::to_string(&greeting).expect("serialize should succeed");
        assert_eq!(json, r#"{"message":"Hello, World!"}"#);
    }

    #[test]
    fn greeting_deserializes_from_json() {
        let json = r#"{"message":"Hello, Rust!"}"#;
        let greeting: Greeting = serde_json::from_str(json).expect("deserialize should succeed");
        assert_eq!(greeting.message, "Hello, Rust!");
    }

    #[test]
    fn greeting_roundtrip() {
        let original = Greeting {
            message: "roundtrip test".to_string(),
        };
        let json = serde_json::to_string(&original).expect("serialize should succeed");
        let restored: Greeting = serde_json::from_str(&json).expect("deserialize should succeed");
        assert_eq!(original.message, restored.message);
    }
}
