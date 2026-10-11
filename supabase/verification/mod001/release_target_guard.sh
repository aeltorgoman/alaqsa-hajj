#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# MOD-001 — حارسُ الهدف لسيرَي الإطلاق (بيئةُ الاختبار ثمّ الإنتاج)
# ════════════════════════════════════════════════════════════
#   release_target_guard.sh <target> <ref> <db_user> <db_host> <confirm> [<lt_ref_secret>]
#
#   target   loadtest | production
#   ref      مرجعُ المشروع الذي يُراد الاتصالُ به
#   db_user  مستخدمُ الـpooler — يجب أن يساوي `postgres.<ref>` بالضبط، فالـpooler
#            يوجّه الاتصالَ بالمستخدم: مستخدمٌ لمشروعٍ آخر = مشروعٌ آخر.
#   db_host  مضيفُ الـpooler — يجب أن يكون `aws-N-<region>.pooler.supabase.com`.
#   confirm  نصُّ التفويض المكتوب — يختلف بين الهدفين وبين الوضعين (MODE=push |
#            price-gate)، فلا يصلح أحدُها لغيره: تفويضُ بوّابة الأسعار (قراءة) لا
#            يفتح الكتابة، وتفويضُ بيئة الاختبار لا يفتح الإنتاج.
#   lt_ref_secret  (loadtest وحده) قيمةُ سرّ LT_PROJECT_REF — يجب أن تساوي ref.
#
# يُخفق مغلَقاً على كلّ شذوذ، ولا يطبع سرّاً ولا رابطاً.
set -euo pipefail

readonly PRODUCTION_REF="zkucwcnclbfvukhdqhgc"
case "${MODE:-push}" in
  push)       CONFIRM_LOADTEST="PUSH-MOD001-LOADTEST-20261011012258"; CONFIRM_PRODUCTION="PUSH-MOD001-PRODUCTION-20261011012258" ;;
  price-gate) CONFIRM_LOADTEST="GATE-MOD001-LOADTEST-PRICES";         CONFIRM_PRODUCTION="GATE-MOD001-PRODUCTION-PRICES" ;;
  *) echo "::error::REFUSING: unknown MODE '${MODE:-}' — nothing was touched."; exit 1 ;;
esac
readonly CONFIRM_LOADTEST CONFIRM_PRODUCTION
readonly HOST_RE='^aws-[0-9]+-[a-z]{2}-[a-z]+-[0-9]+\.pooler\.supabase\.com$'

fail() { echo "::error::REFUSING: $1 — nothing was touched."; exit 1; }

target="${1:-}"; ref="${2:-}"; db_user="${3:-}"; db_host="${4:-}"; confirm="${5:-}"; lt_secret="${6:-}"

printf '%s' "$ref" | grep -qE '^[a-z]{20}$' || fail "the target ref is empty or malformed"
[ "$db_user" = "postgres.$ref" ]              || fail "db_user does not route to the target ref"
printf '%s' "$db_host" | grep -qE "$HOST_RE"  || fail "db_host is not a Supabase session pooler host"

case "$target" in
  loadtest)
    [ "$confirm" = "$CONFIRM_LOADTEST" ] || fail "confirmation text is not the Load Test authorization"
    [ "$ref" != "$PRODUCTION_REF" ]      || fail "a Load Test run is pointed at the PRODUCTION project"
    [ -n "$lt_secret" ]                  || fail "the LT_PROJECT_REF secret is missing"
    [ "$ref" = "$lt_secret" ]            || fail "the typed ref is not the LT_PROJECT_REF secret"
    ;;
  production)
    [ "$confirm" = "$CONFIRM_PRODUCTION" ] || fail "confirmation text is not the Production authorization"
    [ "$ref" = "$PRODUCTION_REF" ]         || fail "a Production run is pointed at a project that is not Production"
    [ -z "$lt_secret" ]                    || fail "a Production run must not carry Load Test identity"
    ;;
  *)
    fail "unknown target '$target' (expected loadtest or production)"
    ;;
esac

echo "  target guard ok: mode=${MODE:-push} target=$target ref=$ref user=postgres.<ref> host=pooler"
