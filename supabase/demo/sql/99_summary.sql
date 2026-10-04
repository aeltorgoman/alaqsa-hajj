\set ON_ERROR_STOP on
-- 99 — read-only summary of what was planted (the verifier is separate)
\ir 00_guard.sql
\echo '  99: summary'
select s.hijri_year, s.name, case when s.closed_at is null then 'active' else 'archived' end as state,
       (select count(*) from public.passengers p where p.season_id = s.id) as passengers,
       (select count(*) from public.buses b where b.season_id = s.id) as buses,
       (select count(*) from public.camps c where c.season_id = s.id) as camps,
       (select count(*) from public.rooms r where r.season_id = s.id) as rooms,
       (select count(*) from public.flights f where f.season_id = s.id) as flights,
       (select count(*) from public.payment_receipts r where r.season_id = s.id) as receipts,
       s.receipt_next_number
  from public.seasons s order by s.hijri_year;
