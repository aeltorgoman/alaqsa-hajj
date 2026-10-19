#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# بوابة الحاجّ — M6: تسليمُ التنبيهات إلى الأجهزة — فحوصٌ بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ مؤقّتةٍ وحدها (بعد `db reset` إلى آخر ترحيلة):
#   supabase/verification/portal/m6_push_delivery_tests.sh
#   LOCAL='postgresql:///db?host=/path/to/socket&port=…&user=postgres' …   ← عنقودٌ محلّيٌّ آخر
#
#   الاستحقاق: مجدوَلٌ لم يحن · منتهٍ · موسمٌ آخر · محذوف · أُنهي أثناء التسليم
#   التهيئة مرّةً واحدة · ما أُرسل قبل M6 لا يُعاد
#   عاملان متزامنان لا يتقاطعان (SKIP LOCKED) · حجزٌ حيٌّ لا يُحجز ثانية
#   عاملٌ بطيء انتهت مهلته: نتيجتُه 'stale' ولا تكتب فوق من بعده
#   الإعادة: العابرُ بانتظارٍ متزايد حتى ثلاث · الدائمُ لا يُعاد · 404/410 يحذف الجهاز
#   سجلُّ الحاجّ من أجهزته: وصولُ جهازٍ لا يمحوه فشلُ آخر (بأيّ ترتيب، وبالتزامن) · read_at باقٍ
#   الاكتمال: `push_sent_at` لا يُختم وفي التنبيه جهازٌ مفتوح
#   جهازٌ صار لحاجٍّ آخر لا يُرسل إليه · الصلاحيات: service_role وحده
#
# ⚠️ يرفض أيَّ قاعدةٍ غيرِ محلّيّة، ويحذف ما يكتبه. بياناتٌ مُصطنَعة وحدها، ولا إرسالَ حقيقيّ.
set -uo pipefail
LOCAL="${LOCAL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$LOCAL" in
  *@127.0.0.1:*|*@localhost:*|postgresql:///*) ;;
  *) echo "يرفض: $LOCAL ليست قاعدةً محلّيّة"; exit 2 ;;
esac

pass=0; fail=0
ok()  { echo "PASS — $1"; pass=$((pass + 1)); }
bad() { echo "FAIL — $1"; fail=$((fail + 1)); }
q()   { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
as_user() { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role authenticated; do \$x\$ begin perform set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true); end \$x\$; $2; commit;" 2>&1; }
as_anon() { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role anon; $1; commit;" 2>&1; }
as_svc()  { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role service_role; $1; commit;" 2>&1; }
noexec()  { echo "$1" | grep -q "ERROR:  42501: permission denied for"; }

if [ "$(q "select count(*) from public.seasons where id in (9761, 9762)")" != "0" ]; then echo "يرفض: موسمُ التهيئة موجود"; exit 2; fi
if [ "$(q "select count(*) from public.seasons where closed_at is null")" != "0" ]; then echo "يرفض: في القاعدة موسمٌ مفتوح"; exit 2; fi

U_PORTAL=00000000-0000-0000-0000-00000000ee01
W1=00000000-0000-0000-0000-0000000000a1
W2=00000000-0000-0000-0000-0000000000a2
W3=00000000-0000-0000-0000-0000000000a3

cleanup() {
  q "set app.season_maintenance = 'on';
     delete from public.announcements where id between 4760 and 4799;
     delete from public.pilgrim_push_subscriptions where passenger_id between 5760 and 5799;
     delete from public.passengers where id between 5760 and 5799;
     delete from public.seasons where id in (9761, 9762);
     delete from public.user_profiles where id = '$U_PORTAL';
     delete from auth.users where id = '$U_PORTAL';" > /dev/null
}
trap cleanup EXIT

# 5761: جهازان · 5762: جهازٌ واحد · 5763: بلا جهاز · 5764: حاجٌّ آخر (لاختبار نقل الجهاز)
q "set app.season_maintenance = 'on';
   insert into auth.users (id,email,aud,role) values ('$U_PORTAL','m6-portal@t.local','authenticated','authenticated');
   insert into public.user_profiles (id,email,name,permissions,is_active) values ('$U_PORTAL','m6-portal@t.local','مدير البوابة','{\"manage_portal\":true}',true);
   insert into public.seasons (id,name,hijri_year,closed_at) overriding system value values
     (9762,'موسم M6 مقفل',1475,now() - interval '1 day'), (9761,'موسم M6',1476,null);
   insert into public.passengers (id,season_id,name_ar,gender,passenger_type) overriding system value values
     (5761,9761,'حاج ألف','ذكر','حاج'), (5762,9761,'حاج باء','ذكر','حاج'),
     (5763,9761,'حاج جيم','ذكر','حاج'), (5764,9761,'حاج دال','ذكر','حاج');" > /dev/null

# تنبيهٌ يستهدف الحجّاج الثلاثة الأوائل، وأجهزةٌ جديدةٌ لكلّ سيناريو
new_ann() {  # $1 id · $2 extra columns sql (show_at, expires_at, season, push_sent_at)
  q "set app.season_maintenance = 'on';
     insert into public.announcements (id,season_id,body,target_type,target_ids,show_at,expires_at,push_sent_at)
     overriding system value values ($1, ${3:-9761}, 'M6', 'custom', '{5761,5762,5763}', $2);" > /dev/null
}
new_devices() {  # $1 tag
  q "delete from public.pilgrim_push_subscriptions where passenger_id between 5760 and 5799;
     insert into public.pilgrim_push_subscriptions (passenger_id,endpoint,p256dh,auth) values
       (5761,'https://push.example/m6-$1-a1','k','a'), (5761,'https://push.example/m6-$1-a2','k','a'),
       (5762,'https://push.example/m6-$1-b','k','a');" > /dev/null
}
tid() { q "select t.id from announcement_push_targets t join pilgrim_push_subscriptions s on s.id = t.subscription_id where t.announcement_id = $1 and s.endpoint like '%-$2'"; }
claim() { as_svc "select string_agg(target_id::text || ':' || attempt, ',' order by target_id) from push_claim_targets($1, '$2', ${3:-20}, ${4:-60})"; }
complete() { local cls=null; [ -n "${6:-}" ] && cls="'$6'"; as_svc "select push_complete_target($1, '$2', $3, '$4', ${5:-null}, $cls)"; }
dstat() { q "select string_agg(passenger_id || '=' || status, ',' order by passenger_id) from notification_deliveries where announcement_id = $1"; }
expire_leases() { q "update announcement_push_targets set lease_expires_at = now() - interval '1 second' where announcement_id = $1 and status = 'processing'"; }
due_now() { q "update announcement_push_targets set next_attempt_at = now() - interval '1 second' where announcement_id = $1 and status in ('pending','retryable')"; }

echo "═══ الاستحقاق ═══"
new_devices elig
new_ann 4761 "now() + interval '1 day', null, null"
new_ann 4762 "now() - interval '2 hours', now() - interval '1 hour', null"
new_ann 4763 "now() - interval '1 hour', null, null" 9762
r=$(as_svc "select push_prepare_announcement(4761)->>'reason'"); [ "$r" = "not_due" ] && ok "scheduled in the future → not_due, nothing prepared" || bad "future ($r)"
r=$(as_svc "select push_prepare_announcement(4762)->>'reason'"); [ "$r" = "expired" ] && ok "expired → expired" || bad "expired ($r)"
r=$(as_svc "select push_prepare_announcement(4763)->>'reason'"); [ "$r" = "wrong_season" ] && ok "closed (wrong) season → wrong_season" || bad "wrong season ($r)"
r=$(as_svc "select push_prepare_announcement(4799)->>'reason'"); [ "$r" = "not_found" ] && ok "deleted / unknown announcement → not_found" || bad "not found ($r)"
r=$(q "select count(*) from announcement_push_targets where announcement_id in (4761,4762,4763)")$(q "select count(*) from notification_deliveries where announcement_id in (4761,4762,4763)")
[ "$r" = "00" ] && ok "ineligible announcements: no targets, no delivery rows" || bad "ineligible wrote rows ($r)"
r=$(claim 4761 $W1)$(claim 4762 $W1)$(claim 4763 $W1); [ -z "$r" ] && ok "claim on ineligible announcements → nothing to send" || bad "ineligible claim ($r)"
r=$(as_svc "select push_announcement_ineligible_reason(4761) || ',' || push_announcement_ineligible_reason(4763) || ',' || push_announcement_ineligible_reason(4799)")
[ "$r" = "not_due,wrong_season,not_found" ] && ok "test-endpoint path uses the same eligibility" || bad "ineligible_reason ($r)"
q "update announcements set show_at = now() - interval '1 minute' where id = 4761" > /dev/null
r=$(as_svc "select coalesce(push_announcement_ineligible_reason(4761), 'eligible')"); [ "$r" = "eligible" ] && ok "…and reports eligible once due" || bad "due reason ($r)"
r=$(as_svc "select push_prepare_announcement(4761)->>'prepared'"); [ "$r" = "true" ] && ok "scheduled announcement once due → prepared (M5 path)" || bad "due later ($r)"

echo "═══ التهيئة ═══"
new_devices prep
new_ann 4764 "now() - interval '1 minute', null, null"
r=$(as_svc "select push_prepare_announcement(4764)::text"); echo "$r" | grep -q '"prepared": true' && ok "first prepare → prepared" || bad "prepare ($r)"
r=$(q "select count(*) from announcement_push_targets where announcement_id = 4764"); [ "$r" = "3" ] && ok "one target per device of the audience (2 + 1), none for the pilgrim without a device" || bad "targets ($r)"
r=$(dstat 4764); [ "$r" = "5761=pending,5762=pending,5763=disabled" ] && ok "delivery rows: pending per enabled pilgrim, disabled otherwise" || bad "deliveries ($r)"
r=$(as_svc "select push_prepare_announcement(4764)->>'prepared'")$(q "select count(*) from announcement_push_targets where announcement_id = 4764")
[ "$r" = "false3" ] && ok "repeated prepare (retried request) → no new targets" || bad "re-prepare ($r)"
r=$(q "select push_sent_at is null from announcements where id = 4764"); [ "$r" = "t" ] && ok "push_sent_at not stamped while devices are pending" || bad "early stamp ($r)"
new_ann 4765 "now() - interval '1 minute', null, now() - interval '30 seconds'"
r=$(as_svc "select push_prepare_announcement(4765)->>'prepared'")$(q "select count(*) from announcement_push_targets where announcement_id = 4765")
[ "$r" = "false0" ] && ok "announcement pushed before M6 (push_sent_at set) → never re-sent" || bad "legacy ($r)"
new_ann 4766 "now() - interval '1 minute', null, null"
q "insert into notification_deliveries (announcement_id, passenger_id, status) values (4766, 5761, 'sent')" > /dev/null
r=$(as_svc "select push_prepare_announcement(4766)->>'prepared'")$(q "select count(*) from announcement_push_targets where announcement_id = 4766")
[ "$r" = "false0" ] && ok "pre-M6 delivery rows without a stamp (old run cut short) → never re-sent" || bad "legacy rows ($r)"

echo "═══ عاملان متزامنان ═══"
# الأول يحجز جهازين ويُبقي معاملته مفتوحةً ثانيتين؛ الثاني يحجز أثناءها
T=$(mktemp -d)
psql "$LOCAL" -X -q -At -c "begin; set local role service_role; select string_agg(target_id::text, ',') from push_claim_targets(4764, '$W1', 2, 60); select pg_sleep(2); commit;" > "$T/w1" 2>&1 &
sleep 0.5
psql "$LOCAL" -X -q -At -c "begin; set local role service_role; select string_agg(target_id::text, ',') from push_claim_targets(4764, '$W2', 20, 60); commit;" > "$T/w2" 2>&1 &
wait
a=$(grep -E '^[0-9,]+$' "$T/w1"); b=$(grep -E '^[0-9,]+$' "$T/w2")
all=$(echo "$a,$b" | tr ',' '\n' | grep -v '^$' | sort -n); uniq=$(echo "$all" | sort -nu)
[ "$(echo "$all" | wc -l)" = "3" ] && [ "$all" = "$uniq" ] && [ -n "$a" ] && [ -n "$b" ] \
  && ok "concurrent workers claim disjoint sets covering every device (w1=$a · w2=$b)" || bad "concurrent claim (w1=$a · w2=$b)"
rm -rf "$T"
r=$(claim 4764 $W3); [ -z "$r" ] && ok "devices under a live lease cannot be claimed by a third worker" || bad "live lease claimed ($r)"

echo "═══ عاملٌ بطيء / ساقط ═══"
B=$(tid 4764 b); A1=$(tid 4764 a1); A2=$(tid 4764 a2)
OWNER_B=$(q "select lease_owner from announcement_push_targets where id = $B")
expire_leases 4764
r=$(claim 4764 $W3); [ "$(echo "$r" | tr ',' '\n' | wc -l)" = "3" ] && echo "$r" | grep -q ":2" && ok "expired leases (crashed / slow worker) are reclaimed, attempt → 2" || bad "reclaim ($r)"
r=$(complete $B "$OWNER_B" 1 sent 201); [ "$r" = "stale" ] && ok "slow worker's late result → stale, not written" || bad "stale ($r)"
r=$(q "select status || ':' || lease_owner from announcement_push_targets where id = $B"); [ "$r" = "processing:$W3" ] && ok "…the new owner's lease is intact" || bad "fencing ($r)"
r=$(complete $B $W3 1 sent 201); [ "$r" = "stale" ] && ok "right worker but wrong attempt number → stale" || bad "attempt fence ($r)"

echo "═══ النتائج والإعادة ═══"
r=$(complete $B $W3 2 sent 201); [ "$r" = "sent" ] && ok "success recorded" || bad "sent ($r)"
r=$(complete $A1 $W3 2 retryable 503 server_error); [ "$r" = "retryable" ] && ok "HTTP 503 → retryable" || bad "retryable ($r)"
r=$(q "select round(extract(epoch from next_attempt_at - now()))::int between 15 and 20 from announcement_push_targets where id = $A1"); [ "$r" = "t" ] && ok "backoff after attempt 2 ≈ 20s (5s · 4^(n-1))" || bad "backoff ($r)"
r=$(claim 4764 $W1); [ -z "$r" ] && ok "a retryable device is not claimed before its backoff ends" || bad "early retry ($r)"
r=$(as_svc "select (push_delivery_summary(4764)->>'next_attempt_in_ms')::int between 1 and 20000"); [ "$r" = "t" ] && ok "summary exposes when the next retry is due" || bad "next_attempt_in_ms ($r)"
due_now 4764
r=$(claim 4764 $W1); [ "$r" = "$A1:3" ] && ok "after backoff the device is claimed again (attempt 3)" || bad "retry claim ($r)"
r=$(complete $A1 $W1 3 retryable 429 rate_limited); [ "$r" = "failed" ] && ok "third transient failure → failed (max 3 attempts)" || bad "max attempts ($r)"
due_now 4764
r=$(claim 4764 $W2); [ -z "$(echo "$r" | grep "$A1:")" ] && ok "a device at 3 attempts is never claimed again" || bad "4th attempt ($r)"
r=$(dstat 4764 | cut -d, -f1); [ "$r" = "5761=pending" ] && ok "pilgrim with one failed device and one still open → pending" || bad "pending agg ($r)"
r=$(complete $A2 $W3 2 sent 201); [ "$r" = "sent" ] && ok "second device of the same pilgrim delivered" || bad "a2 ($r)"
r=$(dstat 4764); [ "$r" = "5761=sent,5762=sent,5763=disabled" ] && ok "multi-device: one delivered device wins over a failed one" || bad "agg ($r)"
r=$(q "select push_sent_at is not null from announcements where id = 4764")$(as_svc "select (push_delivery_summary(4764)->>'complete')")
[ "$r" = "ttrue" ] && ok "every device terminal → push_sent_at stamped, summary complete" || bad "complete ($r)"
r=$(as_svc "select (push_delivery_summary(4764)->'next_attempt_in_ms')::text"); [ "$r" = "null" ] && ok "nothing waiting → next_attempt_in_ms is null (not 0: no busy loop)" || bad "next null ($r)"
r=$(as_svc "select push_delivery_summary(4764) - 'next_attempt_in_ms' - 'complete'")
[ "$r" = '{"sent": 2, "total": 3, "failed": 0, "expired": 0, "pending": 0, "disabled": 1}' ] && ok "summary counts pilgrims: total 3 · sent 2 · disabled 1" || bad "summary ($r)"
r=$(as_svc "select push_prepare_announcement(4764)->>'prepared'")$(claim 4764 $W1); [ "$r" = "false" ] && ok "duplicate request after completion → nothing prepared or claimed" || bad "dup after complete ($r)"

echo "═══ أخطاءٌ دائمة · 404/410 · read_at ═══"
new_devices perm
new_ann 4767 "now() - interval '1 minute', null, null"
as_svc "select push_prepare_announcement(4767)" > /dev/null
q "update notification_deliveries set read_at = '2026-01-01 10:00+00' where announcement_id = 4767 and passenger_id = 5761" > /dev/null
claim 4767 $W1 > /dev/null
A1=$(tid 4767 a1); A2=$(tid 4767 a2); B=$(tid 4767 b); SB=$(q "select subscription_id from announcement_push_targets where id = $B")
r=$(complete $A1 $W1 1 failed 403 unauthorized); [ "$r" = "failed" ] && ok "HTTP 403 → failed at once, no retry" || bad "403 ($r)"
r=$(complete $B $W1 1 gone 410 gone)$(q "select count(*) from pilgrim_push_subscriptions where id = $SB")
[ "$r" = "failed0" ] && ok "HTTP 410 → failed (gone) and the subscription is deleted" || bad "410 ($r)"
r=$(q "select coalesce(subscription_id::text,'null') || ':' || last_error_class from announcement_push_targets where id = $B"); [ "$r" = "null:gone" ] && ok "…the target row stays as a record without its device" || bad "gone row ($r)"
r=$(dstat 4767 | cut -d, -f2); [ "$r" = "5762=expired" ] && ok "pilgrim whose only device is gone → expired (as before)" || bad "expired agg ($r)"
due_now 4767; r=$(claim 4767 $W2); [ -z "$(echo "$r" | grep "$A1:")" ] && ok "a permanent failure is never claimed again" || bad "perm reclaimed ($r)"
r=$(complete $A2 $W1 1 sent 201)$(dstat 4767 | cut -d, -f1); [ "$r" = "sent5761=sent" ] && ok "failed device first, delivered device after → sent" || bad "order ($r)"
r=$(q "select read_at = '2026-01-01 10:00+00' from notification_deliveries where announcement_id = 4767 and passenger_id = 5761"); [ "$r" = "t" ] && ok "read_at preserved through every aggregation" || bad "read_at ($r)"
r=$(q "select error from notification_deliveries where announcement_id = 4767 and passenger_id = 5762"); [ "$r" = "gone · HTTP 410" ] && ok "diagnostics: class and HTTP status only (no endpoint, no message)" || bad "error text ($r)"
r=$(q "select count(*) from notification_deliveries where announcement_id = 4767 and error like '%push.example%'")$(q "select count(*) from announcement_push_targets t, pg_attribute a where a.attrelid = 'announcement_push_targets'::regclass and a.attname in ('endpoint','p256dh','auth') and t.id = $A1")
[ "$r" = "00" ] && ok "no endpoint / keys stored in targets or deliveries" || bad "secrets stored ($r)"

echo "═══ وصولٌ ثم فشلٌ لجهازين متزامنين ═══"
new_devices race
new_ann 4768 "now() - interval '1 minute', null, null"
as_svc "select push_prepare_announcement(4768)" > /dev/null
claim 4768 $W1 > /dev/null
A1=$(tid 4768 a1); A2=$(tid 4768 a2)
psql "$LOCAL" -X -q -At -c "begin; set local role service_role; select push_complete_target($A1, '$W1', 1, 'sent', 201, null); select pg_sleep(1); commit;" > /dev/null 2>&1 &
sleep 0.3
psql "$LOCAL" -X -q -At -c "begin; set local role service_role; select push_complete_target($A2, '$W1', 1, 'failed', 400, 'bad_request'); commit;" > /dev/null 2>&1 &
wait
r=$(dstat 4768 | cut -d, -f1); [ "$r" = "5761=sent" ] && ok "concurrent completions on one pilgrim (sent ∥ failed) → sent" || bad "concurrent agg ($r)"
q "update notification_deliveries set status = 'sent' where announcement_id = 4768 and passenger_id = 5762" > /dev/null
r=$(q "select public._push_refresh_delivery(4768, 5762); select status from notification_deliveries where announcement_id = 4768 and passenger_id = 5762" | tail -1)
[ "$r" = "sent" ] && ok "a recorded 'sent' is never downgraded by a later aggregation" || bad "downgrade ($r)"

echo "═══ أُنهي أثناء التسليم · جهازٌ انتقل لحاجٍّ آخر ═══"
new_devices cancel
new_ann 4769 "now() - interval '1 minute', null, null"
as_svc "select push_prepare_announcement(4769)" > /dev/null
q "update pilgrim_push_subscriptions set passenger_id = 5764 where endpoint like '%-cancel-b'" > /dev/null
r=$(claim 4769 $W1 1); B=$(tid 4769 b)
r2=$(q "select status || ':' || last_error_class from announcement_push_targets where id = $B")
[ "$r2" = "failed:reassigned" ] && [ -z "$(echo "$r" | grep "^$B:")" ] && ok "device re-registered to another pilgrim → not sent, closed as reassigned" || bad "reassigned ($r · $r2)"
q "update announcements set expires_at = now() where id = 4769" > /dev/null   # «إنهاء الآن»
r=$(claim 4769 $W2); [ -z "$r" ] && ok "announcement ended mid-delivery → nothing more is claimed" || bad "ended claim ($r)"
r=$(q "select string_agg(status || ':' || coalesce(last_error_class,''), ',' order by id) from announcement_push_targets where announcement_id = 4769")
echo "$r" | grep -q "failed:cancelled" && echo "$r" | grep -q "processing:" && ok "open devices cancelled; a device under a live lease is left to its worker ($r)" || bad "cancel ($r)"
expire_leases 4769; as_svc "select push_prepare_announcement(4769)" > /dev/null
r=$(q "select count(*) filter (where status <> 'failed') || ':' || (select (push_sent_at is not null)::text from announcements where id = 4769) from announcement_push_targets where announcement_id = 4769")
[ "$r" = "0:true" ] && ok "after its lease expires the ended announcement closes and is marked complete" || bad "cancel finalize ($r)"

echo "═══ عاملٌ سقط بعد محاولته الثالثة ═══"
new_devices aband
new_ann 4770 "now() - interval '1 minute', null, null"
as_svc "select push_prepare_announcement(4770)" > /dev/null
q "update announcement_push_targets set attempts = 2 where announcement_id = 4770" > /dev/null
claim 4770 $W1 > /dev/null; expire_leases 4770
r=$(claim 4770 $W2)$(q "select string_agg(distinct status || ':' || last_error_class, ',') from announcement_push_targets where announcement_id = 4770")
[ "$r" = "failed:abandoned" ] && ok "lease expired on attempt 3 → abandoned (failed), no 4th send" || bad "abandoned ($r)"

echo "═══ الصلاحيات ═══"
for fn in "push_prepare_announcement(4764)" "push_claim_targets(4764, '$W1', 20, 60)" "push_complete_target(1, '$W1', 1, 'sent', 201, null)" "push_delivery_summary(4764)" "push_announcement_ineligible_reason(4764)"; do
  r=$(as_user $U_PORTAL "select $fn"); noexec "$r" && ok "authenticated with manage_portal cannot call ${fn%%(*}" || bad "authenticated ${fn%%(*} ($r)"
  r=$(as_anon "select $fn"); noexec "$r" && ok "anon cannot call ${fn%%(*}" || bad "anon ${fn%%(*} ($r)"
done
r=$(as_user $U_PORTAL "select count(*) from announcement_push_targets"); noexec "$r" && ok "announcement_push_targets not readable by authenticated" || bad "targets select ($r)"
r=$(as_anon "select count(*) from announcement_push_targets"); noexec "$r" && ok "announcement_push_targets not readable by anon" || bad "targets anon ($r)"
r=$(as_user $U_PORTAL "select count(*) from notification_deliveries where announcement_id = 4764"); [ "$r" = "3" ] && ok "manage_portal still reads notification_deliveries (report unchanged)" || bad "deliveries select ($r)"
r=$(as_user $U_PORTAL "select count(*) from announcement_audience('all','{}')"); [ "$r" = "4" ] && ok "L1 audience RPC unchanged for manage_portal" || bad "audience ($r)"
r=$(q "select (select prosecdef from pg_proc where oid = 'public._push_lock(bigint)'::regprocedure)::text || has_function_privilege('service_role','public._push_refresh_delivery(bigint,bigint)','EXECUTE')::text")
[ "$r" = "truefalse" ] && ok "internal helpers not executable even by service_role" || bad "helpers ($r)"

echo
echo "pass=$pass fail=$fail"
[ "$fail" = "0" ]
