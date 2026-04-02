# Project 操作コマンド

Phase 1 で Issue の Status を変更する際にこのファイルを参照する。

## Issue を In progress に変更

```bash
# 1. Issue の node ID を取得
ISSUE_NODE_ID=$(gh api graphql -f query='{ repository(owner: "miyashitaAdacotech", name: "pr-sideber") { issue(number: '$ISSUE_NUMBER') { id } } }' -q '.data.repository.issue.id')

# 2. Project にアイテムとして追加 (既に追加済みなら既存の item ID が返る)
ITEM_ID=$(gh api graphql -f query='mutation { addProjectV2ItemById(input: { projectId: "PVT_kwHOD2yevc4BOdb4", contentId: "'$ISSUE_NODE_ID'" }) { item { id } } }' -q '.data.addProjectV2ItemById.item.id')

# 3. Status フィールドの ID と Option ID を動的に取得
read STATUS_FIELD_ID STATUS_OPTION_ID < <(gh api graphql -f query='{ viewer { projectsV2(first: 1) { nodes { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } } } } }' -q '[.data.viewer.projectsV2.nodes[0].fields.nodes[] | select(.name == "Status") | .id, (.options[] | select(.name == "In Progress") | .id)] | @tsv')

# 4. Status を In progress に変更
gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOD2yevc4BOdb4", itemId: "'$ITEM_ID'", fieldId: "'$STATUS_FIELD_ID'", value: { singleSelectOptionId: "'$STATUS_OPTION_ID'" } }) { projectV2Item { id } } }'
```
