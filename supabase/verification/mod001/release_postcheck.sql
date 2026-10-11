-- ═══════════════════════════════════════════════════════════════
-- MOD-001 — فحصُ ما بعد الدفع (قراءةٌ محضة)
-- ═══════════════════════════════════════════════════════════════
-- البنيةُ والصلاحياتُ والتعبئةُ والأسعارُ كما قُصدت. وتطابقُ البصمات
-- (release_fingerprint.sql) يُفحص في سير العمل بمقارنة الملفّين.
--
--   psql "$URL" -X -v ON_ERROR_STOP=1 \
--        -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" \
--        -f supabase/verification/mod001/release_postcheck.sql

\set ON_ERROR_STOP on

do $$
declare
  v_bad text[] := '{}';
  v_n   integer;
  v_fn  text;
begin
  -- ١) البنية
  if to_regclass('public.hotels') is null or to_regclass('public.hotel_package_prices') is null then
    v_bad := v_bad || 'hotels tables missing'::text;
  end if;
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('hotels', 'hotel_package_prices') and c.relrowsecurity;
  if v_n <> 2 then v_bad := v_bad || 'RLS not enabled on both hotel tables'::text; end if;
  if (select count(*) from pg_constraint where conname in
        ('rooms_hotel_season_fkey', 'passengers_requested_hotel_season_fkey', 'hotel_package_prices_hotel_season_fkey')) <> 3 then
    v_bad := v_bad || 'a composite foreign key is missing'::text;
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgname = 'trg_reject_closed_season'
        and tgrelid in ('public.hotels'::regclass, 'public.hotel_package_prices'::regclass)) <> 2 then
    v_bad := v_bad || 'closed-season trigger missing on a hotel table'::text;
  end if;

  -- ٢) الدوالّ: SECURITY DEFINER، search_path ثابت، لا anon (البوابة وحدها لها anon)
  foreach v_fn in array array[
    'public.assign_passenger_room(bigint, bigint)', 'public.set_room_order(bigint, bigint[])',
    'public.delete_hotel(bigint)', 'public.update_active_season(text, text, text, text, text)',
    'public.update_active_season(text, text, text, text, text, text, text, text)',
    'public.get_pilgrim_portal_by_session(text)', 'public.delete_season(bigint, uuid)'] loop
    if to_regprocedure(v_fn) is null then
      v_bad := v_bad || ('missing ' || v_fn); continue;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = v_fn::regprocedure and p.prosecdef
                    and p.proconfig @> array['search_path=public, pg_temp']) then
      v_bad := v_bad || ('not definer with fixed search_path: ' || v_fn);
    end if;
    if v_fn <> 'public.get_pilgrim_portal_by_session(text)' and has_function_privilege('anon', v_fn, 'EXECUTE') then
      v_bad := v_bad || ('anon may execute ' || v_fn);
    end if;
  end loop;
  if has_table_privilege('anon', 'public.hotels', 'SELECT') or has_table_privilege('authenticated', 'public.hotels', 'DELETE') then
    v_bad := v_bad || 'hotels grants are wider than intended'::text;
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'passengers' and cmd = 'UPDATE') <> 1 then
    v_bad := v_bad || 'passengers update policies changed'::text;
  end if;

  -- ٣) التعبئة: كلُّ موسمٍ ذي غرفٍ أو حجّاجٍ مُسعَّرين له فندقٌ واحد، والكلُّ مربوط
  select count(*) into v_n from public.seasons s
   where (exists (select 1 from public.rooms r where r.season_id = s.id)
       or exists (select 1 from public.passengers p where p.season_id = s.id
                   and coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')))
     and (select count(*) from public.hotels h where h.season_id = s.id) <> 1;
  if v_n <> 0 then v_bad := v_bad || ('seasons without exactly one hotel: ' || v_n); end if;
  select count(*) into v_n from public.rooms where hotel_id is null;
  if v_n <> 0 then v_bad := v_bad || ('rooms without hotel: ' || v_n); end if;
  select count(*) into v_n from public.passengers
   where requested_hotel_id is null and coalesce(passenger_type, '') not in ('مرافق', 'مشرف', 'إداري');
  if v_n <> 0 then v_bad := v_bad || ('priced pilgrims without requested hotel: ' || v_n); end if;
  select count(*) into v_n from public.passengers
   where requested_hotel_id is not null and passenger_type in ('مرافق', 'مشرف', 'إداري');
  if v_n <> 0 then v_bad := v_bad || ('staff given a requested hotel: ' || v_n); end if;

  -- ٤) السعرُ الأساسيُّ لكلّ حاجٍّ: قاعدةُ الواجهة الحاليّة = سعرُ الفندق المطلوب
  with pil as (
    select p.id, p.season_id, p.requested_hotel_id,
           case coalesce(nullif(p.hotel_type, ''), 'ثنائية')
             when 'ثنائية' then 'package_double' when 'ثلاثية' then 'package_triple'
             when 'رباعية' then 'package_quad'   when 'فردية'  then 'package_suite' end as pkg,
           (s.closed_at is not null
            and exists (select 1 from public.season_pricing_snapshot x where x.season_id = s.id)) as use_snap
      from public.passengers p join public.seasons s on s.id = p.season_id
     where coalesce(p.passenger_type, '') not in ('مرافق', 'مشرف', 'إداري')
  )
  select count(*) into v_n from pil
   where coalesce(case when pil.pkg is null then 0
                       when pil.use_snap then (select sps.amount from public.season_pricing_snapshot sps
                                                where sps.season_id = pil.season_id and sps.key = pil.pkg)
                       else (select ps.amount from public.pricing_settings ps where ps.key = pil.pkg) end, 0)
         <> coalesce(case when pil.pkg is null then 0
                          else (select hp.amount from public.hotel_package_prices hp
                                 where hp.hotel_id = pil.requested_hotel_id and hp.package_key = pil.pkg) end, 0);
  if v_n <> 0 then v_bad := v_bad || ('pilgrims whose base price changed: ' || v_n); end if;

  raise notice 'postcheck: hotels=% prices=% rooms_linked=% pilgrims_with_hotel=%',
    (select count(*) from public.hotels), (select count(*) from public.hotel_package_prices),
    (select count(*) from public.rooms where hotel_id is not null),
    (select count(*) from public.passengers where requested_hotel_id is not null);

  if cardinality(v_bad) > 0 then
    raise exception 'POSTCHECK FAILED: %', array_to_string(v_bad, ' | ');
  end if;
  raise notice 'POSTCHECK PASS';
end $$;
