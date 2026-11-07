-- ════════════════════════════════════════════════════════════
-- المخيّمُ «الخاص» في منى وعرفة يقبل الرجالَ والنساء معاً
-- ════════════════════════════════════════════════════════════
-- قرارُ المنتج (٢٠٢٦-١١): الخيمةُ الخاصّة تجمع الجنسين، والعاديّةُ تبقى
-- لجنسٍ واحدٍ لا يُتجاوز. صلةُ القرابة لا شأن لها بالقبول.
--
--   · `assert_camp_admits`: فحصا الجنس (مسجَّلٌ ومطابقٌ لجنس المخيّم) يسريان على
--     المخيّم العاديّ وحده كما كانا حرفاً. الموسمُ والسعةُ يسريان على الكلّ.
--     التوقيعُ نفسُه، فالصلاحياتُ القائمة لا تتغيّر، والمستدعي (`reject_invalid_allocation`)
--     لا يتغيّر: نوعُ المخيّم يُقرأ هنا من صفّه، وقد قفله المستدعي (`for update`).
--   · `camps_guard_occupants`: تغييرُ جنس مخيّمٍ عاديٍّ مأهول يُرفض إن خالفه نازل —
--     كما كان. والجديد: تحويلُ مخيّمٍ خاصٍّ مأهولٍ إلى عاديّ يُرفض كذلك إن ضمّ نازلاً
--     من غير جنسه، فلا يصير مخيّمٌ عاديٌّ مختلطاً من بابٍ خلفيّ. ويُضاف `type` إلى
--     أعمدة الزناد لذلك.
--   · جنسُ المخيّم الخاصّ يبقى عموداً إلزاميّاً (`camps_gender_vocab`): يحدّد مجموعةَ
--     عرضه وترتيبه في الصفحة، لا من يُقبل فيه.
--
-- لا بيانات تُمسّ: لا تحديثَ ولا حذفَ لصفوف، والتوزيعاتُ القائمة صالحةٌ تحت القاعدة
-- الجديدة (كلُّ ما قبلته القاعدةُ القديمة تقبله الجديدة).

create or replace function public.assert_camp_admits(
  p_passenger_id bigint, p_camp_id bigint, p_pax_season bigint, p_pax_gender text,
  p_camp_season bigint, p_camp_cap integer, p_camp_name text, p_camp_gender text, p_column text)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_occ     integer;
  v_private boolean;
begin
  if p_camp_season <> p_pax_season then
    raise exception 'المخيّم «%» يتبع موسماً آخر — لا يُسنَد حاجّ إلى مخيّمٍ خارج موسمه.', p_camp_name
      using errcode = 'P0001';
  end if;

  /* الخاصُّ يجمع الجنسين؛ العاديُّ لجنسه وحده، والفصلُ فيه لا يُتجاوز. */
  select coalesce(btrim(c.type), '') = 'خاص' into v_private
    from public.camps c where c.id = p_camp_id;

  if not coalesce(v_private, false) then
    if p_pax_gender is null or btrim(p_pax_gender) = '' then
      raise exception 'الحاجّ بلا جنسٍ مسجَّل — لا يُسنَد إلى مخيّم قبل تسجيله.'
        using errcode = 'P0001';
    end if;
    if p_camp_gender <> p_pax_gender then
      raise exception 'المخيّم «%» مخيّم %، والحاجّ %. الفصل بالجنس لا يُتجاوز.',
        p_camp_name, p_camp_gender, p_pax_gender using errcode = 'P0001';
    end if;
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

create or replace function public.camps_guard_occupants()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
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

  /* مخيّمٌ عاديٌّ بعد التغيير (بتغيير جنسه، أو بتحويله من خاصّ): كلُّ نازليه من جنسه */
  if (new.gender is distinct from old.gender or new.type is distinct from old.type)
     and coalesce(btrim(new.type), '') <> 'خاص' then
    select count(*) into v_bad from public.passengers p
     where (p.camp_mina_id = new.id or p.camp_arafa_id = new.id)
       and p.gender is distinct from new.gender;
    if v_bad > 0 then
      raise exception 'المخيّم «%» يضمّ % نازلاً من جنسٍ آخر، فلا يصير مخيّماً عاديّاً لـ%. أخرِجهم أولاً.',
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
  before update of capacity, gender, type, page_type on public.camps
  for each row execute function public.camps_guard_occupants();
