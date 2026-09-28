-- Load-test project ONLY. Clears expected test activity between stages; never touches seeded data.
do $$ begin
  if exists (select 1 from public.passengers where coalesce(passport,'') !~ '^L[TD][0-9]{6}$') then
    raise exception 'REFUSING: non-synthetic passengers present - not the load-test project';
  end if;
end $$;
delete from public.pilgrim_sessions;
delete from public.edge_rate_limits;
delete from public.notification_deliveries;
select extensions.pg_stat_statements_reset();
