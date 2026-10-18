#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# بوابة الحاجّ — المرحلة ١ (H1–H4): فحوصٌ بالتنفيذ على PostgreSQL
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ مؤقّتةٍ وحدها (بعد `db reset` إلى آخر ترحيلة):
#   supabase/verification/portal/phase1_security_tests.sh
#   LOCAL='postgresql:///db?host=/path/to/socket&port=…&user=postgres' …   ← عنقودٌ محلّيٌّ آخر
#
# تُنادى الدوالّ كما يناديها المتصفّح: `anon` (البوابة) و`authenticated` بمطالبات
# JWT (الموظّفون)، وعنوانُ المصدر في `request.headers`. بياناتٌ مُصطنَعة وحدها.
#   H1 الوثيقةُ الفارغة/الفراغيّة لا تفتح جلسة · والاعتمادُ الصالحُ وحدُّ المحاولات كما هما
#   H2 التنبيهاتُ بجمهورها (all/bus/camp_mina/camp_arafa/custom) · المجهولُ لا أحد + سجلّ
#   H3 لا تنبيهاتٍ بلا جلسة (anon/authenticated مباشرةً) · والإدارةُ تعمل كما هي
#   H2 announcement_audience (جمهورُ الدفع): المجهولُ لا أحد + سجلّ
#   H4 claim_pilgrim_push_device · فكُّ جهازٍ واحد لا يمسّ أجهزةً أخرى
#   H4 release_pilgrim_session بالبصمة: تُبطل وتفكّ هذا الجهاز وحده · والبصمةُ لا تفتح البوابة
#
# ⚠️ يرفض أيَّ قاعدةٍ غيرِ محلّيّة، ويحذف كلَّ ما يكتبه.
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
# anon كما يناديه المتصفّح؛ $1 = عنوان المصدر كما تُلحقه البوّابة
anon() { psql "$LOCAL" -X -q -At -c "begin; set local role anon; do \$x\$ begin perform set_config('request.headers', '{\"x-forwarded-for\":\"$1\"}', true); end \$x\$; $2; commit;" 2>&1; }
svc()  { psql "$LOCAL" -X -q -At -c "begin; set local role service_role; $1; commit;" 2>&1; }
staff() { psql "$LOCAL" -X -q -At -c "begin; set local role authenticated; do \$x\$ begin perform set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true); end \$x\$; $2; commit;" 2>&1; }

if [ "$(q "select count(*) from public.seasons where id in (9701, 9702)")" != "0" ]; then
  echo "يرفض: مواسمُ التهيئة 9701/9702 موجودةٌ مسبقاً"; exit 2
fi
if [ "$(q "select count(*) from public.seasons where closed_at is null")" != "0" ]; then
  echo "يرفض: في القاعدة موسمٌ مفتوح — الفحوصُ تحتاج قاعدةً بلا مواسم مفتوحة"; exit 2
fi

U_PORTAL=00000000-0000-0000-0000-00000000bb01
U_STAFF=00000000-0000-0000-0000-00000000bb02
FIX="set app.season_maintenance = 'on';"
q "$FIX
   insert into auth.users (id,email,aud,role) values
     ('$U_PORTAL','portal-p1@t.local','authenticated','authenticated'),
     ('$U_STAFF','staff-p1@t.local','authenticated','authenticated');
   insert into public.user_profiles (id,email,name,permissions,is_active) values
     ('$U_PORTAL','portal-p1@t.local','مدير البوابة','{\"manage_portal\":true}',true),
     ('$U_STAFF','staff-p1@t.local','موظّف','{\"manage_passengers\":true}',true);
   insert into public.seasons (id,name,hijri_year,closed_at) overriding system value values
     (9702,'موسمٌ مقفل',1471,now()), (9701,'موسم الاختبار',1472,null);
   insert into public.buses (id,season_id,name) overriding system value values (6701,9701,'باص ١'),(6702,9701,'باص ٢');
   insert into public.camps (id,season_id,name,type,page_type,gender) overriding system value values (6801,9701,'منى ١','منى','منى','ذكر'),(6802,9701,'عرفة ١','عرفة','عرفة','ذكر');
   insert into public.passengers (id,season_id,name_ar,passport,national_id,dob,gender,bus_id,camp_mina_id,camp_arafa_id,passenger_type) overriding system value values
     (5701,9701,'حاج ألف','PA000001','28400000001','1960-03-15','ذكر',6701,6801,6802,'حاج'),
     (5702,9701,'حاج باء','PB000002',null,'02/02/1962','ذكر',6702,null,null,'حاج'),
     (5703,9701,'مشرف بلا وثائق',null,null,'1975-01-01','ذكر',null,null,null,'مشرف'),
     (5704,9701,'إداري بجوازٍ فراغيّ','   ','',  '1980-02-02','ذكر',null,null,null,'إداري');" > /dev/null

tok() { anon "10.20.0.$1" "select create_pilgrim_session($2,$3,$4,$5)->>'token'"; }

echo "═══ H1 — الوثيقةُ الفارغة ═══"
for v in "''" "'   '" "E'\\t'" "E'\\n '" "U&'\\00A0'" "U&'\\200F\\200E'" "null"; do
  r=$(anon 10.20.1.1 "select create_pilgrim_session($v,1,1,1975)::text || '|' || coalesce(create_pilgrim_session($v,2,2,1980)::text,'')")
  if [ -z "${r//|/}" ]; then ok "H1 p_doc=$v → null (no session for the doc-less 5703 / blank-passport 5704)"; else bad "H1 p_doc=$v → $r"; fi
done
q "delete from public.edge_rate_limits" > /dev/null
TA=$(tok 2 "'PA000001'" 15 3 1960); TQ=$(tok 2 "' 28400000001 '" 15 3 1960); TB=$(tok 2 "'PB000002'" 2 2 1962)
[ ${#TA} -ge 40 ] && [ ${#TQ} -ge 40 ] && [ ${#TB} -ge 40 ] && ok "H1 valid passport, padded national ID and dd/mm/yyyy DOB still log in" || bad "H1 valid logins ($TA / $TQ / $TB)"
r=$(anon 10.20.0.3 "select create_pilgrim_session('PA000001',16,3,1960)")
[ -z "$r" ] && ok "H1 wrong DOB → null (uniform)" || bad "H1 wrong DOB ($r)"
for i in $(seq 1 10); do anon 10.20.0.4 "select create_pilgrim_session('PB000002',1,1,1900)" > /dev/null; done
r=$(anon 10.20.0.5 "select create_pilgrim_session('PB000002',2,2,1962)")
echo "$r" | grep -q rate_limited && ok "H1 document rate limit unchanged (10 failures → rate_limited)" || bad "H1 rate limit ($r)"
q "delete from public.edge_rate_limits" > /dev/null

echo "═══ H2 — التنبيهاتُ بجمهورها ═══"
q "insert into public.announcements (id,season_id,body,target_type,target_ids,show_at) overriding system value values
     (4701,9701,'للجميع','all','{}',now()-interval '1 hour'),
     (4702,9701,'لباص ١','bus','{6701}',now()-interval '1 hour'),
     (4703,9701,'لباص ٢','bus','{6702}',now()-interval '1 hour'),
     (4704,9701,'لمنى ١','camp_mina','{6801}',now()-interval '1 hour'),
     (4705,9701,'لعرفة ١','camp_arafa','{6802}',now()-interval '1 hour'),
     (4706,9701,'خاصّ بحاجّ باء','custom','{5702}',now()-interval '1 hour'),
     (4707,9701,'نوعٌ مجهول — سرّيّ','flight','{1}',now()-interval '1 hour'),
     (4708,9701,'باصٌ بلا قائمة','bus','{}',now()-interval '1 hour'),
     (4709,9701,'مجدول','all','{}',now()+interval '1 day');" > /dev/null
ids() { anon 10.20.0.2 "select coalesce(string_agg(x->>'id', ',' order by (x->>'id')::int), '') from json_array_elements(get_pilgrim_portal_by_session('$1')->'announcements') x"; }
r=$(ids "$TA"); [ "$r" = "4701,4702,4704,4705" ] && ok "H2 pilgrim A (bus 1, Mina 1, Arafa 1) sees exactly all + bus 1 + Mina 1 + Arafa 1 → $r" || bad "H2 A sees $r"
r=$(ids "$TB"); [ "$r" = "4701,4703,4706" ] && ok "H2 pilgrim B (bus 2, custom) sees exactly all + bus 2 + its custom message → $r" || bad "H2 B sees $r"
r=$(q "select count(*) from public.announcements a where a.season_id=9701 and a.show_at<=now() and a.target_type in ('all','bus','camp_mina','camp_arafa','custom')
         and (5701 in (select passenger_id from announcement_audience(a.target_type,a.target_ids))) <> (a.id in (4701,4702,4704,4705))")
[ "$r" = "0" ] && ok "H2 portal visibility == announcement_audience (push) for every known mode" || bad "H2 portal vs push audience differ on $r announcement(s)"
log=$(psql "$LOCAL" -X -q -At -c "set client_min_messages = log; begin; set local role anon; select (get_pilgrim_portal_by_session('$TA') is not null); commit;" 2>&1)
echo "$log" | grep -q "unknown target_type hidden (fail-closed), season 9701, announcement ids {4707}" && ! echo "$log" | grep -q "سرّيّ" \
  && ok "H2 unknown type (4707) shown to nobody and logged (RAISE LOG) with its id only — no body in the log" || bad "H2 unknown-type log ($log)"
log=$(psql "$LOCAL" -X -q -At -c "begin; set local role anon; select (get_pilgrim_portal_by_session('$TA') is not null); commit;" 2>&1)
[ "$log" = "t" ] && ok "H2 the diagnostic does not reach a default client (client_min_messages = notice)" || bad "H2 log leaked to client ($log)"

# وجمهورُ الدفع (`announcement_audience` كما تناديها send-pilgrim-push بـservice_role)
r=$(svc "select count(*) from announcement_audience('flight','{1}')"); [ "$r" = "0" ] && ok "H2 push: unknown type → no recipients (fail-closed)" || bad "H2 push unknown type → $r recipient(s)"
r=$(svc "select count(x.*) from public.announcements a cross join lateral announcement_audience(a.target_type, a.target_ids) x where a.id = 4707"); [ "$r" = "0" ] && ok "H2 push: the stored unknown-type announcement 4707 reaches nobody" || bad "H2 push 4707 → $r"
r=$(svc "select string_agg(n::text, ',' order by n) from (select (select count(*) from announcement_audience('all','{}') x join public.passengers p on p.id = x.passenger_id where p.season_id = 9701) n
         union all select count(*) from announcement_audience('bus','{6701}') union all select count(*) from announcement_audience('camp_mina','{6801}')
         union all select count(*) from announcement_audience('camp_arafa','{6802}') union all select count(*) from announcement_audience('custom','{5702}')
         union all select count(*) from announcement_audience(null,'{}') x join public.passengers p on p.id = x.passenger_id where p.season_id = 9701) t")
[ "$r" = "1,1,1,1,4,4" ] && ok "H2 push: known types unchanged (all/null=4 · bus · camp_mina · camp_arafa · custom = 1 each)" || bad "H2 push known types ($r)"
log=$(psql "$LOCAL" -X -q -At -c "set client_min_messages = log; begin; set local role service_role; select count(*) from announcement_audience('flight','{1}'); commit;" 2>&1)
echo "$log" | grep -q "announcement_audience: unknown target_type flight" && ok "H2 push: unknown type logged (RAISE LOG)" || bad "H2 push log ($log)"
r=$(anon 10.20.0.9 "select count(*) from announcement_audience('all','{}')"); echo "$r" | grep -qi "permission denied" && ok "H2 push: anon still cannot call announcement_audience" || bad "H2 audience anon ($r)"
echo "═══ H3 — لا تنبيهاتٍ بلا جلسة ═══"
r=$(anon 10.20.0.9 "select get_portal_announcements()")
echo "$r" | grep -qi "permission denied" && ok "H3 anon direct call to get_portal_announcements() → permission denied" || bad "H3 anon ($r)"
r=$(staff $U_PORTAL "select get_portal_announcements()")
echo "$r" | grep -qi "permission denied" && ok "H3 authenticated (even manage_portal) cannot call it either" || bad "H3 authenticated ($r)"
r=$(anon 10.20.0.9 "select count(*) from public.announcements")
echo "$r" | grep -qi "permission denied" && ok "H3 anon cannot read the announcements table" || bad "H3 anon table ($r)"
r=$(anon 10.20.0.9 "select get_pilgrim_portal_by_session('forged-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')")
[ -z "$r" ] && ok "H3 forged token → null (no announcements)" || bad "H3 forged ($r)"
TR=$(tok 6 "'PA000001'" 15 3 1960); anon 10.20.0.6 "select revoke_pilgrim_session('$TR')" > /dev/null
r=$(anon 10.20.0.6 "select get_pilgrim_portal_by_session('$TR')"); [ -z "$r" ] && ok "H3 revoked session → null" || bad "H3 revoked"
TX=$(tok 7 "'PA000001'" 15 3 1960); q "update public.pilgrim_sessions set idle_expires_at = now() - interval '1 second' where token_hash = extensions.digest('$TX','sha256')" > /dev/null
r=$(anon 10.20.0.7 "select get_pilgrim_portal_by_session('$TX')"); [ -z "$r" ] && ok "H3 expired session → null" || bad "H3 expired"
# الإدارةُ تعمل كما هي
r=$(staff $U_PORTAL "select count(*) from public.announcements where season_id = 9701"); [ "$r" = "9" ] && ok "H3 admin (manage_portal) still lists announcements through the table/RLS" || bad "H3 admin list ($r)"
r=$(staff $U_PORTAL "insert into public.announcements (season_id, body) values (9701,'من الإدارة') returning id"); [ -n "$r" ] && echo "$r" | grep -qv ERROR && ok "H3 admin can still create" || bad "H3 admin create ($r)"
r=$(staff $U_PORTAL "update public.announcements set expires_at = now() where id = 4709 returning id"); [ "$r" = "4709" ] && ok "H3 admin can still end/update" || bad "H3 admin update ($r)"
r=$(staff $U_PORTAL "select count(*) from announcement_audience('bus','{6701}')"); [ "$r" = "1" ] && ok "H3 push audience (announcement_audience) unaffected" || bad "H3 audience ($r)"
r=$(staff $U_PORTAL "select count(*) from public.notification_deliveries"); echo "$r" | grep -qE '^[0-9]+$' && ok "H3 delivery report table still readable by manage_portal" || bad "H3 deliveries ($r)"
r=$(staff $U_PORTAL "delete from public.announcements where body = 'من الإدارة' returning id"); [ -n "$r" ] && echo "$r" | grep -qv ERROR && ok "H3 admin can still delete" || bad "H3 admin delete ($r)"

echo "═══ H4 — الجهاز ═══"
reg() { anon 10.20.0.2 "select register_pilgrim_push('$1','$2','k','a')" > /dev/null; }
claim() { anon 10.20.0.2 "select claim_pilgrim_push_device('$1','$2')"; }
owner() { q "select coalesce((select passenger_id::text from public.pilgrim_push_subscriptions where endpoint='$1'),'none')"; }
reg "$TA" https://push.example/dev-shared; reg "$TA" https://push.example/dev-a-phone
r=$(claim "$TA" https://push.example/dev-shared); [ "$r" = "own" ] && [ "$(owner https://push.example/dev-shared)" = "5701" ] && ok "H4 same pilgrim returning → own, binding kept" || bad "H4 own ($r)"
r=$(claim "$TB" https://push.example/dev-shared)
[ "$r" = "released" ] && [ "$(owner https://push.example/dev-shared)" = "none" ] && ok "H4 different pilgrim on the shared device → released: the previous binding is deleted and NOT moved to the new pilgrim" || bad "H4 released ($r, owner $(owner https://push.example/dev-shared))"
[ "$(owner https://push.example/dev-a-phone)" = "5701" ] && ok "H4 the previous pilgrim's other device stays registered" || bad "H4 other device lost"
r=$(claim "$TB" https://push.example/never-seen); [ "$r" = "none" ] && ok "H4 unknown endpoint → none (nothing bound automatically)" || bad "H4 none ($r)"
r=$(claim "forged-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" https://push.example/dev-a-phone)
[ "$r" = "no_session" ] && [ "$(owner https://push.example/dev-a-phone)" = "5701" ] && ok "H4 invalid session → no_session, nothing touched" || bad "H4 no_session ($r)"
r=$(staff $U_PORTAL "select claim_pilgrim_push_device('$TA','x')"); echo "$r" | grep -qi "permission denied" && ok "H4 claim is not callable by authenticated staff" || bad "H4 staff claim ($r)"
reg "$TA" https://push.example/dev-shared
anon 10.20.0.2 "select unregister_pilgrim_push('$TA','https://push.example/dev-shared')" > /dev/null
[ "$(owner https://push.example/dev-shared)" = "none" ] && [ "$(owner https://push.example/dev-a-phone)" = "5701" ] && ok "H4 explicit-logout unregister removes this device only" || bad "H4 unregister scope"
q "$FIX insert into public.passengers (id,season_id,name_ar,passenger_type) overriding system value values (5709,9702,'حاجّ موسمٍ مقفل','حاج');
   insert into public.pilgrim_push_subscriptions (passenger_id,endpoint,p256dh,auth) values (5709,'https://push.example/old-season','k','a');" > /dev/null
r=$(claim "$TB" https://push.example/old-season)
[ "$r" = "held" ] || [ "$r" = "released" ] && ok "H4 binding of a closed-season pilgrim: $r (no error surfaces to the client)" || bad "H4 closed-season binding ($r)"
r=$(anon 10.20.0.2 "select count(*) from public.pilgrim_push_subscriptions" 2>&1); echo "$r" | grep -qi "permission denied" && ok "H4 anon still cannot read subscriptions" || bad "H4 anon read ($r)"


echo "═══ H4 — الخروجُ بالبصمة (release_pilgrim_session) ═══"
h() { printf %s "$1" | sha256sum | cut -d' ' -f1; }   # كما يحسبها المتصفّح (crypto.subtle · UTF-8 · سداسيّ)
rel() { anon 10.20.0.2 "select release_pilgrim_session('$1','$2')"; }
alive() { q "select count(*) from public.pilgrim_sessions where token_hash = extensions.digest('$1','sha256') and revoked_at is null"; }
TC=$(tok 8 "'PA000001'" 15 3 1960); TD=$(tok 8 "'PB000002'" 2 2 1962)
reg "$TC" https://push.example/dev-shared; reg "$TD" https://push.example/dev-b-phone
HC=$(h "$TC"); HD=$(h "$TD")
[ "$(q "select count(*) from public.pilgrim_sessions where token_hash = decode('$HC','hex')")" = "1" ] && ok "H4 the client-side sha256 hex equals the stored token_hash" || bad "H4 hash mismatch"
r=$(anon 10.20.0.2 "select get_pilgrim_portal_by_session('$HC')"); [ -z "$r" ] && ok "H4 the stored hash cannot open the portal (get_pilgrim_portal_by_session(hash) → null)" || bad "H4 hash opens portal"
r=$(claim "$HC" https://push.example/dev-shared); [ "$r" = "no_session" ] && [ "$(owner https://push.example/dev-shared)" = "5701" ] && ok "H4 the hash cannot claim/release a device either" || bad "H4 hash claim ($r)"
r=$(rel "$HD" https://push.example/dev-a-phone)
[ "$r" = "t" ] && [ "$(alive "$TD")" = "0" ] && [ "$(owner https://push.example/dev-a-phone)" = "5701" ] && [ "$(owner https://push.example/dev-b-phone)" = "5702" ] \
  && ok "H4 release revokes the session but never deletes another pilgrim's endpoint (nor an endpoint not named)" || bad "H4 release scope ($r)"
r=$(rel "$HC" https://push.example/dev-shared)
[ "$r" = "t" ] && [ "$(alive "$TC")" = "0" ] && [ "$(owner https://push.example/dev-shared)" = "none" ] && [ "$(owner https://push.example/dev-a-phone)" = "5701" ] \
  && ok "H4 release: session revoked + this device unbound, in one call; the pilgrim's other device kept" || bad "H4 release ($r)"
r=$(anon 10.20.0.2 "select get_pilgrim_portal_by_session('$TC')"); [ -z "$r" ] && ok "H4 the released token no longer opens the portal" || bad "H4 released token still valid"
r=$(rel "$HC" https://push.example/dev-shared); [ "$r" = "t" ] && ok "H4 release is idempotent (a retried pending logout succeeds)" || bad "H4 idempotent ($r)"
r=$(rel 0000000000000000000000000000000000000000000000000000000000000000 https://push.example/dev-a-phone)
[ "$r" = "t" ] && [ "$(owner https://push.example/dev-a-phone)" = "5701" ] && ok "H4 unknown hash → true, nothing touched" || bad "H4 unknown hash ($r)"
r=$(rel "abc" x)$(rel "${HC^^}" x)$(rel "$TA" x); [ "$r" = "fff" ] && [ "$(alive "$TA")" = "1" ] && ok "H4 malformed hash (short/uppercase/raw token) → false" || bad "H4 malformed ($r)"
r=$(staff $U_PORTAL "select release_pilgrim_session('$HC','x')"); echo "$r" | grep -qi "permission denied" && ok "H4 release is not callable by authenticated staff" || bad "H4 staff release ($r)"
q "$FIX
   delete from public.notification_deliveries where passenger_id between 5701 and 5709;
   delete from public.pilgrim_push_subscriptions where passenger_id between 5701 and 5709;
   delete from public.pilgrim_sessions where passenger_id between 5701 and 5709;
   delete from public.announcements where season_id in (9701, 9702);
   delete from public.passengers where season_id in (9701, 9702);
   delete from public.camps where season_id in (9701, 9702); delete from public.buses where season_id in (9701, 9702);
   delete from public.seasons where id in (9701, 9702);
   delete from public.user_profiles where id in ('$U_PORTAL','$U_STAFF');
   delete from auth.users where id in ('$U_PORTAL','$U_STAFF');
   delete from public.edge_rate_limits;" > /dev/null
[ "$(q "select count(*) from public.seasons where id in (9701, 9702)")" = "0" ] && ok "fixture removed" || bad "cleanup"

echo
echo "portal phase 1 tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
