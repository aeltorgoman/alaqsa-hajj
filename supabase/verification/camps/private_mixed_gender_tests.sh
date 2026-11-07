#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# المخيّمُ الخاصّ يجمع الجنسين، والعاديّ لجنسه (20261107120000) — بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ بعد الترحيلات كلّها:
#   LOCAL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' supabase/verification/camps/private_mixed_gender_tests.sh
#
#   منى وعرفة: العاديّ يرفض الجنسَ الآخر ومن لا جنس له؛ الخاصّ يقبل الجنسين
#   السعةُ والموسمُ يسريان على الخاصّ كما على العاديّ
#   تغييرُ جنس الحاجّ: يُرفض في العاديّ ويُقبل في الخاصّ
#   تحويلُ خاصٍّ مختلطٍ إلى عاديّ يُرفض؛ وغيرُ المختلط يُقبل
#   تغييرُ جنس عاديٍّ مأهولٍ بغير جنسه يُرفض (كما كان)؛ والخاصّ المختلط يُقبل
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

echo
echo "النتيجة: $pass نجح · $fail أخفق"
[ "$fail" -eq 0 ]
