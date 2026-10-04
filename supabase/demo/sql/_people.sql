-- (included) people of the season named by demo.season_key — registered
-- without allocation and without any document reference. Documents are
-- referenced only by the Storage loader, after each object exists.
begin;
do $$
declare k text := current_setting('demo.season_key');
begin
  if pg_temp.season_id(k) is distinct from public.active_season_id() then
    raise exception 'season % must be the open season while its people are registered', k;
  end if;
  insert into public.passengers (
    name_ar, short_ar, name_en, short_en, passport, national_id, nat, dob, expiry, id_expiry,
    gender, phone, family_id, passenger_type,
    bus, flight, hotel_type, hotel_view, camp_mina, camp_arafa, custom_price, wants_flight,
    sort_order, created_by)
  select p->>'name_ar', p->>'short_ar', p->>'name_en', p->>'short_en', p->>'passport', p->>'national_id',
         p->>'nat', p->>'dob', p->>'expiry', p->>'id_expiry', p->>'gender', p->>'phone', p->>'family_id',
         p->>'passenger_type',
         p->'services'->>'bus', p->'services'->>'flight', p->'services'->>'hotel_type', p->'services'->>'hotel_view',
         p->'services'->>'camp_mina', p->'services'->>'camp_arafa', (p->'services'->>'custom_price')::numeric,
         (p->>'wants_flight')::boolean, (p->>'sort_order')::int, 'demo-seed'
    from jsonb_array_elements(pg_temp.ds()->'people') with ordinality t(p, n)
   where p->>'season' = k
   order by n;
end $$;
commit;
