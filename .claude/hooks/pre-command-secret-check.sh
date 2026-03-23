#!/bin/bash
# PreToolUse hook: Bash コマンド実行前にセキュリティチェックを行う
# 1. シークレット漏洩の検出・ブロック
# 2. GraphQL mutation のホワイトリスト制限 (#72)

set -euo pipefail

# stdin から JSON を読み込み、command を抽出
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [ -z "$COMMAND" ]; then
  exit 0
fi

# NOTE: このフックは「うっかり漏洩」を防ぐ目的の多層防御の一つ。
# eval, base64 decode, スクリプト言語経由等の意図的迂回は原理的に防げない。
# そのレベルの防御にはサンドボックスが必要。

# --- 高速パス: 1回の grep -E で全パターン一括チェック ---
FAST_PATTERN="client_secret|access_token|GITHUB_TOKEN|GITHUB_OAUTH|GH_TOKEN|GH_CLIENT_SECRET|OAUTH_TOKEN|ghp_|gho_|ghs_|github_pat_|export\s+-p|printenv|compgen\s+-v|declare\s+-(x|p)|set\s*\|\s*grep|/proc/.*environ|authorization.*bearer"

HAS_SECRET_PATTERN=false
if printf '%s' "$COMMAND" | grep -qiE "$FAST_PATTERN"; then
  HAS_SECRET_PATTERN=true
fi

# GraphQL mutation チェックが必要か判定
HAS_GQL_MUTATION=false
if printf '%s' "$COMMAND" | grep -qE 'gh\s+api\s+graphql'; then
  if printf '%s' "$COMMAND" | grep -qiE 'mutation(\s+\w+)?\s*\{'; then
    HAS_GQL_MUTATION=true
  fi
fi

# どちらにも該当しなければ即通過
if [ "$HAS_SECRET_PATTERN" = false ] && [ "$HAS_GQL_MUTATION" = false ]; then
  exit 0
fi

# --- シークレットパターンチェック ---
# NOTE: シークレットチェックが先行し、該当すれば exit 2 で即終了する。
# GraphQL mutation チェックはシークレットを含まないコマンドにのみ到達する。
if [ "$HAS_SECRET_PATTERN" = true ]; then
  # 個別パターンで特定
  PATTERNS=(
    # シークレット文字列
    "client_secret"
    "access_token"
    "GITHUB_TOKEN"
    "GITHUB_OAUTH"
    "GH_TOKEN"          # GITHUB_TOKEN とは別の環境変数
    "GH_CLIENT_SECRET"
    "OAUTH_TOKEN"
    "ghp_"              # GitHub PAT prefix
    "gho_"              # GitHub OAuth token prefix
    "ghs_"              # GitHub App installation token prefix
    "github_pat_"       # fine-grained PAT prefix
    # 環境変数ダンプ系コマンド (迂回防止)
    "export -p"
    "printenv"
  )

  for pattern in "${PATTERNS[@]}"; do
    if printf '%s' "$COMMAND" | grep -qi "$pattern"; then
      echo "BLOCK: シークレット '$pattern' がコマンドに含まれています。環境変数または chrome.storage を使ってください。" >&2
      exit 2
    fi
  done

  # ERE 専用パターン (BRE では表現できない / スペース迂回対策が必要なもの)
  ERE_PATTERNS=(
    "/proc/.*environ"
    "authorization.*bearer"
    "set\s*\|\s*grep"
    "declare\s+-(x|p)"
    "compgen\s+-v"
  )
  for pattern in "${ERE_PATTERNS[@]}"; do
    if printf '%s' "$COMMAND" | grep -qiE "$pattern"; then
      echo "BLOCK: シークレットパターン '$pattern' がコマンドに含まれています。環境変数または chrome.storage を使ってください。" >&2
      exit 2
    fi
  done
fi

# --- GraphQL mutation ホワイトリスト (#72) ---
if [ "$HAS_GQL_MUTATION" = true ]; then
  ALLOWED_MUTATIONS=(
    "addProjectV2ItemById"
    "updateProjectV2ItemFieldValue"
    "addBlockedBy"
    "removeBlockedBy"
    "addSubIssue"
  )

  # mutation 名を抽出: mutation (OperationName)? { の後の最初の識別子
  # Named mutation (例: mutation MyOp { addX(...) }) にも対応
  MUTATION_NAME=$(printf '%s' "$COMMAND" | grep -oiP 'mutation(\s+\w+)?\s*\{\s*\K[a-zA-Z]\w*' | head -1 || true)

  if [ -z "$MUTATION_NAME" ]; then
    echo "BLOCK: GraphQL mutation の名前を特定できません。許可された mutation: ${ALLOWED_MUTATIONS[*]}" >&2
    exit 2
  fi

  # ホワイトリストチェック
  for allowed in "${ALLOWED_MUTATIONS[@]}"; do
    if [ "$MUTATION_NAME" = "$allowed" ]; then
      exit 0
    fi
  done

  echo "BLOCK: GraphQL mutation '$MUTATION_NAME' は許可されていません。許可された mutation: ${ALLOWED_MUTATIONS[*]}" >&2
  exit 2
fi
