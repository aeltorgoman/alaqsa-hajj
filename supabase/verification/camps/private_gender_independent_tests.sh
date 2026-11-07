#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# المخيّمُ الخاصّ بلا جنس، قسمٌ مستقلّ (20261107160000) — بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ بعد الترحيلات كلّها:
#   LOCAL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' supabase/verification/camps/private_gender_independent_tests.sh
#
#   الإنشاء: عاديّ رجال/نساء (الجنسُ إلزاميّ)، خاصٌّ بلا جنس، خاصٌّ بجنسٍ قديم (مقبول)،
#            نوعٌ خارج المفردتين أو فارغ يُرفض
#   التحويل: خاصٌّ بلا جنس ← عاديّ يلزمه جنس؛ خاصٌّ مأهولٌ مختلط ← عاديّ يُرفض؛
#            عاديّ ← خاصّ بلا جنس يُقبل ولو مأهولاً؛ تعديلُ الاسم/السعة للخاصّ يُقبل
#   الاسمُ الفريد في المجموعة: خاصّان باسمٍ واحد يُرفضان وإن اختلف جنسُهما القديم؛
#            عاديّ رجال وعاديّ نساء باسمٍ واحد، وخاصٌّ وعاديّ باسمٍ واحد، مقبولة
#   الترتيب: الخاصّ الجديد آخرَ الخاصّ كلّه (لا آخرَ جنسٍ قديم)، والعاديّ آخرَ جنسه
#   القبول: الخاصّ بلا جنس يقبل الجنسين؛ العاديّ يفصل؛ السعةُ تسري
#   (والقواعدُ السابقة كلُّها في private_mixed_gender_tests.sh)
#
# ⚠️ يرفض قاعدةً غيرَ محلّيّة. ينشئ موسماً اختباريّاً ومخيّماته وحجّاجه ثم يحذفها.
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
rejected() { echo "$2" | grep -q "${3:-ERROR}" && ok "$1" || bad "$1: $2"; }
accepted() { echo "$2" | grep -qi "error" && bad "$1: $2" || ok "$1"; }

[ "$(q "select count(*) from pg_constraint where conname = 'camps_gender_by_type'")" = "1" ] \
  || { echo "يرفض: الترحيلة 20261107160000 غير مطبَّقة"; exit 2; }
[ "$(q "select count(*) from public.seasons where closed_at is null")" = "0" ] \
  || { echo "يرفض: في القاعدة موسمٌ مفتوح — الاختبارُ ينشئ موسمه بنفسه"; exit 2; }

S=990201
cleanup() {
  psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
alter table public.passengers disable trigger user;
delete from public.passengers where season_id = $S;
alter table public.passengers enable trigger user;
alter table public.camps disable trigger user;
delete from public.camps where season_id = $S;
alter table public.camps enable trigger user;
delete from public.seasons where id = $S;
SQL
}
trap cleanup EXIT
q "insert into public.seasons (id, name, hijri_year) overriding system value values ($S, 'موسم اختبار الخاصّ بلا جنس', 1447)" >/dev/null
ins() { q "insert into public.camps (name, gender, type, page_type, capacity, season_id) values ('$1', $2, $3, '$4', ${5:-5}, $S) returning id"; }
pax() { q "insert into public.passengers (name_ar, gender, season_id) values ('$1', $2, $S) returning id"; }
so()  { q "select sort_order from public.camps where id = $1"; }

for PAGE in منى عرفة; do
  COL=$([ "$PAGE" = "منى" ] && echo camp_mina_id || echo camp_arafa_id)
  echo "── $PAGE: الإنشاء"
  M=$(ins "رجال ١" "'ذكر'" "'عادي'" $PAGE);  accepted "عاديّ رجال" "$M"
  F=$(ins "نساء ١" "'أنثى'" "'عادي'" $PAGE); accepted "عاديّ نساء" "$F"
  rejected "عاديّ بلا جنس يُرفض" "$(ins "عادي بلا جنس" null "'عادي'" $PAGE)" "camps_gender_by_type"
  P=$(ins "خاص ١" null "'خاص'" $PAGE 3);    accepted "خاصٌّ بلا جنس" "$P"
  L=$(ins "خاص قديم" "'أنثى'" "'خاص'" $PAGE); accepted "خاصٌّ بجنسٍ قديم (بيانات قائمة) مقبول" "$L"
  rejected "نوعٌ خارج المفردتين يُرفض" "$(ins "باص" "'ذكر'" "'VIP'" $PAGE)" "camps_type_vocab\|camps_gender_by_type"
  rejected "نوعٌ فارغ يُرفض" "$(ins "بلا نوع" "'ذكر'" null $PAGE)" "not-null\|null value"
  [ "$(q "select coalesce(gender, 'NULL') || '|' || type from public.camps where id = $P")" = "NULL|خاص" ] && ok "الخاصّ محفوظٌ بلا جنس" || bad "الخاصّ حُفظ بجنس"

  echo "── $PAGE: الاسمُ الفريد في المجموعة"
  rejected "خاصّان باسمٍ واحد يُرفضان (وإن كان للأوّل جنسٌ قديم)" "$(ins "خاص قديم" null "'خاص'" $PAGE)" "camps_season_page_group_name_uniq"
  accepted "عاديّ رجال وعاديّ نساء باسمٍ واحد" "$(ins "رجال ١" "'أنثى'" "'عادي'" $PAGE)"
  accepted "خاصٌّ وعاديٌّ باسمٍ واحد" "$(ins "نساء ١" null "'خاص'" $PAGE)"
  rejected "عاديّان من جنسٍ واحد باسمٍ واحد يُرفضان (كما كان)" "$(ins "رجال ١" "'ذكر'" "'عادي'" $PAGE)" "camps_season_page_group_name_uniq"

  echo "── $PAGE: الترتيب"
  N=$(ins "خاص جديد" null "'خاص'" $PAGE)
  MAXP=$(q "select max(sort_order) from public.camps where season_id = $S and page_type = '$PAGE' and type = 'خاص' and id <> $N")
  [ "$(so $N)" = "$((MAXP + 10))" ] && ok "الخاصّ الجديد آخرَ الخاصّ كلّه (بعد الخاصّ ذي الجنس القديم)" || bad "ترتيب الخاصّ الجديد $(so $N) والمتوقَّع $((MAXP + 10))"
  R=$(ins "رجال ٢" "'ذكر'" "'عادي'" $PAGE)
  MAXR=$(q "select max(sort_order) from public.camps where season_id = $S and page_type = '$PAGE' and type = 'عادي' and gender = 'ذكر' and id <> $R")
  [ "$(so $R)" = "$((MAXR + 10))" ] && ok "العاديّ الجديد آخرَ جنسه (لا يتأثّر بالخاصّ)" || bad "ترتيب العاديّ الجديد $(so $R) والمتوقَّع $((MAXR + 10))"

  echo "── $PAGE: القبول والسعة"
  mm=$(pax "رجل $PAGE" "'ذكر'"); ff=$(pax "امرأة $PAGE" "'أنثى'"); nn=$(pax "بلا جنس $PAGE" null); xx=$(pax "زائدة $PAGE" "'أنثى'")
  accepted "الخاصّ بلا جنس يقبل رجلاً" "$(q "update public.passengers set $COL = $P where id = $mm")"
  accepted "…وامرأة" "$(q "update public.passengers set $COL = $P where id = $ff")"
  accepted "…ومن لا جنس له" "$(q "update public.passengers set $COL = $P where id = $nn")"
  rejected "سعةُ الخاصّ تسري (٣/٣)" "$(q "update public.passengers set $COL = $P where id = $xx")" "مكتمل"
  rejected "العاديّ للرجال يرفض امرأة" "$(q "update public.passengers set $COL = $M where id = $xx")" "الفصل بالجنس لا يُتجاوز"
  rejected "العاديّ للنساء يرفض رجلاً" "$(q "update public.passengers set $COL = null where id = $mm; update public.passengers set $COL = $F where id = $mm")" "الفصل بالجنس لا يُتجاوز"
  q "update public.passengers set $COL = $P where id = $mm" >/dev/null

  echo "── $PAGE: التحويل والتعديل"
  accepted "تعديلُ اسم الخاصّ وسعته" "$(q "update public.camps set name = 'خاص ١ معدّل', capacity = 4 where id = $P")"
  rejected "خاصٌّ ← عاديّ بلا جنس يُرفض" "$(q "update public.camps set type = 'عادي' where id = $N")" "camps_gender_by_type"
  accepted "خاصٌّ خالٍ ← عاديّ نساء (بجنسه)" "$(q "update public.camps set type = 'عادي', gender = 'أنثى' where id = $N")"
  accepted "…ثم عاديّ ← خاصّ بلا جنس" "$(q "update public.camps set type = 'خاص', gender = null where id = $N")"
  rejected "خاصٌّ مأهولٌ مختلط ← عاديّ رجال يُرفض" "$(q "update public.camps set type = 'عادي', gender = 'ذكر' where id = $P")" "من جنسٍ آخر"
  [ "$(q "select type || '|' || coalesce(gender,'NULL') from public.camps where id = $P")" = "خاص|NULL" ] && ok "…ولم يتغيّر شيء" || bad "تغيّر المخيّم رغم الرفض"
  mo=$(pax "رجل للعاديّ $PAGE" "'ذكر'"); q "update public.passengers set $COL = $M where id = $mo" >/dev/null
  accepted "عاديٌّ مأهول ← خاصّ بلا جنس يُقبل (الخاصّ يقبل الجنسين)" "$(q "update public.camps set type = 'خاص', gender = null where id = $M")"
  accepted "…ويعود عاديّاً لرجال (نازله رجل)" "$(q "update public.camps set type = 'عادي', gender = 'ذكر' where id = $M")"
done

echo
echo "النتيجة: $pass نجح · $fail أخفق"
[ "$fail" -eq 0 ]
