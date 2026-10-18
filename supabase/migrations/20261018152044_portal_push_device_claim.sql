-- ═══════════════════════════════════════════════════════════════════
-- version : 20261018152044
-- name    : portal_push_device_claim
-- ═══════════════════════════════════════════════════════════════════
--
-- H4 — جهازٌ واحدٌ وحاجّان. اشتراكُ الدفع مربوطٌ بالـendpoint (جهاز/متصفّح)،
-- والخروجُ والدخولُ لا يقولان للخادم شيئاً عنه. فيبقى جهازٌ تركه حاجٌّ
-- مربوطاً به: تنبيهاتُه تظهر على شاشة من دخل بعده، والداخلُ يُقال له
-- «التنبيهات مفعّلة» ولم يسجّل شيئاً.
--
-- `claim_pilgrim_push_device(token, endpoint)` — تُنادى بعد كلّ دخولٍ ناجح
-- إن كان في المتصفّح اشتراكٌ قائم، وتحكم على **هذا الجهاز وحده**:
--   'own'        ← الجهازُ مربوطٌ بحاجّ هذه الجلسة نفسِه (عاد بعد انتهاء
--                  جلسته طبيعيّاً): يبقى كما هو، ويُحدَّث `last_seen_at`.
--   'released'   ← مربوطٌ بحاجٍّ آخر: يُحذف **هذا الصفُّ وحده** — أجهزةُ
--                  ذاك الحاجّ الأخرى لا تُمسّ — ولا يُربط بالداخل.
--   'none'       ← لا صفَّ له: لا شيء يُربط تلقائيّاً.
--   'held'       ← مربوطٌ بحاجٍّ آخر وتعذّر حذفُه (حارسُ موسمٍ مقفل): يبقى،
--                  وذاك الحاجُّ خارجَ جمهور الموسم النشط أصلاً.
--   'no_session' ← الجلسةُ غير صالحة: لا يُمسّ شيء.
-- والداخلُ الجديد يفعّل تنبيهاتِه بنفسه (`register_pilgrim_push`) — لا نقلَ
-- تلقائيّاً لاشتراك غيره. والعميلُ يُلغي اشتراكَ المتصفّح في كلّ حالٍ غير 'own'.
--
-- ولا تمسّ هذه الترحيلةُ `register_pilgrim_push` ولا `unregister_pilgrim_push`
-- ولا `revoke_pilgrim_session`: الخروجُ الصريحُ يناديها كما هي.
--
-- ⚠️ لا يُمسّ صفّ عند التطبيق. دالّةٌ جديدةٌ لـanon وحده (مسارُ الجلسة).
-- التراجع: ترحيلةٌ لاحقةٌ تُسقطها بعد أن لا يناديها عميلٌ منشور (M-44، M-51).

create function public.claim_pilgrim_push_device(p_token text, p_endpoint text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pid   bigint;
  v_owner bigint;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then
    return 'no_session';
  end if;
  if p_endpoint is null or length(trim(p_endpoint)) = 0 then
    return 'none';
  end if;

  select s.passenger_id into v_owner
    from public.pilgrim_push_subscriptions s
   where s.endpoint = p_endpoint
   for update;
  if not found then
    return 'none';
  end if;

  if v_owner = v_pid then
    update public.pilgrim_push_subscriptions
       set last_seen_at = now()
     where endpoint = p_endpoint;
    return 'own';
  end if;

  begin
    delete from public.pilgrim_push_subscriptions
     where endpoint = p_endpoint
       and passenger_id = v_owner;
  exception when others then
    raise log 'claim_pilgrim_push_device: binding of another pilgrim kept (%), endpoint not released', sqlstate;
    return 'held';
  end;
  return 'released';
end;
$$;

comment on function public.claim_pilgrim_push_device(text, text) is
  'H4 — بعد الدخول: هذا الجهازُ لحاجّ الجلسة (own · يبقى) أم لغيره (released · يُحذف صفُّ هذا الجهاز وحده ولا يُربط بالداخل) أم لا أحد (none). held: تعذّر الحذف. no_session: جلسةٌ غير صالحة.';

alter function public.claim_pilgrim_push_device(text, text) owner to postgres;
revoke all on function public.claim_pilgrim_push_device(text, text) from public, authenticated;
grant execute on function public.claim_pilgrim_push_device(text, text) to anon, service_role;

-- ── شروطٌ لاحقة على ما تملكه هذه الترحيلة وحده (S-38) ─────────────
do $post$
declare
  v_fn constant regprocedure := 'public.claim_pilgrim_push_device(text, text)'::regprocedure;
begin
  if not exists (select 1 from pg_proc p where p.oid = v_fn and p.prosecdef
                  and p.proconfig @> array['search_path=public, pg_temp']) then
    raise exception 'claim_pilgrim_push_device ليست SECURITY DEFINER بـsearch_path ثابت.' using errcode = 'P0001';
  end if;
  if not has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception 'claim_pilgrim_push_device لا تُنفَّذ من anon.' using errcode = 'P0001';
  end if;
  if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'claim_pilgrim_push_device قابلةٌ للتنفيذ من authenticated.' using errcode = 'P0001';
  end if;
end
$post$;
