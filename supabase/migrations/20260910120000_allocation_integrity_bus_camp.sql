-- ════════════════════════════════════════════════════════════
-- سلامة الإسناد في الباصات ومخيّمات منى وعرفة
-- ════════════════════════════════════════════════════════════
-- الفندق صارت له سلطةُ قاعدة في ٢٠٢٦٠٩٠٩: السعة عمودٌ محفوظ،
-- والسقف محفّزٌ يقفل صفّ الغرفة قبل العدّ. أما الباص والمخيّم فبقيا
-- على حراسة React وحدها — وهي ليست حراسة:
--
--   · `bus_id` و`camp_mina_id` و`camp_arafa_id` بلا مفتاح أجنبي،
--     فحذفُ باصٍ يترك رُكّابه يشيرون إلى لا شيء.
--   · لا سقف للباص: «إضافة المحدّدين» تكتب ٦٠ إسناداً في باصٍ
--     سعته ٥٠، والشريط يقصّها بـ `Math.min(100, …)` فلا تُرى.
--   · لا سعة للمخيّم أصلاً — والشريط في الكارت مثبَّتٌ على ١٠٠٪،
--     فهو يقول «ممتلئ» عن كل مخيّمٍ فيه نازلٌ واحد.
--   · الفصل بالجنس في `moveP` يعود بـ `return` صامت، ولا شيء في
--     القاعدة يمنعه من أي مسارٍ آخر.
--   · `camp_mina_id` يقبل مخيّم عرفة، ولا أحد يسأل.
--   · الإسناد إلى موسمٍ آخر مفتوحٌ تماماً — مع أن `flights` لها
--     حارسها منذ م٧.
--
-- هذا الملف ينقل الستّة إلى القاعدة. ولا يلمس الفندق ولا الرحلات.
--
-- ⚠️ لا يُصلح هذا الملف بياناً ولا يحذف صفّاً ولا يُخمّن سعة. إن
-- خالفت بياناتٌ قائمةٌ أيّ حدٍّ من الحدود، فشل الترحيل بصوتٍ
-- مسموع وسمّى الصفوف — والقرار بشريّ لا آليّ.

-- ═══ ٠) الفحص القبليّ — يفشل ولا يُصلح ═══
do $$
declare v_bad text;
begin
  -- أ) الحاوية المشار إليها موجودة
  select string_agg(id::text, ', ') into v_bad from public.passengers p
   where p.bus_id is not null and not exists (select 1 from public.buses b where b.id = p.bus_id);
  if v_bad is not null then
    raise exception 'حجّاج يشيرون إلى باصٍ غير موجود: %. عالِج الإسناد قبل الترحيل.', v_bad using errcode = 'P0001';
  end if;

  select string_agg(id::text, ', ') into v_bad from public.passengers p
   where (p.camp_mina_id  is not null and not exists (select 1 from public.camps c where c.id = p.camp_mina_id))
      or (p.camp_arafa_id is not null and not exists (select 1 from public.camps c where c.id = p.camp_arafa_id));
  if v_bad is not null then
    raise exception 'حجّاج يشيرون إلى مخيّمٍ غير موجود: %. عالِج الإسناد قبل الترحيل.', v_bad using errcode = 'P0001';
  end if;

  -- ب) الموسم واحد في الطرفين
  select string_agg(p.id::text, ', ') into v_bad from public.passengers p
   join public.buses b on b.id = p.bus_id where b.season_id <> p.season_id;
  if v_bad is not null then
    raise exception 'حجّاج مُسنَدون إلى باصٍ من موسمٍ آخر: %.', v_bad using errcode = 'P0001';
  end if;

  select string_agg(p.id::text, ', ') into v_bad from public.passengers p
   join public.camps c on c.id in (p.camp_mina_id, p.camp_arafa_id) where c.season_id <> p.season_id;
  if v_bad is not null then
    raise exception 'حجّاج مُسنَدون إلى مخيّمٍ من موسمٍ آخر: %.', v_bad using errcode = 'P0001';
  end if;

  -- ج) عمود منى لمخيّم منى، وعمود عرفة لمخيّم عرفة
  select string_agg(p.id::text, ', ') into v_bad from public.passengers p
   join public.camps c on c.id = p.camp_mina_id where c.page_type <> 'منى';
  if v_bad is not null then
    raise exception 'حجّاج في عمود منى يشيرون إلى مخيّم عرفة: %.', v_bad using errcode = 'P0001';
  end if;

  select string_agg(p.id::text, ', ') into v_bad from public.passengers p
   join public.camps c on c.id = p.camp_arafa_id where c.page_type <> 'عرفة';
  if v_bad is not null then
    raise exception 'حجّاج في عمود عرفة يشيرون إلى مخيّم منى: %.', v_bad using errcode = 'P0001';
  end if;

  -- د) الفصل بالجنس — و«خاص» لا يستثنى في هذا الإصدار
  select string_agg(p.id::text, ', ') into v_bad from public.passengers p
   join public.camps c on c.id in (p.camp_mina_id, p.camp_arafa_id)
   where c.gender is distinct from p.gender;
  if v_bad is not null then
    raise exception 'حجّاج في مخيّمٍ مخالفٍ لجنسهم: %. عالِجهم قبل الترحيل.', v_bad using errcode = 'P0001';
  end if;

  select string_agg(p.id::text, ', ') into v_bad from public.passengers p
   where (p.camp_mina_id is not null or p.camp_arafa_id is not null)
     and (p.gender is null or btrim(p.gender) = '');
  if v_bad is not null then
    raise exception 'حجّاج في مخيّمات بلا جنسٍ مسجَّل: %. لا يمكن التحقّق من الفصل.', v_bad using errcode = 'P0001';
  end if;

  -- هـ) سعة الباص صالحة، ولا باصَ متجاوز
  select string_agg(id::text, ', ') into v_bad from public.buses
   where capacity is null or capacity < 1;
  if v_bad is not null then
    raise exception 'باصات بسعةٍ فارغة أو غير موجبة: %. حدّد سعتها قبل الترحيل.', v_bad using errcode = 'P0001';
  end if;

  select string_agg(b.name || ' (' || x.occ || '/' || b.capacity || ')', ', ') into v_bad
    from public.buses b
    join lateral (select count(*) occ from public.passengers p where p.bus_id = b.id) x on true
   where x.occ > b.capacity;
  if v_bad is not null then
    raise exception 'باصات تتجاوز سعتها: %. عالِجها قبل تثبيت السقف.', v_bad using errcode = 'P0001';
  end if;

  -- و) الاسم والجنس ونوع الصفحة حاضرة، والتميُّز قائم
  select string_agg(id::text, ', ') into v_bad from public.buses
   where name is null or btrim(name) = '';
  if v_bad is not null then
    raise exception 'باصات بلا اسم: %.', v_bad using errcode = 'P0001';
  end if;

  select string_agg(id::text, ', ') into v_bad from public.camps
   where name is null or btrim(name) = '' or gender is null or page_type is null;
  if v_bad is not null then
    raise exception 'مخيّمات ناقصة الاسم أو الجنس أو نوع الصفحة: %.', v_bad using errcode = 'P0001';
  end if;

  select string_agg(gender, ', ') into v_bad from (
    select distinct gender from public.camps where gender not in ('ذكر', 'أنثى')) z;
  if v_bad is not null then
    raise exception 'قيم جنسٍ خارج المفردات المعتمَدة في المخيّمات: %.', v_bad using errcode = 'P0001';
  end if;

  select string_agg(page_type, ', ') into v_bad from (
    select distinct page_type from public.camps where page_type not in ('منى', 'عرفة')) z;
  if v_bad is not null then
    raise exception 'قيم نوع صفحة خارج المعتمَد في المخيّمات: %.', v_bad using errcode = 'P0001';
  end if;

  -- التميُّز: الباص باسمه داخل موسمه، والمخيّم باسمه داخل
  -- (الموسم · نوع الصفحة · الجنس) — فالجنس جزءٌ من هويّة المخيّم
  -- فعلاً: «منى ٢ رجال» و«منى ٢ نساء» مخيّمان مختلفان في القاعدة
  -- اليوم، وفحصُ الواجهة في `addCamp` يفحص الاسم والجنس معاً.
  select string_agg(season_id || '/' || nm || ' ×' || n, ', ') into v_bad
    from (select season_id, btrim(name) nm, count(*) n from public.buses
           group by 1, 2 having count(*) > 1) z;
  if v_bad is not null then
    raise exception 'أسماء باصات مكرّرة داخل الموسم: %. أعِد تسميتها يدوياً قبل الترحيل.', v_bad using errcode = 'P0001';
  end if;

  select string_agg(season_id || '/' || pt || '/' || g || '/' || nm || ' ×' || n, ', ') into v_bad
    from (select season_id, page_type pt, gender g, btrim(name) nm, count(*) n from public.camps
           group by 1, 2, 3, 4 having count(*) > 1) z;
  if v_bad is not null then
    raise exception 'أسماء مخيّمات مكرّرة داخل (الموسم · الصفحة · الجنس): %. أعِد تسميتها يدوياً قبل الترحيل.', v_bad using errcode = 'P0001';
  end if;
end $$;

-- ═══ ١) سعة المخيّم — عمودٌ يُدخِله الموظّف ═══
-- لا سعةً ثابتةً للمخيّم: قد يكون ١٥ أو ٢٠ أو ١٥٠ بحسب الأرض.
-- فلا خريطةَ أنواعٍ كما في الغرف، ولا تعبئةٌ رجعيّة تُخمَّن.
--
-- `null` تعني «غير محدّدة» — وهي حال المخيّمات القائمة كلّها. ومثل
-- الغرفة بلا سعة: لا تقبل إسناداً جديداً حتى تُحدَّد، ولا يُطرَد من
-- فيها. الواجهة تطلب السعة عند الإنشاء، والقاعدة تطلبها عند أول
-- إسناد. ولا صفَّ يُعاد كتابته هنا.
alter table public.camps add column if not exists capacity integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'camps_capacity_positive') then
    alter table public.camps
      add constraint camps_capacity_positive check (capacity is null or capacity >= 1);
  end if;
end $$;

comment on column public.camps.capacity is
  'سعة المخيّم — يُدخِلها الموظّف، لا تُستنبط من نوعٍ. null = غير محدّدة: لا تقبل إسناداً حتى تُحدَّد.';

-- ═══ ١ب) ترتيب حاويات المخيّمات — عمودٌ يملكه الموظّف ═══
-- لم يكن للمخيّمات ترتيبٌ محفوظ قطّ: `CampsPage` و`ReportsPage`
-- ترتّبان بـ`created_at`، و`AdminsPage` بـ`name`، و`PortalPage`
-- بـ`id`. فالترتيب المعروض كان أثراً لتسلسل الإنشاء لا قراراً
-- تشغيلياً، ولا يملك الموظّف تغييره.
--
-- وهذا لا يكفي لـ«ترتيب حسب منى»: تلك الميزة تقرأ ترتيب مخيّمات
-- منى لتشتقّ منه ترتيب نازلي عرفة، فإن كان المصدر تسلسلَ إنشاءٍ
-- صار الترتيب المشتقّ بلا معنى تشغيليّ.
--
-- ⚠️ عمودٌ واحد لا عمودان: الصفّ الواحد يتبع `page_type` واحداً
-- و`gender` واحداً، فترتيبه نسبيٌّ داخل مجموعته وحدها:
--        (season_id · page_type · gender)
-- ولا تميُّزَ مطلوب عليه: التساوي يحسمه `id`، والفجوات لا تضرّ.
alter table public.camps add column if not exists sort_order integer;

comment on column public.camps.sort_order is
  'ترتيب المخيّم داخل مجموعته (الموسم · نوع الصفحة · الجنس) — قرارٌ تشغيليّ يملكه الموظّف. ليس فريداً، والفجوات مقبولة، و`id` يحسم التساوي. ⚠️ لا يُخلَط مع passengers.camp_mina_sort_order / camp_arafa_sort_order: تلك ترتيب النازلين داخل مخيّم، وهذا ترتيب المخيّمات نفسها.';

-- ── التعبئة: توافقيّةٌ لا قرار ───────────────────────────────
-- تُشتقّ من التسلسل الذي تعرضه `CampsPage` اليوم بالضبط
-- (`created_at` ثم `id` حاسماً للتساوي)، فتطبيق الترحيل لا يقلب
-- ترتيباً يراه الموظّف. وبعد التعبئة يصير `sort_order` هو المصدر،
-- ولا يعود `created_at` مرجعاً تشغيلياً.
-- الفجوة عشرة كما في `s1_resource_ordering` — تسمح بالإدراج
-- البينيّ بلا إعادة ترقيم شاملة.
with ranked as (
  select id,
         row_number() over (
           partition by season_id, page_type, gender
           order by created_at nulls last, id
         ) * 10 as pos
    from public.camps
)
update public.camps c
   set sort_order = r.pos
  from ranked r
 where r.id = c.id
   and c.sort_order is null;

-- ── القادم الجديد يأخذ آخر موضعٍ في مجموعته ─────────────────
-- نهج `passengers_assign_sort_order` نفسه: قفلٌ استشاريّ على مدى
-- المعاملة، مفتاحه نطاقُ الترتيب، ثم `max + 10`.
--
-- ولماذا لا `max+1` من المتصفّح: موظّفان يُنشئان مخيّماً في اللحظة
-- نفسها يقرأان `max` واحداً فيكتبان الرقم نفسه — فيصير الترتيب
-- بينهما رهن `id`، وهو ليس ما قصده أحد. والقفل يُسلسل الحاسبتين
-- فيأخذ الثاني ما بعد الأول فعلاً. ومداه المجموعة وحدها، فإنشاءُ
-- مخيّم رجالٍ في منى لا ينتظر إنشاءَ مخيّم نساءٍ في عرفة.
create or replace function public.camps_assign_sort_order()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.sort_order is null or new.sort_order = 0 then
    perform pg_advisory_xact_lock(
      hashtext('camps.sort_order:' || coalesce(new.season_id, 0)::text
               || ':' || coalesce(new.page_type, '') || ':' || coalesce(new.gender, ''))
    );
    select coalesce(max(sort_order), 0) + 10
      into new.sort_order
      from public.camps
     where season_id  is not distinct from new.season_id
       and page_type  is not distinct from new.page_type
       and gender     is not distinct from new.gender;
  end if;
  return new;
end;
$$;

drop trigger if exists camps_assign_sort_order_trg on public.camps;
create trigger camps_assign_sort_order_trg
  before insert on public.camps
  for each row execute function public.camps_assign_sort_order();

-- فهرسٌ يخدم قراءة المجموعة مرتَّبةً — وهو قراءةُ كل صفحة مخيّمات
create index if not exists idx_camps_group_order
  on public.camps (season_id, page_type, gender, sort_order, id);

-- ═══ ٢) سعة الباص تصير حدّاً لا تلميحاً ═══
-- العمود قائم بافتراضي ٥٠، لكنه كان يقبل `null` فتصير السعة
-- مسألةَ تفسيرٍ في الواجهة (`bus.capacity || 50`). لا صفَّ فارغاً
-- اليوم (فُحص أعلاه)، فالتثبيت بلا كتابة.
alter table public.buses alter column capacity set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'buses_capacity_positive') then
    alter table public.buses add constraint buses_capacity_positive check (capacity >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'buses_name_present') then
    alter table public.buses add constraint buses_name_present check (name is not null and btrim(name) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camps_name_present') then
    alter table public.camps add constraint camps_name_present check (name is not null and btrim(name) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camps_gender_vocab') then
    alter table public.camps add constraint camps_gender_vocab check (gender in ('ذكر', 'أنثى'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camps_page_type_vocab') then
    alter table public.camps add constraint camps_page_type_vocab check (page_type in ('منى', 'عرفة'));
  end if;
end $$;

alter table public.camps alter column gender    set not null;
alter table public.camps alter column page_type set not null;

-- ═══ ٣) التميُّز ═══
create unique index if not exists buses_season_name_uniq
  on public.buses (season_id, btrim(name));

create unique index if not exists camps_season_page_gender_name_uniq
  on public.camps (season_id, page_type, gender, btrim(name));

-- ═══ ٤) المفتاح الأجنبي — والحذف يُرفَض لا يُكنَس ═══
-- `on delete restrict` قرارٌ صريح: حاويةٌ فيها حاجّ لا تُحذف، ويفشل
-- الحذف بصوتٍ مسموع. والبديلان مرفوضان: `cascade` يحذف الحاجّ مع
-- باصه، و`set null` يُخرجه من الباص بلا أن يعلم أحد. وكلاهما يفقد
-- بياناً بضغطةٍ واحدة.
--
-- و`delete_season()` تكنس `passengers` قبل `camps` و`buses`
-- (سطور ٧٤–٧٧ من ترحيل الإقفال)، فالترتيب موافقٌ لـ restrict.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'passengers_bus_id_fkey') then
    alter table public.passengers add constraint passengers_bus_id_fkey
      foreign key (bus_id) references public.buses(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'passengers_camp_mina_id_fkey') then
    alter table public.passengers add constraint passengers_camp_mina_id_fkey
      foreign key (camp_mina_id) references public.camps(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'passengers_camp_arafa_id_fkey') then
    alter table public.passengers add constraint passengers_camp_arafa_id_fkey
      foreign key (camp_arafa_id) references public.camps(id) on delete restrict;
  end if;
end $$;

-- الفهارس تخدم فحصَ المفتاح عند الحذف وعدَّ الإشغال في المحفّز معاً
create index if not exists idx_passengers_bus_id        on public.passengers (bus_id)        where bus_id is not null;
create index if not exists idx_passengers_camp_mina_id  on public.passengers (camp_mina_id)  where camp_mina_id is not null;
create index if not exists idx_passengers_camp_arafa_id on public.passengers (camp_arafa_id) where camp_arafa_id is not null;

-- ═══ ٥) حارس الإسناد — موسمٌ وصفحةٌ وجنسٌ وسقف ═══
-- محفّزٌ واحد للأعمدة الثلاثة لا ثلاثة محفّزات: الفحوص نفسها على
-- حاويةٍ وعمودِ إشغال، والقفل واحد. والفرق بين الباص والمخيّم
-- مكتوبٌ صريحاً في جسمها لا مخفيّاً في تهيئة.
--
-- ⚠️ القفل قبل العدّ (`for update` على صفّ الحاوية): موظّفان يريان
-- «٤٩/٥٠» فيضيفان معاً، والواجهة تصدّق كليهما. القفل يُسلسلهما
-- فيُقبل الأول ويُرفض الثاني — ولا يجلس اثنان على المقعد الأخير.
create or replace function public.assert_camp_admits(
  p_passenger_id bigint,
  p_camp_id      bigint,
  p_pax_season   bigint,
  p_pax_gender   text,
  p_camp_season  bigint,
  p_camp_cap     integer,
  p_camp_name    text,
  p_camp_gender  text,
  p_column       text
) returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_occ integer;
begin
  if p_camp_season <> p_pax_season then
    raise exception 'المخيّم «%» يتبع موسماً آخر — لا يُسنَد حاجّ إلى مخيّمٍ خارج موسمه.', p_camp_name
      using errcode = 'P0001';
  end if;

  /* الفصل بالجنس مطلق في هذا الإصدار: «خاص» تصنيفٌ تجاريّ لا
     استثناءٌ من الفصل. كانت الواجهة تجعله يقبل الجنسين، وقرار
     المنتج ألغى ذلك الاستثناء. */
  if p_pax_gender is null or btrim(p_pax_gender) = '' then
    raise exception 'الحاجّ بلا جنسٍ مسجَّل — لا يُسنَد إلى مخيّم قبل تسجيله.'
      using errcode = 'P0001';
  end if;
  if p_camp_gender <> p_pax_gender then
    raise exception 'المخيّم «%» مخيّم %، والحاجّ %. الفصل بالجنس لا يُتجاوز.',
      p_camp_name, p_camp_gender, p_pax_gender using errcode = 'P0001';
  end if;

  if p_camp_cap is null then
    raise exception 'المخيّم «%» بلا سعة محدّدة — حدّد سعته قبل الإسناد.', p_camp_name
      using errcode = 'P0001';
  end if;

  if p_column = 'camp_mina_id' then
    select count(*) into v_occ from public.passengers p
     where p.camp_mina_id = p_camp_id and p.id <> p_passenger_id;
  else
    select count(*) into v_occ from public.passengers p
     where p.camp_arafa_id = p_camp_id and p.id <> p_passenger_id;
  end if;

  if v_occ >= p_camp_cap then
    raise exception 'المخيّم «%» مكتمل (%/%) — لا يتّسع لنازلٍ آخر.', p_camp_name, v_occ, p_camp_cap
      using errcode = 'P0001';
  end if;
end;
$$;


create or replace function public.reject_invalid_allocation()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_season   bigint;
  v_cap      integer;
  v_name     text;
  v_gender   text;
  v_page     text;
  v_occ      integer;
  v_changed  boolean;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  -- ── الباص ──────────────────────────────────────────────────
  v_changed := tg_op = 'INSERT'
            or new.bus_id    is distinct from old.bus_id
            or new.season_id is distinct from old.season_id;

  if new.bus_id is not null and v_changed then
    select b.season_id, b.capacity, b.name into v_season, v_cap, v_name
      from public.buses b where b.id = new.bus_id for update;

    if not found then
      raise exception 'الباص رقم % غير موجود.', new.bus_id using errcode = 'P0001';
    end if;
    if v_season <> new.season_id then
      raise exception 'الباص «%» يتبع موسماً آخر — لا يُسنَد حاجّ إلى باصٍ خارج موسمه.', v_name
        using errcode = 'P0001';
    end if;

    select count(*) into v_occ
      from public.passengers p where p.bus_id = new.bus_id and p.id <> new.id;

    if v_occ >= v_cap then
      raise exception 'الباص «%» مكتمل (%/%) — لا يتّسع لمسافرٍ آخر.', v_name, v_occ, v_cap
        using errcode = 'P0001';
    end if;
  end if;

  -- ── مخيّم منى ──────────────────────────────────────────────
  v_changed := tg_op = 'INSERT'
            or new.camp_mina_id is distinct from old.camp_mina_id
            or new.season_id    is distinct from old.season_id
            or new.gender       is distinct from old.gender;

  if new.camp_mina_id is not null and v_changed then
    select c.season_id, c.capacity, c.name, c.gender, c.page_type
      into v_season, v_cap, v_name, v_gender, v_page
      from public.camps c where c.id = new.camp_mina_id for update;

    if not found then
      raise exception 'المخيّم رقم % غير موجود.', new.camp_mina_id using errcode = 'P0001';
    end if;
    if v_page <> 'منى' then
      raise exception 'المخيّم «%» من مخيّمات % — لا يُسنَد في عمود منى.', v_name, v_page
        using errcode = 'P0001';
    end if;
    perform public.assert_camp_admits(
      new.id, new.camp_mina_id, new.season_id, new.gender,
      v_season, v_cap, v_name, v_gender, 'camp_mina_id');
  end if;

  -- ── مخيّم عرفة ─────────────────────────────────────────────
  v_changed := tg_op = 'INSERT'
            or new.camp_arafa_id is distinct from old.camp_arafa_id
            or new.season_id     is distinct from old.season_id
            or new.gender        is distinct from old.gender;

  if new.camp_arafa_id is not null and v_changed then
    select c.season_id, c.capacity, c.name, c.gender, c.page_type
      into v_season, v_cap, v_name, v_gender, v_page
      from public.camps c where c.id = new.camp_arafa_id for update;

    if not found then
      raise exception 'المخيّم رقم % غير موجود.', new.camp_arafa_id using errcode = 'P0001';
    end if;
    if v_page <> 'عرفة' then
      raise exception 'المخيّم «%» من مخيّمات % — لا يُسنَد في عمود عرفة.', v_name, v_page
        using errcode = 'P0001';
    end if;
    perform public.assert_camp_admits(
      new.id, new.camp_arafa_id, new.season_id, new.gender,
      v_season, v_cap, v_name, v_gender, 'camp_arafa_id');
  end if;

  return new;
end;
$$;

-- الاسم يرتّبه أبجدياً بعد `trg_reject_closed_season` و
-- `trg_reject_cross_season_flight`، فيسبق فحصُ الإقفال فحصَ
-- الإسناد — وهو الترتيب المرغوب: «الموسم مقفل» أَولى بالقول من
-- «الباص مكتمل».
drop trigger if exists trg_reject_invalid_allocation on public.passengers;
create trigger trg_reject_invalid_allocation
  before insert or update of bus_id, camp_mina_id, camp_arafa_id, season_id, gender
  on public.passengers
  for each row execute function public.reject_invalid_allocation();

-- ═══ ٦) السعة لا تنزل تحت الإشغال، والجنس لا يُبطل نازليه ═══
create or replace function public.buses_guard_occupants()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_occ integer;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;
  if new.capacity is not distinct from old.capacity then
    return new;
  end if;

  select count(*) into v_occ from public.passengers p where p.bus_id = new.id;

  if new.capacity < v_occ then
    raise exception 'الباص «%» يضمّ % مسافراً، فلا تُخفَّض سعته إلى %. أخرِج المسافرين أولاً.',
      coalesce(new.name, new.id::text), v_occ, new.capacity using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_buses_guard_occupants on public.buses;
create trigger trg_buses_guard_occupants
  before update of capacity on public.buses
  for each row execute function public.buses_guard_occupants();

-- المخيّم: السعة والجنس ونوع الصفحة. الثلاثة تُبطل نازليه إن
-- تغيّرت بلا نظرٍ إليهم — والقاعدة تنظر.
create or replace function public.camps_guard_occupants()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_occ integer;
  v_bad integer;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  select count(*) into v_occ from public.passengers p
   where p.camp_mina_id = new.id or p.camp_arafa_id = new.id;

  if v_occ = 0 then
    return new;   -- مخيّمٌ خالٍ: لا نازلَ يُبطله تغيير
  end if;

  if new.capacity is distinct from old.capacity
     and new.capacity is not null and new.capacity < v_occ then
    raise exception 'المخيّم «%» يضمّ % نازلاً، فلا تُخفَّض سعته إلى %. أخرِج النازلين أولاً.',
      coalesce(new.name, new.id::text), v_occ, new.capacity using errcode = 'P0001';
  end if;

  if new.gender is distinct from old.gender then
    select count(*) into v_bad from public.passengers p
     where (p.camp_mina_id = new.id or p.camp_arafa_id = new.id)
       and p.gender is distinct from new.gender;
    if v_bad > 0 then
      raise exception 'المخيّم «%» يضمّ % نازلاً من جنسٍ آخر، فلا يصير مخيّم %. أخرِجهم أولاً.',
        coalesce(new.name, new.id::text), v_bad, new.gender using errcode = 'P0001';
    end if;
  end if;

  if new.page_type is distinct from old.page_type then
    raise exception 'المخيّم «%» يضمّ % نازلاً — لا يُنقل بين منى وعرفة. أخرِجهم أولاً.',
      coalesce(new.name, new.id::text), v_occ using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_camps_guard_occupants on public.camps;
create trigger trg_camps_guard_occupants
  before update of capacity, gender, page_type on public.camps
  for each row execute function public.camps_guard_occupants();

-- ═══ ٧) الصلاحيات — نهج `reject_write_closed_season` نفسه ═══
-- دوالّ المحفّزات لا تُستدعى مباشرةً: يستدعيها محرّك المحفّزات بلا
-- فحص EXECUTE. وسحبُها من الجميع لا يعطّل شيئاً ويمنع أن تُنادى من
-- واجهة PostgREST. و`assert_camp_admits` مساعِدةٌ للمحفّز وحده،
-- فتُسحَب كذلك — وهي security definer فتُنادى من جسم المحفّز
-- بامتياز المالك بلا حاجةٍ إلى منحٍ لأي دور.
revoke execute on function public.reject_invalid_allocation()  from public, anon, authenticated;
revoke execute on function public.buses_guard_occupants()      from public, anon, authenticated;
revoke execute on function public.camps_guard_occupants()      from public, anon, authenticated;
revoke execute on function public.camps_assign_sort_order()    from public, anon, authenticated;
revoke execute on function public.assert_camp_admits(bigint, bigint, bigint, text, bigint, integer, text, text, text)
  from public, anon, authenticated;

-- ⚠️ الصفوف القائمة لا تُمسّ: الحارس يمنع الإسناد الجديد ولا يطرد
-- أحداً. ولا سعةَ تُخمَّن لمخيّمٍ قائم — تبقى `null` ويظهر في
-- الواجهة «السعة غير محدّدة»، ولا يقبل نازلاً حتى يحدّدها الموظّف.

-- ═══ التراجع ═══
-- drop trigger if exists trg_camps_guard_occupants      on public.camps;
-- drop trigger if exists trg_buses_guard_occupants      on public.buses;
-- drop trigger if exists trg_reject_invalid_allocation  on public.passengers;
-- drop function if exists public.camps_guard_occupants();
-- drop trigger if exists camps_assign_sort_order_trg on public.camps;
-- drop function if exists public.camps_assign_sort_order();
-- drop index if exists public.idx_camps_group_order;
-- alter table public.camps drop column if exists sort_order;
-- drop function if exists public.buses_guard_occupants();
-- drop function if exists public.reject_invalid_allocation();
-- drop function if exists public.assert_camp_admits(bigint, bigint, bigint, text, bigint, integer, text, text, text);
-- alter table public.passengers drop constraint if exists passengers_camp_arafa_id_fkey;
-- alter table public.passengers drop constraint if exists passengers_camp_mina_id_fkey;
-- alter table public.passengers drop constraint if exists passengers_bus_id_fkey;
-- drop index if exists public.camps_season_page_gender_name_uniq;
-- drop index if exists public.buses_season_name_uniq;
-- alter table public.camps drop constraint if exists camps_capacity_positive;
-- alter table public.camps drop column if exists capacity;
