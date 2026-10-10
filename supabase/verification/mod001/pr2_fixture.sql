-- ═══════════════════════════════════════════════════════════════
-- MOD-001 / PR 2 — بياناتٌ اصطناعيّةٌ تمثيليّة لاختبار التعبئة
-- ═══════════════════════════════════════════════════════════════
-- قاعدةٌ محلّيّةٌ مؤقّتةٌ وحدها، **بعد** ترحيلة PR 1 و**قبل** ترحيلة PR 2:
--   npm run supabase -- db reset --version 20261010194239
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/verification/mod001/pr2_fixture.sql
--
-- ⚠️ يرفض العملَ على قاعدةٍ فيها موسمٌ أو حاجّ. لا اسمَ ولا وثيقةَ حقيقيّة.
--
-- يحاكي شكلَ الإنتاج ويزيد عليه الحالاتِ الحدّيّة:
--   1439 مقفلٌ فارغٌ بلا اسم فندق              → لا يُخترع له فندق
--   1440 مقفلٌ له لقطة غاب منها مفتاحُ «فردية» → سعرُها صفرٌ قبلُ وبعد
--   1441 مقفلٌ **بلا** لقطة، بلا اسم فندق، ورابطٌ ليس http → «الفندق»،
--        والسعرُ من الحيّ كما تعرضه الشاشةُ له اليوم، والرابطُ ملاحظة
--   1442 مقفلٌ له اسمُ فندقٍ ولقطة، بلا غرفٍ ولا حجّاج → فندقٌ بأسعار لقطته
--   1443 مفتوح                                  → فندقٌ بأسعار الحيّ
-- والأسعارُ الحيّةُ تتبدّل قبل كلّ إقفال، فلا يتساوى مصدران صدفةً.

\set ON_ERROR_STOP on
\set QUIET on

do $$ begin
  if exists (select 1 from public.seasons) or exists (select 1 from public.passengers) then
    raise exception 'القاعدةُ ليست فارغة — هذه البياناتُ للقاعدة المحلّيّة المؤقّتة وحدها.';
  end if;
  if to_regclass('public.hotels') is null then
    raise exception 'ترحيلة PR 1 غير مطبّقة.';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261010203522') then
    raise exception 'ترحيلة PR 2 مطبّقةٌ سلفاً — البياناتُ تُحمَّل قبلها.';
  end if;
end $$;

-- الأسعارُ الحيّة بإصداراتٍ خمسة: المبلغ = الأساس + الإصدار × 10
create temporary table fx_price (v int, key text, amount numeric);
insert into fx_price
select v, k.key, k.base + v * 10
  from generate_series(1, 5) v
  cross join (values
    ('package_double', 5000), ('package_triple', 4000), ('package_quad', 3000), ('package_suite', 6000),
    ('addon_view', 250), ('addon_mina', 300), ('addon_arafa', 300), ('addon_bus_vip', 400),
    ('addon_first_class', 450), ('discount_no_ticket', 300)) as k(key, base);

insert into public.pricing_settings (key, label, type, amount)
select f.key, f.key,
       case when f.key like 'package%' then 'package' when f.key like 'addon%' then 'addon' else 'discount' end,
       f.amount
  from fx_price f where f.v = 1;

create function pg_temp.set_live(p_v int) returns void language sql as $$
  update public.pricing_settings ps set amount = f.amount
    from fx_price f where f.v = p_v and f.key = ps.key;
$$;

-- حجّاجُ موسمٍ مفتوح: كلُّ تركيبٍ يمسّ التسعير، والإداريُّ، والمرافق، ونوعٌ شاذّ
create function pg_temp.populate(p_season bigint, p_tag text) returns void language plpgsql as $$
declare r1 bigint; r2 bigint; r3 bigint; v_rc bigint; v_rc2 bigint; v_p bigint;
begin
  insert into public.rooms (season_id, number, floor, type) values (p_season, '101', '1', 'ثنائية') returning id into r1;
  insert into public.rooms (season_id, number, floor, type) values (p_season, '102', '1', 'رباعية') returning id into r2;
  insert into public.rooms (season_id, number, floor, type, capacity) values (p_season, '201', '2', 'خاص', 6) returning id into r3;

  insert into public.passengers (season_id, name_ar, passenger_type, hotel_type, hotel_view, bus, flight, camp_mina, camp_arafa, custom_price, room_id) values
    (p_season, p_tag || ' اختبار ١', 'حاج', 'ثنائية', 'مطلة',     'عادي', 'عادي',     'عادي', 'عادي', 0,    r1),
    (p_season, p_tag || ' اختبار ٢', 'حاج', 'ثلاثية', 'غير مطلة', 'VIP',  'درجة أولى','خاص',  'عادي', 0,    r2),
    (p_season, p_tag || ' اختبار ٣', 'حاج', 'رباعية', 'غير مطلة', 'عادي', 'بدون',     'عادي', 'خاص',  0,    r2),
    (p_season, p_tag || ' اختبار ٤', 'حاج', 'فردية',  'مطلة',     'عادي', 'عادي',     'عادي', 'عادي', 0,    null),
    (p_season, p_tag || ' اختبار ٥', null,  null,     null,       null,   null,       null,   null,   null, r1),   -- الواجهة: حاجّ، ثنائية، مطلة
    (p_season, p_tag || ' اختبار ٦', 'حاج', 'خاص',    'مطلة',     'عادي', 'عادي',     'عادي', 'عادي', 7777, r3),
    (p_season, p_tag || ' اختبار ٧', 'حاج', '',       '',         '',     '',         '',     '',     null, null), -- فارغٌ لا null
    (p_season, p_tag || ' اختبار ٨', 'نوع شاذ', 'رباعية', 'غير مطلة', 'عادي', 'عادي', 'عادي', 'عادي', 0,   r2),  -- الواجهة تعدّه حاجّاً
    (p_season, p_tag || ' اختبار ٩', 'حاج', 'خماسية', 'غير مطلة', 'عادي', 'عادي',     'عادي', 'عادي', 0,    null),-- نوعٌ بلا باقة
    (p_season, p_tag || ' إداري',    'إداري', null,   null,       null,   null,       null,   null,   null, r3),
    (p_season, p_tag || ' مرافق',    'مرافق', 'ثنائية','مطلة',    'عادي', 'عادي',     'عادي', 'عادي', 0,    null);

  -- دفعاتٌ بإيصالٍ صالحٍ وأخرى بإيصالٍ ملغى (لا تُحتسب)، ورسومٌ إضافةً وخصماً.
  -- (لا دفعةَ بلا إيصال: `payments_require_receipt` يرفضها.)
  insert into public.payment_receipts (season_id, season_name, receipt_number, total_amount, payer_name, method, payment_date)
    values (p_season, p_tag, 1, 1500, 'اختبار', 'نقدي', current_date) returning id into v_rc;
  insert into public.payment_receipts (season_id, season_name, receipt_number, total_amount, payer_name, method, payment_date, status, cancel_reason, cancelled_at, cancelled_by)
    values (p_season, p_tag, 2, 900, 'اختبار', 'نقدي', current_date, 'cancelled', 'اختبار', now(), 'اختبار') returning id into v_rc2;
  for v_p in select id from public.passengers where season_id = p_season and coalesce(passenger_type, '') not in ('إداري', 'مرافق') order by id limit 4 loop
    insert into public.payments (passenger_id, amount, receipt_id) values (v_p, 1000, v_rc);
    insert into public.payments (passenger_id, amount, receipt_id) values (v_p, 900, v_rc2);
    insert into public.custom_charges (passenger_id, description, amount, type) values (v_p, 'إضافة اختبار', 120, 'إضافة');
    insert into public.custom_charges (passenger_id, description, amount, type) values (v_p, 'خصم اختبار', 70, 'خصم');
  end loop;
end $$;

-- 1439: يُنشأ ويُقفل فارغاً بلا اسم فندق
insert into public.seasons (name, hijri_year) values ('موسم ١٤٣٩', 1439);
select public.close_season('موسم ١٤٤٠', 1440, 'fixture', null);                -- لقطة 1439 = v1

-- 1440: فندقٌ مسمّى، بيانات، ثمّ يُقفل بلقطة v2 يُحذف منها مفتاحُ «فردية»
update public.seasons set hotel_name = 'فندق الأربعين', hotel_address = 'مكة', hotel_url = 'https://maps.example/1440'
 where hijri_year = 1440;
select pg_temp.populate((select id from public.seasons where hijri_year = 1440), '١٤٤٠');
select pg_temp.set_live(2);
select public.close_season('موسم ١٤٤١', 1441, 'fixture', null);                -- لقطة 1440 = v2
delete from public.season_pricing_snapshot
 where season_id = (select id from public.seasons where hijri_year = 1440) and key = 'package_suite';

-- 1441: بلا اسم فندق، رابطٌ ليس http، بيانات، يُقفل ثمّ تُمحى لقطتُه كلُّها
update public.seasons set hotel_url = 'maps.example/no-scheme' where hijri_year = 1441;
select pg_temp.populate((select id from public.seasons where hijri_year = 1441), '١٤٤١');
select pg_temp.set_live(3);
select public.close_season('موسم ١٤٤٢', 1442, 'fixture', null);                -- لقطة 1441 = v3 ثمّ تُمحى
delete from public.season_pricing_snapshot where season_id = (select id from public.seasons where hijri_year = 1441);

-- 1442: اسمُ فندقٍ وحده، بلا غرفٍ ولا حجّاج
update public.seasons set hotel_name = '  فندق الاثنين  ', hotel_address = '' where hijri_year = 1442;
select pg_temp.set_live(4);
select public.close_season('موسم ١٤٤٣', 1443, 'fixture', null);                -- لقطة 1442 = v4

-- 1443: المفتوح
update public.seasons set hotel_name = 'فندق المفتوح', hotel_address = 'العزيزية', hotel_url = 'https://maps.example/1443'
 where hijri_year = 1443;
select pg_temp.populate((select id from public.seasons where hijri_year = 1443), '١٤٤٣');
select pg_temp.set_live(5);

do $$
begin
  if (select count(*) from public.hotels) <> 0
     or exists (select 1 from public.rooms where hotel_id is not null)
     or exists (select 1 from public.passengers where requested_hotel_id is not null) then
    raise exception 'البياناتُ حُمِّلت ومعها فندق — يجب أن تشبه الإنتاجَ قبل التعبئة.';
  end if;
  raise notice 'fixture: seasons=% (open=%) rooms=% passengers=% payments=% receipts=% snapshot_rows=%',
    (select count(*) from public.seasons), (select count(*) from public.seasons where closed_at is null),
    (select count(*) from public.rooms), (select count(*) from public.passengers),
    (select count(*) from public.payments), (select count(*) from public.payment_receipts),
    (select count(*) from public.season_pricing_snapshot);
end $$;
