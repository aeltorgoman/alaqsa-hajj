-- ════════════════════════════════════════════════════════════════
-- 00_guard.sql — in-database Demo guard (included by EVERY seed file)
-- ════════════════════════════════════════════════════════════════
-- The shell guard (tools/assert-demo-target.sh) has already checked the
-- connection. This file asks the database itself, so a hand-run
-- `psql -f` against the wrong database still stops here:
--   · the Production ref is refused outright;
--   · the Demo sentinel row must exist and name the same ref;
--   · the dataset must be the Demo dataset.
-- It also loads the dataset into a session setting and defines
-- session-only helpers in pg_temp (no schema object is created).
\set ON_ERROR_STOP on
\set QUIET on
select set_config('demo.ref', :'demo_ref', false) \g /dev/null
select set_config('demo.operator_email', :'operator_email', false) \g /dev/null
-- the dataset becomes readable ONLY after every check below passes: if the
-- guard fails, every later statement that reads it fails too.
select set_config('demo.dataset', '', false) \g /dev/null
\set dataset `cat :'dataset_path'`
select set_config('demo.dataset_candidate', :'dataset', false) \g /dev/null
\unset dataset

do $guard$
declare v_env text; v_ref text; v_ds jsonb;
begin
  if current_setting('demo.ref') = 'zkucwcnclbfvukhdqhgc' then
    raise exception 'DEMO GUARD: the PRODUCTION ref was supplied — refusing.';
  end if;
  if current_setting('demo.ref') !~ '^([a-z]{20}|local)$' then
    raise exception 'DEMO GUARD: demo_ref is not a well-formed ref.';
  end if;
  select metadata->>'environment', metadata->>'project_ref' into v_env, v_ref
    from public.company_assets where asset_key = 'demo_environment_marker';
  if v_env is distinct from 'demo' then
    raise exception 'DEMO GUARD: no Demo sentinel in this database — it is not the Demo. Nothing was written.';
  end if;
  if v_ref is distinct from current_setting('demo.ref') then
    raise exception 'DEMO GUARD: the Demo sentinel names a different ref. Nothing was written.';
  end if;
  v_ds := current_setting('demo.dataset_candidate')::jsonb;
  if v_ds->>'dataset' is distinct from 'alaqsa-hajj-demo-dataset' or (v_ds->>'synthetic')::boolean is not true then
    raise exception 'DEMO GUARD: the dataset is not the synthetic Demo dataset.';
  end if;
  perform set_config('demo.dataset', v_ds::text, false);
  perform set_config('demo.dataset_candidate', '', false);
end
$guard$;

-- ── session-only helpers (pg_temp: vanish with the session) ─────
create or replace function pg_temp.ds() returns jsonb language sql stable
  as $$ select current_setting('demo.dataset')::jsonb $$;
create or replace function pg_temp.season_id(p_key text) returns bigint language sql stable
  as $$ select s.id from public.seasons s where s.hijri_year = (pg_temp.ds()->'seasons'->p_key->>'hijri_year')::int $$;
create or replace function pg_temp.person(p_ref text) returns jsonb language sql stable
  as $$ select p from jsonb_array_elements(pg_temp.ds()->'people') p where p->>'ref' = p_ref $$;
create or replace function pg_temp.pid(p_ref text) returns bigint language sql stable
  as $$ select x.id from public.passengers x where x.passport = pg_temp.person(p_ref)->>'passport' $$;
create or replace function pg_temp.res(p_season text, p_kind text, p_ref text) returns jsonb language sql stable
  as $$ select r from jsonb_array_elements(pg_temp.ds()->'resources'->p_season->p_kind) r where r->>'ref' = p_ref $$;
create or replace function pg_temp.bus_id(p_season text, p_ref text) returns bigint language sql stable
  as $$ select b.id from public.buses b where b.season_id = pg_temp.season_id(p_season) and b.name = pg_temp.res(p_season,'buses',p_ref)->>'name' $$;
create or replace function pg_temp.camp_id(p_season text, p_ref text) returns bigint language sql stable
  as $$ select c.id from public.camps c where c.season_id = pg_temp.season_id(p_season) and c.name = pg_temp.res(p_season,'camps',p_ref)->>'name' $$;
create or replace function pg_temp.room_id(p_season text, p_ref text) returns bigint language sql stable
  as $$ select r.id from public.rooms r where r.season_id = pg_temp.season_id(p_season) and r.number = pg_temp.res(p_season,'rooms',p_ref)->>'number' $$;
create or replace function pg_temp.flight_id(p_season text, p_ref text) returns bigint language sql stable
  as $$ select f.id from public.flights f where f.season_id = pg_temp.season_id(p_season) and f.name = pg_temp.res(p_season,'flights',p_ref)->>'name' $$;

-- the authenticated Demo operator (finance + portal steps act as this user)
select coalesce((select id::text from public.user_profiles
                  where lower(email) = lower(current_setting('demo.operator_email')) and is_active), '') as operator_id \gset
\set QUIET off
