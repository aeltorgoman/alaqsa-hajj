-- ═══════════════════════════════════════════════════════════════════
-- version : 20261110122335
-- name    : announcements_phase1
-- ═══════════════════════════════════════════════════════════════════
--
-- Phase 1 — تنبيهاتُ بوابة الحاجّ: العنوانُ والنصُّ كاملين، حالةُ كلّ تنبيهٍ للحاجّ
-- (جديد · مُحدَّث · مقروء)، التثبيت، التعديلُ مع إعادة الدفع، جمهورٌ مركّبٌ يُجمَّد عند
-- النشر، والحذفُ النهائيُّ بأثرِ تدقيقٍ لا يحمل المحتوى.
--
-- ما يُضاف (لا شيءَ يُحذف، ولا صفَّ يُمسّ لحظةَ التطبيق):
--   announcements      + pinned_at · content_revision · content_updated_at · audience (jsonb)
--                      · audience_frozen_at · updated_at · updated_by
--   announcement_recipients   الجمهورُ المجمَّد (تنبيه × حاجّ) — يُكتب مرّةً عند النشر
--   announcement_reads        إقرارُ الحاجّ بنسخةٍ من المحتوى (read_revision)
--   announcement_push_workers سياجُ عاملِ الدفع: نسخةُ المحتوى التي بدأ بها
--
-- الجمهور (`audience`، والقديمُ `target_type/target_ids` يبقى للصفوف القائمة):
--   { "all": bool, "types": ["حاج", …], "bus": [id…], "camp_mina": [id…],
--     "camp_arafa": [id…], "hotel": [id…], "flight": [id…], "pilgrim": [id…] }
--   = اتّحادُ الفئات المختارة، بلا تكرار (مفتاحٌ أساسيّ تنبيه × حاجّ).
--   `types` تحدّ «الكلّ» والفئات، وافتراضُها الحجّاجُ وحدهم (passenger_type فارغٌ أو
--   «حاج»)؛ والحاجُّ المختارُ بعينه (`pilgrim`) يُشمَل أيّاً كان نوعُه.
--   الفندق = فندقُ الغرفة المُسنَدة (rooms.hotel_id)؛ الرحلة = الذهاب أو العودة.
--   الخيام: لا كيانَ لها في المخطّط غيرُ المخيّمات نفسها (العاديّة والخاصّة)، فتُختار
--   من «مخيّم منى» و«مخيّم عرفة».
--
-- التجميد: عند حدّ النشر الفعليّ (show_at ≤ الآن) يُحسب الجمهورُ مرّةً ويُكتب في
-- announcement_recipients، ولا يتغيّر بعدها بتغيّر الإسناد. ويقع عند أوّل ما يلمس
-- التنبيهَ بعد موعده: الإدراجُ الفوريّ، أو تهيئةُ الدفع (المُجدوِل M5 كلَّ دقيقة، أو
-- الإرسالُ اليدويّ)، أو قراءةُ البوابة. والقديمُ الذي دُفع قبل هذا يُجمَّد على من
-- هُيّئ لهم دفعُه (notification_deliveries)، وإلا فبقاعدته القديمة.
--
-- التعديل (`update_announcement`): تغييرُ العنوان أو النصّ يرفع content_revision،
-- فيصير التنبيهُ «مُحدَّثاً» لجمهوره حتى يُقرّ كلٌّ بنفسه؛ وإن كان منشوراً سارياً
-- تُصفَّر جولةُ الدفع (أهدافُها وسجلُّها وختمُها) فيدفعه M5 من جديد إلى الجمهور
-- المجمَّد نفسه، والواجهةُ تطلب الإرسالَ فوراً. والمجدوَلُ قبل موعده لا يُدفع قبله.
-- والتثبيتُ والأولويةُ والانتهاءُ لا تُعيد الدفع ولا تغيّر النسخة.
-- السياج: العاملُ يُسجَّل بنسخة المحتوى عند أوّل حجزٍ له، وحجزٌ بعد تعديلٍ يُرفض
-- ('superseded')، فلا يُرسل عاملٌ قديمٌ نصّاً قديماً إلى أجهزة الجولة الجديدة.
--
-- ترتيبُ الأقفال (لا جمودَ مع M6): قفلُ التنبيه الاستشاريّ (_push_lock) ثم صفُّه —
-- كما في push_complete_target → _push_finalize. لذا يمرّ تعديلُ المحتوى والحذفُ بدالّتين
-- تأخذان القفلَ أولاً، ويُرفض تعديلُ العنوان/النصّ مباشرةً من العميل.
--
-- البوابة: `get_pilgrim_portal_by_session` تُرسل الصفحةَ الأولى (١٠) بحالاتها
-- و`announcements_meta`؛ و`get_pilgrim_announcements` للصفحات التالية؛
-- و`acknowledge_pilgrim_announcement` لإقرار تنبيهٍ واحد — لا يُقرأ الكلُّ بفتح التبويب.
-- وكلُّها للجمهور المجمَّد وحده، وفي موسم الحاجّ وحده، ولا تكشف بياناتِ التسليم.
--
-- الحذف (`delete_announcement`): نهائيٌّ، يحذف معه الأهدافَ والسجلَّ والجمهورَ
-- والإقرارات (on delete cascade)، ويترك صفّاً في audit_log بلا عنوانٍ ولا نصّ.
--
-- لا تغييرَ على أيّ دالّة طرفيّة (Edge Function): الحمولةُ ومحلّلُ اسم الشركة كما هما.
-- التوافق (M-51): الواجهةُ المنشورةُ قبل هذا تبقى تعمل — الحقولُ الجديدة إضافيّة،
-- و`mark_pilgrim_notification_read` باقيةٌ (وصارت للجمهور المجمَّد وحده).
-- التراجع: ترحيلةٌ لاحقةٌ تعيد الأجسادَ السابقة (M-44)؛ الأعمدةُ والجداولُ الجديدة لا يقرؤها غيرُها.

-- ── ١. الأعمدة ────────────────────────────────────────────────────────
alter table public.announcements
  add column pinned_at          timestamptz,
  add column content_revision   integer not null default 1,
  add column content_updated_at timestamptz,
  add column audience           jsonb,
  add column audience_frozen_at timestamptz,
  add column updated_at         timestamptz,
  add column updated_by         uuid;

alter table public.announcements
  add constraint announcements_content_revision_positive check (content_revision >= 1),
  add constraint announcements_audience_object check (audience is null or jsonb_typeof(audience) = 'object');

comment on column public.announcements.pinned_at is 'Phase 1 — مثبَّتٌ منذ (NULL = غيرُ مثبَّت). المثبَّتُ أولاً. لا يُعيد الدفع.';
comment on column public.announcements.content_revision is 'Phase 1 — نسخةُ المحتوى: تزيد بتغيّر العنوان أو النصّ وحده (المحفّز يحسبها، لا العميل).';
comment on column public.announcements.audience is 'Phase 1 — جمهورٌ مركّب (انظر ترحيلة 20261110122335). NULL = القاعدةُ القديمة target_type/target_ids.';
comment on column public.announcements.audience_frozen_at is 'Phase 1 — جُمِّد الجمهورُ في announcement_recipients عند النشر. لا يُكتب إلا من الخادم.';

create index announcements_season_show_idx on public.announcements (season_id, show_at);

-- ── ٢. الجداول ────────────────────────────────────────────────────────
create table public.announcement_recipients (
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  passenger_id    bigint not null references public.passengers(id) on delete cascade,
  primary key (announcement_id, passenger_id)
);
create index announcement_recipients_passenger_idx on public.announcement_recipients (passenger_id);
comment on table public.announcement_recipients is 'Phase 1 — الجمهورُ المجمَّد عند النشر. يكتبه _announcement_freeze وحدها.';

create table public.announcement_reads (
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  passenger_id    bigint not null references public.passengers(id) on delete cascade,
  read_revision   integer not null check (read_revision >= 1),
  read_at         timestamptz not null default now(),
  primary key (announcement_id, passenger_id)
);
create index announcement_reads_passenger_idx on public.announcement_reads (passenger_id);
comment on table public.announcement_reads is 'Phase 1 — آخرُ نسخةٍ أقرّ بها الحاجّ. read_revision < content_revision = مُحدَّث.';

create table public.announcement_push_workers (
  worker          uuid   not null,
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  revision        integer not null,
  created_at      timestamptz not null default now(),
  primary key (worker, announcement_id)
);
comment on table public.announcement_push_workers is 'Phase 1 — سياجُ الدفع: نسخةُ المحتوى التي بدأ بها العامل. لـpush_claim_targets وحدها.';

create trigger trg_reject_closed_season
  before insert or delete or update on public.announcement_recipients
  for each row execute function public.reject_write_closed_season_derived();
create trigger trg_reject_closed_season
  before insert or delete or update on public.announcement_reads
  for each row execute function public.reject_write_closed_season_derived();

alter table public.announcement_recipients enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.announcement_push_workers enable row level security;
-- الامتيازاتُ الافتراضيّة تمنح authenticated وservice_role كلَّ جدولٍ جديد: تُسحب
revoke all on table public.announcement_recipients, public.announcement_reads, public.announcement_push_workers
  from public, anon, authenticated, service_role;
grant select on table public.announcement_recipients, public.announcement_reads to authenticated;
create policy announcement_recipients_select on public.announcement_recipients
  for select to authenticated using (public.has_permission('manage_portal'));
create policy announcement_reads_select on public.announcement_reads
  for select to authenticated using (public.has_permission('manage_portal'));

-- ── ٣. الجمهور: التحقّقُ والحلّ ─────────────────────────────────────────
-- NULL = صالح؛ وإلا رسالةُ الخطأ.
create function public._announcement_audience_check(p_season bigint, p_audience jsonb)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_key   text;
  v_val   jsonb;
  v_ids   bigint[];
  v_found integer;
  v_any   boolean := false;
  v_types text[];
begin
  if p_audience is null or jsonb_typeof(p_audience) <> 'object' then
    return 'الجمهور غير صالح.';
  end if;
  for v_key, v_val in select * from jsonb_each(p_audience) loop
    if v_key = 'all' then
      if jsonb_typeof(v_val) <> 'boolean' then return '«all» يجب أن تكون صحّ أو خطأ.'; end if;
      v_any := v_any or (v_val = 'true'::jsonb);
    elsif v_key = 'types' then
      if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) = 0 then
        return 'فئاتُ الركّاب يجب أن تكون قائمةً غيرَ فارغة.';
      end if;
      if exists (select 1 from jsonb_array_elements(v_val) e
                  where jsonb_typeof(e) <> 'string' or e #>> '{}' not in ('حاج', 'مرافق', 'مشرف', 'إداري')) then
        return 'فئةُ ركّابٍ غيرُ معروفة.';
      end if;
    elsif v_key in ('bus', 'camp_mina', 'camp_arafa', 'hotel', 'flight', 'pilgrim') then
      if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) > 5000 then
        return format('«%s» يجب أن تكون قائمةً (٥٠٠٠ حدّاً).', v_key);
      end if;
      if exists (select 1 from jsonb_array_elements(v_val) e
                  where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[1-9][0-9]{0,17}$') then
        return format('«%s» تحمل معرّفاً غيرَ صالح.', v_key);
      end if;
      select coalesce(array_agg(distinct (e #>> '{}')::bigint), '{}') into v_ids from jsonb_array_elements(v_val) e;
      if cardinality(v_ids) = 0 then continue; end if;
      v_any := true;
      v_found := case v_key
        when 'bus'        then (select count(*) from public.buses   x where x.id = any(v_ids) and x.season_id = p_season)
        when 'camp_mina'  then (select count(*) from public.camps   x where x.id = any(v_ids) and x.season_id = p_season and x.page_type = 'منى')
        when 'camp_arafa' then (select count(*) from public.camps   x where x.id = any(v_ids) and x.season_id = p_season and x.page_type = 'عرفة')
        when 'hotel'      then (select count(*) from public.hotels  x where x.id = any(v_ids) and x.season_id = p_season)
        when 'flight'     then (select count(*) from public.flights x where x.id = any(v_ids) and x.season_id = p_season)
        when 'pilgrim'    then (select count(*) from public.passengers x where x.id = any(v_ids) and x.season_id = p_season)
      end;
      if v_found <> cardinality(v_ids) then
        return format('«%s» تشير إلى ما ليس في موسم التنبيه.', v_key);
      end if;
    else
      return format('مفتاحُ جمهورٍ غيرُ معروف: %s', v_key);
    end if;
  end loop;
  if not v_any then return 'اختر جمهوراً: جميع الحجاج أو فئةً واحدةً على الأقل.'; end if;
  return null;
end;
$$;

-- الحجّاجُ المطابقون لجمهورٍ مركّب في موسم.
create function public._announcement_audience_members(p_season bigint, p_audience jsonb)
returns table(passenger_id bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with s as (
    select coalesce((p_audience ->> 'all')::boolean, false) as all_,
           coalesce((select array_agg(e) from jsonb_array_elements_text(p_audience -> 'types') e), array['حاج']) as types,
           coalesce((select array_agg(e::bigint) from jsonb_array_elements_text(p_audience -> 'bus') e), '{}') as bus,
           coalesce((select array_agg(e::bigint) from jsonb_array_elements_text(p_audience -> 'camp_mina') e), '{}') as camp_mina,
           coalesce((select array_agg(e::bigint) from jsonb_array_elements_text(p_audience -> 'camp_arafa') e), '{}') as camp_arafa,
           coalesce((select array_agg(e::bigint) from jsonb_array_elements_text(p_audience -> 'hotel') e), '{}') as hotel,
           coalesce((select array_agg(e::bigint) from jsonb_array_elements_text(p_audience -> 'flight') e), '{}') as flight,
           coalesce((select array_agg(e::bigint) from jsonb_array_elements_text(p_audience -> 'pilgrim') e), '{}') as pilgrim
  )
  select distinct p.id
    from s, public.passengers p
    left join public.rooms r on r.id = p.room_id
   where p.season_id = p_season
     and (p.id = any(s.pilgrim)
          or (coalesce(nullif(btrim(p.passenger_type), ''), 'حاج') = any(s.types)
              and (s.all_
                   or p.bus_id = any(s.bus)
                   or p.camp_mina_id = any(s.camp_mina)
                   or p.camp_arafa_id = any(s.camp_arafa)
                   or r.hotel_id = any(s.hotel)
                   or p.flight_id = any(s.flight)
                   or p.return_flight_id = any(s.flight))));
$$;

-- جمهورُ تنبيهٍ بعينه كما يُجمَّد: المركّب، أو القديمُ (من هُيّئ لهم دفعُه، وإلا قاعدتُه).
create function public._announcement_resolve(p_announcement_id bigint)
returns table(passenger_id bigint)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a public.announcements%rowtype;
begin
  select * into a from public.announcements x where x.id = p_announcement_id;
  if not found then return; end if;
  if a.audience is not null then
    return query select m.passenger_id from public._announcement_audience_members(a.season_id, a.audience) m;
    return;
  end if;
  if exists (select 1 from public.notification_deliveries d
              where d.announcement_id = a.id and d.status in ('sent', 'failed', 'expired', 'disabled', 'pending')) then
    return query
      select distinct d.passenger_id
        from public.notification_deliveries d
        join public.passengers p on p.id = d.passenger_id and p.season_id = a.season_id
       where d.announcement_id = a.id and d.status in ('sent', 'failed', 'expired', 'disabled', 'pending');
    return;
  end if;
  if coalesce(a.target_type, 'all') not in ('all', 'bus', 'camp_mina', 'camp_arafa', 'custom') then
    raise log 'announcement %: unknown target_type % — no recipients (fail-closed)', a.id, a.target_type;
    return;
  end if;
  return query
    select p.id from public.passengers p
     where p.season_id = a.season_id
       and case coalesce(a.target_type, 'all')
             when 'all'        then true
             when 'bus'        then p.bus_id        = any(a.target_ids)
             when 'camp_mina'  then p.camp_mina_id  = any(a.target_ids)
             when 'camp_arafa' then p.camp_arafa_id = any(a.target_ids)
             when 'custom'     then p.id            = any(a.target_ids)
           end is true;
end;
$$;

-- التجميد: مرّةً واحدة، عند النشر، في الموسم المفتوح. الأوّلُ يكتب، والمتزامنُ ينتظر قفلَ
-- الصفّ ثم يجده مجمَّداً. true = جمّدته هذه المعاملة.
create function public._announcement_freeze(p_announcement_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id bigint;
begin
  update public.announcements x
     set audience_frozen_at = now()
   where x.id = p_announcement_id
     and x.audience_frozen_at is null
     and x.show_at <= now()
     and x.season_id = public.active_season_id()
  returning x.id into v_id;
  if v_id is null then return false; end if;
  insert into public.announcement_recipients (announcement_id, passenger_id)
  select v_id, r.passenger_id from public._announcement_resolve(v_id) r
  on conflict do nothing;
  return true;
end;
$$;

-- جولةُ دفعٍ جديدة بعد تعديل المحتوى: تحت _push_lock، يُمحى ما للجولة السابقة فيستحقّه
-- M5 والإرسالُ اليدويّ من جديد. العاملُ القديم يُرفض حجزُه بالسياج.
create function public._announcement_reset_push(p_announcement_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public._push_lock(p_announcement_id);
  delete from public.announcement_push_targets t where t.announcement_id = p_announcement_id;
  delete from public.notification_deliveries d where d.announcement_id = p_announcement_id;
  update public.announcements x set push_sent_at = null
   where x.id = p_announcement_id and x.push_sent_at is not null;
end;
$$;

-- ── ٤. المحفّزات ──────────────────────────────────────────────────────
-- بحقوق المستدعي عمداً: current_user هنا «authenticated» لطلب العميل المباشر، و«postgres»
-- داخل دوالّ الخادم (SECURITY DEFINER) — فيُعرف من يكتب ما لا يكتبه إلا الخادم.
create function public._announcements_before_write()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_err    text;
  v_client boolean := current_user in ('authenticated', 'anon', 'service_role');
begin
  if tg_op = 'INSERT' then
    new.content_revision   := 1;
    new.content_updated_at := null;
    new.audience_frozen_at := null;
    new.updated_at         := null;
    new.updated_by         := null;
  else
    if new.title is distinct from old.title or new.body is distinct from old.body then
      if v_client then
        raise exception 'يُعدَّل عنوانُ التنبيه ونصُّه من «تعديل التنبيه» وحده.' using errcode = '42501';
      end if;
      new.content_revision   := old.content_revision + 1;
      new.content_updated_at := now();
    else
      new.content_revision   := old.content_revision;
      new.content_updated_at := old.content_updated_at;
    end if;
    if new.audience_frozen_at is distinct from old.audience_frozen_at and v_client then
      raise exception 'تجميدُ الجمهور من الخادم وحده.' using errcode = '42501';
    end if;
    -- نُشر: جمهورُه وموعدُه وموسمُه ثابتة
    if (old.audience_frozen_at is not null or old.show_at <= now())
       and (new.audience is distinct from old.audience
            or new.target_type is distinct from old.target_type
            or new.target_ids is distinct from old.target_ids
            or new.show_at is distinct from old.show_at
            or new.season_id is distinct from old.season_id) then
      raise exception 'نُشر هذا التنبيه: لا يتغيّر جمهورُه ولا موعدُ ظهوره.' using errcode = '22023';
    end if;
    -- آخرُ تعديلٍ إداريّ: لا يحرّكه التجميدُ ولا ختمُ الدفع (أعمدةُ الخادم)
    if row(new.title, new.body, new.priority, new.expires_at, new.pinned_at, new.audience, new.show_at)
       is distinct from row(old.title, old.body, old.priority, old.expires_at, old.pinned_at, old.audience, old.show_at) then
      new.updated_at := now();
      new.updated_by := coalesce(auth.uid(), old.updated_by);
    else
      new.updated_at := old.updated_at;
      new.updated_by := old.updated_by;
    end if;
  end if;

  if tg_op = 'INSERT' or new.audience is distinct from old.audience then
    if new.audience is not null then
      v_err := public._announcement_audience_check(new.season_id, new.audience);
      if v_err is not null then raise exception '%', v_err using errcode = '22023'; end if;
      -- القديمُ يقرأ target_type: «audience» لا يعرفه، فيُغلق (fail-closed) لا يتّسع
      new.target_type := 'audience';
      new.target_ids  := '{}';
    elsif new.target_type = 'audience' then
      raise exception 'target_type «audience» بلا جمهور.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_announcements_before_write
  before insert or update on public.announcements
  for each row execute function public._announcements_before_write();

-- النشرُ الفوريّ (أو تقديمُ موعدٍ مجدوَلٍ إلى الآن) يجمّد الجمهورَ لحظتَه.
create function public._announcements_after_write()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.audience_frozen_at is null and new.show_at <= now() then
    perform public._announcement_freeze(new.id);
  end if;
  return null;
end;
$$;

create trigger trg_announcements_after_write
  after insert or update of show_at on public.announcements
  for each row execute function public._announcements_after_write();

-- أثرُ الحذف: من حذف، ومتى، وأيُّ تنبيه — بلا عنوانٍ ولا نصٍّ ولا جمهورٍ ولا سجلّ تسليم.
-- حذفُ الموسم (delete_season) يحمل راية الإيقاف فلا يُسجَّل هنا صفٌّ لكلّ تنبيه.
create function public._announcements_audit_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor uuid := auth.uid();
  v_name  text;
begin
  if exists (select 1 from public.audit_suppression s where s.txid = txid_current()) then
    return null;
  end if;
  if v_actor is not null then
    select up.name into v_name from public.user_profiles up where up.id = v_actor;
  end if;
  insert into public.audit_log (actor_id, actor_username, actor_source, table_name, row_id, action,
                                season_id, old_value, new_value)
  values (v_actor, v_name, case when v_actor is not null then 'session' else 'system' end,
          'announcements', old.id::text, 'delete', old.season_id,
          jsonb_build_object('priority', old.priority, 'show_at', old.show_at, 'expires_at', old.expires_at,
                             'pinned', old.pinned_at is not null, 'content_revision', old.content_revision,
                             'audience_kind', case when old.audience is null then old.target_type else 'audience' end,
                             'push_sent', old.push_sent_at is not null),
          null);
  return null;
end;
$$;

create trigger trg_announcements_audit_delete
  after delete on public.announcements
  for each row execute function public._announcements_audit_delete();

-- ── ٥. الإدارة ────────────────────────────────────────────────────────
-- الحارسُ نفسُه في announcement_audience (L1): manage_portal نشط، أو service_role،
-- أو اتّصالٌ مباشر (المالكُ والترحيلات).
create function public._announcement_admin_guard()
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('service_role', 'none') then return; end if;
  if not public.has_permission('manage_portal') then
    raise exception 'لا تملك صلاحية إدارة بوابة الحاج.' using errcode = '42501';
  end if;
end;
$$;

-- معاينةُ جمهورٍ مركّب في الموسم النشط (عددُ المستهدفين قبل الإرسال).
create function public.announcement_audience_preview(p_audience jsonb)
returns table(passenger_id bigint)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_season bigint := public.active_season_id();
  v_err    text;
begin
  perform public._announcement_admin_guard();
  v_err := public._announcement_audience_check(v_season, p_audience);
  if v_err is not null then raise exception '%', v_err using errcode = '22023'; end if;
  return query select m.passenger_id from public._announcement_audience_members(v_season, p_audience) m;
end;
$$;

-- تعديلُ تنبيه: العنوانُ والنصُّ والأولويةُ والانتهاء — في معاملةٍ واحدة، بالقفل الاستشاريّ أولاً.
-- push: 'requested' (تغيّر محتوى تنبيهٍ منشورٍ سارٍ: صُفّرت جولةُ الدفع) · 'scheduled'
-- (مجدوَلٌ: يُدفع عند موعده) · 'expired' · 'none' (لم يتغيّر المحتوى).
create function public.update_announcement(p_id bigint, p_title text, p_body text,
                                           p_priority text, p_expires_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a        public.announcements%rowtype;
  v_old    integer;
  v_title  text := nullif(btrim(coalesce(p_title, '')), '');
  v_body   text := btrim(coalesce(p_body, ''));
  v_push   text;
begin
  perform public._announcement_admin_guard();
  if v_body = '' then raise exception 'نصُّ التنبيه مطلوب.' using errcode = '22023'; end if;
  if p_priority is null or p_priority not in ('عاجل', 'مهم', 'عام') then
    raise exception 'أولويةٌ غيرُ معروفة.' using errcode = '22023';
  end if;
  perform public._push_lock(p_id);
  select * into a from public.announcements x where x.id = p_id for update;
  if not found then raise exception 'التنبيه غير موجود.' using errcode = 'P0002'; end if;
  if a.season_id is distinct from public.active_season_id() then
    raise exception 'التنبيه لا يتبع الموسم المفتوح.' using errcode = 'P0001';
  end if;
  if p_expires_at is not null and p_expires_at <= a.show_at then
    raise exception 'وقت الانتهاء يجب أن يكون بعد وقت الظهور.' using errcode = '22023';
  end if;
  v_old := a.content_revision;

  update public.announcements x
     set title = v_title, body = v_body, priority = p_priority, expires_at = p_expires_at
   where x.id = p_id
  returning * into a;

  if a.content_revision = v_old then
    v_push := 'none';
  elsif a.show_at > now() then
    v_push := 'scheduled';
  elsif a.expires_at is not null and a.expires_at <= now() then
    v_push := 'expired';
  else
    perform public._announcement_freeze(a.id);   -- قديمٌ منشورٌ لم يُجمَّد بعد
    perform public._announcement_reset_push(a.id);
    v_push := 'requested';
  end if;
  return jsonb_build_object('id', a.id, 'revision', a.content_revision,
                            'content_changed', a.content_revision <> v_old, 'push', v_push);
end;
$$;

-- الحذفُ النهائيّ، بالقفل الاستشاريّ أولاً (لا جمودَ مع عاملِ دفعٍ يختم التنبيه).
create function public.delete_announcement(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public._announcement_admin_guard();
  perform public._push_lock(p_id);
  delete from public.announcements x where x.id = p_id;
  return found;
end;
$$;

-- ── ٦. الدفع: الجمهورُ المجمَّد، وسياجُ العامل ───────────────────────────
create or replace function public.push_prepare_announcement(p_announcement_id bigint)
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
  -- Phase 1 — حدُّ النشر: الجمهورُ يُجمَّد هنا إن لم يُجمَّد بعد
  perform public._announcement_freeze(p_announcement_id);
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
    from public.announcement_recipients au
    join public.pilgrim_push_subscriptions s on s.passenger_id = au.passenger_id
   where au.announcement_id = a.id
  on conflict (announcement_id, subscription_id) do nothing;

  for v_pid in select au.passenger_id from public.announcement_recipients au where au.announcement_id = a.id
  loop
    perform public._push_refresh_delivery(a.id, v_pid);
  end loop;

  perform public._push_finalize(a.id);
  return jsonb_build_object('eligible', true, 'prepared', true);
end;
$$;

create or replace function public.push_claim_targets(p_announcement_id bigint, p_worker uuid,
                                                     p_limit integer default 20, p_lease_seconds integer default 60)
returns table(target_id bigint, attempt integer, endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_reason text;
  v_ids    bigint[];
  v_rev    integer;
  v_mine   integer;
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

  -- Phase 1 — السياج: العاملُ يبني حمولتَه مرّةً من المحتوى ثم يحجز مراراً. نسخةُ المحتوى
  -- تُسجَّل عند أوّل حجزٍ له؛ وتعديلٌ بعدها يجعل حمولتَه قديمةً فيُرفض حجزُه.
  select a.content_revision into v_rev from public.announcements a where a.id = p_announcement_id;
  insert into public.announcement_push_workers (worker, announcement_id, revision)
  values (p_worker, p_announcement_id, v_rev)
  on conflict (worker, announcement_id) do nothing;
  select w.revision into v_mine from public.announcement_push_workers w
   where w.worker = p_worker and w.announcement_id = p_announcement_id;
  if v_mine is distinct from v_rev then
    raise exception 'superseded: announcement % content changed (revision % -> %)', p_announcement_id, v_mine, v_rev
      using errcode = 'P0001';
  end if;
  delete from public.announcement_push_workers w where w.created_at < now() - interval '1 day';

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

-- ── ٧. البوابة ────────────────────────────────────────────────────────
-- صفحةُ تنبيهاتِ حاجٍّ من جمهوره المجمَّد، بحالاتها. ما لم يُجمَّد بعد ممّا حان موعدُه
-- يُجمَّد أولاً، فلا يرى الحاجُّ تنبيهاً قبل أن يُثبَّت جمهورُه.
create function public._pilgrim_announcements(p_pid bigint, p_season bigint, p_offset integer, p_limit integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id bigint;
  v    json;
begin
  if p_season is distinct from public.active_season_id() then
    return json_build_object('items', '[]'::json, 'total', 0, 'unread', 0, 'has_more', false);
  end if;
  for v_id in
    select a.id from public.announcements a
     where a.season_id = p_season and a.audience_frozen_at is null
       and a.show_at <= now() and (a.expires_at is null or a.expires_at > now())
     order by a.id limit 200
  loop
    perform public._announcement_freeze(v_id);
  end loop;

  with st as (
    select a.id, a.title, a.body, a.priority, a.show_at, a.pinned_at, a.content_revision,
           case when a.content_updated_at > a.show_at then a.content_updated_at end as edited_at,
           case
             when coalesce(rd.read_revision, case when d.read_at is not null then 1 end, 0) >= a.content_revision then 'read'
             when a.content_updated_at > a.show_at then 'updated'
             else 'new'
           end as state
      from public.announcements a
      join public.announcement_recipients m on m.announcement_id = a.id and m.passenger_id = p_pid
      left join public.announcement_reads rd on rd.announcement_id = a.id and rd.passenger_id = p_pid
      left join public.notification_deliveries d on d.announcement_id = a.id and d.passenger_id = p_pid
     where a.season_id = p_season
       and a.show_at <= now() and (a.expires_at is null or a.expires_at > now())
  ), pg as (
    select * from st
     order by (pinned_at is not null) desc, pinned_at desc nulls last, (priority = 'عاجل') desc, show_at desc, id desc
     offset greatest(p_offset, 0) limit greatest(p_limit, 0)
  )
  select json_build_object(
    'items', coalesce((select json_agg(json_build_object(
                 'id', pg.id, 'title', pg.title, 'body', pg.body, 'priority', pg.priority, 'show_at', pg.show_at,
                 'pinned', pg.pinned_at is not null, 'revision', pg.content_revision,
                 'state', pg.state, 'edited_at', pg.edited_at)
               order by (pg.pinned_at is not null) desc, pg.pinned_at desc nulls last, (pg.priority = 'عاجل') desc,
                        pg.show_at desc, pg.id desc) from pg), '[]'::json),
    'total', (select count(*) from st),
    'unread', (select count(*) from st where st.state <> 'read'),
    'has_more', (select count(*) from st) > greatest(p_offset, 0) + greatest(p_limit, 0))
  into v;
  return v;
end;
$$;

-- الصفحاتُ التالية (١٠ لكلّ صفحة) — بالجلسة وحدها، كالبوابة.
create function public.get_pilgrim_announcements(p_token text, p_offset integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pid    bigint;
  v_season bigint;
begin
  if p_offset is null or p_offset < 0 or p_offset > 5000 then
    raise exception 'صفحةٌ غيرُ صالحة.' using errcode = '22023';
  end if;
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then return null; end if;
  select p.season_id into v_season from public.passengers p where p.id = v_pid;
  if not found then return null; end if;
  return public._pilgrim_announcements(v_pid, v_season, p_offset, 10);
end;
$$;

-- إقرارُ الحاجّ بتنبيهٍ واحدٍ من جمهوره (بالنسخة التي رآها). NULL = ليس له/لا جلسة.
create function public.acknowledge_pilgrim_announcement(p_token text, p_announcement_id bigint, p_revision integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pid bigint;
  a     public.announcements%rowtype;
  v_rev integer;
  v_now integer;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then return null; end if;
  select x.* into a
    from public.announcements x
    join public.announcement_recipients m on m.announcement_id = x.id and m.passenger_id = v_pid
    join public.passengers p on p.id = v_pid and p.season_id = x.season_id
   where x.id = p_announcement_id
     and x.show_at <= now() and (x.expires_at is null or x.expires_at > now());
  if not found then return null; end if;

  v_rev := least(greatest(coalesce(p_revision, a.content_revision), 1), a.content_revision);
  insert into public.announcement_reads as r (announcement_id, passenger_id, read_revision, read_at)
  values (a.id, v_pid, v_rev, now())
  on conflict (announcement_id, passenger_id) do update
    set read_revision = greatest(r.read_revision, excluded.read_revision),
        read_at = case when excluded.read_revision > r.read_revision then now() else r.read_at end
  returning r.read_revision into v_now;

  -- «قُرئت» في تقرير الوصول: للنسخة الحاليّة وحدها
  if v_now >= a.content_revision then
    insert into public.notification_deliveries (announcement_id, passenger_id, status, read_at)
    values (a.id, v_pid, 'read', now())
    on conflict (announcement_id, passenger_id) do update
      set read_at = coalesce(notification_deliveries.read_at, now());
  end if;
  return json_build_object('id', a.id, 'revision', a.content_revision,
                           'state', case when v_now >= a.content_revision then 'read'
                                         when a.content_updated_at > a.show_at then 'updated' else 'new' end);
end;
$$;

-- الواجهةُ القديمة (قبل Phase 1) تناديها عند فتح التبويب: باقيةٌ، وصارت للجمهور المجمَّد وحده.
create or replace function public.mark_pilgrim_notification_read(p_token text, p_announcement_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  return public.acknowledge_pilgrim_announcement(p_token, p_announcement_id, null) is not null;
end;
$$;

-- البوابة: من آخر جسدٍ لها (20261018191352) حرفاً، ولا يتغيّر فيه إلا مصدرُ «announcements»
-- (الجمهورُ المجمَّد والصفحة والحالات) وسقوطُ سجلّ الأنواع المجهولة الذي انتقل إلى التجميد.
create or replace function public.get_pilgrim_portal_by_session(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pid      bigint;
  v_p        public.passengers%ROWTYPE;
  v_result   json;
  v_ah       public.hotels%ROWTYPE;   -- فندقُ الغرفة المُسنَدة
  v_has_ah   boolean := false;
  v_rh_name  text;                    -- اسمُ الفندق المطلوب
  v_sh       public.hotels%ROWTYPE;   -- فندقُ الموسم إن كان وحيداً
  v_sh_n     integer;
  v_leg_name text;
  v_leg_addr text;
  v_leg_url  text;
  v_status   text;
  v_ann      json;                    -- Phase 1 — الصفحةُ الأولى من التنبيهات وحالاتُها
  v_settings jsonb;                   -- M1 — إعداداتُ البوابة كما تُفهَم (بافتراضاتها)
  v_docs_ok  boolean;
  v_photo_ok boolean;
  v_mates_ok boolean;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then
    return null;
  end if;

  select * into v_p from public.passengers where id = v_pid;
  if not found then
    return null;
  end if;

  /* M1 — ما أخفته الإدارةُ لا يُرسَل أصلاً: المستنداتُ وصورةُ الحاجّ
     وأسماءُ رفقاء الغرفة تُحسم هنا لا في الواجهة. والمستندُ نفسُه
     يُحرَس في `pilgrim-doc` بـ`pilgrim_doc_allowed` على القاعدة ذاتها. */
  select public._portal_settings_effective(c.portal_settings) into v_settings
    from public.company_config c order by c.id limit 1;
  v_settings := coalesce(v_settings, public._portal_settings_effective(null));
  v_docs_ok  := (v_settings ->> 'documents')::boolean;
  v_mates_ok := (v_settings ->> 'roommates')::boolean;
  v_photo_ok := public._portal_photo_visible(v_settings, v_p.gender);

  if v_p.room_id is not null then
    select ah.* into v_ah
      from public.rooms rm join public.hotels ah on ah.id = rm.hotel_id
     where rm.id = v_p.room_id;
    v_has_ah := found;
  end if;

  select rh.name into v_rh_name from public.hotels rh where rh.id = v_p.requested_hotel_id;

  select count(*) into v_sh_n from public.hotels sh where sh.season_id = v_p.season_id;
  if v_sh_n = 1 then
    select sh.* into v_sh from public.hotels sh where sh.season_id = v_p.season_id;
  end if;

  -- غرفةٌ بلا فندقٍ مربوط (غرفةٌ قديمةٌ في موسمٍ صار متعدّدَ الفنادق قبل
  -- التشديد) حالةٌ صريحةٌ لا «مُسنَد» بفندقٍ فارغ (مراجعة #217).
  v_status := case when v_p.room_id is not null and v_has_ah then 'assigned'
                   when v_p.room_id is not null then 'assigned_unlinked'
                   when v_rh_name is not null then 'requested'
                   else 'none' end;

  if v_has_ah then
    v_leg_name := v_ah.name; v_leg_addr := v_ah.address; v_leg_url := v_ah.map_url;
  elsif v_sh_n = 1 then
    v_leg_name := v_sh.name; v_leg_addr := v_sh.address; v_leg_url := v_sh.map_url;
  elsif v_sh_n = 0 then
    select s.hotel_name, s.hotel_address, s.hotel_url into v_leg_name, v_leg_addr, v_leg_url
      from public.seasons s where s.id = v_p.season_id;
  end if;

  /* Phase 1 — التنبيهاتُ من الجمهور المجمَّد وحده (يُجمَّد هنا ما حان ولم يُجمَّد)،
     بحالة كلٍّ للحاجّ (new · updated · read)، المثبَّتُ أولاً ثم العاجلُ ثم الأحدث.
     الصفحةُ الأولى هنا، والتاليةُ من get_pilgrim_announcements. والنوعُ القديمُ المجهول
     لا جمهورَ له (fail-closed) ويُسجَّل RAISE LOG عند التجميد. */
  v_ann := public._pilgrim_announcements(v_p.id, v_p.season_id, 0, 10);

  select json_build_object(
    'pilgrim', json_build_object(
      'name_ar', v_p.name_ar, 'short_ar', v_p.short_ar, 'name_en', v_p.name_en,
      'gender', v_p.gender,
      'has_photo',         v_photo_ok and (nullif(trim(coalesce(v_p.photo_url,'')), '')         is not null),
      'has_hajj_permit',   v_docs_ok  and (nullif(trim(coalesce(v_p.hajj_permit_url,'')), '')   is not null),
      'has_flight_ticket', v_docs_ok  and (nullif(trim(coalesce(v_p.flight_ticket_url,'')), '') is not null),
      'hotel_type', v_p.hotel_type, 'hotel_view', v_p.hotel_view,
      'camp_mina', v_p.camp_mina, 'camp_arafa', v_p.camp_arafa,
      'camp_mina_name', (select c.name from public.camps c where c.id = v_p.camp_mina_id),
      'camp_arafa_name', (select c.name from public.camps c where c.id = v_p.camp_arafa_id),
      'phone', v_p.phone
    ),
    'bus', (select json_build_object('name', b.name, 'type', b.type) from public.buses b where b.id = v_p.bus_id),
    'room', (select json_build_object('number', r.number, 'floor', r.floor, 'type', r.type) from public.rooms r where r.id = v_p.room_id),

    /* MOD-001 — السكنُ بحالته: المطلوبُ لا يُعرض سكناً مؤكَّداً. */
    'accommodation', json_build_object(
      'status', v_status,
      'hotel', case when v_has_ah then json_build_object(
                 'name', v_ah.name, 'address', v_ah.address, 'map_url', v_ah.map_url, 'city', v_ah.city) end,
      'room', (select json_build_object('number', r.number, 'floor', r.floor, 'type', r.type)
                 from public.rooms r where r.id = v_p.room_id),
      'requested_hotel', case when v_status in ('requested', 'assigned_unlinked') and v_rh_name is not null
                              then json_build_object('name', v_rh_name) end
    ),

    /* M1 — أسماءُ رفقاء الغرفة المخفيّةُ لا تخرج من الخادم. والأسرةُ
       ومخيّما منى وعرفة خارجَ هذا الإعداد. */
    'roommates', case
      when v_p.room_id is not null and v_mates_ok then
        (select coalesce(json_agg(json_build_object(
          'name', pp.name_ar, 'short_ar', pp.short_ar,
          'room_number', r2.number, 'room_floor', r2.floor,
          'hotel_name', h2.name,
          'bus_name', b2.name,
          'is_family', (pp.family_id is not null and pp.family_id = v_p.family_id)
        )), '[]'::json)
         from public.passengers pp
         left join public.rooms r2 on r2.id = pp.room_id
         left join public.hotels h2 on h2.id = r2.hotel_id
         left join public.buses b2 on b2.id = pp.bus_id
         where pp.room_id = v_p.room_id and pp.id <> v_p.id)
      else '[]'::json end,
    'family', case
      when v_p.family_id is not null then
        (select coalesce(json_agg(json_build_object(
          'name', pp.name_ar, 'short_ar', pp.short_ar,
          'gender', pp.gender,
          'room_number', r2.number, 'room_floor', r2.floor,
          'hotel_name', h2.name,
          'bus_name', b2.name,
          'camp_mina_name', (select c.name from public.camps c where c.id = pp.camp_mina_id),
          'camp_arafa_name', (select c.name from public.camps c where c.id = pp.camp_arafa_id)
        )), '[]'::json)
         from public.passengers pp
         left join public.rooms r2 on r2.id = pp.room_id
         left join public.hotels h2 on h2.id = r2.hotel_id
         left join public.buses b2 on b2.id = pp.bus_id
         where pp.family_id = v_p.family_id and pp.id <> v_p.id)
      else '[]'::json end,
    'flight_go', (select json_build_object('name', f.name, 'airline', f.airline, 'from_airport', f.from_airport, 'to_airport', f.to_airport, 'date', f.date, 'time', f.time, 'arrival_time', f.arrival_time, 'arrival_date', f.arrival_date, 'class', v_p.flight_class) from public.flights f where f.id = v_p.flight_id),
    'flight_back', (select json_build_object('name', f.name, 'airline', f.airline, 'from_airport', f.from_airport, 'to_airport', f.to_airport, 'date', f.date, 'time', f.time, 'arrival_time', f.arrival_time, 'arrival_date', f.arrival_date, 'class', v_p.flight_class) from public.flights f where f.id = v_p.return_flight_id),

    /* موسمُ الحاجّ — اسمُه وأماكنُه. و`hotel_*` للبوابة الحاليّة بقاعدة
       التوافق أعلاه. لا `company_config` ولا «الموسم النشط». */
    'season', (select json_build_object(
        'name',          s.name,
        'hijri_year',    s.hijri_year,
        'hotel_name',    v_leg_name,
        'hotel_address', v_leg_addr,
        'hotel_url',     v_leg_url,
        'mina_address',  s.mina_address,
        'mina_url',      s.mina_url,
        'arafa_address', s.arafa_address,
        'arafa_url',     s.arafa_url)
      from public.seasons s where s.id = v_p.season_id),

    /* ⚠️ لا مفتاحَ أصلٍ من `company_config` هنا. شعارُ البوابة يأتي
       في `assets` أدناه، ومصدرُه `company_assets` وحدها.

       ولا يُذكر في هذا الجسد اسمُ عمودٍ ساقطٍ ولو في تعليق:
       `prosrc` يحفظ التعليقات، وحارسُ التوابع يقرؤه. */
    'config', (select json_build_object(
      'name_ar', c.name_ar, 'tagline', c.tagline,
      'color_primary', c.color_primary, 'color_accent', c.color_accent,
      'admin_name', c.admin_name,
      'admin_phone', c.admin_phone, 'admin_whatsapp', c.admin_whatsapp,
      'country', c.country, 'city', c.city,
      'portal_welcome_message', c.portal_welcome_message,
      'portal_help_message', c.portal_help_message,
      'portal_settings', v_settings,
      'settings_stamp', public.portal_settings_stamp(),
      'assets', (select coalesce(jsonb_object_agg(a.asset_key, a.asset_url), '{}'::jsonb)
        from public.company_assets a
        where a.asset_key = any (array['logo', 'portal_banner', 'favicon']))
    ) from public.company_config c order by c.id limit 1),
    /* م٧ — شرط الموسم · Phase 1 — الجمهورُ المجمَّد والحالات (انظر v_ann أعلاه).
       العناصرُ تحمل id · body · priority · show_at كما كانت، ومعها title · pinned ·
       revision · state · edited_at — فالواجهةُ الأقدم تعمل كما هي. */
    'announcements', v_ann -> 'items',
    'announcements_meta', json_build_object('total', v_ann -> 'total', 'unread', v_ann -> 'unread',
                                            'has_more', v_ann -> 'has_more', 'page_size', 10)
  ) into v_result;

  return v_result;
end;
$function$;

-- ── ٨. الملكيّةُ والمِنَح ──────────────────────────────────────────────
do $grants$
declare
  v_fn regprocedure;
begin
  foreach v_fn in array array[
      'public._announcement_audience_check(bigint, jsonb)'::regprocedure,
      'public._announcement_audience_members(bigint, jsonb)'::regprocedure,
      'public._announcement_resolve(bigint)'::regprocedure,
      'public._announcement_freeze(bigint)'::regprocedure,
      'public._announcement_reset_push(bigint)'::regprocedure,
      'public._announcement_admin_guard()'::regprocedure,
      'public._announcements_before_write()'::regprocedure,
      'public._announcements_after_write()'::regprocedure,
      'public._announcements_audit_delete()'::regprocedure,
      'public._pilgrim_announcements(bigint, bigint, integer, integer)'::regprocedure,
      'public.announcement_audience_preview(jsonb)'::regprocedure,
      'public.update_announcement(bigint, text, text, text, timestamptz)'::regprocedure,
      'public.delete_announcement(bigint)'::regprocedure,
      'public.get_pilgrim_announcements(text, integer)'::regprocedure,
      'public.acknowledge_pilgrim_announcement(text, bigint, integer)'::regprocedure] loop
    execute format('alter function %s owner to postgres', v_fn);
    -- والامتيازاتُ الافتراضيّة تمنح كلَّ دالّةٍ جديدة: يُسحب، ثم يُمنح الواجهةُ وحدها
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end
$grants$;

-- المحفّزُ بحقوق المستدعي يتحقّق من الجمهور عند الإدراج المباشر من الإدارة
grant execute on function public._announcement_audience_check(bigint, jsonb) to authenticated, service_role;
grant execute on function public.announcement_audience_preview(jsonb) to authenticated, service_role;
grant execute on function public.update_announcement(bigint, text, text, text, timestamptz) to authenticated;
grant execute on function public.delete_announcement(bigint) to authenticated;
grant execute on function public.get_pilgrim_announcements(text, integer) to anon;
grant execute on function public.acknowledge_pilgrim_announcement(text, bigint, integer) to anon;

comment on function public.update_announcement(bigint, text, text, text, timestamptz) is
  'Phase 1 — تعديلُ تنبيه (manage_portal). تغيّرُ العنوان/النصّ يرفع النسخة، ولمنشورٍ سارٍ يُصفّر جولةَ الدفع (push = requested) إلى الجمهور المجمَّد. المجدوَلُ لا يُدفع قبل موعده.';
comment on function public.delete_announcement(bigint) is
  'Phase 1 — حذفٌ نهائيّ (manage_portal) بالقفل الاستشاريّ أولاً؛ يحذف التسليمَ والجمهورَ والإقرارات، ويترك في audit_log صفّاً بلا محتوى.';
comment on function public.acknowledge_pilgrim_announcement(text, bigint, integer) is
  'Phase 1 — إقرارُ الحاجّ بتنبيهٍ واحدٍ من جمهوره المجمَّد بالنسخة التي رآها. لـanon بالجلسة.';
comment on function public.get_pilgrim_announcements(text, integer) is
  'Phase 1 — صفحةُ تنبيهاتٍ تالية (١٠) للحاجّ بالجلسة: الجمهورُ المجمَّد والحالات، بلا بيانات تسليم.';
comment on function public.push_claim_targets(bigint, uuid, integer, integer) is
  'M6 + Phase 1 — الحجزُ بمهلة، وسياجُ النسخة: عاملٌ بدأ قبل تعديل المحتوى يُرفض حجزُه (superseded).';

-- ── ٩. شروطٌ لاحقة على ما تملكه هذه الترحيلة وحده (S-38) ─────────────
do $post$
declare
  v_fn   regprocedure;
  v_src  text;
begin
  -- الدوالُّ الجديدة والمعادُ تعريفُها: SECURITY DEFINER بمسار بحثٍ ثابت (إلا محفّزَ المستدعي)
  foreach v_fn in array array[
      'public._announcement_audience_check(bigint, jsonb)'::regprocedure,
      'public._announcement_audience_members(bigint, jsonb)'::regprocedure,
      'public._announcement_resolve(bigint)'::regprocedure,
      'public._announcement_freeze(bigint)'::regprocedure,
      'public._announcement_reset_push(bigint)'::regprocedure,
      'public._announcement_admin_guard()'::regprocedure,
      'public._announcements_after_write()'::regprocedure,
      'public._announcements_audit_delete()'::regprocedure,
      'public._pilgrim_announcements(bigint, bigint, integer, integer)'::regprocedure,
      'public.announcement_audience_preview(jsonb)'::regprocedure,
      'public.update_announcement(bigint, text, text, text, timestamptz)'::regprocedure,
      'public.delete_announcement(bigint)'::regprocedure,
      'public.get_pilgrim_announcements(text, integer)'::regprocedure,
      'public.acknowledge_pilgrim_announcement(text, bigint, integer)'::regprocedure,
      'public.get_pilgrim_portal_by_session(text)'::regprocedure,
      'public.mark_pilgrim_notification_read(text, bigint)'::regprocedure,
      'public.push_prepare_announcement(bigint)'::regprocedure,
      'public.push_claim_targets(bigint, uuid, integer, integer)'::regprocedure] loop
    if not exists (select 1 from pg_proc p where p.oid = v_fn and p.prosecdef
                    and p.proconfig @> array['search_path=public, pg_temp']) then
      raise exception '% ليست SECURITY DEFINER بمسار بحثٍ ثابت.', v_fn using errcode = 'P0001';
    end if;
  end loop;
  if exists (select 1 from pg_proc p where p.oid = 'public._announcements_before_write()'::regprocedure
              and (p.prosecdef or not p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '_announcements_before_write يجب أن تعمل بحقوق المستدعي وبمسارٍ ثابت.' using errcode = 'P0001';
  end if;

  -- الداخليّةُ لا ينفّذها دورُ عميل
  foreach v_fn in array array[
      'public._announcement_audience_members(bigint, jsonb)'::regprocedure,
      'public._announcement_resolve(bigint)'::regprocedure,
      'public._announcement_freeze(bigint)'::regprocedure,
      'public._announcement_reset_push(bigint)'::regprocedure,
      'public._pilgrim_announcements(bigint, bigint, integer, integer)'::regprocedure] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception '% قابلةٌ للتنفيذ من دور عميل.', v_fn using errcode = 'P0001';
    end if;
  end loop;
  -- البوابة: anon وحده · الإدارة: authenticated لا anon
  foreach v_fn in array array[
      'public.get_pilgrim_announcements(text, integer)'::regprocedure,
      'public.acknowledge_pilgrim_announcement(text, bigint, integer)'::regprocedure,
      'public.get_pilgrim_portal_by_session(text)'::regprocedure] loop
    if not has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% يجب أن تكون لـanon وحده.', v_fn using errcode = 'P0001';
    end if;
  end loop;
  foreach v_fn in array array[
      'public.update_announcement(bigint, text, text, text, timestamptz)'::regprocedure,
      'public.delete_announcement(bigint)'::regprocedure,
      'public.announcement_audience_preview(jsonb)'::regprocedure] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') or not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% يجب أن تكون لـauthenticated (وحارسُها manage_portal) لا لـanon.', v_fn using errcode = 'P0001';
    end if;
  end loop;
  -- الدفعُ لـservice_role وحده كما كان
  if has_function_privilege('authenticated', 'public.push_claim_targets(bigint, uuid, integer, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.push_prepare_announcement(bigint)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.push_claim_targets(bigint, uuid, integer, integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.push_prepare_announcement(bigint)', 'EXECUTE') then
    raise exception 'مِنَحُ دوالّ الدفع تغيّرت.' using errcode = 'P0001';
  end if;

  -- الجداولُ الجديدة: RLS، ولا كتابةَ لدور عميل
  if exists (select 1 from pg_class c where c.oid in ('public.announcement_recipients'::regclass,
               'public.announcement_reads'::regclass, 'public.announcement_push_workers'::regclass)
              and not c.relrowsecurity) then
    raise exception 'RLS غيرُ مفعّل على جدولٍ جديد.' using errcode = 'P0001';
  end if;
  if has_table_privilege('anon', 'public.announcement_recipients', 'SELECT')
     or has_table_privilege('anon', 'public.announcement_reads', 'SELECT')
     or has_table_privilege('authenticated', 'public.announcement_recipients', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.announcement_reads', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.announcement_push_workers', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role', 'public.announcement_push_workers', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'مِنَحُ الجداول الجديدة أوسعُ من المقصود.' using errcode = 'P0001';
  end if;

  -- الأجسادُ تحمل ما أُعيدت لأجله
  select p.prosrc into v_src from pg_proc p where p.oid = 'public.get_pilgrim_portal_by_session(text)'::regprocedure;
  if position('public._pilgrim_announcements(v_p.id, v_p.season_id, 0, 10)' in v_src) = 0
     or position('target_type' in v_src) > 0 then
    raise exception 'البوابةُ لا تقرأ التنبيهاتِ من الجمهور المجمَّد.' using errcode = 'P0001';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'public.push_prepare_announcement(bigint)'::regprocedure;
  if position('from public.announcement_recipients au' in v_src) = 0
     or position('announcement_audience(' in v_src) > 0 then
    raise exception 'تهيئةُ الدفع لا تستعمل الجمهورَ المجمَّد.' using errcode = 'P0001';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'public.push_claim_targets(bigint, uuid, integer, integer)'::regprocedure;
  if position('announcement_push_workers' in v_src) = 0 or position('for update skip locked' in v_src) = 0 then
    raise exception 'الحجزُ بلا سياجِ النسخة أو بلا SKIP LOCKED.' using errcode = 'P0001';
  end if;
  if (select count(*) from pg_trigger t where t.tgrelid = 'public.announcements'::regclass and not t.tgisinternal
        and t.tgname in ('trg_announcements_before_write', 'trg_announcements_after_write', 'trg_announcements_audit_delete')) <> 3 then
    raise exception 'محفّزاتُ التنبيهات ناقصة.' using errcode = 'P0001';
  end if;
end
$post$;
