#!/usr/bin/env bash
# Shared helpers for the Demo tools. Sourced, never executed.
# Every write-capable helper re-runs the full Demo guard first.
set -euo pipefail
DEMO_TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "$DEMO_TOOLS/.." && pwd)"
REPO_DIR="$(cd "$DEMO_DIR/../.." && pwd)"
DEMO_DATASET="$DEMO_DIR/data/dataset.json"
DEMO_GENERATED="${DEMO_GENERATED_DIR:-$DEMO_DIR/.generated}"

# Optional env file (never committed — see demo.env.example).
if [ -n "${DEMO_ENV_FILE:-}" ]; then
  [ -f "$DEMO_ENV_FILE" ] || { echo "✗ DEMO_ENV_FILE not found" >&2; exit 1; }
  set -a; . "$DEMO_ENV_FILE"; set +a
fi

demo_step() { printf '\n── %s ──\n' "$*"; }

# Full guard (sentinel required). Extra flags pass through.
demo_guard() { bash "$DEMO_TOOLS/assert-demo-target.sh" "$@"; }

# Run one SQL file against the Demo DB — guard first, every time.
demo_sql_file() {
  local file="$1"; shift
  demo_guard "$@"
  echo "  → $(basename "$file")"
  psql "$DEMO_DB_URL" -X -q -v ON_ERROR_STOP=1 \
    -v demo_ref="$DEMO_PROJECT_REF" \
    -v operator_email="${DEMO_OPERATOR_EMAIL:-}" \
    -v dataset_path="$DEMO_DATASET" \
    -f "$file"
}

demo_require() { for v in "$@"; do [ -n "${!v:-}" ] || { echo "✗ $v is required" >&2; exit 1; }; done; }
