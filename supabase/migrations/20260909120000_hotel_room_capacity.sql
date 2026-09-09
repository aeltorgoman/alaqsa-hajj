-- ════════════════════════════════════════════════════════════
-- سعة الغرفة تصير حقيقةً محفوظة، والسقف يُحرَس في القاعدة
-- ════════════════════════════════════════════════════════════
-- كانت السعة تُشتقّ في المتصفّح من `ROOM_TYPE_CAP` ولا تُخزَّن، ولا
-- يحرسها شيء: `addToRoom` تكتب `room_id` بلا فحص، وتغييرُ نوع الغرفة
-- يكتب النوع بلا نظرٍ إلى ساكنيها. فغرفةٌ ثنائية تقبل ثالثاً،
-- ورباعيةٌ فيها أربعة تصير فرديّة بضغطة. ويُكتشف ذلك عند مكتب
-- الفندق في مكة لا في المكتب.
--
-- والسعة الآن عمودٌ في `rooms`:
--   فردية ١ · ثنائية ٢ · ثلاثية ٣ · رباعية ٤ · مجلس ٠
--   خاص  — لا سعة ثابتة: تُدخَل صراحةً وتكون موجبة.
-- «خاص» تصنيفٌ تجاريّ لا عدّةَ أَسِرّة: قد تكون غرفةً بمجلسٍ خاصّ
-- أو بحمّامين، وسعتها الحقيقية لا تُستنبط من اسمها فتُطلب.
--
-- ⚠️ الحراسة في القاعدة لا في الواجهة: موظّفان على غرفةٍ واحدة
-- يريان ١/٢ فيضيفان معاً، والواجهة تصدّق كليهما. فالمحفّز يقفل صفّ
-- الغرفة (`for update`) قبل العدّ، فيتسلسل الإسنادان ويُرفض الثاني.

-- ═══ ١) العمود ═══
alter table public.rooms add column if not exists capacity integer;

-- ═══ ٢) السعة المعتمَدة لكل نوع ═══
-- دالّةٌ واحدة يستعملها المحفّز والتعبئة الرجعيّة، فلا تفترق
-- الخريطة عن نفسها بين موضعين.
create or replace function public.room_type_capacity(p_type text)
returns integer language sql immutable
as $$
  select case btrim(coalesce(p_type, ''))
    when 'فردية'  then 1
    when 'ثنائية' then 2
    when 'ثلاثية' then 3
    when 'رباعية' then 4
    when 'مجلس'   then 0
    else null            -- «خاص» وما لا يُعرف: تُدخَل صراحةً
  end;
$$;

-- ═══ ٣) التعبئة الرجعيّة ═══
-- الأنواع العادية قطعيّة فتُملأ بلا اجتهاد. ولا صفوف «خاص» ولا
-- «أخرى» ولا «سويت» في القاعدة اليوم (فُحص قبل الكتابة)، فلا
-- تخمين هنا ولا بيانات تُعاد كتابتها.
update public.rooms
   set capacity = public.room_type_capacity(type)
 where capacity is null
   and public.room_type_capacity(type) is not null;

-- ما بقي بلا سعة — إن وُجد نوعٌ خارج المعتمَد — يبقى `null`
-- ويظهر في الواجهة بوسم «السعة غير محدّدة»، ولا يقبل إسناداً حتى
-- تُحدَّد. لا يُخمَّن ولا يُحذف.

-- ═══ ٤) السعة تتبع النوع، و«خاص» تُطلَب صراحةً ═══
create or replace function public.rooms_apply_capacity()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare v_std integer;
begin
  v_std := public.room_type_capacity(new.type);

  /* النوع المعتمَد يفرض سعته: فلا تنفصل «ثنائية» عن ٢ بأي مسار،
     ولو أرسلت الواجهة غير ذلك. */
  if v_std is not null then
    new.capacity := v_std;
  else
    /* «خاص»: سعةٌ موجبة صريحة، لا صفر ولا فراغ */
    if new.capacity is null or new.capacity < 1 then
      raise exception 'غرفة «%» تحتاج سعةً صريحة أكبر من صفر.', coalesce(new.type, '؟')
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rooms_apply_capacity on public.rooms;
create trigger trg_rooms_apply_capacity
  before insert or update of type, capacity on public.rooms
  for each row execute function public.rooms_apply_capacity();

-- ═══ ٥) السعة لا تنزل تحت عدد الساكنين ═══
create or replace function public.rooms_capacity_not_below_occupancy()
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

  select count(*) into v_occ from public.passengers p where p.room_id = new.id;

  if new.capacity < v_occ then
    raise exception 'الغرفة % تضمّ % نزيلاً، فلا تُخفَّض سعتها إلى %. أخرِج النزلاء أولاً.',
      coalesce(new.number, new.id::text), v_occ, new.capacity
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rooms_capacity_floor on public.rooms;
create trigger trg_rooms_capacity_floor
  after insert or update of type, capacity on public.rooms
  for each row execute function public.rooms_capacity_not_below_occupancy();

-- ═══ ٦) السقف عند الإسناد — الإضافة والنقل معاً ═══
-- يعمل على INSERT وعلى كل UPDATE يغيّر `room_id`، فالنقل من غرفة
-- إلى غرفة يمرّ من هنا كما تمرّ الإضافة. والإخراج (`room_id = null`)
-- لا يُفحص: إخلاء سريرٍ لا يُتجاوز به سقف.
create or replace function public.reject_room_over_capacity()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_cap integer;
  v_num text;
  v_type text;
  v_occ integer;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;
  if new.room_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.room_id is not distinct from old.room_id then
    return new;
  end if;

  /* القفل قبل العدّ: بلا هذا السطر يقرأ طلبان متزامنان «١/٢»
     فيكتبان معاً وتصير الغرفة ٣/٢. */
  select r.capacity, r.number, r.type into v_cap, v_num, v_type
    from public.rooms r where r.id = new.room_id for update;

  if not found then
    raise exception 'الغرفة رقم % غير موجودة.', new.room_id using errcode = 'P0001';
  end if;

  if v_cap is null then
    raise exception 'الغرفة % بلا سعة محدّدة — حدّد سعتها قبل الإسناد.', coalesce(v_num, new.room_id::text)
      using errcode = 'P0001';
  end if;

  if v_cap = 0 then
    raise exception 'الغرفة % من نوع «%» ولا تستقبل نزلاء.', coalesce(v_num, new.room_id::text), coalesce(v_type, '؟')
      using errcode = 'P0001';
  end if;

  select count(*) into v_occ
    from public.passengers p
   where p.room_id = new.room_id and p.id <> new.id;

  if v_occ >= v_cap then
    raise exception 'الغرفة % مكتملة (%/%) — لا تتّسع لنزيلٍ آخر.',
      coalesce(v_num, new.room_id::text), v_occ, v_cap
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reject_room_over_capacity on public.passengers;
create trigger trg_reject_room_over_capacity
  before insert or update of room_id on public.passengers
  for each row execute function public.reject_room_over_capacity();

-- ⚠️ الصفوف المخالفة القائمة تبقى كما هي: الحارس يمنع **الزيادة**
-- ولا يطرد أحداً. غرفةٌ فرديّة فيها اثنان تبقى وتظهر في الواجهة
-- بحالة «تجاوز السعة» حتى يعالجها الموظّف بنفسه.

-- ═══ التراجع ═══
-- drop trigger if exists trg_reject_room_over_capacity on public.passengers;
-- drop trigger if exists trg_rooms_capacity_floor on public.rooms;
-- drop trigger if exists trg_rooms_apply_capacity on public.rooms;
-- drop function if exists public.reject_room_over_capacity();
-- drop function if exists public.rooms_capacity_not_below_occupancy();
-- drop function if exists public.rooms_apply_capacity();
-- drop function if exists public.room_type_capacity(text);
-- alter table public.rooms drop column if exists capacity;
