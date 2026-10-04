#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# demo-seed.sh — seed the Demo database from data/dataset.json
# ════════════════════════════════════════════════════════════════
# Runs sql/10…70 in order. The shell guard runs before EVERY file and
# sql/00_guard.sql runs inside every file. Requires a clean (fresh or
# reset) Demo database and the Demo operator account.
#
#   DEMO_PROJECT_REF DEMO_DB_URL DEMO_SUPABASE_URL DEMO_OPERATOR_EMAIL
set -euo pipefail
. "$(dirname "$0")/demo-lib.sh"
demo_require DEMO_PROJECT_REF DEMO_DB_URL DEMO_SUPABASE_URL DEMO_OPERATOR_EMAIL

demo_step "dataset is current"
node "$DEMO_TOOLS/build-dataset.mjs" --check

demo_step "seed"
for f in 10_company_profile 20_archive_season 21_archive_finance 22_archive_close \
         30_active_resources 40_people 50_allocation 60_finance 70_portal 99_summary; do
  demo_sql_file "$DEMO_DIR/sql/$f.sql" --no-api
done
echo "✓ Demo database seeded. Next: demo-storage-load.mjs, then verify-demo.py."
