#!/usr/bin/env bash
# Control / negative test for the `helper_exec_holders` post-check in
# .github/workflows/portal-limits-canonical-push.yml.
#
# Runs the workflow's exact query (extracted from the YAML, not copied) against a
# throwaway function in a LOCAL scratch database, and proves:
#   - grant order never changes the result (no false failure from ordering);
#   - any extra EXECUTE holder (a role or PUBLIC) makes the check fail.
# Usage: PSQL="psql -X -q -At -d <local scratch db>" supabase/verification/check-helper-exec-holders.sh
# Never point this at Production: it creates and drops objects.
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL="${PSQL:?set PSQL to a psql command for a LOCAL scratch database}"
WF=.github/workflows/portal-limits-canonical-push.yml
EXPECT="postgres,service_role"

q="$(python3 - "$WF" <<'PY'
import re, sys
line = next(l for l in open(sys.argv[1]) if l.strip().startswith("want helper_exec_holders"))
m = re.match(r'\s*want helper_exec_holders\s+"((?:[^"\\]|\\.)*)"\s+"([^"]*)"', line)
print(m.group(1).replace('\\"', '"'))
PY
)"
q="${q//\$RLE/\'public.rate_limit_exceeded(text,uuid,integer,integer)\'}"

run() { $PSQL -v ON_ERROR_STOP=1 -c "$1" >/dev/null; }
setup() {
  run "drop function if exists public.rate_limit_exceeded(text,uuid,integer,integer);
       create function public.rate_limit_exceeded(text,uuid,integer,integer) returns boolean language sql as 'select false';
       revoke all on function public.rate_limit_exceeded(text,uuid,integer,integer) from public;"
  for g in "$@"; do run "grant execute on function public.rate_limit_exceeded(text,uuid,integer,integer) to $g;"; done
}
fail=0
check() { # name, want-pass(1|0), grants...
  local name="$1" want="$2"; shift 2; setup "$@"
  local got; got="$($PSQL -c "$q")"
  local pass=0; [ "$got" = "$EXPECT" ] && pass=1
  if [ "$pass" = "$want" ]; then echo "ok   $name -> '$got'"; else echo "FAIL $name -> '$got'"; fail=1; fi
}
run "do \$\$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
     if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
     if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end \$\$;"
# Owner must be postgres for the expected set.
check "control: service_role only"             1 service_role
check "control: service_role, then postgres"   1 service_role postgres
check "control: postgres, then service_role"   1 postgres service_role
check "negative: extra authenticated"          0 service_role authenticated
check "negative: extra anon (granted first)"   0 anon service_role
check "negative: PUBLIC"                       0 public service_role
check "negative: service_role missing"         0
run "drop function public.rate_limit_exceeded(text,uuid,integer,integer);"
exit $fail
