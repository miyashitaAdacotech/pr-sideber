# Issue 作成コマンド

Issue 作成時にこのファイルを参照する。

## Issue 作成

```bash
gh issue create --title "タイトル" --body "$(cat <<'EOF'
## 概要
...
## 受け入れ条件
- [ ] ...
EOF
)" --label "enhancement"
```

ラベルは種別に応じて変更:
- Feature → `enhancement`
- Bug → `bug`
- Task → `task`

## Project Category 付与

Issue 作成後、必ず Project に追加して Category を設定する。

```bash
# 1. Category フィールドの ID と Option ID を動的に取得
read CATEGORY_FIELD_ID OPTION_ID < <(gh api graphql -f query='{ viewer { projectsV2(first: 1) { nodes { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } } } } }' -q '[.data.viewer.projectsV2.nodes[0].fields.nodes[] | select(.name == "Category") | .id, (.options[] | select(.name == "'"$CATEGORY_NAME"'") | .id)] | @tsv')

# 2. Issue の node ID を取得
ISSUE_NODE_ID=$(gh api graphql -f query='{ repository(owner: "kohchan0913", name: "pr-sideber") { issue(number: '$ISSUE_NUMBER') { id } } }' -q '.data.repository.issue.id')

# 3. Project にアイテムとして追加
ITEM_ID=$(gh api graphql -f query='mutation { addProjectV2ItemById(input: { projectId: "PVT_kwHOBqyBN84BSYze", contentId: "'$ISSUE_NODE_ID'" }) { item { id } } }' -q '.data.addProjectV2ItemById.item.id')

# 4. Category を設定
gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOBqyBN84BSYze", itemId: "'$ITEM_ID'", fieldId: "'$CATEGORY_FIELD_ID'", value: { singleSelectOptionId: "'$OPTION_ID'" } }) { projectV2Item { id } } }'
```

`$CATEGORY_NAME` には以下のいずれかを指定:
- `Feature` / `Tech-Risk` / `UX-Risk` / `Agent-Harness` / `Refactor` / `Nice-to-Have`
