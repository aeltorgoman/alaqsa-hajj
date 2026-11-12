#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# الاستطلاعات — Phase 4: poll_details (ترحيلة 20261112224117) — فحوصٌ بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ مؤقّتةٍ وحدها (بعد `db reset` إلى آخر ترحيلة):
#   supabase/verification/portal/polls_phase4_tests.sh
#   LOCAL='postgresql:///db?host=/path/to/socket&port=…&user=postgres' …   ← عنقودٌ محلّيٌّ آخر
#
#   الصفوفُ المسمّاة: الجمهورُ المجمَّد وحده · صفٌّ لكلّ حاجّ · الإجابةُ الحاليّة بعد التغيير (لا عدَّ مزدوج)
#   الإسقاطُ الضيّق: باص ومنى وحدهما (لا عرفة ولا فندق ولا رحلات) · أسماءُ الباصات والمخيّمات
#   الحيُّ والمغلق: المنشورُ بالإسناد الحاليّ · المغلقُ من اللقطة بإسناد لحظة الإغلاق، ويبقى بعد حذف الحاجّ
#   المسوّدة: بلا صفوف · غيرُ الموجود: P0002
#   الصلاحيات: manage_portal وحده · لا staff بلا الصلاحية · لا anon · لا service_role · البوابةُ لا ترى أسماءً
#   القراءةُ لا تكتب
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
anon()  { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role anon; do \$x\$ begin perform set_config('request.headers', '{\"x-forwarded-for\":\"10.40.0.7\"}', true); end \$x\$; $1; commit;" 2>&1; }
svc()   { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role service_role; $1; commit;" 2>&1; }
py()  { python3 -c "import json,sys; d=json.loads(sys.stdin.read()); $1"; }

if [ "$(q "select count(*) from public.seasons where id = 9871 or hijri_year = 1496")" != "0" ]; then echo "يرفض: موسمُ التهيئة موجود"; exit 2; fi
if [ "$(q "select count(*) from public.seasons where closed_at is null")" != "0" ]; then echo "يرفض: في القاعدة موسمٌ مفتوح"; exit 2; fi

U_ADMIN=00000000-0000-0000-0000-0000000097a1
U_STAFF=00000000-0000-0000-0000-0000000097a2
cleanup() {
  q "set app.season_maintenance = 'on';
     delete from public.poll_result_snapshots where season_id = 9871;
     delete from public.poll_response_events where season_id = 9871;
     delete from public.polls where season_id = 9871;
     delete from public.pilgrim_sessions where passenger_id between 5870 and 5879;
     delete from public.passengers where id between 5870 and 5879;
     delete from public.camps where id in (6971, 6972, 6973);
     delete from public.buses where id in (6871, 6872);
     delete from public.seasons where id = 9871 or hijri_year = 1496;
     delete from public.edge_rate_limits where scope = 'portal-poll';
     delete from public.user_profiles where id in ('$U_ADMIN', '$U_STAFF');
     delete from auth.users where id in ('$U_ADMIN', '$U_STAFF');" > /dev/null 2>&1
}
trap cleanup EXIT

#   5871 حاجّ: باص ١ · منى ١      5872 حاجّ: باص ٢ · خيمة خاصّة      5873 حاجّ: باص ١ · بلا منى
#   5874 حاجّ: بلا إسناد            5875 مرافق: باص ١ (خارجُ «الكلّ»)    5876 حاجّ: باص ١ · منى ١ (يُحذف بعد الإغلاق)
q "set app.season_maintenance = 'on';
   insert into auth.users (id,email,aud,role) values
     ('$U_ADMIN','p4-admin@t.local','authenticated','authenticated'), ('$U_STAFF','p4-staff@t.local','authenticated','authenticated');
   insert into public.user_profiles (id,email,name,permissions,is_active) values
     ('$U_ADMIN','p4-admin@t.local','مدير النتائج','{\"manage_portal\":true}',true),
     ('$U_STAFF','p4-staff@t.local','موظّف','{\"manage_passengers\":true,\"view_reports\":true}',true);
   insert into public.seasons (id,name,hijri_year,closed_at) overriding system value values (9871,'موسم P4',1496,null);
   insert into public.buses (id,season_id,name) overriding system value values (6871,9871,'باص ١'),(6872,9871,'باص ٢');
   insert into public.camps (id,season_id,name,type,page_type,gender,capacity) overriding system value values
     (6971,9871,'منى ١','عادي','منى','ذكر',50),(6972,9871,'خيمة خاصّة','خاص','منى',null,50),(6973,9871,'عرفة ١','عادي','عرفة','ذكر',50);
   insert into public.passengers (id,season_id,name_ar,passport,dob,gender,passenger_type,bus_id,camp_mina_id,camp_arafa_id) overriding system value values
     (5871,9871,'حاج أول','PR000001','01/01/1970','ذكر','حاج',6871,6971,6973),
     (5872,9871,'حاج ثان','PR000002','02/02/1971','ذكر','حاج',6872,6972,null),
     (5873,9871,'حاج ثالث','PR000003','03/03/1972','ذكر','حاج',6871,null,null),
     (5874,9871,'حاج رابع','PR000004','04/04/1973','ذكر','حاج',null,null,null),
     (5875,9871,'مرافق خامس','PR000005','05/05/1974','ذكر','مرافق',6871,null,null),
     (5876,9871,'حاج سادس','PR000006','06/06/1975','ذكر','حاج',6871,6971,null);" > /dev/null || { echo "تعذّرت التهيئة"; exit 2; }
tok() { anon "select create_pilgrim_session('$1',$2,$3,$4)->>'token'"; }
T1=$(tok PR000001 1 1 1970); T2=$(tok PR000002 2 2 1971); T3=$(tok PR000003 3 3 1972); T6=$(tok PR000006 6 6 1975)
[ ${#T1} -ge 40 ] && [ ${#T2} -ge 40 ] && [ ${#T3} -ge 40 ] && [ ${#T6} -ge 40 ] && ok "fixtures: four portal sessions" || bad "fixtures: logins"
mk() { staff $U_ADMIN "select create_poll('سؤال P4', null, '${2:-single}', ${3:-null}, '$1'::jsonb, array['أ','ب','ج'], null)"; }
opt() { q "select id from public.poll_options where poll_id = $1 order by sort_order offset $(( $2 - 1 )) limit 1"; }
vote() { anon "select submit_pilgrim_poll_response('$1', $2, $3::bigint[], $4)->>'status'"; }
det() { staff $U_ADMIN "select poll_details($1)"; }

echo "═══ المسوّدة ═══"
P1=$(mk '{"all":true}')
r=$(det $P1)
eq "draft: no frozen audience → no rows; options listed; source live" "$(echo "$r" | py 'print(len(d["rows"]), len(d["options"]), d["status"], d["source"])')" "0 3 draft live"

echo "═══ اختيارٌ واحد: الجمهورُ والأعدادُ وتغييرُ الإجابة ═══"
staff $U_ADMIN "select publish_poll($P1)" > /dev/null
A=$(opt $P1 1); B=$(opt $P1 2)
eq "votes: 5871→أ, 5872→ب, 5873→أ" "$(vote "$T1" $P1 "array[$A]" 0)$(vote "$T2" $P1 "array[$B]" 0)$(vote "$T3" $P1 "array[$A]" 0)" "okokok"
eq "5873 changes أ→ب (revision 1→2)" "$(vote "$T3" $P1 "array[$B]" 1)" "ok"
r=$(det $P1)
eq "rows = frozen audience, pilgrims only (مرافق excluded), ordered by id" "$(echo "$r" | py 'print(",".join(str(x["passenger_id"]) for x in d["rows"]))')" "5871,5872,5873,5874,5876"
eq "respondents 3, nonrespondents 2" "$(echo "$r" | py 'print(sum(x["responded"] for x in d["rows"]), sum(not x["responded"] for x in d["rows"]))')" "3 2"
eq "the changed answer counts once, at its current option (أ=1, ب=2, ج=0)" "$(echo "$r" | py "
from collections import Counter; c=Counter(o for x in d['rows'] for o in x['option_ids']); print(c[$A], c[$(opt $P1 2)], c[$(opt $P1 3)])")" "1 2 0"
eq "…5873: one row, revision 2, option ب" "$(echo "$r" | py "x=[x for x in d['rows'] if x['passenger_id']==5873]; print(len(x), x[0]['revision'], x[0]['option_ids'])")" "1 2 [$B]"
eq "names are present for drill-down" "$(echo "$r" | py 'print([x["name_ar"] for x in d["rows"] if x["passenger_id"]==5871][0])')" "حاج أول"
eq "assignment: bus and Mina, unassigned explicit (null)" "$(echo "$r" | py 'print(";".join("%s:%s:%s" % (x["passenger_id"], x["bus"], x["camp_mina"]) for x in d["rows"]))')" "5871:6871:6971;5872:6872:6972;5873:6871:None;5874:None:None;5876:6871:6971"
eq "narrow projection: only these row keys (no Arafat, hotel, flights)" "$(echo "$r" | py 'print(",".join(sorted(d["rows"][0].keys())))')" "added_reason,bus,camp_mina,name_ar,option_ids,passenger_id,passenger_type,responded,revision"
eq "labels: buses and Mina camps only, with names" "$(echo "$r" | py 'print(sorted(d["labels"].keys()), d["labels"]["bus"]["6871"], d["labels"]["camp_mina"]["6972"], "6973" in d["labels"]["camp_mina"])')" "['bus', 'camp_mina'] باص ١ خيمة خاصّة False"
eq "published: source live" "$(echo "$r" | py 'print(d["source"], d["kind"])')" "live single"
ev0=$(q "select count(*) from poll_response_events where poll_id = $P1")$(q "select count(*) from poll_admin_events where poll_id = $P1")
det $P1 > /dev/null
eq "reading writes nothing (no response or admin events added)" "$(q "select count(*) from poll_response_events where poll_id = $P1")$(q "select count(*) from poll_admin_events where poll_id = $P1")" "$ev0"

echo "═══ متعدّد ═══"
P2=$(mk '{"bus":[6871]}' multiple 2); staff $U_ADMIN "select publish_poll($P2)" > /dev/null
M1=$(opt $P2 1); M2=$(opt $P2 2)
eq "multiple: 5871 picks two, 5873 one" "$(vote "$T1" $P2 "array[$M1,$M2]" 0)$(vote "$T3" $P2 "array[$M1]" 0)" "okok"
r=$(det $P2)
eq "multiple: bus-1 audience (5871,5873,5876), choices per row" "$(echo "$r" | py 'print(";".join("%s:%s" % (x["passenger_id"], x["option_ids"]) for x in d["rows"]))')" "5871:[$M1, $M2];5873:[$M1];5876:[]"
eq "multiple: kind and max_choices returned" "$(echo "$r" | py 'print(d["kind"], d["max_choices"])')" "multiple 2"

echo "═══ الصلاحيات وعزلُ البيانات ═══"
has "staff without manage_portal → 42501" "$(staff $U_STAFF "select poll_details($P1)")" "42501"
has "anon cannot execute" "$(anon "select poll_details($P1)")" "permission denied"
has "service_role cannot execute" "$(svc "select poll_details($P1)")" "permission denied"
has "unknown poll → P0002" "$(staff $U_ADMIN "select poll_details(987654321)")" "P0002"
r=$(anon "select get_pilgrim_polls('$T1')")
eq "portal RPC still carries no other pilgrim's names or ids" "$(echo "$r" | py 'import re; s=json.dumps(d, ensure_ascii=False); print(("حاج ثان" in s) or ("5872" in s) or ("name_ar" in s))')" "False"
eq "answer tables still not directly readable by anon/authenticated" "$(staff $U_ADMIN "select count(*) from poll_responses" 2>&1 | grep -c 'permission denied')$(anon "select count(*) from poll_response_choices" | grep -c 'permission denied')" "11"

echo "═══ المغلق: لقطةُ الإغلاق بإسناد تلك اللحظة ═══"
staff $U_ADMIN "select close_poll($P1)" > /dev/null
q "update public.passengers set bus_id = 6872, camp_mina_id = 6972 where id = 5871" > /dev/null
q "update public.buses set name = 'باص ١ (اسمٌ جديد)' where id = 6871" > /dev/null
r=$(det $P1)
eq "closed: source snapshot" "$(echo "$r" | py 'print(d["status"], d["source"])')" "closed snapshot"
eq "closed: 5871 keeps the bus/Mina it had at closure" "$(echo "$r" | py 'x=[x for x in d["rows"] if x["passenger_id"]==5871][0]; print(x["bus"], x["camp_mina"])')" "6871 6971"
eq "closed: bus name as at closure" "$(echo "$r" | py 'print(d["labels"]["bus"]["6871"])')" "باص ١"
r=$(det $P2)
eq "published (live): 5871 now shows the current assignment" "$(echo "$r" | py 'x=[x for x in d["rows"] if x["passenger_id"]==5871][0]; print(x["bus"], x["camp_mina"], d["labels"]["bus"]["6871"])')" "6872 6972 باص ١ (اسمٌ جديد)"
eq "closed counts unchanged by later edits (respondents 3)" "$(det $P1 | py 'print(sum(x["responded"] for x in d["rows"]))')" "3"
q "set app.season_maintenance = 'on'; delete from public.pilgrim_sessions where passenger_id = 5876; delete from public.passengers where id = 5876" > /dev/null
eq "deleted pilgrim: still in the closed snapshot (name kept)" "$(det $P1 | py 'print([x["name_ar"] for x in d["rows"] if x["passenger_id"]==5876])')" "['حاج سادس']"
eq "…and gone from the live audience" "$(det $P2 | py 'print(5876 in [x["passenger_id"] for x in d["rows"]])')" "False"
has "closed poll still refuses votes" "$(vote "$T2" $P1 "array[$A]" 1)" "closed"

echo "═══ منحُ الدالّة ═══"
eq "grants: authenticated only, SECURITY DEFINER, fixed search_path" "$(q "select has_function_privilege('authenticated','public.poll_details(bigint)','EXECUTE')::text || has_function_privilege('anon','public.poll_details(bigint)','EXECUTE')::text || has_function_privilege('service_role','public.poll_details(bigint)','EXECUTE')::text || prosecdef::text || array_to_string(proconfig, ';') from pg_proc where oid = 'public.poll_details(bigint)'::regprocedure")" "truefalsefalsetruesearch_path=public, pg_temp"

echo
echo "Phase 4 poll_details tests: $pass passed, $fail failed"
[ "$fail" = 0 ]
