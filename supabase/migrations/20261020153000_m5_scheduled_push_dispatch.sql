-- ═══════════════════════════════════════════════════════════════════
-- version : 20261020153000
-- name    : m5_scheduled_push_dispatch
-- ═══════════════════════════════════════════════════════════════════
--
-- M5 — دفعُ التنبيهات المجدوَلة إلى الأجهزة حين يحين موعدُها. **البنيةُ وحدها، معطَّلة.**
--
-- التنبيهُ المجدوَل يُحفظ ولا يُدفع: الواجهةُ تستدعي `send-pilgrim-push` لـ«الآن» وحده.
-- هنا ما يحتاجه مُجدوِلٌ يوقظ كلَّ دقيقة دالّةً طرفيّةً منفصلة (`push-dispatch`) تُسلّم
-- ما حان بحلقة M6 نفسها (`announcement_push_targets` — حجزٌ بمهلة، ونتيجةٌ لصاحب الحجز،
-- وثلاثُ محاولات). لا تسليمَ جديداً هنا: M6 هي الضامنةُ ألّا يُحجز جهازٌ مرّتين.
--
-- المصادقة: رمزٌ مخصّصٌ لهذه الدالّة وحدها (`push_dispatch_token` في Vault، و`PUSH_DISPATCH_TOKEN`
-- في أسرار الدالّة)، لا مفتاحُ API من Supabase. والسبب: pg_net يحفظ ترويساتِ الطلب في
-- `net.http_request_queue` إلى أن يُرسله، وpg_net 0.20.x يمنح `PUBLIC` كلَّ الصلاحيات على جداول
-- مخطّط net (`grant all on all tables in schema net to PUBLIC`). ومفتاحُ `sb_secret_…` يتجاوز RLS
-- على القاعدة كلّها، فتسرّبُه من هناك كارثيّ؛ أمّا هذا الرمز فلا يفتح إلا هذه الدالّة، وهي
-- لا تسلّم إلا بعقدٍ حيٍّ كتبه التيك، وإلا ما حان أصلاً. فالضررُ الأقصى لتسرّبه: تسليمٌ مبكّرٌ بثوانٍ.
--
-- ⚠️ لا يعمل شيءٌ بهذه الترحيلة وحدها:
--   · لا `pg_cron` ولا `pg_net` ولا جدولة — تنشيطُها ترحيلةٌ منفصلة (PR 2) بموافقةٍ منفصلة.
--   · `push_dispatch_tick()` لا يستدعيها أحد: مالكُها postgres، ومسحوبةٌ من كلّ أدوار الواجهة.
--     وبلا `net.http_post` أو بلا سرَّي Vault تردّ 'not_configured' ولا تكتب شيئاً.
--   · والدالّةُ الطرفيّة ترفض `dispatch` بلا عقدِ تشغيلٍ صالحٍ تكتبه `tick` وحدها (409).
--   · وبلا `PUSH_DISPATCH_TOKEN` في أسرار الدالّة تردّ 503 على كلّ طلب.
--
-- القفلُ عقدٌ في صفّ (`push_dispatch_state`) لا قفلٌ استشاريّ: `pg_advisory_xact_lock`
-- يُحرَّر عند انتهاء معاملة `tick`، أي **قبل** أن يُرسل pg_net طلبَه (يُرسَل بعد الالتزام
-- من عاملٍ في الخلفيّة) — فلا يحمي الاستدعاءَ اللاتزامنيّ. أمّا العقدُ فيعيش في الصفّ:
--   tick:  FOR UPDATE على الصفّ (تيكان متزامنان يمرّان واحداً بعد واحد) ← عقدٌ حيّ؟ 'busy'
--          ← لا مستحقَّ؟ 'idle' (لا طلبَ ولا كتابة) ← عقدٌ جديد run_id لـ١٨٠ث ← طلبٌ لاتزامنيّ.
--   الدالّة: begin(run_id) تقبله مرّةً واحدة ما دام حيّاً ← تسليم ≤ ~١٠٠ث ← end(run_id).
--   سقوطُ الدالّة لا يحبس المجدوِل: العقدُ ينقضي بعد ١٨٠ث وحدَه. ولو تداخل تشغيلان رغم ذلك
--   فـM6 تمنع حجزَ جهازٍ واحدٍ مرّتين؛ والعقدُ طبقةٌ ثانية لا الضامنُ الوحيد.
--
-- الحدُّ التاريخيّ (`cutoff_id`): أعلى معرّفِ تنبيهٍ لحظةَ التطبيق. ما دونه لا يُدفع آليّاً
-- أبداً، والمعرّفُ هويّةٌ مولَّدة (GENERATED ALWAYS) لا يكتبها عميل، بخلاف `created_at`.
-- والصفُّ لا يُعدَّل ولا يُحذف ولا يُفرَّغ (محفّزات)، وإعادةُ إنشائه لا تحدث (`on conflict do
-- nothing`)، فلا ترحيلةَ لاحقةً ولا إعادةَ نشرٍ تعيده إلى الصفر.
-- ولا حدَّ للتأخّر: مُجدوِلٌ تعطّل ساعاتٍ ثم عاد يدفع كلَّ تنبيهٍ ما زال سارياً في الموسم
-- المفتوح ولم يُهيَّأ بعد. والمنتهي لا يُدفع أبداً. وما دون الحدّ التاريخيّ يُرسَل يدويّاً
-- بصلاحية manage_portal من «إرسال إلى الأجهزة» في البوابة.
--
-- ⚠️ التسليمُ «مرّةً على الأقلّ» كما في M6، لا «مرّةً بالضبط». ووسمُ `ann-<id>` (topic في
-- خدمة الدفع، وtag في عامل الخدمة) يجعل المكرَّر يحلّ محلّ الأول لا أن يتكدّس.
--
-- التراجع: لا شيءَ يعمل ليُوقَف. والتنشيطُ (PR 2) يُوقَف بـ`cron.unschedule`، ثم بحذف
-- `PUSH_DISPATCH_TOKEN` من أسرار الدالّة (تردّ 503). وحذفُ هذه الكائنات ترحيلةٌ لاحقةٌ بموافقة.

-- ── حالُ المُجدوِل: صفٌّ واحد ─────────────────────────────────────────
create table public.push_dispatch_state (
  id               boolean primary key default true check (id),
  cutoff_id        bigint not null check (cutoff_id >= 0),
  cutoff_at        timestamptz not null,
  lease_run_id     uuid,
  lease_expires_at timestamptz,
  lease_started    boolean not null default false,
  last_tick_at     timestamptz,
  last_tick_result text,
  last_run_at      timestamptz,
  last_run_result  jsonb,
  created_at       timestamptz not null default now(),
  check ((lease_run_id is null) = (lease_expires_at is null)),
  check (lease_run_id is not null or not lease_started)
);

comment on table public.push_dispatch_state is
  'M5 — صفٌّ واحد: الحدُّ التاريخيّ (cutoff_id، ثابتٌ لا يُعدَّل) وعقدُ تشغيل المُجدوِل (lease_run_id بمهلة). لا مفتاحَ ولا عنوانَ هنا — هما في Vault. لا يُقرأ من الواجهة.';

insert into public.push_dispatch_state (id, cutoff_id, cutoff_at)
select true, coalesce(max(a.id), 0), now() from public.announcements a
on conflict (id) do nothing;

-- الحدُّ ثابت: لا تعديلَ له ولا حذفَ للصفّ ولا تفريغ
create function public._push_dispatch_state_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.cutoff_id is distinct from old.cutoff_id
       or new.cutoff_at is distinct from old.cutoff_at
       or new.created_at is distinct from old.created_at then
      raise exception 'الحدُّ التاريخيّ لـM5 ثابتٌ لا يُعدَّل.' using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'صفُّ حالِ M5 لا يُحذف ولا يُفرَّغ.' using errcode = '42501';
end;
$$;

create trigger trg_push_dispatch_state_guard
  before update or delete on public.push_dispatch_state
  for each row execute function public._push_dispatch_state_guard();
create trigger trg_push_dispatch_state_no_truncate
  before truncate on public.push_dispatch_state
  for each statement execute function public._push_dispatch_state_guard();

alter table public.push_dispatch_state enable row level security;
revoke all on table public.push_dispatch_state from public, anon, authenticated, service_role;

-- ── أدواتٌ داخليّة (لا تُمنح لأحد) ───────────────────────────────────

-- ما حان دفعُه الآن: الموسمُ المفتوح، وحان، ولم ينتهِ، ولم يكتمل، وفوق الحدّ التاريخيّ،
-- و(لم يُهيَّأ بعدُ — بشرط التهيئة نفسه في M6، أيّاً كان تأخّرُه) أو (له جهازٌ يُحجز الآن).
create function public._push_due_ids(p_limit integer)
returns bigint[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(array_agg(x.id order by x.show_at, x.id), '{}')
    from (
      select a.id, a.show_at
        from public.announcements a
        join public.push_dispatch_state st on st.id
       where a.season_id = public.active_season_id()
         and a.id > st.cutoff_id
         and a.show_at <= now()
         and (a.expires_at is null or a.expires_at > now())
         and a.push_sent_at is null
         and (
              (not exists (select 1 from public.announcement_push_targets t
                                where t.announcement_id = a.id)
               and not exists (select 1 from public.notification_deliveries d
                                where d.announcement_id = a.id
                                  and d.status in ('sent', 'failed', 'expired', 'disabled', 'pending')))
              or exists (select 1 from public.announcement_push_targets t
                          where t.announcement_id = a.id
                            and ((t.attempts < 3 and t.status in ('pending', 'retryable')
                                  and t.next_attempt_at <= now())
                                 -- حجزٌ انقضى: يُعاد حجزُه أو يُغلق (abandoned) فيكتمل التنبيه
                                 or (t.status = 'processing' and t.lease_expires_at <= now()))))
       order by a.show_at, a.id
       limit greatest(1, least(p_limit, 20))
    ) x;
$$;

-- ── الواجهة (service_role وحده — الدالّةُ الطرفيّة بعد مصادقة رمز push-dispatch) ──

create function public.push_due_announcements(p_limit integer default 5)
returns bigint[]
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('role', true), 'none') not in ('service_role', 'none') then
    raise exception 'غير مسموح.' using errcode = '42501';
  end if;
  return public._push_due_ids(p_limit);
end;
$$;

-- يقبل العقدَ مرّةً واحدة ما دام حيّاً. false = لا تسليم (لا عقد، أو انقضى، أو بدأ من قبل).
create function public.push_dispatch_begin(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('role', true), 'none') not in ('service_role', 'none') then
    raise exception 'غير مسموح.' using errcode = '42501';
  end if;
  if p_run_id is null then return false; end if;
  update public.push_dispatch_state
     set lease_started = true
   where id and lease_run_id = p_run_id and lease_expires_at > now() and not lease_started;
  return found;
end;
$$;

-- يُنهي عقدَه هو وحده؛ عقدُ تشغيلٍ أحدث لا يُمسّ.
create function public.push_dispatch_end(p_run_id uuid, p_result jsonb default null)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('role', true), 'none') not in ('service_role', 'none') then
    raise exception 'غير مسموح.' using errcode = '42501';
  end if;
  if p_run_id is null then return false; end if;
  update public.push_dispatch_state
     set lease_run_id = null, lease_expires_at = null, lease_started = false,
         last_run_at = now(), last_run_result = p_result
   where id and lease_run_id = p_run_id;
  return found;
end;
$$;

-- عنوانُ الدالّة ورمزُها من Vault بالاسم. NULL = غيرُ مضبوط (لا طلب).
create function public._push_dispatch_target()
returns table(url text, token text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_url text;
  v_tok text;
begin
  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return;
  end if;
  execute $q$select (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_dispatch_url'),
                    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_dispatch_token')$q$
     into v_url, v_tok;
  -- لا يُرسل الرمزُ إلى غير دالّته: https، والمسارُ بالضبط
  if v_url is null or v_url !~ '^https://[A-Za-z0-9.-]+/functions/v1/push-dispatch$' then return; end if;
  -- ٢٥٦ بتّاً فأكثر بأبجديّة base64url، ولا يكون مفتاحَ API من Supabase (sb_… أو JWT)
  if v_tok is null or v_tok !~ '^[A-Za-z0-9_-]{43,128}$' or v_tok ~ '^(sb_|eyJ)' then return; end if;
  return query select v_url, v_tok;
end;
$$;

-- تيكٌ واحد: يُستدعى من المُجدوِل وحده (PR 2). لا يرسل إلى جهاز: يوقظ الدالّة إن كان ما يُسلَّم.
create function public.push_dispatch_tick()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  st     public.push_dispatch_state%rowtype;
  v_url  text;
  v_tok  text;
  v_run  uuid;
begin
  -- تيكان متزامنان يمرّان واحداً بعد واحد، والثاني يرى عقدَ الأول
  select * into st from public.push_dispatch_state where id for update;
  if not found then return 'not_configured'; end if;
  if st.lease_run_id is not null and st.lease_expires_at > now() then
    return 'busy';
  end if;
  if cardinality(public._push_due_ids(5)) = 0 then
    return 'idle';
  end if;
  select t.url, t.token into v_url, v_tok from public._push_dispatch_target() t;
  if v_url is null then
    return 'not_configured';
  end if;

  v_run := gen_random_uuid();
  -- العقدُ أطولُ من ميزانية الدالّة (~١٠٠ث) ومن مهلة الطلب (١٥٠ث)
  update public.push_dispatch_state
     set lease_run_id = v_run, lease_expires_at = now() + interval '180 seconds', lease_started = false,
         last_tick_at = now(), last_tick_result = 'dispatched'
   where id;
  -- يُرسَل بعد الالتزام من عامل pg_net؛ الرمزُ في ترويسةٍ لا في الجسم، ومُعامِلٌ (USING) لا نصٌّ
  -- في الجملة، فلا يظهر في سجلّ جملٍ ولا في سياق خطأ
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 150000)'
    using v_url,
          jsonb_build_object('mode', 'dispatch', 'run_id', v_run),
          jsonb_build_object('Content-Type', 'application/json', 'x-push-dispatch-token', v_tok);
  return 'dispatched';
end;
$$;

-- فحصُ الطريق بلا تسليم: الدالّةُ تصادق ثم تعدّ المستحقّ وحده. لا عقدَ، فلا `dispatch` يُقبل.
create function public.push_dispatch_probe()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_url text;
  v_tok text;
begin
  select t.url, t.token into v_url, v_tok from public._push_dispatch_target() t;
  if v_url is null then
    return 'not_configured';
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    using v_url, jsonb_build_object('mode', 'probe'),
          jsonb_build_object('Content-Type', 'application/json', 'x-push-dispatch-token', v_tok);
  return 'probe_sent';
end;
$$;

-- ── المِنَح ─────────────────────────────────────────────────────────
do $grants$
declare
  v_fn regprocedure;
begin
  foreach v_fn in array array[
      'public._push_dispatch_state_guard()'::regprocedure,
      'public._push_due_ids(integer)'::regprocedure,
      'public._push_dispatch_target()'::regprocedure,
      'public.push_due_announcements(integer)'::regprocedure,
      'public.push_dispatch_begin(uuid)'::regprocedure,
      'public.push_dispatch_end(uuid, jsonb)'::regprocedure,
      'public.push_dispatch_tick()'::regprocedure,
      'public.push_dispatch_probe()'::regprocedure] loop
    execute format('alter function %s owner to postgres', v_fn);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end
$grants$;

grant execute on function public.push_due_announcements(integer) to service_role;
grant execute on function public.push_dispatch_begin(uuid) to service_role;
grant execute on function public.push_dispatch_end(uuid, jsonb) to service_role;

-- ── شروطٌ لاحقة على ما تملكه هذه الترحيلة وحده (S-38) ─────────────
do $post$
declare
  v_fn regprocedure;
begin
  if (select count(*) from public.push_dispatch_state) <> 1 then
    raise exception 'push_dispatch_state ليس صفّاً واحداً.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.push_dispatch_state where lease_run_id is not null) then
    raise exception 'push_dispatch_state يحمل عقدَ تشغيل.' using errcode = 'P0001';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.push_dispatch_state'::regclass) then
    raise exception 'RLS غير مفعّل على push_dispatch_state.' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_dispatch_state') then
    raise exception 'لا سياسةَ لـpush_dispatch_state.' using errcode = 'P0001';
  end if;
  if has_table_privilege('anon', 'public.push_dispatch_state', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege('authenticated', 'public.push_dispatch_state', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege('service_role', 'public.push_dispatch_state', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception 'push_dispatch_state ممنوحٌ لدورٍ من أدوار الواجهة.' using errcode = 'P0001';
  end if;

  for v_fn in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('_push_due_ids', '_push_dispatch_target', 'push_due_announcements',
                         'push_dispatch_begin', 'push_dispatch_end', 'push_dispatch_tick', 'push_dispatch_probe')
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

  -- التيكُ والفحصُ يوقظان الدالّة بالمفتاح: للمالك (المُجدوِل) وحده، لا service_role
  if has_function_privilege('service_role', 'public.push_dispatch_tick()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.push_dispatch_probe()', 'EXECUTE')
     or has_function_privilege('service_role', 'public._push_dispatch_target()', 'EXECUTE')
     or has_function_privilege('service_role', 'public._push_due_ids(integer)', 'EXECUTE') then
    raise exception 'التيكُ أو الفحصُ أو أدواتُهما قابلةٌ للتنفيذ من service_role.' using errcode = 'P0001';
  end if;

  -- لا مُجدوِلَ في هذه الترحيلة
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where command ilike '%push_dispatch%') then
      raise exception 'مهمّةُ جدولةٍ لـM5 موجودة — التنشيطُ ترحيلةٌ منفصلة.' using errcode = 'P0001';
    end if;
  end if;
end
$post$;
