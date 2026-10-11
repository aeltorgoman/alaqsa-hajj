-- ═══════════════════════════════════════════════════════════════
-- MOD-001 / PR 3 — فحوصُ دوالّ الفنادق والبوابة والإعدادات
-- ═══════════════════════════════════════════════════════════════
-- قاعدةٌ محلّيّةٌ مؤقّتةٌ وحدها، بعد `npm run supabase -- db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/verification/mod001/pr3_operations_checks.sql
--
-- ⚠️ يرفض العملَ على قاعدةٍ فيها موسمٌ أو حاجٌّ أو مستخدم، وكلُّ ما يكتبه
--    يُرجَع في آخره (`rollback`).
-- ⚠️ عُرفُ الإخفاق: كلُّ `FAIL` بـSQLSTATE `P0099`، وكلُّ رفضٍ متوقَّعٍ
--    يُلتقط بـSQLSTATE المحدَّد (`42501` · `P0001` · `P0002` · `22023`)،
--    فلا يبتلع معالجٌ إخفاقَ الفحص نفسِه. ورسائلُ `P0001` تُطابَق فوق ذلك.

\set ON_ERROR_STOP on
\set QUIET on
begin;

do $$ begin
  if exists (select 1 from public.seasons) or exists (select 1 from public.passengers)
     or exists (select 1 from auth.users) then
    raise exception 'هذه القاعدةُ ليست فارغة — الفحوصُ للقاعدة المحلّيّة المؤقّتة وحدها.';
  end if;
end $$;

-- ── التهيئة (postgres) ────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'hotel@t.local',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'pass@t.local',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'admins@t.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b4', 'none@t.local',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b5', 'inactive@t.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b6', 'users@t.local',    'authenticated', 'authenticated');
insert into public.user_profiles (id, email, name, permissions, is_active) values
  ('00000000-0000-0000-0000-0000000000b1', 'hotel@t.local',    'فندق فقط',     '{"manage_hotel":true}', true),
  ('00000000-0000-0000-0000-0000000000b2', 'pass@t.local',     'حجّاج فقط',    '{"manage_passengers":true}', true),
  ('00000000-0000-0000-0000-0000000000b3', 'admins@t.local',   'إداريون فقط',  '{"manage_admins":true}', true),
  ('00000000-0000-0000-0000-0000000000b4', 'none@t.local',     'بلا صلاحيات', '{}', true),
  ('00000000-0000-0000-0000-0000000000b5', 'inactive@t.local', 'معطّل',        '{"manage_hotel":true}', false),
  ('00000000-0000-0000-0000-0000000000b6', 'users@t.local',    'مستخدمون',     '{"manage_users":true}', true);

-- الموسمُ المقفل: فندقٌ مشغول (8100/7100/6100) وفندقٌ بغرفةٍ فارغة (8101/7101)
insert into public.seasons (id, name, hijri_year) overriding system value values (9101, 'مقفل', 1400);
insert into public.hotels (id, season_id, name) overriding system value values (8100, 9101, 'مقفل أ'), (8101, 9101, 'مقفل ب');
insert into public.rooms (id, season_id, hotel_id, number, floor, type) overriding system value
  values (7100, 9101, 8100, '1', '1', 'ثنائية'), (7101, 9101, 8101, '2', '1', 'ثنائية');
insert into public.passengers (id, season_id, name_ar, requested_hotel_id, room_id) overriding system value
  values (6100, 9101, 'مقفل ١', 8100, 7100);
update public.seasons set closed_at = now(), closed_by = 't' where id = 9101;

-- المفتوح: بأعمدة الفندق القديمة، وبلا فنادق بعد
insert into public.seasons (id, name, hijri_year, hotel_name, hotel_address, hotel_url) overriding system value
  values (9102, 'مفتوح', 1401, 'فندق قديم', 'عنوان قديم', 'https://old.example');
insert into public.passengers (id, season_id, name_ar, passenger_type, passport, dob, family_id, phone, custom_price) overriding system value values
  (6201, 9102, 'حاج ١', 'حاج', 'T-1', '1980-01-01', 'F1', '0500000001', 0),
  (6202, 9102, 'حاج ٢', 'حاج', 'T-2', '1980-01-02', 'F1', '0500000002', 0),
  (6203, 9102, 'حاج ٣', 'حاج', 'T-3', '1980-01-03', null, '0500000003', 0),
  (6204, 9102, 'حاج ٤', 'حاج', 'T-4', '1980-01-04', null, '0500000004', 0),
  (6205, 9102, 'إداري', 'إداري', 'T-5', '1980-01-05', null, '0500000005', null);

-- الجلساتُ تُصدَر بمسار البوابة الحقيقيّ (anon)
set local role anon;
do $$ begin
  perform set_config('mod001.tok1', public.create_pilgrim_session('T-1', 1, 1, 1980) ->> 'token', true);
  perform set_config('mod001.tok2', public.create_pilgrim_session('T-2', 2, 1, 1980) ->> 'token', true);
  if coalesce(current_setting('mod001.tok1', true), '') = '' or coalesce(current_setting('mod001.tok2', true), '') = '' then
    raise exception 'FAIL — تعذّر إصدارُ جلسات البوابة' using errcode = 'P0099';
  end if;
end $$;
reset role;

-- ═══ أ) البوابة — موسمٌ بلا فنادق: كما اليوم ═══════════════════
set local role anon;
do $$
declare j jsonb := public.get_pilgrim_portal_by_session(current_setting('mod001.tok2'))::jsonb;
begin
  if j -> 'season' ->> 'hotel_name' is distinct from 'فندق قديم'
     or j -> 'season' ->> 'hotel_url' is distinct from 'https://old.example' then
    raise exception 'FAIL — بلا فنادق: season.hotel_* لم تعد من أعمدة الموسم: %', j -> 'season' using errcode = 'P0099';
  end if;
  if j -> 'accommodation' ->> 'status' <> 'none' then
    raise exception 'FAIL — بلا فنادق ولا غرفة: الحالةُ ليست none' using errcode = 'P0099';
  end if;
  if not (j ?& array['pilgrim','bus','room','roommates','family','flight_go','flight_back','season','config','announcements','accommodation']) then
    raise exception 'FAIL — مفتاحٌ قديمٌ غاب من البوابة: %', (select array_agg(k) from jsonb_object_keys(j) k) using errcode = 'P0099';
  end if;
  raise notice 'PASS — البوابة بلا فنادق: المفاتيحُ القديمة كلُّها، وseason.hotel_* من أعمدة الموسم كما اليوم';
end $$;
reset role;

-- ═══ ب) فندقٌ واحد: البوابة والإعداداتُ القديمة ═════════════════
insert into public.hotels (id, season_id, name, address, map_url) overriding system value
  values (8201, 9102, 'فندق ألف', 'العزيزية', 'https://a.example');
update public.passengers set requested_hotel_id = 8201 where id in (6201, 6202, 6203);

set local role anon;
do $$
declare j jsonb := public.get_pilgrim_portal_by_session(current_setting('mod001.tok2'))::jsonb;
begin
  if j -> 'accommodation' ->> 'status' <> 'requested'
     or j -> 'accommodation' -> 'requested_hotel' ->> 'name' <> 'فندق ألف'
     or jsonb_typeof(j -> 'accommodation' -> 'hotel') <> 'null'
     or (j -> 'accommodation' -> 'requested_hotel') ? 'address'
     or (j -> 'accommodation' -> 'requested_hotel') ? 'map_url' then
    raise exception 'FAIL — المطلوبُ لم يُعرض اسماً وحده بلا سكنٍ مؤكَّد: %', j -> 'accommodation' using errcode = 'P0099';
  end if;
  -- التوافق: موسمٌ بفندقٍ واحد ← البوابة الحالية ترى فندقَه كما اليوم
  if j -> 'season' ->> 'hotel_name' is distinct from 'فندق ألف' then
    raise exception 'FAIL — فندقٌ واحد: season.hotel_name ليس فندقَ الموسم' using errcode = 'P0099';
  end if;
  raise notice 'PASS — البوابة (فندقٌ واحد، بلا غرفة): «مطلوب» باسمه وحده، والواجهةُ القديمةُ ترى فندقَ الموسم كما اليوم';
end $$;
reset role;

-- الإعداداتُ القديمة (8 مُعامِلات) تُزامِن الفندقَ الوحيد
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true) as jwt \gset
do $$
declare v_h public.hotels;
begin
  perform public.update_active_season('مفتوح', 'فندق ألف المعدّل', 'عنوان جديد', 'https://new.example', 'منى', null, 'عرفة', null);
  select * into v_h from public.hotels where id = 8201;
  if v_h.name <> 'فندق ألف المعدّل' or v_h.address <> 'عنوان جديد' or v_h.map_url <> 'https://new.example' then
    raise exception 'FAIL — الإعداداتُ القديمة لم تُزامِن الفندقَ الوحيد: %', to_jsonb(v_h) using errcode = 'P0099';
  end if;
  -- الاسمُ الفارغُ لا يمحو اسمَ الفندق، والرابطُ غيرُ http لا يُنقل إليه
  perform public.update_active_season('مفتوح', '', 'عنوان جديد', 'not-a-url', null, null, null, null);
  select * into v_h from public.hotels where id = 8201;
  if v_h.name <> 'فندق ألف المعدّل' or v_h.map_url is not null then
    raise exception 'FAIL — اسمٌ فارغٌ أو رابطٌ غيرُ صالحٍ عُومِل خطأً: %', to_jsonb(v_h) using errcode = 'P0099';
  end if;
  if (select hotel_url from public.seasons where id = 9102) <> 'not-a-url' then
    raise exception 'FAIL — العمودُ القديمُ لم يُحفظ كما كان' using errcode = 'P0099';
  end if;
  update public.hotels set name = 'فندق ألف', map_url = 'https://a.example' where id = 8201;  -- manage_users لا يملكها → صفر صفوف
  raise notice 'PASS — update_active_season القديمة: أعمدةُ الموسم كما كانت + مزامنةُ الفندق الوحيد بأمان';
end $$;
reset role;
update public.hotels set name = 'فندق ألف', map_url = 'https://a.example' where id = 8201;

-- ═══ ج) فندقان وغرف ═════════════════════════════════════════
insert into public.hotels (id, season_id, name) overriding system value values (8202, 9102, 'فندق باء');
insert into public.rooms (id, season_id, hotel_id, number, floor, type) overriding system value values
  (7201, 9102, 8201, '101', '1', 'ثنائية'),
  (7202, 9102, 8201, '102', '1', 'ثنائية'),
  (7203, 9102, 8202, '101', '2', 'رباعية');
update public.passengers set requested_hotel_id = 8202 where id = 6204;

-- ═══ د) assign_passenger_room ═════════════════════════════════
create temporary table mod001_p_before as select id, to_jsonb(p) - 'room_id' as row from public.passengers p;
grant select on mod001_p_before to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true) as jwt \gset
do $$
declare r jsonb; v_msg text;
begin
  r := public.assign_passenger_room(6201, 7201);
  if (r ->> 'hotel_id')::bigint <> 8201 or (r ->> 'room_id')::bigint <> 7201 then
    raise exception 'FAIL — الإسناد: %', r using errcode = 'P0099';
  end if;
  perform public.assign_passenger_room(6202, 7201);
  begin
    perform public.assign_passenger_room(6203, 7201);
    raise exception 'FAIL — حارسُ السعة لم يمنع الثالث' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%مكتملة%' then raise exception 'FAIL — رسالةٌ غير متوقَّعة: %', v_msg using errcode = 'P0099'; end if;
  end;
  -- النقلُ بين الفندقين
  r := public.assign_passenger_room(6201, 7203);
  if (r ->> 'hotel_id')::bigint <> 8202 or (r ->> 'previous_room_id')::bigint <> 7201 then
    raise exception 'FAIL — النقلُ بين الفندقين: %', r using errcode = 'P0099';
  end if;
  -- الإخراج
  r := public.assign_passenger_room(6202, null);
  if r ->> 'room_id' is not null then raise exception 'FAIL — الإخراج' using errcode = 'P0099'; end if;
  -- manage_hotel تُسكِّن الإداريَّ كذلك (الغرفةُ وحدها)
  perform public.assign_passenger_room(6205, 7202);
  raise notice 'PASS — manage_hotel: إسنادٌ ونقلٌ بين فندقين وإخراجٌ وتسكينُ إداريّ، والسعةُ تمنع الزائد';
end $$;

do $$
declare v_msg text; v_n int;
begin
  -- غرفةُ موسمٍ آخر
  begin
    perform public.assign_passenger_room(6204, 7100);
    raise exception 'FAIL — إسنادٌ إلى غرفةِ موسمٍ آخر' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%موسماً آخر%' then raise exception 'FAIL — رسالةٌ غير متوقَّعة: %', v_msg using errcode = 'P0099'; end if;
  end;
  -- حاجُّ موسمٍ مقفل
  begin
    perform public.assign_passenger_room(6100, null);
    raise exception 'FAIL — حاجُّ موسمٍ مقفلٍ أُخرج' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%مقفل%' then raise exception 'FAIL — رسالةٌ غير متوقَّعة: %', v_msg using errcode = 'P0099'; end if;
  end;
  -- غيرُ موجود
  begin
    perform public.assign_passenger_room(999999, 7201);
    raise exception 'FAIL — حاجٌّ معدوم' using errcode = 'P0099';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.assign_passenger_room(6203, 999999);
    raise exception 'FAIL — غرفةٌ معدومة' using errcode = 'P0099';
  exception when sqlstate 'P0001' then null;
  end;
  -- manage_hotel لا تبلغ غيرَ الغرفة: الاسمُ والهاتفُ والسعرُ والخدمةُ والفندقُ المطلوب
  update public.passengers set name_ar = 'تلاعب', phone = '0', custom_price = 1, hotel_type = 'فردية', requested_hotel_id = 8202
   where id = 6203;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL — manage_hotel عدّلت حقولاً شخصيّةً أو ماليّة' using errcode = 'P0099'; end if;
  begin
    insert into public.custom_charges (passenger_id, description, amount, type) values (6203, 'تلاعب', 1, 'خصم');
    raise exception 'FAIL — manage_hotel أضافت بنداً مالياً' using errcode = 'P0099';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.mod001_may_place_passenger('حاج');
    raise exception 'FAIL — الدالّةُ الداخليّة قابلةٌ للتنفيذ' using errcode = 'P0099';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS — الرفض: غرفةُ موسمٍ آخر · موسمٌ مقفل · حاجٌّ وغرفةٌ معدومان · لا حقلَ شخصيٌّ ولا ماليٌّ لـmanage_hotel';
end $$;
reset role;

-- الدالّةُ لم تمسّ إلا room_id
do $$ begin
  if exists (select 1 from public.passengers p join mod001_p_before b on b.id = p.id
              where (to_jsonb(p) - 'room_id') <> b.row) then
    raise exception 'FAIL — assign_passenger_room غيّرت عموداً غيرَ room_id' using errcode = 'P0099';
  end if;
  raise notice 'PASS — assign_passenger_room كتبت room_id وحده';
end $$;

-- الصلاحياتُ القائمة: manage_passengers للحاجّ، manage_admins لغيره
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true) as jwt \gset
do $$
declare v_n int;
begin
  perform public.assign_passenger_room(6203, 7202);
  begin
    perform public.assign_passenger_room(6205, null);
    raise exception 'FAIL — manage_passengers أخرجت إدارياً' using errcode = 'P0099';
  exception when sqlstate '42501' then null;
  end;
  -- المسارُ المباشرُ للواجهة الحاليّة ما زال يعمل
  update public.passengers set room_id = null where id = 6203;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL — المسارُ المباشرُ لـmanage_passengers' using errcode = 'P0099'; end if;
  perform public.assign_passenger_room(6203, 7202);
  raise notice 'PASS — manage_passengers: الحاجُّ بالدالّة وبالمسار المباشر، ولا إداريّ';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true) as jwt \gset
do $$
declare v_n int;
begin
  perform public.assign_passenger_room(6205, 7202);   -- لا تغيير — مقبول
  begin
    perform public.assign_passenger_room(6204, 7201);
    raise exception 'FAIL — manage_admins أسندت حاجّاً' using errcode = 'P0099';
  exception when sqlstate '42501' then null;
  end;
  update public.passengers set room_sort_order = room_sort_order where id = 6205;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL — المسارُ المباشرُ لـmanage_admins' using errcode = 'P0099'; end if;
  raise notice 'PASS — manage_admins: الإداريُّ بالدالّة وبالمسار المباشر، ولا حاجّ';
end $$;
reset role;

-- بلا صلاحيات · معطّل · anon
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin perform public.assign_passenger_room(6204, 7201); raise exception 'FAIL — بلا صلاحيات أسند' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  begin perform public.set_room_order(7202, array[6203, 6205]::bigint[]); raise exception 'FAIL — بلا صلاحيات رتّب' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  begin perform public.delete_hotel(8202); raise exception 'FAIL — بلا صلاحيات حذف فندقاً' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  begin perform public.update_active_season('x', null, null, null, null); raise exception 'FAIL — بلا صلاحيات عدّل الموسم' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  raise notice 'PASS — مستخدمٌ بلا صلاحيات: الدوالُّ الأربعُ مرفوضة (42501)';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b5","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin perform public.assign_passenger_room(6204, 7201); raise exception 'FAIL — حسابٌ معطّل أسند' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  raise notice 'PASS — حسابٌ معطّل بـmanage_hotel: مرفوض';
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.assign_passenger_room(6204, 7201); raise exception 'FAIL — anon نفّذ assign_passenger_room' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  begin perform public.set_room_order(7202, array[6203]::bigint[]); raise exception 'FAIL — anon نفّذ set_room_order' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  begin perform public.delete_hotel(8202); raise exception 'FAIL — anon نفّذ delete_hotel' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  begin perform public.update_active_season('x', null, null, null, null); raise exception 'FAIL — anon نفّذ update_active_season' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  raise notice 'PASS — anon: لا تنفيذَ لأيٍّ من الدوال';
end $$;
reset role;

-- ═══ هـ) set_room_order ════════════════════════════════════════
-- الغرفة 7202 الآن: 6203 (حاجّ) و6205 (إداري)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true) as jwt \gset
do $$
declare v_n int;
begin
  v_n := public.set_room_order(7202, array[6205, 6203]::bigint[]);
  if v_n <> 2 or (select room_sort_order from public.passengers where id = 6205) <> 10
     or (select room_sort_order from public.passengers where id = 6203) <> 20 then
    raise exception 'FAIL — الترتيبُ لم يُكتب (10، 20)' using errcode = 'P0099';
  end if;
  begin perform public.set_room_order(7202, array[6203]::bigint[]); raise exception 'FAIL — قائمةٌ ناقصة قُبلت' using errcode = 'P0099';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.set_room_order(7202, array[6203, 6205, 6201]::bigint[]); raise exception 'FAIL — حاجٌّ من غرفةٍ أخرى قُبل' using errcode = 'P0099';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.set_room_order(7202, array[6203, 6203]::bigint[]); raise exception 'FAIL — تكرارٌ قُبل' using errcode = 'P0099';
  exception when sqlstate '22023' then null; end;
  begin perform public.set_room_order(7202, array[]::bigint[]); raise exception 'FAIL — قائمةٌ فارغة قُبلت' using errcode = 'P0099';
  exception when sqlstate '22023' then null; end;
  begin perform public.set_room_order(7202, array[6203, null]::bigint[]); raise exception 'FAIL — عنصرٌ فارغ قُبل' using errcode = 'P0099';
  exception when sqlstate '22023' then null; end;
  begin perform public.set_room_order(999999, array[6203]::bigint[]); raise exception 'FAIL — غرفةٌ معدومة' using errcode = 'P0099';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.set_room_order(7100, array[6100]::bigint[]); raise exception 'FAIL — غرفةُ موسمٍ مقفلٍ رُتّبت' using errcode = 'P0099';
  exception when sqlstate 'P0001' then null; end;
  raise notice 'PASS — set_room_order: يكتب (i+1)×10، ويرفض الناقصَ والدخيلَ والمكرّرَ والفارغَ والمعدومَ والمقفل';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin perform public.set_room_order(7202, array[6203, 6205]::bigint[]); raise exception 'FAIL — manage_passengers رتّبت غرفةً فيها إداري' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  perform public.set_room_order(7203, array[6201]::bigint[]);   -- غرفةُ حجّاجٍ وحدهم
  raise notice 'PASS — set_room_order بصلاحية الحاجّ: غرفةُ حجّاجٍ نعم، غرفةٌ فيها إداريٌّ لا';
end $$;
reset role;

-- ═══ و) delete_hotel ═════════════════════════════════════════
insert into public.hotels (id, season_id, name) overriding system value values (8203, 9102, 'فندق جيم');
insert into public.rooms (id, season_id, hotel_id, number, floor, type) overriding system value values
  (7204, 9102, 8203, '1', '1', 'ثنائية'), (7205, 9102, 8203, '2', '1', 'ثنائية');
insert into public.hotel_package_prices (hotel_id, season_id, package_key, amount) values (8203, 9102, 'package_double', 100), (8203, 9102, 'package_quad', 50);
update public.passengers set requested_hotel_id = 8203 where id = 6204;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin perform public.delete_hotel(8203); raise exception 'FAIL — manage_passengers حذفت فندقاً' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  raise notice 'PASS — delete_hotel يشترط manage_hotel';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true) as jwt \gset
do $$
declare v_msg text; r jsonb;
begin
  -- مُسكَّن
  begin perform public.delete_hotel(8201); raise exception 'FAIL — حُذف فندقٌ مُسكَّن' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%مُسكَّناً%' then raise exception 'FAIL — رسالةٌ غير متوقَّعة: %', v_msg using errcode = 'P0099'; end if;
  end;
  -- مطلوبٌ بلا مُسكَّن
  begin perform public.delete_hotel(8203); raise exception 'FAIL — حُذف فندقٌ مطلوب' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%مطلوبٌ%' then raise exception 'FAIL — رسالةٌ غير متوقَّعة: %', v_msg using errcode = 'P0099'; end if;
  end;
  if not exists (select 1 from public.hotels where id = 8203) or (select count(*) from public.rooms where hotel_id = 8203) <> 2 then
    raise exception 'FAIL — الرفضُ لم يكن ذرّيّاً' using errcode = 'P0099';
  end if;
  -- فندقُ موسمٍ مقفل (غرفةٌ فارغة) — ث٣
  begin perform public.delete_hotel(8101); raise exception 'FAIL — حُذف فندقُ موسمٍ مقفل' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%مقفل%' then raise exception 'FAIL — رسالةٌ غير متوقَّعة: %', v_msg using errcode = 'P0099'; end if;
  end;
  begin perform public.delete_hotel(999999); raise exception 'FAIL — فندقٌ معدوم' using errcode = 'P0099';
  exception when sqlstate 'P0002' then null; end;
  raise notice 'PASS — delete_hotel يرفض: المُسكَّن · المطلوب · المقفل · المعدوم، ويبقى كلُّ شيءٍ كما كان';
end $$;
reset role;

-- يُرفع الطلبُ عن 8203 (manage_passengers)، ثمّ يُحذف ذرّيّاً
update public.passengers set requested_hotel_id = 8202 where id = 6204;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true) as jwt \gset
do $$
declare r jsonb;
begin
  r := public.delete_hotel(8203);
  if (r ->> 'rooms_deleted')::int <> 2 or (r ->> 'prices_deleted')::int <> 2 then
    raise exception 'FAIL — أعدادُ الحذف: %', r using errcode = 'P0099';
  end if;
  raise notice 'PASS — delete_hotel: فندقٌ بغرفتين فارغتين وسعرين حُذف ذرّيّاً';
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.hotels where id = 8203) or exists (select 1 from public.rooms where hotel_id = 8203)
     or exists (select 1 from public.hotel_package_prices where hotel_id = 8203) then
    raise exception 'FAIL — بقي من الفندق المحذوف شيء' using errcode = 'P0099';
  end if;
  raise notice 'PASS — لا أثرَ للفندق المحذوف في الغرف ولا الأسعار';
end $$;

-- ═══ ز) البوابة — مُسنَدٌ وغيرُ مُسنَدٍ في موسمٍ بفندقين ═══════════
-- 6201 في 7203 (فندق باء، طلبَ ألف) · 6202 بلا غرفة (طلبَ ألف)
set local role anon;
do $$
declare j1 jsonb := public.get_pilgrim_portal_by_session(current_setting('mod001.tok1'))::jsonb;
        j2 jsonb := public.get_pilgrim_portal_by_session(current_setting('mod001.tok2'))::jsonb;
begin
  if j1 -> 'accommodation' ->> 'status' <> 'assigned'
     or j1 -> 'accommodation' -> 'hotel' ->> 'name' <> 'فندق باء'
     or j1 -> 'accommodation' -> 'room' ->> 'number' <> '101'
     or j1 -> 'accommodation' -> 'room' ->> 'floor' <> '2'
     or jsonb_typeof(j1 -> 'accommodation' -> 'requested_hotel') <> 'null' then
    raise exception 'FAIL — المُسنَد لا يرى فندقَ غرفته الفعليّ: %', j1 -> 'accommodation' using errcode = 'P0099';
  end if;
  if j1 -> 'season' ->> 'hotel_name' <> 'فندق باء' or j1 -> 'room' ->> 'number' <> '101' then
    raise exception 'FAIL — المفاتيحُ القديمة للمُسنَد لا تحمل فندقَ غرفته' using errcode = 'P0099';
  end if;
  if (j1 -> 'accommodation' -> 'hotel') ? 'notes' or (j1 -> 'accommodation' -> 'hotel') ? 'sort_order' then
    raise exception 'FAIL — البوابةُ تكشف حقولاً داخليّة للفندق' using errcode = 'P0099';
  end if;
  if j2 -> 'accommodation' ->> 'status' <> 'requested'
     or jsonb_typeof(j2 -> 'accommodation' -> 'hotel') <> 'null'
     or jsonb_typeof(j2 -> 'room') <> 'null'
     or j2 -> 'season' ->> 'hotel_name' is not null then
    raise exception 'FAIL — غيرُ المُسنَد في موسمٍ بفندقين يُرى سكناً مؤكَّداً: %', j2 using errcode = 'P0099';
  end if;
  -- قريبُ العائلة (6202) يرى غرفةَ قريبه بفندقها
  if not exists (select 1 from jsonb_array_elements(j2 -> 'family') f where f ->> 'hotel_name' = 'فندق باء') then
    raise exception 'FAIL — العائلةُ بلا اسم فندق: %', j2 -> 'family' using errcode = 'P0099';
  end if;
  raise notice 'PASS — البوابة: المُسنَد يرى فندقَ غرفته الفعليّ، وغيرُ المُسنَد لا يُعرض له سكنٌ مؤكَّد، والعائلةُ بفنادقها';
end $$;
reset role;

-- ═══ ز٢) غرفةٌ بلا فندقٍ مربوط في موسمٍ بفندقين (مراجعة #217) ═══════
-- الحشوُ المؤقّتُ لا يملأ مع فندقين، فتبقى الغرفةُ بلا فندق. والبوابةُ تقول
-- ذلك صراحةً ولا تزعم «مُسنَداً» بفندقٍ فارغ، ولا تخمّن فندقاً.
insert into public.rooms (id, season_id, number, floor, type) overriding system value
  values (7206, 9102, '301', '3', 'ثنائية');
update public.passengers set room_id = 7206 where id = 6202;
do $$ begin
  if (select hotel_id from public.rooms where id = 7206) is not null then
    raise exception 'FAIL — التهيئة: الغرفةُ رُبطت بفندق' using errcode = 'P0099';
  end if;
end $$;
set local role anon;
do $$
declare j jsonb := public.get_pilgrim_portal_by_session(current_setting('mod001.tok2'))::jsonb;
begin
  if j -> 'accommodation' ->> 'status' <> 'assigned_unlinked'
     or jsonb_typeof(j -> 'accommodation' -> 'hotel') <> 'null'
     or j -> 'accommodation' -> 'room' ->> 'number' <> '301'
     or j -> 'accommodation' -> 'requested_hotel' ->> 'name' <> 'فندق ألف'
     or (j -> 'accommodation' -> 'requested_hotel') ? 'address'
     or j -> 'season' ->> 'hotel_name' is not null then
    raise exception 'FAIL — غرفةٌ بلا فندق لم تُمثَّل صراحةً: %', j -> 'accommodation' using errcode = 'P0099';
  end if;
  raise notice 'PASS — غرفةٌ بلا فندقٍ مربوط: assigned_unlinked بالغرفة، بلا فندقٍ مُخمَّن، والمطلوبُ اسماً وحده';
end $$;
reset role;
update public.passengers set room_id = null where id = 6202;

-- ═══ ز٣) التوافقُ القديمُ لا يحكم على `accommodation` ═════════════
-- موسمٌ بفندقٍ واحد: `season.hotel_*` تُبقي سلوكَ اليوم، و`accommodation`
-- مستقلٌّ عنها: لا فندقَ مؤكَّداً قبل الإسناد.
delete from public.rooms where id = 7206;
update public.passengers set requested_hotel_id = 8201 where id = 6204;
update public.passengers set room_id = null where id in (6201, 6203, 6205);
delete from public.rooms where hotel_id = 8202;
delete from public.hotels where id = 8202;
do $$ begin
  if (select count(*) from public.hotels where season_id = 9102) <> 1 then
    raise exception 'FAIL — التهيئة: الموسمُ ليس بفندقٍ واحد' using errcode = 'P0099';
  end if;
end $$;
set local role anon;
do $$
declare j jsonb := public.get_pilgrim_portal_by_session(current_setting('mod001.tok2'))::jsonb;
begin
  if j -> 'season' ->> 'hotel_name' is distinct from 'فندق ألف' then
    raise exception 'FAIL — season.hotel_* فقدت سلوكَ اليوم' using errcode = 'P0099';
  end if;
  if j -> 'accommodation' ->> 'status' <> 'requested' or jsonb_typeof(j -> 'accommodation' -> 'hotel') <> 'null' then
    raise exception 'FAIL — season.hotel_* تسرّبت إلى accommodation: %', j -> 'accommodation' using errcode = 'P0099';
  end if;
  raise notice 'PASS — season.hotel_* القديمة لا تحكم على accommodation: المطلوبُ يبقى «مطلوباً» بلا فندقٍ مؤكَّد';
end $$;
reset role;
-- يعود الفندقُ الثاني: فحصُ (ح) يحتاج موسماً بفندقين
insert into public.hotels (id, season_id, name) overriding system value values (8202, 9102, 'فندق باء');

-- ═══ ح) الإعداداتُ الجديدة (5 مُعامِلات)، والقديمةُ مع فندقين ═══════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true) as jwt \gset
do $$
declare v_before jsonb := (select jsonb_agg(to_jsonb(h) order by h.id) from public.hotels h where h.season_id = 9102);
        v_s public.seasons;
begin
  v_s := public.update_active_season('مفتوح ٢', 'منى ٢', 'https://mina.example', 'عرفة ٢', null);
  if v_s.name <> 'مفتوح ٢' or v_s.mina_address <> 'منى ٢' or v_s.hotel_url <> 'not-a-url' then
    raise exception 'FAIL — الإعداداتُ الجديدة: %', to_jsonb(v_s) using errcode = 'P0099';
  end if;
  -- القديمةُ مع فندقين: أعمدةُ الموسم تُكتب، والفنادقُ لا تُمسّ (غامض)
  perform public.update_active_season('مفتوح ٢', 'اسمٌ قديم', 'عنوانٌ قديم', 'https://x.example', null, null, null, null);
  if (select jsonb_agg(to_jsonb(h) order by h.id) from public.hotels h where h.season_id = 9102) <> v_before then
    raise exception 'FAIL — الإعداداتُ القديمة مسّت فندقاً والموسمُ بفندقين' using errcode = 'P0099';
  end if;
  raise notice 'PASS — update_active_season الجديدة لا تمسّ الفندق، والقديمةُ لا تُزامِن مع فندقين';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin perform public.update_active_season('x', null, null, null, null); raise exception 'FAIL — manage_hotel عدّلت الموسم (5)' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  begin perform public.update_active_season('x', null, null, null, null, null, null, null); raise exception 'FAIL — manage_hotel عدّلت الموسم (8)' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  raise notice 'PASS — update_active_season بنسختيها تشترط manage_users';
end $$;
reset role;

\echo 'MOD-001 PR 3 — كلُّ الفحوص نجحت. المعاملةُ تُرجَع الآن.'
rollback;
