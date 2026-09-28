-- Read-only: slowest/most expensive portal statements since the last reset (pg_stat_statements).
select calls, round(mean_exec_time::numeric, 2) mean_ms, round(max_exec_time::numeric, 2) max_ms,
  round(total_exec_time::numeric, 0) total_ms, rows, left(regexp_replace(query, '\s+', ' ', 'g'), 140) query
from extensions.pg_stat_statements
where query ~* '(create_pilgrim_session|get_pilgrim_portal_by_session|_pilgrim_session_owner|mark_pilgrim_notification_read|revoke_pilgrim_session|consume_rate_limit|rate_limit_exceeded|company_profile_public|company_assets|passengers|pilgrim_sessions)'
order by total_exec_time desc limit 25;
