-- ============================================================
-- س-١ — ترتيبٌ لكل سياق، وموضعٌ صحيح لكل قادم جديد
-- ============================================================
-- ثلاث علل في عمود واحد:
--
-- ١) `sort_order` كان يحمل ثلاث دلالات معاً: ترتيب الشخص العام،
--    وترتيبه **داخل باص بعينه**، وترتيبه **داخل مخيّم بعينه**.
--    وصفحتا الباصات والمخيّمات تكتبان فيه 1,2,3… داخل المورد
--    الواحد، فيبدأ كل باص ترقيمه من واحد ويسحق ما قبله.
--
-- ٢) الحجاج والإداريون في تسلسل واحد مختلط، فإعادة ترتيب أحدهما
--    تُزحزح الآخر.
--
-- ٣) الصفّ الجديد يولد على القيمة الافتراضية صفر — وهي **أصغر** من
--    كل قيمة مرتَّبة — فيظهر القادم الجديد في وسط القائمة لا في
--    آخرها، مدفوناً بين من لم يُرتَّبوا قطّ.
--
-- والعلاج ثلاثة أجزاء متلازمة: عمودٌ لكل مورد، وتطبيعٌ يفصل
-- التسلسلين، ومحفِّزٌ يمنح القادم الجديد آخر موضع في قائمته.

-- ═══ ١) أعمدة الموارد ═══
-- إضافة بحتة، nullable، بلا default، بلا إعادة كتابة للجدول.
-- والترتيب داخل مورد لا يُقرأ إلا ضمن تصفية بمفتاح ذلك المورد،
-- فاستقلال باص عن باص وغرفة عن غرفة مجّانيّ بلا شرط إضافي.
alter table passengers
  add column bus_sort_order        integer,
  add column camp_mina_sort_order  integer,
  add column camp_arafa_sort_order integer,
  add column room_sort_order       integer;

comment on column passengers.bus_sort_order        is 'ترتيب الراكب داخل باصه — مستقلّ عن الترتيب العام وعن بقيّة الموارد';
comment on column passengers.camp_mina_sort_order  is 'ترتيب النازل داخل مخيّم منى';
comment on column passengers.camp_arafa_sort_order is 'ترتيب النازل داخل مخيّم عرفة';
comment on column passengers.room_sort_order       is 'ترتيب الاسم داخل الغرفة — عرضٌ تشغيلي لا إسناد أسرّة';

-- ═══ ٢) القيم الأوّلية للموارد ═══
-- تُشتقّ من الترتيب العام داخل كل مورد على حدة. الفجوة عشرة تسمح
-- بالإدراج البينيّ بلا إعادة ترقيم شاملة، و`id` يحسم التعادل فالنتيجة
-- محدَّدة لا عشوائية. ولا يُكتب هنا على `sort_order`.
with ranked as (
  select id,
         row_number() over (partition by bus_id        order by sort_order nulls last, id) * 10 as bus_pos,
         row_number() over (partition by camp_mina_id  order by sort_order nulls last, id) * 10 as mina_pos,
         row_number() over (partition by camp_arafa_id order by sort_order nulls last, id) * 10 as arafa_pos,
         row_number() over (partition by room_id       order by sort_order nulls last, id) * 10 as room_pos
  from passengers
)
update passengers p set
  bus_sort_order        = case when p.bus_id        is not null then r.bus_pos   end,
  camp_mina_sort_order  = case when p.camp_mina_id  is not null then r.mina_pos  end,
  camp_arafa_sort_order = case when p.camp_arafa_id is not null then r.arafa_pos end,
  room_sort_order       = case when p.room_id       is not null then r.room_pos  end
from ranked r
where r.id = p.id;

-- ═══ ٣) تطبيع الترتيب العام — تسلسلان منفصلان ═══
-- ⚠️ هذه الخطوة **حافظة للترتيب الظاهر**: المستخدم يرى اليوم
-- `order by sort_order, id`، وهو بالضبط ترتيب النافذة أدناه. فلا
-- يتحرّك اسمٌ واحد عن موضعه؛ ما يتغيّر هو الأرقام لا الترتيب.
--
-- وبعدها يصير لكل سكّان تسلسله: الحجاج 10,20,30… والإداريون
-- 10,20,30… داخل كل موسم. والعمود يسع التسلسلين لأن كل قارئ
-- وكاتب صار مقصوراً على سكّانه.
with ordered as (
  select id,
         row_number() over (
           partition by season_id, (passenger_type is distinct from 'حاج')
           order by sort_order nulls last, id
         ) * 10 as pos
  from passengers
)
update passengers p set sort_order = o.pos
from ordered o where o.id = p.id;

-- ═══ ٤) القادم الجديد يأخذ آخر موضع في قائمته ═══
-- لا مسار في الواجهة يُرسل `sort_order`، فالصفّ يولد على الصفر
-- ويُدفن في وسط القائمة. والتخصيص هنا في القاعدة لا في الواجهة
-- عن قصد: يغطّي كل مسارات الإدراج — القائمة اليوم والقادمة غداً —
-- ويُنفَّذ داخل معاملة الإدراج نفسها.
--
-- والقفل الاستشاري يُسلسل الإدراجات المتزامنة **لنفس السكّان في
-- نفس الموسم وحدهم**، فمستخدمان يضيفان حاجّين في اللحظة نفسها لا
-- يحصلان على الرقم ذاته. وهو قفل معاملة يُحرَّر بانتهائها.
create or replace function passengers_assign_sort_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_admin boolean := (new.passenger_type is distinct from 'حاج');
begin
  /* الصفر هو قيمة «لم يُحدَّد» — وهي default العمود. ومن يرسل رقماً
     صريحاً يُحترم رقمه. */
  if new.sort_order is null or new.sort_order = 0 then
    perform pg_advisory_xact_lock(
      hashtext('passengers.sort_order:' || coalesce(new.season_id, 0)::text || ':' || is_admin::text)
    );
    select coalesce(max(sort_order), 0) + 10
      into new.sort_order
      from passengers
     where season_id is not distinct from new.season_id
       and (passenger_type is distinct from 'حاج') = is_admin;
  end if;
  return new;
end;
$$;

comment on function passengers_assign_sort_order() is
  'يمنح الصفّ الجديد آخر موضع في تسلسل سكّانه (حاجّ/إداري) داخل موسمه';

create trigger passengers_assign_sort_order_trg
  before insert on passengers
  for each row execute function passengers_assign_sort_order();

-- ============================================================
-- التراجع
-- ============================================================
-- drop trigger passengers_assign_sort_order_trg on passengers;
-- drop function passengers_assign_sort_order();
-- alter table passengers
--   drop column bus_sort_order,
--   drop column camp_mina_sort_order,
--   drop column camp_arafa_sort_order,
--   drop column room_sort_order;
--
-- أما الخطوة ٣ فلا يلزم التراجع عنها: هي إعادة ترقيم **حافظة
-- للترتيب الظاهر**، فإسقاطها لا يعيد شيئاً رآه المستخدم مختلفاً.
-- ومن أراد الاحتياط فليأخذ لقطة يدوياً قبل التطبيق ويُسقطها بعده:
--   create table _sort_order_snapshot as select id, sort_order from passengers;
-- ولا تُترك في الإنتاج.
