\set ON_ERROR_STOP on
-- ════════════════════════════════════════════════════════════════
-- 10 — clean-state check · company identity · archive-era pricing
-- ════════════════════════════════════════════════════════════════
\ir 00_guard.sql
\echo '  10: company profile + pricing (archive amounts first)'
begin;
do $$
declare n int;
begin
  -- the seed runs on a fresh or reset Demo database only
  select (select count(*) from public.seasons) + (select count(*) from public.passengers)
       + (select count(*) from public.buses) + (select count(*) from public.camps)
       + (select count(*) from public.rooms) + (select count(*) from public.flights)
       + (select count(*) from public.announcements) + (select count(*) from public.financial_groups)
    into n;
  if n > 0 then
    raise exception 'Demo database is not clean (% operational rows). Run tools/demo-reset.sh first.', n;
  end if;
end $$;

-- company identity: fictitious, visibly a Demo. Asset rows are written by
-- the Storage loader only after their objects exist (truthfulness rule).
update public.company_config c set
  name_ar = d->>'name_ar', name_en = d->>'name_en', tagline = d->>'tagline',
  color_primary = d->>'color_primary', color_accent = d->>'color_accent', color_sidebar = d->>'color_sidebar',
  contact_phone = d->>'contact_phone', contact_email = d->>'contact_email',
  country = d->>'country', city = d->>'city', commercial_registration = d->>'commercial_registration',
  bank_name = d->>'bank_name', bank_account_name = d->>'bank_account_name',
  bank_account_number = d->>'bank_account_number', bank_iban = d->>'bank_iban', bank_swift = d->>'bank_swift'
from (select pg_temp.ds()->'company' as d) x
where c.id = 1;

-- pricing: the archived season is priced first; close_season() snapshots it
insert into public.pricing_settings (key, label, type, amount)
select k, pg_temp.ds()->'pricing'->'labels'->>k, pg_temp.ds()->'pricing'->'types'->>k,
       (pg_temp.ds()->'pricing'->'archive'->>k)::numeric
  from jsonb_object_keys(pg_temp.ds()->'pricing'->'archive') k
on conflict (key) do update set label = excluded.label, type = excluded.type, amount = excluded.amount, updated_at = now();
commit;
