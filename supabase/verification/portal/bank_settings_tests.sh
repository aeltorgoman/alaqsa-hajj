#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# البنك والسداد (20261022090000) — صلاحياتُ الكتابة بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدة Supabase محلّيّةٍ بعد الترحيلات كلّها:
#   LOCAL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' supabase/verification/portal/bank_settings_tests.sh
#
#   manage_payments وحدها  → تحرّر الحقولَ الستّة بالدالّة، ولا تكتب على الجدول مباشرةً
#   manage_users وحدها     → تحرّرها كما كانت (بالدالّة وبالجدول)
#   كلتاهما / ولا واحدة / معطَّل / anon
#   العبث: مفتاحٌ خارج الستّة، نوعٌ خاطئ، طولٌ زائد، رقعةٌ ليست كائناً — يُرفض ولا يُحفظ منه شيء
#   الحقلُ الغائبُ لا يُمسّ، والسجلُّ التجاريّ يُحرَّر وحده ولا يمسّ غيرَه
#
# ⚠️ يرفض قاعدةً غيرَ محلّيّة. يكتب مستخدمين اختباريّين ويُرجع صفَّ company_config كما كان.
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
# as <uuid|anon> <sql>: كما يصلها PostgREST — الدورُ ومطالبُ JWT في المعاملة نفسها
as() {
  local who="$1" sql="$2" role="authenticated" claims
  if [ "$who" = anon ]; then role=anon; claims='{"role":"anon"}'
  else claims="{\"sub\":\"$who\",\"role\":\"authenticated\"}"; fi
  psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
    -c "begin; set local role $role; select set_config('request.jwt.claims', '$claims', true);
$sql;
commit;" 2>&1
}
denied() { echo "$2" | grep -q "$3" && ok "$1" || bad "$1: $2"; }
U_PAY=00000000-0000-0000-0000-0000000b0001; U_USR=00000000-0000-0000-0000-0000000b0002
U_BOTH=00000000-0000-0000-0000-0000000b0003; U_NONE=00000000-0000-0000-0000-0000000b0004
U_OFF=00000000-0000-0000-0000-0000000b0005
BANK="bank_name, bank_account_name, bank_account_number, bank_iban, bank_swift, commercial_registration"
OTHER="id, name_ar, name_en, tagline, color_primary, color_accent, color_sidebar, contact_phone, contact_email, banner_position,
       banner_position_x, admin_name, admin_phone, admin_whatsapp, country, city, portal_welcome_message, portal_help_message, portal_settings"
bank() { q "select concat_ws('|', $BANK) from public.company_config where id = 1"; }
other_fp() { q "select md5(row($OTHER)::text) from public.company_config where id = 1"; }

[ "$(q "select count(*) from public.company_config where id = 1")" = "1" ] || { echo "يرفض: لا صفَّ company_config"; exit 2; }
SNAP="$(q "select to_jsonb(c) from public.company_config c where id = 1")"
cleanup() {
  psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -v snap="$SNAP" >/dev/null <<'SQL'
update public.company_config c set (name_ar, name_en, tagline, bank_name, bank_account_name, bank_account_number, bank_iban, bank_swift, commercial_registration)
  = (select r.name_ar, r.name_en, r.tagline, r.bank_name, r.bank_account_name, r.bank_account_number, r.bank_iban, r.bank_swift, r.commercial_registration
       from jsonb_populate_record(null::public.company_config, :'snap'::jsonb) r) where c.id = 1;
delete from public.user_profiles where id::text like '00000000-0000-0000-0000-0000000b000%';
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000b000%';
SQL
}
trap cleanup EXIT
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into auth.users (id, email, aud, role) values
  ('$U_PAY','bpay@test.local','authenticated','authenticated'), ('$U_USR','busr@test.local','authenticated','authenticated'),
  ('$U_BOTH','bboth@test.local','authenticated','authenticated'), ('$U_NONE','bnone@test.local','authenticated','authenticated'),
  ('$U_OFF','boff@test.local','authenticated','authenticated');
insert into public.user_profiles (id, email, name, permissions, is_active) values
  ('$U_PAY','bpay@test.local','مالية فقط','{"manage_payments":true}',true),
  ('$U_USR','busr@test.local','مستخدمون فقط','{"manage_users":true}',true),
  ('$U_BOTH','bboth@test.local','كلتاهما','{"manage_payments":true,"manage_users":true}',true),
  ('$U_NONE','bnone@test.local','تقارير فقط','{"view_reports":true,"manage_buses":true}',true),
  ('$U_OFF','boff@test.local','معطَّل','{"manage_payments":true}',false);
SQL
RPC="public.update_company_bank_settings"

echo "── manage_payments وحدها"
base_other="$(other_fp)"
r="$(as $U_PAY "select bank_iban from $RPC('{\"bank_name\":\"  بنك قطر الوطني  \",\"bank_account_name\":\"حملة الاختبار\",\"bank_account_number\":\"0123-4567\",\"bank_iban\":\"QA58DOHB00001234567890ABCDEFG\",\"bank_swift\":\"QNBAQAQA\",\"commercial_registration\":\"CR-12345\"}'::jsonb)")"
eq "تحرّر الحقولَ الستّة كلَّها" "$(bank)" "بنك قطر الوطني|حملة الاختبار|0123-4567|QA58DOHB00001234567890ABCDEFG|QNBAQAQA|CR-12345"
eq "والقيمةُ تُقَصّ من المسافات" "$(q "select bank_name from public.company_config where id = 1")" "بنك قطر الوطني"
eq "ولا يُمسّ حقلٌ آخر" "$(other_fp)" "$base_other"
as $U_PAY "select 1 from $RPC('{\"bank_iban\":\"QA00TEST\"}'::jsonb)" >/dev/null
eq "الحقلُ الغائبُ في الرقعة لا يُمسّ" "$(bank)" "بنك قطر الوطني|حملة الاختبار|0123-4567|QA00TEST|QNBAQAQA|CR-12345"
as $U_PAY "select 1 from $RPC('{\"commercial_registration\":\"CR-99999\"}'::jsonb)" >/dev/null
eq "السجلُّ التجاريّ يُحرَّر وحده" "$(bank)" "بنك قطر الوطني|حملة الاختبار|0123-4567|QA00TEST|QNBAQAQA|CR-99999"
as $U_PAY "select 1 from $RPC('{\"bank_swift\":\"\",\"bank_account_number\":null}'::jsonb)" >/dev/null
eq "الفارغُ وnull يمحوان الحقلَ نفسَه" "$(q "select coalesce(bank_swift,'∅')||coalesce(bank_account_number,'∅') from public.company_config where id = 1")" "∅∅"
r="$(as $U_PAY "update public.company_config set bank_name = 'مباشر' where id = 1 returning 1")"
eq "ولا تكتب على الجدول مباشرةً (RLS: صفر صفوف)" "$(q "select bank_name from public.company_config where id = 1")" "بنك قطر الوطني"
r="$(as $U_PAY "update public.company_config set name_ar = 'عبث' where id = 1 returning 1")"
eq "ولا تمسّ هويّةَ الشركة مباشرةً" "$(other_fp)" "$base_other"

echo "── العبث (manage_payments)"
before="$(bank)"
denied "مفتاحٌ خارج الستّة يُرفض" "$(as $U_PAY "select 1 from $RPC('{\"name_ar\":\"عبث\"}'::jsonb)")" "22023"
denied "خليطٌ من حقلٍ مسموح وآخرَ ممنوع يُرفض كلُّه" "$(as $U_PAY "select 1 from $RPC('{\"bank_name\":\"جديد\",\"color_primary\":\"#000000\"}'::jsonb)")" "22023"
denied "portal_settings عبر الدالّة يُرفض" "$(as $U_PAY "select 1 from $RPC('{\"portal_settings\":{}}'::jsonb)")" "22023"
denied "نوعٌ غيرُ نصّيّ يُرفض" "$(as $U_PAY "select 1 from $RPC('{\"bank_iban\":5}'::jsonb)")" "22023"
denied "طولٌ زائد يُرفض" "$(as $U_PAY "select 1 from $RPC(jsonb_build_object('bank_name', repeat('x', 121)))")" "22023"
denied "رقعةٌ ليست كائناً تُرفض" "$(as $U_PAY "select 1 from $RPC('[\"bank_name\"]'::jsonb)")" "22023"
denied "رقعةٌ null تُرفض" "$(as $U_PAY "select 1 from $RPC(null)")" "22023"
eq "ولم يُحفظ شيءٌ من المرفوض" "$(bank)" "$before"
eq "ولا مسَّ حقلاً آخر" "$(other_fp)" "$base_other"

echo "── manage_users وحدها (قدرتُها القائمة محفوظة)"
as $U_USR "select 1 from $RPC('{\"bank_name\":\"بنك المستخدمين\"}'::jsonb)" >/dev/null
eq "تحرّر البنكَ بالدالّة" "$(q "select bank_name from public.company_config where id = 1")" "بنك المستخدمين"
as $U_USR "update public.company_config set tagline = 'شعار اختبار' where id = 1" >/dev/null
eq "وتحرّر إعداداتِ الشركة الأخرى كما كانت (RLS)" "$(q "select tagline from public.company_config where id = 1")" "شعار اختبار"
denied "ولا تتجاوز قائمةَ الحقول بالدالّة" "$(as $U_USR "select 1 from $RPC('{\"tagline\":\"x\"}'::jsonb)")" "22023"

echo "── كلتاهما"
as $U_BOTH "select 1 from $RPC('{\"bank_name\":\"بنك كلتيهما\"}'::jsonb)" >/dev/null
eq "تحرّر البنكَ بالدالّة" "$(q "select bank_name from public.company_config where id = 1")" "بنك كلتيهما"

echo "── من لا يملك أيّاً منهما"
before="$(bank)"
denied "صلاحياتٌ تشغيليّة وحدها تُرفض (42501)" "$(as $U_NONE "select 1 from $RPC('{\"bank_name\":\"x\"}'::jsonb)")" "42501"
denied "المستخدمُ المعطَّل يُرفض ولو ملك manage_payments" "$(as $U_OFF "select 1 from $RPC('{\"bank_name\":\"x\"}'::jsonb)")" "42501"
denied "anon لا ينفّذ الدالّة" "$(as anon "select 1 from $RPC('{\"bank_name\":\"x\"}'::jsonb)")" "42501"
as $U_NONE "update public.company_config set bank_name = 'x' where id = 1" >/dev/null
eq "ولا يكتب على الجدول مباشرةً" "$(bank)" "$before"

echo "── القراءة"
eq "كلُّ مصادَقٍ يقرأ الحقولَ الستّة (مصدرُ التقارير)" \
  "$(as $U_NONE "select (bank_name is not null)::text from public.company_config where id = 1" | tail -1)" "true"
eq "سياسةُ الكتابة على الجدول لم تُوسَّع" \
  "$(q "select string_agg(policyname||':'||qual, ',') from pg_policies where schemaname='public' and tablename='company_config' and cmd='UPDATE'")" \
  "company_config_management_update:has_permission('manage_users'::text)"

echo
echo "النتيجة: $pass نجح · $fail أخفق"
[ "$fail" -eq 0 ]
