---
name: sec
description: Chrome Extension + OAuth 特有の脆弱性を10ポイントフレームワークで監査する。「セキュリティ大丈夫？」「脆弱性ない？」「OAuth安全？」「token漏れてない？」「manifest確認」「権限チェック」「XSS大丈夫？」などの依頼時に使用する。
---

# セキュリティ監査

$ARGUMENTS の範囲 (未指定ならプロジェクト全体) を `security-reviewer` agent で監査する。

## 10 ポイントチェックリスト

1. **シークレット管理** — ハードコードされた token / secret
2. **入力バリデーション** — ユーザー入力のサニタイズ
3. **認証フロー** — OAuth Device Flow の正しい実装 (PKCE/state は Device Flow では不要 — ADR-001)
4. **XSS 防止** — `@html`, `innerHTML`, `eval()` の不使用
5. **CSRF 防止** — origin 検証、sender.id チェック (Device Flow のため state パラメータは不要 — ADR-001)
6. **レート制限** — GitHub API 429 対応、バックオフ戦略
7. **データ漏洩** — console.log に機密情報がないか
8. **依存脆弱性** — `pnpm audit`, `cargo audit`
9. **Chrome Extension 権限** — manifest の permissions が最小限か
10. **WASM 境界** — シークレットが Rust 側に渡されていないか

## 自動検出コマンド

```bash
grep -rn "ghp_\|gho_\|client_secret\|access_token" src/ rust-core/ --include="*.ts" --include="*.rs" --include="*.svelte" || echo "OK"
pnpm audit 2>/dev/null || echo "SKIP"
cd rust-core && cargo audit 2>/dev/null || echo "SKIP"
```
