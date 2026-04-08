---
name: issue
description: GitHub Issue をテンプレートに準拠して作成する。サブ issue 分割、blocker リレーション設定にも対応する。「issue作って」「タスク分割して」「チケット切って」「サブissue作って」「ブロッカー設定して」「これチケットにして」「課題管理」などの依頼時に使用する。
---

# GitHub Issue 作成

$ARGUMENTS の内容から GitHub Issue を作成する。

## Step 0: 再現確認・現状把握 (IMPORTANT)

IMPORTANT: ユーザーの発言だけで Issue 本文を盛らない。必ず事実を確認してから起票する。推測・想像で書いた文章は Issue に書かない。

### Bug Report の場合 (必須)

1. **画面の現状を確認する**: ユーザーにスクリーンショットを依頼するか、既に提供されていれば精読する
2. **関連コードを読む**: 該当機能の実装ファイルを特定して読み、ロジックを把握する
3. **デグレ疑いがあれば `git log` / 関連 PR を調査**: 「以前直したはず」の場合は過去 PR と diff を確認
4. **ユーザー発言 vs 実際の挙動のズレ**: 発言と画面が食い違う場合は、確認せずに発言を優先しない。ユーザーに確認する

以下のいずれかが欠けていたら、Step 1 に進まずユーザーに質問する:
- 現状の画面 (スクショ or 文字による明確な記述)
- 期待される動作
- 再現手順の最低限のステップ

### Feature Request / Task の場合

- 既存のコード構造・関連ファイルを読んで実現可能性を確認する
- 曖昧な要件のまま起票しない。不明点はユーザーに質問する

### 禁止事項

- ユーザー発言の言い換え・膨らましだけで本文を書く
- 画面もコードも見ずに「実際の動作」「技術メモ」を埋める
- 類似 Issue チェック (Step 1) を先にやってこのステップを省略する

## Step 1: 類似 Issue チェック

IMPORTANT: 新規作成の前に、必ず既存 Issue との重複を確認する。確認せずに起票しない。

```bash
gh issue list --state open --limit 50 --json number,title,body,labels
```

タイトル・本文を読み、これから作ろうとしている Issue と **目的や対象が実質同じもの** がないか確認する。

- **類似 Issue が見つかった場合**: ユーザーに類似 Issue の番号・タイトルを提示し、以下のどちらかを選択してもらう:
  1. **起票をやめる** — 既存 Issue で十分カバーされている場合
  2. **既存 Issue の本文を更新する** — 新しい観点や要件を `gh issue edit <番号> --body "..."` で追記する。この場合 Step 2 以降はスキップし、Step 5 で更新結果を報告する
- **類似 Issue がない場合**: Step 2 に進む

## Step 2: Issue の種別判定
- Feature Request (新機能) → `.github/ISSUE_TEMPLATE/feature.yml` に準拠
- Bug Report (バグ) → `.github/ISSUE_TEMPLATE/bug.yml` に準拠
- Task (技術タスク) → `.github/ISSUE_TEMPLATE/task.yml` に準拠

## Step 3: Issue 作成

**[reference/commands.md](reference/commands.md) を参照して `gh issue create` を実行する。**

テンプレートの必須フィールドを漏れなく埋める。

## Step 4: Project Category 付与

IMPORTANT: Issue 作成後、必ず Project に追加して Category を1つ設定する。Category なしで完了としない。

ユーザーに Category を確認し、以下の手順で設定する:

| Category | 判断基準 |
|----------|----------|
| `Feature` | 機能追加・UX 改良。些末なものは Nice-to-Have |
| `Tech-Risk` | 他の機能開発をブロックしうる技術負債の解消 |
| `UX-Risk` | バグ・重度なセキュリティ問題等ユーザーに迷惑をかける問題 |
| `Agent-Harness` | Skills・Agents・Rules・Hooks などハーネス基盤の整備 |
| `Refactor` | Tech-Risk より軽症な技術負債の解消。いつでも良い |
| `Nice-to-Have` | 軽微な改善・些末な Feature。いつでも良い |

**[reference/commands.md](reference/commands.md) の「Project Category 付与」セクションを参照してコマンドを実行する。**

## Step 5: リレーション設定

IMPORTANT: リレーションは本文に書かない。GitHub API でシステム的に設定する。

- サブ issue → **[reference/sub-issues.md](reference/sub-issues.md)** を参照
- ブロッカー → **[reference/blockers.md](reference/blockers.md)** を参照

## Step 6: 確認
作成した issue の URL、付与したラベル、リレーション設定結果を報告する。
