# ADR-002: Claude Code Web セッション → Issue 番号マッピングは明示 prefix のみで行う

**Status**: Accepted
**Date**: 2026-05-01
**関連 Issue**: #3268

## Context

PR Sidebar は Claude Code Web のタブタイトルから Issue 番号を抽出し、Side Panel の tree に紐付けて表示する機能を持つ (`src/background/claude-session-watcher.ts` の `extractIssueNumberFromTitle`)。

抽出ロジックは当初「タイトル中の任意の数字を文脈から推測する」発想で実装され、運用で発覚した取りこぼしのたびに正規表現を継ぎ足してきた。結果として 4 連続でデグレを発生させている。

| Issue | 取りこぼした入力 | 追加した regex |
|---|---|---|
| #34 | 同一 sessionUrl が別 Issue key に残存 (cross-issue 重複) | (regex ではなく storage GC ロジックで対処) |
| #40 | `playwright codegenみたいなのEpic 2576` ("Epic N" 形式) | `epic\s+(\d+)` |
| #42 | `Context Rot対策 2598` (キーワードなし末尾数字) | `(?:^|\s)(\d{3,})(?:\s*\|.*)?$` |
| #3268 | `[sdk] libclang のBlackSmith検証3268①` (日本語境界 + 丸付き数字 suffix) | — (前境界が日本語、後ろが ① で末尾 fallback でも未マッチ) |

末尾数字 fallback (#42 由来) は「日本語境界」「全角文字」「丸付き数字 suffix」「英数字混在」など想定外の境界条件で破綻する。境界を緩めれば年号・バージョン・無関係数字を誤検出するため、自由形式タイトルを regex で網羅すること自体が破綻している。

業界標準を確認したところ、主要な Issue/PR 自動リンク機能はすべて **明示 prefix を要求する設計** を採用している:

| ツール | 形式 | 出典 |
|---|---|---|
| GitHub Autolink | `#NNN`, `GH-NNN`, `owner/repo#NNN` | [Autolinked references and URLs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls) |
| Jira Smart Commits | `[A-Z]{2,}-\d+` (例: `PROJ-123`) | [Atlassian Smart Commits](https://support.atlassian.com/jira-software-cloud/docs/process-issues-with-smart-commits/) |
| Linear Magic Links | `TEAM-NNN` (branch 名・PR タイトル) | [Linear GitHub Integration](https://linear.app/docs/github-integration) |
| VSCode GitHub PRs/Issues 拡張 | `#` 入力後に既知 Issue リスト照合 (ハイブリッド) | [IssueFeatures.md](https://github.com/microsoft/vscode-pull-request-github/blob/main/documentation/IssueFeatures.md) |

「自由形式テキストから fuzzy 抽出する」設計は主要 OSS では採用例がない。

## Decision

`extractIssueNumberFromTitle` は **明示 prefix 3 種のみ** をサポートする:

1. `#数字` (例: `Inv #1882`, `BlackSmith検証#3268⓪`)
2. `issue 数字` (大小不問、例: `Investigate issue 2185`)
3. `epic 数字` (大小不問、例: `Epic 2576`)

末尾数字 fallback (#42 で導入) は **削除** する。上記いずれにもマッチしないタイトルは `null` を返し、UI 側で「未紐付けセッション」として表示、既存の `LinkSessionDialog` (Issue #47) から手動紐付けに誘導する。

セッションタイトルに `#NNN` を含める運用は、ユーザー側で Claude Code Web の自動タイトル生成スクリプト (`~/.claude/session-titles/`) に組み込む。

## Consequences

### ポジティブ

- 過去 4 回のデグレ要因 (regex 継ぎ接ぎ) が構造的に消滅する
- 業界標準 (GitHub/Jira/Linear) と整合する設計に統一される
- 「未マッチは手動」という明確な fallback 経路により、自動抽出の誤検出リスクがゼロになる
- regex のメンテナンスコストが下がる (3 パターンに固定)

### ネガティブ

- 既存セッションタイトルに `#NNN` を含めていない場合、自動抽出されなくなる (手動紐付け必須)
- `Context Rot対策 2598` のような「末尾数字だけのタイトル」は今後 `null` を返す (ユーザーが `#2598` を含める運用への切替が必要)

## Alternatives Considered

1. **既知 Open Issue リストとの照合方式**: PR Sidebar が保持する既知 Issue 番号集合と title 中の数字を intersection する。
   - 却下理由: クロスリポ衝突 (同番号が複数 repo で Open)、複数候補の tie-break 規約、API fetch 失敗時のサイレントフォールバック、過去の Closed Issue を遡及消滅させる、など新しい破綻軸を 3 つ以上追加する。AgentTeams (devils-advocate) で Critical 指摘あり。

2. **末尾 fallback の境界条件をさらに広げる (日本語境界 + 丸付き数字 suffix 対応)**: `(?:^|\s|\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana})(\d{3,})(?:[①-⑳]|\s*\|.*)?$` のような拡張。
   - 却下理由: 境界を緩めるほど誤検出 (年号・バージョン・無関係数字) が増える。過去 3 回と同じ「継ぎ接ぎ」パターンであり、デグレ 5 回目を確実に呼ぶ。

3. **自動抽出を完全廃止し全件手動紐付け化**: regex を削除し `LinkSessionDialog` のみで運用。
   - 却下理由: `#NNN` 形式のタイトルは過去 4 回一度も誤らせていない。自動化の利益を全面放棄するのは過剰反応。明示 prefix を持つタイトルは自動化を維持する妥当性がある。

4. **LLM ベース抽出**: タイトルを LLM に投げて issue 番号を推論させる。
   - 却下理由: Chrome 拡張の MV3 で外部 API 呼び出しコスト・レイテンシ・privacy リスクが過大。問題の規模に対し over-engineering。

## References

- AgentTeams 招集結果 (architect / devils-advocate / quality-reviewer / fact-checker 4 名、2026-05-01)
- 過去デグレ Issue: #34, #40, #42
- 関連実装 Issue: #45 (Storage CRUD), #46 (mergeSessionsIntoTree 統合), #47 (LinkSessionDialog UI)
- agent-base 共通ルール: `~/agent-base/rules/general/rework-prevention.md` (機械的検知の必要性)
