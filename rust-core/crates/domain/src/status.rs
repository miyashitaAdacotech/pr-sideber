use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApprovalStatus {
    /// 少なくとも1人が承認し、変更要求がない状態。
    Approved,
    /// 少なくとも1人が変更要求 (CHANGES_REQUESTED) を出している状態。
    ChangesRequested,
    /// レビュー依頼済みだが、まだ誰もレビューしていない状態。
    ReviewRequired,
    /// レビュー依頼なし (レビューが0件)。
    Pending,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CiStatus {
    /// 全チェックが成功。
    Passed,
    /// 少なくとも1つのチェックが失敗。
    Failed,
    /// チェックが実行中。
    Running,
    /// チェックがキューに入っている。
    Pending,
    /// CI が未設定。
    None,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approval_status_serde_roundtrip() {
        let variants = [
            ApprovalStatus::Approved,
            ApprovalStatus::ChangesRequested,
            ApprovalStatus::ReviewRequired,
            ApprovalStatus::Pending,
        ];
        for variant in &variants {
            let json = serde_json::to_string(variant).expect("serialize should succeed");
            let restored: ApprovalStatus =
                serde_json::from_str(&json).expect("deserialize should succeed");
            assert_eq!(*variant, restored);
        }
    }

    #[test]
    fn ci_status_serde_roundtrip() {
        let variants = [
            CiStatus::Passed,
            CiStatus::Failed,
            CiStatus::Running,
            CiStatus::Pending,
            CiStatus::None,
        ];
        for variant in &variants {
            let json = serde_json::to_string(variant).expect("serialize should succeed");
            let restored: CiStatus =
                serde_json::from_str(&json).expect("deserialize should succeed");
            assert_eq!(*variant, restored);
        }
    }

    #[test]
    #[allow(clippy::clone_on_copy)]
    fn approval_status_copy_clone() {
        let original = ApprovalStatus::Approved;
        let copied = original; // Copy
        let cloned = original.clone(); // Clone
        assert_eq!(original, copied);
        assert_eq!(original, cloned);
    }

    #[test]
    #[allow(clippy::clone_on_copy)]
    fn ci_status_copy_clone() {
        let original = CiStatus::Failed;
        let copied = original;
        let cloned = original.clone();
        assert_eq!(original, copied);
        assert_eq!(original, cloned);
    }
}
