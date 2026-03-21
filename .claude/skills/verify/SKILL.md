---
name: verify
description: 3フェーズ検証 (テスト→セキュリティ→diff) を実行してPR提出可否を判定する。「PR出していい？」「マージして大丈夫？」「品質チェック」「CI通る？」「検証して」「verify」「リリース前確認」などの依頼時に使用する。
---

# 検証ループ

以下を順番に実行し、各フェーズの PASS/FAIL を報告する。

NOTE: ビルド・型チェック・lint (fmt, clippy, machete, audit, biome, eslint, svelte-check) は hooks が exit 2 でブロックするため `/verify` では実行しない。hooks を通過したコードはこれらが保証済み。

## 3フェーズ

1. **テスト**: `pnpm test` + `cd rust-core && cargo test --workspace` (カバレッジ 80%+)
2. **セキュリティ**: `ghp_`, `gho_`, `client_secret`, `access_token` の grep + `eval()` / `innerHTML` の使用チェック
3. **Diff**: `console.log` 残留、コメントアウトブロック、WASM 境界の破壊的変更

## 出力

```
✓/✗ Tests | Security | Diff
Status: READY FOR PR / NOT READY (理由)
```
