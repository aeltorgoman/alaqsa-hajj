\set ON_ERROR_STOP on
-- ════════════════════════════════════════════════════════════════
-- 22 — close 1447 with the real close_season(); open 1448; live prices
-- ════════════════════════════════════════════════════════════════
-- close_season() snapshots pricing_settings into season_pricing_snapshot
-- (never seeded by hand) and opens the next season in one transaction.
-- The actor is NULL on purpose: a tool did this, so the audit row says
-- actor_source = 'system' rather than inventing a human.
\ir 00_guard.sql
\echo '  22: close archived season → open active season; live pricing; season locations'
begin;
select public.close_season(s->>'name', (s->>'hijri_year')::int, 'بذرة العرض التجريبي', null::uuid)
  from (select pg_temp.ds()->'seasons'->'active' s) x \g /dev/null
update public.pricing_settings p
   set amount = (pg_temp.ds()->'pricing'->'live'->>p.key)::numeric, updated_at = now()
 where pg_temp.ds()->'pricing'->'live' ? p.key;
commit;
-- the active season's locations, through the same RPC the Settings page uses
\ir _as_operator.sql
select public.update_active_season(s->>'name', s->>'hotel_name', s->>'hotel_address', s->>'hotel_url',
                                   s->>'mina_address', s->>'mina_url', s->>'arafa_address', s->>'arafa_url')
  from (select current_setting('demo.dataset')::jsonb->'seasons'->'active' s) x \g /dev/null
commit;
