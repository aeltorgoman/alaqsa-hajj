#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# M5 — التفعيل (20261021120000): مهمّةُ m5-push-dispatch — فحوصٌ بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدة Supabase محلّيّةٍ بعد الترحيلات كلّها (supabase start ثم db reset، أو صورة supabase/postgres):
#   LOCAL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' supabase/verification/portal/m5_schedule_tests.sh
#
#   مهمّةٌ واحدة · كلَّ دقيقة · الأمرُ المعتمَد بالحرف · بدور postgres وعلى قاعدته · مفعّلة
#   · الترحيلةُ تُعاد فلا تُنشئ ثانية · ومهمّةٌ أخرى توقظ التيك تُفشلها
#   · pg_cron يشغّلها فعلاً فتنجح، وبلا سرَّي Vault لا عقدَ ولا طلب
#   · الإيقافُ الطارئ `cron.unschedule('m5-push-dispatch')` يعمل، ثم تُعاد كما كانت
#
# ⚠️ لا شبكة: يرفض قاعدةً غيرَ محلّيّة أو فيها سرّا M5 في Vault (فلا يُرسل التيكُ شيئاً حقيقيّاً).
# ويستغرق نحو دقيقتين: ينتظر تشغيلاً حقيقيّاً من pg_cron.
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
M="$(dirname "$0")/../../migrations/20261021120000_m5_schedule_push_dispatch.sql"
J="m5-push-dispatch"

[ -f "$M" ] || { echo "يرفض: $M غير موجود"; exit 2; }
if [ "$(q "select count(*) from vault.secrets where name in ('push_dispatch_url','push_dispatch_token')")" != "0" ]; then
  echo "يرفض: سرّا M5 في Vault — قد يُرسل التيكُ طلباً حقيقيّاً"; exit 2; fi

echo "── المهمّة"
eq "مهمّةٌ واحدة باسم $J" "$(q "select count(*) from cron.job where jobname = '$J'")" "1"
eq "كلَّ دقيقة" "$(q "select schedule from cron.job where jobname = '$J'")" "* * * * *"
eq "الأمرُ المعتمَد بالحرف" "$(q "select command from cron.job where jobname = '$J'")" "SELECT public.push_dispatch_tick();"
eq "مفعّلة" "$(q "select active::text from cron.job where jobname = '$J'")" "true"
eq "بدور postgres وعلى قاعدته" "$(q "select username||'@'||database from cron.job where jobname = '$J'")" "postgres@$(q "select current_database()")"
eq "لا مهمّةَ أخرى توقظ التيك أو الفحص" "$(q "select count(*) from cron.job where jobname <> '$J' and command ~* 'push_dispatch_(tick|probe)'")" "0"
r="$(as_role anon "select count(*) from cron.job")"
echo "$r" | grep -q "42501" && ok "anon لا يقرأ cron.job" || bad "anon يقرأ cron.job: $r"
r="$(as_role authenticated "select cron.unschedule('$J')")"
echo "$r" | grep -q "42501" && ok "authenticated لا يُلغي المهمّة" || bad "authenticated يُلغي المهمّة: $r"

echo "── الإعادة"
jid="$(q "select jobid from cron.job where jobname = '$J'")"
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -f "$M" >/dev/null 2>&1 && ok "الترحيلةُ تُعاد بلا خطأ" || bad "إعادةُ الترحيلة تفشل"
eq "ولا مهمّةَ ثانية (المعرّفُ نفسه)" "$(q "select string_agg(jobid::text, ',') from cron.job where jobname = '$J'")" "$jid"
q "select cron.schedule('m5-test-probe', '0 0 1 1 *', 'select public.push_dispatch_probe()')" >/dev/null
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -f "$M" >/dev/null 2>&1 && bad "مهمّةٌ ثانية توقظ الفحص ولم تُفشل الترحيلة" || ok "مهمّةٌ ثانية توقظ الفحص تُفشل الترحيلة"
q "select cron.unschedule('m5-test-probe')" >/dev/null

echo "── تشغيلٌ حقيقيّ من pg_cron (بلا سرَّي Vault)"
before="$(q "select to_jsonb(s)::text from public.push_dispatch_state s")"
since="$(q "select now()")"
st=""
for i in $(seq 1 30); do
  st="$(q "select coalesce((select status from cron.job_run_details where jobid = $jid and start_time >= '$since' and status in ('succeeded','failed') order by start_time limit 1),'')")"
  [ -n "$st" ] && break
  sleep 5
done
eq "تشغيلٌ تلقائيّ اكتمل بنجاح" "$st" "succeeded"
eq "ولا عقدَ ولا تيكَ مكتوب" "$(q "select to_jsonb(s)::text from public.push_dispatch_state s")" "$before"
eq "ولا طلبَ HTTP" "$(q "select count(*) from net.http_request_queue")" "0"

echo "── الإيقافُ الطارئ"
eq "cron.unschedule('$J')" "$(q "select cron.unschedule('$J')::text")" "true"
eq "لا مهمّةَ بعده" "$(q "select count(*) from cron.job where jobname = '$J'")" "0"
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -f "$M" >/dev/null 2>&1 && ok "وتُعاد المهمّةُ بالترحيلة نفسها" || bad "تعذّرت إعادةُ المهمّة"
eq "مهمّةٌ واحدة بعد الإعادة" "$(q "select count(*) from cron.job where jobname = '$J'")" "1"

echo
echo "النتيجة: $pass نجح · $fail أخفق"
[ "$fail" -eq 0 ]
