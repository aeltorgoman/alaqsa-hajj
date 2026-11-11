#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# بوابة الحاجّ — Phase 1: التنبيهات — فحوصٌ بالتنفيذ (ترحيلة 20261110122335)
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ مؤقّتةٍ وحدها (بعد `db reset` إلى آخر ترحيلة):
#   supabase/verification/portal/announcements_phase1_tests.sh
#   LOCAL='postgresql:///db?host=/path/to/socket&port=…&user=postgres' …   ← عنقودٌ محلّيٌّ آخر
#
#   الجمهور: التحقّق · كلُّ فئة (الكلّ للحجّاج وحدهم · الأنواع · باص · منى · عرفة · خيمةٌ
#     خاصّة · فندق · رحلة ذهاب/عودة · حاجٌّ بعينه) · اتّحادٌ بلا تكرار · التجميدُ عند النشر
#     وثباتُه بعد تغيّر الإسناد · المجدوَلُ يُجمَّد عند موعده لا قبله
#   البوابة: العنوانُ والنصُّ كاملين · ١٠ ثم «المزيد» · المثبَّتُ ثم العاجلُ ثم الأحدث
#     · جديد/مُحدَّث/مقروء · فتحُ البوابة لا يُقرئ شيئاً · إقرارُ تنبيهٍ واحد · عزلُ الحجّاج
#     · المنتهي والمجدوَل لا يُعرضان
#   التعديل: النسخة · جولةُ دفعٍ جديدة للجمهور المجمَّد نفسه · المجدوَلُ لا يُدفع قبل موعده
#     · التثبيتُ والأولويةُ والانتهاء بلا دفع · سياجُ العامل القديم · العميلُ لا يعدّل النصّ مباشرة
#   الحذف: نهائيٌّ بما يتبعه · أثرٌ في audit_log بلا محتوى · الصلاحيات · الموسمُ المقفل
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
eq()  { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }
q()   { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
qe()  { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "$1" 2>&1; }
staff() { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role authenticated; do \$x\$ begin perform set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true); end \$x\$; $2; commit;" 2>&1; }
anon()  { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role anon; do \$x\$ begin perform set_config('request.headers', '{\"x-forwarded-for\":\"10.30.0.9\"}', true); end \$x\$; $1; commit;" 2>&1; }
svc()   { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role service_role; $1; commit;" 2>&1; }

if [ "$(q "select count(*) from public.seasons where id in (9791, 9792)")" != "0" ]; then echo "يرفض: موسمُ التهيئة موجود"; exit 2; fi
if [ "$(q "select count(*) from public.seasons where closed_at is null")" != "0" ]; then echo "يرفض: في القاعدة موسمٌ مفتوح"; exit 2; fi

U_ADMIN=00000000-0000-0000-0000-0000000097a1
U_STAFF=00000000-0000-0000-0000-0000000097a2
cleanup() {
  q "set app.season_maintenance = 'on';
     delete from public.announcements where season_id in (9791, 9792);
     delete from public.pilgrim_push_subscriptions where passenger_id between 5790 and 5799;
     delete from public.pilgrim_sessions where passenger_id between 5790 and 5799;
     delete from public.passengers where id between 5790 and 5799;
     delete from public.rooms where id in (8491, 8492);
     delete from public.hotels where id = 8391;
     delete from public.flights where id in (7391, 7392);
     delete from public.camps where id in (6891, 6892, 6893);
     delete from public.buses where id in (6791, 6792);
     delete from public.seasons where id in (9791, 9792);
     delete from public.user_profiles where id in ('$U_ADMIN', '$U_STAFF');
     delete from auth.users where id in ('$U_ADMIN', '$U_STAFF');" > /dev/null
}
TMPD="$(mktemp -d)"
trap 'cleanup; rm -rf "$TMPD"' EXIT

#   5791 حاجّ: باص ١ · منى ١ (عاديّ) · عرفة ١ · غرفة في الفندق · رحلة الذهاب
#   5792 حاجّ: باص ٢ · منى خاصّ (خيمة خاصّة) · رحلة العودة
#   5793 مرافق: باص ١          5794 حاجّ: بلا إسناد       5795 إداريّ: بلا إسناد
q "set app.season_maintenance = 'on';
   insert into auth.users (id,email,aud,role) values
     ('$U_ADMIN','p1-admin@t.local','authenticated','authenticated'), ('$U_STAFF','p1-staff@t.local','authenticated','authenticated');
   insert into public.user_profiles (id,email,name,permissions,is_active) values
     ('$U_ADMIN','p1-admin@t.local','مدير البوابة','{\"manage_portal\":true}',true),
     ('$U_STAFF','p1-staff@t.local','موظّف','{\"manage_passengers\":true}',true);
   insert into public.seasons (id,name,hijri_year,closed_at) overriding system value values
     (9792,'موسم مقفل P1',1477,now() - interval '1 day'), (9791,'موسم P1',1478,null);
   insert into public.buses (id,season_id,name) overriding system value values (6791,9791,'باص ١'),(6792,9791,'باص ٢');
   insert into public.camps (id,season_id,name,type,page_type,gender,capacity) overriding system value values
     (6891,9791,'منى ١','عادي','منى','ذكر',50),(6892,9791,'خيمة خاصّة','خاص','منى',null,50),(6893,9791,'عرفة ١','عادي','عرفة','ذكر',50);
   insert into public.hotels (id,season_id,name) overriding system value values (8391,9791,'فندق P1');
   insert into public.rooms (id,season_id,hotel_id,number,floor,type) overriding system value values
     (8491,9791,8391,'101','1','رباعية'),(8492,9791,null,'102','1','رباعية');
   insert into public.flights (id,season_id,name,date,time,type,capacity) overriding system value values
     (7391,9791,'QR1','2026-05-20','10:00','ذهاب',10),(7392,9791,'QR2','2026-06-10','12:00','إياب',10);
   insert into public.passengers (id,season_id,name_ar,passport,dob,gender,passenger_type,bus_id,camp_mina_id,camp_arafa_id,room_id,flight_id,return_flight_id) overriding system value values
     (5791,9791,'حاج ألف','PP000001','01/01/1970','ذكر','حاج',6791,6891,6893,8491,7391,null),
     (5792,9791,'حاج باء','PP000002','02/02/1971','ذكر','حاج',6792,6892,null,null,null,7392),
     (5793,9791,'مرافق جيم','PP000003','03/03/1972','ذكر','مرافق',6791,null,null,null,null,null),
     (5794,9791,'حاج دال','PP000004','04/04/1973','ذكر','حاج',null,null,null,null,null,null),
     (5795,9791,'إداري هاء','PP000005','05/05/1974','ذكر','إداري',null,null,null,null,null,null);" > /dev/null || { echo "تعذّرت التهيئة"; exit 2; }
tok() { anon "select create_pilgrim_session('$1',$2,$3,$4)->>'token'"; }
T1=$(tok PP000001 1 1 1970); T2=$(tok PP000002 2 2 1971); T4=$(tok PP000004 4 4 1973)
[ ${#T1} -ge 40 ] && [ ${#T2} -ge 40 ] && [ ${#T4} -ge 40 ] && ok "fixtures: three pilgrims log in" || bad "fixtures: logins ($T1 / $T2 / $T4)"

prev() { staff $U_ADMIN "select coalesce(string_agg(passenger_id::text, ',' order by passenger_id), '') from announcement_audience_preview('$1'::jsonb)"; }
recips() { q "select coalesce(string_agg(passenger_id::text, ',' order by passenger_id), '') from announcement_recipients where announcement_id = $1"; }
new_ann() {  # $1 id · $2 audience json · $3 show_at sql · $4 extra (title, priority, expires_at)
  staff $U_ADMIN "insert into public.announcements (id,season_id,title,body,priority,audience,show_at,expires_at)
    overriding system value values ($1, 9791, ${5:-'عنوان $1'}, 'نصّ $1 الكامل — سطرٌ أول' || chr(10) || 'سطرٌ ثانٍ', ${4:-'عام'}, '$2'::jsonb, $3, ${6:-null})" > /dev/null
}

echo "═══ الجمهور: التحقّق ═══"
for bad_aud in '{}' '{"all":false}' '{"bus":[]}' '{"color":[1]}' '{"all":"yes"}' '{"types":[]}' '{"types":["زائر"],"all":true}' \
               '{"bus":[999999]}' '{"camp_mina":[6893]}' '{"camp_arafa":[6891]}' '{"pilgrim":[0]}' '{"bus":["6791"]}'; do
  r=$(prev "$bad_aud"); echo "$r" | grep -q "22023" && ok "invalid audience refused: $bad_aud" || bad "invalid audience accepted: $bad_aud ($r)"
done

echo "═══ الجمهور: الفئات ═══"
eq "all → pilgrims only (no مرافق/إداري)"                    "$(prev '{"all":true}')"                              "5791,5792,5794"
eq "all + types [حاج, مرافق] → explicit inclusion"           "$(prev '{"all":true,"types":["حاج","مرافق"]}')"     "5791,5792,5793,5794"
eq "bus 1 → its pilgrims (the مرافق only with types)"         "$(prev '{"bus":[6791]}')"                           "5791"
eq "bus 1 + types [مرافق] → only that category"              "$(prev '{"bus":[6791],"types":["مرافق"]}')"         "5793"
eq "Mina camp"                                                "$(prev '{"camp_mina":[6891]}')"                     "5791"
eq "private tent (Mina private camp)"                         "$(prev '{"camp_mina":[6892]}')"                     "5792"
eq "Arafat camp"                                              "$(prev '{"camp_arafa":[6893]}')"                    "5791"
eq "hotel (assigned room's hotel)"                            "$(prev '{"hotel":[8391]}')"                         "5791"
q "set app.season_maintenance = 'on'; update public.passengers set requested_hotel_id = 8391 where id = 5794" > /dev/null
eq "hotel: a pilgrim who only requested it (no room there) is not targeted" "$(prev '{"hotel":[8391]}')" "5791"
q "set app.season_maintenance = 'on'; update public.passengers set requested_hotel_id = null where id = 5794" > /dev/null
eq "outbound flight"                                          "$(prev '{"flight":[7391]}')"                        "5791"
eq "return flight"                                            "$(prev '{"flight":[7392]}')"                        "5792"
eq "individual pilgrims — any category when chosen by name"   "$(prev '{"pilgrim":[5795,5794]}')"                  "5794,5795"
eq "union across categories, each pilgrim once"               "$(prev '{"bus":[6791,6792],"camp_mina":[6891],"hotel":[8391],"flight":[7391,7392],"pilgrim":[5791]}')" "5791,5792"
r=$(staff $U_STAFF "select count(*) from announcement_audience_preview('{\"all\":true}'::jsonb)"); echo "$r" | grep -q "42501" && ok "preview refused without manage_portal" || bad "preview without manage_portal ($r)"
r=$(anon "select count(*) from announcement_audience_preview('{\"all\":true}'::jsonb)"); echo "$r" | grep -q "permission denied" && ok "preview not executable by anon" || bad "preview anon ($r)"

echo "═══ التجميد ═══"
new_ann 4801 '{"bus":[6791],"camp_mina":[6891]}' "now() - interval '1 minute'"
eq "immediate publish freezes once, deduplicated (bus 1 ∪ Mina 1 → 5791 once)" "$(recips 4801)" "5791"
eq "frozen_at set" "$(q "select audience_frozen_at is not null from announcements where id = 4801")" "t"
q "set app.season_maintenance = 'on'; update public.passengers set bus_id = 6791 where id = 5794" > /dev/null
eq "later allocation change does not alter the frozen audience" "$(recips 4801)" "5791"
q "set app.season_maintenance = 'on'; update public.passengers set bus_id = null where id = 5794" > /dev/null
r=$(staff $U_ADMIN "update public.announcements set audience = '{\"all\":true}'::jsonb where id = 4801"); echo "$r" | grep -q "22023" && ok "published audience cannot be changed" || bad "published audience changed ($r)"
r=$(staff $U_ADMIN "update public.announcements set show_at = now() + interval '1 day' where id = 4801"); echo "$r" | grep -q "22023" && ok "published announcement cannot be rescheduled" || bad "rescheduled ($r)"
r=$(staff $U_ADMIN "update public.announcements set audience_frozen_at = null where id = 4801"); echo "$r" | grep -q "42501" && ok "client cannot unfreeze" || bad "unfreeze ($r)"
new_ann 4802 '{"bus":[6792]}' "now() + interval '1 hour'"
eq "scheduled: not frozen before its time" "$(q "select (audience_frozen_at is null)::text || ':' || (select count(*) from announcement_recipients where announcement_id = 4802) from announcements where id = 4802")" "true:0"
r=$(staff $U_ADMIN "update public.announcements set audience = '{\"bus\":[6791,6792]}'::jsonb where id = 4802"); [ -z "$r" ] && ok "scheduled audience may still change" || bad "scheduled audience change ($r)"
q "set app.season_maintenance = 'on'; update public.passengers set bus_id = 6791 where id = 5794" > /dev/null
q "update public.announcements set show_at = now() - interval '1 second' where id = 4802" > /dev/null
eq "scheduled freezes at its publication boundary with the allocation of that moment" "$(recips 4802)" "5791,5792,5794"
q "set app.season_maintenance = 'on'; update public.passengers set bus_id = null where id = 5794" > /dev/null
q "set app.season_maintenance = 'on'; insert into public.announcements (id,season_id,body,audience,show_at) overriding system value values (4803,9791,'لاحق',
     '{\"all\":true}'::jsonb, now() + interval '1 day'); update public.announcements set show_at = now() - interval '1 second' where id = 4803;" > /dev/null
eq "freeze reads the allocation then, not now" "$(recips 4803)" "5791,5792,5794"
r=$(svc "select push_prepare_announcement(4803)->>'prepared'"); eq "push prepare uses the frozen audience" "$r" "true"
eq "push deliveries = frozen recipients (one per pilgrim)" "$(q "select string_agg(passenger_id::text, ',' order by passenger_id) from notification_deliveries where announcement_id = 4803")" "5791,5792,5794"

echo "═══ البوابة: المحتوى والحالات والترتيب والصفحات ═══"
q "set app.season_maintenance = 'on'; delete from public.announcements where id in (4801, 4802, 4803);" > /dev/null
# ١٢ تنبيهاً لـ5791: 4811..4822 بمواعيد متتالية · 4815 عاجل · 4818 مثبَّت · و4823 لغيره · 4824 منتهٍ · 4825 مجدوَل
for i in $(seq 11 22); do
  new_ann 48$i '{"pilgrim":[5791]}' "now() - interval '$((30 - i)) minutes'" "$( [ $i = 15 ] && echo "'عاجل'" || echo "'عام'")"
done
q "update public.announcements set pinned_at = now() where id = 4818" > /dev/null
new_ann 4823 '{"pilgrim":[5792]}' "now() - interval '1 minute'"
new_ann 4824 '{"pilgrim":[5791]}' "now() - interval '2 hours'" "'عام'" "'منتهٍ'" "now() - interval '1 hour'"
new_ann 4825 '{"pilgrim":[5791]}' "now() + interval '1 hour'"
P1=$(anon "select get_pilgrim_portal_by_session('$T1')")
eq "first page holds 10" "$(echo "$P1" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["announcements"]))')" "10"
eq "meta: total 12 · unread 12 · has_more" "$(echo "$P1" | python3 -c 'import json,sys; m=json.load(sys.stdin)["announcements_meta"]; print(m["total"], m["unread"], m["has_more"], m["page_size"])')" "12 12 True 10"
eq "order: pinned, then urgent, then newest first" "$(echo "$P1" | python3 -c 'import json,sys; print(",".join(str(a["id"]) for a in json.load(sys.stdin)["announcements"]))')" "4818,4815,4822,4821,4820,4819,4817,4816,4814,4813"
eq "title and the full multi-line body are sent" "$(echo "$P1" | python3 -c 'import json,sys; a=json.load(sys.stdin)["announcements"][0]; print(a["title"], "|", a["body"].replace(chr(10), "\\n"), "|", a["state"], a["pinned"], a["revision"])')" 'عنوان 4818 | نصّ 4818 الكامل — سطرٌ أول\nسطرٌ ثانٍ | new True 1'
eq "legacy fields still present for older portal builds" "$(echo "$P1" | python3 -c 'import json,sys; a=json.load(sys.stdin)["announcements"][0]; print(all(k in a for k in ("id","body","priority","show_at")))')" "True"
P2=$(anon "select get_pilgrim_announcements('$T1', 10)")
eq "load more: the remaining 2, in order" "$(echo "$P2" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(",".join(str(a["id"]) for a in d["items"]), d["has_more"])')" "4812,4811 False"
r=$(anon "select get_pilgrim_announcements('$T1', -1)"); echo "$r" | grep -q "22023" && ok "negative offset refused" || bad "offset ($r)"
eq "expired and scheduled not shown; another pilgrim's not shown" "$(echo "$P1$P2" | grep -c '4823\|4824\|4825')" "0"
eq "pilgrim 2 sees only its own" "$(anon "select get_pilgrim_portal_by_session('$T2')" | python3 -c 'import json,sys; print(",".join(str(a["id"]) for a in json.load(sys.stdin)["announcements"]))')" "4823"
anon "select get_pilgrim_portal_by_session('$T1')" > /dev/null; anon "select get_pilgrim_announcements('$T1', 0)" > /dev/null
eq "opening the portal / the alerts list marks nothing read" "$(anon "select get_pilgrim_portal_by_session('$T1')->'announcements_meta'->>'unread'")" "12"
eq "acknowledge one → read" "$(anon "select acknowledge_pilgrim_announcement('$T1', 4815, 1)->>'state'")" "read"
eq "only that one is read" "$(anon "select get_pilgrim_portal_by_session('$T1')->'announcements_meta'->>'unread'")" "11"
eq "acknowledge is idempotent" "$(anon "select acknowledge_pilgrim_announcement('$T1', 4815, 1)->>'state'")" "read"
eq "cannot acknowledge another pilgrim's announcement" "$(anon "select coalesce(acknowledge_pilgrim_announcement('$T1', 4823, 1)::text, 'null')")" "null"
eq "cannot acknowledge an expired or scheduled one" "$(anon "select coalesce(acknowledge_pilgrim_announcement('$T1', 4824, 1)::text, 'null') || coalesce(acknowledge_pilgrim_announcement('$T1', 4825, 1)::text, 'null')")" "nullnull"
eq "acknowledge without a session → null" "$(anon "select coalesce(acknowledge_pilgrim_announcement('nope', 4815, 1)::text, 'null')")" "null"
eq "the other pilgrim is unaffected" "$(anon "select get_pilgrim_portal_by_session('$T2')->'announcements_meta'->>'unread'")" "1"
eq "old portal build (mark_pilgrim_notification_read) still works for its own" "$(anon "select mark_pilgrim_notification_read('$T1', 4816)")" "t"
eq "…and refuses what is not its own" "$(anon "select mark_pilgrim_notification_read('$T1', 4823)")" "f"
eq "acknowledge an item on page 2" "$(anon "select acknowledge_pilgrim_announcement('$T1', 4811, 1)->>'state'")" "read"
eq "…page 2 carries per-item states (4812 new, 4811 read) and the same meta" "$(anon "select get_pilgrim_announcements('$T1', 10)" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(",".join(f"{a['"'"'id'"'"']}:{a['"'"'state'"'"']}" for a in d["items"]), d["total"], d["unread"])')" "4812:new,4811:read 12 9"
# تنبيهٌ قديم (قبل Phase 1): بلا audience، باستهداف target_type، وقراءتُه في notification_deliveries.read_at
q "set app.season_maintenance = 'on'; insert into public.announcements (id,season_id,title,body,target_type,target_ids,show_at) overriding system value
   values (4826,9791,'قديم','تنبيهٌ قديم','bus','{6791}',now() - interval '40 minutes')" > /dev/null
eq "legacy announcement: frozen by its legacy rule (bus 1, every passenger type as before)" "$(recips 4826)" "5791,5793"
eq "…shown to its pilgrim as New" "$(anon "select x->>'state' from json_array_elements(get_pilgrim_announcements('$T1', 10)->'items') x where (x->>'id')::int = 4826")" "new"
q "insert into public.notification_deliveries (announcement_id, passenger_id, status, read_at) values (4826, 5791, 'read', now())" > /dev/null
eq "…a read recorded by the old build counts as Read (revision 1)" "$(anon "select x->>'state' from json_array_elements(get_pilgrim_announcements('$T1', 10)->'items') x where (x->>'id')::int = 4826")" "read"
eq "…not shown to a pilgrim outside its legacy audience" "$(anon "select count(*) from json_array_elements(get_pilgrim_portal_by_session('$T2')->'announcements') x where (x->>'id')::int = 4826")" "0"
r=$(staff $U_ADMIN "select update_announcement(4826, 'قديم مُعدَّل', 'تنبيهٌ قديمٌ مُعدَّل', 'عام', null)->>'push'")
eq "…editing it: revision 2, Updated (the legacy read was for revision 1), recipients unchanged" "$r:$(anon "select x->>'state' from json_array_elements(get_pilgrim_announcements('$T1', 10)->'items') x where (x->>'id')::int = 4826"):$(recips 4826)" "requested:updated:5791,5793"
q "set app.season_maintenance = 'on'; delete from public.announcements where id = 4826" > /dev/null
r=$(anon "select count(*) from announcement_reads"); echo "$r" | grep -q "permission denied" && ok "anon cannot read the reads table" || bad "anon reads table ($r)"
r=$(anon "select count(*) from announcement_recipients"); echo "$r" | grep -q "permission denied" && ok "anon cannot read the recipients table" || bad "anon recipients ($r)"
r=$(staff $U_ADMIN "select get_pilgrim_announcements('$T1', 0)"); echo "$r" | grep -q "permission denied" && ok "portal pagination not executable by authenticated" || bad "authenticated pagination ($r)"
eq "announcement items carry exactly the public projection (no delivery/audience data)" "$(anon "select get_pilgrim_portal_by_session('$T1')" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(sorted({k for a in d["announcements"] for k in a}), sorted(d["announcements_meta"]))')" "['body', 'edited_at', 'id', 'pinned', 'priority', 'revision', 'show_at', 'state', 'title'] ['has_more', 'page_size', 'total', 'unread']"

echo "═══ التعديل والدفع ═══"
q "delete from public.pilgrim_push_subscriptions where passenger_id between 5790 and 5799;
   insert into public.pilgrim_push_subscriptions (passenger_id,endpoint,p256dh,auth) values
     (5791,'https://push.example/p1-a','k','a'),(5791,'https://push.example/p1-b','k','a')" > /dev/null
new_ann 4830 '{"pilgrim":[5791,5792]}' "now() - interval '1 minute'"
svc "select push_prepare_announcement(4830)" > /dev/null
q "update announcement_push_targets set status='sent', sent_at=now() where announcement_id = 4830;
   update notification_deliveries set status = case when passenger_id = 5791 then 'sent' else 'disabled' end where announcement_id = 4830;
   update announcements set push_sent_at = now() where id = 4830" > /dev/null
anon "select acknowledge_pilgrim_announcement('$T1', 4830, 1)" > /dev/null
r=$(staff $U_ADMIN "update public.announcements set body = 'تحايل' where id = 4830"); echo "$r" | grep -q "42501" && ok "direct client edit of the body refused (must use update_announcement)" || bad "direct body edit ($r)"
r=$(staff $U_STAFF "select update_announcement(4830, 'x', 'y', 'عام', null)"); echo "$r" | grep -q "42501" && ok "edit refused without manage_portal" || bad "edit without permission ($r)"
r=$(anon "select update_announcement(4830, 'x', 'y', 'عام', null)"); echo "$r" | grep -q "permission denied" && ok "edit not executable by anon" || bad "anon edit ($r)"
r=$(staff $U_ADMIN "select update_announcement(4830, 'عنوان 4830', 'نصّ 4830 الكامل — سطرٌ أول' || chr(10) || 'سطرٌ ثانٍ', 'مهم', null)->>'push'")
eq "metadata-only edit (priority) → no push, same revision" "$r:$(q "select content_revision from announcements where id = 4830")" "none:1"
eq "…push state untouched" "$(q "select (push_sent_at is not null)::text || ':' || (select count(*) from announcement_push_targets where announcement_id = 4830) from announcements where id = 4830")" "true:2"
q "update public.announcements set pinned_at = now() where id = 4830" > /dev/null
eq "pin → no revision change, no push reset" "$(q "select content_revision || ':' || (push_sent_at is not null)::text from announcements where id = 4830")" "1:true"
r=$(staff $U_ADMIN "select update_announcement(4830, 'عنوان مُعدَّل', 'نصٌّ مُعدَّل', 'مهم', null)")
eq "content edit → revision 2, push requested" "$(echo "$r" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["revision"], d["content_changed"], d["push"])')" "2 True requested"
eq "new push round: targets, deliveries and stamp cleared" "$(q "select (push_sent_at is null)::text || ':' || (select count(*) from announcement_push_targets where announcement_id = 4830) || ':' || (select count(*) from notification_deliveries where announcement_id = 4830) from announcements where id = 4830")" "true:0:0"
eq "the scheduler (M5) sees it due again" "$(q "select 4830 = any(public._push_due_ids(20))")" "t"
r=$(svc "select push_prepare_announcement(4830)->>'prepared'"); eq "re-prepared once" "$r" "true"
eq "…to the same frozen audience (2 devices of 5791; 5792 has none)" "$(q "select count(*) || ':' || string_agg(distinct passenger_id::text, ',') from announcement_push_targets where announcement_id = 4830")" "2:5791"
eq "…and not twice" "$(svc "select push_prepare_announcement(4830)->>'prepared'")" "false"
eq "edited announcement is now Updated for the reader" "$(anon "select x->>'state' from json_array_elements(get_pilgrim_portal_by_session('$T1')->'announcements') x where (x->>'id')::int = 4830")" "updated"
eq "…and shows the new title" "$(anon "select x->>'title' from json_array_elements(get_pilgrim_portal_by_session('$T1')->'announcements') x where (x->>'id')::int = 4830")" "عنوان مُعدَّل"
eq "acknowledging the old revision keeps it Updated" "$(anon "select acknowledge_pilgrim_announcement('$T1', 4830, 1)->>'state'")" "updated"
eq "acknowledging the current revision → Read" "$(anon "select acknowledge_pilgrim_announcement('$T1', 4830, 2)->>'state'")" "read"
eq "a non-reader of the edited one sees Updated too" "$(anon "select x->>'state' from json_array_elements(get_pilgrim_portal_by_session('$T2')->'announcements') x where (x->>'id')::int = 4830")" "updated"
r=$(staff $U_ADMIN "select update_announcement(4830, 'عنوان مُعدَّل', 'نصٌّ مُعدَّل', 'مهم', null)->>'push'")
eq "saving unchanged content → no new push" "$r:$(q "select content_revision from announcements where id = 4830")" "none:2"

echo "═══ سياجُ العامل ═══"
W1=00000000-0000-0000-0000-0000000097b1; W2=00000000-0000-0000-0000-0000000097b2
eq "worker 1 claims revision 2" "$(svc "select count(*) from push_claim_targets(4830, '$W1', 1, 60)")" "1"
staff $U_ADMIN "select update_announcement(4830, 'عنوانٌ ثالث', 'نصٌّ ثالث', 'مهم', null)" > /dev/null
r=$(svc "select count(*) from push_claim_targets(4830, '$W1', 5, 60)"); echo "$r" | grep -q "superseded" && ok "worker started before the edit is refused (no old text to new devices)" || bad "stale worker ($r)"
svc "select push_prepare_announcement(4830)" > /dev/null
eq "a new worker claims the new round" "$(svc "select count(*) from push_claim_targets(4830, '$W2', 5, 60)")" "2"
r=$(svc "select push_complete_target(t.id, '$W1', 1, 'sent') from announcement_push_targets t where t.announcement_id = 4830 limit 1"); eq "the stale worker's completion does not write" "$r" "stale"

echo "═══ سباقُ التحميل: العاملُ قرأ المحتوى ثم عُدِّل قبل أوّل حجز ═══"
# العاملُ (الدالّةُ الطرفيّة) يهيّئ ثم يقرأ العنوانَ والنصَّ ونسخةَ المحتوى، ثم يحجز. تعديلٌ يُثبَّت بين
# القراءة وأوّل حجز، ثم تهيئةُ الجولة الجديدة، لا يجوز أن يُرسل بعده النسخةَ القديمة إلى أيّ جهاز.
W3=00000000-0000-0000-0000-0000000097b3; W4=00000000-0000-0000-0000-0000000097b4; W5=00000000-0000-0000-0000-0000000097b5
new_ann 4831 '{"pilgrim":[5791]}' "now() - interval '1 minute'"
svc "select push_prepare_announcement(4831)" > /dev/null
READ_REV=$(q "select content_revision from announcements where id = 4831")
eq "worker read revision 1 (payload loaded)" "$READ_REV" "1"
staff $U_ADMIN "select update_announcement(4831, 'عنوانٌ أحدث', 'نصٌّ أحدث', 'عام', null)" > /dev/null
svc "select push_prepare_announcement(4831)" > /dev/null
r=$(svc "select count(*) from push_claim_targets(4831, '$W3', 5, 60, $READ_REV)"); echo "$r" | grep -q "superseded" && ok "first claim with the revision it read (1) after an edit to 2 is refused — race closed" || bad "stale payload claimed new-round targets ($r)"
eq "…nothing claimed, the new round untouched" "$(q "select count(*) filter (where status = 'pending') || ':' || count(*) from announcement_push_targets where announcement_id = 4831")" "2:2"
eq "a worker that read revision 2 claims the new round" "$(svc "select count(*) from push_claim_targets(4831, '$W4', 5, 60, 2)")" "2"
r=$(svc "select count(*) from push_claim_targets(4831, '$W5', 5, 60, 3)"); echo "$r" | grep -q "superseded" && ok "a revision the row never had is refused too" || bad "unknown revision ($r)"
eq "legacy 4-argument call still works (older Edge Function)" "$(svc "select count(*) from push_claim_targets(4831, '$W5', 5, 60)")" "0"
eq "one claim signature only (M-46)" "$(q "select count(*) from pg_proc where proname = 'push_claim_targets' and pronamespace = 'public'::regnamespace")" "1"
# العاملُ يمسك حجزه (معاملةٌ مفتوحة) والتعديلُ يأتي: ينتظر التعديلُ ولا جمود، ثم يُمحى ما حجزه
new_ann 4832 '{"pilgrim":[5791]}' "now() - interval '1 minute'"
svc "select push_prepare_announcement(4832)" > /dev/null
( psql "$LOCAL" -X -q -At -c "begin; set local role service_role; select count(*) from push_claim_targets(4832, '$W3', 5, 60, 1); select pg_sleep(1.5); commit;" > "$TMPD"/p1_c.out 2>&1 ) &
sleep 0.4
r=$(staff $U_ADMIN "select update_announcement(4832, 'أثناء الحجز', 'نصٌّ أثناء الحجز', 'عام', null)->>'push'"); wait
eq "edit during an open claim waits for it — no deadlock" "$r:$(grep -c 'deadlock' "$TMPD"/p1_c.out):$(head -1 "$TMPD"/p1_c.out)" "requested:0:2"
eq "…then the old round is cleared (fresh round for revision 2)" "$(q "select count(*) from announcement_push_targets where announcement_id = 4832")" "0"
svc "select push_prepare_announcement(4832)" > /dev/null
r=$(svc "select push_complete_target(t.id, '$W3', 1, 'sent') from announcement_push_targets t where t.announcement_id = 4832 limit 1"); eq "the old worker cannot complete a new-round target" "$r" "stale"
eq "…and the new round's report is untouched" "$(svc "select (push_delivery_summary(4832)->>'sent') || ':' || (push_delivery_summary(4832)->>'pending')")" "0:1"
# عاملان بالنسخة نفسها معاً: أجهزةٌ مختلفة، بلا تكرار، والتقريرُ مطابق
( svc "select string_agg(target_id::text, ',') from push_claim_targets(4832, '$W4', 1, 60, 2)" > "$TMPD"/p1_k1.out ) &
( svc "select string_agg(target_id::text, ',') from push_claim_targets(4832, '$W5', 1, 60, 2)" > "$TMPD"/p1_k2.out ) & wait
eq "2 concurrent workers of one round claim disjoint devices" "$(cat "$TMPD"/p1_k1.out "$TMPD"/p1_k2.out | sort -u | grep -c .)" "2"
for w in $W4 $W5; do svc "select push_complete_target(t.id, '$w', t.attempts, 'sent') from announcement_push_targets t where t.announcement_id = 4832 and t.lease_owner = '$w'" > /dev/null; done
eq "…round report: 1 pilgrim sent, nothing pending, stamped once" "$(svc "select (push_delivery_summary(4832)->>'sent') || ':' || (push_delivery_summary(4832)->>'pending')"):$(q "select (push_sent_at is not null)::text from announcements where id = 4832")" "1:0:true"
eq "…exactly one delivery row per pilgrim in the round" "$(q "select count(*) || ':' || count(distinct passenger_id) from notification_deliveries where announcement_id = 4832")" "1:1"
eq "frozen audience unchanged after edits" "$(recips 4832)" "5791"
rm -f "$TMPD"/p1_c.out "$TMPD"/p1_k1.out "$TMPD"/p1_k2.out
# قفلُ الصفّ بين الفحص والحجز: حجزٌ تالٍ لم يأخذ جهازاً (كلُّها محجوزة) ما زال يمسك الصفَّ حتى نهاية
# معاملته، فلا يُثبَّت تعديلٌ بين فحص النسخة وحجز الأجهزة
new_ann 4833 '{"pilgrim":[5791]}' "now() - interval '1 minute'"
svc "select push_prepare_announcement(4833)" > /dev/null
svc "select count(*) from push_claim_targets(4833, '$W4', 5, 60, 1)" > /dev/null
svc "select count(*) from push_claim_targets(4833, '$W5', 5, 60, 1)" > /dev/null   # سياجُه مسجَّلٌ قبلُ: لا قفلَ مفتاحٍ أجنبيّ في الحجز التالي
( psql "$LOCAL" -X -q -At -c "begin; set local role service_role; select count(*) from push_claim_targets(4833, '$W5', 5, 60, 1); select pg_sleep(1.5); commit;" > "$TMPD"/p1_s.out 2>&1 ) &
sleep 0.4
t0=$(date +%s%N); r=$(staff $U_ADMIN "select update_announcement(4833, 'بعد الفحص', 'نصٌّ بعد الفحص', 'عام', null)->>'push'"); t1=$(date +%s%N); wait
eq "the revision check holds the row until its claim commits (edit waited ≥0.8s)" "$r:$(head -1 "$TMPD"/p1_s.out):$(( (t1 - t0) / 1000000 >= 800 ))" "requested:0:1"
rm -f "$TMPD"/p1_s.out

echo "═══ المجدوَل ═══"
new_ann 4840 '{"pilgrim":[5791]}' "now() + interval '1 hour'"
r=$(staff $U_ADMIN "select update_announcement(4840, 'مجدوَل مُعدَّل', 'نصٌّ مجدوَل', 'عام', null)->>'push'"); eq "editing a scheduled announcement → push waits for its time" "$r" "scheduled"
eq "…no targets, not due, not prepared" "$(q "select (select count(*) from announcement_push_targets where announcement_id = 4840) || ':' || (4840 = any(public._push_due_ids(20)))::text")" "0:false"
eq "…prepare refuses before show_at" "$(svc "select push_prepare_announcement(4840)->>'reason'")" "not_due"
eq "…not visible in the portal" "$(anon "select count(*) from json_array_elements(get_pilgrim_portal_by_session('$T1')->'announcements') x where (x->>'id')::int = 4840")" "0"

echo "═══ الانتهاء ═══"
new_ann 4841 '{"pilgrim":[5791]}' "now() - interval '2 hours'"
staff $U_ADMIN "update public.announcements set expires_at = now() - interval '1 second' where id = 4841" > /dev/null
eq "expired: gone from the portal" "$(anon "select count(*) from json_array_elements(get_pilgrim_portal_by_session('$T1')->'announcements') x where (x->>'id')::int = 4841")" "0"
eq "…still listed for administrators" "$(staff $U_ADMIN "select count(*) from public.announcements where id = 4841")" "1"
eq "…expiry sends nothing (prepare: expired)" "$(svc "select push_prepare_announcement(4841)->>'reason'")" "expired"
r=$(staff $U_ADMIN "select update_announcement(4841, 'x', 'نصٌّ آخر', 'عام', now() - interval '1 second')->>'push'"); eq "editing an expired one does not push" "$r" "expired"

echo "═══ الحذف ═══"
before=$(q "select count(*) from audit_log where table_name = 'announcements' and row_id = '4830'")
r=$(staff $U_STAFF "select delete_announcement(4830)"); echo "$r" | grep -q "42501" && ok "delete refused without manage_portal" || bad "delete without permission ($r)"
r=$(anon "select delete_announcement(4830)"); echo "$r" | grep -q "permission denied" && ok "delete not executable by anon" || bad "anon delete ($r)"
eq "delete with manage_portal" "$(staff $U_ADMIN "select delete_announcement(4830)")" "t"
eq "announcement, targets, deliveries, recipients, reads, workers all gone" "$(q "select (select count(*) from announcements where id=4830) + (select count(*) from announcement_push_targets where announcement_id=4830) + (select count(*) from notification_deliveries where announcement_id=4830) + (select count(*) from announcement_recipients where announcement_id=4830) + (select count(*) from announcement_reads where announcement_id=4830) + (select count(*) from announcement_push_workers where announcement_id=4830)")" "0"
eq "one audit event, by the admin (session), action delete" "$(q "select count(*) - $before || ':' || max(actor_source) || ':' || max(action) || ':' || (max(actor_id::text) = '$U_ADMIN')::text from audit_log where table_name = 'announcements' and row_id = '4830'")" "1:session:delete:true"
eq "…without title, body or audience ids" "$(q "select (old_value::text ~ 'عنوان|نصّ|5791|title|body')::text || ':' || (new_value is null)::text from audit_log where table_name = 'announcements' and row_id = '4830' order by id desc limit 1")" "false:true"
eq "deleting a missing one → false" "$(staff $U_ADMIN "select delete_announcement(4830)")" "f"

echo "═══ الموسمُ المقفل ═══"
q "set app.season_maintenance = 'on'; insert into public.announcements (id,season_id,body,audience,show_at) overriding system value values (4850,9792,'مقفل','{\"all\":true}'::jsonb,now()-interval '1 day')" > /dev/null
r=$(staff $U_ADMIN "select update_announcement(4850, 'x', 'y', 'عام', null)"); echo "$r" | grep -q "P0001" && ok "edit refused in a closed season" || bad "closed-season edit ($r)"
r=$(staff $U_ADMIN "select delete_announcement(4850)"); echo "$r" | grep -qi "مقفل" && ok "delete refused in a closed season" || bad "closed-season delete ($r)"
eq "closed-season announcement never frozen" "$(q "select (audience_frozen_at is null)::text || (select count(*) from announcement_recipients where announcement_id = 4850) from announcements where id = 4850")" "true0"

echo "═══ التزامن ═══"
# خمسُ بوابات تفتح معاً تنبيهاً حان موعدُه للتوّ: يُجمَّد مرّةً، بلا تكرارٍ ولا خطأ
q "set app.season_maintenance = 'on'; insert into public.announcements (id,season_id,body,audience,show_at) overriding system value
   values (4860,9791,'تزامن','{\"all\":true}'::jsonb, now() + interval '2 seconds')" > /dev/null
sleep 3
for i in 1 2 3 4 5; do anon "select (get_pilgrim_portal_by_session('$T1') is not null)" > ""$TMPD"/p1_par_$i.out" & done; wait
eq "5 concurrent portal loads freeze once, no error" "$(cat "$TMPD"/p1_par_*.out | sort -u | tr -d '\n'):$(recips 4860)" "t:5791,5792,5794"
rm -f "$TMPD"/p1_par_*.out
# تعديلان متزامنان: يمرّ الاثنان بالترتيب، والنسخةُ ٣
staff $U_ADMIN "select update_announcement(4860, 'أ', 'نصّ أ', 'عام', null)" > "$TMPD"/p1_e1.out & staff $U_ADMIN "select update_announcement(4860, 'ب', 'نصّ ب', 'عام', null)" > "$TMPD"/p1_e2.out & wait
eq "2 concurrent edits both succeed, serialized (revision 3)" "$(grep -c 'requested' "$TMPD"/p1_e1.out "$TMPD"/p1_e2.out | awk -F: '{s+=$2} END {print s}'):$(q "select content_revision from announcements where id = 4860")" "2:3"
rm -f "$TMPD"/p1_e1.out "$TMPD"/p1_e2.out
# عاملُ دفعٍ يمسك قفلَ التنبيه ثم يختمه (ترتيبُ M6: القفلُ ثم الصفّ) بينما يُعدَّل المحتوى: لا جمود
( psql "$LOCAL" -X -q -At -c "begin; select public._push_lock(4860); select pg_sleep(1.5); update public.announcements set push_sent_at = now() where id = 4860; commit;" > "$TMPD"/p1_w.out 2>&1 ) &
sleep 0.3
r=$(staff $U_ADMIN "select update_announcement(4860, 'ج', 'نصّ ج', 'عام', null)->>'push'"); wait
eq "edit waits for a delivery worker holding the announcement lock — no deadlock" "$r:$(grep -c 'deadlock' "$TMPD"/p1_w.out)" "requested:0"
rm -f "$TMPD"/p1_w.out

echo ""
echo "Phase 1 announcements tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
