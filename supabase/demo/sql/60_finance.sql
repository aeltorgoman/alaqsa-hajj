\set ON_ERROR_STOP on
-- ════════════════════════════════════════════════════════════════
-- 60 — active season finance, as the authenticated Demo operator
-- ════════════════════════════════════════════════════════════════
-- custom charges (RLS insert) · financial groups (RPC + member inserts)
-- · receipt start · 104 receipts through issue_payment_receipt() · 3
-- cancellations through cancel_payment_receipt(). Nothing bypasses
-- has_permission() or the payments-require-receipt trigger.
\ir 00_guard.sql
\echo '  60: active season — charges, groups, receipts (authenticated operator)'
select set_config('demo.season_key', 'active', false) \g /dev/null
\ir _as_operator.sql
do $$
declare
  ds jsonb := current_setting('demo.dataset')::jsonb;
  c jsonb; g jsonb; m text; v_id bigint; v_group json; v_gid int; first boolean;
begin
  for c in select x from jsonb_array_elements(ds->'custom_charges') x loop
    select p.id into v_id from public.passengers p
     where p.passport = (select q->>'passport' from jsonb_array_elements(ds->'people') q where q->>'ref' = c->>'person');
    insert into public.custom_charges (passenger_id, description, amount, type, notes, created_by)
    values (v_id, c->>'description', (c->>'amount')::numeric, c->>'type', c->>'notes', 'demo-seed');
  end loop;

  for g in select x from jsonb_array_elements(ds->'financial_groups') x loop
    first := true;
    for m in select jsonb_array_elements_text(g->'members') loop
      select p.id into v_id from public.passengers p
       where p.passport = (select q->>'passport' from jsonb_array_elements(ds->'people') q where q->>'ref' = m);
      if first then
        v_group := public.create_financial_group_with_member(g->>'name', g->>'notes', 'demo-seed', v_id::int);
        v_gid := (v_group->'group'->>'id')::int;
        if v_gid is null then raise exception 'group % not created: %', g->>'name', v_group; end if;
        first := false;
      else
        insert into public.financial_group_members (group_id, passenger_id) values (v_gid, v_id);
      end if;
    end loop;
  end loop;
end $$;
select public.set_season_receipt_start(public.active_season_id(),
  (current_setting('demo.dataset')::jsonb->'seasons'->'active'->>'receipt_start_number')::int) \g /dev/null
\ir _receipts.sql
commit;
