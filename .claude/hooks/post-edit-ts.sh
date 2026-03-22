#!/bin/bash
# PostToolUse hook: TypeScript/Svelte ファイル編集後に fmt + lint + 型チェックを実行

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# stdin から JSON を読み込み、file_path を抽出
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# TS/Svelte ファイル以外はスキップ
case "$FILE_PATH" in
  *.ts|*.svelte) ;;
  *) exit 0 ;;
esac

# ファイルが存在しなければスキップ
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

cd "$PROJECT_ROOT"

# node_modules がなければスキップ (まだ pnpm install 前)
if [ ! -d "node_modules" ]; then
  exit 0
fi

# Biome (format + lint) — biome.json で *.svelte は ignore されているためスキップ
case "$FILE_PATH" in
  *.svelte) ;;
  *)
    if pnpm exec biome --version >/dev/null 2>&1; then
      if pnpm exec biome check --write -- "$FILE_PATH" 2>&1; then
        echo "[hook] biome: checked $FILE_PATH"
      else
        echo "BLOCK: biome failed for $FILE_PATH" >&2
        exit 2
      fi
    fi
    ;;
esac

# ESLint (Svelte only)
case "$FILE_PATH" in
  *.svelte)
    if pnpm exec eslint --version >/dev/null 2>&1; then
      if pnpm exec eslint --fix -- "$FILE_PATH" 2>&1; then
        echo "[hook] eslint: checked $FILE_PATH"
      else
        echo "BLOCK: eslint --fix failed for $FILE_PATH" >&2
        exit 2
      fi
    fi
    ;;
esac

# svelte-check (型チェック)
if pnpm check 2>&1; then
  echo "[hook] svelte-check: passed"
else
  echo "BLOCK: svelte-check failed" >&2
  exit 2
fi
