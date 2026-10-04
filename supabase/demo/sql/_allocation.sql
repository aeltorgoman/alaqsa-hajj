-- (included) allocation of the season named by demo.season_key.
-- One UPDATE per person: every capacity / gender / page-type /
-- cross-season / flight-booking trigger checks each assignment exactly
-- as it does for a staff member clicking in the UI.
begin;
do $$
declare
  k text := current_setting('demo.season_key');
  p jsonb;
begin
  for p in select x from jsonb_array_elements(pg_temp.ds()->'people') with ordinality t(x, n)
            where x->>'season' = k order by n loop
    update public.passengers set
      room_id          = pg_temp.room_id(k,   p->'alloc'->>'room'),
      bus_id           = pg_temp.bus_id(k,    p->'alloc'->>'bus'),
      camp_mina_id     = pg_temp.camp_id(k,   p->'alloc'->>'mina'),
      camp_arafa_id    = pg_temp.camp_id(k,   p->'alloc'->>'arafa'),
      flight_id        = pg_temp.flight_id(k, p->'alloc'->>'out'),
      return_flight_id = pg_temp.flight_id(k, p->'alloc'->>'ret'),
      updated_by       = 'demo-seed'
    where passport = p->>'passport';
    if not found then raise exception 'person % not found for allocation', p->>'ref'; end if;
  end loop;
  -- per-resource ordering columns follow registration order
  update public.passengers x set bus_sort_order = o.n from (
    select id, row_number() over (partition by bus_id order by sort_order, id) * 10 n from public.passengers
     where season_id = pg_temp.season_id(k) and bus_id is not null) o where o.id = x.id;
  update public.passengers x set room_sort_order = o.n from (
    select id, row_number() over (partition by room_id order by sort_order, id) * 10 n from public.passengers
     where season_id = pg_temp.season_id(k) and room_id is not null) o where o.id = x.id;
  update public.passengers x set camp_mina_sort_order = o.n from (
    select id, row_number() over (partition by camp_mina_id order by sort_order, id) * 10 n from public.passengers
     where season_id = pg_temp.season_id(k) and camp_mina_id is not null) o where o.id = x.id;
  update public.passengers x set camp_arafa_sort_order = o.n from (
    select id, row_number() over (partition by camp_arafa_id order by sort_order, id) * 10 n from public.passengers
     where season_id = pg_temp.season_id(k) and camp_arafa_id is not null) o where o.id = x.id;
end $$;
commit;
