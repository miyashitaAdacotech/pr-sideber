# Issue 作成・リレーション設定コマンド

Issue 作成時・リレーション設定時にこのファイルを参照する。

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

## サブ issue の追加 (REST API)

```bash
# 子 issue の数値 ID を取得
CHILD_ID=$(gh api /repos/{owner}/{repo}/issues/$CHILD_NUMBER --jq .id)

# 親 issue にサブ issue として追加
gh api repos/{owner}/{repo}/issues/$PARENT_NUMBER/sub_issues \
  -f sub_issue_id="$CHILD_ID"
```

## タスク分割の手順

1. 親 issue を作成する
2. サブ issue を個別に作成する
3. 各サブ issue を REST API で親にリンクする

## GraphQL を使う場合 (代替)

```bash
# node_id を取得
PARENT_NODE_ID=$(gh api /repos/{owner}/{repo}/issues/$PARENT_NUMBER --jq .node_id)
CHILD_NODE_ID=$(gh api /repos/{owner}/{repo}/issues/$CHILD_NUMBER --jq .node_id)

# サブ issue を追加
gh api graphql \
  -H "GraphQL-Features: sub_issues" \
  -f query="
    mutation {
      addSubIssue(input: {
        issueId: \"$PARENT_NODE_ID\",
        subIssueId: \"$CHILD_NODE_ID\"
      }) {
        issue { number }
        subIssue { number }
      }
    }
  "
```

## ブロッカー（Blocked-by）リレーション (GraphQL API)

Sub-issue（親子分解）とは異なる。ブロッカーは「この Issue が完了しないと着手できない」という依存関係。
REST API にはエンドポイントがないため、**GraphQL の `addBlockedBy` ミューテーション**を使う。

### 利用可否の確認

```bash
gh api graphql -f query='{ __type(name: "Mutation") { fields { name } } }' \
  --jq '.data.__type.fields[].name' | grep -Fx 'addBlockedBy'
```

### Issue の node ID 取得

```bash
# 単一
gh api graphql -f query='
  query { repository(owner: "OWNER", name: "REPO") {
    issue(number: N) { id }
  } }
' --jq '.data.repository.issue.id'

# 一括取得 (alias)
gh api graphql -f query='
  query { repository(owner: "OWNER", name: "REPO") {
    i1: issue(number: 1) { id }
    i2: issue(number: 2) { id }
    i3: issue(number: 3) { id }
  } }
' --jq '.data.repository'
```

### ブロッカー設定

`issueId` = ブロックされる側（後に実装）、`blockingIssueId` = ブロックする側（先に実装）:

```bash
gh api graphql -f query='
  mutation {
    addBlockedBy(input: {
      issueId: "後に実装するIssueのnodeID"
      blockingIssueId: "先に実装するIssueのnodeID"
    }) {
      blockingIssue { number }
    }
  }
'
```

複数のブロッカーを一括設定する場合は alias を使う:
```bash
gh api graphql -f query="mutation {
  a1: addBlockedBy(input: {issueId: \"$BLOCKED\", blockingIssueId: \"$BLOCKER1\"}) { blockingIssue { number } }
  a2: addBlockedBy(input: {issueId: \"$BLOCKED\", blockingIssueId: \"$BLOCKER2\"}) { blockingIssue { number } }
}"
```

### ブロッカー解除

```bash
gh api graphql -f query='
  mutation {
    removeBlockedBy(input: {
      issueId: "ブロックされている側のnodeID"
      blockingIssueId: "ブロックしている側のnodeID"
    }) {
      clientMutationId
    }
  }
'
```

### Sub-issue 解除

```bash
echo '{"sub_issue_id": 子の数値id}' | gh api -X DELETE repos/OWNER/REPO/issues/親の番号/sub_issue --input -
```
