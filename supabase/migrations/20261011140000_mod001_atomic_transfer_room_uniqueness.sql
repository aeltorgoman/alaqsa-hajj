-- ════════════════════════════════════════════════════════════
-- MOD-001 / #62 — نقلٌ ذرّيٌّ بمصدرٍ متوقَّع، وتفرّدُ رقم الغرفة داخل الفندق
-- ════════════════════════════════════════════════════════════
-- الإصلاحان الإلزاميّان قبل الإطلاق (مراجعة #219 و#220)، في ترحيلةٍ واحدة:
--
--   ١) assign_passenger_room(passenger, room, expected_room) — نسخةٌ ثالثة
--      الوسائط: تحت قفل صفّ الحاجّ نفسِه تقارن غرفتَه الآن بالغرفة التي
--      أكّدها الموظّف، فإن اختلفتا رُفض النقلُ ولم يتغيّر شيء. فلا يكتب
--      تأكيدُ «A→C» فوق نقلٍ متزامنٍ «A→B» فيصير «B→C».
--        · `p_expected_room_id = null` يعني «متوقَّعٌ بلا غرفة» (إسنادٌ أوّل)
--          ويُفحص — وليس «لا شرط».
--        · «لا شرط» هو النسخةُ القديمةُ ذاتُ الوسيطين، باقيةٌ بتوقيعها
--          وجسدِها كما هما، فالواجهةُ الحاليّةُ وكلُّ مستدعٍ قائمٍ لا يتأثّر.
--        · الكتابةُ نفسُها تمرّ بالنسخة القديمة: السعةُ والموسمُ وث٣
--          والصلاحيةُ كما هي، لا نسخةَ ثانيةً منها.
--
--   ٢) الرقمُ نفسُه في الدور نفسِه مسموحٌ بين فندقين، ممنوعٌ داخل الفندق.
--      الفهرسُ القديمُ على الموسم (season_id, floor, number) يُستبدل:
--        · rooms_hotel_floor_number_uniq (hotel_id, floor, number) — قائمٌ
--          منذ PR 1 ويبقى: التفرّدُ داخل الفندق.
--        · rooms_unlinked_season_floor_number_uniq — جزئيٌّ على الغرف بلا
--          فندق: الواجهةُ الحاليّة تُدرج الغرفَ بلا `hotel_id`، وإن لم تُعبَّأ
--          (موسمٌ بأكثرَ من فندق) بقيت محميّةً على الموسم كما كانت.
--      ويُتحقَّق من تعريف الفهرسين الفعليّ قبل أيّ تغيير.
--
-- ⚠️ لا يُمسّ صفّ. لا تُفتح رايةُ الصيانة. لا سياسةَ جديدة.

-- ── ١) النقلُ بمصدرٍ متوقَّع ─────────────────────────────────
create or replace function public.assign_passenger_room(
  p_passenger_id bigint, p_room_id bigint, p_expected_room_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_type    text;
  v_current bigint;
begin
  -- الترتيبُ نفسُه في النسخة القديمة: لا يعرف من لا صلاحيةَ له وجودَ الحاجّ،
  -- ولا يعرف من لا يملك هذا الشخصَ أين غرفتُه.
  if not (public.has_permission('manage_hotel')
          or public.has_permission('manage_passengers')
          or public.has_permission('manage_admins')) then
    raise exception 'ليست لديك صلاحية تسكين الغرف.' using errcode = '42501';
  end if;
  if p_passenger_id is null then
    raise exception 'الحاجّ مطلوب.' using errcode = '22004';
  end if;

  -- القفلُ يُمسك حتى آخر المعاملة — والنسخةُ القديمةُ تكتب تحته
  select p.passenger_type, p.room_id into v_type, v_current
    from public.passengers p where p.id = p_passenger_id
   for update;
  if not found then
    raise exception 'الحاجّ رقم % غير موجود.', p_passenger_id using errcode = 'P0002';
  end if;

  if not public.mod001_may_place_passenger(v_type) then
    raise exception 'ليست لديك صلاحية تسكين هذا الشخص.' using errcode = '42501';
  end if;

  if v_current is distinct from p_expected_room_id then
    raise exception 'تغيّر مكانُ الحاجّ منذ عُرض عليك — لم يُنقل. حدّث الصفحة ثمّ أعد المحاولة.'
      using errcode = 'P0001', hint = 'mod001_stale_source';
  end if;

  return public.assign_passenger_room(p_passenger_id, p_room_id);
end;
$$;

comment on function public.assign_passenger_room(bigint, bigint, bigint) is
  'MOD-001 #62 — كالنسخة ذات الوسيطين، بشرطٍ ذرّيّ: غرفةُ الحاجّ الآن (تحت قفل صفّه) = p_expected_room_id، و null = بلا غرفة. الاختلاف ← P0001 بتلميح mod001_stale_source ولا كتابة.';

alter function public.assign_passenger_room(bigint, bigint, bigint) owner to postgres;
revoke all on function public.assign_passenger_room(bigint, bigint, bigint) from public, anon;
grant execute on function public.assign_passenger_room(bigint, bigint, bigint) to authenticated, service_role;

-- ── ٢) تفرّدُ رقم الغرفة: داخل الفندق، والغرفُ بلا فندق على موسمها ─
do $pre$
begin
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'rooms'
                    and indexname = 'rooms_hotel_floor_number_uniq'
                    and indexdef = 'CREATE UNIQUE INDEX rooms_hotel_floor_number_uniq ON public.rooms USING btree (hotel_id, floor, number)') then
    raise exception 'rooms_hotel_floor_number_uniq غائبٌ أو بتعريفٍ غيرِ المتوقَّع — لا يُسقَط القديم.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'rooms'
                    and indexname = 'rooms_season_floor_number_uniq'
                    and indexdef = 'CREATE UNIQUE INDEX rooms_season_floor_number_uniq ON public.rooms USING btree (season_id, floor, number)') then
    raise exception 'rooms_season_floor_number_uniq غائبٌ أو بتعريفٍ غيرِ المتوقَّع.' using errcode = 'P0001';
  end if;
  -- فهرسٌ مستقلّ لا قيد: يُسقَط بـdrop index
  if exists (select 1 from pg_constraint where conname = 'rooms_season_floor_number_uniq') then
    raise exception 'rooms_season_floor_number_uniq قيدٌ لا فهرس — غيرُ المتوقَّع.' using errcode = 'P0001';
  end if;
end;
$pre$;

-- الجديدُ أوّلاً ثمّ القديم: ما يحميه الجزئيُّ مجموعةٌ جزئيّةٌ ممّا كان القديمُ
-- يحميه، فلا صفَّ قائماً يخالفه.
create unique index rooms_unlinked_season_floor_number_uniq
  on public.rooms (season_id, floor, number)
  where hotel_id is null;

drop index public.rooms_season_floor_number_uniq;

-- ── ٣) شرطٌ لاحق ─────────────────────────────────────────────
do $chk$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.assign_passenger_room(bigint, bigint)',
    'public.assign_passenger_room(bigint, bigint, bigint)'] loop
    if not exists (select 1 from pg_proc p where p.oid = v_fn::regprocedure and p.prosecdef
                    and p.proconfig @> array['search_path=public, pg_temp']) then
      raise exception '% ليست SECURITY DEFINER بـsearch_path ثابت.', v_fn using errcode = 'P0001';
    end if;
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'anon يملك تنفيذ %.', v_fn using errcode = 'P0001';
    end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'authenticated لا يملك تنفيذ %.', v_fn using errcode = 'P0001';
    end if;
  end loop;

  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'rooms_season_floor_number_uniq') then
    raise exception 'الفهرسُ القديمُ على الموسم ما زال قائماً.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'rooms_unlinked_season_floor_number_uniq'
                    and indexdef = 'CREATE UNIQUE INDEX rooms_unlinked_season_floor_number_uniq ON public.rooms USING btree (season_id, floor, number) WHERE (hotel_id IS NULL)') then
    raise exception 'rooms_unlinked_season_floor_number_uniq غائبٌ أو بتعريفٍ غيرِ المتوقَّع.' using errcode = 'P0001';
  end if;
end;
$chk$;
