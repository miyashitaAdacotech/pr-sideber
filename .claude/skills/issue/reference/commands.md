# Issue 作成コマンド

Issue 作成時にこのファイルを参照する。

## Issue 作成

```bash
gh issue create --title "タイトル" --body "$(cat <<'EOF'
## 概要
...
## 受け入れ条件
- [ ] ...
EOF
)" --label "enhancement"
```

ラベルは種別に応じて変更:
- Feature → `enhancement`
- Bug → `bug`
- Task → `task`

## 優先度ラベル付与

Issue 作成後、必ず優先度ラベルを1つ付与する:

```bash
gh issue edit <番号> --add-label "<優先度ラベル>"
```

| ラベル | 判断基準 |
|--------|----------|
| `must-have` | MVP に必須の機能 |
| `high-impact` | やると今後の生産性が大きく向上する |
| `tech-risk` | 放置すると機能拡張時に壊れるリスクが高い |
| `should-do-soon` | リスクあり、早めに対応が望ましい |
| `nice-to-have` | 余裕があれば対応 |
