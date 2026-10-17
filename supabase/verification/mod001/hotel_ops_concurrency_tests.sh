#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# عمليات الفندق — تزامنٌ حقيقيٌّ بجلستين على PostgreSQL
# ════════════════════════════════════════════════════════════
# على قاعدةٍ محلّيّةٍ مؤقّتةٍ وحدها (بعد `db reset` إلى آخر ترحيلة):
#   supabase/verification/mod001/hotel_ops_concurrency_tests.sh
#   LOCAL=postgresql:///db?host=/path/to/socket&port=… …   ← عنقودٌ محلّيٌّ آخر
#
# يُثبت عقدَ القاعدة الذي تبني عليه HotelPage — لا الواجهةَ نفسَها:
#   ١) إسنادٌ أوّل بمصدرٍ متوقَّع (null): موظّفان على الحاجّ نفسِه لغرفتين،
#      وإسنادٌ قديمٌ بعد أن أُسند — والضابطُ السلبيّ: النسخةُ ذاتُ الوسيطين
#      تكتب فوق الأولى (ما كانت الواجهةُ ترسله).
#   ٢) إخراجٌ بمصدرٍ متوقَّع بعد نقلٍ متزامن — وضابطُه السلبيّ.
#   ٣) السريرُ الأخير.
#   ٤) set_room_order: قائمةٌ تغيّر أعضاؤها تُرفض، وترتيبان متزامنان
#      بالأعضاء أنفسِهم يكتب آخرُهما (يُسجَّل سلوكاً لا عيباً يُصلَح هنا).
#   ٥) خفضُ السعة مقابل إسنادٍ متزامن — بالترتيبين، وخاص/قياسيّ/مجلس.
#   ٦) حذفُ الغرفة مقابل إسنادٍ متزامن — بالترتيبين.
#   ٧) الصلاحياتُ والموسم: بلا صلاحية، موسمٌ آخر، موسمٌ مقفل، وكتابةُ
#      الغرف بلا manage_hotel (صفرُ صفوفٍ بلا خطأ — ما يجب أن تكشفه الواجهة).
#
# ⚠️ يرفض أيَّ قاعدةٍ غيرِ محلّيّة، ويحذف كلَّ ما يكتبه.
set -uo pipefail
LOCAL="${LOCAL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$LOCAL" in
  *@127.0.0.1:*|*@localhost:*|postgresql:///*) ;;
  *) echo "يرفض: $LOCAL ليست قاعدةً محلّيّة"; exit 2 ;;
esac
OUT="${OUT:-/tmp/hotel-ops-tests}"; rm -rf "$OUT"; mkdir -p "$OUT"

pass=0; fail=0
ok()  { echo "PASS — $1"; pass=$((pass + 1)); }
bad() { echo "FAIL — $1"; fail=$((fail + 1)); }
q()   { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }

if [ "$(q "select count(*) from public.seasons where id between 9401 and 9403")" != "0" ]; then
  echo "يرفض: مواسمُ التهيئة 9401–9403 موجودةٌ مسبقاً"; exit 2
fi

U_HOTEL=00000000-0000-0000-0000-0000000000e1
U_PASS=00000000-0000-0000-0000-0000000000e2
U_NONE=00000000-0000-0000-0000-0000000000e3
# المواسمُ الأخرى مقفلةٌ (موسمٌ مفتوحٌ واحد)، فتُكتب تهيئتُها بمنفذ الصيانة — للتهيئة وحدها
FIX="begin; set local app.season_maintenance = 'on';"
q "$FIX insert into auth.users (id, email, aud, role) values
     ('$U_HOTEL','hotel-conc@t.local','authenticated','authenticated'),
     ('$U_PASS','pass-conc@t.local','authenticated','authenticated'),
     ('$U_NONE','none-conc@t.local','authenticated','authenticated');
   insert into public.user_profiles (id, email, name, permissions, is_active) values
     ('$U_HOTEL','hotel-conc@t.local','فندق','{\"manage_hotel\":true}',true),
     ('$U_PASS','pass-conc@t.local','حجّاج','{\"manage_passengers\":true}',true),
     ('$U_NONE','none-conc@t.local','بلا','{}',true);
   insert into public.seasons (id, name, hijri_year, closed_at) overriding system value values
     (9401, 'تزامن الفندق', 1451, null), (9402, 'موسم آخر', 1452, now()), (9403, 'موسم مقفل', 1453, now());
   insert into public.hotels (id, season_id, name) overriding system value values
     (8401, 9401, 'فندق أ'), (8402, 9401, 'فندق ب'), (8403, 9402, 'فندق الآخر'), (8404, 9403, 'فندق المقفل'); commit;" > /dev/null

as_user() { echo "begin; set local role authenticated; select set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true);"; }
AS="$(as_user $U_HOTEL)"

# يُعيد الغرفَ والحجّاجَ إلى حالٍ معلومة قبل كلّ سيناريو
reset_fixture() {
  q "$FIX delete from public.passengers where season_id in (9401, 9402, 9403);
     delete from public.rooms where season_id in (9401, 9402, 9403);
     insert into public.rooms (id, season_id, hotel_id, number, floor, type, capacity) overriding system value values
       (7401, 9401, 8401, '1', '1', 'ثنائية', null), (7402, 9401, 8401, '2', '1', 'ثنائية', null),
       (7403, 9401, 8402, '3', '1', 'ثنائية', null), (7404, 9401, 8401, '4', '1', 'فردية', null),
       (7405, 9401, 8401, '5', '1', 'خاص', 3),       (7406, 9401, 8401, '6', '1', 'رباعية', null),
       (7407, 9401, 8401, '7', '1', 'ثنائية', null), (7408, 9402, 8403, '1', '1', 'ثنائية', null),
       (7409, 9403, 8404, '1', '1', 'ثنائية', null);
     insert into public.passengers (id, season_id, name_ar, room_id, passenger_type) overriding system value values
       (6401, 9401, 'حاج ١', null, 'حاج'), (6402, 9401, 'حاج ٢', null, 'حاج'), (6403, 9401, 'حاج ٣', null, 'حاج'),
       (6404, 9401, 'حاج ٤', 7405, 'حاج'), (6405, 9401, 'حاج ٥', 7405, 'حاج'),
       (6406, 9401, 'حاج ٦', 7406, 'حاج'), (6407, 9401, 'حاج ٧', 7406, 'حاج'), (6408, 9401, 'حاج ٨', 7406, 'حاج'),
       (6409, 9401, 'حاج ٩', 7401, 'حاج'), (6410, 9401, 'إداري', null, 'إداري'),
       (6411, 9402, 'حاج الموسم الآخر', null, 'حاج'), (6412, 9403, 'حاج المقفل', null, 'حاج'); commit;" > /dev/null
}

# الجلسةُ الأولى تمسك أقفالها ثلاثَ ثوانٍ؛ الثانيةُ تبدأ بعد ثانيةٍ فتنتظر.
# $1 = SQL الجلسة الأولى، $2 = SQL الثانية. ‏RA/RB = رمزا الخروج، WAITED = انتظارُ الثانية.
race() {
  psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$AS $1; select pg_sleep(3); commit;" > "$OUT/a.log" 2>&1 &
  local pa=$!
  python3 -c "import time; time.sleep(1)"
  local t0; t0=$(date +%s.%N)
  psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$AS $2; commit;" > "$OUT/b.log" 2>&1; RB=$?
  WAITED=$(python3 -c "import sys; print(round(float(sys.argv[2]) - float(sys.argv[1]), 1))" "$t0" "$(date +%s.%N)")
  wait "$pa"; RA=$?
}
waited() { python3 -c "import sys; sys.exit(0 if float(sys.argv[1]) >= 1.5 else 1)" "$WAITED"; }
room_of() { q "select coalesce(room_id::text, 'null') from public.passengers where id = $1"; }
occ() { q "select count(*) from public.passengers where room_id = $1"; }

echo "═══ ١) الإسناد الأوّل بمصدرٍ متوقَّع ═══"
reset_fixture
race "select public.assign_passenger_room(6401, 7401, null)" "select public.assign_passenger_room(6401, 7402, null)"
if [ "$RA" -eq 0 ] && [ "$RB" -ne 0 ] && waited && grep -q "تغيّر مكانُ الحاجّ" "$OUT/b.log" && [ "$(room_of 6401)" = "7401" ]; then
  ok "S1 two operators assign the same unassigned pilgrim to different rooms: B waited ${WAITED}s on the row lock, then rejected stale; pilgrim stays in 7401"
else bad "S1 concurrent first assignment (RA=$RA RB=$RB room=$(room_of 6401) waited=$WAITED)"; cat "$OUT/b.log"; fi

reset_fixture
race "select public.assign_passenger_room(6401, 7401)" "select public.assign_passenger_room(6401, 7402)"
if [ "$RB" -eq 0 ] && [ "$(room_of 6401)" = "7402" ]; then
  ok "S1-neg negative control: the 2-argument call (what HotelPage sent before this fix) silently moves the pilgrim 7401 → 7402"
else bad "S1-neg legacy overwrite (RB=$RB room=$(room_of 6401))"; cat "$OUT/b.log"; fi

reset_fixture
q "$AS select public.assign_passenger_room(6401, 7401, null); commit;" > /dev/null
if ! q "$AS select public.assign_passenger_room(6401, 7402, null); commit;" > "$OUT/s2.log" 2>&1 \
   && grep -q "تغيّر مكانُ الحاجّ" "$OUT/s2.log" && [ "$(room_of 6401)" = "7401" ]; then
  ok "S2 stale assignment after another operator already assigned: rejected (mod001_stale_source), no write"
else bad "S2 stale assignment (room=$(room_of 6401))"; cat "$OUT/s2.log"; fi
hint_txt="$(psql "$LOCAL" -X -q -At -c "$AS do \$\$ declare h text; begin perform public.assign_passenger_room(6401, 7402, null); exception when others then get stacked diagnostics h = pg_exception_hint; raise notice 'HINT=%', h; end \$\$; rollback;" 2>&1 | grep -o 'HINT=[a-z0-9_]*')"
if [ "$hint_txt" = "HINT=mod001_stale_source" ]; then ok "S2 the rejection carries hint mod001_stale_source (what the UI keys its warning on)"; else bad "S2 hint ($hint_txt)"; fi

echo "═══ ٢) الإخراج بمصدرٍ متوقَّع بعد نقلٍ متزامن ═══"
reset_fixture
race "select public.assign_passenger_room(6409, 7402, 7401)" "select public.assign_passenger_room(6409, null, 7401)"
if [ "$RA" -eq 0 ] && [ "$RB" -ne 0 ] && waited && grep -q "تغيّر مكانُ الحاجّ" "$OUT/b.log" && [ "$(room_of 6409)" = "7402" ]; then
  ok "S3 stale removal after a concurrent transfer 7401 → 7402: B waited ${WAITED}s, rejected; pilgrim stays in 7402"
else bad "S3 stale removal (RA=$RA RB=$RB room=$(room_of 6409))"; cat "$OUT/b.log"; fi

reset_fixture
race "select public.assign_passenger_room(6409, 7402, 7401)" "select public.assign_passenger_room(6409, null)"
if [ "$RB" -eq 0 ] && [ "$(room_of 6409)" = "null" ]; then
  ok "S3-neg negative control: the 2-argument removal evicts the pilgrim from 7402, a room the operator never saw"
else bad "S3-neg legacy removal (RB=$RB room=$(room_of 6409))"; cat "$OUT/b.log"; fi

reset_fixture
if q "$AS select public.assign_passenger_room(6409, null, 7401); commit;" > /dev/null 2>&1 && [ "$(room_of 6409)" = "null" ]; then
  ok "S3b removal with the correct expected source succeeds"
else bad "S3b valid removal (room=$(room_of 6409))"; fi

echo "═══ ٣) السرير الأخير ═══"
reset_fixture
race "select public.assign_passenger_room(6401, 7404, null)" "select public.assign_passenger_room(6402, 7404, null)"
if [ "$RA" -eq 0 ] && [ "$RB" -ne 0 ] && waited && grep -q "مكتملة" "$OUT/b.log" && [ "$(occ 7404)" = "1" ]; then
  ok "S4 two operators on the last bed of a single room: B waited ${WAITED}s on the room lock, then rejected (full); occupancy 1/1"
else bad "S4 last bed (RA=$RA RB=$RB occ=$(occ 7404))"; cat "$OUT/b.log"; fi

echo "═══ ٤) ترتيب نزلاء الغرفة ═══"
reset_fixture
race "select public.assign_passenger_room(6401, 7406, null)" "select public.set_room_order(7406, array[6408,6407,6406]::bigint[])"
if [ "$RA" -eq 0 ] && [ "$RB" -ne 0 ] && waited && grep -q "لا تطابق نزلاءَ الغرفة" "$OUT/b.log"; then
  ok "S6a reorder with a stale member list while another operator adds an occupant: waited ${WAITED}s, then rejected; nothing written"
else bad "S6a reorder vs assignment (RA=$RA RB=$RB)"; cat "$OUT/b.log"; fi

reset_fixture
q "$AS select public.set_room_order(7406, array[6406,6407,6408]::bigint[]); commit;" > /dev/null
race "select public.set_room_order(7406, array[6407,6406,6408]::bigint[])" "select public.set_room_order(7406, array[6406,6408,6407]::bigint[])"
order="$(q "select string_agg(id::text, ',' order by room_sort_order) from public.passengers where room_id = 7406")"
if [ "$RA" -eq 0 ] && [ "$RB" -eq 0 ] && waited && [ "$order" = "6406,6408,6407" ]; then
  ok "S6b two concurrent reorders with the same members serialise on the room lock (B waited ${WAITED}s); the last full order wins ($order) — observed contract: no stale-order check (see report)"
else bad "S6b concurrent reorders (RA=$RA RB=$RB order=$order)"; cat "$OUT/a.log" "$OUT/b.log"; fi
dupe="$(q "select count(*) - count(distinct room_sort_order) from public.passengers where room_id = 7406")"
if [ "$dupe" = "0" ]; then ok "S6b final order is a consistent permutation (no duplicated sort positions)"; else bad "S6b duplicated sort positions ($dupe)"; fi

echo "═══ ٥) خفض السعة مقابل إسنادٍ متزامن ═══"
reset_fixture   # 7405 خاص سعة ٣ وفيها اثنان
race "select public.assign_passenger_room(6401, 7405, null)" "update public.rooms set capacity = 2 where id = 7405"
cap="$(q "select capacity from public.rooms where id = 7405")"
if [ "$RA" -eq 0 ] && [ "$RB" -ne 0 ] && waited && grep -q "فلا تُخفَّض سعتها" "$OUT/b.log" && [ "$cap" = "3" ] && [ "$(occ 7405)" = "3" ]; then
  ok "S7a assignment first, capacity 3→2 second: the update waited ${WAITED}s, recounted after commit (3 occupants) and was rejected"
else bad "S7a assign-then-reduce (RA=$RA RB=$RB cap=$cap occ=$(occ 7405))"; cat "$OUT/b.log"; fi

reset_fixture
race "update public.rooms set capacity = 2 where id = 7405" "select public.assign_passenger_room(6401, 7405, null)"
cap="$(q "select capacity from public.rooms where id = 7405")"
if [ "$RA" -eq 0 ] && [ "$RB" -ne 0 ] && waited && grep -q "مكتملة" "$OUT/b.log" && [ "$cap" = "2" ] && [ "$(occ 7405)" = "2" ]; then
  ok "S7b capacity 3→2 first, assignment second: the assignment waited ${WAITED}s, saw capacity 2 and was rejected (full)"
else bad "S7b reduce-then-assign (RA=$RA RB=$RB cap=$cap occ=$(occ 7405))"; cat "$OUT/b.log"; fi

reset_fixture   # 7406 رباعية فيها ثلاثة
race "select public.assign_passenger_room(6401, 7407, null)" "update public.rooms set type = 'ثنائية' where id = 7406"
t="$(q "select type || '/' || capacity from public.rooms where id = 7406")"
if [ "$RB" -ne 0 ] && grep -q "فلا تُخفَّض سعتها" "$OUT/b.log" && [ "$t" = "رباعية/4" ]; then
  ok "S7c standard type رباعية → ثنائية with 3 occupants: rejected by the capacity floor, row unchanged ($t)"
else bad "S7c standard type reduction (RB=$RB row=$t)"; cat "$OUT/b.log"; fi

if ! q "$AS update public.rooms set type = 'مجلس' where id = 7406; commit;" > "$OUT/s7d.log" 2>&1 && grep -q "فلا تُخفَّض سعتها" "$OUT/s7d.log" \
   && [ "$(q "select type from public.rooms where id = 7406")" = "رباعية" ]; then
  ok "S7d occupied room → «مجلس» (capacity 0): rejected"
else bad "S7d majlis with occupants"; cat "$OUT/s7d.log"; fi

if ! q "$AS update public.rooms set type = 'خاص', capacity = 0 where id = 7407; commit;" > "$OUT/s7e.log" 2>&1 && grep -q "تحتاج سعةً صريحة" "$OUT/s7e.log"; then
  ok "S7e «خاص» with capacity 0: rejected (explicit capacity > 0 required)"
else bad "S7e custom capacity zero"; cat "$OUT/s7e.log"; fi

if q "$AS update public.rooms set type = 'فردية', capacity = 9 where id = 7407; commit;" > /dev/null 2>&1 \
   && [ "$(q "select capacity from public.rooms where id = 7407")" = "1" ]; then
  ok "S7f standard type ignores a client-sent capacity (فردية → 1)"
else bad "S7f standard capacity enforcement"; fi

echo "═══ ٦) حذف الغرفة مقابل إسنادٍ متزامن ═══"
reset_fixture
race "select public.assign_passenger_room(6401, 7407, null)" "delete from public.rooms where id = 7407"
exists="$(q "select count(*) from public.rooms where id = 7407")"
if [ "$RA" -eq 0 ] && [ "$RB" -ne 0 ] && waited && grep -q "violates foreign key constraint" "$OUT/b.log" && [ "$exists" = "1" ] && [ "$(room_of 6401)" = "7407" ]; then
  ok "S8a assignment first, delete second: the delete waited ${WAITED}s and was rejected by the FK (ON DELETE RESTRICT); room and pilgrim intact"
else bad "S8a assign-then-delete (RA=$RA RB=$RB exists=$exists room=$(room_of 6401))"; cat "$OUT/b.log"; fi

reset_fixture
race "delete from public.rooms where id = 7407" "select public.assign_passenger_room(6401, 7407, null)"
exists="$(q "select count(*) from public.rooms where id = 7407")"
if [ "$RA" -eq 0 ] && [ "$RB" -ne 0 ] && waited && grep -q "غير موجودة" "$OUT/b.log" && [ "$exists" = "0" ] && [ "$(room_of 6401)" = "null" ]; then
  ok "S8b delete first, assignment second: the assignment waited ${WAITED}s, found the room gone and was rejected; pilgrim stays unassigned"
else bad "S8b delete-then-assign (RA=$RA RB=$RB exists=$exists room=$(room_of 6401))"; cat "$OUT/b.log"; fi

reset_fixture
n="$(psql "$LOCAL" -X -q -At -c "$AS with d as (delete from public.rooms where id = 999999 returning id) select count(*) from d; commit;" 2>&1 | tail -1)"
if [ "$n" = "0" ]; then ok "S8c deleting a room already deleted elsewhere returns 0 rows and no error (the UI must not report success from «no error»)"; else bad "S8c ($n)"; fi

echo "═══ ٧) الصلاحيات والموسم والفندق ═══"
reset_fixture
if ! q "$(as_user $U_NONE) select public.assign_passenger_room(6401, 7401, null); commit;" > "$OUT/p1.log" 2>&1 && grep -q "ليست لديك صلاحية" "$OUT/p1.log" \
   && ! q "$(as_user $U_NONE) select public.assign_passenger_room(6409, null, 7401); commit;" > "$OUT/p1b.log" 2>&1 && grep -q "ليست لديك صلاحية" "$OUT/p1b.log" \
   && [ "$(room_of 6401)" = "null" ] && [ "$(room_of 6409)" = "7401" ]; then
  ok "S10a no permission: assignment and removal with expected source both rejected (42501), nothing written"
else bad "S10a no-permission"; cat "$OUT/p1.log" "$OUT/p1b.log"; fi

if ! q "$(as_user $U_PASS) select public.assign_passenger_room(6410, 7401, null); commit;" > "$OUT/p2.log" 2>&1 && grep -q "صلاحية تسكين هذا الشخص" "$OUT/p2.log" \
   && q "$(as_user $U_PASS) select public.assign_passenger_room(6401, 7402, null); commit;" > /dev/null 2>&1 && [ "$(room_of 6401)" = "7402" ]; then
  ok "S10b manage_passengers: may place a حاج, may not place an إداري (passenger-type rule preserved by the 3-argument path)"
else bad "S10b passenger-type permission"; cat "$OUT/p2.log"; fi

n="$(psql "$LOCAL" -X -q -At -c "$(as_user $U_PASS) with u as (update public.rooms set capacity = 5 where id = 7405 returning id) select count(*) from u; commit;" 2>&1 | tail -1)"
d="$(psql "$LOCAL" -X -q -At -c "$(as_user $U_PASS) with d as (delete from public.rooms where id = 7407 returning id) select count(*) from d; commit;" 2>&1 | tail -1)"
if [ "$n" = "0" ] && [ "$d" = "0" ] && [ "$(q "select capacity from public.rooms where id = 7405")" = "3" ] && [ "$(q "select count(*) from public.rooms where id = 7407")" = "1" ]; then
  ok "S10c rooms update/delete without manage_hotel: RLS filters to 0 rows, no error — the UI must check returned rows"
else bad "S10c rooms RLS (update=$n delete=$d)"; fi

if ! q "$AS select public.assign_passenger_room(6403, 7408, null); commit;" > "$OUT/p3.log" 2>&1 && grep -q "تتبع موسماً آخر" "$OUT/p3.log" && [ "$(room_of 6403)" = "null" ]; then
  ok "S10d season isolation: a room of another season is rejected"
else bad "S10d cross-season"; cat "$OUT/p3.log"; fi

if ! q "$AS select public.assign_passenger_room(6412, 7409, null); commit;" > "$OUT/p4.log" 2>&1 && grep -q "مقفل" "$OUT/p4.log" && [ "$(room_of 6412)" = "null" ]; then
  ok "S10e closed season: assignment rejected"
else bad "S10e closed season"; cat "$OUT/p4.log"; fi

if q "$AS select public.assign_passenger_room(6409, 7403, 7401); commit;" > /dev/null 2>&1 && [ "$(room_of 6409)" = "7403" ]; then
  ok "S10f atomic transfer to another hotel of the same season with the expected source still works"
else bad "S10f cross-hotel transfer (room=$(room_of 6409))"; fi

if ! q "insert into public.rooms (season_id, hotel_id, number, floor, type) values (9401, 8401, '1', '1', 'ثنائية')" > "$OUT/p5.log" 2>&1 \
   && q "insert into public.rooms (season_id, hotel_id, number, floor, type) values (9401, 8402, '1', '1', 'ثنائية')" > /dev/null 2>&1; then
  ok "S10g hotel isolation: room number unique within a hotel, allowed across hotels"
else bad "S10g room uniqueness"; cat "$OUT/p5.log"; fi

dups="$(q "select count(*) from (select id from public.passengers group by id having count(*) > 1) x")"
over="$(q "select count(*) from public.rooms r where r.season_id = 9401 and r.capacity is not null and (select count(*) from public.passengers p where p.room_id = r.id) > r.capacity")"
if [ "$dups" = "0" ] && [ "$over" = "0" ]; then ok "no duplicated pilgrim rows and no room above capacity after all scenarios"; else bad "integrity (dups=$dups over=$over)"; fi

q "$FIX delete from public.passengers where season_id in (9401, 9402, 9403);
   delete from public.rooms where season_id in (9401, 9402, 9403);
   delete from public.hotels where season_id in (9401, 9402, 9403);
   delete from public.seasons where id in (9401, 9402, 9403);
   delete from public.user_profiles where id in ('$U_HOTEL','$U_PASS','$U_NONE');
   delete from auth.users where id in ('$U_HOTEL','$U_PASS','$U_NONE'); commit;" > /dev/null
if [ "$(q "select count(*) from public.seasons where id between 9401 and 9403")" = "0" ]; then ok "fixture removed"; else bad "cleanup"; fi

echo
echo "hotel ops tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
