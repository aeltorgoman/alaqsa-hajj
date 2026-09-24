-- ═══════════════════════════════════════════════════════════════
-- تمرينُ الإقفال — ما لا يزرعه seed_test_seasons.sql
-- ═══════════════════════════════════════════════════════════════
-- البذرةُ تغطّي الحجّاجَ والباصاتِ والمخيّماتِ والغرفَ والرحلاتِ
-- والتنبيهاتِ ودفعةً ورسماً. وينقصها سطحان هما بالضبط ما يُختبَر
-- هنا:
--   · **مجموعةٌ ماليةٌ بأعضاء** — سطحُ م٧/٣ (`financial_groups.season_id`
--     وحُرّاسُ اتّساق العضوية مع الموسم).
--   · **جلسةُ بوابةٍ مفتوحة** — سطحُ #146 بعد الإقفال.
-- وتُضاف إسناداتٌ للحجّاج كي يكون لعزلِ المواسم بعد الإقفال ما
-- يُقاس عليه.
--
-- كلُّ ما يُكتب هنا في **الموسم النشط** وحده، بالافتراض
-- `active_season_id()` لا بمعرّفٍ مكتوبٍ بخطّ اليد.

begin;

-- ١) مجموعةٌ ماليةٌ بعضوين من الموسم النشط
with p as (
  select id from public.passengers
   where season_id = public.active_season_id()
     and not exists (select 1 from public.financial_group_members m where m.passenger_id = id)
   order by id limit 2
), g as (
  insert into public.financial_groups (name)
  values ('مجموعة تمرين الإقفال')
  returning id
)
insert into public.financial_group_members (group_id, passenger_id)
select g.id, p.id from g cross join p;

-- ٢) إسناداتٌ حقيقية: باصٌ وغرفةٌ ومخيّما منى وعرفة ورحلتان.
--    والمخيّمُ يُختار **بجنس الحاجّ**: الفصلُ بالجنس حارسٌ في القاعدة
--    (`assert_camp_admits`) لا عُرفٌ في الواجهة، فإسنادُ حاجّةٍ إلى
--    مخيّم ذكورٍ يُرفض — وهو الصواب.
update public.passengers p
   set bus_id           = (select id from public.buses  where season_id = public.active_season_id() order by id limit 1),
       room_id          = (select id from public.rooms  where season_id = public.active_season_id()
                            and coalesce(capacity, 0) > (select count(*) from public.passengers q where q.room_id = rooms.id)
                            order by id limit 1),
       camp_mina_id     = (select id from public.camps  where season_id = public.active_season_id()
                            and page_type = 'منى'  and gender = p.gender order by id limit 1),
       camp_arafa_id    = (select id from public.camps  where season_id = public.active_season_id()
                            and page_type = 'عرفة' and gender = p.gender order by id limit 1),
       flight_id        = (select id from public.flights where season_id = public.active_season_id() and type = 'ذهاب' order by id limit 1),
       return_flight_id = (select id from public.flights where season_id = public.active_season_id() and type = 'إياب' order by id limit 1)
 where p.id in (select id from public.passengers
                 where season_id = public.active_season_id() order by id limit 2);

commit;

-- ٣) تقريرٌ موجز — أعدادٌ لا بيانات
select 'topup' as step,
       (select count(*) from public.financial_groups where season_id = public.active_season_id()) as groups_active,
       (select count(*) from public.financial_group_members m
          join public.passengers p on p.id = m.passenger_id
         where p.season_id = public.active_season_id())                                          as members_active,
       (select count(*) from public.passengers
         where season_id = public.active_season_id() and bus_id is not null)                     as with_bus,
       (select count(*) from public.passengers
         where season_id = public.active_season_id() and room_id is not null)                    as with_room;
