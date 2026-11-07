#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# رقمُ الجواز والهوية فريدٌ في الموسم (20261101155834) — بالتنفيذ
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ بعد الترحيلات كلّها:
#   LOCAL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' supabase/verification/passengers/doc_uniqueness_tests.sh
#
#   نفسُ الرقم في الموسم نفسه يُرفض (إدراجٌ، تحديثٌ، إعادةُ حفظ، حفظان متزامنان)
#   نفسُ الرقم في موسمٍ سابق مقبول (حاجٌّ جديد)، والصفُّ التاريخيّ لا يُمسّ
#   التطبيع: الفراغات وحالةُ الحروف والأرقامُ العربيّة لا تُخفي تكراراً،
#   والشرطةُ لا تُحذف (رقمان مختلفان لا يندمجان)، والفارغُ وnull لا يتعارضان
#   الحاجُّ نفسُه يُحدَّث برقمه نفسه بلا رفض
#   الشرطُ المسبق: تكرارٌ قائمٌ يرفض الترحيلةَ كلَّها ولا يحذف شيئاً
#
# ⚠️ يرفض قاعدةً غيرَ محلّيّة. ينشئ موسمَين اختباريَّين وحجّاجَهما ثم يحذفها كلَّها.
set -uo pipefail
LOCAL="${LOCAL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$LOCAL" in
  *@127.0.0.1:*|*@localhost:*|postgresql:///*) ;;
  *) echo "يرفض: $LOCAL ليست قاعدةً محلّيّة"; exit 2 ;;
esac
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../../migrations/20261101155834_passengers_document_uniqueness_per_season.sql"
pass=0; fail=0
ok()  { echo "PASS — $1"; pass=$((pass + 1)); }
bad() { echo "FAIL — $1"; fail=$((fail + 1)); }
q()   { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
rejected() { echo "$2" | grep -Eq "23505|duplicate key value violates unique constraint" && echo "$2" | grep -q "${3:-}" && ok "$1" || bad "$1: $2"; }
accepted() { echo "$2" | grep -qi "error" && bad "$1: $2" || ok "$1"; }

[ "$(q "select count(*) from pg_indexes where indexname in ('passengers_season_passport_uniq','passengers_season_national_id_uniq')")" = "2" ] \
  || { echo "يرفض: الفهرسان غير موجودين — طبّق الترحيلات أولاً"; exit 2; }
[ "$(q "select count(*) from public.seasons where closed_at is null")" = "0" ] \
  || { echo "يرفض: في القاعدة موسمٌ مفتوح — الاختبارُ ينشئ موسمَيه بنفسه"; exit 2; }

S1=990001; S2=990002
cleanup() {
  psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
alter table public.passengers disable trigger user;
delete from public.passengers where season_id in ($S1, $S2);
alter table public.passengers enable trigger user;
delete from public.seasons where id in ($S1, $S2);
SQL
}
trap cleanup EXIT
# الموسم ١ (سابق): حاجٌّ بجوازٍ وهوية، ثم يُغلق. الموسم ٢ مفتوح.
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.seasons (id, name, hijri_year) overriding system value values ($S1, 'موسم اختبار سابق', 1446);
insert into public.passengers (name_ar, passport, national_id, season_id) values ('حاج الموسم السابق', 'A1234567', '28763400001', $S1);
update public.seasons set closed_at = now(), closed_by = 'test' where id = $S1;
insert into public.seasons (id, name, hijri_year) overriding system value values ($S2, 'موسم اختبار حالي', 1447);
SQL
ins() { q "insert into public.passengers (name_ar, passport, national_id, season_id) values ('$1', $2, $3, $S2) returning id"; }
HIST_FP="$(q "select md5(string_agg(to_jsonb(p)::text, '' order by id)) from public.passengers p where season_id = $S1")"

echo "── الموسم السابق"
accepted "نفسُ الجواز والهوية من موسمٍ سابق: حاجٌّ جديد في الحالي" "$(ins 'حاج عائد' "'A1234567'" "'28763400001'")"

echo "── التكرار في الموسم نفسه"
rejected "نفسُ الجواز مرّةً ثانية (إعادةُ حفظٍ أو طلبٌ مكرّر)" "$(ins 'نسخة' "'A1234567'" "null")" "passengers_season_passport_uniq"
rejected "نفسُ الهوية مرّةً ثانية" "$(ins 'نسخة' "null" "'28763400001'")" "passengers_season_national_id_uniq"
rejected "فراغاتٌ وحروفٌ صغيرة لا تُخفي التكرار" "$(ins 'نسخة' "' a12 34567 '" "null")" "passengers_season_passport_uniq"
rejected "أرقامٌ عربيّة لا تُخفي التكرار" "$(ins 'نسخة' "null" "'٢٨٧٦٣٤٠٠٠٠١'")" "passengers_season_national_id_uniq"

echo "── ما لا يُعدّ تكراراً"
accepted "رقمٌ بشرطة رقمٌ مختلف (لا يُحذف شيءٌ غيرُ الفراغ)" "$(ins 'جواز بشرطة' "'A-1234567'" "null")"
accepted "جوازٌ فارغ لحاجَّين" "$(ins 'بلا جواز ١' "''" "''")"
accepted "…وثالث" "$(ins 'بلا جواز ٢' "''" "''")"
accepted "null لحاجَّين" "$(ins 'بلا رقم ١' "null" "null")"
accepted "…وثانٍ" "$(ins 'بلا رقم ٢' "null" "null")"
accepted "فراغٌ وحده لا يُعدّ رقماً" "$(ins 'فراغ' "'   '" "' '")"

echo "── التحديث"
OTHER="$(ins 'حاج آخر' "'B7654321'" "'29000000002'" | tail -1)"
rejected "تحديثُ حاجٍّ إلى جوازٍ مسجَّل لغيره (ربطُ مستندٍ متعارض)" \
  "$(q "update public.passengers set passport = 'A1234567' where id = $OTHER")" "passengers_season_passport_uniq"
rejected "تحديثُه إلى هويةٍ مسجَّلة لغيره" \
  "$(q "update public.passengers set national_id = '28763400001' where id = $OTHER")" "passengers_season_national_id_uniq"
accepted "الحاجُّ نفسُه يُحفظ برقمه نفسه (لا يطابق نفسه)" \
  "$(q "update public.passengers set passport = 'B7654321', national_id = '29000000002', name_ar = 'حاج آخر معدّل' where id = $OTHER")"
[ "$(q "select passport||'|'||national_id from public.passengers where id = $OTHER")" = "B7654321|29000000002" ] \
  && ok "والرفضُ لم يغيّر رقمَي الحاجّ الآخر" || bad "تغيّر رقمُ الحاجّ الآخر بعد رفض"

echo "── حفظان متزامنان من موظّفَين"
( psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "begin; insert into public.passengers (name_ar, passport, season_id) values ('موظف أ', 'C5550001', $S2); select pg_sleep(2); commit;" \
  > /tmp/doc_uniq_a.$$ 2>&1 ) &
sleep 0.5
B="$(q "insert into public.passengers (name_ar, passport, season_id) values ('موظف ب', 'c5550001', $S2) returning id")"
wait
A="$(cat /tmp/doc_uniq_a.$$)"; rm -f /tmp/doc_uniq_a.$$
accepted "الأوّلُ يُحفظ" "$A"
rejected "الثاني ينتظر قفلَ الفهرس ثم يُرفض" "$B" "passengers_season_passport_uniq"
[ "$(q "select count(*) from public.passengers where season_id = $S2 and upper(passport) = 'C5550001'")" = "1" ] \
  && ok "صفٌّ واحدٌ فقط بالرقم" || bad "حُفظ الرقمُ مرّتين"

echo "── الموسم السابق لم يُمسّ"
[ "$(q "select md5(string_agg(to_jsonb(p)::text, '' order by id)) from public.passengers p where season_id = $S1")" = "$HIST_FP" ] \
  && ok "صفوفُ الموسم السابق كما كانت" || bad "تغيّر صفٌّ في الموسم السابق"

echo "── الشرطُ المسبق: تكرارٌ قائمٌ يرفض الترحيلة ولا يحذف شيئاً"
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
drop index public.passengers_season_passport_uniq;
drop index public.passengers_season_national_id_uniq;
insert into public.passengers (name_ar, passport, season_id) values ('تكرار قائم', 'a1234567', $S2);
SQL
ROWS_BEFORE="$(q "select count(*) from public.passengers")"
R="$(psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)"
echo "$R" | grep -q "duplicated within a season" && ok "الترحيلةُ رُفضت برسالتها" || bad "الترحيلةُ لم تُرفض: $R"
[ "$(q "select count(*) from pg_indexes where indexname in ('passengers_season_passport_uniq','passengers_season_national_id_uniq')")" = "0" ] \
  && ok "ولم يُنشأ فهرسٌ جزئيّاً" || bad "أُنشئ فهرسٌ رغم الرفض"
[ "$(q "select count(*) from public.passengers")" = "$ROWS_BEFORE" ] && ok "ولم يُحذف صفّ" || bad "تغيّر عددُ الصفوف"
q "delete from public.passengers where name_ar = 'تكرار قائم' and season_id = $S2" >/dev/null
R="$(psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)"
accepted "بعد إزالة التكرار يدوياً تمرّ الترحيلةُ وشروطُها اللاحقة" "$R"

echo
echo "النتيجة: $pass نجح · $fail أخفق"
[ "$fail" -eq 0 ]
