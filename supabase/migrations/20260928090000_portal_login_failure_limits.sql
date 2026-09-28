-- ═══════════════════════════════════════════════════════════════════
-- version : 20260928090000
-- name    : portal_login_failure_limits
-- ═══════════════════════════════════════════════════════════════════
--
-- تجهيزُ البوابة لتدفّق مئات الحجّاج من شبكةٍ واحدة — دون إرخاء حمايةِ
-- التخمين. ثلاثةُ تغييرات، لا غير:
--
-- ١) `rate_limit_exceeded` — فحصٌ **للقراءة وحدها**: هل بلغ عدّادُ هذه
--    النافذة الحدّ؟ لا يكتب شيئاً. داخليّة: لا تُمنح لـ`anon`.
--
-- ٢) `consume_rate_limit` — تنظيفُ النوافذ القديمة صار مقيَّداً بالنطاق
--    أيضاً (`scope = p_scope`)، فيستعمل ترتيبَ المفتاح الأساسيّ
--    (scope, subject, window_start). والسلوكُ هو هو: كلُّ موضوعٍ يحمل
--    بادئةَ نطاقه أصلاً ('src:' / 'doc:' / 'pilgrim:')، فلا يتشارك
--    نطاقان موضوعاً واحداً.
--
-- ٣) `create_pilgrim_session` — الترتيب المعتمد:
--      أ. فحصُ المصدر (قراءة): ٣٠٠ **فشلٍ** في الساعة ← رفض.
--      ب. فحصُ الوثيقة (قراءة): ١٠ **فشلٍ** في الساعة ← رفض — **قبل**
--         المطابقة. ⚠️ كان حدُّ الوثيقة يُفحص بعد الفشل وحده، فالتخمينُ
--         الصحيح بعد العاشرة كان يمرّ: الحدُّ كان يغيّر ردَّ الخطأ لا
--         يمنع النجاح. فكان حدُّ المصدر وحده الحاجز الحقيقيّ، ولا يجوز
--         إرخاؤه دون هذا.
--      ج. المطابقة كما هي (وثيقة + ميلاد، الموسم النشط).
--      د. الفشل: يُعدّ على المصدر وعلى الوثيقة، والردّ موحَّد.
--      هـ. النجاح: لا يُعدّ شيء. والتنظيفُ لجلسات **هذا الحاجّ** الميتة
--         وحدها بدل مسح الجدول كلّه — والجلسةُ الميتة لا تُقبل أصلاً في
--         `_pilgrim_session_owner` (إبطالٌ/خمولٌ/حدٌّ مطلق/موسم)، فتأخيرُ
--         حذفها المادّيّ لا يمسّ الأمن.
--      و. أيُّ عطلٍ في الفحص أو العدّ ← رفض (fail-closed).
--
-- لا فهرس جديد، ولا تغيير في عقد الردّ.

-- ── ١) فحصٌ للقراءة وحدها ─────────────────────────────────────────
create or replace function public.rate_limit_exceeded(
  p_scope text, p_subject uuid, p_limit integer, p_window_seconds integer)
returns boolean
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((
    select r.hits >= p_limit
      from public.edge_rate_limits r
     where r.scope = p_scope
       and r.subject = p_subject
       and r.window_start = to_timestamp(
             floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)
  ), false);
$$;

revoke all on function public.rate_limit_exceeded(text, uuid, integer, integer) from public;
grant execute on function public.rate_limit_exceeded(text, uuid, integer, integer) to service_role;

comment on function public.rate_limit_exceeded(text, uuid, integer, integer) is
  'فحصُ حدٍّ للقراءة وحدها: هل بلغ عدّادُ النافذة الحالية الحدَّ؟ لا يكتب. داخليّة — لا تُمنح لـanon.';

-- ── ٢) التنظيف مقيَّدٌ بالنطاق ─────────────────────────────────────
create or replace function public.consume_rate_limit(
  p_scope text, p_subject uuid, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_subject is null or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    return false;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.edge_rate_limits as r (scope, subject, window_start, hits)
  values (p_scope, p_subject, v_window, 1)
  on conflict (scope, subject, window_start)
  do update set hits = r.hits + 1
  returning r.hits into v_hits;

  /* النطاقُ في الشرط يجعل المفتاحَ الأساسيّ صالحاً للبحث */
  delete from public.edge_rate_limits
   where scope = p_scope and subject = p_subject and window_start < v_window;

  return v_hits <= p_limit;
end;
$$;

-- ── ٣) الدخول ──────────────────────────────────────────────────────
create or replace function public.create_pilgrim_session(
  p_doc text, p_day integer, p_month integer, p_year integer)
returns json
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_p       public.passengers%ROWTYPE;
  v_matched boolean := false;
  v_nums    text[];
  v_y int; v_m int; v_d int;
  v_xff     text;
  v_src     text;
  v_src_key uuid;
  v_doc_key uuid := md5('doc:' || coalesce(trim(p_doc), ''))::uuid;
  v_token   text;
  v_now     timestamptz := now();
  v_abs     timestamptz;
  v_idle    timestamptz;
begin
  /* أ + ب — فحصان للقراءة قبل أي مطابقة. أيُّ عطلٍ ← رفض */
  begin
    v_xff := coalesce(
      (coalesce(current_setting('request.headers', true), '{}')::json)->>'x-forwarded-for', '');
    v_src := nullif(trim(split_part(v_xff, ',',
               greatest(array_length(string_to_array(v_xff, ','), 1), 1))), '');
    if v_src is not null then
      v_src_key := md5('src:' || v_src)::uuid;
      if public.rate_limit_exceeded('portal-verify-src', v_src_key, 300, 3600) then
        return json_build_object('rate_limited', true);
      end if;
    end if;

    if public.rate_limit_exceeded('portal-verify-doc', v_doc_key, 10, 3600) then
      return json_build_object('rate_limited', true);
    end if;
  exception when others then
    raise warning 'تعذّر فحص حدّ البوابة: %', sqlerrm;
    return json_build_object('rate_limited', true);
  end;

  /* ج — المطابقة كما كانت */
  for v_p in
    select * from public.passengers
    where season_id = public.active_season_id()
      and (trim(coalesce(passport,'')) = trim(p_doc)
       or trim(coalesce(national_id,'')) = trim(p_doc))
  loop
    v_nums := regexp_split_to_array(regexp_replace(coalesce(v_p.dob,''), '[^0-9]+', ' ', 'g'), '\s+');
    v_nums := array_remove(v_nums, '');
    if array_length(v_nums,1) = 3 then
      if length(v_nums[1]) = 4 then
        v_y := v_nums[1]::int; v_m := v_nums[2]::int; v_d := v_nums[3]::int;
      else
        v_d := v_nums[1]::int; v_m := v_nums[2]::int; v_y := v_nums[3]::int;
      end if;
      if v_y = p_year and v_m = p_month and v_d = p_day then
        v_matched := true;
        exit;
      end if;
    end if;
  end loop;

  /* د — الفشل يُعدّ على المصدر والوثيقة، والردّ موحَّد (null) */
  if not v_matched then
    begin
      if v_src_key is not null then
        perform public.consume_rate_limit('portal-verify-src', v_src_key, 300, 3600);
      end if;
      perform public.consume_rate_limit('portal-verify-doc', v_doc_key, 10, 3600);
    exception when others then
      raise warning 'تعذّر عدّ فشل البوابة: %', sqlerrm;
      return json_build_object('rate_limited', true);
    end;
    return null;
  end if;

  /* هـ — النجاح: لا عدّ. وتنظيفُ جلسات هذا الحاجّ الميتة وحدها */
  delete from public.pilgrim_sessions
   where passenger_id = v_p.id
     and (absolute_expires_at < v_now
       or idle_expires_at     < v_now
       or revoked_at is not null);

  v_token := replace(replace(replace(
               encode(extensions.gen_random_bytes(32), 'base64'),
               '+', '-'), '/', '_'), '=', '');
  v_abs   := v_now + interval '90 days';
  v_idle  := least(v_now + interval '30 days', v_abs);

  insert into public.pilgrim_sessions
    (token_hash, passenger_id, season_id, issued_at, idle_expires_at, absolute_expires_at, last_seen_at)
  values
    (extensions.digest(v_token, 'sha256'), v_p.id, v_p.season_id, v_now, v_idle, v_abs, v_now);

  return json_build_object(
    'token', v_token,
    'idle_expires_at', v_idle,
    'absolute_expires_at', v_abs
  );
end;
$$;

comment on function public.create_pilgrim_session(text, integer, integer, integer) is
  'س٧ — المسار المجهول الوحيد الذي يحوّل «وثيقة + ميلاد» إلى جلسة. فحصا قراءة قبل المطابقة (المصدر ٣٠٠ فشل/ساعة، الوثيقة ١٠ فشل/ساعة)، والعدّ عند الفشل وحده، وكلاهما fail-closed.';
