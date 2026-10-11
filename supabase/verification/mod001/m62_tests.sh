#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# MOD-001 / #62 — الفحوص، وضوابطُ سلبيّة، وتزامنٌ حقيقيّ بجلستين
# ════════════════════════════════════════════════════════════
# على القاعدة المحلّيّة المؤقّتة وحدها (بعد `db reset` إلى آخر ترحيلة):
#   supabase/verification/mod001/m62_tests.sh
#
#   ١) m62_transfer_uniqueness_checks.sql يمرّ
#   ٢) ضوابطُ سلبيّة — كلٌّ يكسر حمايةً ثمّ يُرجعها، والفحوصُ يجب أن تُخفق:
#        · الشرطُ الذرّيّ محذوفٌ من assign_passenger_room(…, expected)
#        · الفهرسُ الجزئيّ للغرف بلا فندق محذوف
#        · الفهرسُ القديمُ على الموسم مُعاد
#   ٣) تزامن: جلستان تنقلان الحاجَّ نفسَه من المصدر نفسِه — الثانيةُ تنتظر القفلَ
#      ثمّ تُرفض (والضابطُ السلبيّ: بالنسخة القديمة تكتب فوق الأولى)؛
#      وجلستان على السرير الأخير — واحدةٌ تمرّ.
#
# ⚠️ يرفض أيَّ قاعدةٍ غيرِ 127.0.0.1، ويُرجع كلَّ ما يكتبه.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT" || exit 2
LOCAL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
CHECKS=supabase/verification/mod001/m62_transfer_uniqueness_checks.sql
OUT="${OUT:-/tmp/mod001-m62-tests}"; rm -rf "$OUT"; mkdir -p "$OUT"
FN='public.assign_passenger_room(bigint,bigint,bigint)'

pass=0; fail=0
ok()  { echo "PASS — $1"; pass=$((pass + 1)); }
bad() { echo "FAIL — $1"; fail=$((fail + 1)); }
q()   { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
run_checks() { psql "$LOCAL" -X -v ON_ERROR_STOP=1 -f "$CHECKS" > "$OUT/checks.log" 2>&1; }
checks_fail_with() { # $1 = وصف، $2 = نصٌّ يجب أن يظهر في الإخفاق
  if run_checks; then bad "$1 (checks still PASSED)"; elif grep -q "$2" "$OUT/checks.log"; then ok "$1 → checks fail: $(grep -m1 -oE '(FAIL — [^"]{0,70}|violates unique constraint "[a-z_]+")' "$OUT/checks.log")"; else bad "$1 (failed for another reason)"; tail -3 "$OUT/checks.log"; fi; }

echo "═══ ١) الفحوص ═══"
if run_checks && grep -q "كلُّ الفحوص نجحت" "$OUT/checks.log"; then ok "m62 checks: $(grep -c 'PASS —' "$OUT/checks.log") PASS lines"; else bad "m62 checks"; tail -5 "$OUT/checks.log"; fi

echo "═══ ٢) ضوابطُ سلبيّة ═══"
q "select pg_get_functiondef('$FN'::regprocedure)" > "$OUT/fn.sql"
python3 -I - "$OUT/fn.sql" "$OUT/fn-broken.sql" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
b = re.sub(r"  if v_current is distinct from p_expected_room_id then.*?end if;\n", "", s, flags=re.S)
assert b != s, "stale check not found"
open(sys.argv[2], "w").write(b)
PY
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -f "$OUT/fn-broken.sql" > /dev/null
checks_fail_with "atomic stale-source check removed" "مصدرٌ قديمٌ مرّ"
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -f "$OUT/fn.sql" > /dev/null

q "drop index public.rooms_unlinked_season_floor_number_uniq"
checks_fail_with "partial index for unlinked rooms removed" "rooms_unlinked_season_floor_number_uniq"
q "create unique index rooms_unlinked_season_floor_number_uniq on public.rooms (season_id, floor, number) where hotel_id is null"

q "create unique index rooms_season_floor_number_uniq on public.rooms (season_id, floor, number)"
checks_fail_with "old season-wide index reinstated (same number in two hotels refused again)" "rooms_season_floor_number_uniq"
q "drop index public.rooms_season_floor_number_uniq"

if run_checks; then ok "protections restored — checks pass again"; else bad "restore"; tail -3 "$OUT/checks.log"; fi

echo "═══ ٣) تزامنٌ بجلستين ═══"
# تهيئةٌ ملتزَمة (تُحذف في الآخر)
q "insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-0000000000d1','conc@t.local','authenticated','authenticated');
   insert into public.user_profiles (id, email, name, permissions, is_active) values ('00000000-0000-0000-0000-0000000000d1','conc@t.local','تزامن','{\"manage_hotel\":true}',true);
   insert into public.seasons (id, name, hijri_year) overriding system value values (9301, 'تزامن', 1450);
   insert into public.hotels (id, season_id, name) overriding system value values (8301, 9301, 'فندق التزامن');
   insert into public.rooms (id, season_id, hotel_id, number, floor, type) overriding system value values
     (7301, 9301, 8301, '1', '1', 'ثنائية'), (7302, 9301, 8301, '2', '1', 'ثنائية'),
     (7303, 9301, 8301, '3', '1', 'ثنائية'), (7304, 9301, 8301, '4', '1', 'فردية');
   insert into public.passengers (id, season_id, name_ar, room_id) overriding system value values
     (6301, 9301, 'حاج التزامن', 7301), (6302, 9301, 'سرير ١', null), (6303, 9301, 'سرير ٢', null);" > /dev/null
AS="begin; set local role authenticated; select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-0000000000d1\",\"role\":\"authenticated\"}',true);"
race() { # $1 = نداءُ الجلسة الأولى (تمسك القفل ثلاث ثوانٍ)، $2 = نداءُ الثانية
  psql "$LOCAL" -X -q -At -c "$AS select $1; select pg_sleep(3); commit;" > "$OUT/a.log" 2>&1 &
  local pa=$!
  python3 -c "import time; time.sleep(1)"
  local t0; t0=$(date +%s.%N)
  psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$AS select $2; commit;" > "$OUT/b.log" 2>&1; RB=$?
  WAITED=$(python3 -c "import sys; print(round(float(sys.argv[2]) - float(sys.argv[1]), 1))" "$t0" "$(date +%s.%N)")
  wait "$pa"; RA=$?
}

race "public.assign_passenger_room(6301, 7302, 7301)" "public.assign_passenger_room(6301, 7303, 7301)"
room="$(q "select room_id from public.passengers where id = 6301")"
if [ "$RA" -eq 0 ] && [ "$RB" -ne 0 ] && grep -q "تغيّر مكانُ الحاجّ" "$OUT/b.log" && [ "$room" = "7302" ]; then
  ok "concurrent A→B and A→C: the second waited ${WAITED}s for the row lock, then was rejected as stale; pilgrim stays in 7302"
else bad "concurrent stale transfer (RA=$RA RB=$RB room=$room)"; cat "$OUT/b.log"; fi

q "update public.passengers set room_id = 7301 where id = 6301" > /dev/null
race "public.assign_passenger_room(6301, 7302, 7301)" "public.assign_passenger_room(6301, 7303)"
room="$(q "select room_id from public.passengers where id = 6301")"
if [ "$RB" -eq 0 ] && [ "$room" = "7303" ]; then
  ok "negative control: the legacy 2-argument call overwrites the concurrent move (7302 → 7303) — the race the new check closes"
else bad "negative control legacy race (RB=$RB room=$room)"; cat "$OUT/b.log"; fi

race "public.assign_passenger_room(6302, 7304, null)" "public.assign_passenger_room(6303, 7304, null)"
occ="$(q "select count(*) from public.passengers where room_id = 7304")"
if [ "$RA" -eq 0 ] && [ "$RB" -ne 0 ] && grep -q "مكتملة" "$OUT/b.log" && [ "$occ" = "1" ]; then
  ok "two sessions on the last bed: one placed, the other rejected (room full) — no overbooking"
else bad "last-bed race (RA=$RA RB=$RB occ=$occ)"; cat "$OUT/b.log"; fi

dups="$(q "select count(*) from (select id from public.passengers group by id having count(*) > 1) x")"
lost="$(q "select count(*) from public.passengers where season_id = 9301")"
if [ "$dups" = "0" ] && [ "$lost" = "3" ]; then ok "no duplicate or lost passenger rows after the races"; else bad "rows after races (dups=$dups count=$lost)"; fi

q "delete from public.passengers where season_id = 9301; delete from public.rooms where season_id = 9301;
   delete from public.hotels where season_id = 9301; delete from public.seasons where id = 9301;
   delete from public.user_profiles where id = '00000000-0000-0000-0000-0000000000d1';
   delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';" > /dev/null
if [ "$(q "select count(*) from public.seasons")" = "0" ]; then ok "concurrency fixture removed"; else bad "cleanup"; fi

echo
echo "m62 tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
