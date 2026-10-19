-- ═══════════════════════════════════════════════════════════════════
-- version : 20261019112208
-- name    : portal_rpc_manage_portal_guard
-- ═══════════════════════════════════════════════════════════════════
--
-- L1 — دالّتا البوابة المساعدتان لا يستدعيهما إلا من يملك `manage_portal`.
--
--   announcement_audience(text, bigint[])  ← أرقامُ الحجّاج المستهدفين
--   push_enabled_passengers()              ← أرقامُ الحجّاج المفعّلين وعددُ أجهزتهم
--
-- كانتا SECURITY DEFINER ممنوحتين لـ`authenticated` بلا حارسٍ في الجسد: أيُّ موظّفٍ
-- مسجَّلٍ يقرأ بهما ما لا تعرضه له صلاحيّاتُه. ومستدعياهما المشروعان:
--   · صفحةُ «بوابة الحاج» (مسارُها محروسٌ بـ`manage_portal`) ← `authenticated`
--   · `send-pilgrim-push` بمفتاح الخدمة                    ← `service_role`
--
-- الحارسُ في الجسد (نمطُ `update_portal_settings`): يمرّ
--   · من يملك `manage_portal` وهو نشط (`has_permission`)، أو
--   · `service_role` — مسارُ الخادم وحده، أو
--   · اتّصالٌ مباشرٌ بالقاعدة بلا `SET ROLE` (المالكُ والترحيلات؛ `role = none`).
-- ويُرفض كلُّ ما سواه بـ42501. و`current_setting('role')` هنا هو دورُ المستدعي لا
-- المالك: SECURITY DEFINER يغيّر `current_user` ولا يمسّ إعدادَ `role`، وPostgREST
-- يضبطه دائماً من الـJWT الموقَّع (anon | authenticated | service_role) — فلا يصل
-- عميلٌ إلى `none`، ولا يملك أن يضبطه.
--
-- ما لا يتغيّر: التوقيعان، وشكلُ ما تُرجعانه، والمِنَحُ (authenticated و
-- service_role؛ ولا anon)، ومنطقُ الجمهور (H2: النوعُ المجهول لا أحد)، وسياساتُ
-- جدول `announcements` (قراءتُه لكلّ موظّفٍ نشط كما هي).
-- و`push_enabled_passengers` تنتقل من `sql` إلى `plpgsql` لتحمل الحارس؛ الاستعلامُ
-- نفسُه حرفاً.
--
-- ⚠️ لا يُمسّ صفّ. الواجهةُ لا تتغيّر: الصفحةُ لا تبلغها إلا صلاحيّةُ `manage_portal`.
-- التراجع: ترحيلةٌ لاحقةٌ تعيد الجسدين السابقين (M-44).

create or replace function public.announcement_audience(p_target_type text, p_target_ids bigint[])
returns table(passenger_id bigint)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  /* L1 — مديرُ البوابة، أو الخادمُ بمفتاح الخدمة، أو المالكُ مباشرة */
  if not (public.has_permission('manage_portal')
          or coalesce(current_setting('role', true), 'none') in ('service_role', 'none')) then
    raise exception 'ليست لديك صلاحية إدارة بوابة الحاج.' using errcode = '42501';
  end if;

  if coalesce(p_target_type, 'all') not in ('all', 'bus', 'camp_mina', 'camp_arafa', 'custom') then
    raise log 'announcement_audience: unknown target_type % — no recipients (fail-closed)', p_target_type;
    return;
  end if;
  return query
  select p.id from passengers p
  where (
      p.season_id is null
      or p.season_id = (select s.id from seasons s where s.closed_at is null order by s.id desc limit 1)
    )
    and case coalesce(p_target_type, 'all')
          when 'all'        then true
          when 'bus'        then p.bus_id        = any(p_target_ids)
          when 'camp_mina'  then p.camp_mina_id  = any(p_target_ids)
          when 'camp_arafa' then p.camp_arafa_id = any(p_target_ids)
          when 'custom'     then p.id            = any(p_target_ids)
          else false
        end;
end;
$$;

comment on function public.announcement_audience(text, bigint[]) is
  'جمهورُ تنبيهٍ للدفع: all · bus · camp_mina · camp_arafa · custom في الموسم المفتوح. H2: النوعُ المجهول لا أحد (fail-closed) ويُسجَّل RAISE LOG. L1: لمن يملك manage_portal، ولـservice_role (send-pilgrim-push)، وللمالك مباشرة؛ وغيرُهم 42501.';

create or replace function public.push_enabled_passengers()
returns table(passenger_id bigint, devices bigint)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  /* L1 — مديرُ البوابة، أو الخادمُ بمفتاح الخدمة، أو المالكُ مباشرة */
  if not (public.has_permission('manage_portal')
          or coalesce(current_setting('role', true), 'none') in ('service_role', 'none')) then
    raise exception 'ليست لديك صلاحية إدارة بوابة الحاج.' using errcode = '42501';
  end if;

  return query
  select s.passenger_id, count(*)::bigint
  from pilgrim_push_subscriptions s
  group by s.passenger_id;
end;
$$;

comment on function public.push_enabled_passengers() is
  'الحجّاجُ المفعّلون للتنبيهات وعددُ أجهزتهم — لصفحة «بوابة الحاج». L1: لمن يملك manage_portal، ولـservice_role، وللمالك مباشرة؛ وغيرُهم 42501.';

-- ── شروطٌ لاحقة على ما تملكه هذه الترحيلة وحده (S-38) ─────────────
do $post$
declare
  v_fn regprocedure;
begin
  foreach v_fn in array array[
      'public.announcement_audience(text, bigint[])'::regprocedure,
      'public.push_enabled_passengers()'::regprocedure] loop
    if not exists (select 1 from pg_proc p where p.oid = v_fn and p.prosecdef
                    and p.proconfig @> array['search_path=public, pg_temp']) then
      raise exception '% ليست SECURITY DEFINER بـsearch_path ثابت.', v_fn using errcode = 'P0001';
    end if;
    -- المِنَحُ كما كانت: authenticated و service_role، ولا anon ولا PUBLIC
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not has_function_privilege('service_role', v_fn, 'EXECUTE')
       or has_function_privilege('anon', v_fn, 'EXECUTE')
       or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                   where p.oid = v_fn and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'مِنَحُ % تغيّرت.', v_fn using errcode = 'P0001';
    end if;
    -- الحارسُ في الجسد المطبَّق فعلاً
    if position('has_permission(''manage_portal'')' in (select prosrc from pg_proc where oid = v_fn)) = 0 then
      raise exception 'حارسُ manage_portal غائبٌ عن %.', v_fn using errcode = 'P0001';
    end if;
  end loop;

  -- العقدُ كما كان
  if pg_get_function_result('public.announcement_audience(text, bigint[])'::regprocedure) <> 'TABLE(passenger_id bigint)'
     or pg_get_function_result('public.push_enabled_passengers()'::regprocedure) <> 'TABLE(passenger_id bigint, devices bigint)' then
    raise exception 'تغيّر شكلُ ما تُرجعه دالّتا البوابة.' using errcode = 'P0001';
  end if;

  -- والمالكُ مباشرةً يمرّ (الترحيلاتُ والصيانة)، والنوعُ المجهولُ لا أحد كما كان
  if exists (select 1 from public.announcement_audience('__unknown_type__', '{}'::bigint[])) then
    raise exception 'announcement_audience تعيد مستهدفين لنوعٍ مجهول.' using errcode = 'P0001';
  end if;
  perform count(*) from public.push_enabled_passengers();
end
$post$;
