#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# بوابة الحاجّ — L1: صلاحيّةُ دالّتي البوابة المساعدتين — فحوصٌ بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ مؤقّتةٍ وحدها (بعد `db reset` إلى آخر ترحيلة):
#   supabase/verification/portal/l1_portal_rpc_permission_tests.sh
#   LOCAL='postgresql:///db?host=/path/to/socket&port=…&user=postgres' …   ← عنقودٌ محلّيٌّ آخر
#
#   announcement_audience(text, bigint[]) · push_enabled_passengers()
#     manage_portal نشط ← يمرّ · موظّفٌ نشطٌ بلا manage_portal ← 42501
#     manage_portal غير نشط ← 42501 · مسجَّلٌ بلا ملفّ ← 42501 · anon ← permission denied
#     service_role (send-pilgrim-push) ← يمرّ · المالكُ مباشرة ← يمرّ
#   وقراءةُ جدول `announcements` كما كانت (كلُّ موظّفٍ نشط)، والعقدُ والمنطقُ كما كانا.
#
# ⚠️ يرفض أيَّ قاعدةٍ غيرِ محلّيّة، ويحذف ما يكتبه. بياناتٌ مُصطنَعة وحدها.
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
# الأخطاءُ برموزها (VERBOSITY verbose يطبع SQLSTATE)
as_user() { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role authenticated; do \$x\$ begin perform set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true); end \$x\$; $2; commit;" 2>&1; }
as_anon() { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role anon; $1; commit;" 2>&1; }
as_svc()  { psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role service_role; $1; commit;" 2>&1; }
denied42501() { echo "$1" | grep -q "ERROR:  42501: ليست لديك صلاحية إدارة بوابة الحاج"; }
noexec()      { echo "$1" | grep -q "ERROR:  42501: permission denied for function"; }

if [ "$(q "select count(*) from public.seasons where id = 9741")" != "0" ]; then echo "يرفض: موسمُ التهيئة 9741 موجود"; exit 2; fi
if [ "$(q "select count(*) from public.seasons where closed_at is null")" != "0" ]; then echo "يرفض: في القاعدة موسمٌ مفتوح"; exit 2; fi

U_PORTAL=00000000-0000-0000-0000-00000000dd01   # manage_portal، نشط
U_STAFF=00000000-0000-0000-0000-00000000dd02    # نشط بلا manage_portal
U_OFF=00000000-0000-0000-0000-00000000dd03      # manage_portal، غير نشط
U_NOPROF=00000000-0000-0000-0000-00000000dd04   # مسجَّلٌ بلا ملفّ موظّف
FIX="set app.season_maintenance = 'on';"
q "$FIX
   insert into auth.users (id,email,aud,role) values
     ('$U_PORTAL','l1-portal@t.local','authenticated','authenticated'),
     ('$U_STAFF','l1-staff@t.local','authenticated','authenticated'),
     ('$U_OFF','l1-off@t.local','authenticated','authenticated'),
     ('$U_NOPROF','l1-noprof@t.local','authenticated','authenticated');
   insert into public.user_profiles (id,email,name,permissions,is_active) values
     ('$U_PORTAL','l1-portal@t.local','مدير البوابة','{\"manage_portal\":true}',true),
     ('$U_STAFF','l1-staff@t.local','موظّف','{\"manage_passengers\":true,\"view_reports\":true}',true),
     ('$U_OFF','l1-off@t.local','موقوف','{\"manage_portal\":true}',false);
   insert into public.seasons (id,name,hijri_year,closed_at) overriding system value values (9741,'موسم L1',1474,null);
   insert into public.buses (id,season_id,name) overriding system value values (6761,9741,'باص L1');
   insert into public.passengers (id,season_id,name_ar,gender,bus_id,passenger_type) overriding system value values
     (5741,9741,'حاج ألف','ذكر',6761,'حاج'), (5742,9741,'حاج باء','ذكر',null,'حاج');
   insert into public.pilgrim_push_subscriptions (passenger_id,endpoint,p256dh,auth) values
     (5741,'https://push.example/l1-a1','k','a'), (5741,'https://push.example/l1-a2','k','a'), (5742,'https://push.example/l1-b','k','a');
   insert into public.announcements (id,season_id,body,target_type,target_ids) overriding system value values (4741,9741,'L1','bus','{6761}');" > /dev/null

AUD="select string_agg(passenger_id::text, ',' order by passenger_id) from announcement_audience('bus','{6761}')"
AUD_ALL="select count(*) from announcement_audience('all','{}')"
PEP="select string_agg(passenger_id||':'||devices, ',' order by passenger_id) from push_enabled_passengers() where passenger_id between 5741 and 5749"

echo "═══ manage_portal (نشط) ═══"
r=$(as_user $U_PORTAL "$AUD");     [ "$r" = "5741" ] && ok "manage_portal: announcement_audience('bus') → 5741 (logic unchanged)" || bad "manage_portal audience ($r)"
r=$(as_user $U_PORTAL "$AUD_ALL"); [ "$r" = "2" ] && ok "manage_portal: announcement_audience('all') → 2" || bad "manage_portal audience all ($r)"
r=$(as_user $U_PORTAL "select count(*) from announcement_audience('flight','{1}')"); [ "$r" = "0" ] && ok "manage_portal: unknown type still → nobody (H2)" || bad "H2 ($r)"
r=$(as_user $U_PORTAL "$PEP");     [ "$r" = "5741:2,5742:1" ] && ok "manage_portal: push_enabled_passengers → 5741:2, 5742:1 (contract unchanged)" || bad "manage_portal push_enabled ($r)"

echo "═══ موظّفٌ نشطٌ بلا manage_portal ═══"
r=$(as_user $U_STAFF "$AUD"); denied42501 "$r" && ok "staff without manage_portal: announcement_audience → 42501" || bad "staff audience ($r)"
r=$(as_user $U_STAFF "$PEP"); denied42501 "$r" && ok "staff without manage_portal: push_enabled_passengers → 42501" || bad "staff push_enabled ($r)"
r=$(as_user $U_STAFF "select count(*) from public.announcements where id = 4741"); [ "$r" = "1" ] && ok "staff without manage_portal can still SELECT announcements (policy unchanged)" || bad "staff announcements select ($r)"
r=$(as_user $U_STAFF "insert into public.announcements (season_id, body) values (9741,'x')"); echo "$r" | grep -qi "row-level security" && ok "…and still cannot write announcements (policy unchanged)" || bad "staff announcements insert ($r)"

echo "═══ manage_portal غير نشط · مسجَّلٌ بلا ملفّ ═══"
r=$(as_user $U_OFF "$AUD")$(as_user $U_OFF "$PEP"); [ "$(echo "$r" | grep -o 'ERROR:  42501: ليست' | wc -l)" = "2" ] && ok "inactive user with manage_portal: both → 42501" || bad "inactive ($r)"
r=$(as_user $U_NOPROF "$AUD")$(as_user $U_NOPROF "$PEP"); [ "$(echo "$r" | grep -o 'ERROR:  42501: ليست' | wc -l)" = "2" ] && ok "authenticated without a staff profile: both → 42501" || bad "no profile ($r)"
r=$(as_user $U_OFF "select count(*) from public.announcements where id = 4741"); [ "$r" = "0" ] && ok "inactive user still sees no announcements (policy unchanged)" || bad "inactive select ($r)"

echo "═══ غيرُ مسجَّل (anon) ═══"
r=$(as_anon "$AUD"); noexec "$r" && ok "anon: announcement_audience → permission denied (no EXECUTE)" || bad "anon audience ($r)"
r=$(as_anon "$PEP"); noexec "$r" && ok "anon: push_enabled_passengers → permission denied (no EXECUTE)" || bad "anon push_enabled ($r)"
r=$(psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role anon; do \$x\$ begin perform set_config('request.jwt.claims','{\"role\":\"service_role\"}',true); end \$x\$; select count(*) from announcement_audience('all','{}'); commit;" 2>&1)
noexec "$r" && ok "anon with a forged service_role claim in request.jwt.claims: still denied (the gate is the DB role)" || bad "forged claim ($r)"

r=$(psql "$LOCAL" -X -q -At -v VERBOSITY=verbose -c "begin; set local role authenticated; do \$x\$ begin perform set_config('request.jwt.claims','{\"sub\":\"$U_STAFF\",\"role\":\"service_role\"}',true); end \$x\$; select count(*) from announcement_audience('all','{}'); commit;" 2>&1)
denied42501 "$r" && ok "authenticated staff claiming role=service_role in its JWT claims: still 42501 (the gate is the DB role, not the claim)" || bad "authenticated forged claim ($r)"

echo "═══ الخادم (service_role) والمالك ═══"
r=$(as_svc "$AUD"); [ "$r" = "5741" ] && ok "service_role (send-pilgrim-push path): announcement_audience works → 5741" || bad "service_role audience ($r)"
r=$(as_svc "select count(*) from public.pilgrim_push_subscriptions where passenger_id in (select passenger_id from announcement_audience('bus','{6761}'))")
[ "$r" = "2" ] && ok "service_role: the push audience query (audience → device subscriptions) still resolves 2 devices" || bad "push query ($r)"
r=$(as_svc "$PEP"); [ "$r" = "5741:2,5742:1" ] && ok "service_role: push_enabled_passengers works" || bad "service_role push_enabled ($r)"
r=$(q "$AUD"); [ "$r" = "5741" ] && ok "owner (direct connection, no SET ROLE): works — migrations and maintenance unaffected" || bad "owner ($r)"

echo "═══ العقدُ والمِنَح ═══"
r=$(q "select pg_get_function_result('public.announcement_audience(text, bigint[])'::regprocedure)||' | '||pg_get_function_result('public.push_enabled_passengers()'::regprocedure)")
[ "$r" = "TABLE(passenger_id bigint) | TABLE(passenger_id bigint, devices bigint)" ] && ok "return contracts unchanged" || bad "contract ($r)"
r=$(q "select string_agg(p.proname||':'||coalesce((select string_agg(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end, '+' order by case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end) from aclexplode(p.proacl) a where a.privilege_type='EXECUTE'),'-'), ' ' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('announcement_audience','push_enabled_passengers')")
[ "$r" = "announcement_audience:authenticated+postgres+service_role push_enabled_passengers:authenticated+postgres+service_role" ] && ok "EXECUTE holders unchanged (authenticated, postgres, service_role; no anon, no PUBLIC)" || bad "grants ($r)"

q "$FIX
   delete from public.pilgrim_push_subscriptions where passenger_id between 5741 and 5749;
   delete from public.announcements where season_id = 9741;
   delete from public.passengers where season_id = 9741;
   delete from public.buses where season_id = 9741;
   delete from public.seasons where id = 9741;
   delete from public.user_profiles where id in ('$U_PORTAL','$U_STAFF','$U_OFF');
   delete from auth.users where id in ('$U_PORTAL','$U_STAFF','$U_OFF','$U_NOPROF');" > /dev/null
[ "$(q "select count(*) from public.seasons where id = 9741")" = "0" ] && ok "fixture removed" || bad "cleanup"

echo
echo "L1 portal RPC permission tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
