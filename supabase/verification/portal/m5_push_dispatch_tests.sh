#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# بوابة الحاجّ — M5: دفعُ المجدوَل حين يحين — فحوصٌ بالتنفيذ (القاعدة)
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ مؤقّتةٍ وحدها (بعد `db reset` إلى آخر ترحيلة):
#   supabase/verification/portal/m5_push_dispatch_tests.sh
#   LOCAL='postgresql:///db?host=/path/to/socket&port=…&user=postgres' …
#
#   الاستحقاق: حان · لم يحن · منتهٍ · أُنهي (إلغاء) · موسمٌ آخر · مكتمل · أُرسل قبل M6
#              · تحت الحدّ التاريخيّ · مُهيّأٌ له جهازٌ يُحجز
#   التأخّر: فات موعدُه بساعاتٍ أو أيّام (المُجدوِل كان معطَّلاً) وما زال سارياً ← مستحقّ؛ ومنتهٍ ← أبداً
#   الحدُّ التاريخيّ: ثابت (تعديل/حذف/تفريغ مرفوض)، وإعادةُ البذر لا تعيده
#   الجمهورُ المخصّص: التهيئةُ لا تبلغ إلا حجّاجَه وأجهزتَهم
#   التيك: idle بلا طلب · not_configured بلا pg_net/Vault أو بعنوانٍ/مفتاحٍ فاسد · dispatched
#          بطلبٍ واحد · busy ما دام العقدُ حيّاً · تيكان متزامنان ← طلبٌ واحد
#          · لا يهيّئ ولا يحجز ولا يرسل بنفسه
#   العقد: begin لمرّةٍ واحدة وللعقد الحيّ وحده · end لصاحبه وحده · ينقضي وحده
#   الفحص (probe): طلبٌ بلا عقد، فلا dispatch يُقبل به
#   الصلاحيات: التيكُ والفحصُ للمالك وحده · الواجهةُ لـservice_role · الجدولُ لا يُقرأ
#   لا تفعيلَ تلقائيّ: لا مهمّةَ مجدوَلة، ولا امتدادَ مُثبَّت بالترحيلة
#
# pg_net وVault غيرُ مثبَّتَين محلّيّاً: يُنشأ بديلٌ يسجّل الطلبَ ولا يرسله (net.http_post)
# وجدولُ أسرارٍ بقيمٍ مُصطنَعة (vault.decrypted_secrets)، ويُحذفان في الآخر. لا شبكة.
# ⚠️ يرفض أيَّ قاعدةٍ غيرِ محلّيّة، ويرفض قاعدةً فيها pg_net أو Vault حقيقيّ، ويحذف ما يكتبه.
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
q()   { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
qe()  { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "$1" 2>&1; }
as_role() { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role $1; $2; commit;" 2>&1; }
noexec()  { echo "$1" | grep -q "ERROR:  42501: permission denied for"; }

if [ "$(q "select count(*) from pg_extension where extname in ('pg_net','supabase_vault')")" != "0" ]; then
  echo "يرفض: في القاعدة pg_net أو Vault حقيقيّ — هذه الفحوص تستبدلهما"; exit 2; fi
if [ "$(q "select count(*) from public.seasons where id in (9781, 9782)")" != "0" ]; then echo "يرفض: موسمُ التهيئة موجود"; exit 2; fi
if [ "$(q "select count(*) from public.seasons where closed_at is null")" != "0" ]; then echo "يرفض: في القاعدة موسمٌ مفتوح"; exit 2; fi
if [ "$(q "select count(*) from pg_namespace where nspname in ('net','vault')")" != "0" ]; then echo "يرفض: مخطّط net أو vault موجود"; exit 2; fi

CUT0="$(q "select cutoff_id from public.push_dispatch_state")"
# رمزٌ عشوائيّ لهذا التشغيل وحده (٢٥٦ بتّاً، base64url)
KEY="$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')"
URL="https://m5-local.invalid/functions/v1/push-dispatch"

cleanup() {
  q "set session_replication_role = replica;
     update public.push_dispatch_state set cutoff_id = $CUT0, lease_run_id = null, lease_expires_at = null,
            lease_started = false, last_tick_at = null, last_tick_result = null, last_run_at = null, last_run_result = null;
     set session_replication_role = origin;
     set app.season_maintenance = 'on';
     delete from public.announcements where id between 4800 and 4839;
     delete from public.pilgrim_push_subscriptions where passenger_id between 5800 and 5819;
     delete from public.passengers where id between 5800 and 5819;
     delete from public.seasons where id in (9781, 9782);
     drop schema if exists net cascade; drop schema if exists vault cascade;" > /dev/null 2>&1
}
trap cleanup EXIT

# 5801 جهازان · 5802 جهاز · 5803 بلا جهاز · 5804 خارج الجمهور المخصّص بجهاز
q "set app.season_maintenance = 'on';
   insert into public.seasons (id,name,hijri_year,closed_at) overriding system value values
     (9782,'موسم M5 مقفل',1479,now() - interval '1 day'), (9781,'موسم M5',1480,null);
   insert into public.passengers (id,season_id,name_ar,gender,passenger_type) overriding system value values
     (5801,9781,'حاج ألف','ذكر','حاج'), (5802,9781,'حاج باء','ذكر','حاج'),
     (5803,9781,'حاج جيم','ذكر','حاج'), (5804,9781,'حاج دال','ذكر','حاج');
   insert into public.pilgrim_push_subscriptions (passenger_id,endpoint,p256dh,auth) values
     (5801,'https://push.example/m5-a1','k','a'), (5801,'https://push.example/m5-a2','k','a'),
     (5802,'https://push.example/m5-b','k','a'), (5804,'https://push.example/m5-d','k','a');" > /dev/null

ann() {  # $1 id · $2 show_at · $3 expires_at · $4 season · $5 push_sent_at
  q "set app.season_maintenance = 'on';
     insert into public.announcements (id,season_id,body,target_type,target_ids,show_at,expires_at,push_sent_at)
     overriding system value values ($1, ${4:-9781}, 'M5', 'custom', '{5801,5802,5803}', $2, ${3:-null}, ${5:-null});" > /dev/null
}
due() { as_role service_role "select coalesce(array_to_string(push_due_announcements(20), ','), '')"; }
tick() { q "select public.push_dispatch_tick()"; }
calls() { q "select count(*) from net.calls"; }
has() { case ",$1," in *",$2,"*) return 0;; *) return 1;; esac; }

echo "── الحدُّ التاريخيّ ثابت"
eq "صفٌّ واحدٌ بلا عقد" "$(q "select count(*) || ':' || bool_and(lease_run_id is null) from push_dispatch_state")" "1:true"
r="$(qe "update public.push_dispatch_state set cutoff_id = cutoff_id + 1")"
echo "$r" | grep -q "42501" && ok "تعديلُ cutoff_id مرفوض" || bad "تعديلُ cutoff_id قُبل: $r"
r="$(qe "update public.push_dispatch_state set cutoff_at = now() - interval '1 year'")"
echo "$r" | grep -q "42501" && ok "تعديلُ cutoff_at مرفوض" || bad "تعديلُ cutoff_at قُبل: $r"
r="$(qe "delete from public.push_dispatch_state")"
echo "$r" | grep -q "42501" && ok "حذفُ الصفّ مرفوض" || bad "حذفُ الصفّ قُبل: $r"
r="$(qe "truncate public.push_dispatch_state")"
echo "$r" | grep -q "42501" && ok "تفريغُ الجدول مرفوض" || bad "تفريغُ الجدول قُبل: $r"
q "insert into public.push_dispatch_state (id, cutoff_id, cutoff_at) select true, 999999, now() on conflict (id) do nothing" > /dev/null
eq "إعادةُ البذر (ترحيلةٌ أو إعادةُ نشر) لا تعيد الحدّ" "$(q "select cutoff_id from push_dispatch_state")" "$CUT0"

# للفحص وحده: حدٌّ عند 4805 (بلا محفّزات، ويُعاد في الآخر)
q "set session_replication_role = replica; update public.push_dispatch_state set cutoff_id = 4805; set session_replication_role = origin;" > /dev/null

echo "── الاستحقاق"
eq "لا مستحقّ ← قائمةٌ فارغة" "$(due)" ""
eq "لا مستحقّ ← التيك idle" "$(tick)" "idle"
eq "idle لا يكتب شيئاً" "$(q "select (last_tick_at is null and lease_run_id is null)::text from push_dispatch_state")" "true"
ann 4801 "now() - interval '2 minutes'" "" 9781                                  # تحت الحدّ
ann 4810 "now() - interval '2 minutes'"                                           # مستحقّ
ann 4811 "now() + interval '1 hour'"                                              # لم يحن
ann 4812 "now() - interval '2 hours'" "now() - interval '1 minute'"               # منتهٍ
ann 4813 "now() - interval '5 minutes'"                                           # سيُلغى (endNow)
ann 4814 "now() - interval '2 minutes'" "" 9782                                   # موسمٌ آخر
ann 4815 "now() - interval '2 minutes'" "" 9781 "now()"                           # مكتمل
ann 4816 "now() - interval '2 minutes'"                                           # أُرسل قبل M6
ann 4817 "now() - interval '3 hours'"                                             # فات بساعات، سارٍ
ann 4818 "now() - interval '3 days'"                                              # فات بأيّام، بلا انتهاء
ann 4819 "now() - interval '3 days'" "now() - interval '1 hour'"                  # فات وانتهى
q "update public.announcements set expires_at = now() where id = 4813" > /dev/null
q "insert into public.notification_deliveries (announcement_id, passenger_id, status) values (4816, 5801, 'sent')" > /dev/null
D="$(due)"
has "$D" 4810 && ok "حان، في الموسم، بلا تسليم ← مستحقّ" || bad "4810 ليس مستحقّاً ($D)"
for x in "4801:تحت الحدّ التاريخيّ" "4811:لم يحن" "4812:منتهٍ" "4813:أُنهي (إلغاء)" "4814:موسمٌ آخر" \
         "4815:مكتمل (push_sent_at)" "4816:أُرسل قبل M6 (سجلّات)" "4819:فات موعدُه وانتهى"; do
  id="${x%%:*}"; has "$D" "$id" && bad "${x#*:} ← مستحقّ ($D)" || ok "${x#*:} ← ليس مستحقّاً"
done
has "$D" 4817 && ok "فات موعدُه بثلاث ساعات وما زال سارياً ← مستحقّ (لا يُتخطّى لتعطّل المُجدوِل)" || bad "4817 تُخطّي ($D)"
has "$D" 4818 && ok "فات موعدُه بثلاثة أيّام بلا انتهاء ← مستحقّ" || bad "4818 تُخطّي ($D)"
eq "المستحقّ بترتيب موعده: الأقدمُ أولاً" "$D" "4818,4817,4810"
q "update public.announcements set expires_at = now() where id = 4817" > /dev/null
eq "المتأخّرُ حين ينتهي (أُنهي) ← يخرج فوراً" "$(due)" "4818,4810"
r="$(as_role service_role "select push_prepare_announcement(4817)::text")"
echo "$r" | grep -q '"reason": "expired"' && ok "والتهيئةُ نفسُها (M6) ترفضه منتهياً" || bad "تهيئةُ المنتهي: $r"
eq "ولا هدفَ له" "$(q "select count(*) from announcement_push_targets where announcement_id = 4817")" "0"
q "insert into public.notification_deliveries (announcement_id, passenger_id, status, read_at) values (4818, 5802, 'read', now())" > /dev/null
eq "سجلُّ read (حاجٌّ فتح التنبيه في البوابة) لا يُخرجه من المستحقّ" "$(due)" "4818,4810"
r="$(as_role service_role "select push_prepare_announcement(4818)::text")"
echo "$r" | grep -q '"prepared": true' && ok "والتهيئةُ (M6) تقبله: read ليس دليلَ دفع" || bad "تهيئة 4818 مع read: $r"
eq "و read_at باقٍ بعد التهيئة" "$(q "select (read_at is not null)::text from notification_deliveries where announcement_id = 4818 and passenger_id = 5802")" "true"
q "update public.announcements set push_sent_at = now() where id = 4818" > /dev/null
eq "المستحقّ وحده" "$(due)" "4810"

echo "── الجمهورُ المخصّص (تهيئة M6 من مسار M5)"
r="$(as_role service_role "select push_prepare_announcement(4810)::text")"
echo "$r" | grep -q '"prepared": true' && ok "التهيئةُ مرّةً" || bad "التهيئة: $r"
eq "أهدافُ 4810: أجهزةُ جمهوره وحده" \
  "$(q "select string_agg(t.passenger_id::text, ',' order by t.passenger_id) from announcement_push_targets t where t.announcement_id = 4810")" "5801,5801,5802"
eq "5804 (خارج الجمهور، له جهاز) لا هدفَ ولا سجلّ" \
  "$(q "select (select count(*) from announcement_push_targets where announcement_id = 4810 and passenger_id = 5804) + (select count(*) from notification_deliveries where announcement_id = 4810 and passenger_id = 5804)")" "0"
eq "5803 (بلا جهاز) disabled" "$(q "select status from notification_deliveries where announcement_id = 4810 and passenger_id = 5803")" "disabled"
eq "مُهيّأٌ أهدافُه pending ← ما زال مستحقّاً (يُحجز)" "$(due)" "4810"
q "update announcement_push_targets set status = 'retryable', attempts = 1, next_attempt_at = now() + interval '1 hour' where announcement_id = 4810" > /dev/null
eq "مُهيّأٌ ومحاولتُه مؤجَّلة ← ليس مستحقّاً الآن" "$(due)" ""
q "update announcement_push_targets set next_attempt_at = now() - interval '1 second' where announcement_id = 4810" > /dev/null
eq "حان موعدُ إعادته ← مستحقّ" "$(due)" "4810"
q "update announcement_push_targets set status = 'failed', attempts = 3 where announcement_id = 4810" > /dev/null
eq "محاولاتُه الثلاث استُنفدت (failed) ← ليس مستحقّاً" "$(due)" ""
q "update announcement_push_targets set status = 'processing', attempts = 3, lease_owner = gen_random_uuid(), lease_expires_at = now() - interval '1 second' where announcement_id = 4810" > /dev/null
eq "حجزٌ انقضى (عاملٌ سقط) ← مستحقّ ليُغلق أو يُعاد" "$(due)" "4810"
q "update announcement_push_targets set status = 'pending', attempts = 0, lease_owner = null, lease_expires_at = null where announcement_id = 4810;
   update public.announcements set show_at = now() - interval '3 hours' where id = 4810" > /dev/null
eq "فات موعدُه بساعات وقد بدأ تسليمُه ← يُستكمل" "$(due)" "4810"

echo "── التيك: الضبط"
eq "مستحقٌّ بلا pg_net ولا Vault ← not_configured" "$(tick)" "not_configured"
eq "not_configured لا يكتب عقداً" "$(q "select (lease_run_id is null)::text from push_dispatch_state")" "true"

# بديلٌ محلّيٌّ لـpg_net (يسجّل ولا يرسل) ولـVault (قيمٌ مُصطنَعة)
q "create schema net; create table net.calls (id bigserial, url text, body jsonb, headers jsonb, timeout_ms int);
   create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                                 headers jsonb default '{}', timeout_milliseconds int default 2000)
   returns bigint language sql as \$f\$ insert into net.calls (url, body, headers, timeout_ms)
     values (url, body, headers, timeout_milliseconds) returning id \$f\$;
   create schema vault; create table vault.decrypted_secrets (name text primary key, decrypted_secret text);" > /dev/null
eq "pg_net بلا أسرار ← not_configured" "$(tick)" "not_configured"
q "insert into vault.decrypted_secrets values ('push_dispatch_url', 'http://m5-local.invalid/functions/v1/push-dispatch'), ('push_dispatch_token', '$KEY')" > /dev/null
eq "عنوانٌ بلا https ← not_configured" "$(tick)" "not_configured"
q "update vault.decrypted_secrets set decrypted_secret = 'https://m5-local.invalid/functions/v1/send-pilgrim-push' where name = 'push_dispatch_url'" > /dev/null
eq "عنوانُ دالّةٍ أخرى ← not_configured (لا يُرسل الرمزُ إليها)" "$(tick)" "not_configured"
q "update vault.decrypted_secrets set decrypted_secret = '$URL' where name = 'push_dispatch_url'" > /dev/null
for bad_tok in "short_token_only_20chars" "$(printf 'ab%.0s' $(seq 1 22))" "sb_""secret_$(printf 'a%.0s' $(seq 1 40))" "eyJ$(printf 'b%.0s' $(seq 1 60))" "has space $(printf 'c%.0s' $(seq 1 40))"; do
  q "update vault.decrypted_secrets set decrypted_secret = '$bad_tok' where name = 'push_dispatch_token'" > /dev/null
  eq "رمزٌ مرفوضُ الشكل (${bad_tok:0:6}…) ← not_configured" "$(tick)" "not_configured"
done
eq "ولا طلبَ في كلّ ما سبق" "$(calls)" "0"
q "update vault.decrypted_secrets set decrypted_secret = '$KEY' where name = 'push_dispatch_token'" > /dev/null

echo "── التيك والعقد"
T0="$(q "select count(*) from announcement_push_targets")"
eq "مضبوطٌ ومستحقّ ← dispatched" "$(tick)" "dispatched"
eq "طلبٌ واحد" "$(calls)" "1"
RUN="$(q "select lease_run_id from push_dispatch_state")"
eq "الطلب: العنوانُ المضبوط" "$(q "select url from net.calls order by id desc limit 1")" "$URL"
eq "الطلب: dispatch برقم العقد" "$(q "select (body->>'mode') || ':' || (body->>'run_id') from net.calls order by id desc limit 1")" "dispatch:$RUN"
eq "الطلب: الرمزُ في x-push-dispatch-token وحده — لا apikey ولا Authorization، ولا في الجسم" \
  "$(q "select (headers->>'x-push-dispatch-token' = '$KEY')::text || ':' || (headers ? 'apikey')::text || ':' || (headers ? 'Authorization')::text || ':' || (body::text like '%$KEY%')::text from net.calls order by id desc limit 1")" "true:false:false:false"
eq "الطلب: مهلة ١٥٠ث" "$(q "select timeout_ms from net.calls order by id desc limit 1")" "150000"
eq "العقد: ١٨٠ث، لم يبدأ" "$(q "select (lease_expires_at between now() + interval '170 seconds' and now() + interval '181 seconds')::text || ':' || lease_started::text from push_dispatch_state")" "true:false"
eq "التيك لا يهيّئ ولا يحجز بنفسه" "$(q "select count(*) from announcement_push_targets")" "$T0"
eq "عقدٌ حيّ ← busy" "$(tick)" "busy"
eq "busy بلا طلب" "$(calls)" "1"
eq "begin بعقدٍ آخر (مُختلَق) ← false" "$(as_role service_role "select push_dispatch_begin(gen_random_uuid())")" "f"
eq "والمُختلَقُ لا يُنشئ عقداً ولا يغيّر الحال" "$(q "select lease_run_id::text || ':' || lease_started::text from push_dispatch_state")" "$RUN:false"
noexec "$(as_role service_role "update public.push_dispatch_state set lease_run_id = gen_random_uuid(), lease_expires_at = now() + interval '1 hour'")" \
  && ok "مفتاحُ الخدمة نفسُه (ما تملكه الدالّة) لا يكتب عقداً في الجدول" || bad "service_role يكتب عقداً"
eq "begin بلا عقد (null) ← false" "$(as_role service_role "select push_dispatch_begin(null)")" "f"
eq "begin بعقده ← true" "$(as_role service_role "select push_dispatch_begin('$RUN')")" "t"
eq "begin ثانيةً بالعقد نفسه ← false (مرّةً واحدة)" "$(as_role service_role "select push_dispatch_begin('$RUN')")" "f"
eq "end بعقدٍ آخر ← false، والعقدُ باقٍ" "$(as_role service_role "select push_dispatch_end(gen_random_uuid(), null)")::$(q "select lease_run_id from push_dispatch_state")" "f::$RUN"
eq "end بعقده ← true" "$(as_role service_role "select push_dispatch_end('$RUN', '{\"due\":1}')")" "t"
eq "العقدُ أُنهي، والنتيجةُ أعداد" "$(q "select (lease_run_id is null)::text || ':' || last_run_result::text from push_dispatch_state")" 'true:{"due": 1}'
eq "begin بعد الإنهاء ← false" "$(as_role service_role "select push_dispatch_begin('$RUN')")" "f"

eq "تيكٌ جديد ← dispatched" "$(tick)" "dispatched"
RUN2="$(q "select lease_run_id from push_dispatch_state")"
[ "$RUN2" != "$RUN" ] && ok "عقدٌ جديد برقمٍ جديد" || bad "العقدُ أُعيد برقمه"
q "update push_dispatch_state set lease_expires_at = now() - interval '1 second'" > /dev/null
eq "عقدٌ انقضى (الدالّة سقطت) ← begin false" "$(as_role service_role "select push_dispatch_begin('$RUN2')")" "f"
eq "عقدٌ انقضى ← لا يحبس المُجدوِل: dispatched" "$(tick)" "dispatched"
RUN3="$(q "select lease_run_id from push_dispatch_state")"
eq "end بالعقد المنقضي القديم لا يمسّ الجديد" "$(as_role service_role "select push_dispatch_end('$RUN2', null)")::$(q "select lease_run_id from push_dispatch_state")" "f::$RUN3"
q "update push_dispatch_state set lease_run_id = null, lease_expires_at = null, lease_started = false" > /dev/null

echo "── begin متزامنان بالعقد نفسه (طلبٌ مشروعٌ وآخرُ مُعاد)"
q "update push_dispatch_state set lease_run_id = null, lease_expires_at = null, lease_started = false" > /dev/null
eq "تيك ← dispatched" "$(tick)" "dispatched"
RUNC="$(q "select lease_run_id from push_dispatch_state")"
A="$(mktemp)"; B="$(mktemp)"
psql "$LOCAL" -X -q -At -c "begin; set local role service_role; select push_dispatch_begin('$RUNC'); select pg_sleep(1); commit;" > "$A" 2>&1 &
sleep 0.3
psql "$LOCAL" -X -q -At -c "begin; set local role service_role; select push_dispatch_begin('$RUNC'); commit;" > "$B" 2>&1 &
wait
eq "واحدٌ يقبل والآخر يُرفض" "$(cat "$A" "$B" | grep -xE "[tf]" | sort | paste -sd,)" "f,t"
rm -f "$A" "$B"
q "update push_dispatch_state set lease_run_id = null, lease_expires_at = null, lease_started = false" > /dev/null

echo "── تيكان متزامنان"
N0="$(calls)"
A="$(mktemp)"; B="$(mktemp)"
psql "$LOCAL" -X -q -At -c "begin; select public.push_dispatch_tick(); select pg_sleep(1.5); commit;" > "$A" 2>&1 &
sleep 0.4
psql "$LOCAL" -X -q -At -c "begin; select public.push_dispatch_tick(); commit;" > "$B" 2>&1 &
wait
eq "الأولُ dispatched والثاني busy (انتظر قفلَ الصفّ ثم رأى العقد)" "$(head -1 "$A"):$(head -1 "$B")" "dispatched:busy"
eq "طلبٌ واحدٌ لا اثنان" "$(( $(calls) - N0 ))" "1"
rm -f "$A" "$B"
q "update push_dispatch_state set lease_run_id = null, lease_expires_at = null, lease_started = false" > /dev/null

echo "── الفحص (probe)"
N0="$(calls)"
eq "probe ← probe_sent" "$(q "select public.push_dispatch_probe()")" "probe_sent"
eq "probe: mode=probe بلا run_id" "$(q "select (body->>'mode') || ':' || coalesce(body->>'run_id','-') from net.calls order by id desc limit 1")" "probe:-"
eq "probe: لا عقد" "$(q "select (lease_run_id is null)::text from push_dispatch_state")" "true"
eq "probe: طلبٌ واحد ولا أهدافَ جديدة" "$(( $(calls) - N0 )):$(q "select count(*) from announcement_push_targets")" "1:$T0"

echo "── خطأُ pg_net لا يكشف الرمز ولا يترك عقداً"
q "update push_dispatch_state set lease_run_id = null, lease_expires_at = null, lease_started = false;
   create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                                 headers jsonb default '{}', timeout_milliseconds int default 2000)
   returns bigint language plpgsql as \$f\$ begin raise exception 'pg_net down'; end \$f\$;" > /dev/null
r="$(psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "set log_min_messages = 'debug1'; select public.push_dispatch_tick()" 2>&1)"
echo "$r" | grep -q "pg_net down" && ok "الخطأُ يبلغ المُجدوِل" || bad "لم يبلغ الخطأ: $r"
echo "$r" | grep -qF "$KEY" && bad "الرمزُ في رسالة الخطأ أو سياقها" || ok "رسالةُ الخطأ وسياقُها بلا رمز"
eq "خطأُ الطلب يُرجع العقدَ (لا عقدَ معلَّق)" "$(q "select (lease_run_id is null)::text from push_dispatch_state")" "true"
q "create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                                 headers jsonb default '{}', timeout_milliseconds int default 2000)
   returns bigint language sql as \$f\$ insert into net.calls (url, body, headers, timeout_ms)
     values (url, body, headers, timeout_milliseconds) returning id \$f\$;" > /dev/null
eq "الحالُ لا تحفظ الرمز" "$(q "select (to_jsonb(s)::text like '%$KEY%')::text from push_dispatch_state s")" "false"
eq "ولا نصُّ دالّةٍ في القاعدة" "$(q "select count(*) from pg_proc where prosrc like '%$KEY%'")" "0"

echo "── الصلاحيات"
for r in anon authenticated service_role; do
  noexec "$(as_role $r "select public.push_dispatch_tick()")" && ok "$r لا ينفّذ push_dispatch_tick" || bad "$r ينفّذ push_dispatch_tick"
  noexec "$(as_role $r "select public.push_dispatch_probe()")" && ok "$r لا ينفّذ push_dispatch_probe" || bad "$r ينفّذ push_dispatch_probe"
  noexec "$(as_role $r "select public._push_due_ids(5)")" && ok "$r لا ينفّذ _push_due_ids" || bad "$r ينفّذ _push_due_ids"
  noexec "$(as_role $r "select * from public._push_dispatch_target()")" && ok "$r لا يقرأ _push_dispatch_target" || bad "$r يقرأ _push_dispatch_target"
  noexec "$(as_role $r "select * from public.push_dispatch_state")" && ok "$r لا يقرأ push_dispatch_state" || bad "$r يقرأ push_dispatch_state"
done
for r in anon authenticated; do
  noexec "$(as_role $r "select public.push_due_announcements(5)")" && ok "$r لا ينفّذ push_due_announcements" || bad "$r ينفّذ push_due_announcements"
  noexec "$(as_role $r "select public.push_dispatch_begin(gen_random_uuid())")" && ok "$r لا ينفّذ push_dispatch_begin" || bad "$r ينفّذ push_dispatch_begin"
  noexec "$(as_role $r "select public.push_dispatch_end(gen_random_uuid(), null)")" && ok "$r لا ينفّذ push_dispatch_end" || bad "$r ينفّذ push_dispatch_end"
done
eq "service_role ينفّذ الواجهةَ الثلاث" \
  "$(as_role service_role "select (push_due_announcements(1) is not null)::text || ':' || push_dispatch_begin(gen_random_uuid())::text || ':' || push_dispatch_end(gen_random_uuid(), null)::text")" "true:false:false"

echo "── لا تفعيلَ تلقائيّ"
eq "لا pg_cron ولا pg_net مثبَّتَين بالترحيلة" "$(q "select count(*) from pg_extension where extname in ('pg_cron','pg_net')")" "0"
eq "لا مخطّطَ cron" "$(q "select count(*) from pg_namespace where nspname = 'cron'")" "0"
grep -qiE "^\s*(create|alter)\s+extension|cron\.schedule" \
  "$(dirname "$0")/../../migrations/20261020153000_m5_scheduled_push_dispatch.sql" \
  && bad "الترحيلةُ تثبّت امتداداً أو تجدول" || ok "الترحيلةُ لا تثبّت امتداداً ولا تجدول"

echo
echo "النتيجة: $pass نجح · $fail أخفق"
[ "$fail" -eq 0 ]
