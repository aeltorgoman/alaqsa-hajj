#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# المخيّمُ الخاصّ يجمع الجنسين، والعاديّ لجنسه (20261107104607) — بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ بعد الترحيلات كلّها:
#   LOCAL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' supabase/verification/camps/private_mixed_gender_tests.sh
#
#   منى وعرفة: العاديّ يرفض الجنسَ الآخر ومن لا جنس له؛ الخاصّ يقبل الجنسين
#   السعةُ والموسمُ يسريان على الخاصّ كما على العاديّ
#   تغييرُ جنس الحاجّ: يُرفض في العاديّ ويُقبل في الخاصّ
#   تحويلُ خاصٍّ مختلطٍ إلى عاديّ يُرفض؛ وغيرُ المختلط يُقبل
#   تغييرُ جنس عاديٍّ مأهولٍ بغير جنسه يُرفض (كما كان)؛ والخاصّ المختلط يُقبل
#   الحمايات القائمة: سعةُ العاديّ، مخيّمُ منى في عمود عرفة (والعكس)، خفضُ السعة دون
#   النازلين، نقلُ مخيّمٍ مأهولٍ بين منى وعرفة — كلُّها تُرفض كما كانت
#   الصلاحيّات: الدالّتان لا يستدعيهما anon ولا authenticated (service_role وحدها)،
#   SECURITY DEFINER و search_path كما كانا، والزنادان قائمان؛ وبصفة موظّفٍ مسجَّل:
#   بلا manage_passengers لا يُسنِد أحداً (RLS)، وبها يُسنِد إلى الخاصّ مختلطاً ويُرفض
#   في العاديّ، وبلا manage_camps لا يغيّر نوعَ مخيّم
#
# ⚠️ يرفض قاعدةً غيرَ محلّيّة. ينشئ موسمَين اختباريَّين ومخيّماتهما وحجّاجهما ثم يحذفها كلَّها.
set -uo pipefail
LOCAL="${LOCAL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$LOCAL" in
  *@127.0.0.1:*|*@localhost:*|postgresql:///*) ;;
  *) echo "يرفض: $LOCAL ليست قاعدةً محلّيّة"; exit 2 ;;
esac
pass=0; fail=0
ok()  { echo "PASS — $1"; pass=$((pass + 1)); }
bad() { echo "FAIL — $1"; fail=$((fail + 1)); }
q()   { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
rejected() { echo "$2" | grep -q "${3:-P0001\|ERROR}" && ok "$1" || bad "$1: $2"; }
accepted() { echo "$2" | grep -qi "error" && bad "$1: $2" || ok "$1"; }

[ "$(q "select count(*) from public.seasons where closed_at is null")" = "0" ] \
  || { echo "يرفض: في القاعدة موسمٌ مفتوح — الاختبارُ ينشئ موسمَيه بنفسه"; exit 2; }

S=990101; S2=990102
cleanup() {
  psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
alter table public.passengers disable trigger user;
delete from public.passengers where season_id in ($S, $S2);
alter table public.passengers enable trigger user;
alter table public.camps disable trigger user;
delete from public.camps where season_id in ($S, $S2);
alter table public.camps enable trigger user;
delete from public.seasons where id in ($S, $S2);
SQL
}
U_NONE=00000000-0000-4000-8000-0000000c0001; U_PAX=00000000-0000-4000-8000-0000000c0002
cleanup() {
  psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
alter table public.passengers disable trigger user;
delete from public.passengers where season_id in ($S, $S2);
alter table public.passengers enable trigger user;
alter table public.camps disable trigger user;
delete from public.camps where season_id in ($S, $S2);
alter table public.camps enable trigger user;
delete from public.seasons where id in ($S, $S2);
delete from public.user_profiles where id in ('$U_NONE', '$U_PAX');
delete from auth.users where id in ('$U_NONE', '$U_PAX');
SQL
}
trap cleanup EXIT
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.seasons (id, name, hijri_year) overriding system value values ($S2, 'موسم اختبار آخر', 1446);
insert into public.camps (name, gender, type, page_type, capacity, season_id)
  values ('خاص موسم آخر منى', 'ذكر', 'خاص', 'منى', 5, $S2), ('خاص موسم آخر عرفة', 'ذكر', 'خاص', 'عرفة', 5, $S2);
update public.seasons set closed_at = now(), closed_by = 'test' where id = $S2;
insert into public.seasons (id, name, hijri_year) overriding system value values ($S, 'موسم اختبار المخيّمات', 1447);
SQL
camp() { q "insert into public.camps (name, gender, type, page_type, capacity, season_id) values ('$1', '$2', '$3', '$4', $5, ${6:-$S}) returning id"; }
pax()  { q "insert into public.passengers (name_ar, gender, season_id) values ('$1', $2, $S) returning id"; }
put()  { q "update public.passengers set $1 = $2 where id = $3"; }

for PAGE in منى عرفة; do
  COL=$([ "$PAGE" = "منى" ] && echo camp_mina_id || echo camp_arafa_id)
  echo "── $PAGE"
  REG=$(camp "عادي رجال $PAGE" ذكر عادي $PAGE 10)
  PRV=$(camp "خاص $PAGE" ذكر خاص $PAGE 3)
  OTHER_SEASON=$(q "select id from public.camps where season_id = $S2 and page_type = '$PAGE'")
  M=$(pax "رجل $PAGE" "'ذكر'"); F=$(pax "امرأة $PAGE" "'أنثى'"); N=$(pax "بلا جنس $PAGE" "null")
  F2=$(pax "امرأة ٢ $PAGE" "'أنثى'"); M2=$(pax "رجل ٢ $PAGE" "'ذكر'")

  accepted "عاديّ رجال: يقبل رجلاً" "$(put $COL $REG $M)"
  rejected "عاديّ رجال: يرفض امرأة" "$(put $COL $REG $F)" "الفصل بالجنس لا يُتجاوز"
  rejected "عاديّ: يرفض من لا جنس له" "$(put $COL $REG $N)" "بلا جنسٍ مسجَّل"
  rejected "عاديّ: تغييرُ جنس نازلٍ فيه إلى الآخر يُرفض" "$(q "update public.passengers set gender = 'أنثى' where id = $M")" "الفصل بالجنس لا يُتجاوز"
  rejected "عاديّ مأهول: تغييرُ جنسه يُرفض (كما كان)" "$(q "update public.camps set gender = 'أنثى' where id = $REG")" "من جنسٍ آخر"

  accepted "خاصّ (مجموعة الرجال): يقبل امرأة" "$(put $COL $PRV $F)"
  accepted "خاصّ: يقبل رجلاً معها" "$(put $COL $PRV $M2)"
  accepted "خاصّ: يقبل من لا جنس له" "$(put $COL $PRV $N)"
  rejected "خاصّ: السعةُ تسري (٣/٣)" "$(put $COL $PRV $F2)" "مكتمل"
  rejected "خاصّ: الموسمُ يسري" "$(put $COL $OTHER_SEASON $F2)" "موسماً آخر"
  accepted "خاصّ: تغييرُ جنس نازلٍ فيه يُقبل" "$(q "update public.passengers set gender = 'ذكر' where id = $F")"
  q "update public.passengers set gender = 'أنثى' where id = $F" >/dev/null
  accepted "خاصّ مختلط: تغييرُ مجموعة جنسه يُقبل" "$(q "update public.camps set gender = 'أنثى' where id = $PRV")"
  rejected "خاصّ مختلط: تحويلُه إلى عاديّ يُرفض" "$(q "update public.camps set type = 'عادي' where id = $PRV")" "من جنسٍ آخر"
  [ "$(q "select type from public.camps where id = $PRV")" = "خاص" ] && ok "…ولم يتغيّر نوعه" || bad "تغيّر نوعُ المخيّم رغم الرفض"
  put $COL null $M2 >/dev/null; put $COL null $N >/dev/null
  accepted "خاصّ بنازلين من جنس مجموعته وحدَه: تحويلُه إلى عاديّ يُقبل" "$(q "update public.camps set type = 'عادي' where id = $PRV")"
  rejected "…وصار عاديّاً: يرفض الرجلَ الآن" "$(put $COL $PRV $M2)" "الفصل بالجنس لا يُتجاوز"
done

echo "── الحماياتُ القائمة"
for PAGE in منى عرفة; do
  COL=$([ "$PAGE" = "منى" ] && echo camp_mina_id || echo camp_arafa_id)
  OTHER=$([ "$PAGE" = "منى" ] && echo camp_arafa_id || echo camp_mina_id)
  W=$(camp "عادي نساء $PAGE" أنثى عادي $PAGE 1)
  m=$(pax "رجل للنساء $PAGE" "'ذكر'"); f=$(pax "امرأة للنساء $PAGE" "'أنثى'"); f2=$(pax "امرأة زائدة $PAGE" "'أنثى'")
  rejected "$PAGE: عاديّ نساء يرفض رجلاً" "$(put $COL $W $m)" "الفصل بالجنس لا يُتجاوز"
  accepted "$PAGE: عاديّ نساء يقبل امرأة" "$(put $COL $W $f)"
  rejected "$PAGE: سعةُ العاديّ تسري (١/١)" "$(put $COL $W $f2)" "مكتمل"
  rejected "$PAGE: مخيّمُ $PAGE لا يُسنَد في العمود الآخر" "$(put $OTHER $W $f2)" "لا يُسنَد في عمود"
  rejected "$PAGE: خفضُ السعة دون النازلين يُرفض" "$(q "update public.camps set capacity = 0 where id = $W")" "camps_capacity_positive\|لا تُخفَّض"
  rejected "$PAGE: نقلُ مخيّمٍ مأهولٍ بين منى وعرفة يُرفض" "$(q "update public.camps set page_type = '$([ "$PAGE" = "منى" ] && echo عرفة || echo منى)' where id = $W")" "لا يُنقل بين منى وعرفة"
done

echo "── الصلاحيّات"
SIG="public.assert_camp_admits(bigint,bigint,bigint,text,bigint,integer,text,text,text)"
for FN in "$SIG" "public.camps_guard_occupants()"; do
  [ "$(q "select has_function_privilege('anon', '$FN', 'execute')::text || has_function_privilege('authenticated', '$FN', 'execute')::text || has_function_privilege('service_role', '$FN', 'execute')::text")" = "falsefalsetrue" ] \
    && ok "$FN: لا anon ولا authenticated — service_role وحدها (كالأساس)" || bad "$FN: صلاحيّةُ التنفيذ تغيّرت"
  [ "$(q "select prosecdef::text || '|' || array_to_string(proconfig, ',') from pg_proc where oid = '$FN'::regprocedure")" = "true|search_path=public, pg_temp" ] \
    && ok "$FN: SECURITY DEFINER و search_path كما كانا" || bad "$FN: الخصائص تغيّرت"
done
[ "$(q "select count(*) from pg_trigger where tgname = 'trg_reject_invalid_allocation' and tgrelid = 'public.passengers'::regclass and tgenabled = 'O'")" = "1" ] \
  && ok "زنادُ الإسناد trg_reject_invalid_allocation قائمٌ ومفعَّل" || bad "زنادُ الإسناد مفقود"
[ "$(q "select string_agg(a.attname, ',' order by a.attname) from pg_trigger t join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = any(t.tgattr) where t.tgname = 'trg_camps_guard_occupants' and t.tgenabled = 'O'")" = "capacity,gender,page_type,type" ] \
  && ok "زنادُ حارس المخيّم على capacity و gender و page_type و type" || bad "أعمدةُ زناد الحارس غير المتوقَّعة"

echo "── بصفة موظّفٍ مسجَّل (authenticated + RLS)"
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into auth.users (id, email) values ('$U_NONE', 'none@test.local'), ('$U_PAX', 'pax@test.local');
insert into public.user_profiles (id, email, name, permissions, is_active) values
  ('$U_NONE', 'none@test.local', 'بلا صلاحية', '{}', true),
  ('$U_PAX', 'pax@test.local', 'إدارة الحجاج', '{"manage_passengers": true}', true);
SQL
as() { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "begin; select set_config('request.jwt.claims', json_build_object('sub','$1','role','authenticated')::text, true); set local role authenticated; $2; commit;" 2>&1; }
PRV2=$(camp "خاص للصلاحيات" ذكر خاص منى 10); REG2=$(camp "عادي رجال للصلاحيات" ذكر عادي منى 10)
fw=$(pax "امرأة للصلاحيات" "'أنثى'"); mw=$(pax "رجل للصلاحيات" "'ذكر'")
R=$(as $U_NONE "update public.passengers set camp_mina_id = $PRV2 where id = $fw returning id")
[ -z "$(echo "$R" | grep -v '^BEGIN\|^COMMIT\|^UPDATE\|^$\|set_config\|^{')" ] && [ "$(q "select coalesce(camp_mina_id::text,'null') from public.passengers where id = $fw")" = "null" ] \
  && ok "بلا manage_passengers: لا يُسنِد أحداً (RLS — لا صفّ يتغيّر)" || bad "مستخدمٌ بلا صلاحية أسنَد: $R"
accepted "بـ manage_passengers: امرأةٌ إلى الخاصّ" "$(as $U_PAX "update public.passengers set camp_mina_id = $PRV2 where id = $fw")"
accepted "بـ manage_passengers: ورجلٌ إلى الخاصّ نفسه" "$(as $U_PAX "update public.passengers set camp_mina_id = $PRV2 where id = $mw")"
[ "$(q "select count(*) from public.passengers where camp_mina_id = $PRV2")" = "2" ] && ok "…والخاصّ يضمّهما فعلاً" || bad "الإسنادُ المختلط لم يُحفظ"
rejected "بـ manage_passengers: امرأةٌ إلى عاديّ الرجال تُرفض" "$(as $U_PAX "update public.passengers set camp_mina_id = $REG2 where id = $fw")" "الفصل بالجنس لا يُتجاوز"
# مخيّمٌ خالٍ: الحارسُ لا يمنع تغييرَ نوعه — فالمنعُ هنا من الصلاحيّة وحدها
EMPTY=$(camp "خاص خالٍ للصلاحيات" ذكر خاص منى 10)
as $U_PAX "update public.camps set type = 'عادي' where id = $EMPTY" >/dev/null
[ "$(q "select type from public.camps where id = $EMPTY")" = "خاص" ] && ok "بلا manage_camps: لا يغيّر نوعَ مخيّمٍ خالٍ (RLS)" || bad "تغيّر نوعُ المخيّم بلا manage_camps"
accepted "…والمالكُ يغيّره (الحارسُ لا يمنع الخالي)" "$(q "update public.camps set type = 'عادي' where id = $EMPTY")"

echo
echo "النتيجة: $pass نجح · $fail أخفق"
[ "$fail" -eq 0 ]
