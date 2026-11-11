#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# بوابة الحاجّ — Phase 2: الاستطلاعات — فحوصٌ بالتنفيذ (ترحيلة 20261111111656)
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ مؤقّتةٍ وحدها (بعد `db reset` إلى آخر ترحيلة):
#   supabase/verification/portal/polls_phase2_tests.sh
#   LOCAL='postgresql:///db?host=/path/to/socket&port=…&user=postgres' …   ← عنقودٌ محلّيٌّ آخر
#
#   دورةُ الحياة: مسوّدة · تعديل · جدولة وإلغاؤها · نشرٌ فوريّ ومجدوَل (التجميد عند الحلول)
#     · الإغلاق ولقطتُه · لا إعادةَ فتح · لا تعديلَ للخيارات ولا للسؤال بعد النشر · حذفُ المسوّدة وحدها
#   الجمهور: الكلّ للحجّاج وحدهم · الأنواعُ بالاختيار الصريح · اتّحادٌ بلا تكرار · ثباتُه بعد تغيّر الإسناد
#     · الإضافةُ اليدويّة للمسجَّلين بعد النشر
#   الصلاحيات: manage_portal · anon · الجداولُ الداخليّة · الدوالُّ الداخليّة
#   الجلسة: صالحة · مجهولة · ملغاة · منتهية
#   التصويت: أوّلُ إجابة · بلا تغيير · تغيير · مراجعةٌ قديمة · خياراتٌ غيرُ صالحة · أحاديّ/متعدّد
#     · خارج الجمهور · متزامن (جلستان، وثلاثة حجّاج) · بعد الانتهاء · حدُّ الطلبات
#   النتائج: حيّةٌ بالإسناد الحاليّ · لقطةٌ بإسناد الإغلاق وبصمتها · لا أسماء في التجميع
#   الموسم: الإقفالُ يُغلق ويكتب اللقطات في معاملته (والتراجعُ يُرجع كلَّ شيء) · بلا جمودٍ مع تصويتٍ جارٍ
#     · الحذفُ يحذف الاستطلاعات واللقطات وسجلَّ الإجابات ويُبقي أحداثَ الإدارة
#   حذفُ الحاجّ: تسقط إجابتُه الحيّة وتبقى في اللقطة والسجلّ · جدولُ الحجّاج لا يُكتب
#
# ⚠️ يرفض أيَّ قاعدةٍ غيرِ محلّيّة، ويحذف ما يكتبه. بياناتٌ مُصطنَعة وحدها، ولا إرسال.
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
has() { if echo "$2" | grep -q -- "$3"; then ok "$1"; else bad "$1 (got '$2', want …$3…)"; fi; }
q()   { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
qe()  { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "$1" 2>&1; }
staff() { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role authenticated; do \$x\$ begin perform set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true); end \$x\$; $2; commit;" 2>&1; }
anon()  { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role anon; do \$x\$ begin perform set_config('request.headers', '{\"x-forwarded-for\":\"10.40.0.9\"}', true); end \$x\$; $1; commit;" 2>&1; }
jget() { python3 -c 'import json,sys; d=json.loads(sys.stdin.read() or "null");
for k in sys.argv[1].split("."):
    d = (d or {}).get(k) if isinstance(d, dict) else (d[int(k)] if isinstance(d, list) and d else None)
print(json.dumps(d, ensure_ascii=False) if isinstance(d,(dict,list)) else d)' "$1"; }

if [ "$(q "select count(*) from public.seasons where id in (9881, 9882) or hijri_year = 1499")" != "0" ]; then echo "يرفض: موسمُ التهيئة موجود"; exit 2; fi
if [ "$(q "select count(*) from public.seasons where closed_at is null")" != "0" ]; then echo "يرفض: في القاعدة موسمٌ مفتوح"; exit 2; fi

U_ADMIN=00000000-0000-0000-0000-0000000098a1
U_STAFF=00000000-0000-0000-0000-0000000098a2
cleanup() {
  q "set app.season_maintenance = 'on';
     delete from public.poll_result_snapshots where season_id in (9881, 9882);
     delete from public.poll_response_events where season_id in (9881, 9882);
     delete from public.polls where season_id in (9881, 9882);
     delete from public.pilgrim_sessions where passenger_id between 5890 and 5899;
     delete from public.passengers where id between 5890 and 5899;
     delete from public.rooms where id in (8591, 8592);
     delete from public.hotels where id = 8481;
     delete from public.flights where id in (7481, 7482);
     delete from public.camps where id in (6981, 6982, 6983);
     delete from public.buses where id in (6881, 6882);
     delete from public.seasons where id in (9881, 9882) or hijri_year = 1499;
     delete from public.edge_rate_limits where scope = 'portal-poll';
     delete from public.user_profiles where id in ('$U_ADMIN', '$U_STAFF');
     delete from auth.users where id in ('$U_ADMIN', '$U_STAFF');" > /dev/null 2>&1
}
TMPD="$(mktemp -d)"
trap 'cleanup; rm -rf "$TMPD"' EXIT

#   5891 حاجّ: باص ١ · منى ١ · عرفة ١ · غرفة في الفندق · رحلة الذهاب
#   5892 حاجّ: باص ٢ · خيمة خاصّة · رحلة العودة       5893 مرافق: باص ١
#   5894 حاجّ: بلا إسناد        5895 إداريّ        5896 حاجّ (يُسجَّل بعد النشر)        5897 حاجّ: باص ١ (يُحذف)
q "set app.season_maintenance = 'on';
   insert into auth.users (id,email,aud,role) values
     ('$U_ADMIN','p2-admin@t.local','authenticated','authenticated'), ('$U_STAFF','p2-staff@t.local','authenticated','authenticated');
   insert into public.user_profiles (id,email,name,permissions,is_active) values
     ('$U_ADMIN','p2-admin@t.local','مدير الاستطلاعات','{\"manage_portal\":true}',true),
     ('$U_STAFF','p2-staff@t.local','موظّف','{\"manage_passengers\":true}',true);
   insert into public.seasons (id,name,hijri_year,closed_at) overriding system value values
     (9882,'موسم مقفل P2',1497,now() - interval '1 day'), (9881,'موسم P2',1498,null);
   insert into public.buses (id,season_id,name) overriding system value values (6881,9881,'باص ١'),(6882,9881,'باص ٢');
   insert into public.camps (id,season_id,name,type,page_type,gender,capacity) overriding system value values
     (6981,9881,'منى ١','عادي','منى','ذكر',50),(6982,9881,'خيمة خاصّة','خاص','منى',null,50),(6983,9881,'عرفة ١','عادي','عرفة','ذكر',50);
   insert into public.hotels (id,season_id,name) overriding system value values (8481,9881,'فندق P2');
   insert into public.rooms (id,season_id,hotel_id,number,floor,type) overriding system value values
     (8591,9881,8481,'201','2','رباعية'),(8592,9881,null,'202','2','رباعية');
   insert into public.flights (id,season_id,name,date,time,type,capacity) overriding system value values
     (7481,9881,'QR9','2027-05-20','10:00','ذهاب',10),(7482,9881,'QR8','2027-06-10','12:00','إياب',10);
   insert into public.passengers (id,season_id,name_ar,passport,dob,gender,passenger_type,bus_id,camp_mina_id,camp_arafa_id,room_id,flight_id,return_flight_id) overriding system value values
     (5891,9881,'حاج ألف','PQ000001','01/01/1970','ذكر','حاج',6881,6981,6983,8591,7481,null),
     (5892,9881,'حاج باء','PQ000002','02/02/1971','ذكر','حاج',6882,6982,null,null,null,7482),
     (5893,9881,'مرافق جيم','PQ000003','03/03/1972','ذكر','مرافق',6881,null,null,null,null,null),
     (5894,9881,'حاج دال','PQ000004','04/04/1973','ذكر','حاج',null,null,null,null,null,null),
     (5895,9881,'إداري هاء','PQ000005','05/05/1974','ذكر','إداري',null,null,null,null,null,null),
     (5897,9881,'حاج زاي','PQ000007','07/07/1976','ذكر','حاج',6881,null,null,null,null,null);" > /dev/null || { echo "تعذّرت التهيئة"; exit 2; }
tok() { anon "select create_pilgrim_session('$1',$2,$3,$4)->>'token'"; }
T1=$(tok PQ000001 1 1 1970); T2=$(tok PQ000002 2 2 1971); T3=$(tok PQ000003 3 3 1972); T4=$(tok PQ000004 4 4 1973); T7=$(tok PQ000007 7 7 1976)
[ ${#T1} -ge 40 ] && [ ${#T2} -ge 40 ] && [ ${#T3} -ge 40 ] && [ ${#T4} -ge 40 ] && [ ${#T7} -ge 40 ] && ok "fixtures: five portal sessions" || bad "fixtures: logins"
PASSFP=$(q "select md5(string_agg(to_jsonb(p)::text, '' order by id)) from public.passengers p where season_id = 9881")

mk() {  # $1 audience · $2 kind · $3 max · $4 options array sql · $5 closes_at sql
  staff $U_ADMIN "select create_poll('سؤال اختبار', 'شرح', '${2:-single}', ${3:-null}, '$1'::jsonb, ${4:-array['نعم','لا','ربما']}, ${5:-null})"
}
opt() { q "select id from public.poll_options where poll_id = $1 order by sort_order offset $(( $2 - 1 )) limit 1"; }
vote() { anon "select submit_pilgrim_poll_response('$1', $2, $3::bigint[], $4)"; }
recips() { q "select coalesce(string_agg(passenger_id::text, ',' order by passenger_id), '') from public.poll_recipients where poll_id = $1"; }
st() { q "select status || coalesce(':' || close_reason, '') from public.polls where id = $1"; }

echo "═══ الإنشاء والتحقّق ═══"
for badp in "'',null,'single',null,'{\"all\":true}'::jsonb,array['a','b']" "'س',null,'single',null,'{\"all\":true}'::jsonb,array['a']" \
            "'س',null,'single',null,'{\"all\":true}'::jsonb,array['a','a']" "'س',null,'single',2,'{\"all\":true}'::jsonb,array['a','b']" \
            "'س',null,'multiple',5,'{\"all\":true}'::jsonb,array['a','b']" "'س',null,'poll',null,'{\"all\":true}'::jsonb,array['a','b']" \
            "'س',null,'single',null,'{}'::jsonb,array['a','b']" "'س',null,'single',null,'{\"bus\":[999999]}'::jsonb,array['a','b']" \
            "'س',null,'single',null,'{\"all\":true}'::jsonb,array['a','b'],now() - interval '1 minute'"; do
  r=$(staff $U_ADMIN "select create_poll($badp)"); echo "$r" | grep -q "22023" && ok "invalid poll refused: ${badp:0:60}" || bad "invalid poll accepted: $badp ($r)"
done
P1=$(mk '{"all":true}')
[ -n "$P1" ] && eq "draft created in the active season" "$(st $P1):$(q "select season_id from polls where id = $P1"):$(q "select count(*) from poll_options where poll_id = $P1")" "draft:9881:3" || bad "create_poll ($P1)"
r=$(staff $U_STAFF "select create_poll('x',null,'single',null,'{\"all\":true}'::jsonb,array['a','b'])"); has "create refused without manage_portal (42501)" "$r" "42501"
r=$(anon "select create_poll('x',null,'single',null,'{\"all\":true}'::jsonb,array['a','b'])"); has "create not executable by anon" "$r" "permission denied"
eq "admin reads polls and options directly" "$(staff $U_ADMIN "select count(*) from polls where id = $P1")$(staff $U_ADMIN "select count(*) from poll_options where poll_id = $P1")" "13"
eq "staff without manage_portal sees no polls" "$(staff $U_STAFF "select count(*) from polls where id = $P1")" "0"

echo "═══ دورةُ الحياة ═══"
r=$(staff $U_ADMIN "select update_poll($P1, 'سؤال مُعدَّل', null, 'multiple', 2, '{\"all\":true}'::jsonb, array['أ','ب','ج','د'], null)")
eq "draft edited (question, kind, options replaced)" "$(q "select title || ':' || kind || ':' || max_choices from polls where id = $P1"):$(q "select string_agg(label, ',' order by sort_order) from poll_options where poll_id = $P1")" "سؤال مُعدَّل:multiple:2:أ,ب,ج,د"
r=$(staff $U_ADMIN "select publish_poll($P1, now() + interval '1 hour')->>'status'"); eq "schedule for later" "$r:$(st $P1):$(recips $P1)" "scheduled:scheduled:"
r=$(staff $U_ADMIN "select update_poll($P1, 'سؤال مُعدَّل', null, 'multiple', 2, '{\"all\":true}'::jsonb, array['أ','ب','ج','د'], now() + interval '30 minutes')"); has "scheduled: closes_at must be after publish_at" "$r" "22023"
staff $U_ADMIN "select unschedule_poll($P1)" > /dev/null; eq "unschedule → draft" "$(st $P1)" "draft"
r=$(staff $U_ADMIN "select publish_poll($P1)"); eq "publish now: frozen, pilgrims only (no مرافق/إداري)" "$(echo "$r" | jget status):$(echo "$r" | jget recipients):$(recips $P1)" "published:4:5891,5892,5894,5897"
eq "frozen_at and published_at set" "$(q "select (audience_frozen_at is not null and published_at is not null)::text from polls where id = $P1")" "true"
r=$(staff $U_ADMIN "select update_poll($P1, 'x', null, 'single', null, '{\"all\":true}'::jsonb, array['a','b'], null)"); has "published: question/options/audience cannot be edited" "$r" "22023"
r=$(qe "insert into public.poll_options (poll_id, label, sort_order) values ($P1, 'خيارٌ جديد', 9)"); has "published: no option can be added, even by the owner role" "$r" "22023"
r=$(qe "update public.poll_options set label = 'تغيير' where poll_id = $P1"); has "published: option text cannot change" "$r" "22023"
r=$(qe "delete from public.poll_options where poll_id = $P1"); has "published: options cannot be deleted" "$r" "22023"
r=$(staff $U_ADMIN "select delete_poll($P1)"); has "published poll cannot be deleted (close instead)" "$r" "22023"
r=$(staff $U_ADMIN "select publish_poll($P1)"); has "cannot publish twice" "$r" "22023"
P0=$(mk '{"pilgrim":[5891]}'); eq "draft deleted" "$(staff $U_ADMIN "select delete_poll($P0)"):$(q "select count(*) from polls where id = $P0")" "t:0"

echo "═══ الجمهور ═══"
P2=$(mk '{"bus":[6881],"camp_mina":[6981],"pilgrim":[5891,5894]}'); staff $U_ADMIN "select publish_poll($P2)" > /dev/null
eq "combined targeting deduplicated (bus 1 ∪ Mina 1 ∪ 5891,5894; مرافق excluded)" "$(recips $P2)" "5891,5894,5897"
P3=$(mk '{"bus":[6881],"types":["مرافق"]}'); staff $U_ADMIN "select publish_poll($P3)" > /dev/null
eq "other categories only by explicit selection" "$(recips $P3)" "5893"
P4=$(mk '{"hotel":[8481],"flight":[7482],"camp_arafa":[6983]}'); staff $U_ADMIN "select publish_poll($P4)" > /dev/null
eq "hotel (assigned room) ∪ return flight ∪ Arafat camp" "$(recips $P4)" "5891,5892"
q "set app.season_maintenance = 'on'; update public.passengers set bus_id = 6881 where id = 5892" > /dev/null
eq "later assignment change leaves the frozen audience as it was" "$(recips $P2)" "5891,5894,5897"
q "set app.season_maintenance = 'on'; update public.passengers set bus_id = 6882 where id = 5892" > /dev/null
q "set app.season_maintenance = 'on'; insert into public.passengers (id,season_id,name_ar,passport,dob,gender,passenger_type,bus_id) overriding system value values (5896,9881,'حاج واو','PQ000006','06/06/1975','ذكر','حاج',6881)" > /dev/null
T6=$(tok PQ000006 6 6 1975)
eq "a pilgrim registered after publication is not added automatically" "$(recips $P1 | grep -c 5896)" "0"
eq "…and sees nothing" "$(anon "select get_pilgrim_polls('$T6')->'items'" )" "[]"
r=$(staff $U_STAFF "select add_poll_recipients($P1, array[5896])"); has "manual add refused without manage_portal" "$r" "42501"
r=$(staff $U_ADMIN "select add_poll_recipients($P1, array[5896, 5891])"); eq "manual add (newcomer + one already in)" "$(echo "$r" | jget added):$(echo "$r" | jget already)" "1:1"
eq "…recorded as manual" "$(q "select added_reason || ':' || (added_by = '$U_ADMIN')::text from poll_recipients where poll_id = $P1 and passenger_id = 5896")" "manual:true"
r=$(staff $U_ADMIN "select add_poll_recipients($P1, array[999999])"); has "manual add: unknown or other-season pilgrim refused" "$r" "22023"

echo "═══ الصلاحيات ═══"
for t in poll_recipients poll_responses poll_response_choices poll_response_events poll_admin_events poll_result_snapshots; do
  r=$(staff $U_ADMIN "select count(*) from $t"); has "$t not readable directly, even with manage_portal" "$r" "permission denied"
done
for t in polls poll_options poll_responses; do r=$(anon "select count(*) from $t"); has "anon cannot read $t" "$r" "permission denied"; done
r=$(staff $U_ADMIN "insert into polls (season_id,title,kind,audience) values (9881,'x','single','{\"all\":true}')"); has "no direct insert into polls by clients" "$r" "permission denied"
for f in "_poll_close($P1,'manual')" "_polls_settle_due(1)" "_poll_rows($P1)" "_polls_close_for_season(9881)"; do
  r=$(staff $U_ADMIN "select $f"); has "internal $f not executable by authenticated" "$r" "permission denied"
  r=$(anon "select $f"); has "internal $f not executable by anon" "$r" "permission denied"
done
r=$(staff $U_ADMIN "select get_pilgrim_polls('$T1')"); has "portal RPCs not executable by authenticated" "$r" "permission denied"
r=$(staff $U_STAFF "select poll_results($P1)"); has "results refused without manage_portal" "$r" "42501"
r=$(anon "select poll_results($P1)"); has "results not executable by anon" "$r" "permission denied"

echo "═══ جلسةُ البوابة ═══"
eq "no / unknown session → null" "$(anon "select coalesce(get_pilgrim_polls('nope')::text, 'null')")$(anon "select coalesce(submit_pilgrim_poll_response('nope', $P1, array[1]::bigint[], 0)::text, 'null')")" "nullnull"
TX=$(tok PQ000004 4 4 1973); anon "select revoke_pilgrim_session('$TX')" > /dev/null
eq "revoked session → null" "$(anon "select coalesce(get_pilgrim_polls('$TX')::text, 'null')")" "null"
TY=$(tok PQ000004 4 4 1973); q "update public.pilgrim_sessions set idle_expires_at = now() - interval '1 second' where token_hash = extensions.digest('$TY', 'sha256')" > /dev/null
eq "expired session → null" "$(anon "select coalesce(submit_pilgrim_poll_response('$TY', $P1, array[$(opt $P1 1)]::bigint[], 0)::text, 'null')")" "null"

echo "═══ التصويت ═══"
A1=$(opt $P1 1); A2=$(opt $P1 2); A3=$(opt $P1 3)
L=$(anon "select get_pilgrim_polls('$T1')")
eq "portal lists the pilgrim's polls, open, unanswered, with options" "$(echo "$L" | jget pending):$(echo "$L" | python3 -c 'import json,sys; d=json.load(sys.stdin); m=[i for i in d["items"] if i["id"]=='"$P1"'][0]; print(m["state"], len(m["options"]), m["my_response"])')" "3:open 4 None"
eq "portal items carry no counts and no other pilgrims" "$(echo "$L" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(sorted({k for i in d["items"] for k in i}))')" "['body', 'closes_at', 'id', 'kind', 'max_choices', 'my_response', 'options', 'published_at', 'state', 'title']"
r=$(vote "$T1" $P1 "array[$A1,$A2]" 0); eq "first answer (multiple, 2 of max 2) → revision 1" "$(echo "$r" | jget status):$(echo "$r" | jget revision)" "ok:1"
r=$(vote "$T1" $P1 "array[$A2,$A1,$A1]" 1); eq "same answer (order/duplicates ignored) → unchanged, no write" "$(echo "$r" | jget status):$(echo "$r" | jget revision):$(q "select count(*) from poll_response_events where poll_id = $P1 and passenger_id = 5891")" "unchanged:1:1"
r=$(vote "$T1" $P1 "array[$A3]" 1); eq "change answer with the current revision → revision 2" "$(echo "$r" | jget status):$(echo "$r" | jget revision)" "ok:2"
r=$(vote "$T1" $P1 "array[$A1]" 1); eq "stale revision (an older device) → stale, current answer returned, nothing written" "$(echo "$r" | jget status):$(echo "$r" | jget revision):$(echo "$r" | jget option_ids):$(q "select string_agg(option_id::text, ',') from poll_response_choices where poll_id = $P1 and passenger_id = 5891")" "stale:2:[$A3]:$A3"
r=$(vote "$T2" $P1 "array[$A1]" 3); eq "first answer with a non-zero revision → stale" "$(echo "$r" | jget status):$(echo "$r" | jget revision)" "stale:0"
B1=$(opt $P2 1)
r=$(vote "$T1" $P1 "array[$B1]" 2); has "option of another poll → 22023" "$r" "22023"
r=$(vote "$T1" $P1 "array[$A1,$A2,$A3]" 2); has "more choices than max_choices → 22023" "$r" "22023"
r=$(vote "$T1" $P1 "'{}'" 2); has "empty choice → 22023" "$r" "22023"
r=$(vote "$T1" $P2 "array[$(opt $P2 1),$(opt $P2 2)]" 0); has "single-choice poll with two choices → 22023" "$r" "22023"
r=$(vote "$T1" $P1 "array[$A1]" -1); has "negative revision → 22023" "$r" "22023"
r=$(vote "$T3" $P1 "array[$A1]" 0); eq "not in the frozen audience → not_found" "$(echo "$r" | jget status)" "not_found"
eq "…and the poll is not listed for that pilgrim" "$(anon "select get_pilgrim_polls('$T3')" | python3 -c 'import json,sys; print('"$P1"' in [i["id"] for i in json.load(sys.stdin)["items"]])')" "False"
r=$(vote "$T6" $P1 "array[$A2]" 0); eq "manually added newcomer can vote" "$(echo "$r" | jget status)" "ok"
L=$(anon "select get_pilgrim_polls('$T1')"); eq "portal returns my answer and revision only" "$(echo "$L" | python3 -c 'import json,sys; d=json.load(sys.stdin); m=[i for i in d["items"] if i["id"]=='"$P1"'][0]["my_response"]; print(m["revision"], m["option_ids"])')" "2 [$A3]"
eq "change history: submit then change, ids recorded" "$(q "select string_agg(action || ':' || revision || ':' || array_to_string(option_ids, '/'), ',' order by id) from poll_response_events where poll_id = $P1 and passenger_id = 5891")" "submit:1:$A1/$A2,change:2:$A3"

echo "═══ التزامن ═══"
P5=$(mk '{"pilgrim":[5891,5892,5894,5897]}'); staff $U_ADMIN "select publish_poll($P5)" > /dev/null; C1=$(opt $P5 1); C2=$(opt $P5 2)
for i in 1 2; do ( vote "$T2" $P5 "array[$( [ $i = 1 ] && echo $C1 || echo $C2 )]" 0 > "$TMPD/c$i.out" ) & done; wait
eq "two devices submit a first answer at once: one ok, one stale" "$(cat "$TMPD"/c1.out "$TMPD"/c2.out | python3 -c 'import json,sys; print(",".join(sorted(json.loads(l)["status"] for l in sys.stdin if l.strip())))')" "ok,stale"
eq "…one response row, revision 1, one event" "$(q "select count(*) || ':' || max(revision) from poll_responses where poll_id = $P5 and passenger_id = 5892"):$(q "select count(*) from poll_response_events where poll_id = $P5 and passenger_id = 5892")" "1:1:1"
for t in "$T1" "$T4" "$T7"; do ( vote "$t" $P5 "array[$C1]" 0 > "$TMPD/m$RANDOM.out" ) & done; wait
eq "three pilgrims vote at once → three answers" "$(q "select count(*) from poll_responses where poll_id = $P5")" "4"
for i in 1 2 3; do ( vote "$T1" $P5 "array[$C2]" 1 > "$TMPD/s$i.out" ) & done; wait
eq "three concurrent changes from revision 1: exactly one wins, the rest stale" "$(cat "$TMPD"/s*.out | python3 -c 'import json,sys; print(",".join(sorted(json.loads(l)["status"] for l in sys.stdin if l.strip())))'):$(q "select revision from poll_responses where poll_id = $P5 and passenger_id = 5891")" "ok,stale,stale:2"
rm -f "$TMPD"/*.out

echo "═══ النتائجُ الحيّة ═══"
R=$(staff $U_ADMIN "select poll_results($P5)")
eq "live totals: audience 4, respondents 4, option counts" "$(echo "$R" | python3 -c 'import json,sys; d=json.load(sys.stdin)["totals"]; print(d["audience"], d["respondents"], [o["count"] for o in d["options"]])')" "4 4 [2, 2, 0]"
R=$(staff $U_ADMIN "select poll_results($P5, 'bus')")
eq "live grouping by current bus (unassigned shown explicitly)" "$(echo "$R" | python3 -c 'import json,sys; print(";".join(f"{g["label"]}:{g["audience"]}:{g["respondents"]}" for g in json.load(sys.stdin)["groups"]))')" "باص ١:2:2;باص ٢:1:1;غير مُسنَد:1:1"
eq "aggregates carry no names or pilgrim ids" "$(echo "$R" | grep -c 'حاج\|5891\|passenger')" "0"
r=$(staff $U_ADMIN "select poll_results($P5, 'name')"); has "unknown dimension refused" "$r" "22023"
q "set app.season_maintenance = 'on'; update public.passengers set bus_id = 6882 where id = 5891" > /dev/null
eq "live grouping follows the current assignment" "$(staff $U_ADMIN "select poll_results($P5, 'bus')" | python3 -c 'import json,sys; print(";".join(f"{g["label"]}:{g["audience"]}" for g in json.load(sys.stdin)["groups"]))')" "باص ١:1;باص ٢:2;غير مُسنَد:1"
for d in camp_mina camp_arafa hotel flight_go flight_back; do
  eq "live grouping by $d returns groups" "$(staff $U_ADMIN "select jsonb_array_length(poll_results($P5, '$d')->'groups') > 0")" "t"
done

echo "═══ الإغلاقُ واللقطة ═══"
r=$(staff $U_STAFF "select close_poll($P5)"); has "close refused without manage_portal" "$r" "42501"
r=$(staff $U_ADMIN "select close_poll($P5)"); eq "manual close → snapshot written in the same call" "$(echo "$r" | jget status):$(echo "$r" | jget audience):$(echo "$r" | jget respondents):$(st $P5)" "closed:4:4:closed:manual"
S=$(staff $U_ADMIN "select get_poll_snapshot($P5)")
eq "snapshot: checksum valid, grouping by assignment at closure (5891 now in bus 2)" "$(echo "$S" | jget checksum_valid):$(echo "$S" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(";".join(f"{g["label"]}:{g["audience"]}" for g in d["groups"]["bus"]))')" "True:باص ١:1;باص ٢:2;غير مُسنَد:1"
eq "snapshot keeps all six dimensions and per-recipient rows" "$(echo "$S" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(sorted(d["groups"]), len(d["rows"]))')" "['bus', 'camp_arafa', 'camp_mina', 'flight_back', 'flight_go', 'hotel'] 4"
q "set app.season_maintenance = 'on'; update public.passengers set bus_id = 6881 where id = 5891" > /dev/null
eq "later assignment change does not alter the snapshot" "$(staff $U_ADMIN "select get_poll_snapshot($P5)" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(";".join(f"{g["label"]}:{g["audience"]}" for g in d["groups"]["bus"]), d["checksum_valid"])')" "باص ١:1;باص ٢:2;غير مُسنَد:1 True"
r=$(vote "$T1" $P5 "array[$C1]" 2); eq "vote on a closed poll → closed" "$(echo "$r" | jget status)" "closed"
r=$(staff $U_ADMIN "select close_poll($P5)"); has "closing twice refused" "$r" "22023"
r=$(qe "update public.polls set status = 'published', closed_at = null, close_reason = null where id = $P5"); has "closed poll cannot be reopened (even by the owner role)" "$r" "22023"
r=$(staff $U_ADMIN "select add_poll_recipients($P5, array[5896])"); has "no recipients added to a closed poll" "$r" "22023"
r=$(qe "update public.poll_result_snapshots set respondent_count = 0 where poll_id = $P5"); has "snapshot is immutable (update)" "$r" "42501"
r=$(qe "delete from public.poll_result_snapshots where poll_id = $P5"); has "snapshot is immutable (delete)" "$r" "42501"
r=$(qe "delete from public.poll_response_events where poll_id = $P5"); has "change history is append-only" "$r" "42501"
r=$(qe "truncate public.poll_admin_events"); has "admin events cannot be truncated" "$r" "42501"
eq "admin events recorded (create, publish, close) without names" "$(q "select string_agg(action, ',' order by id) from poll_admin_events where poll_id = $P5"):$(q "select count(*) from poll_admin_events where poll_id = $P5 and detail::text ~ 'حاج'")" "create,publish,close:0"

echo "═══ الانتهاءُ والجدولة ═══"
P6=$(mk '{"pilgrim":[5891,5892]}' single null "array['نعم','لا']" "now() + interval '2 seconds'"); staff $U_ADMIN "select publish_poll($P6)" > /dev/null
D1=$(opt $P6 1); vote "$T2" $P6 "array[$D1]" 0 > /dev/null
sleep 3
r=$(vote "$T1" $P6 "array[$D1]" 0); eq "after closes_at: vote → closed, poll settled as expired with its snapshot" "$(echo "$r" | jget status):$(st $P6):$(q "select respondent_count from poll_result_snapshots where poll_id = $P6")" "closed:closed:expired:1"
P7=$(mk '{"pilgrim":[5891]}'); staff $U_ADMIN "select publish_poll($P7, now() + interval '2 seconds')" > /dev/null
eq "scheduled: not frozen and not listed before its time" "$(recips $P7):$(anon "select get_pilgrim_polls('$T1')" | python3 -c 'import json,sys; print('"$P7"' in [i["id"] for i in json.load(sys.stdin)["items"]])')" ":False"
sleep 3
eq "…at its time it is published and frozen by the scheduler job (settle)" "$(q "select public._polls_settle_due(50) >= 1"):$(st $P7):$(recips $P7)" "t:published:5891"
P8=$(mk '{"pilgrim":[5892]}'); staff $U_ADMIN "select publish_poll($P8, now() + interval '2 seconds')" > /dev/null; sleep 3
r=$(vote "$T2" $P8 "array[$(opt $P8 1)]" 0); eq "…or by the first vote after its time (no job needed)" "$(echo "$r" | jget status):$(st $P8)" "ok:published"
eq "polls-settle job scheduled every minute" "$(q "select schedule || ' ' || command from cron.job where jobname = 'polls-settle'")" "* * * * * SELECT public._polls_settle_due(50);"

echo "═══ حدُّ الطلبات ═══"
q "insert into public.edge_rate_limits (scope, subject, window_start, hits)
   values ('portal-poll', md5('portal-poll:5896')::uuid, to_timestamp(floor(extract(epoch from now()) / 3600) * 3600), 60)
   on conflict (scope, subject, window_start) do update set hits = 60" > /dev/null
r=$(vote "$T6" $P8 "array[$(opt $P8 1)]" 0); eq "61st vote request in the hour → rate_limited, nothing written" "$(echo "$r" | jget status):$(q "select count(*) from poll_responses where poll_id = $P8 and passenger_id = 5896")" "rate_limited:0"
eq "closed poll listed to its pilgrim as closed with his answer" "$(anon "select get_pilgrim_polls('$T2')" | python3 -c 'import json,sys; m=[i for i in json.load(sys.stdin)["items"] if i["id"]=='"$P6"'][0]; print(m["state"], m["my_response"]["revision"])')" "closed 1"

echo "═══ حذفُ الحاجّ ═══"
P9=$(mk '{"pilgrim":[5891,5897]}'); staff $U_ADMIN "select publish_poll($P9)" > /dev/null
vote "$T7" $P9 "array[$(opt $P9 1)]" 0 > /dev/null; vote "$T7" $P1 "array[$A1]" 0 > /dev/null
staff $U_ADMIN "select close_poll($P1)" > /dev/null
eq "before deletion: 5897 answered the open poll and the closed one" "$(q "select count(*) from poll_responses where passenger_id = 5897 and poll_id in ($P1,$P9)")" "2"
q "set app.season_maintenance = 'on'; delete from public.pilgrim_sessions where passenger_id = 5897; delete from public.passengers where id = 5897" > /dev/null
eq "deleted pilgrim: live audience and answers removed" "$(q "select count(*) from poll_recipients where passenger_id = 5897")$(q "select count(*) from poll_responses where passenger_id = 5897")" "00"
eq "…live results of the open poll no longer count him" "$(staff $U_ADMIN "select poll_results($P9)->'totals'->>'respondents'")" "0"
eq "…the closed poll's snapshot keeps his answer" "$(staff $U_ADMIN "select get_poll_snapshot($P1)" | python3 -c 'import json,sys; d=json.load(sys.stdin); r=[x for x in d["rows"] if x["passenger_id"]==5897]; print(len(r), r[0]["responded"], d["checksum_valid"])')" "1 True True"
eq "…and his change history is kept (P5, P9, P1)" "$(q "select count(*) from poll_response_events where passenger_id = 5897 and poll_id in ($P5,$P9,$P1)")" "3"

echo "═══ الموسم: إقفالٌ ذرّيّ ═══"
PF_BEFORE=$(q "select md5(string_agg(to_jsonb(p)::text, '' order by id)) from public.passengers p where season_id = 9881")
P10=$(mk '{"all":true}'); staff $U_ADMIN "select publish_poll($P10)" > /dev/null; vote "$T1" $P10 "array[$(opt $P10 2)]" 0 > /dev/null
P11=$(mk '{"all":true}'); staff $U_ADMIN "select publish_poll($P11, now() + interval '1 day')" > /dev/null
P12=$(mk '{"all":true}')
# معاملةٌ تُقفل الموسم ثم تُجهَض: لا شيءَ يبقى من الإغلاقات ولا من اللقطات
r=$(qe "begin; select close_season('موسم P2 التالي', 1499, 'tester', '$U_ADMIN'); select status from polls where id = $P10; rollback;")
eq "season close aborted: polls, snapshots and the season roll back together" "$(st $P10):$(st $P11):$(q "select count(*) from poll_result_snapshots where poll_id in ($P10,$P11)"):$(q "select (closed_at is null)::text from seasons where id = 9881")" "published:scheduled:0:true"
# تصويتٌ جارٍ يمسك الموسم (FOR SHARE) بينما يُقفَل: الإقفالُ ينتظره، ولا جمود
( psql "$LOCAL" -X -q -At -c "begin; set local role anon; select submit_pilgrim_poll_response('$T2', $P10, array[$(opt $P10 1)]::bigint[], 0)->>'status'; select pg_sleep(1.5); commit;" > "$TMPD/v.out" 2>&1 ) &
sleep 0.4
r=$(qe "select close_season('موسم P2 التالي', 1499, 'tester', '$U_ADMIN') is not null"); wait
eq "season close waits for an in-flight vote — no deadlock, the vote counts" "$r:$(head -1 "$TMPD/v.out"):$(grep -c deadlock "$TMPD/v.out")" "t:ok:0"
eq "published poll closed by the season, scheduled one too, draft untouched" "$(st $P10):$(st $P11):$(st $P12)" "closed:season_close:closed:season_close:draft"
eq "…its snapshot includes the in-flight vote (2 respondents)" "$(q "select respondent_count || ':' || close_reason from poll_result_snapshots where poll_id = $P10")" "2:season_close"
eq "season closed; season event counts every poll it closed" "$(q "select (closed_at is not null)::text from seasons where id = 9881"):$(q "select new_value->>'polls_closed' from audit_log where table_name = 'seasons' and row_id = '9881' order by id desc limit 1")" "true:$(q "select count(*) from polls where season_id = 9881 and close_reason = 'season_close'")"
eq "…no published or scheduled poll left in the closed season" "$(q "select count(*) from polls where season_id = 9881 and status in ('published','scheduled')")" "0"
r=$(vote "$T1" $P10 "array[$(opt $P10 1)]" 1); eq "after the season closes, the session is gone (vote → null)" "${r:-null}" "null"
r=$(qe "set role authenticated; select 1"); r=$(staff $U_ADMIN "select update_poll($P12, 'x', null, 'single', null, '{\"all\":true}'::jsonb, array['a','b'], null)"); has "draft in a closed season cannot be edited" "$r" "P0001"
r=$(qe "update public.polls set title = 'x' where id = $P12"); has "closed-season trigger guards polls" "$r" "مقفل"
eq "pilgrims table never written by publishing, voting or closing (fingerprint before votes = after season close)" "$PF_BEFORE" "$(q "select md5(string_agg(to_jsonb(p)::text, '' order by id)) from public.passengers p where season_id = 9881")"

echo "═══ الموسم: الحذف ═══"
NEWS=$(q "select id from seasons where hijri_year = 1499")
ADMIN_EV=$(q "select count(*) from poll_admin_events where season_id = 9881")
r=$(qe "select delete_season(9881, '$U_ADMIN')"); [ -z "$(echo "$r" | grep -i error)" ] && ok "delete_season succeeds with polls present" || bad "delete_season ($r)"
eq "polls, options, answers, snapshots and change history of the season deleted" "$(q "select (select count(*) from polls where season_id = 9881) + (select count(*) from poll_result_snapshots where season_id = 9881) + (select count(*) from poll_response_events where season_id = 9881)")" "0"
eq "admin events kept (no personal content)" "$(q "select count(*) from poll_admin_events where season_id = 9881")" "$ADMIN_EV"
eq "season deletion event counts the polls" "$(q "select (new_value->'deleted_counts'->>'polls')::int > 0 from audit_log where table_name = 'seasons' and row_id = '9881' and action = 'delete' order by id desc limit 1")" "t"
q "set app.season_maintenance = 'on'; delete from public.seasons where id = $NEWS" > /dev/null

echo ""
echo "Phase 2 polls tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
