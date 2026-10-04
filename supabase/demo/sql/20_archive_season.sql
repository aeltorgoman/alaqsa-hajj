\set ON_ERROR_STOP on
-- ════════════════════════════════════════════════════════════════
-- 20 — archived season (1447): created OPEN and fully populated
-- ════════════════════════════════════════════════════════════════
-- Writes to a closed season are rejected by trg_reject_closed_season, so
-- the only real path is the chronological one: populate while open, then
-- close with close_season() (file 22).
\ir 00_guard.sql
\echo '  20: archived season — season, master data, people, allocation'
begin;
insert into public.seasons (name, hijri_year, hotel_name, hotel_address, hotel_url, mina_address, mina_url, arafa_address, arafa_url)
select s->>'name', (s->>'hijri_year')::int, s->>'hotel_name', s->>'hotel_address', s->>'hotel_url',
       s->>'mina_address', s->>'mina_url', s->>'arafa_address', s->>'arafa_url'
  from (select pg_temp.ds()->'seasons'->'archive' s) x;
commit;
select set_config('demo.season_key', 'archive', false) \g /dev/null
\ir _resources.sql
\ir _people.sql
\ir _allocation.sql
