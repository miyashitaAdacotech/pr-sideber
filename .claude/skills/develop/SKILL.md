---
name: do
description: Issue から自律的に計画→実装→レビュー→PR作成の全ワークフローを実行する。「この Issue やって」「#XX 対応して」「実装して」「開発して」「このチケット片付けて」「ワークフロー開始」などの依頼時に使用する。
---

# 開発ワークフロー

$ARGUMENTS で指定された Issue から自律的に開発を進める。

IMPORTANT: メインコンテキストは実装コードを書かない。全作業を subagent またはスキルに委譲し、自身はオーケストレーション・サニティチェック・ユーザー報告に専念する。

## Phase 1: 準備

```bash
gh issue view $ISSUE_NUMBER
```

- フィーチャーブランチを作成: `feat/issue-番号-短い説明`

## Phase 2: 計画

`planner` agent を起動し、Issue 内容を渡す。

**サニティチェック:**
- 責務分担 (TS/Rust/Svelte) に違反していないか
- ファイルパスが実在するか
- 計画の粒度が十分か (「全体を書き換える」は NG)
- テスト計画がカバレッジ目標を満たせるか

問題があれば差し戻す。2回で解決しなければユーザーに報告。

## Phase 3: 実装

IMPORTANT: `/tdd` スキルを発火して実装する。planner の計画を引数として渡す。
`/tdd` スキルが TDD サイクル (RED→GREEN→REFACTOR) を遵守した実装を行う。

**サニティチェック:**
- テストが書かれているか (TDD 遵守)
- サイレントフォールバックがないか
- 計画からの逸脱がないか

## Phase 4: レビュー

IMPORTANT: `/review` スキルを発火する。
`/review` スキルが4つの専門 agent (security / architecture / quality / performance) を並列起動して統合レビューを返す。

## Phase 5: 修正 & 再レビュー

IMPORTANT: レビュー指摘に基づいてコードを修正した場合、修正の規模・重要度にかかわらず必ず再レビューを通す。「MEDIUM だから再レビュー不要」という自己判断は NG。

1. レビュー指摘を分類する:
   - **修正する**: `implementer` agent にレビュー結果を渡して修正させる
   - **スコープ外**: その場で `gh issue create` して Issue 番号を記録する。口だけで「別 Issue で」と言って作らないのは NG
   - **対応不要** (誤検出・意図的な設計): 理由を明記してスキップ
2. 修正があった場合、再度 `/review` スキルを発火して再レビュー
3. **修正→再レビューのループは最大3回。未解決ならユーザーに報告**
4. 修正が一切なかった場合のみ再レビューをスキップして Phase 6 に進む

## Phase 6: PR 作成 & 報告

IMPORTANT: PR 作成前に `/verify` スキルを発火して6フェーズ検証を通す。FAIL があれば修正してから再実行。

検証 PASS 後:
1. コミット & プッシュする
2. **[reference/pr-creation.md](reference/pr-creation.md) を参照して PR を作成する。ユーザー確認を待たずに自律的に作成すること。**
3. PR にレビューサマリーをコメントする
4. ユーザーに PR URL を報告する

## 異常時

**[reference/error-handling.md](reference/error-handling.md) を参照して対応する。**
