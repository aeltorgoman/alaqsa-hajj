\set ON_ERROR_STOP on
-- 50 — active season allocation (rooms, buses, camps, flights) under the real triggers
\ir 00_guard.sql
\echo '  50: active season — allocation'
select set_config('demo.season_key', 'active', false) \g /dev/null
\ir _allocation.sql
