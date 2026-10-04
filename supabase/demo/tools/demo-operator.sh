#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# demo-operator.sh — create/refresh the Demo operator account
# ════════════════════════════════════════════════════════════════
# Reuses supabase/scripts/seed_first_admin.mjs unchanged (no parallel
# auth bootstrap). It grants the 11 operational permissions — enough for
# the whole sales demo, including issuing and cancelling receipts.
# view_audit and manage_season_lifecycle stay excluded, exactly as that
# script decides.
#
# Inputs (environment only — never a file in the repository):
#   DEMO_OPERATOR_EMAIL, DEMO_OPERATOR_PASSWORD (≥ 8 chars),
#   DEMO_SUPABASE_URL, DEMO_SERVICE_ROLE_KEY
# The password and key are passed through the environment and never
# printed.
set -euo pipefail
. "$(dirname "$0")/demo-lib.sh"
demo_require DEMO_PROJECT_REF DEMO_DB_URL DEMO_SUPABASE_URL DEMO_SERVICE_ROLE_KEY DEMO_OPERATOR_EMAIL DEMO_OPERATOR_PASSWORD

demo_step "guard"
demo_guard
[ -d "$REPO_DIR/node_modules/@supabase/supabase-js" ] || { echo "✗ run 'npm ci' in the repository first (seed_first_admin.mjs needs @supabase/supabase-js)" >&2; exit 1; }

demo_step "seed_first_admin.mjs (non-interactive, confirmed)"
cd "$REPO_DIR"
# seed_first_admin.mjs asks for an explicit "نعم" after showing its plan.
# readline drops piped input sent before the question, so the answer is
# written only once the prompt appears on stdout.
env SUPABASE_URL="$DEMO_SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$DEMO_SERVICE_ROLE_KEY" \
  ADMIN_EMAIL="$DEMO_OPERATOR_EMAIL" ADMIN_NAME="مشغّل العرض التجريبي" ADMIN_PASSWORD="$DEMO_OPERATOR_PASSWORD" \
  node --input-type=module -e '
    import { spawn } from "node:child_process";
    const c = spawn(process.execPath, ["supabase/scripts/seed_first_admin.mjs"], { stdio: ["pipe", "pipe", "inherit"] });
    let answered = false;
    c.stdout.on("data", (b) => {
      const s = b.toString(); process.stdout.write(s);
      if (!answered && s.includes("للتنفيذ")) { answered = true; c.stdin.write("نعم\n"); }
    });
    c.on("exit", (code) => { c.stdin.end(); process.exit(code ?? 1); });
  ' 

demo_step "verify operator permissions"
demo_guard --no-api
n="$(psql "$DEMO_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -v e="$DEMO_OPERATOR_EMAIL" <<'SQL'
select count(*) from public.user_profiles
 where lower(email) = lower(:'e') and is_active
   and coalesce((permissions->>'manage_payments')::boolean, false)
   and coalesce((permissions->>'manage_admins')::boolean, false)
   and coalesce((permissions->>'manage_passengers')::boolean, false);
SQL
)"
[ "$n" = "1" ] || { echo "✗ operator profile missing or lacks permissions" >&2; exit 1; }
echo "✓ Demo operator ready (11 operational permissions)."
