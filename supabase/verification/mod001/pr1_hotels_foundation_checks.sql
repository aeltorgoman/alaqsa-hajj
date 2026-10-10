-- ═══════════════════════════════════════════════════════════════
-- MOD-001 / PR 1 — فحوصُ أساس الفنادق (قاعدةٌ محلّيّةٌ مؤقّتةٌ وحدها)
-- ═══════════════════════════════════════════════════════════════
-- التشغيل — بعد `npm run supabase -- db reset` على المكدّس المحلّيّ:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/verification/mod001/pr1_hotels_foundation_checks.sql
--
-- ⚠️ يرفض العملَ على قاعدةٍ فيها موسمٌ أو حاجٌّ أو مستخدم: لا يُشغَّل
--    على الإنتاج ولا على بيئة الاختبار. وكلُّ ما يكتبه داخل معاملةٍ
--    واحدةٍ تُرجَع في آخره (`rollback`) — لا يبقى منه صفّ.
--
-- كلُّ فحصٍ يطبع `PASS — …`، وأيُّ إخفاقٍ يرفع استثناءً فيتوقّف الملفّ.
-- الأدوار تُحاكى كما يصلها PostgREST: `set local role authenticated`
-- ومطالبُ JWT في `request.jwt.claims`، فتسري RLS والمِنَح كما في التطبيق.

-- ⚠️ عُرفُ الإخفاق: كلُّ `FAIL` يُرفع بـSQLSTATE `P0099` المخصَّص، لا بـ`P0001`
--    (`raise_exception`). فالمعالجُ الذي ينتظر رفضَ حارسٍ (`when raise_exception`
--    مع فحص نصّ الرسالة) لا يستطيع أن يبتلع إخفاقَ الفحص نفسِه مهما تشابه النصّ.

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- ── حارسُ الهدف ──────────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.seasons) or exists (select 1 from public.passengers)
     or exists (select 1 from auth.users) then
    raise exception 'هذه القاعدةُ ليست فارغة — الفحوصُ للقاعدة المحلّيّة المؤقّتة وحدها.';
  end if;
end $$;

-- ── التهيئة (postgres) ────────────────────────────────────────
-- مواسم: ١٤٠٠ يُملأ ثمّ يُقفل · ١٤٠١ مفتوح.
insert into public.seasons (id, name, hijri_year) overriding system value
  values (9001, 'موسم اختبار مقفل', 1400);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'all@test.local',      'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'hotel@test.local',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'pay@test.local',      'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'none@test.local',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'inactive@test.local', 'authenticated', 'authenticated');
insert into public.user_profiles (id, email, name, permissions, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'all@test.local', 'كل الصلاحيات',
     '{"manage_hotel":true,"manage_passengers":true,"manage_payments":true,"manage_admins":true}', true),
  ('00000000-0000-0000-0000-0000000000a2', 'hotel@test.local', 'فندق فقط', '{"manage_hotel":true}', true),
  ('00000000-0000-0000-0000-0000000000a3', 'pay@test.local', 'مالية فقط', '{"manage_payments":true}', true),
  ('00000000-0000-0000-0000-0000000000a4', 'none@test.local', 'بلا صلاحيات', '{}', true),
  ('00000000-0000-0000-0000-0000000000a5', 'inactive@test.local', 'معطّل', '{"manage_hotel":true}', false);

-- الموسمُ المقفل: فندقٌ وأسعارٌ وغرفةٌ وحاجّان، ثمّ يُقفل
insert into public.hotels (id, season_id, name, address, map_url) overriding system value
  values (8001, 9001, 'فندق المقفل', 'عنوان', 'https://maps.example/a');
insert into public.hotel_package_prices (hotel_id, season_id, package_key, amount)
  values (8001, 9001, 'package_double', 5000), (8001, 9001, 'package_quad', 3000);
insert into public.rooms (id, season_id, hotel_id, number, floor, type) overriding system value
  values (7001, 9001, 8001, '101', '1', 'ثنائية');
insert into public.passengers (id, season_id, name_ar, requested_hotel_id, room_id) overriding system value
  values (6001, 9001, 'حاج مقفل ١', 8001, 7001), (6002, 9001, 'حاج مقفل ٢', 8001, null);
update public.seasons set closed_at = now(), closed_by = 'test' where id = 9001;

insert into public.seasons (id, name, hijri_year) overriding system value
  values (9002, 'موسم اختبار مفتوح', 1401);

do $$ begin
  if public.active_season_id() <> 9002 then raise exception 'FAIL — الموسم النشط ليس 9002' using errcode = 'P0099'; end if;
  raise notice 'PASS — التهيئة: موسمٌ مقفلٌ بفندقه وموسمٌ مفتوحٌ بلا فنادق';
end $$;

-- ═══ أ) التعبئة الافتراضية — صفرُ فنادق في الموسم ═══════════════
-- كما تُدرِج الواجهةُ الحاليةُ: بلا موسمٍ ولا فندق.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true) as jwt \gset
do $$
declare v_room bigint; v_pid bigint; v_h bigint;
begin
  insert into public.rooms (number, floor, type, capacity) values ('Z1', '9', 'ثنائية', null)
    returning id, hotel_id into v_room, v_h;
  if v_h is not null then raise exception 'FAIL — غرفةٌ عُبّئ فندقُها وفي الموسم صفرُ فنادق' using errcode = 'P0099'; end if;
  insert into public.passengers (name_ar, hotel_type, hotel_view) values ('حاج بلا فندق', 'ثنائية', 'غير مطلة')
    returning id, requested_hotel_id into v_pid, v_h;
  if v_h is not null then raise exception 'FAIL — حاجٌّ عُبّئ فندقُه وفي الموسم صفرُ فنادق' using errcode = 'P0099'; end if;
  -- يُحذفان: لا يدخلان بقيّة الفحوص
  delete from public.passengers where id = v_pid;
  delete from public.rooms where id = v_room;
  raise notice 'PASS — صفرُ فنادق: الغرفةُ والحاجُّ يبقيان بلا فندق، والإدراجُ ينجح';
end $$;
reset role;

-- ═══ ب) RLS والمِنَح على hotels ═════════════════════════════════
-- مستخدمٌ بلا manage_hotel لا يُنشئ فندقاً
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin
    insert into public.hotels (name) values ('محاولة بلا صلاحية');
    raise exception 'FAIL — مستخدمٌ بلا صلاحيات أنشأ فندقاً' using errcode = 'P0099';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS — بلا صلاحيات: إنشاءُ الفندق مرفوض (42501)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin
    insert into public.hotels (name) values ('محاولة حسابٍ معطّل');
    raise exception 'FAIL — حسابٌ معطّل أنشأ فندقاً' using errcode = 'P0099';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.hotels) <> 0 then raise exception 'FAIL — حسابٌ معطّل يرى الفنادق' using errcode = 'P0099'; end if;
  raise notice 'PASS — حسابٌ معطّل: لا إنشاءَ ولا قراءة';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin
    insert into public.hotels (name) values ('محاولة المالية');
    raise exception 'FAIL — manage_payments وحدها أنشأت فندقاً' using errcode = 'P0099';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS — manage_payments وحدها: إنشاءُ الفندق مرفوض';
end $$;
reset role;

-- manage_hotel وحدها تُنشئ الفندقَ الأوّل في الموسم المفتوح
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true) as jwt \gset
do $$
declare v_id bigint; v_season bigint; v_city text;
begin
  insert into public.hotels (name, address, map_url) values ('فندق ألف', 'مكة', 'https://maps.example/alef')
    returning id, season_id, city into v_id, v_season, v_city;
  if v_season <> 9002 or v_city <> 'مكة' then raise exception 'FAIL — الافتراضاتُ خاطئة: % %', v_season, v_city using errcode = 'P0099'; end if;
  perform set_config('mod001.h1', v_id::text, true);
  raise notice 'PASS — manage_hotel: أنشأت فندقاً، بموسمٍ نشطٍ ومدينة «مكة» افتراضاً';
end $$;
do $$
declare v_n integer;
begin
  update public.hotels set notes = 'ملاحظة' where id = current_setting('mod001.h1')::bigint;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL — manage_hotel لم تعدّل الفندق' using errcode = 'P0099'; end if;
  begin
    delete from public.hotels where id = current_setting('mod001.h1')::bigint;
    raise exception 'FAIL — حذفٌ مباشرٌ للفندق مرّ من PostgREST' using errcode = 'P0099';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS — manage_hotel: تعدّل الفندق، والحذفُ المباشرُ مرفوض (لا مِنحةَ حذف)';
end $$;
reset role;

-- مستخدمٌ نشطٌ بلا صلاحيات يقرأ ولا يعدّل
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true) as jwt \gset
do $$
declare v_n integer;
begin
  if (select count(*) from public.hotels where id = current_setting('mod001.h1')::bigint) <> 1 then
    raise exception 'FAIL — الموظّفُ النشطُ لا يرى الفندق' using errcode = 'P0099';
  end if;
  update public.hotels set name = 'تلاعب' where id = current_setting('mod001.h1')::bigint;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL — مستخدمٌ بلا صلاحيات عدّل الفندق' using errcode = 'P0099'; end if;
  raise notice 'PASS — موظّفٌ بلا صلاحيات: يقرأ، والتعديلُ يُصيب صفرَ صفوف';
end $$;
reset role;

-- anon لا يبلغ الجدولين أصلاً
set local role anon;
do $$ begin
  begin
    perform 1 from public.hotels;
    raise exception 'FAIL — anon قرأ hotels' using errcode = 'P0099';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.hotel_package_prices;
    raise exception 'FAIL — anon قرأ hotel_package_prices' using errcode = 'P0099';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS — anon: لا صلاحيةَ على الجدولين';
end $$;
reset role;

-- ═══ ج) قيودُ الفندق والتفرّد ═══════════════════════════════════
do $$ begin
  begin
    insert into public.hotels (name) values ('فندق ألف ');   -- مسافةٌ زائدة
    raise exception 'FAIL — اسمٌ مكرّرٌ في الموسم نفسه' using errcode = 'P0099';
  exception when unique_violation then null;
  end;
  begin
    insert into public.hotels (name) values ('   ');
    raise exception 'FAIL — اسمٌ فارغ' using errcode = 'P0099';
  exception when check_violation then null;
  end;
  begin
    insert into public.hotels (name, city) values ('فندق المدينة', 'المدينة');
    raise exception 'FAIL — مدينةٌ غير معتمَدة' using errcode = 'P0099';
  exception when check_violation then null;
  end;
  begin
    insert into public.hotels (name, map_url) values ('فندق رابط', 'javascript:alert(1)');
    raise exception 'FAIL — رابطٌ ليس http(s)' using errcode = 'P0099';
  exception when check_violation then null;
  end;
  raise notice 'PASS — القيود: تفرّدُ الاسم في الموسم (مع المسافات) · الاسمُ الفارغ · المدينة · الرابط';
end $$;

-- الاسمُ نفسُه في موسمٍ آخر مسموح (الموسمُ المقفل فيه «فندق المقفل»)
do $$ begin
  insert into public.hotels (name) values ('فندق المقفل');
  raise notice 'PASS — الاسمُ فريدٌ في الموسم لا في النظام كلّه';
end $$;

-- ═══ د) التعبئة الافتراضية — فندقٌ واحدٌ بالضبط ═════════════════
-- (فندقان الآن في 9002؟ لا: «فندق المقفل» الثاني أُدرج للتوّ. نحذفه
--  أوّلاً لنختبر حالة الواحد ثمّ نعيد الاثنين.)
delete from public.hotels where season_id = 9002 and name = 'فندق المقفل';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true) as jwt \gset
do $$
declare v_h1 bigint := current_setting('mod001.h1')::bigint; v_h bigint; v_id bigint;
begin
  -- غرفةٌ مفردة كما تُدرِجها `HotelPage.addRoom`
  insert into public.rooms (number, floor, type, capacity, notes) values ('101', '1', 'ثنائية', null, null)
    returning id, hotel_id into v_id, v_h;
  if v_h is distinct from v_h1 then raise exception 'FAIL — الغرفةُ لم تُعبَّأ بالفندق الوحيد' using errcode = 'P0099'; end if;
  perform set_config('mod001.r101', v_id::text, true);
  -- نطاقٌ كما تُدرِجه `addRoomRange` (دفعةٌ واحدة)
  insert into public.rooms (number, floor, type, capacity)
    values ('102', '1', 'ثلاثية', null), ('103', '1', 'رباعية', null), ('104', '1', 'خاص', 6);
  if exists (select 1 from public.rooms where season_id = 9002 and hotel_id is distinct from v_h1) then
    raise exception 'FAIL — في النطاق غرفةٌ بلا الفندق الوحيد' using errcode = 'P0099';
  end if;
  -- فندقٌ صريحٌ يُحترَم ولا يُستبدَل
  insert into public.rooms (number, floor, type, hotel_id) values ('105', '1', 'فردية', v_h1) returning hotel_id into v_h;
  if v_h <> v_h1 then raise exception 'FAIL — الفندقُ الصريحُ استُبدِل' using errcode = 'P0099'; end if;

  -- حاجٌّ كما يُدرِجه التسجيلُ اليدويّ / المسح
  insert into public.passengers (name_ar, hotel_type, hotel_view, bus, flight, camp_mina, camp_arafa)
    values ('حاج ١', 'ثنائية', 'غير مطلة', 'عادي', 'عادي', 'عادي', 'عادي')
    returning id, requested_hotel_id into v_id, v_h;
  if v_h is distinct from v_h1 then raise exception 'FAIL — الحاجُّ لم يُعبَّأ فندقُه المطلوب' using errcode = 'P0099'; end if;
  perform set_config('mod001.p1', v_id::text, true);
  insert into public.passengers (name_ar, hotel_type) values ('حاج ٢', 'ثنائية') returning id into v_id;
  perform set_config('mod001.p2', v_id::text, true);
  insert into public.passengers (name_ar, hotel_type) values ('حاج ٣', 'ثنائية') returning id into v_id;
  perform set_config('mod001.p3', v_id::text, true);

  -- الإداريُّ لا يُعبَّأ له فندقٌ مطلوب (D7)
  insert into public.passengers (name_ar, passenger_type) values ('إداري', 'إداري')
    returning requested_hotel_id into v_h;
  if v_h is not null then raise exception 'FAIL — الإداريُّ عُبّئ له فندقٌ مطلوب' using errcode = 'P0099'; end if;
  raise notice 'PASS — فندقٌ واحد: الغرفةُ والنطاقُ والحاجُّ يُعبَّأون، والصريحُ يُحترَم، والإداريُّ لا يُعبَّأ';
end $$;
reset role;

-- ═══ هـ) مساراتُ الواجهة الحالية — بلا تغيير ═══════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true) as jwt \gset
do $$
declare
  v_room bigint := current_setting('mod001.r101')::bigint;
  v_p1 bigint := current_setting('mod001.p1')::bigint;
  v_p2 bigint := current_setting('mod001.p2')::bigint;
  v_p3 bigint := current_setting('mod001.p3')::bigint;
  v_n integer;
begin
  -- الإسناد (`assignToRoom`) والترتيب (`reorderRoom`) والإخراج (`removeFromRoom`)
  update public.passengers set room_id = v_room where id = v_p1;
  update public.passengers set room_id = v_room where id = v_p2;
  update public.passengers set room_sort_order = 1 where id = v_p2;
  update public.passengers set room_sort_order = 2 where id = v_p1;
  -- حارسُ السعة القائم: ثنائيةٌ لا تتّسع لثالث
  begin
    update public.passengers set room_id = v_room where id = v_p3;
    raise exception 'FAIL — حارسُ السعة لم يمنع الثالث' using errcode = 'P0099';
  exception when raise_exception then
    if sqlerrm not like '%مكتملة%' then raise; end if;
  end;
  update public.passengers set room_id = null where id = v_p2;
  -- تعديلُ الملاحظات والنوع والرقم (`saveNotes` · `saveRoomCapacity` · `saveRoomNumber`)
  update public.rooms set notes = 'ملاحظة' where id = v_room;
  update public.rooms set type = 'رباعية', capacity = null where id = v_room;
  update public.rooms set number = '101A' where id = v_room;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL — تعديلُ رقم الغرفة' using errcode = 'P0099'; end if;
  -- رسالةُ التكرار القديمة باقية: الفهرسُ على الموسم يمنع الرقمَ نفسَه في الدور
  begin
    insert into public.rooms (number, floor, type) values ('102', '1', 'ثنائية');
    raise exception 'FAIL — رقمٌ مكرّرٌ في الدور مرّ' using errcode = 'P0099';
  exception when unique_violation then
    if sqlerrm not like '%rooms_season_floor_number_uniq%' and sqlerrm not like '%rooms_hotel_floor_number_uniq%' then raise; end if;
  end;
  -- حذفُ غرفةٍ فارغة (`deleteRoom`)
  delete from public.rooms where number = '105' and season_id = 9002;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL — حذفُ غرفةٍ فارغة' using errcode = 'P0099'; end if;
  -- قراءةُ الغرف كما في `HotelPage` (`select *`)
  if (select count(*) from public.rooms where season_id = 9002) <> 4 then raise exception 'FAIL — قراءةُ الغرف' using errcode = 'P0099'; end if;
  raise notice 'PASS — الواجهة الحالية: إسنادٌ وترتيبٌ وإخراجٌ وتعديلٌ وحذفٌ وقراءة كما كانت، وحارسُ السعة فعّال';
end $$;
reset role;

-- حذفُ غرفةٍ مشغولة ممنوعٌ كما كان (المفتاح restrict)
do $$ begin
  begin
    delete from public.rooms where id = current_setting('mod001.r101')::bigint;
    raise exception 'FAIL — حُذفت غرفةٌ مشغولة' using errcode = 'P0099';
  exception when foreign_key_violation then null;
  end;
  raise notice 'PASS — غرفةٌ مشغولة لا تُحذف';
end $$;

-- ═══ و) اتّساقُ الموسم بالمفتاح المركّب (M-86) ══════════════════
do $$
declare v_h1 bigint := current_setting('mod001.h1')::bigint;
begin
  -- غرفةٌ في الموسم المفتوح بفندقِ الموسم المقفل
  begin
    insert into public.rooms (season_id, hotel_id, number, floor, type) values (9002, 8001, '900', '9', 'ثنائية');
    raise exception 'FAIL — غرفةٌ بفندقِ موسمٍ آخر' using errcode = 'P0099';
  exception when foreign_key_violation then null;
  end;
  -- حاجٌّ في الموسم المفتوح يطلب فندقَ الموسم المقفل
  begin
    insert into public.passengers (season_id, name_ar, requested_hotel_id) values (9002, 'عابر', 8001);
    raise exception 'FAIL — حاجٌّ يطلب فندقَ موسمٍ آخر' using errcode = 'P0099';
  exception when foreign_key_violation then null;
  end;
  -- الطرفان التاليان يقعان على الموسم المقفل 9001، وحارسُ ث٣ يسبق
  -- المفتاحَ هناك. فتُفتح رايةُ الصيانة **في هذه الكتلة وحدها** ليُختبَر
  -- المفتاحُ المركّبُ نفسُه لا الحارس، ثمّ تُغلق.
  perform set_config('app.season_maintenance', 'on', true);
  -- سعرٌ بموسمٍ يخالف موسمَ فندقه
  begin
    insert into public.hotel_package_prices (hotel_id, season_id, package_key, amount) values (v_h1, 9001, 'package_double', 1);
    raise exception 'FAIL — سعرٌ بموسمٍ يخالف فندقه' using errcode = 'P0099';
  exception when foreign_key_violation then null;
  end;
  -- نقلُ فندقٍ له غرفٌ وطلباتٌ إلى موسمٍ آخر
  begin
    update public.hotels set season_id = 9001 where id = v_h1;
    raise exception 'FAIL — نُقل فندقٌ له توابع' using errcode = 'P0099';
  exception when foreign_key_violation then null;
  end;
  perform set_config('app.season_maintenance', 'off', true);
  raise notice 'PASS — المفتاحُ المركّب: لا غرفةَ ولا طلبَ ولا سعرَ عبر المواسم، ولا نقلَ لفندقٍ له توابع';
end $$;

-- حارسُ الغرفة عبر المواسم القائم ما زال فعّالاً
do $$ begin
  begin
    update public.passengers set room_id = 7001 where id = current_setting('mod001.p3')::bigint;
    raise exception 'FAIL — حاجٌّ أُسند إلى غرفةِ موسمٍ آخر' using errcode = 'P0099';
  exception when raise_exception then
    if sqlerrm not like '%موسماً آخر%' then raise; end if;
  end;
  raise notice 'PASS — reject_cross_season_room باقٍ فعّالاً';
end $$;

-- ═══ ز) أسعارُ الباقات ═══════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin
    insert into public.hotel_package_prices (hotel_id, package_key, amount)
      values (current_setting('mod001.h1')::bigint, 'package_double', 4500);
    raise exception 'FAIL — manage_hotel وحدها كتبت سعراً' using errcode = 'P0099';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS — manage_hotel وحدها: كتابةُ السعر مرفوضة';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true) as jwt \gset
do $$
declare v_h1 bigint := current_setting('mod001.h1')::bigint; v_n integer;
begin
  insert into public.hotel_package_prices (hotel_id, package_key, amount)
    values (v_h1, 'package_double', 4500), (v_h1, 'package_quad', 0);   -- الصفرُ قيمةٌ صالحة
  update public.hotel_package_prices set amount = 4600 where hotel_id = v_h1 and package_key = 'package_double';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL — manage_payments لم تعدّل السعر' using errcode = 'P0099'; end if;
  begin
    insert into public.hotel_package_prices (hotel_id, package_key, amount) values (v_h1, 'package_triple', -1);
    raise exception 'FAIL — سعرٌ سالب' using errcode = 'P0099';
  exception when check_violation then null;
  end;
  begin
    insert into public.hotel_package_prices (hotel_id, package_key, amount) values (v_h1, 'addon_view', 100);
    raise exception 'FAIL — مفتاحٌ ليس باقة' using errcode = 'P0099';
  exception when check_violation then null;
  end;
  delete from public.hotel_package_prices where hotel_id = v_h1 and package_key = 'package_quad';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL — manage_payments لم تحذف السعر' using errcode = 'P0099'; end if;
  raise notice 'PASS — manage_payments: تكتب وتعدّل وتحذف، والصفرُ مقبول، والسالبُ ومفاتيحُ غير الباقات مرفوضة';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true) as jwt \gset
do $$
declare v_n integer;
begin
  if (select count(*) from public.hotel_package_prices where hotel_id = current_setting('mod001.h1')::bigint) <> 1 then raise exception 'FAIL — الموظّفُ النشطُ لا يقرأ الأسعار' using errcode = 'P0099'; end if;
  update public.hotel_package_prices set amount = 1;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL — مستخدمٌ بلا صلاحيات عدّل سعراً' using errcode = 'P0099'; end if;
  raise notice 'PASS — موظّفٌ بلا صلاحيات: يقرأ الأسعار ولا يعدّلها';
end $$;
reset role;

-- ═══ ح) ث٣ — الموسمُ المقفل لا يُكتب فيه ═══════════════════════
do $$ begin
  begin
    insert into public.hotels (season_id, name) values (9001, 'فندقٌ متأخّر');
    raise exception 'FAIL — فندقٌ أُضيف إلى موسمٍ مقفل' using errcode = 'P0099';
  exception when raise_exception then if sqlerrm not like '%مقفل%' then raise; end if;
  end;
  begin
    update public.hotels set name = 'تعديلٌ متأخّر' where id = 8001;
    raise exception 'FAIL — فندقُ موسمٍ مقفل عُدّل' using errcode = 'P0099';
  exception when raise_exception then if sqlerrm not like '%مقفل%' then raise; end if;
  end;
  begin
    delete from public.hotel_package_prices where hotel_id = 8001;
    raise exception 'FAIL — سعرٌ في موسمٍ مقفل حُذف' using errcode = 'P0099';
  exception when raise_exception then if sqlerrm not like '%مقفل%' then raise; end if;
  end;
  begin
    insert into public.hotel_package_prices (hotel_id, season_id, package_key, amount) values (8001, 9001, 'package_suite', 1);
    raise exception 'FAIL — سعرٌ أُضيف إلى موسمٍ مقفل' using errcode = 'P0099';
  exception when raise_exception then if sqlerrm not like '%مقفل%' then raise; end if;
  end;
  begin
    update public.rooms set hotel_id = null where id = 7001;
    raise exception 'FAIL — غرفةُ موسمٍ مقفل عُدّلت' using errcode = 'P0099';
  exception when raise_exception then if sqlerrm not like '%مقفل%' then raise; end if;
  end;
  raise notice 'PASS — ث٣: لا إضافةَ ولا تعديلَ ولا حذفَ في فنادق الموسم المقفل وأسعارِه وغرفِه';
end $$;

-- ═══ ط) التعبئة الافتراضية — أكثرُ من فندق ══════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true) as jwt \gset
do $$
declare v_h bigint; v_h2 bigint;
begin
  insert into public.hotels (name) values ('فندق باء') returning id into v_h2;
  insert into public.rooms (number, floor, type) values ('201', '2', 'ثنائية') returning hotel_id into v_h;
  if v_h is not null then raise exception 'FAIL — عُبّئت غرفةٌ والموسمُ فيه فندقان' using errcode = 'P0099'; end if;
  insert into public.passengers (name_ar, hotel_type) values ('حاج ٤', 'ثنائية') returning requested_hotel_id into v_h;
  if v_h is not null then raise exception 'FAIL — عُبّئ حاجٌّ والموسمُ فيه فندقان' using errcode = 'P0099'; end if;
  -- والفندقُ الصريحُ ما زال مقبولاً، وتفرّدُ الفندق يعمل
  insert into public.rooms (number, floor, type, hotel_id) values ('301', '3', 'ثنائية', v_h2);
  raise notice 'PASS — فندقان: لا تعبئةَ (الغموضُ لا يُخمَّن)، والصريحُ مقبول';
end $$;
reset role;

-- الفهرسُ الجديدُ على الفندق — مستقلّاً عن القديم. القديمُ على الموسم
-- يُسقَط هنا **داخل المعاملة وحدها** (تُرجَع في آخر الملف) ليُرى ما
-- سيكون بعد التشديد: التكرارُ داخل الفندق ممنوع، والرقمُ نفسُه في
-- فندقين مسموح.
drop index public.rooms_season_floor_number_uniq;
do $$
declare v_h1 bigint := current_setting('mod001.h1')::bigint; v_h2 bigint;
begin
  select hotel_id into v_h2 from public.rooms where number = '301' and season_id = 9002;
  begin
    insert into public.rooms (season_id, hotel_id, number, floor, type) values (9002, v_h2, '301', '3', 'ثنائية');
    raise exception 'FAIL — تكرارٌ داخل الفندق مرّ' using errcode = 'P0099';
  exception when unique_violation then
    if sqlerrm not like '%rooms_hotel_floor_number_uniq%' then raise; end if;
  end;
  insert into public.rooms (season_id, hotel_id, number, floor, type) values (9002, v_h1, '301', '3', 'ثنائية');
  raise notice 'PASS — rooms_hotel_floor_number_uniq وحده: التكرارُ داخل الفندق ممنوع، والرقمُ نفسُه في فندقين مسموح';
end $$;

-- ═══ ي) delete_season — يُصرِّف الفنادقَ والأسعارَ ويعدّها ════════
do $$
declare v_counts jsonb;
begin
  perform public.delete_season(9001, '00000000-0000-0000-0000-0000000000a1');
  if exists (select 1 from public.hotels where season_id = 9001)
     or exists (select 1 from public.hotel_package_prices where season_id = 9001)
     or exists (select 1 from public.rooms where season_id = 9001)
     or exists (select 1 from public.passengers where season_id = 9001)
     or exists (select 1 from public.seasons where id = 9001) then
    raise exception 'FAIL — بقي من الموسم المحذوف شيء' using errcode = 'P0099';
  end if;
  select new_value -> 'deleted_counts' into v_counts
    from public.audit_log where table_name = 'seasons' and row_id = '9001' and action = 'delete'
   order by id desc limit 1;
  if (v_counts ->> 'hotels')::int <> 1 or (v_counts ->> 'hotel_package_prices')::int <> 2
     or (v_counts ->> 'rooms')::int <> 1 or (v_counts ->> 'passengers')::int <> 2 then
    raise exception 'FAIL — أعدادُ الحذف خاطئة: %', v_counts using errcode = 'P0099';
  end if;
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    raise exception 'FAIL — رايةُ الصيانة بقيت مفتوحة' using errcode = 'P0099';
  end if;
  raise notice 'PASS — delete_season: الموسمُ المقفلُ بفندقه وأسعارِه وغرفِه وحجّاجِه حُذف، والأعدادُ في التدقيق صحيحة';
end $$;

-- ولا يحذف موسماً مفتوحاً، كما كان
do $$ begin
  begin
    perform public.delete_season(9002, null);
    raise exception 'FAIL — حُذف موسمٌ مفتوح' using errcode = 'P0099';
  exception when raise_exception then if sqlerrm not like '%مفتوح%' then raise; end if;
  end;
  raise notice 'PASS — delete_season ترفض الموسمَ المفتوح كما كانت';
end $$;

-- ولا يبلغها دورٌ تطبيقيّ
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin
    perform public.delete_season(9002, null);
    raise exception 'FAIL — authenticated نفّذ delete_season' using errcode = 'P0099';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mod001_single_hotel_of_season(9002);
    raise exception 'FAIL — authenticated نفّذ دالّة التعبئة الداخلية' using errcode = 'P0099';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS — delete_season ودالّةُ التعبئة الداخلية خارج متناول authenticated';
end $$;
reset role;

\echo 'MOD-001 PR 1 — كلُّ الفحوص نجحت. المعاملةُ تُرجَع الآن.'
rollback;
