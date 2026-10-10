-- ═══════════════════════════════════════════════════════════════
-- MOD-001 / PR 2 — فحوصُ ما بعد التعبئة (قاعدةٌ محلّيّةٌ مؤقّتةٌ وحدها)
-- ═══════════════════════════════════════════════════════════════
-- التسلسل الكامل:
--   npm run supabase -- db reset --version 20261010194239          # حتى PR 1
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/verification/mod001/pr2_fixture.sql
--   psql "$LOCAL" -v mode=legacy -At -f supabase/verification/mod001/pr2_finance_fingerprint.sql > before.txt
--   npm run supabase -- migration up                                # PR 2
--   psql "$LOCAL" -v mode=hotel  -At -f supabase/verification/mod001/pr2_finance_fingerprint.sql > after.txt
--   diff before.txt after.txt                                       # لا فرق
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/verification/mod001/pr2_backfill_checks.sql
--
-- ⚠️ يرفض العملَ إلا على بيانات pr2_fixture.sql الاصطناعيّة. وإعادةُ
--    التشغيل تجري داخل معاملةٍ تُرجَع.

\set ON_ERROR_STOP on
\set QUIET on

do $$ begin
  if not exists (select 1 from public.passengers where name_ar like '%اختبار%')
     or exists (select 1 from public.passengers where name_ar not like '%اختبار%' and name_ar not like '% إداري' and name_ar not like '% مرافق') then
    raise exception 'هذه ليست بياناتِ pr2_fixture.sql — الفحوصُ للقاعدة المحلّيّة المؤقّتة وحدها.';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261010203522') then
    raise exception 'ترحيلة PR 2 غير مطبّقة.';
  end if;
end $$;

-- ═══ أ) الفنادق: موسمٌ واحدٌ ← فندقٌ واحد، ولا اختراع ═══════════
do $$
declare v_n int;
begin
  -- 1439: مقفلٌ فارغٌ بلا اسم ← لا فندق
  if exists (select 1 from public.hotels h join public.seasons s on s.id = h.season_id where s.hijri_year = 1439) then
    raise exception 'FAIL — اختُرع فندقٌ لموسمٍ فارغٍ بلا اسم';
  end if;
  -- كلُّ موسمٍ آخر: فندقٌ واحدٌ بالضبط
  select count(*) into v_n from public.seasons s
   where s.hijri_year <> 1439 and (select count(*) from public.hotels h where h.season_id = s.id) <> 1;
  if v_n <> 0 then raise exception 'FAIL — % موسماً ليس له فندقٌ واحد', v_n; end if;
  -- الاسمُ من الموسم مقصوصاً، وغيابُه «الفندق»، والعنوانُ الفارغُ لا يُنقل
  if (select h.name from public.hotels h join public.seasons s on s.id = h.season_id where s.hijri_year = 1442) <> 'فندق الاثنين'
     or (select h.address from public.hotels h join public.seasons s on s.id = h.season_id where s.hijri_year = 1442) is not null
     or (select h.name from public.hotels h join public.seasons s on s.id = h.season_id where s.hijri_year = 1441) <> 'الفندق' then
    raise exception 'FAIL — اسمُ الفندق أو عنوانُه لم يُنقل كما يجب';
  end if;
  -- الرابطُ الصالحُ يُنقل، وغيرُ الصالحِ ملاحظةٌ لا تُرمى
  if (select h.map_url from public.hotels h join public.seasons s on s.id = h.season_id where s.hijri_year = 1440) <> 'https://maps.example/1440'
     or (select h.map_url from public.hotels h join public.seasons s on s.id = h.season_id where s.hijri_year = 1441) is not null
     or (select h.notes from public.hotels h join public.seasons s on s.id = h.season_id where s.hijri_year = 1441) not like '%maps.example/no-scheme%' then
    raise exception 'FAIL — رابطُ الخريطة لم يُعالَج كما يجب';
  end if;
  -- `seasons.hotel_*` باقيةٌ كما هي (التوافق مع الواجهة الحالية والبوابة)
  if (select hotel_name from public.seasons where hijri_year = 1440) <> 'فندق الأربعين' then
    raise exception 'FAIL — مُسّت أعمدةُ الموسم';
  end if;
  raise notice 'PASS — الفنادق: واحدٌ لكلّ موسمٍ يحتاجه، لا اختراعَ لفارغ، والاسمُ والعنوانُ والرابطُ منقولةٌ بأمان';
end $$;

-- ═══ ب) الغرفُ والحجّاج ═══════════════════════════════════════
do $$
declare v_n int;
begin
  select count(*) into v_n from public.rooms r
   where r.hotel_id is distinct from (select h.id from public.hotels h where h.season_id = r.season_id);
  if v_n <> 0 then raise exception 'FAIL — % غرفةً ليست على فندق موسمها', v_n; end if;

  select count(*) into v_n from public.passengers p
   where coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')
     and p.requested_hotel_id is distinct from (select h.id from public.hotels h where h.season_id = p.season_id);
  if v_n <> 0 then raise exception 'FAIL — % حاجّاً ليس فندقُه المطلوبُ فندقَ موسمه', v_n; end if;

  -- الإداريُّ والمرافقُ لا يُمسّان (D7)، والنوعُ الشاذُّ حاجٌّ كما تعدّه الواجهة
  if exists (select 1 from public.passengers where passenger_type in ('إداري', 'مرافق') and requested_hotel_id is not null) then
    raise exception 'FAIL — عُبّئ فندقٌ مطلوبٌ لإداريٍّ أو مرافق';
  end if;
  if exists (select 1 from public.passengers where passenger_type = 'نوع شاذ' and requested_hotel_id is null) then
    raise exception 'FAIL — حاجٌّ بنوعٍ شاذٍّ تُرك بلا فندق — صفحةُ الحسابات تُسعّره';
  end if;
  -- الإسنادُ الفعليُّ لم يتغيّر: الإداريُّ ما زال في غرفته
  if not exists (select 1 from public.passengers where passenger_type = 'إداري' and room_id is not null) then
    raise exception 'FAIL — تغيّر إسنادُ الغرف';
  end if;
  raise notice 'PASS — الغرفُ على فندق موسمها، والحجّاجُ بفندقٍ مطلوب، والإداريُّ والمرافقُ كما كانا';
end $$;

-- ═══ ج) الأسعار: السعرُ الفعّالُ اليوم، والغائبُ صفر ═══════════
do $$
begin
  -- 1440 له لقطةٌ غاب منها «فردية» ← لا صفَّ لها (صفرٌ قبلُ وبعد)
  if exists (select 1 from public.hotel_package_prices hp join public.seasons s on s.id = hp.season_id
              where s.hijri_year = 1440 and hp.package_key = 'package_suite') then
    raise exception 'FAIL — اختُرع سعرٌ لمفتاحٍ غائبٍ عن اللقطة';
  end if;
  if (select amount from public.hotel_package_prices hp join public.seasons s on s.id = hp.season_id
       where s.hijri_year = 1440 and hp.package_key = 'package_double')
     <> (select amount from public.season_pricing_snapshot sps join public.seasons s on s.id = sps.season_id
          where s.hijri_year = 1440 and sps.key = 'package_double') then
    raise exception 'FAIL — المقفلُ ذو اللقطة لم يأخذ سعرَ لقطته';
  end if;
  -- المقفلُ بلا لقطةٍ والمفتوح ← الحيّ (كما تعرضهما الشاشةُ اليوم)
  if exists (select 1 from public.hotel_package_prices hp join public.seasons s on s.id = hp.season_id
              join public.pricing_settings ps on ps.key = hp.package_key
              where s.hijri_year in (1441, 1443) and hp.amount <> ps.amount) then
    raise exception 'FAIL — المقفلُ بلا لقطةٍ أو المفتوحُ لم يأخذ السعرَ الحيّ';
  end if;
  -- ولا مفتاحَ غيرَ الباقات الأربعة
  if exists (select 1 from public.hotel_package_prices where package_key not like 'package_%') then
    raise exception 'FAIL — صفُّ سعرٍ لغير الباقات';
  end if;
  raise notice 'PASS — الأسعار: لقطةُ المقفل، وحيُّ المفتوحِ والمقفلِ بلا لقطة، والمفتاحُ الغائبُ بلا صفّ';
end $$;

-- ═══ د) ث٣ باقٍ: الرايةُ مغلقة والحارسُ يمنع ═════════════════════
do $$ begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    raise exception 'FAIL — رايةُ الصيانة مفتوحة';
  end if;
  begin
    update public.hotels set notes = 'تعديل' where season_id = (select id from public.seasons where hijri_year = 1440);
    raise exception 'FAIL — فندقُ موسمٍ مقفلٍ عُدّل بعد التعبئة';
  exception when raise_exception then if sqlerrm not like '%مقفل%' then raise; end if;
  end;
  begin
    update public.passengers set requested_hotel_id = null where season_id = (select id from public.seasons where hijri_year = 1440);
    raise exception 'FAIL — حاجُّ موسمٍ مقفلٍ عُدّل بعد التعبئة';
  exception when raise_exception then if sqlerrm not like '%مقفل%' then raise; end if;
  end;
  begin
    update public.hotel_package_prices set amount = 1 where season_id = (select id from public.seasons where hijri_year = 1440);
    raise exception 'FAIL — سعرُ موسمٍ مقفلٍ عُدّل بعد التعبئة';
  exception when raise_exception then if sqlerrm not like '%مقفل%' then raise; end if;
  end;
  raise notice 'PASS — ث٣ قائم: لا كتابةَ في فنادق الموسم المقفل وحجّاجِه وأسعارِه بعد التعبئة';
end $$;

-- ═══ هـ) إعادةُ التشغيل لا تُغيّر شيئاً (داخل معاملةٍ تُرجَع) ════════
begin;
create temporary table mod001_rerun_before as
select (select count(*) from public.hotels) as hotels,
       (select count(*) from public.hotel_package_prices) as prices,
       (select md5(string_agg(to_jsonb(r)::text, '|' order by r.id)) from public.rooms r) as rooms,
       (select md5(string_agg(to_jsonb(p)::text, '|' order by p.id)) from public.passengers p) as pax,
       (select md5(string_agg(to_jsonb(h)::text, '|' order by h.id)) from public.hotels h) as hotel_rows,
       (select md5(string_agg(to_jsonb(hp)::text, '|' order by hp.hotel_id, hp.package_key)) from public.hotel_package_prices hp) as price_rows;
\ir ../../migrations/20261010203522_mod001_hotels_backfill.sql
do $$ begin
  if exists (
    select 1 from mod001_rerun_before b
     where b.hotels     <> (select count(*) from public.hotels)
        or b.prices     <> (select count(*) from public.hotel_package_prices)
        or b.rooms      <> (select md5(string_agg(to_jsonb(r)::text, '|' order by r.id)) from public.rooms r)
        or b.pax        <> (select md5(string_agg(to_jsonb(p)::text, '|' order by p.id)) from public.passengers p)
        or b.hotel_rows <> (select md5(string_agg(to_jsonb(h)::text, '|' order by h.id)) from public.hotels h)
        or b.price_rows <> (select md5(string_agg(to_jsonb(hp)::text, '|' order by hp.hotel_id, hp.package_key)) from public.hotel_package_prices hp)) then
    raise exception 'FAIL — إعادةُ تشغيل التعبئة غيّرت شيئاً';
  end if;
  raise notice 'PASS — إعادةُ التشغيل: لا فندقَ جديد ولا سعرَ ولا تغييرَ في غرفةٍ أو حاجّ';
end $$;
rollback;

\echo 'MOD-001 PR 2 — كلُّ فحوص ما بعد التعبئة نجحت.'
