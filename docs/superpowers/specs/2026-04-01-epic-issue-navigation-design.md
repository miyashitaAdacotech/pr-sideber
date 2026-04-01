# PR Sidebar 拡張: Epic/Issue/Claude Code Web ナビゲーション

## 概要

PR Sidebar Chrome 拡張を、PR 専用ツールから **Epic → Issue → PR / Claude Code Web セッション** の統合ナビゲーションハブに拡張する。垂直タブの代替として機能し、開発ワークフロー全体を一つのサイドパネルで管理できるようにする。

## 背景・動機

現状の PR Sidebar は PR 表示のみ。ユーザーは以下を手動で管理している:
- Issue の確認は GitHub Web で都度アクセス
- Claude Code Web セッションはタブタイトルの目視で Issue と紐づけ
- Chrome の垂直タブで PR / Issue / Claude Code Web を手動配置

これを自動化し、サイドパネル内で完結させる。

## 要件

### 要件①: Issue 表示
- 自分に Assignee されている open Issue を表示する
- GraphQL API で取得（`assignee:@me is:issue is:open`）

### 要件②: Claude Code Web セッション表示
- Chrome タブから `claude.ai/code/*` の URL を検出する
- タブタイトルから Issue 番号を正規表現で抽出し紐づける
  - 例: `Inv #1882 [#1613] CI/CD App統一` → Issue #1882, Epic #1613
  - 例: `Investigate issue 2185` → Issue #2185
- 検出したセッションを `chrome.storage.local` に永続化する
- Issue が CLOSE になったら対応するセッション履歴を削除する

### 要件③: Epic グルーピング
- Epic（親 Issue）でグルーピングしたツリー表示を行う
- 自分が Assignee の Issue を1件でも含む Epic を表示する
- ツリー構造: Epic → Issue → PR / Claude Code Web セッション
- インデント上限は3階層。4階層目以降はインデントを増やさず `↳` ラベルで深さを表示する
- Epic に属さない Issue/PR は「Epic なし」グループにまとめる

### 要件④: ナビゲーション（垂直タブの代替）
- 各項目のクリックで既存タブにフォーカス。該当タブがなければ新規タブで開く
- これにより垂直タブをオフにしてもサイドパネルだけで作業できるようになる

## アーキテクチャ

既存の責務分担を維持する。

### データ取得層（TypeScript）
- **GitHub GraphQL API**
  - PR 取得（既存）: `search(author/review-requested)`
  - Issue 取得（新規）: `search(assignee:@me is:issue is:open)`
  - Sub-issue 取得（新規）: `node { parent, subIssues }` で親子関係
- **Chrome tabs API**（新規）
  - `tabs.onUpdated` で `claude.ai/code/*` タブを監視
  - タイトルから Issue 番号を正規表現抽出
- **chrome.storage.local**（新規）
  - Claude Code Web セッション履歴の永続化
  - 形式: `{ issueNumber → [{ sessionUrl, title, detectedAt }] }`

### データ整形層（Rust/WASM）
- `processPullRequests()`（既存）: Review Requests 用に継続利用
- `processIssues()`（新規 Phase 1）: Issue JSON → IssueItemDto 変換
- `processEpicTree()`（新規 Phase 2）: PR + Issue + 親子関係 → EpicTreeDto
  - Epic でグルーピング
  - Assignee フィルタリング
  - ツリー構造構築（インデント上限3）

### 表示層（Svelte）
- `EpicSection.svelte`（新規）: ツリーの再帰的レンダリング、折りたたみ/展開
- `IssueItem.svelte`（新規）: Issue 個別表示
- `SessionItem.svelte`（新規）: Claude Code Web セッション表示
- `PrSection.svelte`（既存）: Review Requests セクション用に継続利用

### 永続化層（chrome.storage）
- Claude Code Web セッション履歴
- Issue CLOSE 時にクリーンアップ

## 新規 GraphQL クエリ

```graphql
query {
  issues: search(
    query: "assignee:@me is:issue is:open"
    type: ISSUE, first: 50
  ) {
    nodes { ... on Issue {
      id number title url state
      labels(first: 10) { nodes { name color } }
      parent { id number title }
      subIssues(first: 50) {
        nodes {
          id number title state
          assignees(first: 5) { nodes { login } }
        }
      }
    }}
  }
}
```

## UI 構造（最終形）

```
▼ 📁 CI/CDインフラ改善 #1613              ← Epic
  ▼ 📋 CI/CD App統一 #1882                ← Issue
    🔀 マージコンフリクト修正 #2221        ← PR (+ badges)
    🤖 Inv #1882 CI/CD App統一...          ← Claude Code Web セッション
  ▶ 📋 DependabotCargo #1721               ← Issue (折りたたみ)
▼ 📁 E2Eテスト戦略 #1671                   ← Epic
  ▼ 📋 E2E影響判定スクリプト #2065
    🔀 E2E影響判定スクリプト追加 #2065
▼ 📁 Epic なし                             ← Epic に属さないもの
  📋 スモークテスト・VRT #2250
    🔀 docs: スモークテスト・VRT #2250
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▼ 👀 Review Requests (0)                   ← 独立セクション（既存維持）
```

## 実装フェーズ

### Phase 1: Issue 取得 + フラット表示

**スコープ:**
- TS: GitHub GraphQL に Issue 検索クエリ追加
- Rust/WASM: `processIssues()` 関数追加（JSON → IssueItemDto 変換）
- Svelte: IssueSection.svelte + IssueItem.svelte 追加
- 型定義: IssueItemDto（number, title, url, state, labels, assignees）

**成果物:** 既存の My PRs / Review Requests に加えて My Issues セクションが表示される。

### Phase 2: Epic グルーピング + ツリー構造化

**スコープ:**
- TS: GraphQL クエリに parent / subIssues フィールド追加
- Rust/WASM: `processEpicTree()` — PR + Issue + 親子関係 → EpicTreeDto 生成
- Svelte: EpicSection.svelte（再帰ツリー）で My PRs + My Issues を統合表示に置き換え
- ナビゲーション: クリック → 既存タブフォーカス or 新規タブ

**成果物:** Epic → Issue → PR のツリー表示。My PRs / My Issues セクションは Epic ツリーに統合される（破壊的変更）。Review Requests は独立セクションとして維持。

### Phase 3: Claude Code Web 検出 + セッション表示

**スコープ:**
- manifest.json: host_permissions に `claude.ai/*` 追加
- TS (background): tabs.onUpdated でタブ監視 → タイトルから Issue 番号を正規表現抽出
- TS (background): chrome.storage.local にセッション履歴を永続化
- TS (background): Issue CLOSE 検知時にセッション履歴クリーンアップ
- Svelte: ツリー内に 🤖 セッションリンクを表示

**成果物:** ツリー内の Issue の下に Claude Code Web セッションリンクが表示される。

## エラーハンドリング

| ケース | 対処 |
|--------|------|
| API エラー（Issue/Sub-issue 取得失敗） | 既存 PR と同じリトライ戦略（最大3回、レート制限対応）。失敗時は該当セクションに「取得失敗」表示。他セクションは正常表示を維持。 |
| Sub-issue API 未対応リポジトリ | parent/subIssues が null の場合「Epic なし」グループにフォールバック。 |
| Claude Code Web タブ検出失敗 | タイトルから Issue 番号が取れない場合はスキップ。セッション表示がなくても他機能に影響なし。 |

## テスト方針

### Rust/WASM（TDD）
- `processIssues()` — Issue JSON → IssueItemDto 変換
- `processEpicTree()` — ツリー構築、インデント上限、フィルタリング
- Epic なしグループへのフォールバック
- 深いネスト（4-5階層）のインデント上限テスト

### TypeScript（Vitest）
- GraphQL クエリのレスポンスパース
- タブ監視: Issue 番号の正規表現抽出
- セッション履歴の CRUD + CLOSE 時クリーンアップ
- ナビゲーション: 既存タブフォーカス判定ロジック

### Svelte（コンポーネント）
- EpicSection / IssueItem の表示テスト
- ツリーの折りたたみ/展開
- 空状態の表示

## 受け入れ条件（AC）

### Phase 1
- [ ] サイドパネルに「My Issues」セクションが表示される
- [ ] 自分に Assignee されている open Issue のみ表示される
- [ ] Issue のタイトル、番号、ラベルが表示される
- [ ] Issue をクリックすると GitHub の Issue ページが開く
- [ ] Issue 取得失敗時にエラー表示が出て、PR 表示に影響しない
- [ ] `processIssues()` の Rust ユニットテストが通る
- [ ] TypeScript / Svelte のテストが通る

### Phase 2
- [ ] Epic（親 Issue）ごとにグルーピングされたツリー表示になる
- [ ] ツリーは Epic → Issue → PR の3階層で表示される
- [ ] 自分が Assignee の Issue を1件でも含む Epic のみ表示される
- [ ] Epic に属さない Issue/PR は「Epic なし」グループに表示される
- [ ] 4階層以上のネストはインデント上限3で `↳` 表示にフォールバックする
- [ ] ツリーの各ノードが折りたたみ/展開できる
- [ ] 項目クリックで既存タブにフォーカスする。タブがなければ新規タブで開く
- [ ] Review Requests セクションは独立して存在する
- [ ] Sub-issue API 未対応リポジトリでもフラット表示にフォールバックする
- [ ] `processEpicTree()` の Rust ユニットテストが通る

### Phase 3
- [ ] Claude Code Web のタブが検出され、Issue に紐づいて表示される
- [ ] タブタイトルから Issue 番号が正規表現で正しく抽出される
- [ ] 検出したセッションが chrome.storage.local に永続化される
- [ ] タブを閉じても過去のセッションが表示される
- [ ] Issue が CLOSE になったら対応するセッション履歴が削除される
- [ ] claude.ai のタブがない場合でも他の機能に影響しない
- [ ] タイトルから Issue 番号が抽出できないセッションはスキップされる
- [ ] manifest.json に `claude.ai/*` の host_permissions が追加されている

### 全フェーズ共通
- [ ] 既存の hooks（Biome, ESLint, svelte-check, cargo clippy）が全て通る
- [ ] 既存のテストが壊れていない
- [ ] セキュリティ: token が URL パラメータに含まれない、シークレットがソースコードにない
