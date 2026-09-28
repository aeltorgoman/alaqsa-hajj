-- Load-test project ONLY. Removes the synthetic season and everything that hangs off it.
-- The preferred cleanup is deleting the whole disposable project; this is for re-seeding.
do $$ begin
  if exists (select 1 from public.passengers where coalesce(passport,'') !~ '^L[TD][0-9]{6}$')
     or exists (select 1 from public.seasons where name <> 'LT-1447') then
    raise exception 'REFUSING: non-synthetic data present - not the load-test project';
  end if;
end $$;
begin;
set local app.season_maintenance = 'on';
delete from public.pilgrim_sessions;
delete from public.edge_rate_limits;
delete from public.notification_deliveries;
delete from public.announcements;
delete from public.passengers;
delete from public.rooms; delete from public.buses; delete from public.camps; delete from public.flights;
delete from public.seasons where name = 'LT-1447';
commit;
