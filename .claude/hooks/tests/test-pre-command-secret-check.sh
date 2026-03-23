#!/bin/bash
# pre-command-secret-check.sh のテスト
# RED フェーズ: 新規パターンは FAIL することを期待

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$SCRIPT_DIR/../pre-command-secret-check.sh"

# 前提条件チェック
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq が見つかりません。インストールしてください。" >&2
  exit 1
fi

if [ ! -f "$TARGET" ]; then
  echo "ERROR: テスト対象スクリプトが見つかりません: $TARGET" >&2
  exit 1
fi

PASS_COUNT=0
FAIL_COUNT=0
ERRORS=()

# --- ヘルパー関数 ---

run_check() {
  local command_string="$1"
  local json
  json=$(jq -n --arg cmd "$command_string" '{"tool_input": {"command": $cmd}}')
  echo "$json" | bash "$TARGET" >/dev/null 2>&1
  return $?
}

assert_blocked() {
  local test_name="$1"
  local command_string="$2"
  run_check "$command_string"
  local exit_code=$?
  if [ "$exit_code" -eq 2 ]; then
    echo "  PASS: $test_name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL: $test_name (expected exit 2, got exit $exit_code)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    ERRORS+=("FAIL: $test_name")
  fi
}

assert_allowed() {
  local test_name="$1"
  local command_string="$2"
  run_check "$command_string"
  local exit_code=$?
  if [ "$exit_code" -eq 0 ]; then
    echo "  PASS: $test_name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL: $test_name (expected exit 0, got exit $exit_code)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    ERRORS+=("FAIL: $test_name")
  fi
}

# --- 既存パターンの回帰テスト (PASS するはず) ---

echo "=== 既存パターンの回帰テスト ==="
assert_blocked "01: client_secret を検出" \
  'echo $client_secret'

assert_blocked "02: access_token を検出" \
  'curl -H "token: access_token_xxx"'

assert_blocked "03: ghp_ プレフィックスを検出" \
  'echo ghp_abc123'

assert_blocked "04: GITHUB_TOKEN を検出" \
  'echo $GITHUB_TOKEN'

# --- Issue #33 の新規パターン (FAIL するはず = RED) ---

echo ""
echo "=== Issue #33: 新規パターン ==="
assert_blocked "05: GH_CLIENT_SECRET を検出" \
  'echo $GH_CLIENT_SECRET'

assert_blocked "06: OAUTH_TOKEN を検出" \
  'echo $OAUTH_TOKEN'

assert_blocked "07: ghs_ プレフィックスを検出" \
  'echo ghs_abc123'

assert_blocked "08: github_pat_ プレフィックスを検出" \
  'echo github_pat_abc123'

assert_blocked "09: /proc/self/environ アクセスを検出" \
  'cat /proc/self/environ'

assert_blocked "10: Authorization bearer ヘッダーを検出 (ERE)" \
  'curl -H "Authorization: bearer xxx"'

# --- 迂回パターン ---

echo ""
echo "=== 迂回パターン ==="
assert_blocked "11: printf による迂回 (GH_CLIENT_SECRET)" \
  'printf '"'"'%s'"'"' "$GH_CLIENT_SECRET"'

assert_blocked "12: \${} 形式の迂回 (OAUTH_TOKEN)" \
  'echo ${OAUTH_TOKEN}'

assert_blocked "13: set | grep で環境変数ダンプ (シークレット名なし)" \
  'set | grep FOO'

assert_blocked "14: export -p で環境変数ダンプ" \
  'export -p'

assert_blocked "15: compgen -v で変数名列挙" \
  'compgen -v'

assert_blocked "16: インラインで GH_TOKEN 設定+利用" \
  'GH_TOKEN=xxx bash -c '"'"'echo $GH_TOKEN'"'"''

# --- declare -x / declare -p パターン ---

echo ""
echo "=== declare パターン ==="
assert_blocked "17: declare -x で全 export 変数ダンプ" \
  'declare -x'

assert_blocked "18: declare -p で全変数ダンプ" \
  'declare -p'

assert_allowed "19: declare foo=bar は許可 (declare -x/-p と区別)" \
  'declare foo=bar'

# --- スペース迂回テスト ---

echo ""
echo "=== スペース迂回テスト ==="
assert_blocked "19b: set|grep (スペースなし) を検出" \
  'set|grep FOO'

assert_blocked "19c: set  | grep (スペース2つ) を検出" \
  'set  | grep FOO'

assert_blocked "19d: declare  -x (スペース2つ) を検出" \
  'declare  -x'

assert_blocked "19e: compgen  -v (スペース2つ) を検出" \
  'compgen  -v'

# --- /proc/*/environ パターン (ERE) ---

echo ""
echo "=== /proc/*/environ パターン ==="
assert_blocked "20: /proc/1/environ アクセスを検出 (ERE)" \
  'cat /proc/1/environ'

assert_blocked "21: /proc/12345/environ アクセスを検出 (ERE)" \
  'cat /proc/12345/environ'

# --- Authorization bearer コンテキスト限定 ---

echo ""
echo "=== bearer コンテキスト限定 ==="
assert_blocked "22: Authorization: Bearer (大文字B) を検出" \
  'curl -H "Authorization: Bearer xxx"'

assert_allowed "23: flag bearer は許可 (false positive 修正)" \
  'echo "flag bearer"'

# --- Issue #70: GH_TOKEN バリエーション ---

echo ""
echo "=== Issue #70: GH_TOKEN バリエーション ==="
assert_blocked "31: ダブルクォート付き echo GH_TOKEN" \
  'echo "$GH_TOKEN"'

assert_blocked "32: printf 経由 GH_TOKEN" \
  'printf '"'"'%s'"'"' "$GH_TOKEN"'

assert_blocked "33: ヒアストリング GH_TOKEN" \
  'cat <<< $GH_TOKEN'

assert_blocked "34: ブレース展開 ${GH_TOKEN}" \
  'echo ${GH_TOKEN}'

assert_blocked "35: printenv GH_TOKEN を検出" \
  'printenv GH_TOKEN'

# --- 正常系 (PASS するはず) ---

echo ""
echo "=== 正常系 ==="
assert_allowed "24: git status は許可" \
  'git status'

assert_allowed "25: cargo test は許可" \
  'cargo test'

assert_allowed "26: pnpm build は許可" \
  'pnpm build'

assert_allowed "27: echo hello は許可" \
  'echo hello'

assert_allowed "28: export PATH は許可 (export -p ではない)" \
  'export PATH=/usr/bin'

assert_allowed "29: set -euo pipefail は許可 (set | grep ではない)" \
  'set -euo pipefail'

assert_allowed "30: export 文字列を含むが環境変数ダンプではない" \
  'echo "export data to file"'

# --- 結果サマリ ---

echo ""
echo "==============================="
echo "結果: $PASS_COUNT passed, $FAIL_COUNT failed (total $((PASS_COUNT + FAIL_COUNT)))"
echo "==============================="

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  echo "失敗したテスト:"
  for err in "${ERRORS[@]}"; do
    echo "  - $err"
  done
fi

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
else
  exit 0
fi
