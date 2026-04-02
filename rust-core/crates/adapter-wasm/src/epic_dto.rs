use serde::Serialize;
use tsify_next::Tsify;

use domain::epic::TreeNode;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Tsify)]
#[cfg_attr(test, derive(serde::Deserialize))]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct EpicTreeDto {
    pub roots: Vec<TreeNode>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::epic::{TreeNode, TreeNodeKind};

    #[test]
    fn serde_roundtrip() {
        let dto = EpicTreeDto {
            roots: vec![TreeNode::new(
                TreeNodeKind::Epic {
                    number: 1,
                    title: "Epic".to_string(),
                },
                0,
            )],
        };
        let json = serde_json::to_string(&dto).expect("serialize");
        let restored: EpicTreeDto = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(dto, restored);
    }

    #[test]
    fn empty_roots() {
        let dto = EpicTreeDto { roots: vec![] };
        let json = serde_json::to_string(&dto).expect("serialize");
        assert!(json.contains("\"roots\":[]"));
    }

    #[test]
    fn camel_case_output() {
        let dto = EpicTreeDto { roots: vec![] };
        let json = serde_json::to_string(&dto).expect("serialize");
        assert!(json.contains("\"roots\""));
    }
}
