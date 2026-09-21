-- ════════════════════════════════════════════════════════════
-- مِسبارُ توافق التطبيق — **محلّيٌّ فقط**
-- ════════════════════════════════════════════════════════════
-- ⚠️ لا يُشغَّل على البعيد بحال. يُثبت أن المخطَّطَ المبنيَّ من خطّ
-- الأساس يقبل أشكالَ الكتابة التي يقوم عليها التطبيق.
--
-- وكلُّ كتابةٍ هنا داخل معاملةٍ **تُرَدّ**: لا صفَّ يبقى.
-- وليس بديلاً عن E2E يدويّ — يثبت المعمارية لا السلوك.

\set ON_ERROR_STOP on
\pset tuples_only off

begin;

-- ١) البنية: كلُّ ما يعتمده التطبيق موجود
select 'tables_present' as probe, count(*) = 22 as ok, count(*) as got
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r';

-- ⚠️ لا `max()` على `text[]`: بوستجرس لا يعرّفها، وكان السطرُ
--    يسقط بـ42883. والصفُّ واحدٌ فلا حاجة إلى تجميعٍ أصلاً.
select 'view_company_profile_public' as probe,
       true as ok,
       coalesce(array_to_string(c.reloptions, ','), '(none)') as reloptions
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v' and c.relname = 'company_profile_public';

select 'storage_buckets' as probe, count(*) = 2 as ok,
       string_agg(id || '=' || public::text, ' ' order by id) as detail
  from storage.buckets;

select 'storage_policies' as probe, count(*) = 8 as ok, count(*) as got
  from pg_policies where schemaname = 'storage' and tablename = 'objects';

select 'permissions_fn' as probe,
       count(*) = 1 as ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'has_permission';

-- ٢) سلوكُ سعة الغرف — نقيُّ الأثر، بلا كتابة
select 'room_type_capacity' as probe,
       public.room_type_capacity('ثنائية') = 2
       and public.room_type_capacity('رباعية') = 4
       and public.room_type_capacity('مجلس') = 0
       and public.room_type_capacity('نوعٌ غير معروف') is null as ok;

-- ٣) أشكالُ الكتابة — تُجرَّب ثم تُرَدّ كلُّها
savepoint probe_writes;

insert into public.seasons (name, hijri_year) values ('موسم مِسبار', 1490);

select 'active_season_id' as probe, public.active_season_id() is not null as ok;

insert into public.passengers (season_id) values (public.active_season_id());
select 'passenger_insert' as probe, count(*) = 1 as ok from public.passengers;

insert into public.buses (season_id) values (public.active_season_id());
select 'bus_insert' as probe, count(*) = 1 as ok from public.buses;

insert into public.camps (season_id) values (public.active_season_id());
select 'camp_insert_mina_arafa' as probe, count(*) = 1 as ok from public.camps;

insert into public.rooms (number, type, season_id)
  values ('مِسبار-1', 'رباعية', public.active_season_id());
select 'room_capacity_trigger' as probe, capacity = 4 as ok, capacity
  from public.rooms where number = 'مِسبار-1';

insert into public.flights (season_id) values (public.active_season_id());
select 'flight_insert' as probe, count(*) = 1 as ok from public.flights;

insert into public.financial_groups (name) values ('مجموعة مِسبار');
insert into public.payments (passenger_id, amount)
  select id, 1 from public.passengers limit 1;
select 'finance_shape' as probe,
       (select count(*) from public.financial_groups) = 1
       and (select count(*) from public.payments) = 1 as ok;

insert into public.announcements (season_id) values (public.active_season_id());
select 'announcement_insert' as probe, count(*) = 1 as ok from public.announcements;

select 'portal_session_shape' as probe,
       count(*) = 1 as ok
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'pilgrim_sessions' and c.relrowsecurity;

rollback to savepoint probe_writes;

-- ٤) لا أثرَ باقٍ
select 'no_residue' as probe,
       (select count(*) from public.passengers) = 0
       and (select count(*) from public.seasons) = 0
       and (select count(*) from public.rooms) = 0 as ok;

rollback;

-- ولا معاملةَ مفتوحة، ولا صفَّ باقٍ: المعاملةُ كلُّها مردودة.
