---
name: do
description: Issue から自律的に計画→実装→レビュー→PR作成の全ワークフローを実行する。「この Issue やって」「#XX 対応して」「実装して」「開発して」「このチケット片付けて」「ワークフロー開始」などの依頼時に使用する。
---

# 開発ワークフロー

$ARGUMENTS で指定された Issue から自律的に開発を進める。

IMPORTANT: メインコンテキストは実装コードを書かない。全作業を subagent またはスキルに委譲し、自身はオーケストレーション・サニティチェック・ユーザー報告に専念する。

## Phase 1: 準備

1. `gh issue view $ISSUE_NUMBER` で内容を確認
2. フィーチャーブランチを作成: `feat/issue-番号-短い説明`
3. **[reference/project-operations.md](reference/project-operations.md) を参照して Issue の Status を `In progress` に変更する**

## Phase 2: 計画

`planner` agent を起動し、Issue 内容を渡す。

**サニティチェック:** 責務分担違反がないか / ファイルパスが実在するか / 粒度が十分か / テスト計画がカバレッジ目標を満たせるか

問題があれば差し戻す。2回で解決しなければユーザーに報告。

## Phase 3a: テスト作成 (RED)

`implementer` agent を起動し、**テストのみ** を書かせる。「RED フェーズのみ実行」と明示する。

**サニティチェック:** テストが書かれているか / 全て失敗 (RED) か / プロダクションコードが含まれていないか

## Phase 3b: テストレビュー

`quality-reviewer` agent を起動し、テストコードをレビューする。

**観点:** 要件の網羅性 / エッジケース考慮 / 可読性・保守性 / アサーションの過不足

指摘があれば `implementer` agent に修正指示 (最大2回)。PASS 後 Phase 3c へ。

## Phase 3c: 実装 (GREEN → REFACTOR)

`implementer` agent を起動し、テストを通す最小実装 + リファクタを行う。

**サニティチェック:** ビルド通過 (`pnpm build` + `cargo clippy`) / テスト全通過 / サイレントフォールバックなし / 計画からの逸脱なし

## Phase 4: レビュー

`/review` スキルを発火する。4つの専門 agent (security / architecture / quality / performance) が並列起動される。

## Phase 5: 修正 & 再レビュー

**[reference/review-fix-loop.md](reference/review-fix-loop.md) を参照して修正→再レビューループを実行する。**

修正が一切なかった場合のみ再レビューをスキップして Phase 6 に進む。

## Phase 6: PR 作成 & 報告

IMPORTANT: PR 作成前に `/verify` スキルを発火して検証を通す。FAIL があれば修正してから再実行。

検証 PASS 後:
1. コミット & プッシュする
2. **[reference/pr-creation.md](reference/pr-creation.md) を参照して PR を作成する。ユーザー確認を待たずに自律的に作成すること。**
3. PR にレビューサマリーをコメントする
4. ユーザーに PR URL を報告する

## 異常時

**[reference/error-handling.md](reference/error-handling.md) を参照して対応する。**
