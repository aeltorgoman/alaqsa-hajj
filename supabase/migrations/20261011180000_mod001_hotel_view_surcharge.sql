-- ════════════════════════════════════════════════════════════
-- MOD-001 / M5 — رسمُ الإطلالة لكلّ فندق (`addon_view` في `hotel_package_prices`)
-- ════════════════════════════════════════════════════════════
-- القرارُ المعتمَد: «مطلة» تُضيف رسمَ إطلالةِ **الفندق المطلوب**، و«غير مطلة»
-- صفر. ولكلّ فندقٍ رسمُه. الغائبُ صفر، والصفرُ الصريحُ صحيح. والنقلُ بين
-- الغرف أو الفنادق لا يحرّك مالاً.
--
--   ١) قيدُ المفاتيح على `hotel_package_prices` يتّسع لـ`addon_view` بجانب
--      الباقات الأربع — لا جدولَ ولا عمودَ جديد، ولا سياسةَ ولا صلاحيةَ تتغيّر.
--      ويُتحقَّق من تعريف القيد القائم قبل إسقاطه.
--   ٢) تعبئةٌ لكلّ فندقٍ لا رسمَ إطلالةٍ له، بقاعدة M2 نفسِها (قاعدةُ
--      `FinancePage.loadFinanceData`):
--        · موسمٌ مقفلٌ له لقطةٌ (أيُّ صفّ) ← `addon_view` من لقطته؛
--        · وإلّا (مفتوح، أو مقفلٌ قبل آلية اللقطة) ← `pricing_settings` الحيّ؛
--        · مفتاحٌ غائبٌ عن مصدره ← لا صفّ ← صفر، وهو ما يحسبه اليوم
--          (`pricing["addon_view"]?.amount || 0`). فلا قيمةَ تُخترع.
--   ٣) البرهانُ داخل الكتلة نفسِها، وإلّا أُجهضت كلُّها:
--        · بصماتُ كلّ ما لا يحقّ لها مسُّه — ومنها صفوفُ الباقات الأربع؛
--        · رسمُ الإطلالة لكلّ حاجٍّ له فندقٌ مطلوب: قبل (قاعدةُ الواجهة
--          الحاليّة) = بعد (رسمُ فندقه المطلوب)، في كلّ موسمٍ مفتوحٍ ومقفل.
--
-- ⚠️ الموسمُ المقفلُ محميٌّ بـ`trg_reject_closed_season`. والكتابةُ فيه هنا
--    نسخُ قيمةٍ قائمةٍ لفندقٍ قائم لا تعديلُ تاريخ، فتُفتح رايةُ
--    `app.season_maintenance` داخل الكتلة وحدها (`set_config(…, true)`)، كما في M2.
-- ⚠️ لا يُحذف صفّ، ولا يُعدَّل صفٌّ قائم. وإعادةُ التشغيل آمنة: لا يُكتب إلا
--    لفندقٍ بلا رسم، وسجلُّ الترحيلات يمنع التشغيلَ الثاني أصلاً.

-- ── ١) القيد ───────────────────────────────────────────────────
do $pre$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'hotel_package_prices_key_vocab'
       and conrelid = 'public.hotel_package_prices'::regclass
       and pg_get_constraintdef(oid) =
           'CHECK ((package_key = ANY (ARRAY[''package_double''::text, ''package_triple''::text, ''package_quad''::text, ''package_suite''::text])))') then
    raise exception 'hotel_package_prices_key_vocab غائبٌ أو بتعريفٍ غيرِ المتوقَّع — لا يُستبدل.' using errcode = 'P0001';
  end if;
end;
$pre$;

alter table public.hotel_package_prices drop constraint hotel_package_prices_key_vocab;
alter table public.hotel_package_prices
  add constraint hotel_package_prices_key_vocab check (
    package_key in ('package_double', 'package_triple', 'package_quad', 'package_suite', 'addon_view'));

comment on table public.hotel_package_prices is
  'MOD-001 — سعرُ الباقة الأساسيّ ورسمُ الإطلالة (addon_view) لكلّ فندق. غيابُ الصفّ يعني صفراً ولا رجوعَ إلى pricing_settings. الكتابةُ manage_payments كأسعار الشركة.';

-- ── ٢) التعبئة والبرهان ────────────────────────────────────────
do $backfill$
declare
  v_n        integer;
  v_rows     integer;
  b_pass text; b_rooms text; b_hotels text; b_pkg text; b_pay text; b_charge text;
  b_ps text; b_snap text; b_seasons text; b_rcpt text;
  a_pass text; a_rooms text; a_hotels text; a_pkg text; a_pay text; a_charge text;
  a_ps text; a_snap text; a_seasons text; a_rcpt text;
begin
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_pass    from public.passengers x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_rooms   from public.rooms x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_hotels  from public.hotels x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.hotel_id, x.package_key), '')) into b_pkg
    from public.hotel_package_prices x where x.package_key <> 'addon_view';
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_pay     from public.payments x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_charge  from public.custom_charges x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_ps      from public.pricing_settings x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.season_id, x.key), '')) into b_snap from public.season_pricing_snapshot x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_seasons from public.seasons x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_rcpt    from public.payment_receipts x;

  perform set_config('app.season_maintenance', 'on', true);

  insert into public.hotel_package_prices (hotel_id, season_id, package_key, amount)
  select h.id, h.season_id, 'addon_view', src.amount
    from public.hotels h
    join public.seasons s on s.id = h.season_id
    cross join lateral (
      select sps.amount
        from public.season_pricing_snapshot sps
       where s.closed_at is not null
         and exists (select 1 from public.season_pricing_snapshot x where x.season_id = s.id)
         and sps.season_id = s.id and sps.key = 'addon_view'
      union all
      select ps.amount
        from public.pricing_settings ps
       where not (s.closed_at is not null
                  and exists (select 1 from public.season_pricing_snapshot x where x.season_id = s.id))
         and ps.key = 'addon_view'
    ) src
   where not exists (select 1 from public.hotel_package_prices hp
                      where hp.hotel_id = h.id and hp.package_key = 'addon_view');
  get diagnostics v_rows = row_count;

  perform set_config('app.season_maintenance', 'off', true);

  -- أ) لا شيءَ غيرُ صفوف `addon_view` الجديدة
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_pass    from public.passengers x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_rooms   from public.rooms x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_hotels  from public.hotels x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.hotel_id, x.package_key), '')) into a_pkg
    from public.hotel_package_prices x where x.package_key <> 'addon_view';
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_pay     from public.payments x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_charge  from public.custom_charges x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_ps      from public.pricing_settings x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.season_id, x.key), '')) into a_snap from public.season_pricing_snapshot x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_seasons from public.seasons x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_rcpt    from public.payment_receipts x;
  if a_pass <> b_pass or a_rooms <> b_rooms or a_hotels <> b_hotels or a_pkg <> b_pkg
     or a_pay <> b_pay or a_charge <> b_charge or a_ps <> b_ps or a_snap <> b_snap
     or a_seasons <> b_seasons or a_rcpt <> b_rcpt then
    raise exception 'M5 مسّت ما لا يحقّ لها: حجّاجاً أو غرفاً أو فنادقَ أو أسعارَ باقاتٍ أو مالاً أو لقطاتٍ أو مواسم.' using errcode = 'P0001';
  end if;

  -- ب) رسمُ الإطلالة لكلّ حاجٍّ يُسعَّر وله فندقٌ مطلوب: قبل = بعد.
  --    «قبل» بقاعدة الواجهة الحاليّة: الإطلالةُ الغائبةُ «مطلة» (`mapPassenger`:
  --    `hotel_view || "مطلة"`)، والمبلغُ `map["addon_view"]?.amount || 0` من
  --    اللقطة أو الحيّ. «بعد» من رسم الفندق المطلوب، وغيابُه صفر.
  with pil as (
    select p.id, p.season_id, p.requested_hotel_id,
           (s.closed_at is not null
            and exists (select 1 from public.season_pricing_snapshot x where x.season_id = s.id)) as use_snap
      from public.passengers p
      join public.seasons s on s.id = p.season_id
     where coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')
       and p.requested_hotel_id is not null
       and coalesce(nullif(p.hotel_view, ''), 'مطلة') = 'مطلة'
  )
  select count(*) into v_n
    from pil
   where (case when pil.use_snap
               then coalesce((select sps.amount from public.season_pricing_snapshot sps
                               where sps.season_id = pil.season_id and sps.key = 'addon_view'), 0)
               else coalesce((select ps.amount from public.pricing_settings ps where ps.key = 'addon_view'), 0) end)
         is distinct from
         coalesce((select hp.amount from public.hotel_package_prices hp
                    where hp.hotel_id = pil.requested_hotel_id and hp.package_key = 'addon_view'), 0);
  if v_n > 0 then
    raise exception 'تغيّر رسمُ الإطلالة لـ% حاجّاً — أُجهضت M5 كلُّها.', v_n using errcode = 'P0001';
  end if;

  raise notice 'M5: hotel view surcharges inserted=%; view-surcharge parity verified for every priced pilgrim', v_rows;
end;
$backfill$;
