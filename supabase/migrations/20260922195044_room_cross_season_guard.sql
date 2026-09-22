-- ════════════════════════════════════════════════════════════
-- حارسُ الغرفة عبر المواسم — قاعديٌّ لا واجهيّ
-- ════════════════════════════════════════════════════════════
-- الثغرة: `passengers.room_id` كان بلا فحصِ موسمٍ بحال.
-- `trg_reject_room_over_capacity` يفحص السعةَ وحدَها، ويخرج باكراً
-- إذا لم يتغيّر `room_id`، وعمودُ `season_id` ليس في قائمته أصلاً.
-- و`trg_reject_invalid_allocation` يحرس الباصَ والمخيّمَين ولا يمسّ
-- الغرفة. فكان يمكن:
--   ١) إسنادُ حاجٍّ إلى غرفةِ موسمٍ آخر إنشاءً أو تعديلاً؛
--   ٢) تحويلُ موسمِ الحاجّ وحدَه فتصير غرفتُه الصحيحةُ عابرةً للمواسم؛
--   ٣) تحويلُ موسمِ الغرفة وفيها نزلاء، فيصير الإسنادُ القائمُ خاطئاً.
--
-- والعلاجُ حارسان يقابلان الطرفَين، على منوال
-- `reject_cross_season_flight` للطرف الابن و
-- `rooms_capacity_not_below_occupancy` للطرف الأب:
--   · على `passengers`: عند الإنشاء أو تغيّر `room_id` أو `season_id`.
--   · على `rooms`     : يُمنع تحويلُ موسمِ غرفةٍ فيها نزلاء.
--
-- ولا يمسّ هذا RLS ولا الصلاحيات ولا أيَّ مخطَّط. والإخراجُ من الغرفة
-- (`room_id = null`) والحذفُ يمضيان كما كانا.
--
-- ⚠️ ورايةُ `app.season_maintenance` محترمةٌ هنا كما في حارسَي السعة
--    على الجدولين نفسِهما. و`delete_season()` وحدها تفتحها، وPostgREST
--    لا يمرّر إعدادات الجلسة، فلا سبيل إلى فتحها من التطبيق.

-- ── الطرف الابن: الحاجّ ─────────────────────────────────────
create or replace function public.reject_cross_season_room()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_season bigint;
  v_num    text;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  -- لا فحصَ إلا عند تغيّر أحد الطرفين: تعديلُ اسمِ حاجٍّ لا يستدعي
  -- قراءةً إضافية، والصفوفُ القائمةُ الصحيحةُ لا تُعاد مساءلتُها.
  if new.room_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.room_id   is not distinct from old.room_id
     and new.season_id is not distinct from old.season_id then
    return new;
  end if;

  select r.season_id, r.number into v_season, v_num
    from public.rooms r where r.id = new.room_id;

  if not found then
    raise exception 'الغرفة رقم % غير موجودة.', new.room_id
      using errcode = 'P0001';
  end if;

  if v_season <> new.season_id then
    raise exception 'الغرفة % تتبع موسماً آخر — لا يُسنَد حاجّ إلى غرفةٍ خارج موسمه.',
      coalesce(v_num, new.room_id::text)
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

alter function public.reject_cross_season_room() owner to postgres;
revoke execute on function public.reject_cross_season_room() from public, anon, authenticated;

create or replace trigger trg_reject_cross_season_room
  before insert or update of room_id, season_id on public.passengers
  for each row execute function public.reject_cross_season_room();

-- ── الطرف الأب: الغرفة ──────────────────────────────────────
create or replace function public.rooms_reject_season_change_with_occupants()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_occ integer;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  if tg_op <> 'UPDATE' or new.season_id is not distinct from old.season_id then
    return new;
  end if;

  select count(*) into v_occ
    from public.passengers p where p.room_id = new.id;

  if v_occ > 0 then
    raise exception 'الغرفة % تضمّ % نزيلاً، فلا يُحوَّل موسمُها. أخرِج النزلاء أولاً.',
      coalesce(new.number, new.id::text), v_occ
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

alter function public.rooms_reject_season_change_with_occupants() owner to postgres;
revoke execute on function public.rooms_reject_season_change_with_occupants() from public, anon, authenticated;

create or replace trigger trg_rooms_reject_season_change
  before update of season_id on public.rooms
  for each row execute function public.rooms_reject_season_change_with_occupants();

-- ── شرطٌ لاحق: الحارسان موجودان ومفعَّلان ───────────────────
do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and not t.tgisinternal
     and t.tgname in ('trg_reject_cross_season_room', 'trg_rooms_reject_season_change');
  if v_n <> 2 then
    raise exception 'الحارسان لم يُركَّبا كما يجب: وُجد % من ٢.', v_n
      using errcode = 'P0001';
  end if;
end;
$$;
