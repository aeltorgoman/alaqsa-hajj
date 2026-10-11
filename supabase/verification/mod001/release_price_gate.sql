-- ═══════════════════════════════════════════════════════════════
-- MOD-001 — بوّابةُ الأسعار قبل إطلاق الواجهة الجديدة (قراءةٌ محضة)
-- ═══════════════════════════════════════════════════════════════
-- القرار P1 (أ) من مراجعة #216: بين تطبيق الترحيلات وإطلاق الواجهة الجديدة
-- تبقى الواجهةُ الحاليّةُ تحسب سعرَ الباقة من `pricing_settings`، والجديدةُ
-- تحسبه من `hotel_package_prices`. فقبل الإطلاق يجب أن يتساويا للموسم
-- المفتوح، والغائبُ صفرٌ في الطرفين. وأيُّ فرقٍ **يوقف الإطلاق**.
--
--   psql "$URL" -X -v ON_ERROR_STOP=1 \
--        -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" \
--        -f supabase/verification/mod001/release_price_gate.sql
--
-- يطبع سطراً لكلّ فرق (فندق · مفتاح · العامّ · الفندق) ثمّ يرفع استثناءً
-- إن وُجد فرقٌ أو حاجٌّ يُسعَّر بلا فندقٍ مطلوب. لا يكتب شيئاً.

\set ON_ERROR_STOP on
\pset footer off

select 'MISMATCH' as gate, h.id as hotel_id, k.key,
       coalesce(ps.amount, 0) as global_amount, coalesce(hp.amount, 0) as hotel_amount
  from public.seasons s
  join public.hotels h on h.season_id = s.id
  cross join (values ('package_double'), ('package_triple'), ('package_quad'), ('package_suite')) k(key)
  left join public.pricing_settings ps on ps.key = k.key
  left join public.hotel_package_prices hp on hp.hotel_id = h.id and hp.package_key = k.key
 where s.closed_at is null
   and coalesce(ps.amount, 0) <> coalesce(hp.amount, 0)
 order by h.id, k.key;

do $$
declare
  v_open      integer;
  v_hotels    integer;
  v_mismatch  integer;
  v_unhoteled integer;
begin
  select count(*) into v_open from public.seasons where closed_at is null;
  if v_open <> 1 then
    raise exception 'PRICE GATE BLOCKED: expected exactly one open season, found %', v_open;
  end if;

  select count(*) into v_hotels
    from public.hotels h join public.seasons s on s.id = h.season_id where s.closed_at is null;

  select count(*) into v_mismatch
    from public.seasons s
    join public.hotels h on h.season_id = s.id
    cross join (values ('package_double'), ('package_triple'), ('package_quad'), ('package_suite')) k(key)
    left join public.pricing_settings ps on ps.key = k.key
    left join public.hotel_package_prices hp on hp.hotel_id = h.id and hp.package_key = k.key
   where s.closed_at is null
     and coalesce(ps.amount, 0) <> coalesce(hp.amount, 0);

  -- مَن تُسعّره صفحةُ الحسابات (تعريفُ `isHajj` بعد `mapPassenger`) ولا فندقَ
  -- مطلوباً له: سعرُه الأساسيُّ سيصير صفراً عند الإطلاق.
  select count(*) into v_unhoteled
    from public.passengers p join public.seasons s on s.id = p.season_id
   where s.closed_at is null
     and p.requested_hotel_id is null
     and coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري');

  raise notice 'PRICE GATE: open_season_hotels=% package_mismatches=% priced_pilgrims_without_hotel=%',
    v_hotels, v_mismatch, v_unhoteled;

  if v_mismatch > 0 or v_unhoteled > 0 then
    raise exception 'PRICE GATE BLOCKED: % package-price mismatch(es), % priced pilgrim(s) without a requested hotel — resolve before the frontend launch',
      v_mismatch, v_unhoteled;
  end if;
  raise notice 'PRICE GATE PASS';
end $$;
