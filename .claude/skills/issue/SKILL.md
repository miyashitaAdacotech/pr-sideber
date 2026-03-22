---
name: issue
description: GitHub Issue をテンプレートに準拠して作成する。サブ issue 分割、blocker リレーション設定にも対応する。「issue作って」「タスク分割して」「チケット切って」「サブissue作って」「ブロッカー設定して」「これチケットにして」「課題管理」などの依頼時に使用する。
---

# GitHub Issue 作成

$ARGUMENTS の内容から GitHub Issue を作成する。

## Step 1: Issue の種別判定
- Feature Request (新機能) → `.github/ISSUE_TEMPLATE/feature.yml` に準拠
- Bug Report (バグ) → `.github/ISSUE_TEMPLATE/bug.yml` に準拠
- Task (技術タスク) → `.github/ISSUE_TEMPLATE/task.yml` に準拠

## Step 2: Issue 作成

**[reference/commands.md](reference/commands.md) を参照して `gh issue create` を実行する。**

テンプレートの必須フィールドを漏れなく埋める。

## Step 3: 優先度ラベル付与

IMPORTANT: Issue 作成後、必ず優先度ラベルを1つ付与する。ラベルなしで完了としない。

ユーザーに優先度を確認し、以下のいずれかを `gh issue edit <番号> --add-label "<ラベル>"` で付与する:

| ラベル | 判断基準 |
|--------|----------|
| `must-have` | MVP に必須の機能 |
| `high-impact` | やると今後の生産性が大きく向上する |
| `tech-risk` | 放置すると機能拡張時に壊れるリスクが高い |
| `should-do-soon` | リスクあり、早めに対応が望ましい |
| `nice-to-have` | 余裕があれば対応 |

## Step 4: リレーション設定

IMPORTANT: リレーションは本文に書かない。GitHub API でシステム的に設定する。

- サブ issue → **[reference/sub-issues.md](reference/sub-issues.md)** を参照
- ブロッカー → **[reference/blockers.md](reference/blockers.md)** を参照

## Step 5: 確認
作成した issue の URL、付与したラベル、リレーション設定結果を報告する。
