#!/usr/bin/env bash
set -euo pipefail

if [ ! -d "dist" ]; then
  echo "ERROR: dist/ directory does not exist"
  exit 1
fi

violation_found=0

# DEV ログプレフィックスのパターンを構築
dev_log_prefixes=(
  '\[identity\.adapter\]'
  '\[storage\]'
  '\[message-handler\]'
  '\[bootstrap\]'
  '\[MainScreen\]'
  '\[auto-refresh\]'
  '\[auth\.usecase\]'
  '\[pr\.usecase\]'
)

pattern=""
for prefix in "${dev_log_prefixes[@]}"; do
  if [ -z "$pattern" ]; then
    pattern="$prefix"
  else
    pattern="${pattern}|${prefix}"
  fi
done

# 1回の find ループで両方のチェックを実行
while IFS= read -r -d '' file; do
  # import.meta.env.DEV の残存チェック
  set +e
  grep -n 'import\.meta\.env\.DEV' "$file"; rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    echo "VIOLATION: import.meta.env.DEV found in ${file}"
    violation_found=1
  elif [ "$rc" -ge 2 ]; then
    echo "ERROR: grep failed on ${file}"
    exit 1
  fi

  # DEV ログプレフィックスの残存チェック
  set +e
  grep -nE "$pattern" "$file"; rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    echo "VIOLATION: DEV log prefix found in ${file}"
    violation_found=1
  elif [ "$rc" -ge 2 ]; then
    echo "ERROR: grep failed on ${file}"
    exit 1
  fi
done < <(find dist -name '*.js' -print0)

if [ "$violation_found" -eq 1 ]; then
  echo "FAILED: DEV logs detected in production build"
  exit 1
fi

echo "PASSED: No DEV logs found in production build"
exit 0
