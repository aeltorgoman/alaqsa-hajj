-- ============================================================
-- س-١ — ترتيبٌ لكل سياق، لا عمودٌ واحد لكل المعاني
-- ============================================================
-- `sort_order` كان يحمل ثلاث دلالات متضاربة في وقت واحد:
--   • ترتيب الحاجّ العام في القافلة
--   • ترتيب الراكب **داخل باص بعينه**   (BusesPage يكتب 1,2,3…)
--   • ترتيب النازل **داخل مخيّم بعينه** (CampsPage يكتب 1,2,3…)
-- فآخر شاشة تلمسه هي التي تقرّر معناه. وترتيب ركّاب الباص الثاني
-- يكتب 1,2,3… فوق ما كتبه الأول، والترتيب العام يُسحق بينهما.
-- وأثرُ ذلك ظاهر في القاعدة اليوم: ١٩ صفّاً على القيمة 0، وتصادم
-- بين حاجّ وإداري على القيمة 3، وثمانية ركّاب في باص واحد بستّ
-- قيم متمايزة فقط — أي أن ترتيبهم غير محدَّد أصلاً.
--
-- فلكلّ سياق عموده. والترتيب داخل مورد لا يُقرأ إلا ضمن تصفية
-- بمفتاح ذلك المورد، فاستقلال باص عن باص وغرفة عن غرفة مجّانيّ.
--
-- ⚠️ هذا الترحيل **لا يكتب على `sort_order` ولا يمسّه**. يقرأه
-- ليشتقّ منه ترتيباً أوّليّاً داخل كل مورد، ثم يتركه كما هو. وبهذا
-- يصير التراجع إسقاط أعمدة أُضيفت للتوّ — بلا جدول احتياطي دائم
-- في الإنتاج، وبلا أي بيان قائم يُعاد بناؤه.
--
-- والترتيب العام يبقى على قيمه الحالية بعللها؛ الشيفرة تفرز
-- بـ(العمود, id) فالعرض محدَّد لا عشوائي، وأول إعادة ترتيب يدوية
-- تُطبِّع سكّانها وحدهم — الحجاج بمعزل عن الإداريين.
--
-- التراجع (نظيف وكامل):
--   alter table passengers
--     drop column bus_sort_order,
--     drop column camp_mina_sort_order,
--     drop column camp_arafa_sort_order,
--     drop column room_sort_order;

-- ١) الأعمدة — إضافة بحتة، nullable، بلا default، بلا إعادة كتابة للجدول
alter table passengers
  add column bus_sort_order        integer,
  add column camp_mina_sort_order  integer,
  add column camp_arafa_sort_order integer,
  add column room_sort_order       integer;

comment on column passengers.bus_sort_order        is 'ترتيب الراكب داخل باصه — مستقلّ عن الترتيب العام وعن بقيّة الموارد';
comment on column passengers.camp_mina_sort_order  is 'ترتيب النازل داخل مخيّم منى';
comment on column passengers.camp_arafa_sort_order is 'ترتيب النازل داخل مخيّم عرفة';
comment on column passengers.room_sort_order       is 'ترتيب الاسم داخل الغرفة — عرضٌ تشغيلي لا إسناد أسرّة';

-- ٢) القيم الأوّلية — تُشتقّ من الترتيب العام داخل كل مورد على حدة.
--    الفجوة عشرة لتسمح بالإدراج البينيّ بلا إعادة ترقيم شاملة،
--    والتعادل يُحسم بـ`id` فالنتيجة محدَّدة لا عشوائية.
with ranked as (
  select id,
         bus_id, camp_mina_id, camp_arafa_id, room_id,
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
