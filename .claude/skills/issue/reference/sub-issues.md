# Sub-issue（親子 Issue）API リファレンス

## 前提
- `gh issue create` には親子を指定するオプションはない。**リレーションは GitHub REST API で行う。**
- 親 Issue の本文にサブ Issue 一覧を書くだけでは公式な親子リンクにならない。サイドバーの Sub-issues 表示は API で紐付けたときだけ反映される。

## サブ issue の追加 (REST API)

```bash
# 子 issue の数値 ID を取得
CHILD_ID=$(gh api /repos/{owner}/{repo}/issues/$CHILD_NUMBER --jq .id)

# 親 issue にサブ issue として追加
gh api /repos/{owner}/{repo}/issues/$PARENT_NUMBER/sub_issues \
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

## Sub-issue 解除

```bash
echo '{"sub_issue_id": 子の数値id}' | gh api -X DELETE /repos/OWNER/REPO/issues/親の番号/sub_issue --input -
```

## 参照
- GitHub REST: [Sub-issues](https://docs.github.com/en/rest/issues/sub-issues) — `POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues`、body は `{"sub_issue_id": integer}`。
- `sub_issue_id` は同一リポジトリの Issue の **id**（`gh api .../issues/N --jq .id` で得られる数値）。Issue 番号（number）ではない。
