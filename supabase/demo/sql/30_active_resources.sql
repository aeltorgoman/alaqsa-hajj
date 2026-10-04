\set ON_ERROR_STOP on
-- 30 — active season (1448) master data: buses, camps, rooms, flights
\ir 00_guard.sql
\echo '  30: active season — buses, camps, rooms, flights'
select set_config('demo.season_key', 'active', false) \g /dev/null
\ir _resources.sql
