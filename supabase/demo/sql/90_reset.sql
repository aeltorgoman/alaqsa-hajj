\set ON_ERROR_STOP on
-- ════════════════════════════════════════════════════════════════
-- 90_reset.sql — return the Demo database to its pre-seed state
-- ════════════════════════════════════════════════════════════════
-- Run only through tools/demo-reset.sh (guard + destructive token,
-- Storage purged first). Uses the product's own lifecycle:
--   1. close_season() closes the open Demo season into an empty
--      placeholder season (hijri 9999) — only closed seasons can be
--      deleted, by design;
--   2. delete_season() deletes every closed season with all its rows
--      (it handles payments, charges, groups, members, sessions, push,
--      deliveries and the snapshot itself);
--   3. the placeholder — open, never written to — is removed with a
--      plain DELETE after proving it is empty.
-- This file never sets app.season_maintenance; delete_season() does so
-- internally, as it does in Production, and turns it off again.
--
-- What survives, by design (documented in README §10):
--   · payment_receipts rows — immutable fiscal records
--     (trg_payment_receipts_immutable forbids DELETE with no bypass).
--     Their season no longer exists, so no screen shows them, and their
--     numbers can never collide with a new season's.
--   · audit_log — immutable history.
--   (season_pricing_snapshot rows of deleted seasons are removed here,
--    because delete_season() leaves them orphaned.)
--   · the Demo sentinel, the operator account, company_config row 1 and
--     pricing_settings (the seed rewrites them).
\ir 00_guard.sql
\echo '  90: reset — close · delete_season · remove placeholder'
begin;
do $$
declare v_open bigint; v_open_year int; s record; n int;
begin
  select id, hijri_year into v_open, v_open_year from public.seasons where closed_at is null;
  if v_open is not null and v_open_year <> 9999 then
    perform public.close_season('إعادة تهيئة العرض', 9999, 'إعادة تهيئة العرض التجريبي', null::uuid);
  end if;
  for s in select id from public.seasons where closed_at is not null order by id loop
    perform public.delete_season(s.id, null::uuid);
  end loop;
  select id into v_open from public.seasons where closed_at is null;
  if v_open is not null then
    select (select count(*) from public.passengers where season_id = v_open) + (select count(*) from public.buses where season_id = v_open)
         + (select count(*) from public.camps where season_id = v_open) + (select count(*) from public.rooms where season_id = v_open)
         + (select count(*) from public.flights where season_id = v_open) + (select count(*) from public.announcements where season_id = v_open)
         + (select count(*) from public.financial_groups where season_id = v_open)
      into n;
    if n > 0 then raise exception 'placeholder season is not empty (% rows) — refusing', n; end if;
    delete from public.seasons where id = v_open;
  end if;
  if exists (select 1 from public.seasons) then raise exception 'seasons remain after reset'; end if;
  -- delete_season() does not remove season_pricing_snapshot rows (no FK,
  -- no cascade — recorded as a backlog finding). Remove only snapshot rows
  -- whose season no longer exists; the table carries no protection to bypass.
  delete from public.season_pricing_snapshot snap
   where not exists (select 1 from public.seasons x where x.id = snap.season_id);
  -- company asset rows point at objects that were just purged
  delete from public.company_assets where asset_key <> 'demo_environment_marker';
  -- login-attempt counters (portal rehearsals must not lock the demo credential)
  delete from public.edge_rate_limits;
end $$;
commit;
select (select count(*) from public.seasons) as seasons, (select count(*) from public.passengers) as passengers,
       (select count(*) from public.payment_receipts) as retained_frozen_receipts;
