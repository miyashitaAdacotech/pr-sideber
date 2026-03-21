# PR Sidebar - Chrome Extension

GitHub PR 専用サイドパネル Chrome 拡張。個人プロジェクト。
詳細な要件は @.memo/initial.md を参照。

## 技術スタック

- **Frontend**: TypeScript + Svelte 5 + Vite
- **Chrome Extension**: Manifest V3, Side Panel API
- **ビルド**: @crxjs/vite-plugin
- **ドメインロジック**: Rust → wasm-pack → WASM
- **API**: GitHub GraphQL API
- **認証**: GitHub OAuth App (PAT は使わない)

## ビルド・開発コマンド

```bash
pnpm install && pnpm dev        # フロントエンド開発
pnpm build                     # プロダクションビルド
pnpm check                     # Svelte 型チェック
pnpm test                          # フロントエンドテスト
cd rust-core && cargo fmt && cargo clippy --all-targets  # Rust lint
cd rust-core && cargo test        # Rust テスト
cd rust-core/crates/adapter-wasm && wasm-pack build --target web  # WASM ビルド
```

## アーキテクチャ

### ディレクトリ構成

- `src/sidepanel/` - Side Panel UI (Svelte)
- `src/background/` - Service Worker
- `src/shared/` - 共有型定義、GitHub API クライアント
- `src/wasm/` - WASM バインディング
- `rust-core/` - Rust ドメインロジック (Cargo workspace)
  - `crates/domain/` - ドメインモデル (依存なし)
  - `crates/usecase/` - ユースケース (domain に依存)
  - `crates/adapter-wasm/` - WASM アダプタ (usecase, domain に依存)

### 責務分担 (IMPORTANT: この境界を守ること)

- **TypeScript**: Chrome 拡張 API、OAuth フロー、API 呼び出し
- **Rust/WASM**: データ整形、状態判定、ソート、DTO 生成
- **Svelte**: UI 表示のみ。ロジックを持たない

詳細は `.claude/rules/typescript.md`, `.claude/rules/rust.md` を参照。

## ハーネス構成

### Skills (`.claude/skills/`)
- `/do` — Issue → 計画 → 実装 → レビュー → PR の全自動ワークフロー
- `/tdd` — TDD 駆動開発
- `/review` — 4観点一括レビュー
- `/verify` — 6フェーズ検証ループ
- `/sec` — 10ポイントセキュリティ監査
- `/clean` — デッドコード除去
- `/research` — ディープリサーチ
- `/adr` — Architecture Decision Record 作成
- `/issue` — GitHub Issue 作成 (サブ issue・blocker リレーション対応)

### Agent (`.claude/agents/`)
NOTE: subagent から subagent は呼べない。並列起動はスキル (主会話) が行う。
- `planner` (Opus) — Issue から実装計画を作成
- `implementer` (Opus) — 計画に基づいて TDD で実装
- `code-reviewer` (Opus) — 設計・ロジック観点の総合レビュー (単体利用)
- `security-reviewer` (Sonnet) — 網羅性重視の高速セキュリティ監査
- `architecture-reviewer` (Sonnet) — レイヤー境界チェック
- `quality-reviewer` (Opus) — ロジック品質 (lint 除外)
- `performance-reviewer` (Opus) — パフォーマンス
- `refactor-cleaner` (Sonnet) — デッドコード除去

### ルール (`.claude/rules/`)
- `typescript.md` — TS/Svelte ルール (パス制限: `src/**`)
- `rust.md` — Rust/WASM ルール (パス制限: `rust-core/**`)
- `security.md` — セキュリティルール
- `coding-standards.md` — 不変性、命名規則、構造
- `testing.md` — TDD 採用、テスト方針
- `git-workflow.md` — GitHub Flow、Conventional Commits
- `github-templates.md` — Issue/PR はテンプレート準拠必須
- `communication.md` — テンション上げろ！！！
- `workflow.md` — 開発ワークフロー定義 (計画→実装→レビュー→修正→PR)
- `agent-output-quality.md` — サイレントフォールバック禁止、設計棄損禁止、コメント品質

### Hooks (`.claude/hooks/`)
- 編集時: TS/Svelte → Prettier + ESLint、Rust → cargo fmt + clippy
- コマンド実行時: シークレット漏洩検出でブロック

### lint vs agent の境界
- lint / fmt / clippy で検出できるもの → hook の責務。agent は言及しない
- 設計判断・ロジック正確性・セキュリティリスク → agent の責務

## リファレンス

- Skills ベストプラクティス: https://platform.claude.com/docs/ja/agents-and-tools/agent-skills/best-practices
- Skills 作成ガイド: https://platform.claude.com/docs/ja/agents-and-tools/agent-skills/creating-skills
- Claude Code Sub-agents: https://code.claude.com/docs/en/sub-agents
- Claude Code Memory: https://code.claude.com/docs/en/memory
- ハーネスエンジニアリング参考: https://github.com/affaan-m/everything-claude-code
