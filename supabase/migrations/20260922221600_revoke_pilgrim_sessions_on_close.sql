-- ════════════════════════════════════════════════════════════
-- إبطالُ جلساتِ الحجّاج عند إقفال الموسم
-- ════════════════════════════════════════════════════════════
-- ث٤ من #42: «حاجّ الموسم المقفل لا يدخل البوابة». والبابُ محروسٌ
-- اليوم فعلاً: `_pilgrim_session_owner` — وهي الطريقُ الوحيدة إلى
-- كلّ دوالّ البوابة — تشترط `s.season_id = active_season_id()`،
-- فالرمزُ القديم يُردّ ولا يقرأ شيئاً، ودوالُّ الكتابة تعود بـ
-- `false` قبل أن تلمس جدولاً، فلا يظهر خطأُ المحفّز للحاجّ أصلاً.
--
-- الذي بقي ليس ثغرةَ وصول، بل **صفوفاً لا تُطابق الواقع**:
-- `close_season()` يُقفل الموسم ولا يمسّ `pilgrim_sessions`، فتبقى
-- جلساتُه «غيرَ مُبطَلة» حتى تنتهي بمُضيّ تسعين يوماً. وضررُها
-- اثنان:
--
--   ١) أيُّ جردٍ أو تدقيقٍ يسأل «كم جلسةً حيّة؟» يُجاب بعددٍ كاذب.
--   ٢) خمولُها اليومَ معلَّقٌ بشرطٍ **واحد** في دالّةٍ مساعِدة. من
--      عدّل ذلك الشرطَ غداً أحيا الجلساتِ كلَّها دفعةً واحدة. وأن
--      تموت الجلسةُ في صفِّها أصدقُ من أن تموت في مسارِ قراءتها.
--
-- فالإبطالُ هنا **دفاعٌ في العمق وصدقُ حالة**، لا إغلاقُ ثغرة.
-- والحارسُ القائم لا يُمسّ ولا يُضعَّف.
--
-- ولا محفّزَ على `pilgrim_sessions` (صفر محفّزات)، فالتحديثُ يمرّ
-- بلا اصطدامٍ بحارسِ الموسم المقفل.

-- ─── ١) الإبطال داخل معاملة الإقفال نفسها ───
-- الدالّة منقولةٌ كما هي من الإنتاج، ولم يُضَف إليها غيرُ الخطوة
-- الموسومة أدناه: لا تغييرَ في التوقيع ولا في الترتيب ولا في
-- الرسائل ولا في لقطة التسعير ولا في صفّ التدقيق.
create or replace function public.close_season(
  p_new_name       text,
  p_new_hijri_year integer,
  p_closed_by      text,
  p_actor          uuid
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old      bigint;
  v_new      bigint;
  v_name     text := btrim(coalesce(p_new_name, ''));
  v_old_row  jsonb;
  v_priced   int;
  v_sessions int;
begin
  if v_name = '' then
    raise exception 'اسم الموسم الجديد مطلوب.' using errcode = 'P0001';
  end if;

  if p_new_hijri_year is null then
    raise exception 'السنة الهجرية للموسم الجديد مطلوبة.' using errcode = 'P0001';
  end if;

  if p_new_hijri_year <= 0 or p_new_hijri_year >= 10000 then
    raise exception 'السنة الهجرية % غير صالحة.', p_new_hijri_year using errcode = 'P0001';
  end if;

  -- قفل الموسم النشط أولاً: يسلسل الإقفالات المتزامنة، ويمنع أي
  -- كتابة جارية (تأخذ for share) من أن تسبقنا وتصير في موسم مقفل
  select id into v_old from public.seasons where closed_at is null for update;
  if v_old is null then
    raise exception 'لا يوجد موسم مفتوح لإقفاله.' using errcode = 'P0001';
  end if;

  /* الهويّةُ هي السنة. */
  if exists (select 1 from public.seasons where hijri_year = p_new_hijri_year) then
    raise exception 'يوجد موسم للسنة % بالفعل.', p_new_hijri_year using errcode = 'P0001';
  end if;

  select to_jsonb(s) into v_old_row from public.seasons s where s.id = v_old;

  update public.seasons
     set closed_at = now(), closed_by = p_closed_by
   where id = v_old;

  /* لقطة التسعير — قبل إنشاء الموسم الجديد، وفي هذه المعاملة. */
  insert into public.season_pricing_snapshot (season_id, key, label, type, amount)
  select v_old, ps.key, ps.label, ps.type, ps.amount
    from public.pricing_settings ps
  on conflict (season_id, key) do nothing;

  get diagnostics v_priced = row_count;

  /* ═══ الخطوةُ المضافة — إبطالُ جلساتِ الموسم المُقفَل ═══
     في هذه المعاملة: إن تراجع الإقفال تراجع الإبطالُ معه، فلا
     يُطرَد حاجٌّ من بوابةِ موسمٍ ما زال مفتوحاً. */
  update public.pilgrim_sessions
     set revoked_at = now()
   where season_id = v_old
     and revoked_at is null;

  get diagnostics v_sessions = row_count;

  /* الأماكنُ **لا تُنسَخ** من الموسم السابق: قرارٌ صريح. */
  insert into public.seasons (name, hijri_year)
  values (v_name, p_new_hijri_year)
  returning id into v_new;

  perform public.record_season_event(
    p_actor, 'update', v_old, v_old_row,
    jsonb_build_object(
      'closed_by',             p_closed_by,
      'new_season_id',         v_new,
      'new_season_name',       v_name,
      'new_season_hijri_year', p_new_hijri_year,
      'pricing_snapshot',      v_priced,
      'sessions_revoked',      v_sessions)
  );

  return v_new;
end;
$function$;

alter function public.close_season(text, integer, text, uuid) owner to postgres;
revoke execute on function public.close_season(text, integer, text, uuid) from public, anon, authenticated;

-- ─── ٢) الصفوفُ الباقيةُ من إقفالٍ سابق ───
-- إقفالُ الموسم ٩ جرى قبل هذه الخطوة، فجلساتُه ما زالت غيرَ
-- مُبطَلة. تُبطَل مرّةً واحدة. وشرطُ `revoked_at is null` يجعلها
-- عمليةً خاملةً عند إعادة التشغيل، ولا يدوس على وقتِ إبطالٍ سابق.
update public.pilgrim_sessions ps
   set revoked_at = now()
  from public.seasons s
 where s.id = ps.season_id
   and s.closed_at is not null
   and ps.revoked_at is null;

-- ─── ٣) شرطٌ لاحقٌ يصرخ ───
do $guard$
declare
  v_live int;
  v_step int;
begin
  select count(*) into v_live
    from public.pilgrim_sessions ps
    join public.seasons s on s.id = ps.season_id
   where s.closed_at is not null
     and ps.revoked_at is null;
  if v_live <> 0 then
    raise exception 'بقيت % جلسةً غيرَ مُبطَلة على موسمٍ مقفل.', v_live
      using errcode = 'P0001';
  end if;

  /* والدالّة تحمل الخطوةَ فعلاً — لا نكتفي بأنها تُرجمت */
  select count(*) into v_step
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'close_season'
     and p.prosrc like '%pilgrim_sessions%';
  if v_step <> 1 then
    raise exception 'close_season لا تُبطل الجلسات كما يجب.'
      using errcode = 'P0001';
  end if;
end;
$guard$;
