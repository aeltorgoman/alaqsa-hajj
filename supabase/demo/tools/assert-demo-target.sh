#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# assert-demo-target.sh — refuses every target that is not the Demo
# ════════════════════════════════════════════════════════════════
# Same design as supabase/verification/assert-not-production.sh: it is
# called by EVERY write-capable step, not once at the top. The order of
# steps is not a guarantee; intent is not a guarantee. Each step asks.
#
# Layers (all must pass; any failure exits non-zero, nothing written):
#   1. Production ref is hard-denied — in DEMO_PROJECT_REF, in every
#      URL, and in the service key's `ref` claim.
#   2. DEMO_PROJECT_REF must be given explicitly: a 20-char project ref
#      for the hosted Demo project, or the literal `local` for a local
#      rehearsal stack (then every host must be loopback).
#   3. Every connection string must belong to that ref.
#   4. The in-database Demo sentinel must exist and name the same ref
#      (skipped only with --pre-sentinel, used by the one-time bootstrap).
#   5. --destructive additionally requires
#      DEMO_RESET_CONFIRM=RESET-DEMO-<DEMO_PROJECT_REF>.
#
# It says what it found, never what it read: no URL, key or password is
# ever printed.
#
#   DEMO_PROJECT_REF=… DEMO_DB_URL=… DEMO_SUPABASE_URL=… [DEMO_SERVICE_ROLE_KEY=…] \
#     assert-demo-target.sh [--pre-sentinel] [--destructive] [--no-api]
set -euo pipefail

# Production ref — a hard-coded forbidden value, identical to the one in
# supabase/verification/assert-not-production.sh. Not an input, not a secret.
readonly PRODUCTION_REF="zkucwcnclbfvukhdqhgc"
readonly SENTINEL_KEY="demo_environment_marker"

refuse() { echo "✗ DEMO GUARD REFUSED: $*" >&2; echo "  Nothing was touched." >&2; exit 1; }

PRE_SENTINEL=0; DESTRUCTIVE=0; NO_API=0
for a in "$@"; do
  case "$a" in
    --pre-sentinel) PRE_SENTINEL=1 ;;
    --destructive)  DESTRUCTIVE=1 ;;
    --no-api)       NO_API=1 ;;
    *) refuse "unknown option" ;;
  esac
done

# The production guard this file mirrors must still carry the same ref —
# if someone edits one and not the other, stop.
GUARD_FILE="$(cd "$(dirname "$0")/../../verification" && pwd)/assert-not-production.sh"
if [ -f "$GUARD_FILE" ] && ! grep -qF "PRODUCTION_REF=\"$PRODUCTION_REF\"" "$GUARD_FILE"; then
  refuse "production ref here differs from supabase/verification/assert-not-production.sh"
fi

REF="${DEMO_PROJECT_REF:-}"
DB_URL="${DEMO_DB_URL:-}"
API_URL="${DEMO_SUPABASE_URL:-}"
KEY="${DEMO_SERVICE_ROLE_KEY:-}"
FN_URL="${DEMO_FUNCTIONS_URL:-}"   # optional; defaults to <DEMO_SUPABASE_URL>/functions/v1

[ -n "$REF" ]    || refuse "DEMO_PROJECT_REF is not set — the Demo target must be named explicitly"
[ -n "$DB_URL" ] || refuse "DEMO_DB_URL is not set"
[ "$NO_API" = 1 ] || [ -n "$API_URL" ] || refuse "DEMO_SUPABASE_URL is not set"

# ── layer 1: production is never a target ───────────────────────
[ "$REF" != "$PRODUCTION_REF" ] || refuse "DEMO_PROJECT_REF is the PRODUCTION project"
for s in "$DB_URL" "$API_URL" "$KEY" "$FN_URL"; do
  if printf '%s' "$s" | grep -qiF "$PRODUCTION_REF"; then refuse "a connection value carries the PRODUCTION ref"; fi
done

# service keys in JWT form carry the project ref in their payload
jwt_ref() {
  local payload="${1#*.}"; payload="${payload%%.*}"
  local pad=$(( (4 - ${#payload} % 4) % 4 ))
  payload="$payload$(printf '=%.0s' $(seq 1 $pad) 2>/dev/null)"
  printf '%s' "$payload" | tr '_-' '/+' | base64 -d 2>/dev/null | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("ref",""))
except Exception: print("")' 2>/dev/null || true
}
KEY_REF=""
if [ -n "$KEY" ] && [ "$(printf '%s' "$KEY" | tr -cd '.' | wc -c)" -eq 2 ]; then KEY_REF="$(jwt_ref "$KEY")"; fi
[ "$KEY_REF" != "$PRODUCTION_REF" ] || refuse "the service key belongs to the PRODUCTION project"

host_of() { python3 -c 'import sys,urllib.parse as u
p=u.urlsplit(sys.argv[1]); print((p.hostname or "").lower())' "$1"; }
user_of() { python3 -c 'import sys,urllib.parse as u
p=u.urlsplit(sys.argv[1]); print((p.username or "").lower())' "$1"; }

# libpq lets query parameters override the URL host (?host=, ?hostaddr=,
# ?service=); that would make the host checks below meaningless. Refuse them.
for u in "$DB_URL" "$API_URL" "$FN_URL"; do
  if printf '%s' "${u#*\?}" | grep -qiE '(^|&)(host|hostaddr|service|servicefile)='; then
    [ "${u#*\?}" != "$u" ] && refuse "a connection URL overrides its host through query parameters"
  fi
done

# ── layers 2+3: explicit ref, every connection belongs to it ────
if [ "$REF" = "local" ]; then
  for u in "$DB_URL" $( [ "$NO_API" = 1 ] || printf '%s' "$API_URL" ) $FN_URL; do
    h="$(host_of "$u")"
    case "$h" in 127.0.0.1|localhost|::1) ;; *) refuse "DEMO_PROJECT_REF=local but a connection host is not loopback" ;; esac
  done
  [ -z "$KEY_REF" ] || refuse "DEMO_PROJECT_REF=local but the service key names a hosted project"
  MODE="local rehearsal stack (loopback only)"
else
  printf '%s' "$REF" | grep -qE '^[a-z]{20}$' || refuse "DEMO_PROJECT_REF is not a well-formed project ref"
  db_host="$(host_of "$DB_URL")"; db_user="$(user_of "$DB_URL")"
  case "$db_host" in
    "db.$REF.supabase.co") ;;
    *.pooler.supabase.com) [ "$db_user" = "postgres.$REF" ] || refuse "the pooler connection does not belong to DEMO_PROJECT_REF" ;;
    *) refuse "DEMO_DB_URL host does not belong to DEMO_PROJECT_REF" ;;
  esac
  if [ "$NO_API" = 0 ]; then
    [ "$(host_of "$API_URL")" = "$REF.supabase.co" ] || refuse "DEMO_SUPABASE_URL does not belong to DEMO_PROJECT_REF"
  fi
  if [ -n "$FN_URL" ]; then
    case "$(host_of "$FN_URL")" in "$REF.supabase.co"|"$REF.functions.supabase.co") ;; *) refuse "DEMO_FUNCTIONS_URL does not belong to DEMO_PROJECT_REF" ;; esac
  fi
  if [ -n "$KEY_REF" ] && [ "$KEY_REF" != "$REF" ]; then refuse "the service key belongs to a different project"; fi
  MODE="hosted Demo project (ref verified in every connection)"
fi

# ── layer 5: destructive intent ─────────────────────────────────
if [ "$DESTRUCTIVE" = 1 ]; then
  [ "${DEMO_RESET_CONFIRM:-}" = "RESET-DEMO-$REF" ] || refuse "destructive step needs DEMO_RESET_CONFIRM=RESET-DEMO-<DEMO_PROJECT_REF>"
fi

# ── layer 4: the in-database sentinel ───────────────────────────
command -v psql >/dev/null || refuse "psql is required"
found="$(PGCONNECT_TIMEOUT=10 psql "$DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c \
  "select coalesce((select metadata->>'environment' || '|' || coalesce(metadata->>'project_ref','')
     from public.company_assets where asset_key = '$SENTINEL_KEY'), 'none|')" 2>/dev/null)" \
  || refuse "could not query the target database"
env_tag="${found%%|*}"; sentinel_ref="${found#*|}"
if [ "$PRE_SENTINEL" = 1 ]; then
  if [ "$env_tag" != "none" ] && [ "$sentinel_ref" != "$REF" ]; then
    refuse "this database already carries a Demo sentinel for a different ref"
  fi
  echo "  demo guard ok: $MODE · sentinel check deferred (bootstrap)"
  exit 0
fi
[ "$env_tag" = "demo" ] || refuse "the target database carries no Demo sentinel — it is not a Demo database"
[ "$sentinel_ref" = "$REF" ] || refuse "the Demo sentinel names a different project ref"

echo "  demo guard ok: $MODE · sentinel present$( [ "$DESTRUCTIVE" = 1 ] && echo ' · destructive confirmation present')"
