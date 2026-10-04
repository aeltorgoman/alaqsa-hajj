#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# demo-reset.sh — wipe the persistent Demo back to its pre-seed state
# ════════════════════════════════════════════════════════════════
#   DEMO_RESET_CONFIRM=RESET-DEMO-<DEMO_PROJECT_REF> bash demo-reset.sh
# Order: guard → purge Storage (objects first, so a DB failure can never
# orphan them) → guard → sql/90_reset.sql. Then: demo-seed.sh,
# demo-storage-load.mjs, verify-demo.py.
set -euo pipefail
. "$(dirname "$0")/demo-lib.sh"
demo_require DEMO_PROJECT_REF DEMO_DB_URL DEMO_SUPABASE_URL DEMO_SERVICE_ROLE_KEY

demo_step "guard (destructive)"
demo_guard --destructive
demo_step "purge Demo Storage"
node "$DEMO_TOOLS/demo-storage-purge.mjs"
demo_step "reset database"
demo_sql_file "$DEMO_DIR/sql/90_reset.sql" --destructive
echo "✓ Demo reset complete."
