-- Read-only fingerprint of data the portal must NOT change. Taken before and after every run.
select 'passengers' t, count(*) n, md5(string_agg(id::text||'|'||coalesce(passport,'')||'|'||coalesce(name_ar,'')||'|'||coalesce(room_id::text,'')||'|'||coalesce(bus_id::text,'')||'|'||coalesce(updated_at::text,''), ',' order by id)) h from public.passengers
union all select 'rooms', count(*), md5(string_agg(id||'|'||number||'|'||coalesce(capacity::text,''), ',' order by id)) from public.rooms
union all select 'buses', count(*), md5(string_agg(id||'|'||name, ',' order by id)) from public.buses
union all select 'flights', count(*), md5(string_agg(id||'|'||name, ',' order by id)) from public.flights
union all select 'announcements', count(*), md5(string_agg(id||'|'||body, ',' order by id)) from public.announcements
union all select 'seasons', count(*), md5(string_agg(id||'|'||name||'|'||coalesce(closed_at::text,''), ',' order by id)) from public.seasons
-- expected activity (reported separately, not a failure):
union all select 'pilgrim_sessions(active)', count(*) filter (where revoked_at is null), null from public.pilgrim_sessions
union all select 'pilgrim_sessions(revoked)', count(*) filter (where revoked_at is not null), null from public.pilgrim_sessions
union all select 'notification_deliveries', count(*), null from public.notification_deliveries
union all select 'rate_limits:' || scope, sum(hits), null from public.edge_rate_limits group by scope
order by 1;
