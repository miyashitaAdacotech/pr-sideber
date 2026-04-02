pub mod determine;
pub mod epic_process;
pub mod issue_process;
pub mod process;
pub mod sort;
pub mod url;

use domain::Greeting;

pub fn create_greeting(name: &str) -> Greeting {
    let trimmed = name.trim();
    let message = if trimmed.is_empty() {
        "Hello, World!".to_string()
    } else {
        format!("Hello, {trimmed}!")
    };
    Greeting { message }
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::Greeting;

    #[test]
    fn create_greeting_returns_greeting_with_name() {
        let result: Greeting = create_greeting("Alice");
        assert_eq!(result.message, "Hello, Alice!");
    }

    #[test]
    fn create_greeting_with_empty_name_returns_default_message() {
        let result: Greeting = create_greeting("");
        assert_eq!(result.message, "Hello, World!");
    }

    #[test]
    fn create_greeting_with_whitespace_only_returns_default_message() {
        let result: Greeting = create_greeting("   ");
        assert_eq!(result.message, "Hello, World!");
    }
}
