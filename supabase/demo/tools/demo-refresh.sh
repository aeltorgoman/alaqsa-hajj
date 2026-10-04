#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# demo-refresh.sh — the one command before a customer demonstration
# ════════════════════════════════════════════════════════════════
# reset → seed → generate documents → load Storage → verify.
# Needs the destructive confirmation (it resets first). Every stage
# re-runs the Demo guard itself.
#   DEMO_RESET_CONFIRM=RESET-DEMO-<ref> bash demo-refresh.sh [fingerprint-file]
set -euo pipefail
. "$(dirname "$0")/demo-lib.sh"
demo_require DEMO_PROJECT_REF DEMO_DB_URL DEMO_SUPABASE_URL DEMO_SERVICE_ROLE_KEY DEMO_OPERATOR_EMAIL
bash "$DEMO_TOOLS/demo-reset.sh"
bash "$DEMO_TOOLS/demo-seed.sh"
demo_step "generate synthetic documents"; node "$DEMO_TOOLS/generate-demo-documents.mjs"
demo_step "load Storage";                 node "$DEMO_TOOLS/demo-storage-load.mjs"
demo_step "verify";                       python3 "$DEMO_TOOLS/verify-demo.py" ${1:+--fingerprint "$1"}
echo "✓ Demo refreshed and verified."
