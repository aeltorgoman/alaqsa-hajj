-- (included) open a transaction acting as the authenticated Demo
-- operator — the same identity PostgREST would establish from a JWT.
-- has_permission(), RLS policies and receipt numbering all run for real.
select set_config('demo.operator_id', :'operator_id', false) \g /dev/null
do $$ begin
  if current_setting('demo.operator_id') = '' then
    raise exception 'Demo operator not found (DEMO_OPERATOR_EMAIL). Run tools/demo-operator.sh first.';
  end if;
end $$;
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('demo.operator_id'), 'role', 'authenticated')::text, true) \g /dev/null
set local role authenticated;
