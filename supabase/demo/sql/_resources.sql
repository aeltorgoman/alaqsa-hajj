-- (included) master data of the season named by demo.season_key.
-- Inserted while that season is the open one; season_id comes from the
-- column default active_season_id() — the real mechanism, not bypassed.
begin;
do $$
declare k text := current_setting('demo.season_key');
begin
  if pg_temp.season_id(k) is distinct from public.active_season_id() then
    raise exception 'season % must be the open season while its master data is created', k;
  end if;
  insert into public.buses (name, type, capacity)
  select r->>'name', r->>'type', (r->>'capacity')::int
    from jsonb_array_elements(pg_temp.ds()->'resources'->k->'buses') with ordinality t(r, n) order by n;
  insert into public.camps (name, gender, type, page_type, capacity)
  select r->>'name', r->>'gender', r->>'type', r->>'page_type', (r->>'capacity')::int
    from jsonb_array_elements(pg_temp.ds()->'resources'->k->'camps') with ordinality t(r, n) order by n;
  insert into public.rooms (number, floor, type, capacity)
  select r->>'number', r->>'floor', r->>'type', (r->>'capacity')::int
    from jsonb_array_elements(pg_temp.ds()->'resources'->k->'rooms') with ordinality t(r, n) order by n;
  insert into public.flights (name, type, airline, date, time, arrival_date, arrival_time, from_airport, to_airport, capacity)
  select r->>'name', r->>'type', r->>'airline', r->>'date', r->>'time', r->>'arrival_date', r->>'arrival_time',
         r->>'from_airport', r->>'to_airport', (r->>'capacity')::int
    from jsonb_array_elements(pg_temp.ds()->'resources'->k->'flights') with ordinality t(r, n) order by n;
end $$;
commit;
