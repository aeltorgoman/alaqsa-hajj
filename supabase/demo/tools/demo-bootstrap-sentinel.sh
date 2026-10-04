#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# demo-bootstrap-sentinel.sh — place the Demo sentinel ONCE
# ════════════════════════════════════════════════════════════════
# The sentinel is the in-database proof that a database is the Demo.
# Every other tool refuses a database without it. It is placed by hand,
# once, in the Demo project only — so Production can never acquire it
# by accident: acquiring it is itself a deliberate act.
#
#   DEMO_SENTINEL_CONFIRM=PLACE-DEMO-SENTINEL-<DEMO_PROJECT_REF> \
#     bash supabase/demo/tools/demo-bootstrap-sentinel.sh
#
# Refuses: the production ref (all layers of assert-demo-target.sh,
# sentinel excepted), a database holding any pilgrim not created by the
# Demo seed, and a database already marked for a different ref.
set -euo pipefail
. "$(dirname "$0")/demo-lib.sh"
demo_require DEMO_PROJECT_REF DEMO_DB_URL

demo_step "guard (pre-sentinel)"
demo_guard --pre-sentinel --no-api
[ "${DEMO_SENTINEL_CONFIRM:-}" = "PLACE-DEMO-SENTINEL-$DEMO_PROJECT_REF" ] || {
  echo "✗ set DEMO_SENTINEL_CONFIRM=PLACE-DEMO-SENTINEL-<DEMO_PROJECT_REF> to confirm" >&2; exit 1; }

demo_step "place sentinel"
psql "$DEMO_DB_URL" -X -q -v ON_ERROR_STOP=1 -v demo_ref="$DEMO_PROJECT_REF" <<'SQL'
select set_config('demo.ref', :'demo_ref', false);
do $$
declare v_foreign int; v_existing text;
begin
  select count(*) into v_foreign from public.passengers where coalesce(created_by,'') <> 'demo-seed';
  if v_foreign > 0 then
    raise exception 'REFUSED: % pilgrim rows were not created by the Demo seed — this is not a fresh Demo database.', v_foreign;
  end if;
  select metadata->>'project_ref' into v_existing from public.company_assets where asset_key = 'demo_environment_marker';
  if v_existing is not null and v_existing <> current_setting('demo.ref') then
    raise exception 'REFUSED: sentinel already names another ref.';
  end if;
  insert into public.company_assets (asset_key, asset_url, alt_text, metadata)
  values ('demo_environment_marker', 'demo://sentinel', 'Demo environment marker — not a brand asset',
          jsonb_build_object('environment', 'demo', 'project_ref', current_setting('demo.ref'),
                             'purpose', 'Demo tooling refuses any database without this row',
                             'placed_by', 'supabase/demo/tools/demo-bootstrap-sentinel.sh'))
  on conflict (asset_key) do update set metadata = excluded.metadata, asset_url = excluded.asset_url;
end $$;
SQL
demo_step "verify"
demo_guard --no-api
echo "✓ Demo sentinel placed."
