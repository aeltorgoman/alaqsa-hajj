-- ═══════════════════════════════════════════════════════════════════
-- version : 20261111111656
-- name    : polls_phase2
-- ═══════════════════════════════════════════════════════════════════
--
-- Phase 2 — استطلاعاتُ بوابة الحاجّ: القاعدةُ وحدها (لا واجهة، ولا إشعار، ولا تصدير).
-- ترحيلةٌ إضافيّة: لا يُمسّ صفٌّ موجود، ولا سلوكٌ من Phase 1.
--
-- النموذجُ المعتمد (تدقيق المعمار، القرارات ق١–ق١٢):
--   · الاستطلاعُ سؤالٌ واحد بخياراتٍ (أحاديّ أو متعدّد بحدٍّ أعلى)، كيانٌ موسميّ مستقلّ.
--   · الجمهورُ بمفردات التنبيهات نفسها (Phase 1): الكلّ للحجّاج وحدهم، وغيرُهم بالاختيار
--     الصريح، وباص ومنى وعرفة وفندق الغرفة والرحلة والحاجّ بعينه، اتّحادٌ بلا تكرار.
--     الحدُّ المُعاد استعمالُه: _announcement_audience_check / _announcement_audience_members
--     (موسم + jsonb، لا شيءَ من التنبيه فيهما) — لا تُنسخان ولا تُعدَّلان.
--   · الحالات: draft → scheduled → published → closed. لا إعادةَ فتح (ق٥)، ولا تغييرَ
--     للخيارات ولا للسؤال بعد النشر (ق٦).
--   · الجمهورُ يُجمَّد عند النشر الفعليّ في poll_recipients (ق٣)، ويُضاف إليه يدوياً
--     بعملية مخوَّلة (add_poll_recipients).
--   · التصويتُ بجلسة البوابة وحدها، وبرقم مراجعة (ق١٠): الكتابةُ القديمة تُرفض (stale).
--     وallow_answer_changes (افتراضاً true) لكلّ استطلاع: false ← أوّلُ إجابةٍ ثُبّتت نهائيّة (final)،
--     ويثبت الإعدادُ بالنشر كسائر الحقول.
--   · النتائج: حيّةٌ بالإسناد الحاليّ، ولقطةٌ عند الإغلاق بإسناد لحظة الإغلاق (ق٤)،
--     غيرُ قابلةٍ للتعديل، ولا مفتاحَ أجنبيّاً فيها إلى الحجّاج: تبقى بعد حذف الحاجّ (ق١٢)
--     كما يبقى سجلُّ تغيّر الإجابات.
--   · إقفالُ الموسم يُغلق استطلاعاته ويكتب لقطاتها في معاملته نفسها (ق٧).
--   · الإدارةُ بـmanage_portal (ق١)، والحاجُّ بالجلسة، ولا منحَ لـanon على أيّ جدول.
--
-- ترتيبُ الأقفال (لا جمود): صفُّ الموسم (FOR SHARE، أو FOR UPDATE في close_season)
-- ثم صفُّ الاستطلاع، ثم صفُّ الإجابة. كلُّ دالّةٍ هنا تأخذها بهذا الترتيب.

-- ── ١. الجداول ───────────────────────────────────────────────────────
create table public.polls (
  id                  bigint generated always as identity primary key,
  season_id           bigint not null references public.seasons(id) on delete restrict,
  title               text not null check (btrim(title) <> '' and length(title) <= 300),
  body                text check (body is null or length(body) <= 4000),
  kind                text not null default 'single' check (kind in ('single', 'multiple')),
  max_choices         smallint check (max_choices is null or max_choices >= 1),
  audience            jsonb not null check (jsonb_typeof(audience) = 'object'),
  status              text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'closed')),
  publish_at          timestamptz,
  published_at        timestamptz,
  audience_frozen_at  timestamptz,
  closes_at           timestamptz,
  closed_at           timestamptz,
  close_reason        text check (close_reason is null or close_reason in ('manual', 'expired', 'season_close')),
  -- تغييرُ الإجابة بعد أوّل إجابةٍ ناجحة: true يسمح به ما دام مفتوحاً (برقم المراجعة)، false يجعلها نهائيّة
  allow_answer_changes boolean not null default true,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_by          uuid,
  updated_at          timestamptz not null default now(),
  constraint polls_kind_max_choices check (kind = 'multiple' or max_choices is null),
  constraint polls_status_fields check (
       (status = 'draft'     and published_at is null and closed_at is null and close_reason is null and publish_at is null)
    or (status = 'scheduled' and published_at is null and closed_at is null and close_reason is null and publish_at is not null)
    or (status = 'published' and published_at is not null and audience_frozen_at is not null and closed_at is null and close_reason is null)
    or (status = 'closed'    and closed_at is not null and close_reason is not null)),
  constraint polls_closes_after_publish check (
    closes_at is null or (closes_at > coalesce(published_at, publish_at, created_at) or status = 'closed'))
);
create index polls_season_status_idx on public.polls (season_id, status);
comment on table public.polls is
  'Phase 2 — استطلاعٌ: سؤالٌ واحد بخيارات. draft → scheduled → published → closed، بلا إعادة فتح. يُكتب بالدوالّ وحدها.';

create table public.poll_options (
  id          bigint generated always as identity primary key,
  poll_id     bigint not null references public.polls(id) on delete cascade,
  label       text not null check (btrim(label) <> '' and length(label) <= 300),
  sort_order  integer not null,
  unique (poll_id, id),
  unique (poll_id, sort_order)
);
comment on table public.poll_options is 'Phase 2 — خياراتُ الاستطلاع. لا تتغيّر بعد النشر (محفّز).';

create table public.poll_recipients (
  poll_id       bigint not null references public.polls(id) on delete cascade,
  passenger_id  bigint not null references public.passengers(id) on delete cascade,
  added_reason  text not null check (added_reason in ('publish', 'manual')),
  added_by      uuid,
  added_at      timestamptz not null default now(),
  primary key (poll_id, passenger_id)
);
create index poll_recipients_passenger_idx on public.poll_recipients (passenger_id);
comment on table public.poll_recipients is
  'Phase 2 — جمهورُ الاستطلاع المجمَّد عند النشر (publish) أو المضاف يدوياً (manual). مستقلٌّ عن تغيّر الإسناد لاحقاً.';

create table public.poll_responses (
  poll_id             bigint not null,
  passenger_id        bigint not null,
  revision            integer not null default 1 check (revision >= 1),
  first_submitted_at  timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (poll_id, passenger_id),
  foreign key (poll_id, passenger_id) references public.poll_recipients(poll_id, passenger_id) on delete cascade
);
comment on table public.poll_responses is 'Phase 2 — الإجابةُ الحاليّة: صفٌّ واحد لكلّ حاجّ، برقم مراجعة.';

create table public.poll_response_choices (
  poll_id       bigint not null,
  passenger_id  bigint not null,
  option_id     bigint not null,
  primary key (poll_id, passenger_id, option_id),
  foreign key (poll_id, passenger_id) references public.poll_responses(poll_id, passenger_id) on delete cascade,
  foreign key (poll_id, option_id) references public.poll_options(poll_id, id) on delete restrict
);
create index poll_response_choices_option_idx on public.poll_response_choices (poll_id, option_id);
comment on table public.poll_response_choices is 'Phase 2 — خياراتُ الإجابة الحاليّة.';

-- سجلُّ تغيّر الإجابات: إضافةٌ فقط، ولا مفتاحَ أجنبيّاً إلى الحجّاج ولا إلى الاستطلاع —
-- يبقى دليلاً بعد حذف الحاجّ. يُحذف مع موسمه وحده (delete_season).
create table public.poll_response_events (
  id            bigint generated always as identity primary key,
  poll_id       bigint not null,
  season_id     bigint not null,
  passenger_id  bigint not null,
  revision      integer not null,
  option_ids    bigint[] not null,
  action        text not null check (action in ('submit', 'change')),
  at            timestamptz not null default now()
);
create index poll_response_events_poll_idx on public.poll_response_events (poll_id, passenger_id);
comment on table public.poll_response_events is 'Phase 2 — سجلُّ تغيّر الإجابات (إضافةٌ فقط، بلا مفتاحٍ أجنبيّ: يبقى بعد حذف الحاجّ).';

-- أحداثُ الإدارة: من فعل ماذا ومتى، بلا نصّ إجاباتٍ ولا أسماء. تبقى بعد حذف الاستطلاع والموسم.
create table public.poll_admin_events (
  id            bigint generated always as identity primary key,
  poll_id       bigint not null,
  season_id     bigint not null,
  action        text not null check (action in ('create', 'update', 'schedule', 'unschedule', 'publish',
                                                'add_recipients', 'close', 'delete')),
  actor_id      uuid,
  actor_source  text not null check (actor_source in ('session', 'system')),
  detail        jsonb not null default '{}'::jsonb,
  at            timestamptz not null default now()
);
create index poll_admin_events_poll_idx on public.poll_admin_events (poll_id, at);
comment on table public.poll_admin_events is 'Phase 2 — أحداثُ إدارة الاستطلاع (إضافةٌ فقط، بلا محتوى إجابات ولا أسماء).';

-- لقطةُ النتائج عند الإغلاق: غيرُ قابلةٍ للتعديل، ولا مفتاحَ أجنبيّاً لها. تُحذف مع موسمها وحده.
create table public.poll_result_snapshots (
  poll_id           bigint primary key,
  season_id         bigint not null,
  title             text not null,
  kind              text not null,
  closed_at         timestamptz not null,
  close_reason      text not null,
  audience_count    integer not null,
  respondent_count  integer not null,
  options           jsonb not null,
  labels            jsonb not null,
  totals            jsonb not null,
  groups            jsonb not null,
  rows              jsonb not null,
  checksum          text not null,
  created_at        timestamptz not null default now()
);
comment on table public.poll_result_snapshots is
  'Phase 2 — لقطةُ نتائج الإغلاق بإسناد لحظة الإغلاق (باص · منى · عرفة · فندق · رحلتا الذهاب والعودة). غيرُ قابلةٍ للتعديل.';

-- ── ٢. المحفّزات ─────────────────────────────────────────────────────
create trigger trg_reject_closed_season
  before insert or delete or update on public.polls
  for each row execute function public.reject_write_closed_season();
create trigger trg_reject_closed_season
  before insert or delete or update on public.poll_recipients
  for each row execute function public.reject_write_closed_season_derived();
create trigger trg_reject_closed_season
  before insert or delete or update on public.poll_responses
  for each row execute function public.reject_write_closed_season_derived();
create trigger trg_reject_closed_season
  before insert or delete or update on public.poll_response_choices
  for each row execute function public.reject_write_closed_season_derived();

-- دورةُ الحياة على الصفّ نفسه، أيّاً كان الكاتب (حتى الدوالّ)
create function public._polls_before_write()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.status not in ('draft', 'scheduled') then
      raise exception 'لا يُحذف استطلاعٌ نُشر.' using errcode = '22023';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'الاستطلاعُ يبدأ مسوّدة.' using errcode = '22023';
    end if;
    return new;
  end if;
  -- UPDATE
  if old.status = 'closed' then
    raise exception 'الاستطلاعُ مغلق: لا يُعاد فتحُه ولا يُعدَّل.' using errcode = '22023';
  end if;
  if new.season_id is distinct from old.season_id then
    raise exception 'لا يُنقل الاستطلاعُ بين المواسم.' using errcode = '22023';
  end if;
  if not ((old.status = new.status)
          or (old.status = 'draft'     and new.status in ('scheduled', 'published'))
          or (old.status = 'scheduled' and new.status in ('draft', 'published', 'closed'))
          or (old.status = 'published' and new.status = 'closed')) then
    raise exception 'انتقالٌ غيرُ مسموح: % → %.', old.status, new.status using errcode = '22023';
  end if;
  if old.status in ('published') and (
       new.title is distinct from old.title or new.body is distinct from old.body
       or new.kind is distinct from old.kind or new.max_choices is distinct from old.max_choices
       or new.audience is distinct from old.audience or new.published_at is distinct from old.published_at
       or new.audience_frozen_at is distinct from old.audience_frozen_at or new.publish_at is distinct from old.publish_at
       or new.closes_at is distinct from old.closes_at
       or new.allow_answer_changes is distinct from old.allow_answer_changes) then
    raise exception 'نُشر الاستطلاع: سؤالُه وخياراتُه وجمهورُه ومواعيدُه وإعدادُ تغيير الإجابة ثابتة.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_polls_before_write
  before insert or update or delete on public.polls
  for each row execute function public._polls_before_write();

-- الخياراتُ والجمهورُ والإجابات: تابعةٌ لحال الاستطلاع
create function public._poll_children_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_poll   bigint := case when tg_op = 'DELETE' then old.poll_id else new.poll_id end;
  v_status text;
  v_closes timestamptz;
  v_closed timestamptz;
  v_change boolean;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select p.status, p.closes_at, s.closed_at, p.allow_answer_changes into v_status, v_closes, v_closed, v_change
    from public.polls p join public.seasons s on s.id = p.season_id where p.id = v_poll;
  if not found then
    -- الاستطلاعُ يُحذف (تعاقُب من مسوّدة): لا شيء يُحمى
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'poll_options' then
    if v_closed is not null then
      raise exception 'موسمُ الاستطلاع مقفل.' using errcode = 'P0001';
    end if;
    if v_status not in ('draft', 'scheduled') then
      raise exception 'نُشر الاستطلاع: لا تُعدَّل خياراتُه.' using errcode = '22023';
    end if;
  elsif tg_op = 'DELETE' then
    -- حذفُ حاجٍّ يُسقط جمهورَه وإجابته الحيّة (ق١٢)؛ اللقطةُ والسجلُّ يبقيان
    null;
  elsif tg_table_name = 'poll_recipients' then
    if v_status <> 'published' then
      raise exception 'يُجمَّد الجمهورُ لاستطلاعٍ منشورٍ مفتوح وحده.' using errcode = '22023';
    end if;
  else
    if v_status <> 'published' or (v_closes is not null and v_closes <= now()) then
      raise exception 'الاستطلاعُ غيرُ مفتوحٍ للتصويت.' using errcode = '22023';
    end if;
    -- الإجابةُ النهائيّة (allow_answer_changes = false): لا مراجعةَ ثانية، أيّاً كان الكاتب
    if tg_table_name = 'poll_responses' and tg_op = 'UPDATE' and not v_change then
      raise exception 'الإجابةُ نهائيّةٌ في هذا الاستطلاع.' using errcode = '22023';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger trg_poll_options_guard
  before insert or update or delete on public.poll_options
  for each row execute function public._poll_children_guard();
create trigger trg_poll_recipients_guard
  before insert or update or delete on public.poll_recipients
  for each row execute function public._poll_children_guard();
create trigger trg_poll_responses_guard
  before insert or update or delete on public.poll_responses
  for each row execute function public._poll_children_guard();
create trigger trg_poll_response_choices_guard
  before insert or update or delete on public.poll_response_choices
  for each row execute function public._poll_children_guard();

-- السجلّان واللقطة: إضافةٌ فقط. حذفُ الموسم (راية الصيانة) يحذف لقطاته وسجلَّ إجاباته وحده.
create function public._poll_append_only()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'DELETE' and tg_table_name <> 'poll_admin_events'
     and coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return old;
  end if;
  raise exception '% للإضافة فقط.', tg_table_name using errcode = '42501';
end;
$$;
create trigger trg_poll_response_events_append_only
  before update or delete on public.poll_response_events
  for each row execute function public._poll_append_only();
create trigger trg_poll_admin_events_append_only
  before update or delete on public.poll_admin_events
  for each row execute function public._poll_append_only();
create trigger trg_poll_result_snapshots_append_only
  before update or delete on public.poll_result_snapshots
  for each row execute function public._poll_append_only();
create trigger trg_poll_response_events_no_truncate
  before truncate on public.poll_response_events
  for each statement execute function public._poll_append_only();
create trigger trg_poll_admin_events_no_truncate
  before truncate on public.poll_admin_events
  for each statement execute function public._poll_append_only();
create trigger trg_poll_result_snapshots_no_truncate
  before truncate on public.poll_result_snapshots
  for each statement execute function public._poll_append_only();

-- ── ٣. RLS ───────────────────────────────────────────────────────────
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_recipients enable row level security;
alter table public.poll_responses enable row level security;
alter table public.poll_response_choices enable row level security;
alter table public.poll_response_events enable row level security;
alter table public.poll_admin_events enable row level security;
alter table public.poll_result_snapshots enable row level security;

revoke all on table public.polls, public.poll_options, public.poll_recipients, public.poll_responses,
                    public.poll_response_choices, public.poll_response_events, public.poll_admin_events,
                    public.poll_result_snapshots
  from public, anon, authenticated, service_role;
-- الإدارةُ تقرأ الاستطلاعَ وخياراته (لا بيانات شخصية فيهما)؛ والإجاباتُ والجمهورُ عبر الدوالّ وحدها
grant select on table public.polls, public.poll_options to authenticated;
create policy polls_select on public.polls for select to authenticated using (public.has_permission('manage_portal'));
create policy poll_options_select on public.poll_options for select to authenticated using (public.has_permission('manage_portal'));

-- ── ٤. داخليّات ──────────────────────────────────────────────────────
create function public._poll_event(p_poll_id bigint, p_season bigint, p_action text, p_detail jsonb)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  insert into public.poll_admin_events (poll_id, season_id, action, actor_id, actor_source, detail)
  values (p_poll_id, p_season, p_action, auth.uid(),
          case when auth.uid() is not null then 'session' else 'system' end, coalesce(p_detail, '{}'::jsonb));
$$;

-- الاستطلاعُ مقفولاً للتعديل بترتيب الأقفال: الموسمُ (FOR SHARE) ثم الصفّ (FOR UPDATE)
create function public._poll_lock(p_poll_id bigint)
returns public.polls
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_season bigint;
  p        public.polls%rowtype;
begin
  select x.season_id into v_season from public.polls x where x.id = p_poll_id;
  if v_season is null then
    raise exception 'الاستطلاع غير موجود.' using errcode = 'P0002';
  end if;
  perform 1 from public.seasons s where s.id = v_season for share;
  select * into p from public.polls x where x.id = p_poll_id for update;
  return p;
end;
$$;

create function public._poll_options_json(p_poll_id bigint)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'sort_order', o.sort_order)
                            order by o.sort_order, o.id), '[]'::jsonb)
    from public.poll_options o where o.poll_id = p_poll_id;
$$;

-- صفوفُ الجمهور بالإسناد **الحاليّ**: لكلّ مستلمٍ إسنادُه واختياراته. داخليّة.
create function public._poll_rows(p_poll_id bigint)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'passenger_id', r.passenger_id, 'name_ar', p.name_ar, 'passenger_type', p.passenger_type,
           'added_reason', r.added_reason,
           'bus', p.bus_id, 'camp_mina', p.camp_mina_id, 'camp_arafa', p.camp_arafa_id, 'hotel', rm.hotel_id,
           'flight_go', p.flight_id, 'flight_back', p.return_flight_id,
           'responded', resp.passenger_id is not null, 'revision', resp.revision,
           'option_ids', coalesce((select jsonb_agg(c.option_id order by c.option_id)
                                     from public.poll_response_choices c
                                    where c.poll_id = r.poll_id and c.passenger_id = r.passenger_id), '[]'::jsonb))
           order by r.passenger_id), '[]'::jsonb)
    from public.poll_recipients r
    join public.passengers p on p.id = r.passenger_id
    left join public.rooms rm on rm.id = p.room_id
    left join public.poll_responses resp on resp.poll_id = r.poll_id and resp.passenger_id = r.passenger_id
   where r.poll_id = p_poll_id;
$$;

-- أسماءُ المجموعات في موسمٍ (تُحفظ في اللقطة: الأسماءُ قد تتغيّر بعد الإغلاق)
create function public._poll_labels(p_season bigint)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'bus',        coalesce((select jsonb_object_agg(b.id::text, coalesce(b.name, 'باص ' || b.id)) from public.buses b where b.season_id = p_season), '{}'::jsonb),
    'camp_mina',  coalesce((select jsonb_object_agg(c.id::text, c.name) from public.camps c where c.season_id = p_season and c.page_type = 'منى'), '{}'::jsonb),
    'camp_arafa', coalesce((select jsonb_object_agg(c.id::text, c.name) from public.camps c where c.season_id = p_season and c.page_type = 'عرفة'), '{}'::jsonb),
    'hotel',      coalesce((select jsonb_object_agg(h.id::text, h.name) from public.hotels h where h.season_id = p_season), '{}'::jsonb),
    'flight_go',  coalesce((select jsonb_object_agg(f.id::text, f.name) from public.flights f where f.season_id = p_season), '{}'::jsonb),
    'flight_back',coalesce((select jsonb_object_agg(f.id::text, f.name) from public.flights f where f.season_id = p_season), '{}'::jsonb));
$$;

-- التجميعُ: مصدرٌ واحد للنتائج الحيّة وللّقطة. بلا أسماء ولا أرقام حجّاج في الناتج.
-- p_dimension null ← الإجماليّ {audience, respondents, options:[{id,label,count}]}
-- وإلا ← [{key, label, audience, respondents, options:[{id,count}]}]؛ غيرُ المُسنَد مجموعةٌ صريحة.
-- في المتعدّد: count = عددُ المختارين للخيار، ومجموعُ النسب قد يتجاوز ١٠٠٪ (المقامُ المستجيبون).
create function public._poll_aggregate(p_rows jsonb, p_options jsonb, p_dimension text, p_labels jsonb)
returns jsonb
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  with r as (
    select case when p_dimension is null then '*' else coalesce(e->>p_dimension, '') end as k, e
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e
  ), o as (
    select (x->>'id')::bigint as id, x->>'label' as label, coalesce((x->>'sort_order')::int, 0) as so
      from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) x
  ), keys as (
    select distinct k from r
  ), g as (
    select k.k,
           (select count(*) from r where r.k = k.k) as audience,
           (select count(*) from r where r.k = k.k and (r.e->>'responded')::boolean) as respondents,
           (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label,
                    'count', (select count(*) from r where r.k = k.k and r.e->'option_ids' @> to_jsonb(o.id)))
                    order by o.so, o.id) from o) as options
      from keys k
  )
  select case
    when p_dimension is null then
      coalesce((select jsonb_build_object('audience', g.audience, 'respondents', g.respondents, 'options', g.options) from g),
               jsonb_build_object('audience', 0, 'respondents', 0,
                 'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'count', 0) order by o.so, o.id) from o), '[]'::jsonb)))
    else
      coalesce((select jsonb_agg(jsonb_build_object(
                  'key', nullif(g.k, '')::bigint,
                  'label', case when g.k = '' then 'غير مُسنَد' else coalesce(p_labels->p_dimension->>g.k, '#' || g.k) end,
                  'audience', g.audience, 'respondents', g.respondents,
                  'options', (select jsonb_agg(jsonb_build_object('id', x->'id', 'count', x->'count')) from jsonb_array_elements(g.options) x))
                order by (g.k = ''), coalesce(p_labels->p_dimension->>g.k, ''), g.k) from g), '[]'::jsonb)
  end;
$$;

-- النشرُ الفعليّ: تجميدُ الجمهور. الاستطلاعُ مقفولٌ قبلها (_poll_lock).
create function public._poll_publish(p_poll_id bigint, p_via text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p  public.polls%rowtype;
  n  integer;
begin
  select * into p from public.polls where id = p_poll_id;
  update public.polls
     -- published_at = الموعدُ المعتمد (المجدوَل، أو الآن)؛ لحظةُ التجميد الفعليّة في audience_frozen_at
     set status = 'published', published_at = coalesce(publish_at, now()), audience_frozen_at = now(),
         publish_at = coalesce(publish_at, now())
   where id = p_poll_id;
  insert into public.poll_recipients (poll_id, passenger_id, added_reason)
  select p_poll_id, m.passenger_id, 'publish'
    from public._announcement_audience_members(p.season_id, p.audience) m
  on conflict do nothing;
  get diagnostics n = row_count;
  perform public._poll_event(p_poll_id, p.season_id, 'publish', jsonb_build_object('recipients', n, 'via', p_via));
  return n;
end;
$$;

-- الإغلاقُ ولقطتُه في معاملةٍ واحدة. الاستطلاعُ مقفول قبلها.
create function public._poll_close(p_poll_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p        public.polls%rowtype;
  v_rows   jsonb;
  v_opts   jsonb;
  v_labels jsonb;
  v_totals jsonb;
  v_groups jsonb;
  v_at     timestamptz;
begin
  select * into p from public.polls where id = p_poll_id;
  v_at := case when p_reason = 'expired' and p.closes_at is not null then least(p.closes_at, now()) else now() end;
  update public.polls set status = 'closed', closed_at = v_at, close_reason = p_reason where id = p_poll_id;

  v_rows   := public._poll_rows(p_poll_id);
  v_opts   := public._poll_options_json(p_poll_id);
  v_labels := public._poll_labels(p.season_id);
  v_totals := public._poll_aggregate(v_rows, v_opts, null, v_labels);
  select jsonb_object_agg(d, public._poll_aggregate(v_rows, v_opts, d, v_labels))
    into v_groups
    from unnest(array['bus', 'camp_mina', 'camp_arafa', 'hotel', 'flight_go', 'flight_back']) d;

  insert into public.poll_result_snapshots (poll_id, season_id, title, kind, closed_at, close_reason,
                                            audience_count, respondent_count, options, labels, totals, groups, rows, checksum)
  values (p_poll_id, p.season_id, p.title, p.kind, v_at, p_reason,
          (v_totals->>'audience')::int, (v_totals->>'respondents')::int, v_opts, v_labels, v_totals, v_groups, v_rows,
          md5(v_opts::text || v_totals::text || v_groups::text || v_rows::text));
  perform public._poll_event(p_poll_id, p.season_id, 'close',
    jsonb_build_object('reason', p_reason, 'audience', v_totals->'audience', 'respondents', v_totals->'respondents'));
end;
$$;

-- الاستحقاقُ الزمنيّ: مجدوَلٌ حان موعدُه ← يُنشر؛ منشورٌ انتهى ← يُغلق بلقطته. للموسم النشط وحده.
-- يُستدعى قبل كلّ قراءةٍ أو كتابة، ومن مهمّة polls-settle كلَّ دقيقة.
create function public._poll_settle(p_poll_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_season bigint;
  v_status text;
  v_pub    timestamptz;
  v_closes timestamptz;
  p        public.polls%rowtype;
begin
  select season_id, status, publish_at, closes_at into v_season, v_status, v_pub, v_closes
    from public.polls where id = p_poll_id;
  if not found then return; end if;
  if not ((v_status = 'scheduled' and v_pub <= now())
          or (v_status = 'published' and v_closes is not null and v_closes <= now())) then
    return;
  end if;
  if v_season is distinct from public.active_season_id() then return; end if;
  perform 1 from public.seasons s where s.id = v_season and s.closed_at is null for share;
  if not found then return; end if;
  select * into p from public.polls where id = p_poll_id for update;
  if p.status = 'scheduled' and p.publish_at <= now() then
    perform public._poll_publish(p_poll_id, 'schedule');
    select * into p from public.polls where id = p_poll_id;
  end if;
  if p.status = 'published' and p.closes_at is not null and p.closes_at <= now() then
    perform public._poll_close(p_poll_id, 'expired');
  end if;
end;
$$;

create function public._polls_settle_due(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id bigint;
  n    integer := 0;
begin
  for v_id in
    select x.id from public.polls x
     where x.season_id = public.active_season_id()
       and ((x.status = 'scheduled' and x.publish_at <= now())
            or (x.status = 'published' and x.closes_at is not null and x.closes_at <= now()))
     order by x.id limit greatest(coalesce(p_limit, 50), 1)
  loop
    perform public._poll_settle(v_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- إقفالُ الموسم (ق٧): يُستدعى من close_season وصفُّ الموسم مقفولٌ FOR UPDATE فيها.
-- المنشورُ والمجدوَلُ يُغلقان بلقطتيهما بإسناد هذه اللحظة؛ المسوّدةُ تبقى مسوّدة.
create function public._polls_close_for_season(p_season bigint)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id bigint;
  p    public.polls%rowtype;
  n    integer := 0;
begin
  for v_id in select x.id from public.polls x
               where x.season_id = p_season and x.status in ('scheduled', 'published') order by x.id
  loop
    select * into p from public.polls where id = v_id for update;
    if p.status = 'published' and p.closes_at is not null and p.closes_at <= now() then
      perform public._poll_close(v_id, 'expired');
    elsif p.status in ('scheduled', 'published') then
      perform public._poll_close(v_id, 'season_close');
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- التحقّقُ من الحقول (إنشاءٌ وتعديل)
create function public._poll_validate(p_season bigint, p_title text, p_kind text, p_max_choices integer,
                                      p_audience jsonb, p_options text[], p_closes_at timestamptz)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_err  text;
  v_n    integer;
  v_ok   integer;
begin
  if p_season is null then
    raise exception 'لا يوجد موسم مفتوح.' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'سؤالُ الاستطلاع مطلوب.' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('single', 'multiple') then
    raise exception 'نوعُ الاستطلاع غيرُ معروف.' using errcode = '22023';
  end if;
  select count(*), count(distinct btrim(x)) filter (where btrim(coalesce(x, '')) <> '')
    into v_n, v_ok
    from unnest(coalesce(p_options, '{}'::text[])) x;
  if v_n < 2 or v_n > 20 or v_ok <> v_n then
    raise exception 'الخيارات: من ٢ إلى ٢٠، غيرُ فارغةٍ ولا مكرَّرة.' using errcode = '22023';
  end if;
  if p_kind = 'single' and p_max_choices is not null then
    raise exception 'الحدُّ الأعلى للاختيارات للاستطلاع المتعدّد وحده.' using errcode = '22023';
  end if;
  if p_kind = 'multiple' and p_max_choices is not null and (p_max_choices < 1 or p_max_choices > v_n) then
    raise exception 'الحدُّ الأعلى للاختيارات بين ١ وعدد الخيارات.' using errcode = '22023';
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'موعدُ الإغلاق يجب أن يكون في المستقبل.' using errcode = '22023';
  end if;
  v_err := public._announcement_audience_check(p_season, p_audience);
  if v_err is not null then
    raise exception '%', v_err using errcode = '22023';
  end if;
end;
$$;

-- ── ٥. الإدارة (authenticated + manage_portal) ──────────────────────────
-- الحارسُ نفسُه في Phase 1 (_announcement_admin_guard): manage_portal نشط، أو service_role، أو اتّصالٌ مباشر.
create function public.create_poll(p_title text, p_body text, p_kind text, p_max_choices integer,
                                   p_audience jsonb, p_options text[], p_closes_at timestamptz default null,
                                   p_allow_answer_changes boolean default true)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_season bigint := public.active_season_id();
  v_id     bigint;
begin
  perform public._announcement_admin_guard();
  perform public._poll_validate(v_season, p_title, p_kind, p_max_choices, p_audience, p_options, p_closes_at);
  perform 1 from public.seasons s where s.id = v_season for share;
  if p_allow_answer_changes is null then
    raise exception 'إعدادُ تغيير الإجابة مطلوب.' using errcode = '22023';
  end if;
  insert into public.polls (season_id, title, body, kind, max_choices, audience, closes_at, allow_answer_changes,
                            created_by, updated_by)
  values (v_season, btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''), p_kind, p_max_choices, p_audience,
          p_closes_at, p_allow_answer_changes, auth.uid(), auth.uid())
  returning id into v_id;
  insert into public.poll_options (poll_id, label, sort_order)
  select v_id, btrim(x), o from unnest(p_options) with ordinality as t(x, o);
  perform public._poll_event(v_id, v_season, 'create', jsonb_build_object('options', cardinality(p_options), 'kind', p_kind,
                                                                         'allow_answer_changes', p_allow_answer_changes));
  return v_id;
end;
$$;

-- قبل النشر وحده (مسوّدة أو مجدوَل): السؤالُ والخياراتُ والجمهورُ والموعد
create function public.update_poll(p_poll_id bigint, p_title text, p_body text, p_kind text, p_max_choices integer,
                                   p_audience jsonb, p_options text[], p_closes_at timestamptz default null,
                                   p_allow_answer_changes boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p public.polls%rowtype;
begin
  perform public._announcement_admin_guard();
  perform public._poll_settle(p_poll_id);
  p := public._poll_lock(p_poll_id);
  if p.season_id is distinct from public.active_season_id() then
    raise exception 'الاستطلاع لا يتبع الموسم المفتوح.' using errcode = 'P0001';
  end if;
  if p.status not in ('draft', 'scheduled') then
    raise exception 'نُشر الاستطلاع: لا يُعدَّل سؤالُه ولا خياراتُه ولا جمهورُه.' using errcode = '22023';
  end if;
  perform public._poll_validate(p.season_id, p_title, p_kind, p_max_choices, p_audience, p_options, p_closes_at);
  if p_allow_answer_changes is null then
    raise exception 'إعدادُ تغيير الإجابة مطلوب.' using errcode = '22023';
  end if;
  if p.status = 'scheduled' and p_closes_at is not null and p_closes_at <= p.publish_at then
    raise exception 'موعدُ الإغلاق يجب أن يكون بعد موعد النشر.' using errcode = '22023';
  end if;
  update public.polls
     set title = btrim(p_title), body = nullif(btrim(coalesce(p_body, '')), ''), kind = p_kind,
         max_choices = p_max_choices, audience = p_audience, closes_at = p_closes_at,
         allow_answer_changes = p_allow_answer_changes, updated_by = auth.uid()
   where id = p_poll_id;
  delete from public.poll_options where poll_id = p_poll_id;
  insert into public.poll_options (poll_id, label, sort_order)
  select p_poll_id, btrim(x), o from unnest(p_options) with ordinality as t(x, o);
  perform public._poll_event(p_poll_id, p.season_id, 'update', jsonb_build_object('options', cardinality(p_options), 'kind', p_kind,
                                                                                'allow_answer_changes', p_allow_answer_changes));
end;
$$;

-- النشر: الآن (يُجمَّد الجمهورُ في هذه المعاملة) أو موعدٌ قادم (مجدوَل يُنشر عند حلوله)
create function public.publish_poll(p_poll_id bigint, p_publish_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p   public.polls%rowtype;
  v_n integer;
  v_err text;
begin
  perform public._announcement_admin_guard();
  perform public._poll_settle(p_poll_id);
  p := public._poll_lock(p_poll_id);
  if p.season_id is distinct from public.active_season_id() then
    raise exception 'الاستطلاع لا يتبع الموسم المفتوح.' using errcode = 'P0001';
  end if;
  if p.status not in ('draft', 'scheduled') then
    raise exception 'الاستطلاعُ منشورٌ أو مغلقٌ بالفعل.' using errcode = '22023';
  end if;
  -- المفرداتُ تُتحقَّق من جديد: قد يُحذف باصٌ أو مخيّمٌ بعد كتابة المسوّدة
  v_err := public._announcement_audience_check(p.season_id, p.audience);
  if v_err is not null then raise exception '%', v_err using errcode = '22023'; end if;
  if p.closes_at is not null and p.closes_at <= greatest(now(), coalesce(p_publish_at, now())) then
    raise exception 'موعدُ الإغلاق يجب أن يكون بعد موعد النشر.' using errcode = '22023';
  end if;
  if p_publish_at is not null and p_publish_at > now() then
    update public.polls set status = 'scheduled', publish_at = p_publish_at, updated_by = auth.uid() where id = p_poll_id;
    perform public._poll_event(p_poll_id, p.season_id, 'schedule', jsonb_build_object('publish_at', p_publish_at));
    return jsonb_build_object('id', p_poll_id, 'status', 'scheduled', 'publish_at', p_publish_at);
  end if;
  update public.polls set publish_at = null, updated_by = auth.uid() where id = p_poll_id and status = 'draft';
  v_n := public._poll_publish(p_poll_id, 'manual');
  return jsonb_build_object('id', p_poll_id, 'status', 'published', 'recipients', v_n);
end;
$$;

create function public.unschedule_poll(p_poll_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p public.polls%rowtype;
begin
  perform public._announcement_admin_guard();
  perform public._poll_settle(p_poll_id);
  p := public._poll_lock(p_poll_id);
  if p.status <> 'scheduled' then
    raise exception 'الاستطلاعُ ليس مجدوَلاً.' using errcode = '22023';
  end if;
  update public.polls set status = 'draft', publish_at = null, updated_by = auth.uid() where id = p_poll_id;
  perform public._poll_event(p_poll_id, p.season_id, 'unschedule', '{}'::jsonb);
end;
$$;

create function public.close_poll(p_poll_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p public.polls%rowtype;
begin
  perform public._announcement_admin_guard();
  perform public._poll_settle(p_poll_id);
  p := public._poll_lock(p_poll_id);
  if p.status = 'closed' then
    raise exception 'الاستطلاعُ مغلقٌ بالفعل (%).', p.close_reason using errcode = '22023';
  end if;
  if p.status <> 'published' then
    raise exception 'لا يُغلق إلا استطلاعٌ منشور.' using errcode = '22023';
  end if;
  perform public._poll_close(p_poll_id, 'manual');
  return (select jsonb_build_object('id', s.poll_id, 'status', 'closed', 'audience', s.audience_count,
                                    'respondents', s.respondent_count, 'checksum', s.checksum)
            from public.poll_result_snapshots s where s.poll_id = p_poll_id);
end;
$$;

-- إضافةُ حجّاجٍ (مسجَّلين بعد النشر عادةً) إلى جمهور استطلاعٍ منشورٍ مفتوح. أيُّ نوعٍ بالاختيار الصريح.
create function public.add_poll_recipients(p_poll_id bigint, p_passenger_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p        public.polls%rowtype;
  v_ids    bigint[] := array(select distinct x from unnest(coalesce(p_passenger_ids, '{}'::bigint[])) x where x is not null order by 1);
  v_valid  integer;
  v_added  integer;
begin
  perform public._announcement_admin_guard();
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 1000 then
    raise exception 'حدّد من حاجٍّ واحد إلى ١٠٠٠.' using errcode = '22023';
  end if;
  perform public._poll_settle(p_poll_id);
  p := public._poll_lock(p_poll_id);
  if p.status <> 'published' or (p.closes_at is not null and p.closes_at <= now()) then
    raise exception 'يُضاف إلى جمهور استطلاعٍ منشورٍ مفتوح وحده.' using errcode = '22023';
  end if;
  select count(*) into v_valid from public.passengers x where x.id = any(v_ids) and x.season_id = p.season_id;
  if v_valid <> cardinality(v_ids) then
    raise exception 'حجّاجٌ لا يتبعون موسم الاستطلاع.' using errcode = '22023';
  end if;
  insert into public.poll_recipients (poll_id, passenger_id, added_reason, added_by)
  select p_poll_id, x, 'manual', auth.uid() from unnest(v_ids) x
  on conflict do nothing;
  get diagnostics v_added = row_count;
  perform public._poll_event(p_poll_id, p.season_id, 'add_recipients',
    jsonb_build_object('requested', cardinality(v_ids), 'added', v_added, 'passenger_ids', to_jsonb(v_ids)));
  return jsonb_build_object('added', v_added, 'already', cardinality(v_ids) - v_added);
end;
$$;

-- حذفُ المسوّدة أو المجدوَل وحده؛ المنشورُ يُغلق ولا يُحذف
create function public.delete_poll(p_poll_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p public.polls%rowtype;
begin
  perform public._announcement_admin_guard();
  perform public._poll_settle(p_poll_id);
  p := public._poll_lock(p_poll_id);
  if p.status not in ('draft', 'scheduled') then
    raise exception 'لا يُحذف استطلاعٌ نُشر؛ يُغلق.' using errcode = '22023';
  end if;
  delete from public.polls where id = p_poll_id;
  perform public._poll_event(p_poll_id, p.season_id, 'delete', jsonb_build_object('status', p.status));
  return true;
end;
$$;

-- النتائجُ الحيّة بالإسناد الحاليّ: إجماليّ، ومع p_dimension تقسيمٌ بمجموعة. لا أسماء ولا أرقام حجّاج.
create function public.poll_results(p_poll_id bigint, p_dimension text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p      public.polls%rowtype;
  v_rows jsonb;
  v_opts jsonb;
  v_res  jsonb;
begin
  perform public._announcement_admin_guard();
  if p_dimension is not null and p_dimension not in ('bus', 'camp_mina', 'camp_arafa', 'hotel', 'flight_go', 'flight_back') then
    raise exception 'تقسيمٌ غيرُ معروف: %.', p_dimension using errcode = '22023';
  end if;
  perform public._poll_settle(p_poll_id);
  select * into p from public.polls where id = p_poll_id;
  if not found then raise exception 'الاستطلاع غير موجود.' using errcode = 'P0002'; end if;
  v_rows := public._poll_rows(p_poll_id);
  v_opts := public._poll_options_json(p_poll_id);
  v_res := jsonb_build_object('poll_id', p.id, 'status', p.status, 'kind', p.kind, 'source', 'live',
                              'totals', public._poll_aggregate(v_rows, v_opts, null, null));
  if p_dimension is not null then
    v_res := v_res || jsonb_build_object('dimension', p_dimension,
               'groups', public._poll_aggregate(v_rows, v_opts, p_dimension, public._poll_labels(p.season_id)));
  end if;
  return v_res;
end;
$$;

-- لقطةُ الإغلاق كما كُتبت (مع تفصيل المستلمين لحظةَ الإغلاق — لمن يملك manage_portal وحده)
create function public.get_poll_snapshot(p_poll_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public._announcement_admin_guard();
  perform public._poll_settle(p_poll_id);
  return (select to_jsonb(s) || jsonb_build_object('checksum_valid',
                   s.checksum = md5(s.options::text || s.totals::text || s.groups::text || s.rows::text))
            from public.poll_result_snapshots s where s.poll_id = p_poll_id);
end;
$$;

-- ── ٦. البوابة (anon بالجلسة) ─────────────────────────────────────────
-- استطلاعاتُ الحاجّ: ما هو في جمهوره المجمَّد، منشوراً أو مغلقاً. بلا أعداد ولا أسماء غيره.
create function public.get_pilgrim_polls(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pid    bigint;
  v_season bigint;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then return null; end if;
  select season_id into v_season from public.passengers where id = v_pid;
  perform public._polls_settle_due(20);
  return (
    with mine as (
      select p.*, (p.status = 'published' and (p.closes_at is null or p.closes_at > now())) as is_open
        from public.polls p
        join public.poll_recipients r on r.poll_id = p.id and r.passenger_id = v_pid
       where p.season_id = v_season and p.status in ('published', 'closed')
    )
    select json_build_object(
      'items', coalesce(json_agg(json_build_object(
          'id', m.id, 'title', m.title, 'body', m.body, 'kind', m.kind, 'max_choices', m.max_choices,
          'allow_answer_changes', m.allow_answer_changes,
          'state', case when m.is_open then 'open' else 'closed' end,
          'published_at', m.published_at, 'closes_at', m.closes_at,
          'options', (select json_agg(json_build_object('id', o.id, 'label', o.label) order by o.sort_order, o.id)
                        from public.poll_options o where o.poll_id = m.id),
          'my_response', (select json_build_object('revision', resp.revision,
                                   'option_ids', (select json_agg(c.option_id order by c.option_id) from public.poll_response_choices c
                                                   where c.poll_id = m.id and c.passenger_id = v_pid))
                            from public.poll_responses resp where resp.poll_id = m.id and resp.passenger_id = v_pid))
          order by m.is_open desc, m.closes_at asc nulls last, m.published_at desc, m.id desc), '[]'::json),
      'pending', count(*) filter (where m.is_open and not exists (
                   select 1 from public.poll_responses resp where resp.poll_id = m.id and resp.passenger_id = v_pid)))
      from mine m);
end;
$$;

-- التصويتُ أو تغييرُ الإجابة. الهويّةُ من الجلسة وحدها؛ p_expected_revision = 0 لأوّل إجابة،
-- وإلا رقمُ المراجعة الذي رآه الحاجّ. يردّ:
--   ok (revision, option_ids) · unchanged · stale (المراجعةُ والخياراتُ الحاليّة)
--   · final (allow_answer_changes = false وللحاجّ إجابةٌ مختلفة: تبقى هي) · closed
--   · not_found (ليس في الجمهور أو لا استطلاع) · rate_limited · null (لا جلسة)
-- والخياراتُ غيرُ الصالحة خطأ 22023.
create function public.submit_pilgrim_poll_response(p_token text, p_poll_id bigint, p_option_ids bigint[],
                                                    p_expected_revision integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pid     bigint;
  v_season  bigint;
  p         public.polls%rowtype;
  v_ids     bigint[];
  v_valid   integer;
  v_nopts   integer;
  v_rev     integer;
  v_cur     bigint[];
  v_new     boolean := false;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then return null; end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'رقمُ المراجعة مطلوب.' using errcode = '22023';
  end if;
  if not public.consume_rate_limit('portal-poll', md5('portal-poll:' || v_pid)::uuid, 60, 3600) then
    return json_build_object('status', 'rate_limited');
  end if;

  select season_id into v_season from public.passengers where id = v_pid;
  -- لا يُكشف وجودُ استطلاعٍ ليس للحاجّ: من خارج موسمه أو جمهوره ← not_found
  if not exists (select 1 from public.polls x where x.id = p_poll_id and x.season_id = v_season) then
    return json_build_object('status', 'not_found');
  end if;
  perform public._poll_settle(p_poll_id);   -- مجدوَلٌ حان موعدُه يُجمَّد جمهورُه الآن
  if not exists (select 1 from public.poll_recipients r where r.poll_id = p_poll_id and r.passenger_id = v_pid) then
    return json_build_object('status', 'not_found');
  end if;
  -- ترتيبُ الأقفال: الموسم ثم الاستطلاع (FOR SHARE: التصويتاتُ متوازية، والإغلاقُ ينتظرها)
  perform 1 from public.seasons s where s.id = v_season and s.closed_at is null for share;
  if not found then return json_build_object('status', 'closed'); end if;
  select * into p from public.polls x where x.id = p_poll_id for share;
  if p.status <> 'published' or (p.closes_at is not null and p.closes_at <= now()) then
    return json_build_object('status', 'closed');
  end if;

  v_ids := array(select distinct x from unnest(coalesce(p_option_ids, '{}'::bigint[])) x where x is not null order by 1);
  select count(*) into v_valid from public.poll_options o where o.poll_id = p_poll_id and o.id = any(v_ids);
  select count(*) into v_nopts from public.poll_options o where o.poll_id = p_poll_id;
  if cardinality(v_ids) = 0 or v_valid <> cardinality(v_ids) then
    raise exception 'خياراتٌ غيرُ صالحة لهذا الاستطلاع.' using errcode = '22023';
  end if;
  if (p.kind = 'single' and cardinality(v_ids) <> 1)
     or (p.kind = 'multiple' and cardinality(v_ids) > coalesce(p.max_choices, v_nopts)) then
    raise exception 'عددُ الخيارات لا يوافق نوعَ الاستطلاع.' using errcode = '22023';
  end if;

  select resp.revision into v_rev from public.poll_responses resp
   where resp.poll_id = p_poll_id and resp.passenger_id = v_pid for update;
  if not found then
    if p_expected_revision <> 0 then
      return json_build_object('status', 'stale', 'revision', 0, 'option_ids', '[]'::json);
    end if;
    insert into public.poll_responses (poll_id, passenger_id) values (p_poll_id, v_pid)
    on conflict do nothing;
    if found then
      v_new := true;
      v_rev := 1;
    else
      -- إجابةٌ متزامنةٌ سبقت: تُقرأ مقفولةً كأيّ إجابةٍ قائمة
      select resp.revision into v_rev from public.poll_responses resp
       where resp.poll_id = p_poll_id and resp.passenger_id = v_pid for update;
    end if;
  end if;

  if not v_new then
    v_cur := array(select c.option_id from public.poll_response_choices c
                    where c.poll_id = p_poll_id and c.passenger_id = v_pid order by 1);
    -- الإجابةُ النهائيّة: أوّلُ إجابةٍ ثُبّتت هي الإجابة، من أيّ جهاز، وبأيّ رقم مراجعة. لا يُكتب شيء.
    if not p.allow_answer_changes then
      return json_build_object('status', case when v_cur = v_ids then 'unchanged' else 'final' end,
                               'revision', v_rev, 'option_ids', to_json(v_cur));
    end if;
    if p_expected_revision <> v_rev then
      return json_build_object('status', 'stale', 'revision', v_rev, 'option_ids', to_json(v_cur));
    end if;
    if v_cur = v_ids then
      return json_build_object('status', 'unchanged', 'revision', v_rev, 'option_ids', to_json(v_cur));
    end if;
    v_rev := v_rev + 1;
    update public.poll_responses set revision = v_rev, updated_at = now()
     where poll_id = p_poll_id and passenger_id = v_pid;
    delete from public.poll_response_choices where poll_id = p_poll_id and passenger_id = v_pid;
  end if;

  insert into public.poll_response_choices (poll_id, passenger_id, option_id)
  select p_poll_id, v_pid, x from unnest(v_ids) x;
  insert into public.poll_response_events (poll_id, season_id, passenger_id, revision, option_ids, action)
  values (p_poll_id, v_season, v_pid, v_rev, v_ids, case when v_new then 'submit' else 'change' end);
  return json_build_object('status', 'ok', 'revision', v_rev, 'option_ids', to_json(v_ids));
end;
$$;

-- ── ٧. الموسم: الإقفالُ يُغلق الاستطلاعات (ق٧)، والحذفُ يحذفها ─────────────────
-- الجسدان من آخر تعريفٍ لهما حرفاً (close_season: 20260922120000_v1_baseline · delete_season: 20261010194239_mod001_hotels_foundation)، ولا يتغيّر فيهما إلا ما عُلِّم بـPhase 2.
CREATE OR REPLACE FUNCTION public.close_season(p_new_name text, p_new_hijri_year integer, p_closed_by text, p_actor uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old     bigint;
  v_new     bigint;
  v_name    text := btrim(coalesce(p_new_name, ''));
  v_old_row jsonb;
  v_priced  int;
  v_polls   int;
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

  /* Phase 2 (ق٧) — الاستطلاعاتُ المنشورة والمجدوَلة تُغلق ولقطاتُها تُكتب **قبل** الإقفال وفي
     هذه المعاملة: بعده يرفض المحفّزُ كلَّ كتابة. والإسنادُ في اللقطة إسنادُ هذه اللحظة. */
  v_polls := public._polls_close_for_season(v_old);

  update public.seasons
     set closed_at = now(), closed_by = p_closed_by
   where id = v_old;

  /* لقطة التسعير — قبل إنشاء الموسم الجديد، وفي هذه المعاملة. */
  insert into public.season_pricing_snapshot (season_id, key, label, type, amount)
  select v_old, ps.key, ps.label, ps.type, ps.amount
    from public.pricing_settings ps
  on conflict (season_id, key) do nothing;

  get diagnostics v_priced = row_count;

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
      'polls_closed',          v_polls)
  );

  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_season(p_season_id bigint, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_closed timestamptz;
  v_name   text;
  v_row    jsonb;
  n_pass   bigint;
  n_rooms  bigint;
  n_camps  bigint;
  n_buses  bigint;
  n_flight bigint;
  n_ann    bigint;
  n_pay    bigint;
  n_charge bigint;
  n_fgm    bigint;
  n_fg     bigint;
  n_hotels bigint;
  n_hprice bigint;
  n_notif  bigint;
  n_push   bigint;
  n_sess   bigint;
  n_polls  bigint;
begin
  select closed_at, name, to_jsonb(s) into v_closed, v_name, v_row
    from public.seasons s where s.id = p_season_id for update;

  if v_name is null then
    raise exception 'لا يوجد موسم بالمعرّف %.', p_season_id using errcode = 'P0001';
  end if;
  if v_closed is null then
    raise exception 'موسم % مفتوح — لا يُحذف إلا موسم مقفل.', v_name using errcode = 'P0001';
  end if;

  -- ما سيسقط بـ`on delete cascade` يُعدّ **قبل** الحذف: بعده لا
  -- يبقى ما يُعدّ، والصفّ الملخّص بلا أعداد لا يثبت حجم ما جرى.
  --
  -- والأصنافُ **الثلاثةَ عشرَ كاملة** بعد م٧: سبعةٌ تُحذف بالموسم
  -- مباشرةً — أربعةٌ من م١ والرحلاتُ والتنبيهاتُ والمجموعاتُ
  -- المالية — وستّةٌ تسقط بـ`on delete cascade` من `passengers`.
  select count(*) into n_charge from public.custom_charges c
    join public.passengers pa on pa.id = c.passenger_id  where pa.season_id = p_season_id;
  select count(*) into n_fgm    from public.financial_group_members m
    join public.passengers pa on pa.id = m.passenger_id  where pa.season_id = p_season_id;
  select count(*) into n_notif  from public.notification_deliveries d
    join public.passengers pa on pa.id = d.passenger_id  where pa.season_id = p_season_id;
  select count(*) into n_push   from public.pilgrim_push_subscriptions s
    join public.passengers pa on pa.id = s.passenger_id  where pa.season_id = p_season_id;
  select count(*) into n_sess   from public.pilgrim_sessions ps
    join public.passengers pa on pa.id = ps.passenger_id where pa.season_id = p_season_id;

  /* MOD-001 — أسعارُ الفنادق تسقط بـ`on delete cascade` من `hotels`،
     فتُعدّ قبل الحذف كسائر ما يسقط بالتعاقب. */
  select count(*) into n_hprice from public.hotel_package_prices hp
   where hp.season_id = p_season_id;

  -- الحذف هو الاستثناء الوحيد لـ ث٣: المحفّز يمنع الكتابة على
  -- موسم مقفل، والحذف كتابة. المَنفذ محصور في هذه المعاملة وحدها،
  -- ولا سبيل لفتحه من الواجهة لأن PostgREST لا يمرّر إعدادات جلسة.
  set local app.season_maintenance = 'on';

  -- وراية الإيقاف صفٌّ في جدولٍ لا يبلغه دورٌ تطبيقيّ (B-1) — لا
  -- إعداد جلسة يستطيع أي دور تزويره. تعيش داخل هذه المعاملة وتموت
  -- معها، أُتمّت أم أُجهضت.
  insert into public.audit_suppression (txid) values (txid_current())
    on conflict (txid) do nothing;

  -- الحجاج أولاً: التوابع (الدفعات · الرسوم · التسليمات ·
  -- الاشتراكات · عضويات المجموعات) تسقط بـ on delete cascade
  /* ⚠️ الدفعاتُ تُحذف **صريحاً وقبلَ الحجّاج**. كانت تسقط بـ
     `on delete cascade`، وقد صار المفتاحُ `restrict` في هذه الترحيلةِ
     نفسِها حتى لا يمحو حذفُ حاجٍّ تاريخَه الماليَّ صامتاً. فبغير هذا
     السطرِ يفشل حذفُ الحجّاجِ أدناه.
     وصفوفُ `payment_receipts` **لا تُحذف**: لا مفتاحَ أجنبيّاً لها،
     و`payments.receipt_id` بـ`restrict` يحمي الأبَ لا الابن. فتبقى
     الإيصالاتُ وأرقامُها بعد ذهابِ الموسمِ كلِّه. */
  delete from public.payments p
   using public.passengers pa
   where pa.id = p.passenger_id and pa.season_id = p_season_id;
  get diagnostics n_pay = row_count;

  delete from public.passengers where season_id = p_season_id;
  get diagnostics n_pass = row_count;
  delete from public.rooms where season_id = p_season_id;
  get diagnostics n_rooms = row_count;

  /* MOD-001 — الفنادقُ بعد الحجّاج والغرف لا قبلهم: كلاهما يشير إليها
     بمفتاحٍ مركّبٍ `restrict`. وأسعارُها تسقط معها بـ`on delete cascade`. */
  delete from public.hotels where season_id = p_season_id;
  get diagnostics n_hotels = row_count;
  delete from public.camps where season_id = p_season_id;
  get diagnostics n_camps = row_count;
  delete from public.buses where season_id = p_season_id;
  get diagnostics n_buses = row_count;

  /* م٧ — بعد الحجّاج لا قبلهم: الحاجّ يشير إلى رحلته، فحذف
     الرحلة أولاً كان يصطدم بحارس الإسناد. والتنبيهات تسقط معها
     `notification_deliveries` بـ`on delete cascade`، وقد عُدّت
     أعلاه من جهة الحاجّ — وهي الجهة نفسها إذ الطرفان في الموسم. */
  delete from public.flights where season_id = p_season_id;
  get diagnostics n_flight = row_count;
  delete from public.announcements where season_id = p_season_id;
  get diagnostics n_ann = row_count;

  /* Phase 2 — الاستطلاعاتُ وتوابعُها (الخيارات · الجمهور · الإجابات بالتعاقب)، ولقطاتُها وسجلُّ
     إجاباتها: فيهما بياناتُ حجّاجٍ شخصيّة تذهب مع موسمها. وأحداثُ الإدارة (بلا محتوى) تبقى كسجلّ
     التدقيق. والمفتاحُ إلى المواسم restrict، فهذا السطرُ قبل حذف الموسم. */
  delete from public.poll_result_snapshots where season_id = p_season_id;
  delete from public.poll_response_events where season_id = p_season_id;
  delete from public.polls where season_id = p_season_id;
  get diagnostics n_polls = row_count;

  /* م٧/٣ — وبعد الحجّاج كذلك: عضوياتُهم سقطت معهم، فخلت المجموعاتُ
     وحذفها محفّزُ الخلوّ. ويبقى هذا السطرُ شبكةَ أمانٍ لمجموعةٍ
     نجت من ذلك المسار، فلا يُفشلها المفتاحُ الأجنبيُّ `restrict`. */
  delete from public.financial_groups where season_id = p_season_id;
  get diagnostics n_fg = row_count;

  -- المفتاح الأجنبي restrict هو شبكة الأمان: لو بقي صفّ موسميّ
  -- في جدول أُضيف لاحقاً ونُسي هنا، يفشل هذا السطر بدل أن يُيتَّم
  delete from public.seasons where id = p_season_id;

  delete from public.audit_suppression where txid = txid_current();
  set local app.season_maintenance = 'off';

  perform public.record_season_event(
    p_actor, 'delete', p_season_id, v_row,
    jsonb_build_object('deleted_counts', jsonb_build_object(
      'passengers', n_pass, 'rooms', n_rooms, 'camps', n_camps, 'buses', n_buses,
      'flights', n_flight, 'announcements', n_ann, 'polls', n_polls,
      'financial_groups', n_fg,
      'hotels', n_hotels, 'hotel_package_prices', n_hprice,
      'payments', n_pay, 'custom_charges', n_charge,
      'financial_group_members', n_fgm, 'notification_deliveries', n_notif,
      'pilgrim_push_subscriptions', n_push, 'pilgrim_sessions', n_sess))
  );
end;
$function$;

-- ── ٨. الملكيّةُ والمِنَح ──────────────────────────────────────────────
do $grants$
declare
  v_fn regprocedure;
begin
  foreach v_fn in array array[
      'public._polls_before_write()'::regprocedure,
      'public._poll_children_guard()'::regprocedure,
      'public._poll_append_only()'::regprocedure,
      'public._poll_event(bigint, bigint, text, jsonb)'::regprocedure,
      'public._poll_lock(bigint)'::regprocedure,
      'public._poll_options_json(bigint)'::regprocedure,
      'public._poll_rows(bigint)'::regprocedure,
      'public._poll_labels(bigint)'::regprocedure,
      'public._poll_aggregate(jsonb, jsonb, text, jsonb)'::regprocedure,
      'public._poll_publish(bigint, text)'::regprocedure,
      'public._poll_close(bigint, text)'::regprocedure,
      'public._poll_settle(bigint)'::regprocedure,
      'public._polls_settle_due(integer)'::regprocedure,
      'public._polls_close_for_season(bigint)'::regprocedure,
      'public._poll_validate(bigint, text, text, integer, jsonb, text[], timestamptz)'::regprocedure,
      'public.create_poll(text, text, text, integer, jsonb, text[], timestamptz, boolean)'::regprocedure,
      'public.update_poll(bigint, text, text, text, integer, jsonb, text[], timestamptz, boolean)'::regprocedure,
      'public.publish_poll(bigint, timestamptz)'::regprocedure,
      'public.unschedule_poll(bigint)'::regprocedure,
      'public.close_poll(bigint)'::regprocedure,
      'public.add_poll_recipients(bigint, bigint[])'::regprocedure,
      'public.delete_poll(bigint)'::regprocedure,
      'public.poll_results(bigint, text)'::regprocedure,
      'public.get_poll_snapshot(bigint)'::regprocedure,
      'public.get_pilgrim_polls(text)'::regprocedure,
      'public.submit_pilgrim_poll_response(text, bigint, bigint[], integer)'::regprocedure] loop
    execute format('alter function %s owner to postgres', v_fn);
    -- والامتيازاتُ الافتراضيّة تمنح كلَّ دالّةٍ جديدة: يُسحب، ثم تُمنح الواجهةُ وحدها
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end
$grants$;

-- الإدارة: authenticated، وحارسُها الداخليّ manage_portal
grant execute on function public.create_poll(text, text, text, integer, jsonb, text[], timestamptz, boolean) to authenticated;
grant execute on function public.update_poll(bigint, text, text, text, integer, jsonb, text[], timestamptz, boolean) to authenticated;
grant execute on function public.publish_poll(bigint, timestamptz) to authenticated;
grant execute on function public.unschedule_poll(bigint) to authenticated;
grant execute on function public.close_poll(bigint) to authenticated;
grant execute on function public.add_poll_recipients(bigint, bigint[]) to authenticated;
grant execute on function public.delete_poll(bigint) to authenticated;
grant execute on function public.poll_results(bigint, text) to authenticated;
grant execute on function public.get_poll_snapshot(bigint) to authenticated;
-- البوابة: anon وحده، والهويّةُ من الجلسة
grant execute on function public.get_pilgrim_polls(text) to anon;
grant execute on function public.submit_pilgrim_poll_response(text, bigint, bigint[], integer) to anon;

comment on function public.create_poll(text, text, text, integer, jsonb, text[], timestamptz, boolean) is
  'Phase 2 — مسوّدةُ استطلاع في الموسم النشط (manage_portal). الجمهورُ بمفردات التنبيهات. allow_answer_changes (افتراضاً true) يثبت بالنشر.';
comment on function public.publish_poll(bigint, timestamptz) is
  'Phase 2 — نشرٌ الآن (يُجمَّد الجمهور) أو جدولة (يُجمَّد عند حلول الموعد). manage_portal.';
comment on function public.close_poll(bigint) is
  'Phase 2 — إغلاقٌ يدويّ ولقطةُ النتائج في معاملةٍ واحدة. لا إعادةَ فتح. manage_portal.';
comment on function public.add_poll_recipients(bigint, bigint[]) is
  'Phase 2 — إضافةٌ يدويّة إلى جمهور استطلاعٍ منشورٍ مفتوح (حجّاجٌ مسجَّلون بعد النشر). manage_portal.';
comment on function public.poll_results(bigint, text) is
  'Phase 2 — النتائجُ الحيّة بالإسناد الحاليّ (إجماليّ، أو بتقسيم: bus · camp_mina · camp_arafa · hotel · flight_go · flight_back). أعدادٌ فقط.';
comment on function public.get_poll_snapshot(bigint) is
  'Phase 2 — لقطةُ الإغلاق كما كُتبت، مع تحقّق البصمة. manage_portal.';
comment on function public.get_pilgrim_polls(text) is
  'Phase 2 — استطلاعاتُ الحاجّ من جمهوره المجمَّد وإجابتُه. بلا أعدادٍ ولا بيانات غيره. anon بالجلسة.';
comment on function public.submit_pilgrim_poll_response(text, bigint, bigint[], integer) is
  'Phase 2 — تصويتٌ/تغييرُ إجابة بالجلسة ورقم المراجعة (stale عند التعارض؛ final حين لا يُسمح بالتغيير). anon بالجلسة.';

-- ── ٩. الاستحقاقُ الزمنيّ: مهمّةٌ كلَّ دقيقة ────────────────────────────────
-- مجدوَلٌ حان موعدُه يُنشر، ومنشورٌ انتهى يُغلق بلقطته بإسناد تلك الدقيقة — لا عند أوّل قراءةٍ
-- بعدها. والقراءةُ والتصويتُ يستوفيان الاستحقاقَ قبلها كذلك، فلا تعتمد الصحّةُ على المهمّة.
-- لا تمسّ مهمّةَ M5 ولا دوالَّ الدفع. وبلا pg_cron (تثبيتٌ قديم) يكفي الاستيفاءُ عند الوصول.
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('polls-settle', '* * * * *', 'SELECT public._polls_settle_due(50);');
  end if;
end
$cron$;

-- ── ١٠. شروطٌ لاحقة على ما تملكه هذه الترحيلة وحده (S-38) ─────────────
do $post$
declare
  v_fn  regprocedure;
  v_src text;
  v_t   regclass;
  v_n   integer;
begin
  foreach v_t in array array['public.polls'::regclass, 'public.poll_options'::regclass, 'public.poll_recipients'::regclass,
                             'public.poll_responses'::regclass, 'public.poll_response_choices'::regclass,
                             'public.poll_response_events'::regclass, 'public.poll_admin_events'::regclass,
                             'public.poll_result_snapshots'::regclass] loop
    if not (select relrowsecurity from pg_class where oid = v_t) then
      raise exception 'RLS غير مفعّل على %.', v_t using errcode = 'P0001';
    end if;
    if has_table_privilege('anon', v_t, 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception '% مفتوحٌ لـanon.', v_t using errcode = 'P0001';
    end if;
    if has_table_privilege('authenticated', v_t, 'INSERT,UPDATE,DELETE') then
      raise exception '% قابلٌ للكتابة من authenticated.', v_t using errcode = 'P0001';
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.poll_responses', 'SELECT')
     or has_table_privilege('authenticated', 'public.poll_recipients', 'SELECT')
     or has_table_privilege('authenticated', 'public.poll_response_choices', 'SELECT')
     or has_table_privilege('authenticated', 'public.poll_response_events', 'SELECT')
     or has_table_privilege('authenticated', 'public.poll_result_snapshots', 'SELECT') then
    raise exception 'جداولُ الإجابات واللقطات مقروءةٌ مباشرة.' using errcode = 'P0001';
  end if;

  foreach v_fn in array array[
      'public.create_poll(text, text, text, integer, jsonb, text[], timestamptz, boolean)'::regprocedure,
      'public.update_poll(bigint, text, text, text, integer, jsonb, text[], timestamptz, boolean)'::regprocedure,
      'public.publish_poll(bigint, timestamptz)'::regprocedure,
      'public.unschedule_poll(bigint)'::regprocedure,
      'public.close_poll(bigint)'::regprocedure,
      'public.add_poll_recipients(bigint, bigint[])'::regprocedure,
      'public.delete_poll(bigint)'::regprocedure,
      'public.poll_results(bigint, text)'::regprocedure,
      'public.get_poll_snapshot(bigint)'::regprocedure] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') or not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% يجب أن تكون لـauthenticated (وحارسُها manage_portal) لا لـanon.', v_fn using errcode = 'P0001';
    end if;
    if not exists (select 1 from pg_proc p where p.oid = v_fn and p.prosecdef
                    and p.proconfig @> array['search_path=public, pg_temp']) then
      raise exception '% ليست SECURITY DEFINER بمسار بحثٍ ثابت.', v_fn using errcode = 'P0001';
    end if;
    select prosrc into v_src from pg_proc where oid = v_fn;
    if position('_announcement_admin_guard()' in v_src) = 0 then
      raise exception '% بلا حارس manage_portal.', v_fn using errcode = 'P0001';
    end if;
  end loop;
  foreach v_fn in array array[
      'public.get_pilgrim_polls(text)'::regprocedure,
      'public.submit_pilgrim_poll_response(text, bigint, bigint[], integer)'::regprocedure] loop
    if not has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% لـanon وحده.', v_fn using errcode = 'P0001';
    end if;
    select prosrc into v_src from pg_proc where oid = v_fn;
    if position('_pilgrim_session_owner(p_token)' in v_src) = 0 then
      raise exception '% لا تشتقّ الهويّة من الجلسة.', v_fn using errcode = 'P0001';
    end if;
  end loop;
  foreach v_fn in array array[
      'public._poll_publish(bigint, text)'::regprocedure, 'public._poll_close(bigint, text)'::regprocedure,
      'public._poll_settle(bigint)'::regprocedure, 'public._polls_settle_due(integer)'::regprocedure,
      'public._polls_close_for_season(bigint)'::regprocedure, 'public._poll_rows(bigint)'::regprocedure,
      'public._poll_lock(bigint)'::regprocedure] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception '% داخليّةٌ ومكشوفة.', v_fn using errcode = 'P0001';
    end if;
  end loop;

  -- الموسم: الإقفالُ يُغلق الاستطلاعات، والحذفُ يحذفها؛ والمِنَحُ كما كانت
  select prosrc into v_src from pg_proc where oid = 'public.close_season(text, integer, text, uuid)'::regprocedure;
  if position('public._polls_close_for_season(v_old)' in v_src) = 0
     or position('pricing_snapshot' in v_src) = 0 then
    raise exception 'close_season لا يُغلق الاستطلاعات.' using errcode = 'P0001';
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.delete_season(bigint, uuid)'::regprocedure;
  if position('delete from public.polls where season_id = p_season_id' in v_src) = 0
     or position('delete from public.poll_result_snapshots where season_id = p_season_id' in v_src) = 0 then
    raise exception 'delete_season لا يحذف الاستطلاعات.' using errcode = 'P0001';
  end if;
  if has_function_privilege('authenticated', 'public.close_season(text, integer, text, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.delete_season(bigint, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.close_season(text, integer, text, uuid)', 'EXECUTE') then
    raise exception 'مِنَحُ دوالّ الموسم تغيّرت.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'polls'
                   and column_name = 'allow_answer_changes' and is_nullable = 'NO' and column_default = 'true') then
    raise exception 'polls.allow_answer_changes ليس NOT NULL DEFAULT true.' using errcode = 'P0001';
  end if;
  if (select count(*) from pg_trigger t where t.tgrelid = 'public.polls'::regclass and not t.tgisinternal
        and t.tgname in ('trg_reject_closed_season', 'trg_polls_before_write')) <> 2 then
    raise exception 'محفّزاتُ الاستطلاعات ناقصة.' using errcode = 'P0001';
  end if;
  -- بلا pg_cron لا مهمّة، ولا يُشار إلى cron.job أصلاً (قد لا يوجد): استعلامٌ ديناميكيّ في فرعٍ متداخل
  if to_regprocedure('cron.schedule(text,text,text)') is not null and to_regclass('cron.job') is not null then
    execute 'select count(*) from cron.job where jobname = $1' into v_n using 'polls-settle';
    if v_n <> 1 then
      raise exception 'مهمّةُ polls-settle غيرُ مجدوَلة.' using errcode = 'P0001';
    end if;
  end if;
end
$post$;
