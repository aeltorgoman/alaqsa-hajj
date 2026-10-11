-- ═══════════════════════════════════════════════════════════════
-- MOD-001 / #62 — فحوصُ النقل بمصدرٍ متوقَّع وتفرّد رقم الغرفة
-- ═══════════════════════════════════════════════════════════════
-- قاعدةٌ محلّيّةٌ مؤقّتةٌ وحدها، بعد `npm run supabase -- db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/verification/mod001/m62_transfer_uniqueness_checks.sql
--
-- ⚠️ يرفض العملَ على قاعدةٍ فيها موسمٌ أو حاجٌّ أو مستخدم، وكلُّ ما يكتبه
--    يُرجَع في آخره (`rollback`).
-- ⚠️ عُرفُ الإخفاق: كلُّ `FAIL` بـSQLSTATE `P0099`، وكلُّ رفضٍ متوقَّعٍ
--    يُلتقط بـSQLSTATE المحدَّد، ورسائلُ `P0001` تُطابَق فوق ذلك.
--    والتزامنُ الحقيقيّ (جلستان) في m62_tests.sh.

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
  ('00000000-0000-0000-0000-0000000000c1', 'hotel@t.local',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'pass@t.local',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'admins@t.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c4', 'none@t.local',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c5', 'inactive@t.local', 'authenticated', 'authenticated');
insert into public.user_profiles (id, email, name, permissions, is_active) values
  ('00000000-0000-0000-0000-0000000000c1', 'hotel@t.local',    'فندق فقط',     '{"manage_hotel":true}', true),
  ('00000000-0000-0000-0000-0000000000c2', 'pass@t.local',     'حجّاج فقط',    '{"manage_passengers":true}', true),
  ('00000000-0000-0000-0000-0000000000c3', 'admins@t.local',   'إداريون فقط',  '{"manage_admins":true}', true),
  ('00000000-0000-0000-0000-0000000000c4', 'none@t.local',     'بلا صلاحيات', '{}', true),
  ('00000000-0000-0000-0000-0000000000c5', 'inactive@t.local', 'معطّل',        '{"manage_hotel":true}', false);

-- الموسمُ المقفل: غرفتان وحاجٌّ في الأولى
insert into public.seasons (id, name, hijri_year) overriding system value values (9101, 'مقفل', 1400);
insert into public.hotels (id, season_id, name) overriding system value values (8100, 9101, 'مقفل أ');
insert into public.rooms (id, season_id, hotel_id, number, floor, type) overriding system value
  values (7100, 9101, 8100, '1', '1', 'ثنائية'), (7101, 9101, 8100, '2', '1', 'ثنائية');
insert into public.passengers (id, season_id, name_ar, requested_hotel_id, room_id) overriding system value
  values (6100, 9101, 'مقفل ١', 8100, 7100);
update public.seasons set closed_at = now(), closed_by = 't' where id = 9101;

-- المفتوح: فندقان، والرقمُ «101» في الدور «1» في كليهما
insert into public.seasons (id, name, hijri_year) overriding system value values (9102, 'مفتوح', 1401);
insert into public.hotels (id, season_id, name) overriding system value values (8201, 9102, 'فندق أ'), (8202, 9102, 'فندق ب');
insert into public.rooms (id, season_id, hotel_id, number, floor, type) overriding system value values
  (7201, 9102, 8201, '101', '1', 'ثنائية'),
  (7202, 9102, 8201, '102', '1', 'ثنائية'),
  (7203, 9102, 8202, '101', '1', 'ثنائية'),
  (7204, 9102, 8202, '102', '1', 'فردية');
insert into public.passengers (id, season_id, name_ar, passenger_type, requested_hotel_id, room_id) overriding system value values
  (6201, 9102, 'حاج ١', 'حاج',   8201, 7201),
  (6202, 9102, 'حاج ٢', 'حاج',   8201, null),
  (6203, 9102, 'حاج ٣', 'حاج',   8201, null),
  (6205, 9102, 'إداري', 'إداري', null, null);

-- ═══ أ) تفرّدُ رقم الغرفة ═════════════════════════════════════
do $$
declare v_def text;
begin
  -- الحالةُ الفعليّة: القديمُ ساقط، والفندقيُّ والجزئيُّ بتعريفهما
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'rooms_season_floor_number_uniq') then
    raise exception 'FAIL — الفهرسُ القديمُ على الموسم ما زال قائماً' using errcode = 'P0099';
  end if;
  select indexdef into v_def from pg_indexes where schemaname = 'public' and indexname = 'rooms_hotel_floor_number_uniq';
  if v_def is distinct from 'CREATE UNIQUE INDEX rooms_hotel_floor_number_uniq ON public.rooms USING btree (hotel_id, floor, number)' then
    raise exception 'FAIL — rooms_hotel_floor_number_uniq: %', v_def using errcode = 'P0099';
  end if;
  select indexdef into v_def from pg_indexes where schemaname = 'public' and indexname = 'rooms_unlinked_season_floor_number_uniq';
  if v_def is distinct from 'CREATE UNIQUE INDEX rooms_unlinked_season_floor_number_uniq ON public.rooms USING btree (season_id, floor, number) WHERE (hotel_id IS NULL)' then
    raise exception 'FAIL — rooms_unlinked_season_floor_number_uniq: %', v_def using errcode = 'P0099';
  end if;

  -- الرقمُ نفسُه في فندقين: قائمٌ في التهيئة (7201 · 7203) — والإدراجُ مرّ
  if (select count(*) from public.rooms where season_id = 9102 and floor = '1' and number = '101') <> 2 then
    raise exception 'FAIL — الرقمُ نفسُه في فندقين' using errcode = 'P0099';
  end if;

  -- داخل الفندق: ممنوع
  begin
    insert into public.rooms (season_id, hotel_id, number, floor, type) values (9102, 8201, '101', '1', 'ثنائية');
    raise exception 'FAIL — تكرارٌ داخل الفندق مرّ' using errcode = 'P0099';
  exception when unique_violation then
    if sqlerrm not like '%rooms_hotel_floor_number_uniq%' then raise; end if;
  end;

  -- غرفٌ بلا فندق (مسارُ الواجهة الحاليّة في موسمٍ بفندقين): محميّةٌ على الموسم
  insert into public.rooms (season_id, number, floor, type) values (9102, '101', '1', 'ثنائية');
  if exists (select 1 from public.rooms where season_id = 9102 and number = '101' and floor = '1' and hotel_id is not null and id not in (7201, 7203)) then
    raise exception 'FAIL — عُبّئ فندقٌ والموسمُ فيه فندقان' using errcode = 'P0099';
  end if;
  begin
    insert into public.rooms (season_id, number, floor, type) values (9102, '101', '1', 'ثنائية');
    raise exception 'FAIL — تكرارُ غرفةٍ بلا فندق في الموسم مرّ' using errcode = 'P0099';
  exception when unique_violation then
    if sqlerrm not like '%rooms_unlinked_season_floor_number_uniq%' then raise; end if;
  end;
  delete from public.rooms where season_id = 9102 and hotel_id is null;
  raise notice 'PASS — التفرّد: فندقان بالرقم نفسه مسموح، داخل الفندق ممنوع، والغرفُ بلا فندق محميّةٌ على موسمها';
end $$;

-- ═══ ب) النقلُ بمصدرٍ متوقَّع (manage_hotel) ═════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true) as jwt \gset
do $$
declare r jsonb; v_hint text; v_state text; v_msg text;
begin
  -- مصدرٌ مطابق: نقلٌ بين فندقين (7201 → 7203)
  r := public.assign_passenger_room(6201, 7203, 7201);
  if (select room_id from public.passengers where id = 6201) <> 7203 or (r ->> 'previous_room_id')::bigint <> 7201 then
    raise exception 'FAIL — مصدرٌ مطابقٌ لم ينقل: %', r using errcode = 'P0099';
  end if;

  -- مصدرٌ قديم (7201 والحاجُّ في 7203): مرفوضٌ بلا كتابة، وبتلميحٍ يميّزه
  begin
    perform public.assign_passenger_room(6201, 7202, 7201);
    raise exception 'FAIL — مصدرٌ قديمٌ مرّ' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
    if v_hint is distinct from 'mod001_stale_source' or v_msg not like 'تغيّر مكانُ الحاجّ%' then raise; end if;
  end;
  if (select room_id from public.passengers where id = 6201) <> 7203 then
    raise exception 'FAIL — مصدرٌ قديمٌ غيّر الإسناد' using errcode = 'P0099';
  end if;

  -- إسنادٌ أوّل: المتوقَّعُ null يُفحص (بلا غرفة) ويمرّ
  perform public.assign_passenger_room(6202, 7201, null);
  if (select room_id from public.passengers where id = 6202) <> 7201 then
    raise exception 'FAIL — إسنادٌ أوّلٌ من null' using errcode = 'P0099';
  end if;
  -- null المتوقَّع والحاجُّ مُسكَّن: مرفوض — null شرطٌ لا «بلا شرط»
  begin
    perform public.assign_passenger_room(6202, 7202, null);
    raise exception 'FAIL — المتوقَّعُ null مرّ والحاجُّ مُسكَّن' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint is distinct from 'mod001_stale_source' then raise; end if;
  end;
  -- متوقَّعٌ غرفةً والحاجُّ بلا غرفة: مرفوض
  begin
    perform public.assign_passenger_room(6203, 7202, 7201);
    raise exception 'FAIL — متوقَّعٌ غرفةً والحاجُّ بلا غرفة مرّ' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint is distinct from 'mod001_stale_source' then raise; end if;
  end;
  if (select room_id from public.passengers where id = 6202) <> 7201
     or (select room_id from public.passengers where id = 6203) is not null then
    raise exception 'FAIL — رفضٌ غيّر إسناداً' using errcode = 'P0099';
  end if;

  -- السعةُ تحت المسار الجديد: 7204 فرديّة
  perform public.assign_passenger_room(6203, 7204, null);
  begin
    perform public.assign_passenger_room(6202, 7204, 7201);
    raise exception 'FAIL — السعةُ تجاوزها المسارُ الجديد' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%مكتملة%' then raise; end if;
  end;
  if (select room_id from public.passengers where id = 6202) <> 7201 then
    raise exception 'FAIL — رفضُ السعة غيّر الإسناد' using errcode = 'P0099';
  end if;

  -- الإخراجُ بمصدرٍ متوقَّع
  perform public.assign_passenger_room(6202, null, 7201);
  if (select room_id from public.passengers where id = 6202) is not null then
    raise exception 'FAIL — إخراجٌ بمصدرٍ مطابق' using errcode = 'P0099';
  end if;

  -- الموسمُ المقفل: مرفوضٌ ولا يتغيّر
  begin
    perform public.assign_passenger_room(6100, 7101, 7100);
    raise exception 'FAIL — موسمٌ مقفلٌ قبل النقل' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%مقفل%' then raise; end if;
  end;
  -- غرفةٌ من موسمٍ آخر: مرفوضة
  begin
    perform public.assign_passenger_room(6202, 7101, null);
    raise exception 'FAIL — غرفةٌ من موسمٍ آخر' using errcode = 'P0099';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%موسماً آخر%' and v_msg not like '%مقفل%' then raise; end if;
  end;
  raise notice 'PASS — المصدرُ المتوقَّع: مطابقٌ ينقل، قديمٌ يُرفض بلا كتابة، null شرطٌ للإسناد الأوّل، والسعةُ والموسمُ قائمان';
end $$;
reset role;

-- النسخةُ القديمة (وسيطان): بلا شرطٍ كما كانت
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true) as jwt \gset
do $$ begin
  perform public.assign_passenger_room(6202, 7202);
  perform public.assign_passenger_room(6202, 7201);
  if (select room_id from public.passengers where id = 6202) <> 7201 then
    raise exception 'FAIL — النسخةُ القديمة' using errcode = 'P0099';
  end if;
  raise notice 'PASS — النسخةُ ذاتُ الوسيطين تعمل كما كانت (لا شرط)';
end $$;
reset role;

-- ═══ ج) الصلاحيات تحت المسار الجديد — والرفضُ لا يكشف المكان ═══
-- manage_admins: الحاجُّ مرفوضٌ (42501) حتى بمصدرٍ خاطئ — لا «تغيّر مكانُه»
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin perform public.assign_passenger_room(6202, 7202, 9999); raise exception 'FAIL — manage_admins نقل حاجّاً' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  perform public.assign_passenger_room(6205, 7202, null);
  if (select room_id from public.passengers where id = 6205) <> 7202 then
    raise exception 'FAIL — manage_admins والإداري' using errcode = 'P0099';
  end if;
  raise notice 'PASS — manage_admins: الإداريُّ مسموح، والحاجُّ 42501 قبل فحص المصدر';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin perform public.assign_passenger_room(6205, null, 7202); raise exception 'FAIL — manage_passengers نقل إدارياً' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  perform public.assign_passenger_room(6202, 7202, 7201);
  raise notice 'PASS — manage_passengers: الحاجُّ مسموح، والإداريُّ 42501';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin perform public.assign_passenger_room(6202, 7201, 7202); raise exception 'FAIL — بلا صلاحيات نقل' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  raise notice 'PASS — بلا صلاحيات: 42501';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}', true) as jwt \gset
do $$ begin
  begin perform public.assign_passenger_room(6202, 7201, 7202); raise exception 'FAIL — حسابٌ معطّل نقل' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  raise notice 'PASS — حسابٌ معطّل: 42501';
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.assign_passenger_room(6202, 7201, 7202); raise exception 'FAIL — anon نفّذ النسخةَ الجديدة' using errcode = 'P0099';
  exception when sqlstate '42501' then null; end;
  raise notice 'PASS — anon: لا تنفيذ';
end $$;
reset role;

-- ═══ د) الإسناداتُ سليمة: لا غرفةَ فوق سعتها ولا حاجَّ خارج موسمه ═══
do $$ begin
  if exists (select 1 from public.rooms r join public.passengers p on p.room_id = r.id
              group by r.id, r.capacity having count(*) > r.capacity) then
    raise exception 'FAIL — غرفةٌ فوق سعتها' using errcode = 'P0099';
  end if;
  if exists (select 1 from public.passengers p join public.rooms r on r.id = p.room_id where r.season_id <> p.season_id) then
    raise exception 'FAIL — إسنادٌ عبر المواسم' using errcode = 'P0099';
  end if;
  if (select room_id from public.passengers where id = 6100) <> 7100 then
    raise exception 'FAIL — حاجُّ الموسم المقفل تغيّر' using errcode = 'P0099';
  end if;
  raise notice 'PASS — لا غرفةَ فوق سعتها، ولا إسنادَ عبر المواسم، والموسمُ المقفلُ كما هو';
end $$;

\echo 'MOD-001 #62 — كلُّ الفحوص نجحت. المعاملةُ تُرجَع الآن.'
rollback;
