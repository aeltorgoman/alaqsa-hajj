-- ════════════════════════════════════════════════════════════
-- سلامة الطيران — المقاعد المخصَّصة للحملة، والاتجاه، والدرجة
-- ════════════════════════════════════════════════════════════
-- م٧ أعطت الرحلات موسماً وحارساً يمنع الإسناد عبر المواسم في
-- الساقين معاً. وبقي ما لم تدّعِه قطّ:
--
--   · لا سعة. والرحلة تقبل الحاجّ الواحد والأربعين على أربعين
--     مقعداً اشترتها الحملة، ولا شيء يسأل. ⚠️ والسعة هنا ليست
--     سعة الطائرة: طائرةٌ بثلاث مئة مقعد قد تكون حصّة الحملة فيها
--     أربعين — فهي «عدد المقاعد المخصَّصة للحملة».
--   · لا مفتاح أجنبيّ على `flight_id` ولا `return_flight_id`،
--     فحذفُ رحلةٍ يترك مسافريها يشيرون إلى لا شيء. والواجهة تفحص
--     اتجاهاً واحداً فقط قبل الحذف.
--   · لا شيء يمنع `flight_id` من حمل رحلة إياب، ولا
--     `return_flight_id` من حمل رحلة ذهاب. الاتفاق في `flightField`
--     وحدها — سطرٌ في React.
--   · «بدون» استبعادٌ تجاريّ صلب لا تعارضٌ طريّ: الحاجّ الذي لم
--     يطلب تذكرةً تُخصم قيمتها ممّا عليه، ويخرج من كشف الحجز —
--     فلا تُبنى له تذكرة بحال. والواجهة ترشّحه فقط.
--   · الدرجة المحجوزة يجب أن تطابق الدرجة المدفوعة. وكانت
--     `FlightsPage` تشتقّها و`AdminsPage` تتركها للموظّف يختارها.
--
-- هذا الملف ينقل الخمسة إلى القاعدة.
--
-- ⚠️ لا يُصلح بياناً ولا يحذف صفّاً ولا يُخمّن سعة. إن خالفت بياناتٌ
-- قائمةٌ أيّ حدّ، فشل الترحيل بصوتٍ مسموع وسمّى الصفوف.

-- ═══ ٠) الفحص القبليّ — يفشل ولا يُصلح ═══
do $$
declare v_bad text;
begin
  -- أ) الحاوية المشار إليها موجودة
  select string_agg(id::text, ', ') into v_bad from public.passengers p
   where (p.flight_id is not null        and not exists (select 1 from public.flights f where f.id = p.flight_id))
      or (p.return_flight_id is not null and not exists (select 1 from public.flights f where f.id = p.return_flight_id));
  if v_bad is not null then
    raise exception 'مسافرون يشيرون إلى رحلةٍ غير موجودة: %. عالِج الإسناد قبل الترحيل.', v_bad using errcode = 'P0001';
  end if;

  -- ب) الموسم واحد في الطرفين (حارس م٧ قائم — وهذا يتحقّق من الماضي)
  select string_agg(p.id::text, ', ') into v_bad from public.passengers p
   join public.flights f on f.id in (p.flight_id, p.return_flight_id)
   where f.season_id <> p.season_id;
  if v_bad is not null then
    raise exception 'مسافرون مُسنَدون إلى رحلةٍ من موسمٍ آخر: %.', v_bad using errcode = 'P0001';
  end if;

  -- ج) مفردات الاتجاه
  select string_agg(coalesce(type, '<NULL>'), ', ') into v_bad from (
    select distinct type from public.flights where type is null or type not in ('ذهاب', 'إياب')) z;
  if v_bad is not null then
    raise exception 'قيم اتجاهٍ خارج المعتمَد في الرحلات: %. المعتمَد «ذهاب» و«إياب» وحدهما.', v_bad using errcode = 'P0001';
  end if;

  -- د) العمود يطابق الاتجاه
  select string_agg(p.id::text, ', ') into v_bad from public.passengers p
   join public.flights f on f.id = p.flight_id where f.type <> 'ذهاب';
  if v_bad is not null then
    raise exception 'مسافرون في عمود الذهاب يشيرون إلى رحلة إياب: %.', v_bad using errcode = 'P0001';
  end if;

  select string_agg(p.id::text, ', ') into v_bad from public.passengers p
   join public.flights f on f.id = p.return_flight_id where f.type <> 'إياب';
  if v_bad is not null then
    raise exception 'مسافرون في عمود الإياب يشيرون إلى رحلة ذهاب: %.', v_bad using errcode = 'P0001';
  end if;

  -- هـ) «بدون» لا يُسنَد — استبعادٌ تجاريّ صلب
  select string_agg(id::text, ', ') into v_bad from public.passengers
   where flight = 'بدون' and (flight_id is not null or return_flight_id is not null);
  if v_bad is not null then
    raise exception 'حجّاج طلبوا «بدون» وهم مُسنَدون إلى رحلة: %. أخرِجهم أو صحّح خدمتهم قبل الترحيل.', v_bad
      using errcode = 'P0001';
  end if;

  -- و) الدرجة المحجوزة تطابق المدفوعة
  -- `flight` هي المطلوب/المدفوع، و`flight_class` هي المحجوز فعلاً.
  -- والمطابقة شرط: من دفع اقتصادياً لا يُحجَز له أولى، والعكس.
  select string_agg(id::text, ', ') into v_bad from public.passengers
   where (flight_id is not null or return_flight_id is not null)
     and coalesce(flight_class, 'عادي')
         <> (case when flight = 'درجة أولى' then 'درجة أولى' else 'عادي' end);
  if v_bad is not null then
    raise exception 'مسافرون درجتهم المحجوزة تخالف المدفوعة: %. صحّحها يدوياً — لا تُعاد كتابتها هنا.', v_bad
      using errcode = 'P0001';
  end if;

  -- ز) هويّة الرحلة حاضرة وغير مكرّرة
  -- الهويّة التشغيليّة: (الموسم · الاتجاه · الرقم · التاريخ · الوقت).
  -- فرقم الرحلة يتكرّر بحقّ في تواريخ مختلفة — QA1212 ذهاباً في ٣٠
  -- سبتمبر وQA1212 ذهاباً في ١ أكتوبر رحلتان لا واحدة.
  --
  -- ⚠️ التطبيع `btrim` وحده. واسمٌ في القاعدة يحمل حركاتٍ عربيّة
  -- سابقةً (زلّةُ لوحة مفاتيح)، و`btrim` لا يحذفها — وهذا مقصود:
  -- حذفُها تغييرٌ صامت للبيانات، والقاعدة لا تغيّر ما لم تُؤمَر.
  select string_agg(id::text, ', ') into v_bad from public.flights
   where name is null or btrim(name) = ''
      or date is null or btrim(date) = ''
      or time is null or btrim(time) = '';
  if v_bad is not null then
    raise exception 'رحلات ناقصة الهويّة (الرقم أو التاريخ أو الوقت): %. أكمِلها قبل الترحيل.', v_bad
      using errcode = 'P0001';
  end if;

  select string_agg(season_id || '/' || tp || '/' || nm || '/' || dt || ' ' || tm || ' ×' || n, ', ') into v_bad
    from (select season_id, type tp, btrim(name) nm, btrim(date) dt, btrim(time) tm, count(*) n
            from public.flights group by 1, 2, 3, 4, 5 having count(*) > 1) z;
  if v_bad is not null then
    raise exception 'رحلات مكرّرة بالهويّة نفسها (موسم · اتجاه · رقم · تاريخ · وقت): %. عالِجها يدوياً.', v_bad
      using errcode = 'P0001';
  end if;
end $$;

-- ═══ ١) المقاعد المخصَّصة للحملة ═══
-- لا سعةَ تُخمَّن لرحلةٍ قائمة: `null` تعني «غير محدّدة»، والرحلة
-- تُعلنها ولا تقبل إسناداً حتى يدخلها الموظّف. نهج الغرفة والمخيّم
-- بلا سعة — لا اختراعٌ جديد.
alter table public.flights add column if not exists capacity integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'flights_capacity_positive') then
    alter table public.flights
      add constraint flights_capacity_positive check (capacity is null or capacity >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flights_type_vocab') then
    alter table public.flights add constraint flights_type_vocab check (type in ('ذهاب', 'إياب'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flights_identity_present') then
    alter table public.flights add constraint flights_identity_present check (
      name is not null and btrim(name) <> ''
      and date is not null and btrim(date) <> ''
      and time is not null and btrim(time) <> '');
  end if;
end $$;

alter table public.flights alter column type set not null;

comment on column public.flights.capacity is
  'عدد المقاعد المخصَّصة للحملة على هذه الرحلة — لا سعة الطائرة. null = غير محدّدة: لا تقبل إسناداً حتى تُحدَّد.';

-- ═══ ٢) الهويّة التشغيليّة ═══
-- `btrim` وحدها قابلة للفهرسة (immutable) وتكفي: لا تحذف حركةً ولا
-- تغيّر محتوى.
create unique index if not exists flights_operational_identity_uniq
  on public.flights (season_id, type, btrim(name), btrim(date), btrim(time));

-- ═══ ٣) المفتاح الأجنبي — والحذف يُرفَض لا يُكنَس ═══
-- `on delete restrict` على نهج الباص والمخيّم: رحلةٌ فيها مسافر لا
-- تُحذف، ويفشل الحذف في القاعدة لا في React وحدها. و`delete_season()`
-- تكنس `passengers` قبل `flights` (سطر ٤٥٤ من م٧)، فالترتيب موافق.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'passengers_flight_id_fkey') then
    alter table public.passengers add constraint passengers_flight_id_fkey
      foreign key (flight_id) references public.flights(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'passengers_return_flight_id_fkey') then
    alter table public.passengers add constraint passengers_return_flight_id_fkey
      foreign key (return_flight_id) references public.flights(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_passengers_flight_id
  on public.passengers (flight_id) where flight_id is not null;
create index if not exists idx_passengers_return_flight_id
  on public.passengers (return_flight_id) where return_flight_id is not null;

-- ═══ ٤) حارس الإسناد — اتجاه وسعة واستبعاد ودرجة ═══
-- محفّزٌ واحد للساقين: الفحوص نفسها على رحلةٍ وعمودِ إشغال، والقفل
-- واحد. والفرق بين الساقين عمودُه واتجاهُه المطلوب، وذاك مكتوبٌ
-- صريحاً في جسمها.
--
-- ⚠️ القفل قبل العدّ (`for update` على صفّ الرحلة): موظّفان يريان
-- «٣٩/٤٠» فيضيفان معاً، والواجهة تصدّق كليهما. القفل يُسلسلهما
-- فيُقبل الأول ويُرفض الثاني — ولا يُحجَز المقعد الأخير مرّتين.
--
-- واسمها يرتّبها أبجدياً بعد `reject_cross_season_flight`، فيسبق
-- فحصُ الموسم فحصَ السعة — وهو الترتيب المرغوب.
create or replace function public.reject_invalid_flight_booking()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_cap     integer;
  v_name    text;
  v_type    text;
  v_season  bigint;
  v_occ     integer;
  v_changed boolean;
  v_want    text;
begin
  -- مَنفذ الصيانة — `delete_season()` وحدها تفتحه
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  /* الدرجة المدفوعة: «درجة أولى» أو «عادي». والفارغ عاديّ — وهو
     حال الصفوف السابقة لعمود الخدمة. */
  v_want := case when new.flight = 'درجة أولى' then 'درجة أولى' else 'عادي' end;

  -- ── ساق الذهاب ─────────────────────────────────────────────
  v_changed := tg_op = 'INSERT'
            or new.flight_id is distinct from old.flight_id
            or new.season_id is distinct from old.season_id
            or new.flight    is distinct from old.flight;

  if new.flight_id is not null and v_changed then
    /* «بدون» استبعادٌ صلب: لا تأكيدَ يتجاوزه ولا «وزّع على أي حال».
       التذكرة تُخصم قيمتها ممّا على الحاجّ، وهو خارج كشف الحجز. */
    if new.flight = 'بدون' then
      raise exception 'الحاجّ طلب «بدون طيران» — لا تُحجَز له تذكرة ولا يُسنَد إلى رحلة.'
        using errcode = 'P0001';
    end if;

    select f.capacity, f.name, f.type, f.season_id into v_cap, v_name, v_type, v_season
      from public.flights f where f.id = new.flight_id for update;

    if not found then
      raise exception 'رحلة الذهاب رقم % غير موجودة.', new.flight_id using errcode = 'P0001';
    end if;
    if v_type <> 'ذهاب' then
      raise exception 'الرحلة «%» رحلةُ %، فلا تُسنَد في عمود الذهاب.', v_name, v_type using errcode = 'P0001';
    end if;
    if v_season <> new.season_id then
      raise exception 'الرحلة «%» تتبع موسماً آخر — لا يُسنَد مسافر إلى رحلةٍ خارج موسمه.', v_name
        using errcode = 'P0001';
    end if;
    if v_cap is null then
      raise exception 'الرحلة «%» بلا مقاعد محدَّدة للحملة — حدّد عددها قبل الإسناد.', v_name
        using errcode = 'P0001';
    end if;

    select count(*) into v_occ from public.passengers p
     where p.flight_id = new.flight_id and p.id <> new.id;

    if v_occ >= v_cap then
      raise exception 'الرحلة «%» مكتملة (%/% من مقاعد الحملة) — لا تتّسع لمسافرٍ آخر.', v_name, v_occ, v_cap
        using errcode = 'P0001';
    end if;
  end if;

  -- ── ساق الإياب ─────────────────────────────────────────────
  v_changed := tg_op = 'INSERT'
            or new.return_flight_id is distinct from old.return_flight_id
            or new.season_id        is distinct from old.season_id
            or new.flight           is distinct from old.flight;

  if new.return_flight_id is not null and v_changed then
    if new.flight = 'بدون' then
      raise exception 'الحاجّ طلب «بدون طيران» — لا تُحجَز له تذكرة ولا يُسنَد إلى رحلة.'
        using errcode = 'P0001';
    end if;

    select f.capacity, f.name, f.type, f.season_id into v_cap, v_name, v_type, v_season
      from public.flights f where f.id = new.return_flight_id for update;

    if not found then
      raise exception 'رحلة العودة رقم % غير موجودة.', new.return_flight_id using errcode = 'P0001';
    end if;
    if v_type <> 'إياب' then
      raise exception 'الرحلة «%» رحلةُ %، فلا تُسنَد في عمود الإياب.', v_name, v_type using errcode = 'P0001';
    end if;
    if v_season <> new.season_id then
      raise exception 'الرحلة «%» تتبع موسماً آخر — لا يُسنَد مسافر إلى رحلةٍ خارج موسمه.', v_name
        using errcode = 'P0001';
    end if;
    if v_cap is null then
      raise exception 'الرحلة «%» بلا مقاعد محدَّدة للحملة — حدّد عددها قبل الإسناد.', v_name
        using errcode = 'P0001';
    end if;

    select count(*) into v_occ from public.passengers p
     where p.return_flight_id = new.return_flight_id and p.id <> new.id;

    if v_occ >= v_cap then
      raise exception 'الرحلة «%» مكتملة (%/% من مقاعد الحملة) — لا تتّسع لمسافرٍ آخر.', v_name, v_occ, v_cap
        using errcode = 'P0001';
    end if;
  end if;

  -- ── الدرجة المحجوزة تتبع المدفوعة ──────────────────────────
  -- `flight_class` ليست قراراً للموظّف: تُشتقّ من المدفوع كلّما وُجدت
  -- ساق، وتُمحى إذا خلت الساقان — فلا تبقى حالةُ حجزٍ بلا حجز.
  -- ويبقى المرفوض هو الكتابةُ الصريحة المخالفة وحدها؛ أما القيمةُ
  -- الموروثة التي تقادمت بتغيُّر المدفوع فتُصحَّح ولا تُجمِّد الصفّ.
  if new.flight_id is not null or new.return_flight_id is not null then
    /* «صريحة» = قيمةٌ غير فارغةٍ جاءت في هذه الجملة نفسها: كلُّ
       قيمةٍ في الإدراج، وفي التحديث ما خالف `old` وحده. */
    if new.flight_class is not null and new.flight_class <> v_want
       and (tg_op = 'INSERT' or new.flight_class is distinct from old.flight_class) then
      raise exception 'الدرجة المحجوزة «%» تخالف المدفوعة «%» — لا تُحجَز درجةٌ غير التي دُفعت.',
        new.flight_class, v_want using errcode = 'P0001';
    end if;
    new.flight_class := v_want;
  else
    new.flight_class := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reject_invalid_flight_booking on public.passengers;
create trigger trg_reject_invalid_flight_booking
  before insert or update of flight_id, return_flight_id, flight, flight_class, season_id
  on public.passengers
  for each row execute function public.reject_invalid_flight_booking();

-- ═══ ٥) السعة لا تنزل تحت الإشغال، والاتجاه لا يُبطل مسافريه ═══
create or replace function public.flights_guard_occupants()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_occ integer;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  /* الإشغال في الساق الموافقة لاتجاه الرحلة. ولا تُجمع الساقان:
     رحلة ذهاب لا يشير إليها عمود الإياب أصلاً (حارس أعلاه). */
  select count(*) into v_occ from public.passengers p
   where p.flight_id = new.id or p.return_flight_id = new.id;

  if v_occ = 0 then
    return new;   -- رحلةٌ خالية: لا مسافرَ يُبطله تغيير
  end if;

  if new.capacity is distinct from old.capacity
     and new.capacity is not null and new.capacity < v_occ then
    raise exception 'الرحلة «%» تضمّ % مسافراً، فلا تُخفَّض مقاعد الحملة إلى %. أخرِج المسافرين أولاً.',
      coalesce(new.name, new.id::text), v_occ, new.capacity using errcode = 'P0001';
  end if;

  if new.type is distinct from old.type then
    raise exception 'الرحلة «%» تضمّ % مسافراً — لا يُقلب اتجاهها. أخرِجهم أولاً.',
      coalesce(new.name, new.id::text), v_occ using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_flights_guard_occupants on public.flights;
create trigger trg_flights_guard_occupants
  before update of capacity, type on public.flights
  for each row execute function public.flights_guard_occupants();

-- ═══ ٦) الصلاحيات — نهج `reject_write_closed_season` نفسه ═══
-- دوالّ المحفّزات لا تُستدعى مباشرةً: يستدعيها محرّك المحفّزات بلا
-- فحص EXECUTE. وسحبُها من الأدوار التي يبلغها المتصفّح لا يعطّل
-- شيئاً ويمنع أن تُنادى من واجهة PostgREST.
--
-- ── حدّ الأمان المقصود، صريحاً ────────────────────────────────
--   PUBLIC · anon · authenticated : لا EXECUTE
--   service_role                  : EXECUTE باقٍ، مقبولٌ ومتوقَّع
--
-- يبقى `service_role` لأن القاعدة تحمل `alter default privileges …
-- in schema public grant execute on functions to authenticated,
-- service_role` (يضعها Supabase)، فكل دالّة يُنشئها `postgres` في
-- `public` تولد ومعها `service_role=X/postgres`. وهو حال كل دوالّ
-- المشروع، ولا أثر أمنيّ له: الدالّتان تُرجعان `trigger` فيرفض
-- بوستجرس استدعاءهما مباشرةً ولا تنشرهما PostgREST.
revoke execute on function public.reject_invalid_flight_booking() from public, anon, authenticated;
revoke execute on function public.flights_guard_occupants()       from public, anon, authenticated;

-- ⚠️ الصفوف القائمة لا تُمسّ: الحارس يمنع الإسناد الجديد ولا يطرد
-- أحداً. ولا مقاعدَ تُخمَّن لرحلةٍ قائمة — تبقى `null` وتظهر في
-- الواجهة «المقاعد غير محدَّدة» حتى يحدّدها الموظّف.
--
-- و RLS و`trg_reject_closed_season` و`reject_cross_season_flight`
-- كما هي — لم يُمسّ منها شيء.

-- ═══ التراجع ═══
-- drop trigger if exists trg_flights_guard_occupants      on public.flights;
-- drop trigger if exists trg_reject_invalid_flight_booking on public.passengers;
-- drop function if exists public.flights_guard_occupants();
-- drop function if exists public.reject_invalid_flight_booking();
-- drop index if exists public.idx_passengers_return_flight_id;
-- drop index if exists public.idx_passengers_flight_id;
-- alter table public.passengers drop constraint if exists passengers_return_flight_id_fkey;
-- alter table public.passengers drop constraint if exists passengers_flight_id_fkey;
-- drop index if exists public.flights_operational_identity_uniq;
-- alter table public.flights drop constraint if exists flights_identity_present;
-- alter table public.flights drop constraint if exists flights_type_vocab;
-- alter table public.flights drop constraint if exists flights_capacity_positive;
-- alter table public.flights drop column if exists capacity;
