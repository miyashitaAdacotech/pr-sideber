# PR 作成 & 報告の手順

Phase 6 に到達したらこのファイルを参照する。

## 残存指摘の後続 Issue 確認ゲート

IMPORTANT: PR を作成する前に、以下を確認する。1つでも未達なら PR を作成しない。

- [ ] Phase 5 で「スコープ外」に分類した指摘は、**全て `/issue` スキルで Issue を作成済み**か？
- [ ] 3回目のレビュー後に残存した MEDIUM 指摘は、**全て `/issue` スキルで Issue を作成済み**か？
- [ ] 作成した Issue の番号を控えているか？（レビューサマリーで使う）

「後続 Issue で対応」と口で言っただけで Issue を作成していない場合、PR 作成に進んではならない。

## PR ボディ必須セクションチェック

IMPORTANT: PR を作成する前に、以下の全セクションが埋まっていることを確認する。1つでも欠けていたら PR を作成しない。

| セクション | 必須条件 |
|-----------|---------|
| `## 概要` | 1〜2文で変更内容を説明。空や placeholder は NG |
| `## 変更内容` | 具体的なファイル名と変更内容のリスト。`-` 1行だけは NG |
| `## 関連 Issue` | `closes #番号` でリンク。番号が入っていること |
| `## テスト` | 5項目のチェックリスト。実際に実行した項目のみ `[x]` にする |
| `## レビュー観点` | レビュアーに見てほしいポイントを具体的に記載。空は NG |

`## スクリーンショット` は UI 変更がない場合のみ省略可。

## PR 作成コマンド

`.github/pull_request_template.md` に準拠する。

```bash
gh pr create --title "feat: タイトル" --body "$(cat <<'EOF'
## 概要
(Issue の要約 + 何を実装したか — 具体的に書く)

## 変更内容
- `path/to/file`: 変更内容の説明
- `path/to/file`: 変更内容の説明

## 関連 Issue
- closes #番号

## テスト
- [x] TypeScript 型チェック通過 (`pnpm check`)
- [x] フロントエンドテスト通過 (`pnpm test`)
- [x] Rust lint 通過 (`cargo clippy --all-targets`)
- [x] Rust テスト通過 (`cargo test`)
- [x] `/verify` で検証ループ PASS

## スクリーンショット
(UI 変更がある場合のみ)

## レビュー観点
(レビュアーに特に見てほしいポイント — 具体的に書く)
EOF
)"
```

## Agent レビューサマリーをコメントに追記

```bash
gh pr comment $PR_NUMBER --body "$(cat <<'EOF'
## Agent レビューサマリー

| 観点 | 結果 | 指摘件数 |
|------|------|---------|
| Security | PASS/FAIL | X 件 |
| Architecture | PASS/FAIL | X 件 |
| Quality | PASS/FAIL | X 件 |
| Performance | PASS/FAIL | X 件 |

**Review iterations:** X 回
**残存指摘:** なし / あれば以下の形式で記載
- [SEVERITY/観点] 指摘内容 → **#Issue番号** で追跡
EOF
)"
```
