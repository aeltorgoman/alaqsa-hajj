\set ON_ERROR_STOP on
-- ════════════════════════════════════════════════════════════════
-- 70 — announcements + Pilgrim Portal settings, as the Demo operator
-- ════════════════════════════════════════════════════════════════
-- No pilgrim session, push subscription or delivery row is created: those
-- appear only from a real portal login or a real push opt-in.
\ir 00_guard.sql
\echo '  70: announcements + portal settings (authenticated operator)'
\ir _as_operator.sql
select public.update_portal_settings(c->'portal_settings', c->>'portal_welcome_message', c->>'portal_help_message',
                                     c->>'admin_name', c->>'admin_phone', c->>'admin_whatsapp')
  from (select current_setting('demo.dataset')::jsonb->'company' c) x \g /dev/null
do $$
declare ds jsonb := current_setting('demo.dataset')::jsonb; a jsonb; v_ids bigint[]; t text;
begin
  for a in select x from jsonb_array_elements(ds->'announcements') x where x->>'season' = 'active' loop
    v_ids := '{}';
    for t in select jsonb_array_elements_text(a->'target_refs') loop
      v_ids := v_ids || case a->>'target_type'
        when 'bus' then (select b.id from public.buses b where b.season_id = public.active_season_id()
                          and b.name = (select r->>'name' from jsonb_array_elements(ds->'resources'->'active'->'buses') r where r->>'ref' = t))
        when 'camp_mina' then (select c.id from public.camps c where c.season_id = public.active_season_id()
                          and c.name = (select r->>'name' from jsonb_array_elements(ds->'resources'->'active'->'camps') r where r->>'ref' = t))
        when 'custom' then (select p.id from public.passengers p
                          where p.passport = (select q->>'passport' from jsonb_array_elements(ds->'people') q where q->>'ref' = t))
      end;
    end loop;
    if array_position(v_ids, null) is not null then raise exception 'announcement target not resolved: %', a->>'title'; end if;
    insert into public.announcements (title, body, priority, show_at, expires_at, target_type, target_ids, created_by)
    values (a->>'title', a->>'body', a->>'priority', (a->>'show_at')::timestamptz, (a->>'expires_at')::timestamptz,
            a->>'target_type', v_ids, 'demo-seed');
  end loop;
end $$;
commit;
