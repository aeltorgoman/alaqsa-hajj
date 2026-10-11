-- ════════════════════════════════════════════════════════════
-- MOD-001 / PR 2 — تعبئةُ الفنادق للمواسم القائمة (بياناتٌ لا بنية)
-- ════════════════════════════════════════════════════════════
-- PR 1 أضاف `hotels` و`hotel_package_prices` والعمودين الفارغين. وهذه
-- الترحيلةُ تُسند البياناتِ القائمةَ إليها، **بلا تغييرِ رقمٍ ماليٍّ واحد**:
--
--   ١) فندقٌ واحدٌ لكلّ موسمٍ لا فندقَ له، وفيه اسمُ فندقٍ أو غرفٌ أو
--      حجّاج. الاسمُ والعنوانُ والرابطُ من `seasons.hotel_*`. وموسمٌ بلا
--      شيءٍ من ذلك (نشرٌ جديدٌ لم يُستعمل) لا يُخترع له فندق.
--   ٢) غرفُ الموسم ← فندقُه الوحيد.
--   ٣) حجّاجُه ← فندقُه المطلوب. و«الحاجّ» هنا بتعريف الواجهة الماليّة
--      نفسِه (`mapPassenger` ثمّ `isHajj`): كلُّ نوعٍ ليس «مرافق» ولا
--      «مشرف» ولا «إداري». فمن تحسبه صفحةُ الحسابات يُسعَّر بعد الترحيلة
--      كما قبلها. والإداريُّ ومن في حكمه لا يُمسّ (D7).
--   ٤) أسعارُ الباقات لكلّ فندقٍ أُنشئ هنا = **السعرُ الفعّالُ اليوم**
--      بالقاعدة نفسِها التي تقرأ بها `FinancePage`:
--        · موسمٌ مقفلٌ له لقطةُ تسعير ← اللقطة.
--        · موسمٌ مفتوح، أو مقفلٌ بلا لقطة («أُقفل قبل الآلية») ←
--          `pricing_settings` الحيّة — وهي ما تعرضه الشاشةُ له اليوم.
--        · مفتاحٌ غائبٌ عن مصدره ← لا صفّ ← صفر، وهو ما يحسبه اليوم
--          (`pricing[key]?.amount || 0`). فلا قيمةَ تُخترع (D6).
--
-- ⚠️ الموسمُ المقفلُ محميٌّ بـ`trg_reject_closed_season` (ث٣). والكتابةُ
--    فيه هنا إضافةُ أبٍ ونسخُ قيمٍ قائمة لا تعديلُ تاريخ. فتُفتح رايةُ
--    `app.season_maintenance` **داخل كتلة DO واحدة** بـ`set_config(…, true)`
--    فتعيش في معاملتها وتموت معها — المَنفذُ نفسُه الذي تستعمله
--    `delete_season()`، ولا يتغيّر الحارسُ الدائمُ بحرف.
-- ⚠️ لا حذفَ لصفٍّ ولا تعديلَ لعمودٍ غير `rooms.hotel_id`
--    و`passengers.requested_hotel_id`. والكتلةُ نفسُها تبرهن ذلك بالبصمات
--    قبل وبعد، وتبرهن تساوي السعر الأساسيّ لكلّ حاجّ، وإلا أُجهضت كلُّها.
-- ⚠️ تبعيّةُ الإطلاق (P1 — مراجعة #216، القرار: الخيار أ): الواجهةُ الحاليّة تحفظ
--    أسعارَ الباقات في `pricing_settings`، وهذه الترحيلةُ تنسخها إلى
--    `hotel_package_prices` مرّةً واحدة. فبين تطبيقها وإطلاق الواجهة الجديدة:
--      · يُمنع تعديلُ أسعار الباقات تشغيلياً؛
--      · وبوّابةٌ آليّةٌ في سير عمل الإطلاق (PR الإطلاق، لا هنا) تقارن للموسم
--        المفتوح سعرَ الباقة الفعّال العامّ بسعر فندقه، والصفُّ الغائبُ صفرٌ في
--        الطرفين، وأيُّ فرقٍ **يوقف الإطلاق** حتى يُعالَج.
--    ولا مزامنةَ آليّةَ مؤقّتة — قرارٌ صريحٌ لإبقاء البنية دنيا.
-- ⚠️ إعادةُ التشغيل آمنة: لا يُنشأ فندقٌ لموسمٍ له فندق، ولا يُمسّ إلا
--    الفارغ، ولا تُكتب أسعارٌ إلا لما أُنشئ في التشغيل نفسِه. وسجلُّ
--    الترحيلات يمنع التشغيلَ الثانيَ أصلاً.

do $backfill$
declare
  v_n            integer;
  v_ambiguous    text;
  v_hotels       integer := 0;
  v_rooms        integer := 0;
  v_pass         integer := 0;
  v_prices       integer := 0;
  v_mismatch     integer;
  -- بصماتٌ قبل: كلُّ ما لا يحقّ لهذه الترحيلة أن تمسّه
  b_pass  text; b_rooms text; b_pay text; b_charge text; b_ps text; b_snap text;
  b_seasons text; b_rcpt text; b_npass bigint; b_nrooms bigint;
  a_pass  text; a_rooms text; a_pay text; a_charge text; a_ps text; a_snap text;
  a_seasons text; a_rcpt text;
begin
  -- ── ٠) شروطٌ سابقة ──────────────────────────────────────────
  -- موسمٌ فيه أكثرُ من فندقٍ وبه غرفٌ أو حجّاجٌ بلا فندق: الإسنادُ
  -- غامضٌ، والغموضُ لا يُخمَّن. (لا يقع بعد PR 1 وحده؛ الفحصُ لأيّ بيئةٍ
  -- أُنشئ فيها فندقٌ يدوياً.)
  select string_agg(s.id::text, ', ') into v_ambiguous
    from public.seasons s
   where (select count(*) from public.hotels h where h.season_id = s.id) > 1
     and (exists (select 1 from public.rooms r where r.season_id = s.id and r.hotel_id is null)
       or exists (select 1 from public.passengers p where p.season_id = s.id and p.requested_hotel_id is null
                    and coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')));
  if v_ambiguous is not null then
    raise exception 'مواسمُ بأكثر من فندقٍ وفيها صفوفٌ بلا فندق (%): الإسنادُ غامض. عالِجها يدوياً قبل هذه الترحيلة.', v_ambiguous
      using errcode = 'P0001';
  end if;

  -- ── البصماتُ قبل ────────────────────────────────────────────
  select md5(coalesce(string_agg((to_jsonb(p) - 'requested_hotel_id')::text, '|' order by p.id), '')), count(*)
    into b_pass, b_npass from public.passengers p;
  select md5(coalesce(string_agg((to_jsonb(r) - 'hotel_id')::text, '|' order by r.id), '')), count(*)
    into b_rooms, b_nrooms from public.rooms r;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_pay    from public.payments x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_charge from public.custom_charges x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_ps     from public.pricing_settings x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.season_id, x.key), '')) into b_snap from public.season_pricing_snapshot x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_seasons from public.seasons x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into b_rcpt    from public.payment_receipts x;

  -- ── المَنفذ: هذه الكتلةُ وحدها ─────────────────────────────
  perform set_config('app.season_maintenance', 'on', true);

  -- ── ١) فندقٌ لكلّ موسمٍ يحتاجه ولا فندقَ له ─────────────────
  create temporary table if not exists mod001_new_hotels (hotel_id bigint primary key, season_id bigint not null) on commit drop;
  truncate mod001_new_hotels;

  with need as (
    select s.*
      from public.seasons s
     where not exists (select 1 from public.hotels h where h.season_id = s.id)
       and (nullif(btrim(coalesce(s.hotel_name, '')), '') is not null
         or exists (select 1 from public.rooms r where r.season_id = s.id)
         or exists (select 1 from public.passengers p where p.season_id = s.id
                      and coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')))
  ), ins as (
    insert into public.hotels (season_id, name, address, map_url, notes)
    select n.id,
           -- الاسمُ مطلوب. فإن غاب عن الموسم وله غرفٌ أو حجّاج سُمّي «الفندق»
           -- ويُعدَّل من صفحة الفنادق (D2).
           coalesce(nullif(btrim(coalesce(n.hotel_name, '')), ''), 'الفندق'),
           nullif(btrim(coalesce(n.hotel_address, '')), ''),
           case when btrim(coalesce(n.hotel_url, '')) ~* '^https?://' then btrim(n.hotel_url) end,
           -- رابطٌ ليس http(s) لا يُقبل في `map_url`، ولا يُرمى: يُحفظ ملاحظةً.
           case when nullif(btrim(coalesce(n.hotel_url, '')), '') is not null
                 and btrim(n.hotel_url) !~* '^https?://'
                then 'رابطُ الخريطة الأصليّ (غير http): ' || btrim(n.hotel_url) end
      from need n
    returning id, season_id
  )
  insert into mod001_new_hotels (hotel_id, season_id) select id, season_id from ins;
  get diagnostics v_hotels = row_count;

  -- ── ٢) الغرف ← فندقُ موسمها الوحيد ───────────────────────────
  update public.rooms r
     set hotel_id = h.id
    from public.hotels h
   where h.season_id = r.season_id
     and r.hotel_id is null
     and (select count(*) from public.hotels h2 where h2.season_id = r.season_id) = 1;
  get diagnostics v_rooms = row_count;

  -- ── ٣) الحجّاج ← فندقُ موسمهم الوحيد مطلوباً ─────────────────
  update public.passengers p
     set requested_hotel_id = h.id
    from public.hotels h
   where h.season_id = p.season_id
     and p.requested_hotel_id is null
     and coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')
     and (select count(*) from public.hotels h2 where h2.season_id = p.season_id) = 1;
  get diagnostics v_pass = row_count;

  -- ── ٤) أسعارُ الباقات = السعرُ الفعّالُ اليوم ─────────────────
  -- للفنادق المُنشأة هنا وحدها. والمصدرُ قاعدةُ `FinancePage.loadFinanceData`:
  -- مقفلٌ وله لقطةٌ (أيُّ صفّ) ← اللقطة، وإلا ← الحيّ.
  insert into public.hotel_package_prices (hotel_id, season_id, package_key, amount)
  select nh.hotel_id, nh.season_id, src.key, src.amount
    from mod001_new_hotels nh
    join public.seasons s on s.id = nh.season_id
    cross join lateral (
      select sps.key, sps.amount
        from public.season_pricing_snapshot sps
       where s.closed_at is not null
         and exists (select 1 from public.season_pricing_snapshot x where x.season_id = s.id)
         and sps.season_id = s.id
      union all
      select ps.key, ps.amount
        from public.pricing_settings ps
       where not (s.closed_at is not null
                  and exists (select 1 from public.season_pricing_snapshot x where x.season_id = s.id))
    ) src
   where src.key in ('package_double', 'package_triple', 'package_quad', 'package_suite');
  get diagnostics v_prices = row_count;

  perform set_config('app.season_maintenance', 'off', true);

  -- ── ٥) البرهان — وإلا أُجهضت الكتلةُ كلُّها ───────────────────
  -- أ) لا صفَّ حُذف، ولا عمودَ تغيّر سوى العمودين المقصودين
  select md5(coalesce(string_agg((to_jsonb(p) - 'requested_hotel_id')::text, '|' order by p.id), ''))
    into a_pass from public.passengers p;
  select md5(coalesce(string_agg((to_jsonb(r) - 'hotel_id')::text, '|' order by r.id), ''))
    into a_rooms from public.rooms r;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_pay    from public.payments x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_charge from public.custom_charges x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_ps     from public.pricing_settings x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.season_id, x.key), '')) into a_snap from public.season_pricing_snapshot x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_seasons from public.seasons x;
  select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) into a_rcpt    from public.payment_receipts x;

  if a_pass <> b_pass or a_rooms <> b_rooms then
    raise exception 'تغيّر في الحجّاج أو الغرف ما لا يحقّ لهذه الترحيلة أن تمسّه.' using errcode = 'P0001';
  end if;
  if a_pay <> b_pay or a_charge <> b_charge or a_ps <> b_ps or a_snap <> b_snap or a_seasons <> b_seasons or a_rcpt <> b_rcpt then
    raise exception 'تغيّرت الدفعاتُ أو الإيصالاتُ أو الرسومُ أو الأسعارُ أو اللقطاتُ أو المواسم.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.passengers) <> b_npass or (select count(*) from public.rooms) <> b_nrooms then
    raise exception 'تغيّر عددُ الحجّاج أو الغرف.' using errcode = 'P0001';
  end if;

  -- ب) لا غرفةَ ولا حاجَّ بلا فندقٍ في موسمٍ له فندقٌ واحد
  select count(*) into v_n from public.rooms r
   where r.hotel_id is null
     and (select count(*) from public.hotels h where h.season_id = r.season_id) = 1;
  if v_n > 0 then
    raise exception 'بقيت % غرفةً بلا فندق.', v_n using errcode = 'P0001';
  end if;
  select count(*) into v_n from public.passengers p
   where p.requested_hotel_id is null
     and coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')
     and (select count(*) from public.hotels h where h.season_id = p.season_id) = 1;
  if v_n > 0 then
    raise exception 'بقي % حاجّاً بلا فندقٍ مطلوب.', v_n using errcode = 'P0001';
  end if;

  -- ج) السعرُ الأساسيُّ لكلّ حاجٍّ يُسعَّر: قبل = بعد، حرفاً بحرف.
  --    «قبل» بقاعدة الواجهة: النوعُ الغائبُ «ثنائية» (`mapPassenger`)،
  --    ومفتاحُ الباقة من `getPackageKey`، والمبلغُ `map[key]?.amount || 0`
  --    من اللقطة أو الحيّ. «بعد» من سعر الفندق المطلوب، وغيابُه صفر.
  --    و«خاص» سعرُه `custom_price` ولا يمسّه شيءٌ هنا.
  with pil as (
    select p.id, p.season_id, p.requested_hotel_id, s.closed_at,
           case coalesce(nullif(p.hotel_type, ''), 'ثنائية')
             when 'ثنائية' then 'package_double'
             when 'ثلاثية' then 'package_triple'
             when 'رباعية' then 'package_quad'
             when 'فردية'  then 'package_suite'
           end as pkg,
           (s.closed_at is not null
            and exists (select 1 from public.season_pricing_snapshot x where x.season_id = s.id)) as use_snap
      from public.passengers p
      join public.seasons s on s.id = p.season_id
     where coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')
  ), cmp as (
    select pil.id,
           case when pil.pkg is null then 0
                when pil.use_snap then coalesce((select sps.amount from public.season_pricing_snapshot sps
                                                  where sps.season_id = pil.season_id and sps.key = pil.pkg), 0)
                else coalesce((select ps.amount from public.pricing_settings ps where ps.key = pil.pkg), 0)
           end as before_amount,
           case when pil.pkg is null then 0
                else coalesce((select hp.amount from public.hotel_package_prices hp
                                where hp.hotel_id = pil.requested_hotel_id and hp.package_key = pil.pkg), 0)
           end as after_amount
      from pil
  )
  select count(*) into v_mismatch from cmp where before_amount is distinct from after_amount;
  if v_mismatch > 0 then
    raise exception 'السعرُ الأساسيُّ تغيّر لـ% حاجّاً — أُجهضت التعبئةُ كلُّها.', v_mismatch using errcode = 'P0001';
  end if;

  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    raise exception 'رايةُ الصيانة بقيت مفتوحة.' using errcode = 'P0001';
  end if;

  raise notice 'MOD-001 backfill: hotels=% rooms=% pilgrims=% prices=% (package-price mismatches: 0)',
    v_hotels, v_rooms, v_pass, v_prices;
end;
$backfill$;
