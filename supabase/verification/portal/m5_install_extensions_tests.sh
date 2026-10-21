#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# M5 — تثبيتُ pg_net وpg_cron (20261021030000) — فحوصٌ بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدة Supabase محلّيّةٍ بعد الترحيلة (supabase start ثم db reset، أو صورة supabase/postgres):
#   LOCAL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' supabase/verification/portal/m5_install_extensions_tests.sh
#
#   الامتدادان مثبَّتان · net.http_post بالتوقيع الذي يستدعيه التيك · postgres يجدول ويُلغي
#   · cron مغلقٌ على anon/authenticated · لا مهمّةَ مجدوَلة · لا طلبَ HTTP
#   · M5 خامل: التيك 'idle' أو 'not_configured' والفحص 'not_configured' بلا سرَّي Vault، ولا طلبَ بعدهما
#   · التيكُ والفحصُ للمالك وحده · الترحيلةُ تُعاد بلا أثر
#   · الخطرُ المعلوم مسجَّل: PUBLIC على جداول net (لا يملك postgres سحبَه)
#
# ⚠️ لا شبكة: لا سرَّ في Vault فلا طلب. ويرفض قاعدةً غيرَ محلّيّة أو فيها سرّا M5 في Vault أو مهامّ.
set -uo pipefail
LOCAL="${LOCAL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$LOCAL" in
  *@127.0.0.1:*|*@localhost:*|postgresql:///*) ;;
  *) echo "يرفض: $LOCAL ليست قاعدةً محلّيّة"; exit 2 ;;
esac
pass=0; fail=0
ok()  { echo "PASS — $1"; pass=$((pass + 1)); }
bad() { echo "FAIL — $1"; fail=$((fail + 1)); }
eq()  { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }
q()   { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
as_role() { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role $1; $2; commit;" 2>&1; }
M="$(dirname "$0")/../../migrations/20261021030000_m5_install_pg_net_pg_cron.sql"

[ -f "$M" ] || { echo "يرفض: $M غير موجود"; exit 2; }
if [ "$(q "select count(*) from pg_namespace where nspname = 'vault'")" = "1" ] \
   && [ "$(q "select count(*) from vault.secrets where name in ('push_dispatch_url','push_dispatch_token')")" != "0" ]; then
  echo "يرفض: سرّا M5 في Vault — قد يُرسل التيكُ طلباً حقيقيّاً"; exit 2; fi

echo "── التثبيت"
eq "pg_net مثبَّت" "$(q "select count(*) from pg_extension where extname = 'pg_net'")" "1"
eq "pg_cron مثبَّت" "$(q "select count(*) from pg_extension where extname = 'pg_cron'")" "1"
eq "net.http_post بالتوقيع الذي يستدعيه التيك" "$(q "select (to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null)::text")" "true"
eq "postgres يستعمل cron ويجدول ويُلغي" \
  "$(q "select (has_schema_privilege('postgres','cron','USAGE') and has_function_privilege('postgres','cron.schedule(text,text,text)','EXECUTE') and has_function_privilege('postgres','cron.unschedule(text)','EXECUTE'))::text")" "true"
eq "cron مغلقٌ على anon وauthenticated" "$(q "select (has_schema_privilege('anon','cron','USAGE') or has_schema_privilege('authenticated','cron','USAGE'))::text")" "false"
r="$(as_role anon "select count(*) from cron.job")"
echo "$r" | grep -q "42501" && ok "anon لا يقرأ cron.job" || bad "anon يقرأ cron.job: $r"
r="$(as_role authenticated "select cron.schedule('x', '* * * * *', 'select 1')")"
echo "$r" | grep -q "42501" && ok "authenticated لا يجدول" || bad "authenticated يجدول: $r"

echo "── لا تفعيل"
eq "لا مهمّةَ في cron.job" "$(q "select count(*) from cron.job")" "0"
eq "لا طلبَ في طابور pg_net" "$(q "select count(*) from net.http_request_queue")" "0"
eq "لا عقدَ ولا تيك في push_dispatch_state" "$(q "select (lease_run_id is null and last_tick_at is null)::text from public.push_dispatch_state")" "true"

echo "── M5 خاملٌ بلا سرَّي Vault"
r="$(q "select public.push_dispatch_tick()")"
case "$r" in idle|not_configured) ok "التيك ← $r (لا طلب)";; *) bad "التيك ← $r";; esac
eq "الفحص ← not_configured" "$(q "select public.push_dispatch_probe()")" "not_configured"
eq "ولا طلبَ بعدهما" "$(q "select count(*) from net.http_request_queue")" "0"
for r in anon authenticated service_role; do
  o="$(as_role $r "select public.push_dispatch_tick()")"
  echo "$o" | grep -q "42501" && ok "$r لا ينفّذ push_dispatch_tick" || bad "$r ينفّذ push_dispatch_tick: $o"
done

echo "── الإعادة"
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -f "$M" >/dev/null 2>&1 && ok "الترحيلةُ تُعاد بلا خطأ" || bad "إعادةُ الترحيلة تفشل"
eq "ولا مهمّةَ بعدها" "$(q "select count(*) from cron.job")" "0"

echo "── الخطرُ المعلوم (مقبول، يُسجَّل لا يُصلَح)"
acl="$(q "select coalesce(relacl::text,'') from pg_class where oid = 'net.http_request_queue'::regclass")"
case "$acl" in *"=arwdDxtm/supabase_admin"*) echo "INFO — PUBLIC يملك net.http_request_queue (المالك supabase_admin)";;
  *) echo "INFO — صلاحياتُ net.http_request_queue: $acl";; esac

echo
echo "النتيجة: $pass نجح · $fail أخفق"
[ "$fail" -eq 0 ]
