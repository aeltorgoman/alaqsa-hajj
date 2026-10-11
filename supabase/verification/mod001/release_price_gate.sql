-- ═══════════════════════════════════════════════════════════════
-- MOD-001 — بوّابةُ الأسعار قبل إطلاق الواجهة الجديدة (قراءةٌ محضة)
-- ═══════════════════════════════════════════════════════════════
-- القرار P1 (أ) من مراجعة #216: بين تطبيق الترحيلات وإطلاق الواجهة الجديدة
-- تبقى الواجهةُ الحاليّةُ تحسب سعرَ الباقة ورسمَ الإطلالة من `pricing_settings`،
-- والجديدةُ تحسبهما من `hotel_package_prices` بالفندق المطلوب. فعند لحظة
-- التبديل يجب ألّا يتغيّر مبلغُ أحد. والغائبُ صفرٌ في الطرفين. وأيُّ فرقٍ
-- **يوقف الإطلاق** ولا يُصلَح هنا.
--
-- ⚠️ بوّابةُ **انتقالٍ** لا قاعدةٌ دائمة: لا تُشغَّل إلا في الخطوة ١١ من
--    docs/runbooks/MOD001_RELEASE.md (mode=price-gate، قبل الدمج في main مباشرةً،
--    والأسعارُ مجمَّدة). بعد الإطلاق تُرفع التجميدة وتتباين أسعارُ الفنادق عن
--    السعر العامّ بحقّ — ولا قيدَ ولا محفّزَ ولا مهمّةَ دوريّةً تفرض التساوي.
--    وحتى قبل الإطلاق لا تُقارَن إلا الأسعارُ التي يتغيّر بها مبلغٌ عند التبديل:
--      أ) كلُّ حاجٍّ يُسعَّر في الموسم المفتوح: باقتُه ورسمُ إطلالته («مطلة»)
--         بالسعر العامّ = بسعر فندقه المطلوب؛
--      ب) الفندقُ الذي تُسنِد إليه الواجهةُ الحاليّةُ كلَّ تسجيلٍ جديد — حين يكون
--         للموسم المفتوح فندقٌ واحدٌ بالضبط (محفّزُ التعبئة): مفاتيحُه الخمسة
--         كلُّها = العامّ، فالحاجُّ الذي يُسجَّل بين البوّابة والإطلاق لا يتغيّر مبلغُه؛
--      ج) لا حاجَّ يُسعَّر بلا فندقٍ مطلوب.
--    فندقٌ إضافيٌّ بلا حجّاجٍ بأسعاره الخاصّة لا يوقف شيئاً.
--
--   psql "$URL" -X -v ON_ERROR_STOP=1 \
--        -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" \
--        -f supabase/verification/mod001/release_price_gate.sql

\set ON_ERROR_STOP on
do $$
declare
  v_open      integer;
  v_hotels    integer;
  v_pilgrim   integer := 0;
  v_default   integer := 0;
  v_unhoteled integer;
  r           record;
begin
  select count(*) into v_open from public.seasons where closed_at is null;
  if v_open <> 1 then
    raise exception 'PRICE GATE BLOCKED: expected exactly one open season, found %', v_open;
  end if;
  select count(*) into v_hotels
    from public.hotels h join public.seasons s on s.id = h.season_id where s.closed_at is null;

  -- أ) كلُّ حاجٍّ يُسعَّر وله فندقٌ مطلوب: باقتُه، ورسمُ إطلالته إن كان «مطلة»
  --    (الإطلالةُ الغائبةُ «مطلة» والنوعُ الغائبُ «ثنائية» — `mapPassenger`)
  for r in
    with pil as (
      select p.id, p.requested_hotel_id,
             case coalesce(nullif(p.hotel_type, ''), 'ثنائية')
               when 'ثنائية' then 'package_double' when 'ثلاثية' then 'package_triple'
               when 'رباعية' then 'package_quad'   when 'فردية'  then 'package_suite' end as pkg,
             coalesce(nullif(p.hotel_view, ''), 'مطلة') = 'مطلة' as viewed
        from public.passengers p join public.seasons s on s.id = p.season_id
       where s.closed_at is null
         and p.requested_hotel_id is not null
         and coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')
    ), parts as (
      select id, requested_hotel_id, pkg as key from pil where pkg is not null
      union all
      select id, requested_hotel_id, 'addon_view' from pil where viewed
    )
    select parts.id, parts.requested_hotel_id as hotel_id, parts.key,
           coalesce(ps.amount, 0) as global_amount, coalesce(hp.amount, 0) as hotel_amount
      from parts
      left join public.pricing_settings ps on ps.key = parts.key
      left join public.hotel_package_prices hp on hp.hotel_id = parts.requested_hotel_id and hp.package_key = parts.key
     where coalesce(ps.amount, 0) <> coalesce(hp.amount, 0)
     order by parts.id, parts.key
  loop
    v_pilgrim := v_pilgrim + 1;
    raise notice 'PILGRIM MISMATCH passenger=% hotel=% key=% global=% hotel=%', r.id, r.hotel_id, r.key, r.global_amount, r.hotel_amount;
  end loop;

  -- ب) الفندقُ الذي تُسند إليه الواجهةُ الحاليّةُ التسجيلَ الجديد (فندقُ الموسم الوحيد)
  for r in
    select h.id as hotel_id, k.key, coalesce(ps.amount, 0) as global_amount, coalesce(hp.amount, 0) as hotel_amount
      from public.seasons s
      join public.hotels h on h.season_id = s.id
      cross join (values ('package_double'), ('package_triple'), ('package_quad'), ('package_suite'), ('addon_view')) k(key)
      left join public.pricing_settings ps on ps.key = k.key
      left join public.hotel_package_prices hp on hp.hotel_id = h.id and hp.package_key = k.key
     where s.closed_at is null
       and (select count(*) from public.hotels h2 where h2.season_id = s.id) = 1
       and coalesce(ps.amount, 0) <> coalesce(hp.amount, 0)
     order by h.id, k.key
  loop
    v_default := v_default + 1;
    raise notice 'DEFAULT HOTEL MISMATCH hotel=% key=% global=% hotel=%', r.hotel_id, r.key, r.global_amount, r.hotel_amount;
  end loop;

  -- ج) مَن تُسعّره صفحةُ الحسابات (تعريفُ `isHajj`) ولا فندقَ مطلوباً له:
  --    باقتُه ورسمُ إطلالته سيصيران صفراً عند الإطلاق.
  select count(*) into v_unhoteled
    from public.passengers p join public.seasons s on s.id = p.season_id
   where s.closed_at is null
     and p.requested_hotel_id is null
     and coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري');

  raise notice 'PRICE GATE: open_season_hotels=% pilgrim_price_mismatches=% default_hotel_mismatches=% priced_pilgrims_without_hotel=%',
    v_hotels, v_pilgrim, v_default, v_unhoteled;

  if v_pilgrim > 0 or v_default > 0 or v_unhoteled > 0 then
    raise exception 'PRICE GATE BLOCKED: % pilgrim price mismatch(es), % default-hotel price mismatch(es), % priced pilgrim(s) without a requested hotel — resolve before the frontend launch',
      v_pilgrim, v_default, v_unhoteled;
  end if;
  raise notice 'PRICE GATE PASS';
end $$;
