\set ON_ERROR_STOP on
-- ════════════════════════════════════════════════════════════════
-- 21 — archived season: announcement + receipts, as the Demo operator
-- ════════════════════════════════════════════════════════════════
\ir 00_guard.sql
\echo '  21: archived season — announcement + receipts (authenticated operator)'
select set_config('demo.season_key', 'archive', false) \g /dev/null
\ir _as_operator.sql
select public.set_season_receipt_start(
  (select id from public.seasons where hijri_year = (current_setting('demo.dataset')::jsonb->'seasons'->'archive'->>'hijri_year')::int),
  (current_setting('demo.dataset')::jsonb->'seasons'->'archive'->>'receipt_start_number')::int) \g /dev/null
insert into public.announcements (title, body, priority, show_at, expires_at, target_type, target_ids, created_by)
select a->>'title', a->>'body', a->>'priority', (a->>'show_at')::timestamptz, (a->>'expires_at')::timestamptz,
       a->>'target_type', '{}'::bigint[], 'demo-seed'
  from jsonb_array_elements(current_setting('demo.dataset')::jsonb->'announcements') a
 where a->>'season' = 'archive';
\ir _receipts.sql
commit;
