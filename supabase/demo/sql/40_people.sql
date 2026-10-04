\set ON_ERROR_STOP on
-- 40 — active season people: 120 حاج + 6 staff (unallocated, no documents)
\ir 00_guard.sql
\echo '  40: active season — pilgrims and staff'
select set_config('demo.season_key', 'active', false) \g /dev/null
\ir _people.sql
