-- ═══════════════════════════════════════════════════════════════════
-- version : 20261019135129
-- name    : m6_push_delivery_targets
-- ═══════════════════════════════════════════════════════════════════
--
-- M6 — تسليمُ تنبيهات البوابة إلى الأجهزة: موثوقٌ، لا يتكرّر، ويُستأنف.
--
-- كان `send-pilgrim-push` يرسل إلى كلّ الأجهزة في استدعاءٍ واحد ثم يكتب النتائج في
-- آخره: لا فحصَ لاستحقاق التنبيه، ولا قفلَ يمنع استدعاءين متزامنين من الإرسال مرّتين،
-- ولا إعادةَ محاولةٍ لخطأٍ عابر، وانقطاعُ الاستدعاء في وسطه لا يترك أثراً لما وصل.
--
-- هنا صفٌّ لكلّ جهازٍ مستهدف (`announcement_push_targets`) تمرّ عليه دورة:
--
--   pending ──حجز──▶ processing ──▶ sent                      (نهائيّ)
--      ▲                 │      ├──▶ retryable ──(موعده)──▶ حجزٌ جديد
--      │                 │      └──▶ failed                    (نهائيّ)
--      └── انتهاءُ الحجز بلا نتيجة (عاملٌ سقط) يعيده قابلاً للحجز
--
--   · الحجز `FOR UPDATE SKIP LOCKED` بمهلة (lease): عاملان متزامنان لا يحجزان صفّاً واحداً،
--     وصفُّ عاملٍ سقط يعود بعد انقضاء مهلته.
--   · النتيجةُ لا تُكتب إلا لصاحب الحجز نفسه وفي المحاولة نفسها (fencing): عاملٌ بطيءٌ
--     انتهت مهلته وأُعيد حجزُ صفّه لا يكتب فوق من بعده.
--   · ثلاثُ محاولاتٍ للجهاز حدّاً، تُحسب عند الحجز؛ والعابرُ وحده يُعاد بانتظارٍ متزايد.
--   · `push_sent_at` لم يعد قفلاً: يُختم حين لا يبقى جهازٌ غيرُ نهائيّ — «اكتمل التسليم».
--
-- ⚠️ حدٌّ لا تُزيله قاعدةُ البيانات: الإرسالُ إلى خدمة الدفع ثم تسجيلُ النتيجة خطوتان.
-- عاملٌ يسقط بينهما، أو يتأخّر حتى تنقضي مهلتُه، يُعاد إرسالُ صفّه — فالتسليمُ
-- «مرّةً على الأقلّ» لا «مرّةً بالضبط». ويحدّ من أثره أنّ عامل الخدمة في المتصفّح يعرض
-- التنبيه بوسم `ann-<id>`، فالثاني يحلّ محلّ الأول ولا يتكدّس.
--
-- `notification_deliveries` يبقى سجلَّ الحاجّ الواحد كما يقرؤه «تقرير الوصول» والبوابة،
-- ويُشتقّ من أجهزته: جهازٌ وصل يكفي (sent) ولا يمحوه فشلُ جهازٍ آخر، وما دام جهازٌ
-- مفتوحاً فالحاجّ pending، ولا يُمسّ `read_at`.
--
-- الدوالّ لـ`service_role` وحده (الدالةُ الطرفيّة بمفتاح الخدمة)، والجدولُ لا يُقرأ من
-- العميل. لا يُمسّ صفٌّ قائم: التنبيهاتُ المرسلة قبلها (`push_sent_at` مختوم) تُعدّ مكتملة.
-- التراجع: ترحيلةٌ لاحقة تحذف الجدول والدوالّ، ويعود الطرفُ إلى نسخته السابقة (M-44).

-- ── الجدول ──────────────────────────────────────────────────────────
create table public.announcement_push_targets (
  id               bigint generated always as identity primary key,
  announcement_id  bigint not null references public.announcements(id) on delete cascade,
  passenger_id     bigint not null references public.passengers(id) on delete cascade,
  -- الجهاز يُحذف (404/410 أو خروج الحاجّ) فيبقى الصفُّ شاهداً بلا جهاز
  subscription_id  bigint references public.pilgrim_push_subscriptions(id) on delete set null,
  status           text not null default 'pending'
                   check (status in ('pending', 'processing', 'sent', 'retryable', 'failed')),
  attempts         smallint not null default 0 check (attempts between 0 and 3),
  next_attempt_at  timestamptz not null default now(),
  lease_owner      uuid,
  lease_expires_at timestamptz,
  last_http_status integer,
  last_error_class text
                   check (last_error_class in ('timeout', 'network', 'rate_limited', 'server_error',
                                               'gone', 'unauthorized', 'bad_request', 'payload',
                                               'rejected', 'invalid', 'abandoned', 'reassigned',
                                               'cancelled')),
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (announcement_id, subscription_id),
  check ((status = 'processing') = (lease_owner is not null and lease_expires_at is not null))
);

comment on table public.announcement_push_targets is
  'M6 — جهازٌ مستهدفٌ بتنبيه: pending → processing (حجزٌ بمهلة) → sent | retryable | failed. ثلاثُ محاولاتٍ حدّاً. لا يحمل عنوانَ الجهاز ولا مفاتيحه — يُشار إليه بـsubscription_id. لـservice_role وحده.';

create index announcement_push_targets_claim_idx
  on public.announcement_push_targets (announcement_id, status, next_attempt_at);
create index announcement_push_targets_passenger_idx
  on public.announcement_push_targets (announcement_id, passenger_id);
create index announcement_push_targets_subscription_idx
  on public.announcement_push_targets (subscription_id);

-- حاجٌّ في موسمٍ مقفل لا يُكتب له شيء — كـ`notification_deliveries`
create trigger trg_reject_closed_season
  before insert or delete or update on public.announcement_push_targets
  for each row execute function public.reject_write_closed_season_derived();

alter table public.announcement_push_targets enable row level security;
revoke all on table public.announcement_push_targets from public, anon, authenticated;
revoke all on sequence public.announcement_push_targets_id_seq from public, anon, authenticated;
grant all on table public.announcement_push_targets to service_role;
grant usage, select on sequence public.announcement_push_targets_id_seq to service_role;

-- ── أدواتٌ داخليّة (لا تُمنح لأحد) ───────────────────────────────────

-- لماذا لا يُرسَل هذا التنبيه الآن؟ NULL = مستحقّ.
create function public._push_ineligible_reason(p_announcement_id bigint)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
           when a.id is null                                          then 'not_found'
           when a.season_id is distinct from public.active_season_id() then 'wrong_season'
           when a.show_at > now()                                     then 'not_due'
           when a.expires_at is not null and a.expires_at <= now()   then 'expired'
         end
    from (select 1) one
    left join public.announcements a on a.id = p_announcement_id;
$$;

-- قفلُ التنبيه الواحد طوال المعاملة: التهيئةُ وتسجيلُ النتائج والختمُ تمرّ به واحداً
-- بعد واحد، فكلٌّ منها يرى ما ثبّته من قبله (READ COMMITTED: لقطةٌ جديدةٌ لكلّ جملة).
create function public._push_lock(p_announcement_id bigint)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select pg_advisory_xact_lock(hashtextextended('m6_push:' || p_announcement_id::text, 0));
$$;

-- سجلُّ الحاجّ من أجهزته. لا يُستدعى إلا تحت `_push_lock`.
create function public._push_refresh_delivery(p_announcement_id bigint, p_passenger_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_devices  int;
  v_sent     timestamptz;
  v_any_sent boolean;
  v_open     boolean;
  v_all_gone boolean;
  v_error    text;
  v_status   text;
begin
  select count(*),
         max(t.sent_at),
         coalesce(bool_or(t.status = 'sent'), false),
         coalesce(bool_or(t.status in ('pending', 'processing', 'retryable')), false),
         coalesce(bool_and(t.status = 'failed' and t.last_error_class = 'gone'), false),
         string_agg(distinct t.last_error_class
                    || coalesce(' · HTTP ' || t.last_http_status, ''), '، ')
           filter (where t.status = 'failed')
    into v_devices, v_sent, v_any_sent, v_open, v_all_gone, v_error
    from public.announcement_push_targets t
   where t.announcement_id = p_announcement_id
     and t.passenger_id = p_passenger_id;

  v_status := case
                when v_devices = 0 then 'disabled'
                when v_any_sent    then 'sent'      -- جهازٌ وصل يكفي، وفشلُ غيره لا يمحوه
                when v_open        then 'pending'
                when v_all_gone    then 'expired'
                else 'failed'
              end;

  insert into public.notification_deliveries as d (announcement_id, passenger_id, status, error, sent_at)
  values (p_announcement_id, p_passenger_id, v_status,
          case when v_status in ('failed', 'expired') then left(v_error, 300) end,
          coalesce(v_sent, now()))
  on conflict (announcement_id, passenger_id) do update
    set status  = excluded.status,
        error   = excluded.error,
        sent_at = case when excluded.status = 'sent' then excluded.sent_at else d.sent_at end
        -- read_at لا يُمسّ
  where not (d.status = 'sent' and excluded.status <> 'sent');
end;
$$;

-- يُختم `push_sent_at` حين لا يبقى جهازٌ غيرُ نهائيّ. لا يُستدعى إلا تحت `_push_lock`.
create function public._push_finalize(p_announcement_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if exists (select 1 from public.announcement_push_targets t
              where t.announcement_id = p_announcement_id
                and t.status in ('pending', 'processing', 'retryable')) then
    return false;
  end if;
  update public.announcements set push_sent_at = now()
   where id = p_announcement_id and push_sent_at is null;
  return true;
end;
$$;

-- يُغلق صفوفاً غيرَ محجوزةٍ بسببٍ نهائيّ ويحدّث سجلّ أصحابها. تحت `_push_lock`.
create function public._push_close_targets(p_announcement_id bigint, p_ids bigint[], p_class text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pid bigint;
begin
  if coalesce(cardinality(p_ids), 0) = 0 then return; end if;
  for v_pid in
    update public.announcement_push_targets t
       set status = 'failed', last_error_class = p_class, lease_owner = null,
           lease_expires_at = null, updated_at = now()
     where t.id = any(p_ids)
       -- يُعاد الفحص على النسخة الأحدث: صفٌّ حجزه عاملٌ للتوّ لا يُغلق من تحته
       and (t.status in ('pending', 'retryable')
            or (t.status = 'processing' and t.lease_expires_at <= now()))
    returning t.passenger_id
  loop
    perform public._push_refresh_delivery(p_announcement_id, v_pid);
  end loop;
  perform public._push_finalize(p_announcement_id);
end;
$$;

-- تنبيهٌ انتهى (أو أُنهي) أثناء تسليمه: ما لم يُرسَل بعدُ لا يُرسَل، ويُغلق فيكتمل.
create function public._push_cancel_open(p_announcement_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ids bigint[];
begin
  perform public._push_lock(p_announcement_id);
  select array_agg(t.id) into v_ids
    from public.announcement_push_targets t
   where t.announcement_id = p_announcement_id
     and (t.status in ('pending', 'retryable')
          or (t.status = 'processing' and t.lease_expires_at <= now()));
  perform public._push_close_targets(p_announcement_id, v_ids, 'cancelled');
end;
$$;

-- ── الواجهة (service_role وحده) ──────────────────────────────────────

-- الاستحقاقُ وحده، للمسار التجريبيّ (test_endpoint) الذي لا يُسجَّل.
create function public.push_announcement_ineligible_reason(p_announcement_id bigint)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('role', true), 'none') not in ('service_role', 'none') then
    raise exception 'غير مسموح.' using errcode = '42501';
  end if;
  return public._push_ineligible_reason(p_announcement_id);
end;
$$;

-- التهيئة: تنبيهٌ مستحقّ ← صفٌّ لكلّ جهازٍ في جمهوره، وسجلٌّ لكلّ حاجّ. مرّةً واحدةً للتنبيه.
create function public.push_prepare_announcement(p_announcement_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a        public.announcements%rowtype;
  v_reason text;
  v_pid    bigint;
begin
  if coalesce(current_setting('role', true), 'none') not in ('service_role', 'none') then
    raise exception 'غير مسموح.' using errcode = '42501';
  end if;
  perform public._push_lock(p_announcement_id);

  v_reason := public._push_ineligible_reason(p_announcement_id);
  if v_reason is not null then
    if v_reason = 'expired' then
      perform public._push_cancel_open(p_announcement_id);
    end if;
    return jsonb_build_object('eligible', false, 'reason', v_reason);
  end if;
  select * into a from public.announcements where id = p_announcement_id;

  -- هُيّئ من قبل، أو أُرسل قبل M6 (ختمٌ أو سجلّات): لا تهيئةَ ثانية ولا إعادةَ إرسال
  if a.push_sent_at is not null
     or exists (select 1 from public.announcement_push_targets t where t.announcement_id = a.id)
     or exists (select 1 from public.notification_deliveries d
                 where d.announcement_id = a.id
                   and d.status in ('sent', 'failed', 'expired', 'disabled', 'pending')) then
    return jsonb_build_object('eligible', true, 'prepared', false);
  end if;

  insert into public.announcement_push_targets (announcement_id, passenger_id, subscription_id)
  select a.id, s.passenger_id, s.id
    from public.announcement_audience(a.target_type, a.target_ids) au
    join public.pilgrim_push_subscriptions s on s.passenger_id = au.passenger_id
  on conflict (announcement_id, subscription_id) do nothing;

  for v_pid in select au.passenger_id from public.announcement_audience(a.target_type, a.target_ids) au
  loop
    perform public._push_refresh_delivery(a.id, v_pid);
  end loop;

  perform public._push_finalize(a.id);
  return jsonb_build_object('eligible', true, 'prepared', true);
end;
$$;

-- الحجز: دفعةٌ من الأجهزة المستحقّة لهذا العامل بمهلة. عاملان متزامنان لا يتقاطعان.
create function public.push_claim_targets(p_announcement_id bigint, p_worker uuid,
                                          p_limit integer default 20, p_lease_seconds integer default 60)
returns table(target_id bigint, attempt integer, endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_reason text;
  v_ids    bigint[];
begin
  if coalesce(current_setting('role', true), 'none') not in ('service_role', 'none') then
    raise exception 'غير مسموح.' using errcode = '42501';
  end if;
  if p_worker is null or p_limit not between 1 and 100 or p_lease_seconds not between 10 and 600 then
    raise exception 'معاملات الحجز غير صالحة.' using errcode = '22023';
  end if;

  v_reason := public._push_ineligible_reason(p_announcement_id);
  if v_reason = 'expired' then
    perform public._push_cancel_open(p_announcement_id);
    return;
  elsif v_reason is not null then
    -- غيرُ مستحقٍّ الآن (موسمٌ آخر، أو أُعيدت جدولتُه): لا شيءَ يُحجز، ولا يُغلق شيء
    return;
  end if;

  -- عاملٌ سقط بعد محاولته الثالثة: لا رابعة
  select array_agg(t.id) into v_ids
    from public.announcement_push_targets t
   where t.announcement_id = p_announcement_id
     and t.status = 'processing' and t.lease_expires_at <= now() and t.attempts >= 3;
  if v_ids is not null then
    perform public._push_lock(p_announcement_id);
    perform public._push_close_targets(p_announcement_id, v_ids, 'abandoned');
  end if;

  -- جهازٌ حُذف، أو صار لحاجٍّ آخر (تسجيلُ الجهاز نفسه باسم غيره): لا يُرسل إليه تنبيهُ الأول
  select array_agg(t.id) into v_ids
    from public.announcement_push_targets t
    left join public.pilgrim_push_subscriptions s on s.id = t.subscription_id
   where t.announcement_id = p_announcement_id
     and (t.status in ('pending', 'retryable')
          or (t.status = 'processing' and t.lease_expires_at <= now()))
     and (s.id is null or s.passenger_id <> t.passenger_id);
  if v_ids is not null then
    perform public._push_lock(p_announcement_id);
    perform public._push_close_targets(p_announcement_id,
      (select array_agg(t.id) from public.announcement_push_targets t
        where t.id = any(v_ids) and t.subscription_id is null), 'gone');
    perform public._push_close_targets(p_announcement_id,
      (select array_agg(t.id) from public.announcement_push_targets t
        where t.id = any(v_ids) and t.subscription_id is not null), 'reassigned');
  end if;

  return query
  with c as (
    select t.id
      from public.announcement_push_targets t
     where t.announcement_id = p_announcement_id
       and t.attempts < 3
       and ((t.status in ('pending', 'retryable') and t.next_attempt_at <= now())
            or (t.status = 'processing' and t.lease_expires_at <= now()))
     order by t.id
     limit p_limit
     for update skip locked
  ), u as (
    update public.announcement_push_targets t
       set status = 'processing',
           attempts = t.attempts + 1,
           lease_owner = p_worker,
           lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           updated_at = now()
      from c
     where t.id = c.id
    returning t.id, t.attempts, t.subscription_id, t.passenger_id
  )
  select u.id, u.attempts::integer, s.endpoint, s.p256dh, s.auth
    from u
    join public.pilgrim_push_subscriptions s on s.id = u.subscription_id and s.passenger_id = u.passenger_id;
end;
$$;

-- النتيجة: لصاحب الحجز وفي محاولته وحدها. 'stale' = لم تُكتب (حجزٌ انتهى وأُعيد).
create function public.push_complete_target(p_target_id bigint, p_worker uuid, p_attempt integer,
                                            p_outcome text, p_http_status integer default null,
                                            p_error_class text default null)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  t        public.announcement_push_targets%rowtype;
  v_status text;
begin
  if coalesce(current_setting('role', true), 'none') not in ('service_role', 'none') then
    raise exception 'غير مسموح.' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('sent', 'retryable', 'failed', 'gone') then
    raise exception 'نتيجة غير معروفة: %', p_outcome using errcode = '22023';
  end if;

  select * into t from public.announcement_push_targets where id = p_target_id;
  if not found then return 'stale'; end if;
  perform public._push_lock(t.announcement_id);

  v_status := case p_outcome
                when 'sent'      then 'sent'
                when 'retryable' then 'retryable'
                else 'failed'
              end;

  update public.announcement_push_targets x
     set status           = case when v_status = 'retryable' and x.attempts >= 3 then 'failed' else v_status end,
         -- انتظارٌ متزايد قبل المحاولة التالية: ٥ث ثم ٢٠ث
         next_attempt_at  = case when v_status = 'retryable'
                                 then now() + make_interval(secs => 5 * power(4, x.attempts - 1))
                                 else x.next_attempt_at end,
         lease_owner      = null,
         lease_expires_at = null,
         last_http_status = p_http_status,
         last_error_class = case when p_outcome = 'gone' then 'gone'
                                 when v_status = 'sent' then null
                                 else p_error_class end,
         sent_at          = case when v_status = 'sent' then now() end,
         updated_at       = now()
   where x.id = p_target_id
     and x.status = 'processing'
     and x.lease_owner = p_worker
     and x.attempts = p_attempt
  returning * into t;
  if not found then return 'stale'; end if;

  -- 404/410: الجهاز لم يعد مشتركاً — يُحذف كما كان
  if p_outcome = 'gone' and t.subscription_id is not null then
    delete from public.pilgrim_push_subscriptions where id = t.subscription_id;
  end if;

  perform public._push_refresh_delivery(t.announcement_id, t.passenger_id);
  perform public._push_finalize(t.announcement_id);
  return t.status;
end;
$$;

-- الحال: أعدادُ الحجّاج كما يعرضها ردُّ الدالة، وما بقي مفتوحاً، وموعدُ أقرب محاولة.
create function public.push_delivery_summary(p_announcement_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
begin
  if coalesce(current_setting('role', true), 'none') not in ('service_role', 'none') then
    raise exception 'غير مسموح.' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'total',    count(*),
           'sent',     count(*) filter (where d.status = 'sent'),
           'failed',   count(*) filter (where d.status = 'failed'),
           'expired',  count(*) filter (where d.status = 'expired'),
           'disabled', count(*) filter (where d.status = 'disabled'),
           'pending',  count(*) filter (where d.status = 'pending'))
    into v
    from public.notification_deliveries d
   where d.announcement_id = p_announcement_id
     and d.status in ('sent', 'failed', 'expired', 'disabled', 'pending');

  return v || jsonb_build_object(
    'complete', exists (select 1 from public.announcements a
                         where a.id = p_announcement_id and a.push_sent_at is not null),
    -- أقربُ موعدٍ لصفٍّ ينتظر (لا ما يحجزه عاملٌ آخر)؛ NULL = لا شيء ينتظر
    -- (لا `greatest(0, …)` وحدها: تعيد 0 على NULL فيبدو «لا شيء ينتظر» محاولةً حانت)
    'next_attempt_in_ms', (select case when min(t.next_attempt_at) is null then null
                                       else greatest(0, ceil(extract(epoch from min(t.next_attempt_at) - now()) * 1000))::bigint
                                  end
                             from public.announcement_push_targets t
                            where t.announcement_id = p_announcement_id
                              and t.attempts < 3
                              and t.status in ('pending', 'retryable')));
end;
$$;

-- ── المِنَح ─────────────────────────────────────────────────────────
do $grants$
declare
  v_fn regprocedure;
begin
  foreach v_fn in array array[
      'public._push_ineligible_reason(bigint)'::regprocedure,
      'public._push_lock(bigint)'::regprocedure,
      'public._push_refresh_delivery(bigint, bigint)'::regprocedure,
      'public._push_finalize(bigint)'::regprocedure,
      'public._push_close_targets(bigint, bigint[], text)'::regprocedure,
      'public._push_cancel_open(bigint)'::regprocedure,
      'public.push_announcement_ineligible_reason(bigint)'::regprocedure,
      'public.push_prepare_announcement(bigint)'::regprocedure,
      'public.push_claim_targets(bigint, uuid, integer, integer)'::regprocedure,
      'public.push_complete_target(bigint, uuid, integer, text, integer, text)'::regprocedure,
      'public.push_delivery_summary(bigint)'::regprocedure] loop
    execute format('alter function %s owner to postgres', v_fn);
    -- والامتيازاتُ الافتراضيّة تمنح service_role كلَّ دالّةٍ جديدة: يُسحب، ويُعاد للواجهة وحدها
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end
$grants$;

grant execute on function public.push_announcement_ineligible_reason(bigint) to service_role;
grant execute on function public.push_prepare_announcement(bigint) to service_role;
grant execute on function public.push_claim_targets(bigint, uuid, integer, integer) to service_role;
grant execute on function public.push_complete_target(bigint, uuid, integer, text, integer, text) to service_role;
grant execute on function public.push_delivery_summary(bigint) to service_role;

-- ── شروطٌ لاحقة على ما تملكه هذه الترحيلة وحده (S-38) ─────────────
do $post$
declare
  v_fn regprocedure;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.announcement_push_targets'::regclass) then
    raise exception 'RLS غير مفعّل على announcement_push_targets.' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcement_push_targets') then
    raise exception 'لا سياسةَ لـannouncement_push_targets: لا يُقرأ من العميل.' using errcode = 'P0001';
  end if;
  if has_table_privilege('anon', 'public.announcement_push_targets', 'SELECT')
     or has_table_privilege('authenticated', 'public.announcement_push_targets', 'SELECT')
     or has_table_privilege('authenticated', 'public.announcement_push_targets', 'INSERT')
     or has_table_privilege('authenticated', 'public.announcement_push_targets', 'UPDATE') then
    raise exception 'announcement_push_targets ممنوحٌ لغير service_role.' using errcode = 'P0001';
  end if;

  for v_fn in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('_push_ineligible_reason', '_push_lock', '_push_refresh_delivery',
                         '_push_finalize', '_push_close_targets', '_push_cancel_open',
                         'push_announcement_ineligible_reason',
                         'push_prepare_announcement', 'push_claim_targets', 'push_complete_target',
                         'push_delivery_summary')
  loop
    if not exists (select 1 from pg_proc p where p.oid = v_fn and p.prosecdef
                    and p.proconfig @> array['search_path=public, pg_temp']) then
      raise exception '% ليست SECURITY DEFINER بـsearch_path ثابت.', v_fn using errcode = 'P0001';
    end if;
    if has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                   where p.oid = v_fn and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception '% قابلةٌ للتنفيذ من غير service_role.', v_fn using errcode = 'P0001';
    end if;
  end loop;

  -- الأدواتُ الداخليّة لا يستدعيها أحدٌ مباشرة، ولا service_role
  if has_function_privilege('service_role', 'public._push_refresh_delivery(bigint, bigint)', 'EXECUTE')
     or has_function_privilege('service_role', 'public._push_close_targets(bigint, bigint[], text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public._push_finalize(bigint)', 'EXECUTE')
     or has_function_privilege('service_role', 'public._push_cancel_open(bigint)', 'EXECUTE') then
    raise exception 'أدواتُ التسليم الداخليّة قابلةٌ للتنفيذ من service_role.' using errcode = 'P0001';
  end if;

  if not has_function_privilege('service_role', 'public.push_claim_targets(bigint, uuid, integer, integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.push_complete_target(bigint, uuid, integer, text, integer, text)', 'EXECUTE') then
    raise exception 'service_role لا ينفّذ دوالّ التسليم.' using errcode = 'P0001';
  end if;
end
$post$;
