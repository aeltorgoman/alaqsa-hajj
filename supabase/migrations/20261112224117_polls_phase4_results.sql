-- ═══════════════════════════════════════════════════════════════════
-- version : 20261112224117
-- name    : polls_phase4_results
-- ═══════════════════════════════════════════════════════════════════
--
-- Phase 4 — شاشةُ نتائج الاستطلاع: دالّةٌ واحدةٌ للقراءة، ولا شيءَ غيرُها.
-- لا جدولَ ولا عمودَ ولا محفّزَ ولا سياسة، ولا تغييرَ لدالّةٍ قائمة.
--
-- لماذا دالّةٌ جديدة؟ عقدُ Phase 2 لا يعطي الإدارةَ أسماءَ المجيبين لاستطلاعٍ منشور:
--   · poll_results  ← أعدادٌ فقط (بلا أسماء ولا أرقام حجّاج) — كما صُمِّمت.
--   · get_poll_snapshot ← الأسماءُ لكن للمغلق وحده (لقطةُ الإغلاق).
--   · جداولُ الإجابات والجمهور بلا منحِ قراءةٍ لأيّ دورٍ تطبيقيّ (Phase 2، عن قصد).
-- والإجاباتُ ليست مجهولة (قرارُ المنتج)، فتحتاج الإدارةُ قائمةً مسمّاة. والطريقُ الآمن
-- دالّةٌ محروسةٌ بـmanage_portal تُعيد إسقاطاً ضيّقاً، لا فتحُ الجداول.
--
-- poll_details(p_poll_id) → jsonb:
--   { poll_id, status, kind, max_choices, source: 'live'|'snapshot', as_of,
--     options: [{id,label,sort_order}],
--     labels:  { bus: {id:name}, camp_mina: {id:name} },
--     rows:    [{ passenger_id, name_ar, passenger_type, added_reason,
--                 bus, camp_mina, responded, revision, option_ids }] }
--
--   · المغلق ← من لقطة الإغلاق نفسها (rows · labels · options): الإسنادُ (باص · منى) وأسماؤها
--     كما كانت **لحظةَ الإغلاق**، وتبقى بعد حذف الحاجّ أو تغيّر إسناده. فالتحليلُ التاريخيّ
--     متاحٌ من Phase 2 ولا يُخترَع.
--   · المنشور ← الإسنادُ الحاليّ (_poll_rows · _poll_labels) — هو ما تعنيه «نتائجُ حيّة».
--   · المسوّدةُ والمجدوَل ← لا جمهورَ مجمَّداً بعد: rows فارغة.
--   · صفٌّ واحدٌ لكلّ حاجٍّ في الجمهور المجمَّد بإجابته **الحاليّة** — تغييرُ الإجابة لا يُضاعف العدّ.
--   · تقليلُ البيانات: لا عرفةَ ولا فندقَ ولا رحلات (خارجُ نطاق Phase 4)، ولا أيُّ عمودٍ آخر.
--
-- الصلاحية: الحارسُ نفسُه في Phase 1/2 (_announcement_admin_guard: manage_portal). authenticated
-- وحده، لا anon ولا service_role ولا public. ودوالُّ البوابة لا تمسّها هذه الترحيلة.
-- الاستحقاقُ الزمنيّ قبل القراءة (_poll_settle) كسائر دوالّ الإدارة: منتهٍ يُغلق بلقطته أوّلاً.

create function public.poll_details(p_poll_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p        public.polls%rowtype;
  s        public.poll_result_snapshots%rowtype;
  v_rows   jsonb;
  v_labels jsonb;
  v_opts   jsonb;
  v_src    text;
  v_asof   timestamptz;
begin
  perform public._announcement_admin_guard();
  perform public._poll_settle(p_poll_id);
  select * into p from public.polls where id = p_poll_id;
  if not found then
    raise exception 'الاستطلاع غير موجود.' using errcode = 'P0002';
  end if;

  if p.status = 'closed' then
    select * into s from public.poll_result_snapshots where poll_id = p_poll_id;
    if not found then
      raise exception 'لقطةُ نتائج الاستطلاع المغلق غير موجودة.' using errcode = 'P0002';
    end if;
    v_rows := s.rows; v_labels := s.labels; v_opts := s.options; v_src := 'snapshot'; v_asof := s.closed_at;
  elsif p.status = 'published' then
    v_rows := public._poll_rows(p_poll_id); v_labels := public._poll_labels(p.season_id);
    v_opts := public._poll_options_json(p_poll_id); v_src := 'live'; v_asof := now();
  else
    v_rows := '[]'::jsonb; v_labels := public._poll_labels(p.season_id);
    v_opts := public._poll_options_json(p_poll_id); v_src := 'live'; v_asof := now();
  end if;

  return jsonb_build_object(
    'poll_id', p.id, 'status', p.status, 'kind', p.kind, 'max_choices', p.max_choices,
    'source', v_src, 'as_of', v_asof,
    'options', coalesce(v_opts, '[]'::jsonb),
    'labels', jsonb_build_object('bus', coalesce(v_labels->'bus', '{}'::jsonb),
                                 'camp_mina', coalesce(v_labels->'camp_mina', '{}'::jsonb)),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
                'passenger_id', e->'passenger_id', 'name_ar', e->'name_ar', 'passenger_type', e->'passenger_type',
                'added_reason', e->'added_reason', 'bus', e->'bus', 'camp_mina', e->'camp_mina',
                'responded', coalesce(e->'responded', 'false'::jsonb), 'revision', e->'revision',
                'option_ids', coalesce(e->'option_ids', '[]'::jsonb))
              order by (e->>'passenger_id')::bigint), '[]'::jsonb)
             from jsonb_array_elements(coalesce(v_rows, '[]'::jsonb)) e));
end;
$$;

alter function public.poll_details(bigint) owner to postgres;
revoke all on function public.poll_details(bigint) from public, anon, authenticated, service_role;
grant execute on function public.poll_details(bigint) to authenticated;
comment on function public.poll_details(bigint) is
  'Phase 4 — تفاصيلُ النتائج المسمّاة (صفٌّ لكلّ حاجٍّ في الجمهور المجمَّد بإجابته الحاليّة · باص · منى). المغلقُ من لقطة الإغلاق، والمنشورُ بالإسناد الحاليّ. manage_portal وحده.';

-- ── شروطٌ لاحقة على ما تملكه هذه الترحيلة وحده (S-38) ─────────────
do $post$
declare
  v_fn  regprocedure := 'public.poll_details(bigint)'::regprocedure;
  v_src text;
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('service_role', v_fn, 'EXECUTE')
     or not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'poll_details: المِنَح غير صحيحة.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = v_fn and p.prosecdef
                  and p.proconfig @> array['search_path=public, pg_temp']) then
    raise exception 'poll_details ليست SECURITY DEFINER بمسار بحثٍ ثابت.' using errcode = 'P0001';
  end if;
  select prosrc into v_src from pg_proc where oid = v_fn;
  if position('_announcement_admin_guard()' in v_src) = 0 then
    raise exception 'poll_details بلا حارس manage_portal.' using errcode = 'P0001';
  end if;
  /* لا يُمنح anon شيئاً جديداً على جداول الاستطلاعات (ثابتُ Phase 2) */
  if has_table_privilege('anon', 'public.poll_responses', 'SELECT')
     or has_table_privilege('authenticated', 'public.poll_responses', 'SELECT')
     or has_table_privilege('authenticated', 'public.poll_response_choices', 'SELECT') then
    raise exception 'جداولُ الإجابات صارت مقروءةً مباشرة.' using errcode = 'P0001';
  end if;
end
$post$;
