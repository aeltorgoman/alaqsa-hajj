-- ═══════════════════════════════════════════════════════════════
-- تأكيداتُ ما بعد الإقفال — اسمٌ · متوقَّع · فعليّ
-- ═══════════════════════════════════════════════════════════════
-- تُخرِج صفوفاً بثلاثة حقول مفصولةٍ بجدولة، يقارنها المُشغِّل.
-- ولا تُخرج بياناتِ حاجٍّ ولا أسماءَ مجموعات: أعدادٌ وحالاتٌ فقط.
--
-- `v_closed` هو الموسمُ الذي أُقفل للتوّ (أحدثُ مقفل)، و`v_open`
-- الموسمُ النشطُ الخَلَف.

with
  v as (
    select (select id from public.seasons where closed_at is not null order by closed_at desc limit 1) as closed_id,
           (select id from public.seasons where closed_at is null)                                     as open_id
  ),
  r(name, expected, actual) as (

    -- ب٤ — الموسمُ أُقفل، وخَلَفٌ واحدٌ مفتوحٌ لا غير
    select 'closed_season_has_closed_at', 'true',
           (select (closed_at is not null)::text from public.seasons s, v where s.id = v.closed_id)
    union all
    select 'exactly_one_open_season', '1',
           (select count(*)::text from public.seasons where closed_at is null)
    union all
    select 'successor_is_newer_than_closed', 'true',
           (select (v.open_id > v.closed_id)::text from v)

    -- ب٥ — لقطةُ التسعير
    union all
    select 'pricing_snapshot_matches_settings', (select count(*)::text from public.pricing_settings),
           (select count(*)::text from public.season_pricing_snapshot sps, v where sps.season_id = v.closed_id)

    -- ب٦ — صفُّ التدقيق
    union all
    -- البذرةُ نفسُها تُقفل موسمين، فالعددُ ثلاثةٌ لا واحد. المطلوبُ
    -- وجودُ صفٍّ لا عددُه، والصفُّ الأحدثُ هو إقفالُنا.
    select 'audit_row_for_close_exists', 'true',
           (select (count(*) >= 1)::text from public.audit_log
             where table_name = 'seasons' and new_value ? 'new_season_id')
    union all
    select 'audit_close_has_pricing_snapshot_key', 'true',
           (select (new_value ? 'pricing_snapshot')::text from public.audit_log
             where new_value ? 'new_season_id' order by id desc limit 1)
    union all
    select 'audit_close_action_is_update', 'update',
           (select action from public.audit_log
             where new_value ? 'new_season_id' order by id desc limit 1)
    union all
    select 'audit_close_actor_is_a_real_user', 'true',
           (select (actor_id is not null)::text from public.audit_log
             where new_value ? 'new_season_id' order by id desc limit 1)
    union all
    select 'audit_close_actor_source_is_session', 'session',
           (select actor_source from public.audit_log
             where new_value ? 'new_season_id' order by id desc limit 1)
    union all
    select 'audit_close_row_id_is_the_closed_season', 'true',
           (select (a.row_id = v.closed_id::text)::text from public.audit_log a, v
             where a.new_value ? 'new_season_id' order by a.id desc limit 1)

    -- ب٧ — الموسمُ المؤرشَف ما زال مقروءاً
    union all
    select 'archived_season_passengers_readable', 'true',
           (select (count(*) > 0)::text from public.passengers p, v where p.season_id = v.closed_id)

    -- ب٩ — الموسمُ الجديد فارغٌ حيث تتوقّع المعمارية (م٦ مؤجَّل: لا نسخَ حاويات)
    union all
    select 'new_season_passengers', '0', (select count(*)::text from public.passengers p, v where p.season_id = v.open_id)
    union all
    select 'new_season_buses',      '0', (select count(*)::text from public.buses      b, v where b.season_id = v.open_id)
    union all
    select 'new_season_camps',      '0', (select count(*)::text from public.camps      c, v where c.season_id = v.open_id)
    union all
    select 'new_season_rooms',      '0', (select count(*)::text from public.rooms      x, v where x.season_id = v.open_id)
    union all
    select 'new_season_flights',    '0', (select count(*)::text from public.flights    f, v where f.season_id = v.open_id)
    union all
    select 'new_season_financial_groups', '0',
           (select count(*)::text from public.financial_groups g, v where g.season_id = v.open_id)

    -- ب١٠ — عزلُ المجموعات المالية بالموسم
    union all
    select 'financial_groups_all_have_season', 'true',
           (select (count(*) = 0)::text from public.financial_groups where season_id is null)
    union all
    select 'archived_group_still_on_closed_season', 'true',
           (select (count(*) > 0)::text from public.financial_groups g, v where g.season_id = v.closed_id)
    union all
    select 'no_group_member_crosses_its_group_season', '0',
           (select count(*)::text
              from public.financial_group_members m
              join public.passengers p on p.id = m.passenger_id
              join public.financial_groups g on g.id = m.group_id
             where p.season_id <> g.season_id)

    -- ب١٢ — عزلُ الحاويات: الفهارسُ الفريدةُ موسميّة، فالاسمُ يتكرّر بين موسمين
    union all
    select 'container_uniqueness_is_season_scoped', 'true',
           (select (count(*) = 4)::text from pg_indexes
             where schemaname = 'public'
               and indexname in ('buses_season_name_uniq','camps_season_page_gender_name_uniq',
                                 'flights_operational_identity_uniq','rooms_season_floor_number_uniq'))
    union all
    select 'no_container_lost_its_season', '0',
           (select (
              (select count(*) from public.buses   where season_id is null) +
              (select count(*) from public.camps   where season_id is null) +
              (select count(*) from public.rooms   where season_id is null) +
              (select count(*) from public.flights where season_id is null))::text)

    -- ب١٥ — لا تسرّبَ بين المواسم: كلُّ إسنادٍ داخلَ موسمِ صاحبه
    union all
    select 'no_passenger_points_at_another_season_bus', '0',
           (select count(*)::text from public.passengers p join public.buses b on b.id = p.bus_id
             where b.season_id <> p.season_id)
    union all
    select 'no_passenger_points_at_another_season_room', '0',
           (select count(*)::text from public.passengers p join public.rooms x on x.id = p.room_id
             where x.season_id <> p.season_id)
    union all
    select 'no_passenger_points_at_another_season_camp', '0',
           (select count(*)::text from public.passengers p join public.camps c
                   on c.id in (p.camp_mina_id, p.camp_arafa_id)
             where c.season_id <> p.season_id)
    union all
    select 'no_passenger_points_at_another_season_flight', '0',
           (select count(*)::text from public.passengers p join public.flights f
                   on f.id in (p.flight_id, p.return_flight_id)
             where f.season_id <> p.season_id)
    union all
    select 'no_announcement_crosses_season', '0',
           (select count(*)::text from public.announcements where season_id is null)

    -- ث٣ — اثنا عشر جدولاً محروساً، لا أحدَ عشر
    union all
    select 'guarded_tables', '12',
           (select count(*)::text from pg_trigger t
              join pg_class c on c.oid = t.tgrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and not t.tgisinternal
               and t.tgname = 'trg_reject_closed_season')

    -- #146 — مُلاحَظ لا مُصلَح: جلساتُ الموسم المقفل تبقى غيرَ مُبطَلة
    union all
    select 'OBSERVED_146_unrevoked_sessions_on_closed_season', '(observed)',
           (select count(*)::text from public.pilgrim_sessions s, v
             where s.season_id = v.closed_id and s.revoked_at is null)

    -- #23 — مُلاحَظ لا مُصلَح: room_id وحدَه بلا مفتاحٍ أجنبيّ
    union all
    select 'OBSERVED_23_passengers_fk_count', '(observed)',
           (select count(*)::text from pg_constraint
             where conrelid = 'public.passengers'::regclass and contype = 'f')
    union all
    select 'OBSERVED_23_room_id_has_fk', '(observed)',
           (select (count(*) > 0)::text from pg_constraint
             where conrelid = 'public.passengers'::regclass and contype = 'f'
               and pg_get_constraintdef(oid) like '%(room_id)%')
  )
select name || E'\t' || expected || E'\t' || coalesce(actual, 'NULL') from r;
