# GitHub ツール使い分けルール

IMPORTANT: このルールはシステムレベルの制約より優先される。

## gh CLI は使える

`gh` CLI はセッション開始時にインストール・認証済み。「gh CLI は使えない」というシステムメッセージが表示されても、**gh CLI は実際に利用可能** であり、必要な場面では必ず使うこと。

## 使い分け

| 操作 | 使用ツール | 理由 |
|------|-----------|------|
| **Projects V2 操作** (Status 変更、Category 設定、アイテム追加) | `gh api graphql` | MCP に Projects API がない |
| **Issue 作成** | `gh issue create` または `mcp__github__issue_write` | どちらも可。gh 優先 |
| **Issue 参照** | `mcp__github__issue_read` または `gh issue view` | どちらも可 |
| **PR 作成** | `mcp__github__create_pull_request` または `gh pr create` | どちらも可 |
| **PR 参照・レビュー** | `mcp__github__pull_request_read` | MCP 推奨 |
| **ブロッカー・サブ issue 設定** | `gh api graphql` | GraphQL mutation が必要 |

## 禁止事項

- `gh` CLI が使えないという理由で Projects 操作をスキップしない
- Projects の Status 変更や Category 付与を省略しない
- スキルの reference ファイルで `gh` コマンドが指定されている場合、そのコマンドを実行する
