-- ═══════════════════════════════════════════════════════════════
-- MOD-001 / PR 2 — بصمةُ الحسابات لكلّ حاجّ: قبل التعبئة وبعدها
-- ═══════════════════════════════════════════════════════════════
-- نسخةٌ SQL من حساب الواجهة (`mapPassenger` ← `calcTotalDue` /
-- `calcTotalPaid` في `src/components/finance/finance.utils.ts`)، بمصدرَي
-- السعر الأساسيّ:
--   mode=legacy  ← قبل PR 2: لقطةُ الموسم المقفل إن وُجدت وإلا الحيّ
--                  (`FinancePage.loadFinanceData`)
--   mode=hotel   ← بعد PR 2: سعرُ الفندق المطلوب، وغيابُه صفر (D6)
-- والإضافاتُ والخصمُ من الخريطة نفسِها في الحالين — PR 2 لا يمسّها.
--
--   psql "$LOCAL" -v mode=legacy -At -f pr2_finance_fingerprint.sql > before.txt
--   (تطبيق ترحيلة PR 2)
--   psql "$LOCAL" -v mode=hotel  -At -f pr2_finance_fingerprint.sql > after.txt
--   diff before.txt after.txt     ← يجب ألّا يطبع شيئاً
--
-- قراءةٌ محضة. السطورُ: الموسم | الحاجّ | الأساسيّ | المطلوب | المدفوع | المتبقّي،
-- ثمّ مجموعُ كلّ موسم. لا أسماءَ ولا وثائق.

\set ON_ERROR_STOP on
\pset footer off

create temporary view mod001_fp as
with
fe as (   -- `mapPassenger` و`isHajj`: الفارغُ يأخذ افتراضَ الواجهة، والنوعُ الشاذّ حاجّ
  select p.id, p.season_id, p.requested_hotel_id, s.closed_at,
         coalesce(nullif(p.hotel_type, ''), 'ثنائية')  as hotel_type,
         coalesce(nullif(p.hotel_view, ''), 'مطلة')    as hotel_view,
         coalesce(nullif(p.camp_mina, ''), 'عادي')     as camp_mina,
         coalesce(nullif(p.camp_arafa, ''), 'عادي')    as camp_arafa,
         coalesce(nullif(p.bus, ''), 'عادي')           as bus,
         case when p.flight = 'درجة أولى' then 'درجة أولى' when p.flight = 'بدون' then 'بدون' else 'عادي' end as flight,
         coalesce(p.custom_price, 0)                   as custom_price,
         (s.closed_at is not null
          and exists (select 1 from public.season_pricing_snapshot x where x.season_id = s.id)) as use_snap
    from public.passengers p
    join public.seasons s on s.id = p.season_id
   where coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')
),
price as (   -- `pricing[key]?.amount || 0` من اللقطة أو الحيّ
  select fe.id, k.key,
         coalesce(case when fe.use_snap
                       then (select sps.amount from public.season_pricing_snapshot sps where sps.season_id = fe.season_id and sps.key = k.key)
                       else (select ps.amount from public.pricing_settings ps where ps.key = k.key) end, 0) as amount
    from fe
    cross join (values ('package_double'), ('package_triple'), ('package_quad'), ('package_suite'),
                       ('addon_view'), ('addon_mina'), ('addon_arafa'), ('addon_bus_vip'),
                       ('addon_first_class'), ('discount_no_ticket')) k(key)
),
m as (
  select id,
         max(amount) filter (where key = 'package_double')     as package_double,
         max(amount) filter (where key = 'package_triple')     as package_triple,
         max(amount) filter (where key = 'package_quad')       as package_quad,
         max(amount) filter (where key = 'package_suite')      as package_suite,
         max(amount) filter (where key = 'addon_view')         as addon_view,
         max(amount) filter (where key = 'addon_mina')         as addon_mina,
         max(amount) filter (where key = 'addon_arafa')        as addon_arafa,
         max(amount) filter (where key = 'addon_bus_vip')      as addon_bus_vip,
         max(amount) filter (where key = 'addon_first_class')  as addon_first_class,
         max(amount) filter (where key = 'discount_no_ticket') as discount_no_ticket
    from price group by id
),
pkg as (
  select fe.*, m.package_double, m.package_triple, m.package_quad, m.package_suite, m.addon_view, m.addon_mina,
         m.addon_arafa, m.addon_bus_vip, m.addon_first_class, m.discount_no_ticket,
         case fe.hotel_type when 'ثنائية' then 'package_double' when 'ثلاثية' then 'package_triple'
                            when 'رباعية' then 'package_quad'   when 'فردية'  then 'package_suite' end as pkg_key
    from fe join m using (id)
),
base as (   -- `getPriceInfo`
  select pkg.*,
         case
           when hotel_type = 'خاص' then custom_price
           when pkg_key is null then 0
           when :'mode' = 'hotel' then coalesce((select hp.amount from public.hotel_package_prices hp
                                                   where hp.hotel_id = pkg.requested_hotel_id and hp.package_key = pkg.pkg_key), 0)
           else case pkg_key when 'package_double' then package_double when 'package_triple' then package_triple
                             when 'package_quad' then package_quad else package_suite end
         end as base_amount
    from pkg
),
due as (   -- `calcTotalDue`
  select b.id, b.season_id, b.base_amount,
         greatest(0,
           b.base_amount
           + case when b.hotel_view = 'مطلة'  then b.addon_view    else 0 end
           + case when b.camp_mina  = 'خاص'   then b.addon_mina    else 0 end
           + case when b.camp_arafa = 'خاص'   then b.addon_arafa   else 0 end
           + case when b.bus        = 'VIP'   then b.addon_bus_vip else 0 end
           + case when b.flight = 'درجة أولى' then b.addon_first_class else 0 end
           - case when b.flight = 'بدون'      then b.discount_no_ticket else 0 end
           + coalesce((select sum(case when c.type = 'إضافة' then c.amount else -c.amount end)
                         from public.custom_charges c where c.passenger_id = b.id), 0)
         ) as total_due,
         coalesce((select sum(pay.amount) from public.payments pay
                    left join public.payment_receipts r on r.id = pay.receipt_id
                   where pay.passenger_id = b.id and coalesce(r.status, '') <> 'cancelled'), 0) as total_paid   -- `calcTotalPaid`
    from base b
)
select season_id, id, base_amount, total_due, total_paid, total_due - total_paid as balance
  from due;

select 'pilgrim' as row, season_id, id, base_amount, total_due, total_paid, balance
  from mod001_fp order by season_id, id;

select 'season_total' as row, season_id, count(*) as pilgrims,
       sum(base_amount) as base, sum(total_due) as due, sum(total_paid) as paid, sum(balance) as balance
  from mod001_fp group by season_id order by season_id;
