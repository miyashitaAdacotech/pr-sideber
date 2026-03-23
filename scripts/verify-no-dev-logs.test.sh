#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/verify-no-dev-logs.sh"

PASS_COUNT=0
FAIL_COUNT=0
TOTAL=0

report() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$expected" = "$actual" ]; then
    echo "PASS: ${name}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: ${name} (expected exit ${expected}, got exit ${actual})"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# ヘルパー: DEV ログプレフィックスが検出されるべきケースを生成して検証する
# $1: テスト名
# $2: JS ファイル名 (dist/ 配下)
# $3: JS ファイルの中身
run_test_dev_log_detected() {
  local test_name="$1"
  local js_filename="$2"
  local js_content="$3"

  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf '${tmpdir}'" RETURN

  mkdir -p "${tmpdir}/dist"
  echo "${js_content}" > "${tmpdir}/dist/${js_filename}"

  local exit_code=0
  (cd "${tmpdir}" && bash "${TARGET_SCRIPT}") >/dev/null 2>&1 || exit_code=$?
  report "${test_name}" "1" "${exit_code}"
}

# --- Test 1: Clean dist with no DEV logs -> exit 0 ---
run_test_clean() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf '${tmpdir}'" RETURN

  mkdir -p "${tmpdir}/dist"
  cat > "${tmpdir}/dist/app.js" <<'JSEOF'
console.log("production code");
function hello() { return 42; }
JSEOF

  local exit_code=0
  (cd "${tmpdir}" && bash "${TARGET_SCRIPT}") >/dev/null 2>&1 || exit_code=$?
  report "Clean dist (no DEV logs) -> exit 0" "0" "${exit_code}"
}

# --- Test 2: dist contains import.meta.env.DEV -> exit 1 ---
run_test_import_meta_env_dev() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf '${tmpdir}'" RETURN

  mkdir -p "${tmpdir}/dist"
  cat > "${tmpdir}/dist/app.js" <<'JSEOF'
if (import.meta.env.DEV) { console.log("debug"); }
JSEOF

  local exit_code=0
  (cd "${tmpdir}" && bash "${TARGET_SCRIPT}") >/dev/null 2>&1 || exit_code=$?
  report "import.meta.env.DEV残存 -> exit 1" "1" "${exit_code}"
}

# --- Test 3: DEV log prefixes with console.log (代表2パターン) ---
run_test_dev_log_prefix_identity_adapter() {
  run_test_dev_log_detected \
    "console.log + DEVログプレフィックス ([identity.adapter]) -> exit 1" \
    "app.js" \
    'console.log("[identity.adapter] initialized");'
}

run_test_dev_log_prefix_bootstrap() {
  run_test_dev_log_detected \
    "console.log + DEVログプレフィックス ([bootstrap]) -> exit 1" \
    "main.js" \
    'console.log("[bootstrap] starting app");'
}

# --- Test 4: console.error with DEV log prefix -> exit 1 ---
run_test_dev_log_console_error() {
  run_test_dev_log_detected \
    "console.error + DEVログプレフィックス ([identity.adapter]) -> exit 1" \
    "app.js" \
    'console.error("[identity.adapter] failed to load token");'
}

# --- Test 5: console.warn with DEV log prefix -> exit 1 ---
run_test_dev_log_console_warn() {
  run_test_dev_log_detected \
    "console.warn + DEVログプレフィックス ([bootstrap]) -> exit 1" \
    "main.js" \
    'console.warn("[bootstrap] fallback to default config");'
}

# --- Test 6: 複数ファイルで1つだけ違反 (サブディレクトリ含む) -> exit 1 ---
run_test_multi_file_one_violation() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf '${tmpdir}'" RETURN

  mkdir -p "${tmpdir}/dist/assets"
  # クリーンなファイル
  cat > "${tmpdir}/dist/app.js" <<'JSEOF'
console.log("production ready");
function init() { return true; }
JSEOF
  # サブディレクトリ内の違反ファイル
  cat > "${tmpdir}/dist/assets/chunk-a1b2c3.js" <<'JSEOF'
console.log("[storage] saving data");
JSEOF

  local exit_code=0
  (cd "${tmpdir}" && bash "${TARGET_SCRIPT}") >/dev/null 2>&1 || exit_code=$?
  report "複数ファイル: サブディレクトリの1ファイルだけ違反 -> exit 1" "1" "${exit_code}"
}

# --- Test 7: import.meta.env.DEV と DEV ログプレフィックスが同時に存在 -> exit 1 ---
run_test_both_violations() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf '${tmpdir}'" RETURN

  mkdir -p "${tmpdir}/dist"
  cat > "${tmpdir}/dist/app.js" <<'JSEOF'
if (import.meta.env.DEV) { console.warn("[auto-refresh] polling"); }
console.error("[identity.adapter] token expired");
JSEOF

  local exit_code=0
  (cd "${tmpdir}" && bash "${TARGET_SCRIPT}") >/dev/null 2>&1 || exit_code=$?
  report "import.meta.env.DEV + DEVログプレフィックス両方存在 -> exit 1" "1" "${exit_code}"
}

# --- Test 8: dist directory does not exist -> exit 1 ---
run_test_no_dist_dir() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf '${tmpdir}'" RETURN

  # dist/ を作らない
  local exit_code=0
  (cd "${tmpdir}" && bash "${TARGET_SCRIPT}") >/dev/null 2>&1 || exit_code=$?
  report "dist/が存在しない -> exit 1" "1" "${exit_code}"
}

# --- Run all tests ---
echo "=== verify-no-dev-logs.sh テスト ==="
echo ""

run_test_clean
run_test_import_meta_env_dev
run_test_dev_log_prefix_identity_adapter
run_test_dev_log_prefix_bootstrap
run_test_dev_log_console_error
run_test_dev_log_console_warn
run_test_multi_file_one_violation
run_test_both_violations
run_test_no_dist_dir

echo ""
echo "=== 結果: ${PASS_COUNT}/${TOTAL} PASS, ${FAIL_COUNT}/${TOTAL} FAIL ==="

if [ "${FAIL_COUNT}" -gt 0 ]; then
  exit 1
fi
exit 0
