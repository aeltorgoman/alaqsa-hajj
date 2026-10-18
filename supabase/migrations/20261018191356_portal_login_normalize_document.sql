-- ═══════════════════════════════════════════════════════════════════
-- version : 20261018191356
-- name    : portal_login_normalize_document
-- ═══════════════════════════════════════════════════════════════════
--
-- M2 — دخولُ البوابة يقارن الوثيقةَ بصيغةٍ موحَّدة على الطرفين:
--   · الفراغاتُ المحيطة (ومعها NBSP ومحارفُ الاتّجاه صفريّةُ العرض) تُحذف
--   · الأرقامُ العربيّة ٠-٩ والفارسيّة ۰-۹ ← 0-9
--   · الحروفُ اللاتينيّة ← كبيرة
-- فـ«a1234567» و« A١٢٣٤٥٦٧ » تطابقان «A1234567» المخزَّنة، وتُطبَّع القيمةُ
-- المخزَّنةُ بالدالّة نفسِها (لا يُمسّ الصفّ).
--
-- والواجهةُ تطبّع بالقاعدة نفسِها (`portal.login.ts`) قبل الإرسال؛ وهذه هي
-- المرجعُ لأنّ الدالّة مفتوحةٌ لـanon وتُنادى مباشرة.
--
-- ما لا يتغيّر في `create_pilgrim_session`: التوقيعُ والمِنَح، وحارسُ الوثيقة
-- الفارغة (H1)، وفحصا الحدّ قبل المطابقة والعدُّ عند الفشل وحده، والرمزُ
-- وبصمتُه وتنظيفُ الجلسات، والردُّ الموحَّد (null) لكلّ فشل.
-- ما يتغيّر:
--   · مفتاحُ حدّ الوثيقة على الصيغة الموحَّدة — تنويعُ الحالة أو الأرقام لا
--     يفتح عدّاداً جديداً. (العدّاداتُ القائمةُ تبدأ من جديدٍ مرّةً عند التطبيق.)
--   · وثيقةٌ موحَّدةٌ أطولُ من ٣٢ أو فيها محرفُ تحكّم ← null قبل كلّ شيء.
--
-- ⚠️ لا يُمسّ صفّ. التراجع: ترحيلةٌ لاحقةٌ تعيد جسد 20261018152037 (M-44).

create function public._portal_normalize_doc(p_doc text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select upper(translate(
           regexp_replace(p_doc,
             '^[[:space:] ​‎‏﻿]+|[[:space:] ​‎‏﻿]+$', '', 'g'),
           '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))
$$;

comment on function public._portal_normalize_doc(text) is
  'M2 — صيغةُ الوثيقة الموحَّدة لدخول البوابة: حذفُ الفراغات المحيطة (ومنها NBSP ومحارفُ الاتّجاه)، والأرقامُ العربيّة/الفارسيّة ← لاتينيّة، والحروفُ كبيرة. داخليّة.';

alter function public._portal_normalize_doc(text) owner to postgres;
revoke all on function public._portal_normalize_doc(text) from public, anon, authenticated;

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
  /* M2 — الوثيقةُ بصيغتها الموحَّدة: الحالةُ والفراغاتُ المحيطةُ والأرقامُ
     العربيّةُ والفارسيّة. ومفتاحُ الحدّ عليها هي: «a123» و«A123» و«A١٢٣»
     وثيقةٌ واحدةٌ بعدّادٍ واحد، فلا تتضاعف المحاولاتُ بتنويع الكتابة. */
  v_doc     text := public._portal_normalize_doc(p_doc);
  v_doc_key uuid := md5('doc:' || coalesce(public._portal_normalize_doc(p_doc), ''))::uuid;
  v_token   text;
  v_now     timestamptz := now();
  v_abs     timestamptz;
  v_idle    timestamptz;
begin
  /* ٠ — وثيقةٌ فارغة أو من فراغاتٍ وحدها ليست اعتماداً: كانت تطابق كلَّ
     شخصٍ بلا جوازٍ ولا هويّة (`coalesce(passport,'') = ''`)، فيدخل بتاريخ
     ميلاده وحده. والردُّ هو ردُّ البيانات الخاطئة نفسُه — لا تلميح. */
  if p_doc is null or p_doc ~ '^[[:space:]\u00a0\u200b\u200e\u200f\ufeff]*$' then
    return null;
  end if;
  /* M2 — وثيقةٌ أطولُ من ٣٢ أو فيها محرفُ تحكّم لا تطابق أحداً: ردُّ
     البيانات الخاطئة نفسُه، قبل كلّ شيء. */
  if v_doc is null or v_doc = '' or length(v_doc) > 32 or v_doc ~ '[[:cntrl:]]' then
    return null;
  end if;

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
      /* ووثيقةُ الحاجّ الفارغةُ لا تُطابَق أصلاً — حارسٌ ثانٍ مستقلٌّ عن الأوّل */
      and (nullif(public._portal_normalize_doc(passport), '') = v_doc
       or nullif(public._portal_normalize_doc(national_id), '') = v_doc)
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
  'س٧ — المسار المجهول الوحيد الذي يحوّل «وثيقة + ميلاد» إلى جلسة. H1: الوثيقةُ الفارغة/الفراغيّة تُرفض قبل كلّ شيء ولا تُطابَق وثيقةً فارغة. M2: المطابقةُ ومفتاحُ الحدّ على الصيغة الموحَّدة (_portal_normalize_doc). فحصا قراءة قبل المطابقة (المصدر ٣٠٠ فشل/ساعة، الوثيقة ١٠ فشل/ساعة)، والعدّ عند الفشل وحده، وكلاهما fail-closed.';

-- ── شروطٌ لاحقة على ما تملكه هذه الترحيلة وحده (S-38) ─────────────
do $post$
declare
  v_fn constant regprocedure := 'public.create_pilgrim_session(text, integer, integer, integer)'::regprocedure;
  v_src text;
begin
  if not exists (select 1 from pg_proc p where p.oid = v_fn and p.prosecdef
                  and p.proconfig @> array['search_path=public, pg_temp']) then
    raise exception 'create_pilgrim_session ليست SECURITY DEFINER بـsearch_path ثابت.' using errcode = 'P0001';
  end if;
  if not has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'مِنَحُ create_pilgrim_session تغيّرت.' using errcode = 'P0001';
  end if;
  if has_function_privilege('anon', 'public._portal_normalize_doc(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._portal_normalize_doc(text)', 'EXECUTE') then
    raise exception '_portal_normalize_doc داخليّةٌ وقابلةٌ للتنفيذ من دور عميل.' using errcode = 'P0001';
  end if;
  -- الصيغة
  if public._portal_normalize_doc(U&' \00A0a12٣4۵67\200F ') <> 'A1234567'
     or public._portal_normalize_doc('ab c') <> 'AB C'
     or public._portal_normalize_doc(null) is not null then
    raise exception '_portal_normalize_doc لا تطابق القاعدة.' using errcode = 'P0001';
  end if;
  -- الحارسان (H1) والمطابقةُ الموحَّدة في الجسد المطبَّق فعلاً
  select p.prosrc into v_src from pg_proc p where p.oid = v_fn;
  if position('p_doc is null or p_doc ~' in v_src) = 0
     or position('nullif(public._portal_normalize_doc(passport), '''') = v_doc' in v_src) = 0
     or position('md5(''doc:'' || coalesce(public._portal_normalize_doc(p_doc)' in v_src) = 0 then
    raise exception 'حرّاسُ create_pilgrim_session غائبةٌ عن جسدها.' using errcode = 'P0001';
  end if;
end
$post$;
