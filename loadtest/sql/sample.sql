-- Read-only observability sample. Run every ~10 s during a stage (separate reader connection).
select now() at time zone 'utc' as ts,
  (select count(*) from pg_stat_activity) as conns_total,
  (select count(*) from pg_stat_activity where state = 'active') as conns_active,
  (select count(*) from pg_stat_activity where state = 'idle in transaction') as conns_idle_tx,
  (select count(*) from pg_stat_activity where wait_event_type = 'Lock') as waiting_on_lock,
  current_setting('max_connections')::int as max_conns,
  (select coalesce(string_agg(usename || ':' || n, ',' order by usename), '') from (select usename, count(*) n from pg_stat_activity where usename is not null group by usename) u) as conns_by_role,
  (select xact_commit from pg_stat_database where datname = current_database()) as xact_commit,
  (select xact_rollback from pg_stat_database where datname = current_database()) as xact_rollback,
  (select deadlocks from pg_stat_database where datname = current_database()) as deadlocks,
  (select round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) from pg_stat_database where datname = current_database()) as cache_hit_pct,
  (select count(*) from pg_locks where not granted) as locks_not_granted;
