#!/bin/bash
# PostToolUse hook: Rust ファイル編集後に fmt + clippy + machete + audit を実行

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUST_DIR="$PROJECT_ROOT/rust-core"

# stdin から JSON を読み込み、file_path を抽出
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Rust ファイル以外はスキップ
case "$FILE_PATH" in
  *.rs) ;;
  *) exit 0 ;;
esac

# rust-core ディレクトリがなければスキップ (まだ初期化前)
if [ ! -f "$RUST_DIR/Cargo.toml" ]; then
  exit 0
fi

# cargo が使えなければスキップ
if ! command -v cargo >/dev/null 2>&1; then
  exit 0
fi

cd "$RUST_DIR"

# cargo fmt
if cargo fmt 2>&1; then
  echo "[hook] cargo fmt: formatted $FILE_PATH"
else
  echo "BLOCK: cargo fmt failed for $FILE_PATH" >&2
  exit 2
fi

# cargo clippy
if cargo clippy --all-targets -- -D warnings 2>&1; then
  echo "[hook] cargo clippy: passed"
else
  echo "BLOCK: cargo clippy failed" >&2
  exit 2
fi

# cargo machete (未使用依存検出)
if command -v cargo-machete >/dev/null 2>&1; then
  if cargo machete 2>&1; then
    echo "[hook] cargo machete: passed"
  else
    echo "BLOCK: cargo machete detected unused dependencies" >&2
    exit 2
  fi
fi

# cargo audit (脆弱性スキャン)
if command -v cargo-audit >/dev/null 2>&1; then
  if cargo audit 2>&1; then
    echo "[hook] cargo audit: passed"
  else
    echo "BLOCK: cargo audit found vulnerabilities" >&2
    exit 2
  fi
fi
