#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# بوابة الحاجّ — M1 (الإعدادات الثمانية) و M2/M3 (الدخول): فحوصٌ بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ مؤقّتةٍ وحدها (بعد `db reset` إلى آخر ترحيلة):
#   supabase/verification/portal/phase2_settings_login_tests.sh
#   LOCAL='postgresql:///db?host=/path/to/socket&port=…&user=postgres' …   ← عنقودٌ محلّيٌّ آخر
#
# تُنادى الدوالّ كما يناديها المتصفّح (`anon`) والموظّف (`authenticated` بمطالبات
# JWT) و`pilgrim-doc` (`service_role`). بياناتٌ مُصطنَعة وحدها.
#   M1 الحسّاسُ المخفيُّ لا يخرج من الخادم: المستندات، والصورة بحسب الجنس، وأسماءُ
#      رفقاء الغرفة · pilgrim_doc_allowed · البصمة · الحفظُ بالمفاتيح الثمانية وأنواعها
#      · صلاحيّةُ البوابة لا تكتب إعداداتِ الشركة
#   M2 الوثيقةُ موحَّدةٌ (الحالة، الفراغات، الأرقام العربيّة/الفارسيّة) على الطرفين،
#      ومفتاحُ الحدّ عليها · الطولُ ومحارفُ التحكّم
#   M3 الرفضُ ردٌّ واحد: وثيقةٌ غير موجودة = ميلادٌ خاطئ
#
# ⚠️ يرفض أيَّ قاعدةٍ غيرِ محلّيّة، ويعيد صفَّ الإعدادات كما كان، ويحذف ما يكتبه.
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
anon() { psql "$LOCAL" -X -q -At -c "begin; set local role anon; do \$x\$ begin perform set_config('request.headers', '{\"x-forwarded-for\":\"$1\"}', true); end \$x\$; $2; commit;" 2>&1; }
staff() { psql "$LOCAL" -X -q -At -c "begin; set local role authenticated; do \$x\$ begin perform set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true); end \$x\$; $2; commit;" 2>&1; }
svc()  { psql "$LOCAL" -X -q -At -c "begin; set local role service_role; $1; commit;" 2>&1; }

if [ "$(q "select count(*) from public.seasons where id in (9721)")" != "0" ]; then
  echo "يرفض: موسمُ التهيئة 9721 موجودٌ مسبقاً"; exit 2
fi
if [ "$(q "select count(*) from public.seasons where closed_at is null")" != "0" ]; then
  echo "يرفض: في القاعدة موسمٌ مفتوح — الفحوصُ تحتاج قاعدةً بلا مواسم مفتوحة"; exit 2
fi
ORIG=$(q "select json_build_object('s', portal_settings, 'w', portal_welcome_message, 'h', portal_help_message, 'n', admin_name, 'p', admin_phone, 'a', admin_whatsapp, 'name', name_ar)::text from public.company_config where id = 1")
[ -n "$ORIG" ] || { echo "يرفض: لا صفَّ company_config"; exit 2; }

U_PORTAL=00000000-0000-0000-0000-00000000cc01
U_STAFF=00000000-0000-0000-0000-00000000cc02
FIX="set app.season_maintenance = 'on';"
q "$FIX
   insert into auth.users (id,email,aud,role) values
     ('$U_PORTAL','portal-p2@t.local','authenticated','authenticated'),
     ('$U_STAFF','staff-p2@t.local','authenticated','authenticated');
   insert into public.user_profiles (id,email,name,permissions,is_active) values
     ('$U_PORTAL','portal-p2@t.local','مدير البوابة','{\"manage_portal\":true}',true),
     ('$U_STAFF','staff-p2@t.local','موظّف','{\"manage_passengers\":true}',true);
   insert into public.seasons (id,name,hijri_year,closed_at) overriding system value values (9721,'موسم اختبار ٢',1473,null);
   insert into public.hotels (id,season_id,city,name) overriding system value values (6731,9721,'مكة','فندق الاختبار');
   insert into public.rooms (id,season_id,hotel_id,number,floor,capacity) overriding system value values (6741,9721,6731,'101','1',4);
   insert into public.camps (id,season_id,name,type,page_type,gender) overriding system value values (6751,9721,'منى ٢','منى','منى','ذكر'),(6752,9721,'عرفة ٢','عرفة','عرفة','ذكر');
   insert into public.passengers (id,season_id,name_ar,passport,national_id,dob,gender,room_id,family_id,camp_arafa_id,photo_url,hajj_permit_url,flight_ticket_url,passenger_type) overriding system value values
     (5721,9721,'حاج رجل','pm000021 ','28400000021','1960-03-15','ذكر',6741,'F21',6752,'p/5721.jpg','p/5721-permit.pdf','p/5721-ticket.pdf','حاج'),
     (5722,9721,'رفيق الغرفة السري','PM000022',null,'1961-01-01','ذكر',6741,null,null,null,null,null,'حاج'),
     (5723,9721,'حاجة جيم','PF000023',null,'1970-07-07','أنثى',null,'F21',null,'p/5723.jpg',null,null,'حاج');" > /dev/null

save() { staff $U_PORTAL "select (update_portal_settings('$1'::jsonb, null, null, null, null, null)).portal_settings::text"; }
tok()  { anon "10.30.0.$1" "select create_pilgrim_session($2,$3,$4,$5)->>'token'"; }
pf()   { anon 10.30.0.2 "select get_pilgrim_portal_by_session('$1') $2"; }
allowed() { svc "select pilgrim_doc_allowed($1,'$2')"; }

echo "═══ M2 — الوثيقةُ الموحَّدة ═══"
q "delete from public.edge_rate_limits" > /dev/null
TM=$(tok 1 "' PM000021'" 15 3 1960);           [ ${#TM} -ge 40 ] && ok "M2 stored 'pm000021 ' (lowercase + trailing space) matches input ' PM000021'" || bad "M2 stored-side normalization ($TM)"
r=$(tok 1 "'pm000021'" 15 3 1960);              [ ${#r} -ge 40 ] && ok "M2 lowercase input matches" || bad "M2 lowercase ($r)"
r=$(tok 1 "U&'\\00A0PM\\0660\\0660\\0660\\0660\\0662\\0661\\200F'" 15 3 1960); [ ${#r} -ge 40 ] && ok "M2 Arabic-Indic digits + NBSP/RLM around → match" || bad "M2 arabic digits ($r)"
r=$(tok 1 "'pm۰۰۰۰۲۱'" 15 3 1960);              [ ${#r} -ge 40 ] && ok "M2 Persian digits + lowercase → match" || bad "M2 persian digits ($r)"
r=$(tok 1 "'٢٨٤٠٠٠٠٠٠٢١'" 15 3 1960);            [ ${#r} -ge 40 ] && ok "M2 national ID in Arabic digits → match" || bad "M2 national id arabic ($r)"
TF=$(tok 1 "'pf000023'" 7 7 1970);              [ ${#TF} -ge 40 ] && ok "M2 second pilgrim (female) lowercase → match" || bad "M2 female ($TF)"
TR=$(tok 1 "'PM000022'" 1 1 1961)
r=$(anon 10.30.0.3 "select create_pilgrim_session('P M000021',15,3,1960)"); [ -z "$r" ] && ok "M2 inner whitespace is NOT stripped (only surrounding)" || bad "M2 inner space ($r)"
r=$(anon 10.30.0.3 "select create_pilgrim_session(repeat('A',33),15,3,1960)"); [ -z "$r" ] && ok "M2 document longer than 32 → null" || bad "M2 long ($r)"
r=$(anon 10.30.0.3 "select create_pilgrim_session(E'PM00\\0010021',15,3,1960)"); [ -z "$r" ] && ok "M2 inner control character (SOH) → null" || bad "M2 control ($r)"
r=$(anon 10.30.0.3 "select create_pilgrim_session(E'PM000021\\t\\u0007',15,3,1960)"); [ -z "$r" ] && ok "M2 trailing control char (BEL) → null" || bad "M2 BEL ($r)"
for v in "''" "'   '" "U&'\\00A0\\200F'" "null"; do
  r=$(anon 10.30.0.3 "select create_pilgrim_session($v,1,1,1960)"); [ -z "$r" ] || bad "H1 blank $v → $r"
done; ok "H1 blank/whitespace documents still → null"

echo "═══ M3 — ردٌّ واحدٌ لا يكشف الوجود ═══"
r1=$(anon 10.30.0.4 "select coalesce(create_pilgrim_session('PM000021',16,3,1960)::text,'NULL')")
r2=$(anon 10.30.0.4 "select coalesce(create_pilgrim_session('ZZ999999',15,3,1960)::text,'NULL')")
[ "$r1" = "NULL" ] && [ "$r2" = "NULL" ] && ok "M3 existing passport + wrong DOB and non-existent passport → identical response (null)" || bad "M3 differ ($r1 / $r2)"
q "delete from public.edge_rate_limits" > /dev/null
i=0; for v in pm000022 PM000022 pM000022 PM٠٠٠٠٢٢ PM۰۰۰۰۲۲ " pm000022" "PM000022 " Pm000022 pm٠٠٠٠22 PM00002٢; do
  i=$((i + 1)); anon "10.30.1.$i" "select create_pilgrim_session('$v',2,2,1900)" > /dev/null
done
r=$(anon 10.30.2.1 "select create_pilgrim_session('PM000022',1,1,1961)")
echo "$r" | grep -q rate_limited && ok "M2 rate limit keyed on the normalized document: 10 failures across case/digit/space variants → correct login rate_limited" || bad "M2 rate-limit bypass by variants ($r)"
q "delete from public.edge_rate_limits" > /dev/null
r=$(anon 10.30.2.2 "select (create_pilgrim_session('PM000022',1,1,1961)->>'token') is not null"); [ "$r" = "t" ] && ok "M2 after the window clears the same pilgrim logs in" || bad "M2 relogin ($r)"

echo "═══ M1 — الافتراضات ═══"
r=$(pf "$TM" "->'config'->'portal_settings'")
[ "$(q "select '$r'::jsonb = '{\"flights\":true,\"rooms\":true,\"buses\":true,\"documents\":true,\"roommates\":true,\"lost_card\":true,\"arafat_countdown\":true,\"photo_visibility\":\"none\"}'::jsonb")" = "t" ] \
  && ok "M1 portal receives the 8 effective settings (stored legacy keys ignored; photo default none; countdown default on)" || bad "M1 effective settings ($r)"
r=$(pf "$TM" "->'pilgrim'->>'has_photo'"); [ "$r" = "false" ] && ok "M1 photo hidden by default → has_photo=false" || bad "M1 default photo ($r)"
r=$(allowed 5721 photo); [ "$r" = "f" ] && ok "M1 pilgrim-doc guard refuses the photo by default" || bad "M1 default photo guard ($r)"
r=$(pf "$TM" "->'pilgrim'->>'has_hajj_permit'"); [ "$r" = "true" ] && ok "M1 documents visible by default" || bad "M1 default docs ($r)"
r=$(pf "$TM" "->'notifications'"); echo "$(pf "$TM" "->'announcements'")" | grep -q '^\[' && ok "M1 announcements present regardless of any notifications key" || bad "M1 announcements"

echo "═══ M1 — المستندات ═══"
r=$(save '{"documents":false}'); [ "$(q "select '$r'::jsonb = '{\"documents\":false}'::jsonb")" = "t" ] && ok "M1 manage_portal saves documents=false" || bad "M1 save docs ($r)"
r=$(pf "$TM" "->'pilgrim'"); echo "$r" | grep -q '"has_hajj_permit" : false' && echo "$r" | grep -q '"has_flight_ticket" : false' && ok "M1 documents hidden → has_hajj_permit/has_flight_ticket false in the response" || bad "M1 docs flags ($r)"
r=$(allowed 5721 hajj_permit)$(allowed 5721 flight_ticket); [ "$r" = "ff" ] && ok "M1 pilgrim-doc guard refuses permit and ticket (view AND download path)" || bad "M1 docs guard ($r)"
r=$(staff $U_PORTAL "select count(*) from public.passengers where id = 5721 and hajj_permit_url is not null"); [ "$r" = "1" ] && ok "M1 authorized staff still read the document keys (admin path unaffected)" || bad "M1 admin docs ($r)"
save '{"documents":true}' > /dev/null
r=$(allowed 5721 hajj_permit); [ "$r" = "t" ] && ok "M1 documents shown again → guard allows" || bad "M1 docs on ($r)"

echo "═══ M1 — صورة الحاجّ ═══"
for m in all men women none; do
  save "{\"photo_visibility\":\"$m\"}" > /dev/null
  hm=$(pf "$TM" "->'pilgrim'->>'has_photo'"); hf=$(pf "$TF" "->'pilgrim'->>'has_photo'")
  am=$(allowed 5721 photo); af=$(allowed 5723 photo)
  case $m in all) e="true true t t";; men) e="true false t f";; women) e="false true f t";; none) e="false false f f";; esac
  [ "$hm $hf $am $af" = "$e" ] && ok "M1 photo_visibility=$m → man/woman has_photo & guard = $hm/$hf $am/$af" || bad "M1 photo $m → $hm $hf $am $af (expected $e)"
  # ولا مفتاحُ الصورة ولا رابطُها في الردّ بأيّ وضع — الردُّ يحمل has_photo وحده
  leak=$(pf "$TM" "::text")$(pf "$TF" "::text"); echo "$leak" | grep -qE "5721\.jpg|5723\.jpg|photo_url|/storage/" && bad "M1 photo $m: photo key/URL in the portal payload"
done
ok "M1 no photo key, path or URL in the portal payload in any of the four modes"
# البلاغ بعينه: الإدارةُ تحفظ «إخفاء الكل» من مسارها (update_portal_settings) والحاجُّ داخلٌ قبلها
save '{"photo_visibility":"all"}' > /dev/null
[ "$(pf "$TM" "->'pilgrim'->>'has_photo'")" = "true" ] || bad "M1 report: photo not shown under «all»"
save '{"photo_visibility":"none"}' > /dev/null
r=$(pf "$TM" "->'pilgrim'->>'has_photo'")$(pf "$TF" "->'pilgrim'->>'has_photo'")$(allowed 5721 photo)$(allowed 5723 photo)
[ "$r" = "falsefalseff" ] && ok "M1 reported case: «Hide all» saved by the admin RPC → the same open session gets has_photo=false for both genders and pilgrim-doc refuses" || bad "M1 reported case ($r)"
r=$(allowed 5721 passport_scan)$(allowed 99999999 photo); [ "$r" = "ff" ] && ok "M1 guard: unknown doc type / unknown pilgrim → false" || bad "M1 guard unknown ($r)"

echo "═══ M1 — رفقاء الغرفة ═══"
save '{"roommates":true}' > /dev/null
r=$(pf "$TM" "->'roommates'"); echo "$r" | grep -q "رفيق الغرفة السري" && ok "M1 roommates shown → names present" || bad "M1 roommates on ($r)"
save '{"roommates":false}' > /dev/null
r=$(pf "$TM" "::text"); ! echo "$r" | grep -q "رفيق الغرفة السري" && [ "$(pf "$TM" "->'roommates'")" = "[]" ] && ok "M1 roommates hidden → no roommate name anywhere in the response" || bad "M1 roommates leak"
r=$(pf "$TM" "->'pilgrim'->>'camp_arafa_name'")$(pf "$TM" "->'family'->0->>'name'"); [ "$r" = "عرفة ٢حاجة جيم" ] && ok "M1 hiding roommates leaves Arafat allocation and family intact" || bad "M1 arafat/family ($r)"
r=$(pf "$TM" "->'room'->>'number'"); [ "$r" = "101" ] && ok "M1 hiding roommates leaves the pilgrim's own room" || bad "M1 own room ($r)"

echo "═══ M1 — البصمة والمزامنة ═══"
s1=$(anon 10.30.0.9 "select portal_settings_stamp()"); [ ${#s1} -eq 32 ] && ok "M1 anon can read the settings stamp (md5)" || bad "M1 stamp anon ($s1)"
r=$(pf "$TM" "->'config'->>'settings_stamp'"); [ "$r" = "$s1" ] && ok "M1 portal payload carries the same stamp" || bad "M1 payload stamp ($r vs $s1)"
save '{"roommates":false}' > /dev/null; s2=$(anon 10.30.0.9 "select portal_settings_stamp()"); [ "$s2" = "$s1" ] && ok "M1 a no-op save keeps the stamp" || bad "M1 stamp noop"
save '{"roommates":false,"arafat_countdown":false}' > /dev/null; s3=$(anon 10.30.0.9 "select portal_settings_stamp()"); [ "$s3" != "$s1" ] && ok "M1 a change (countdown off) changes the stamp" || bad "M1 stamp change"
r=$(pf "$TM" "->'config'->'portal_settings'->>'arafat_countdown'"); [ "$r" = "false" ] && ok "M1 arafat_countdown=false reaches the portal" || bad "M1 countdown ($r)"
r=$(staff $U_PORTAL "select portal_settings_stamp()"); echo "$r" | grep -qi "permission denied" && ok "M1 stamp not exposed to authenticated" || bad "M1 stamp authenticated ($r)"
r=$(anon 10.30.0.9 "select count(*) from public.pilgrim_sessions where last_seen_at > now() - interval '1 second'"); echo "$r" | grep -qi "permission denied" && ok "M1 stamp path has no table access for anon" || bad "M1 anon table ($r)"

echo "═══ M1 — الحفظ: المفاتيحُ الثمانية وأنواعُها ═══"
r=$(save '{"flights":false,"notifications":false,"pdf_downloads":false,"financial_balance":true,"evil":"x","photo_visibility":"men"}')
[ "$(q "select '$r'::jsonb = '{\"flights\":false,\"photo_visibility\":\"men\"}'::jsonb")" = "t" ] && ok "M1 obsolete/unknown keys (notifications, pdf_downloads, …) dropped; known kept" || bad "M1 sanitize ($r)"
# رفضٌ بـ22023 تحديداً (VERBOSITY verbose يطبع الرمز)
saveV() { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role authenticated; do \$x\$ begin perform set_config('request.jwt.claims','{\"sub\":\"$U_PORTAL\",\"role\":\"authenticated\"}',true); end \$x\$; select (update_portal_settings($1)).portal_settings::text; commit;" 2>&1; }
rejected() { echo "$1" | grep -q "ERROR:  22023"; }
miss=""
for bad_json in '{"photo_visibility":"bogus"}' '{"photo_visibility":""}' '{"photo_visibility":"ALL"}' '{"photo_visibility":" all"}' '{"photo_visibility":true}' '{"photo_visibility":["all"]}' \
                '{"flights":"yes"}' '{"flights":"true"}' '{"documents":1}' '{"documents":0}' '{"roommates":[]}' '{"lost_card":{}}' '["flights"]' '"x"' 'null' '42'; do
  r=$(saveV "'$bad_json'::jsonb, null, null, null, null, null"); rejected "$r" || miss="$miss $bad_json"
done
[ -z "$miss" ] && ok "M1 wrong types / unknown or mis-cased photo value / non-object (incl. top-level JSON null) rejected with 22023" || bad "M1 accepted invalid:$miss"
miss=""
for k in flights rooms buses documents roommates lost_card arafat_countdown photo_visibility; do
  r=$(saveV "'{\"$k\":null}'::jsonb, null, null, null, null, null"); rejected "$r" || miss="$miss $k"
done
[ -z "$miss" ] && ok "M1 JSON null rejected (22023) for every one of the eight typed keys" || bad "M1 JSON null accepted for:$miss"

# لا حفظَ جزئيّ: طلبٌ فيه مفتاحٌ صالحٌ وآخرُ null (ورسالةٌ جديدة) يُرفض كلُّه
save '{"flights":true,"documents":true,"photo_visibility":"all"}' > /dev/null
staff $U_PORTAL "select update_portal_settings('{\"flights\":true,\"documents\":true,\"photo_visibility\":\"all\"}'::jsonb,'قبل',null,'مدير','111',null)" > /dev/null
before=$(q "select json_build_array(portal_settings, portal_welcome_message, admin_name, admin_phone)::text from public.company_config where id = 1")
st_before=$(anon 10.30.0.9 "select portal_settings_stamp()")
for bad_mix in '{"flights":false,"documents":null}' '{"flights":false,"photo_visibility":null}' '{"documents":false,"photo_visibility":"bogus"}' '{"rooms":false,"lost_card":"no"}'; do
  r=$(saveV "'$bad_mix'::jsonb, 'بعد', 'مساعدة', 'مخترِق', '999', '999'"); rejected "$r" || bad "M1 mixed payload accepted $bad_mix ($r)"
done
after=$(q "select json_build_array(portal_settings, portal_welcome_message, admin_name, admin_phone)::text from public.company_config where id = 1")
[ "$before" = "$after" ] && [ "$(anon 10.30.0.9 "select portal_settings_stamp()")" = "$st_before" ] \
  && ok "M1 a rejected request saves nothing: valid keys in it, the messages and admin fields all unchanged; stamp unchanged" || bad "M1 partial save ($before → $after)"
r=$(pf "$TM" "->'pilgrim'->>'has_hajj_permit'"); [ "$r" = "true" ] && ok "M1 after the rejected 'documents:false' attempts, documents stay visible (nothing applied)" || bad "M1 partial docs ($r)"

# حجبُ الخادم يصمد أمام قيمةٍ null مخزَّنةٍ مباشرةً (لا تصل من الدالّة بعد اليوم)
q "update public.company_config set portal_settings = '{\"documents\":false,\"roommates\":false,\"photo_visibility\":null}' where id = 1" > /dev/null
r=$(pf "$TM" "::text")
echo "$r" | grep -q '"has_photo" : false' && echo "$r" | grep -q '"has_hajj_permit" : false' && ! echo "$r" | grep -q "رفيق الغرفة السري" \
  && [ "$(allowed 5721 photo)$(allowed 5721 hajj_permit)$(allowed 5721 flight_ticket)" = "fff" ] \
  && ok "M1 stored photo_visibility=null → photo hidden (fail-closed); documents/roommates hidden in payload and guard" || bad "M1 stored-null enforcement"
q "update public.company_config set portal_settings = '{\"documents\":null,\"roommates\":null}' where id = 1" > /dev/null
r=$(pf "$TM" "->'config'->'portal_settings'"); [ "$(q "select ('$r'::jsonb ->> 'documents') = 'true' and ('$r'::jsonb ->> 'roommates') = 'true' and ('$r'::jsonb ->> 'photo_visibility') = 'none'")" = "t" ] \
  && ok "M1 stored null booleans read as the documented default (shown), never as an error; photo stays hidden" || bad "M1 stored-null defaults ($r)"
save '{}' > /dev/null
r=$(anon 10.30.0.9 "select update_portal_settings('{}'::jsonb,null,null,null,null,null)"); echo "$r" | grep -qi "permission denied" && ok "M1 anon cannot save settings" || bad "M1 anon save ($r)"
r=$(staff $U_STAFF "select update_portal_settings('{}'::jsonb,null,null,null,null,null)"); echo "$r" | grep -q "صلاحية" && ok "M1 staff without manage_portal → 42501" || bad "M1 staff save ($r)"
r=$(staff $U_PORTAL "update public.company_config set name_ar = 'مخترَق' where id = 1 returning id"); n=$(q "select name_ar from public.company_config where id = 1")
[ -z "$r" ] && [ "$n" != "مخترَق" ] && ok "M1 manage_portal cannot write company-owned columns directly (RLS: 0 rows)" || bad "M1 company write ($r / $n)"
r=$(staff $U_PORTAL "update public.company_config set portal_settings = '{\"photo_visibility\":\"all\"}' where id = 1 returning id"); [ -z "$r" ] && ok "M1 manage_portal cannot bypass the RPC to write portal_settings raw" || bad "M1 raw write ($r)"
r=$(anon 10.30.0.9 "select pilgrim_doc_allowed(5721,'photo')")$(staff $U_PORTAL "select pilgrim_doc_allowed(5721,'photo')")
[ "$(echo "$r" | grep -oi "permission denied" | wc -l)" = "2" ] && ok "M1 pilgrim_doc_allowed not callable by anon or authenticated" || bad "M1 guard grants ($r)"
r=$(anon 10.30.0.9 "select _portal_settings_effective('{}')"); echo "$r" | grep -qi "permission denied" && ok "M1 internal helpers not callable by anon" || bad "M1 helper grant ($r)"
r=$(anon 10.30.0.9 "select _portal_normalize_doc('a')"); echo "$r" | grep -qi "permission denied" && ok "M2 normalize helper not callable by anon" || bad "M2 helper grant ($r)"

# ── التنظيف: الصفُّ كما كان، والتهيئةُ تُحذف ──
q "update public.company_config c set portal_settings = (o->'s'), portal_welcome_message = o->>'w', portal_help_message = o->>'h',
     admin_name = o->>'n', admin_phone = o->>'p', admin_whatsapp = o->>'a'
   from (select '$ORIG'::jsonb o) x where c.id = 1" > /dev/null
q "$FIX
   delete from public.pilgrim_sessions where passenger_id between 5721 and 5729;
   delete from public.passengers where season_id = 9721;
   delete from public.rooms where season_id = 9721; delete from public.hotels where season_id = 9721;
   delete from public.camps where season_id = 9721;
   delete from public.seasons where id = 9721;
   delete from public.user_profiles where id in ('$U_PORTAL','$U_STAFF');
   delete from auth.users where id in ('$U_PORTAL','$U_STAFF');
   delete from public.edge_rate_limits;" > /dev/null
[ "$(q "select json_build_object('s', portal_settings, 'w', portal_welcome_message, 'h', portal_help_message, 'n', admin_name, 'p', admin_phone, 'a', admin_whatsapp, 'name', name_ar)::jsonb = '$ORIG'::jsonb from public.company_config where id = 1")" = "t" ] \
  && [ "$(q "select count(*) from public.seasons where id = 9721")" = "0" ] && ok "settings row restored and fixture removed" || bad "cleanup"

echo
echo "portal phase 2 tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
