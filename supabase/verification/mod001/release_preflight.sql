-- ═══════════════════════════════════════════════════════════════
-- MOD-001 — فحصُ ما قبل الدفع (قراءةٌ محضة)
-- ═══════════════════════════════════════════════════════════════
-- يتحقّق أنّ القاعدةَ هي بالضبط ما كُتبت عليه ترحيلاتُ PR 1–3، وإلا يرفض.
--
--   psql "$URL" -X -v ON_ERROR_STOP=1 -v ds_md5=<md5> \
--        -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" \
--        -f supabase/verification/mod001/release_preflight.sql
--
-- `ds_md5` = بصمةُ `pg_get_functiondef(delete_season)` التي عدّلتها ترحيلةُ PR 1
-- (مثبَّتةٌ في سير العمل). جسمٌ مختلفٌ يعني تعديلاً من طرفٍ ثالثٍ كان سيُمحى بصمت.

\set ON_ERROR_STOP on

select set_config('mod001.ds_md5', :'ds_md5', false);

do $$
declare
  v_bad  text[] := '{}';
  v_md5  text;
  v_n    integer;
begin
  -- ١) محرّكُ الإنتاج نفسُه: Postgres 17
  if current_setting('server_version_num')::int / 10000 <> 17 then
    v_bad := v_bad || ('server is not Postgres 17: ' || current_setting('server_version'));
  end if;

  -- ٢) لا شيءَ من MOD-001 موجودٌ سلفاً
  if to_regclass('public.hotels') is not null or to_regclass('public.hotel_package_prices') is not null then
    v_bad := v_bad || 'hotels / hotel_package_prices already exist'::text;
  end if;
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'rooms' and column_name = 'hotel_id')
       or (table_name = 'passengers' and column_name = 'requested_hotel_id'));
  if v_n <> 0 then v_bad := v_bad || 'rooms.hotel_id / passengers.requested_hotel_id already exist'::text; end if;
  select count(*) into v_n from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
   where ns.nspname = 'public'
     and pr.proname in ('assign_passenger_room', 'set_room_order', 'delete_hotel', 'mod001_may_place_passenger',
                        'mod001_single_hotel_of_season', 'rooms_fill_single_hotel', 'passengers_fill_single_requested_hotel');
  if v_n <> 0 then v_bad := v_bad || ('MOD-001 functions already exist: ' || v_n); end if;

  -- ٣) جسمُ delete_season هو ما كُتبت عليه ترحيلةُ PR 1
  select md5(pg_get_functiondef(pr.oid)) into v_md5
    from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
   where ns.nspname = 'public' and pr.proname = 'delete_season';
  raise notice 'delete_season md5=%', v_md5;
  if v_md5 is distinct from current_setting('mod001.ds_md5') then
    v_bad := v_bad || ('delete_season body differs from the one PR 1 patches: ' || coalesce(v_md5, 'missing'));
  end if;

  -- ٤) ما تعتمد عليه الترحيلاتُ موجودٌ بتوقيعه
  if to_regprocedure('public.active_season_id()') is null
     or to_regprocedure('public.reject_write_closed_season()') is null
     or to_regprocedure('public.has_permission(text)') is null
     or to_regprocedure('public.is_active_employee()') is null
     or to_regprocedure('public._pilgrim_session_owner(text)') is null
     or to_regprocedure('public.get_pilgrim_portal_by_session(text)') is null
     or to_regprocedure('public.update_active_season(text, text, text, text, text, text, text, text)') is null
     or to_regprocedure('public.update_active_season(text, text, text, text, text)') is not null then
    v_bad := v_bad || 'a function the migrations depend on is missing or already replaced'::text;
  end if;
  if to_regclass('public.season_pricing_snapshot') is null or to_regclass('public.pricing_settings') is null
     or to_regclass('public.payment_receipts') is null then
    v_bad := v_bad || 'a pricing / receipts table is missing'::text;
  end if;

  -- ٥) شرطُ التعبئة: موسمٌ مفتوحٌ واحدٌ بالضبط
  select count(*) into v_n from public.seasons where closed_at is null;
  if v_n <> 1 then v_bad := v_bad || ('expected exactly one open season, found ' || v_n); end if;

  -- ٦) معلوماتٌ لا تحجب (أعدادٌ لا بيانات)
  raise notice 'inventory: seasons=% rooms=% passengers=% non_standard_types=% non_http_hotel_urls=%',
    (select count(*) from public.seasons), (select count(*) from public.rooms), (select count(*) from public.passengers),
    (select count(*) from public.passengers where coalesce(passenger_type, '') not in ('', 'حاج', 'مرافق', 'مشرف', 'إداري')),
    (select count(*) from public.seasons where nullif(btrim(coalesce(hotel_url, '')), '') is not null and hotel_url !~* '^https?://');

  if cardinality(v_bad) > 0 then
    raise exception 'PREFLIGHT BLOCKED: %', array_to_string(v_bad, ' | ');
  end if;
  raise notice 'PREFLIGHT PASS';
end $$;
