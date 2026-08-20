-- ============================================================
-- س٧ / M1 — جلسة بوابة الحاجّ (بنية إضافية بحتة)
-- ============================================================
-- Security Architecture v1.5 · §٨.١ · الثابت أ١٢ · §٧.٢ نمط البوابة
-- المجهولة · و`S7_IMPLEMENTATION_DESIGN.md` §٣.
--
-- ما تفعله هذه الهجرة: تُنشئ جدول الجلسات والدوال الثماني وتمنحها.
-- **ولا تمسّ مساراً قائماً واحداً.** `get_pilgrim_portal` بتوقيعها
-- القديم، ودالتا التنبيهات القديمتان — كلّها تبقى كما هي منح
-- وسلوكاً. وهذا مقصود: المسار القديم هو **جسر التراجع** أثناء
-- النشر، ولا يُغلق إلا في M2 وبعد اجتياز بوابة القبول (القرار ق٤).
--
-- ═══ لماذا الإصدار من القاعدة لا من دالة حافّية (القرار ق١) ═══
-- إصدار الرمز من دالة `SECURITY DEFINER` يستدعيها `anon` هو الآلية
-- نفسها التي يعمل بها ج٣ منذ س٤. والبديل — دالة Edge ثالثة بـ
-- `verify_jwt=false` — كان يضيف صنفاً جديداً من المداخل المجهولة
-- ويُعيد بناء حدّ المحاولات في مكان ثانٍ. لم يُختَر الأسهل، بل ما
-- لا يوسّع السطح.
--
-- ═══ الرمز ═══
-- ٢٥٦ بت من `extensions.gen_random_bytes` — التخمين مستحيل بالمقدار
-- لا بالسياسة. يُسلَّم **مرّة واحدة** في استجابة الإصدار، و**لا
-- يُخزَّن في القاعدة إطلاقاً**: المخزَّن `sha256` منه، بصمة لا تُعاد
-- إلى أصلها. فلو سُرّبت نسخة من القاعدة، لا يُسكّ منها رمزٌ ولا
-- يُنتحل به أحد.
--
-- ولهذا تُستعمل `extensions.` صراحةً في كل نداء تعمية: `search_path`
-- مثبَّت على `public, pg_temp` منذ س٩، فمخطّط `extensions` ليس فيه.
--
-- ═══ قاعدة المدّة (القرار ق٢) — والتمييز الذي لا يجوز الخلط فيه ═══
-- الصلاحية تنتهي عند **أقرب** خمسة:
--   ١) خمولٌ ٣٠ يوماً        `idle_expires_at` · ينزلق مع الاستعمال
--   ٢) مطلقٌ ٩٠ يوماً        `absolute_expires_at` · **لا يتحرّك أبداً**
--   ٣) إبطالٌ صريح           `revoked_at`
--   ٤) خروج الموسم من النشاط `season_id <> active_season_id()`
--   ٥) حذف الحاجّ            `on delete cascade`
--
-- والطلب المأذون الناجح **يمدّد الخمول ولا يمسّ المطلق**. والتمديد
-- مقيَّد بالبنية لا بانضباط الكاتب:
--     idle_expires_at := least(now() + 30 days, absolute_expires_at)
-- فلا يمكن لعمود الخمول أن يتجاوز المطلق **حسابياً**، مهما تكرّر
-- الاستعمال، ومهما أخطأ من يعدّل هذه الدوال لاحقاً.

-- ------------------------------------------------------------
-- ١) الجدول
-- ------------------------------------------------------------
create table if not exists public.pilgrim_sessions (
  token_hash          bytea       primary key,
  passenger_id        bigint      not null references public.passengers(id) on delete cascade,
  season_id           bigint      not null,
  issued_at           timestamptz not null default now(),
  idle_expires_at     timestamptz not null,
  absolute_expires_at timestamptz not null,
  last_seen_at        timestamptz not null default now(),
  revoked_at          timestamptz,
  /* الحدّ المطلق سقفٌ للخمول — يُفرض في المخطّط لا في الدوال وحدها */
  constraint pilgrim_sessions_idle_within_absolute
    check (idle_expires_at <= absolute_expires_at)
);

comment on table public.pilgrim_sessions is
  'س٧ — جلسات بوابة الحاجّ. يُخزَّن sha256 للرمز لا الرمز. لا يقرؤه ولا يكتبه عميل: service_role وحده عبر دوال SECURITY DEFINER.';
comment on column public.pilgrim_sessions.token_hash is
  'sha256 للرمز الخام. الرمز نفسه لا يوجد في القاعدة إطلاقاً.';
comment on column public.pilgrim_sessions.absolute_expires_at is
  'issued_at + ٩٠ يوماً. لا يُمدَّد بحال — سقفٌ على الخمول المنزلق.';

create index if not exists pilgrim_sessions_passenger_idx
  on public.pilgrim_sessions (passenger_id);

/* قاعدة الأساس الأمني ١: الجدول الجديد لا يرث صلاحيات مجهولة —
   ولا صلاحيات موظّف. لا مسار عميل إلى هذا الجدول أصلاً، لا بسياسة
   ولا بمنح. والوصول من دوال SECURITY DEFINER وحدها. */
alter table public.pilgrim_sessions enable row level security;
revoke all on public.pilgrim_sessions from public, anon, authenticated;
grant all on public.pilgrim_sessions to service_role;

-- ------------------------------------------------------------
-- ٢) المُتحقِّق المشترك — داخليّ، بلا منح
-- ------------------------------------------------------------
-- نقطة واحدة تعرف معنى «جلسة صالحة». كل دالة بوابة تسأل هنا، فلا
-- يتكرّر الفحص في ستّة مواضع تفترق يوماً.
--
-- وهي تُنزلق الخمول بنفسها: القراءة الناجحة **هي** الاستعمال.
create or replace function public._pilgrim_session_owner(p_token text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash bytea;
  v_pid  bigint;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return null;
  end if;

  v_hash := extensions.digest(p_token, 'sha256');

  /* الحدود الأربعة الأولى شرطٌ في التحديث نفسه، والخامس (حذف
     الحاجّ) مفروضٌ بالمفتاح الأجنبي: الصفّ يزول فلا يُطابَق. */
  update public.pilgrim_sessions s
     set idle_expires_at = least(now() + interval '30 days', s.absolute_expires_at),
         last_seen_at    = now()
   where s.token_hash = v_hash
     and s.revoked_at is null
     and now() < s.idle_expires_at
     and now() < s.absolute_expires_at
     and s.season_id = public.active_season_id()
  returning s.passenger_id into v_pid;

  return v_pid;
end;
$$;

comment on function public._pilgrim_session_owner(text) is
  'س٧ — داخليّة. تُرجع صاحب الجلسة إن كانت صالحة، وتُنزلق الخمول دون تجاوز الحدّ المطلق. بلا منح لأي دور عميل.';

revoke execute on function public._pilgrim_session_owner(text)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- ٣) إصدار الجلسة — المسار المجهول الوحيد لتحويل الاعتماد الثابت
-- ------------------------------------------------------------
-- ⚠️ **هذه هي الدالة الوحيدة في النظام كلّه — بعد M2 — التي تحوّل
-- «رقم وثيقة + تاريخ ميلاد» إلى هوية.** وأي دالة أخرى تقبلهما وسيلةَ
-- تفويض عيبٌ معماري (§٨.١).
--
-- الترتيب مقصود وهو نفسه المعتمد في س٦:
--   ١) حدّ المصدر **قبل** أي محاولة إثبات — فلا يستهلك مهاجمٌ حصّة
--      حاجّ حقيقيّ قبل أن نعرف أصلاً إن كانت البيانات صحيحة
--   ٢) الإثبات
--   ٣) حدّ الوثيقة **عند الفشل وحده** — فالحاجّ الصادق لا ينقص
--      رصيده مهما دخل، ولا يستطيع مهاجمٌ حرمانه من بوابته بمجرّد
--      معرفة رقم وثيقته
--
-- والنطاقان `portal-verify-src` و`portal-verify-doc` هما نفسهما
-- المستعملان في `get_pilgrim_portal` منذ س٦ — **دلوٌ واحد لا دلوان**،
-- فلا يكسب المهاجم سقفاً إضافياً بمجرّد أن المسار تغيّر اسمه.
--
-- **Fail closed:** تعذّر العدّاد يمنع. لا تفويض سبق الحدّ هنا،
-- فالحدّ نفسه جزء من الحماية.
create or replace function public.create_pilgrim_session(
  p_doc text, p_day integer, p_month integer, p_year integer
) returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p       public.passengers%ROWTYPE;
  v_matched boolean := false;
  v_nums    text[];
  v_y int; v_m int; v_d int;
  v_xff     text;
  v_src     text;
  v_allowed boolean;
  v_token   text;
  v_now     timestamptz := now();
  v_abs     timestamptz;
  v_idle    timestamptz;
begin
  /* ── حدّ (أ): بالمصدر، قبل أي محاولة إثبات ── */
  begin
    v_xff := coalesce(
      (coalesce(current_setting('request.headers', true), '{}')::json)->>'x-forwarded-for', '');
    v_src := nullif(trim(split_part(v_xff, ',',
               greatest(array_length(string_to_array(v_xff, ','), 1), 1))), '');

    if v_src is not null then
      v_allowed := public.consume_rate_limit(
        'portal-verify-src', md5('src:' || v_src)::uuid, 120, 3600);
      if v_allowed is not true then
        return json_build_object('rate_limited', true);
      end if;
    end if;
  exception when others then
    raise warning 'تعذّر فحص حدّ البوابة بالمصدر: %', sqlerrm;
    return json_build_object('rate_limited', true);
  end;

  /* ── إثبات الهوية: منطق س٦ نفسه بحرفه، ومرشَّحٌ بالموسم النشط ──
     لا يُستدعى `resolve_pilgrim_id` هنا لأنها لا ترشّح بالموسم،
     فقد تُطابق حاجّ موسم مقفل يحمل الرقم نفسه فتُحجب عن صاحبه
     الحقيقيّ في الموسم النشط. */
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

  /* ── حدّ (ب): بالوثيقة، **عند الفشل وحده** ── */
  if not v_matched then
    begin
      v_allowed := public.consume_rate_limit(
        'portal-verify-doc', md5('doc:' || coalesce(trim(p_doc), ''))::uuid, 10, 3600);
    exception when others then
      raise warning 'تعذّر فحص حدّ البوابة بالوثيقة: %', sqlerrm;
      return json_build_object('rate_limited', true);
    end;
    if v_allowed is not true then
      return json_build_object('rate_limited', true);
    end if;
    return null;
  end if;

  /* ── تنظيف انتهازيّ: الجلسات الميتة تُزال عند الإصدار، فلا مسح
     دوريّ ولا نموّ بلا حدّ (نمط `consume_rate_limit`) ── */
  delete from public.pilgrim_sessions
   where absolute_expires_at < v_now
      or idle_expires_at     < v_now
      or revoked_at is not null;

  /* ── الإصدار ── */
  v_token := replace(replace(replace(
               encode(extensions.gen_random_bytes(32), 'base64'),
               '+', '-'), '/', '_'), '=', '');
  v_abs   := v_now + interval '90 days';
  v_idle  := least(v_now + interval '30 days', v_abs);

  insert into public.pilgrim_sessions
    (token_hash, passenger_id, season_id, issued_at, idle_expires_at, absolute_expires_at, last_seen_at)
  values
    (extensions.digest(v_token, 'sha256'), v_p.id, v_p.season_id, v_now, v_idle, v_abs, v_now);

  /* الرمز الخام يخرج من هنا مرّة واحدة، ولا يُكتب في سجلّ ولا عمود */
  return json_build_object(
    'token', v_token,
    'idle_expires_at', v_idle,
    'absolute_expires_at', v_abs
  );
end;
$$;

comment on function public.create_pilgrim_session(text, integer, integer, integer) is
  'س٧ — المسار المجهول الوحيد الذي يحوّل «وثيقة + ميلاد» إلى جلسة. حدّ مصدر قبل الإثبات، وحدّ وثيقة عند الفشل وحده، وكلاهما fail-closed.';

revoke execute on function public.create_pilgrim_session(text, integer, integer, integer)
  from public, authenticated;
grant execute on function public.create_pilgrim_session(text, integer, integer, integer)
  to anon;

-- ------------------------------------------------------------
-- ٤) قراءة ملفّ البوابة بالجلسة
-- ------------------------------------------------------------
-- الإسقاط هو إسقاط س٦ **بحرفه**: قيمٌ منطقية للمستندات لا مفاتيح
-- (ق٦ من س٦)، ولا يتسرّب مفتاح كائن إلى عميل مجهول.
create or replace function public.get_pilgrim_portal_by_session(p_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pid    bigint;
  v_p      public.passengers%ROWTYPE;
  v_result json;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then
    return null;
  end if;

  select * into v_p from public.passengers where id = v_pid;
  if not found then
    return null;
  end if;

  select json_build_object(
    'pilgrim', json_build_object(
      'name_ar', v_p.name_ar, 'short_ar', v_p.short_ar, 'name_en', v_p.name_en,
      'gender', v_p.gender,
      'has_photo',         (nullif(trim(coalesce(v_p.photo_url,'')), '')         is not null),
      'has_hajj_permit',   (nullif(trim(coalesce(v_p.hajj_permit_url,'')), '')   is not null),
      'has_flight_ticket', (nullif(trim(coalesce(v_p.flight_ticket_url,'')), '') is not null),
      'hotel_type', v_p.hotel_type, 'hotel_view', v_p.hotel_view,
      'camp_mina', v_p.camp_mina, 'camp_arafa', v_p.camp_arafa,
      'camp_mina_name', (select c.name from public.camps c where c.id = v_p.camp_mina_id),
      'camp_arafa_name', (select c.name from public.camps c where c.id = v_p.camp_arafa_id),
      'phone', v_p.phone
    ),
    'bus', (select json_build_object('name', b.name, 'type', b.type) from public.buses b where b.id = v_p.bus_id),
    'room', (select json_build_object('number', r.number, 'floor', r.floor, 'type', r.type) from public.rooms r where r.id = v_p.room_id),
    'roommates', case
      when v_p.room_id is not null then
        (select coalesce(json_agg(json_build_object(
          'name', pp.name_ar, 'short_ar', pp.short_ar,
          'room_number', r2.number, 'room_floor', r2.floor,
          'bus_name', b2.name,
          'is_family', (pp.family_id is not null and pp.family_id = v_p.family_id)
        )), '[]'::json)
         from public.passengers pp
         left join public.rooms r2 on r2.id = pp.room_id
         left join public.buses b2 on b2.id = pp.bus_id
         where pp.room_id = v_p.room_id and pp.id <> v_p.id)
      else '[]'::json end,
    'family', case
      when v_p.family_id is not null then
        (select coalesce(json_agg(json_build_object(
          'name', pp.name_ar, 'short_ar', pp.short_ar,
          'gender', pp.gender,
          'room_number', r2.number, 'room_floor', r2.floor,
          'bus_name', b2.name,
          'camp_mina_name', (select c.name from public.camps c where c.id = pp.camp_mina_id),
          'camp_arafa_name', (select c.name from public.camps c where c.id = pp.camp_arafa_id)
        )), '[]'::json)
         from public.passengers pp
         left join public.rooms r2 on r2.id = pp.room_id
         left join public.buses b2 on b2.id = pp.bus_id
         where pp.family_id = v_p.family_id and pp.id <> v_p.id)
      else '[]'::json end,
    'flight_go', (select json_build_object('name', f.name, 'airline', f.airline, 'from_airport', f.from_airport, 'to_airport', f.to_airport, 'date', f.date, 'time', f.time, 'arrival_time', f.arrival_time, 'arrival_date', f.arrival_date, 'class', v_p.flight_class) from public.flights f where f.id = v_p.flight_id),
    'flight_back', (select json_build_object('name', f.name, 'airline', f.airline, 'from_airport', f.from_airport, 'to_airport', f.to_airport, 'date', f.date, 'time', f.time, 'arrival_time', f.arrival_time, 'arrival_date', f.arrival_date, 'class', v_p.flight_class) from public.flights f where f.id = v_p.return_flight_id),
    'config', (select json_build_object(
      'name_ar', c.name_ar, 'logo_url', c.logo_url, 'tagline', c.tagline,
      'color_primary', c.color_primary, 'color_accent', c.color_accent,
      'season_label', c.season_label, 'admin_name', c.admin_name,
      'admin_phone', c.admin_phone, 'admin_whatsapp', c.admin_whatsapp,
      'features', c.features, 'country', c.country, 'city', c.city,
      'hotel_name', c.hotel_name, 'hotel_address', c.hotel_address, 'hotel_url', c.hotel_url,
      'camp_mina_address', c.camp_mina_address, 'camp_mina_url', c.camp_mina_url,
      'camp_arafa_address', c.camp_arafa_address, 'camp_arafa_url', c.camp_arafa_url,
      'portal_welcome_message', c.portal_welcome_message,
      'portal_help_message', c.portal_help_message,
      'portal_settings', c.portal_settings,
      'assets', (select coalesce(jsonb_object_agg(a.asset_key, a.asset_url), '{}'::jsonb)
        from public.company_assets a
        where a.asset_key = any (array['logo', 'portal_banner', 'favicon']))
    ) from public.company_config c order by c.id limit 1),
    'announcements', (select coalesce(json_agg(json_build_object('id', a.id, 'body', a.body, 'priority', a.priority, 'show_at', a.show_at) order by (a.priority = 'عاجل') desc, a.show_at desc), '[]'::json)
      from public.announcements a
      where a.show_at <= now() and (a.expires_at is null or a.expires_at > now()))
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_pilgrim_portal_by_session(text) is
  'س٧ — إسقاط بوابة الحاجّ بالجلسة. نفس إسقاط س٦: قيمٌ منطقية للمستندات لا مفاتيح.';

revoke execute on function public.get_pilgrim_portal_by_session(text) from public, authenticated;
grant execute on function public.get_pilgrim_portal_by_session(text) to anon;

-- ------------------------------------------------------------
-- ٥) إبطال الجلسة — خروجٌ له أثر في الخادم
-- ------------------------------------------------------------
-- تُرجع `true` دائماً: التمييز بين «أُبطلت» و«لا وجود لها» يجعلها
-- مخبراً يفحص صلاحية الرموز.
create or replace function public.revoke_pilgrim_session(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return true;
  end if;

  update public.pilgrim_sessions
     set revoked_at = now()
   where token_hash = extensions.digest(p_token, 'sha256')
     and revoked_at is null;

  return true;
end;
$$;

comment on function public.revoke_pilgrim_session(text) is
  'س٧ — إبطال جلسة البوابة (الخروج). تُرجع true دائماً كي لا تكون مخبراً عن صلاحية الرموز.';

revoke execute on function public.revoke_pilgrim_session(text) from public, authenticated;
grant execute on function public.revoke_pilgrim_session(text) to anon;

-- ------------------------------------------------------------
-- ٦) التحقّق لدوال Edge — بمفتاح الخدمة وحده
-- ------------------------------------------------------------
create or replace function public.verify_pilgrim_session(p_token text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public._pilgrim_session_owner(p_token);
end;
$$;

comment on function public.verify_pilgrim_session(text) is
  'س٧ — تتحقّق من جلسة البوابة وتُرجع صاحبها. لـ`pilgrim-doc` بمفتاح الخدمة وحده — لا يبلغها عميل.';

revoke execute on function public.verify_pilgrim_session(text) from public, anon, authenticated;
grant execute on function public.verify_pilgrim_session(text) to service_role;

-- ------------------------------------------------------------
-- ٧) دوال التنبيهات — بالجلسة لا بالاعتماد الثابت (ف١ · ف٢ · ف٥)
-- ------------------------------------------------------------
-- كانت `register_pilgrim_push` و`mark_pilgrim_notification_read`
-- **مخبرَي هوية بلا أي سقف محاولات**: تُرجعان `false` للاعتماد
-- الخاطئ و`true` للصحيح، بلا حدّ، ودون حاجة إلى اشتراك دفعٍ صالح
-- أصلاً. فكان سقف العشر محاولات الذي بنته س٦ **قابلاً للتجاوز
-- كلّياً** من هذين البابين.
--
-- والعلاج ليس حدّاً ثالثاً بل **إزالة ما يستحقّ المحاولة**: النسخ
-- الجديدة لا تقبل اعتماداً ثابتاً إطلاقاً، فلا تصلح مخبراً — ولا
-- تحتاج سقفاً لأنها لا تجيب عن سؤال المهاجم.
--
-- و`unregister_pilgrim_push` كانت تحذف بالـ`endpoint` وحده بلا
-- إثبات هوية (ف٥): من عرف عنواناً ألغى اشتراكه. صارت تحذف ما
-- يطابق **حاجّ الجلسة** وحده.
--
-- التواقيع القديمة تبقى قائمة هنا — تُسقَط في M2 بعد بوابة القبول.
create or replace function public.register_pilgrim_push(
  p_token      text,
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_platform   text default 'web',
  p_user_agent text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_pid bigint;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then return false; end if;

  insert into public.pilgrim_push_subscriptions
    (passenger_id, endpoint, p256dh, auth, platform, user_agent)
  values
    (v_pid, p_endpoint, p_p256dh, p_auth, coalesce(p_platform, 'web'), p_user_agent)
  on conflict (endpoint) do update set
    passenger_id = excluded.passenger_id,
    p256dh       = excluded.p256dh,
    auth         = excluded.auth,
    platform     = excluded.platform,
    user_agent   = excluded.user_agent,
    last_seen_at = now();

  return true;
end;
$$;

comment on function public.register_pilgrim_push(text, text, text, text, text, text) is
  'س٧ — تسجيل جهاز الحاجّ للتنبيهات بالجلسة. لا تقبل «وثيقة + ميلاد» (إغلاق ف١).';

revoke execute on function public.register_pilgrim_push(text, text, text, text, text, text)
  from public, authenticated;
grant execute on function public.register_pilgrim_push(text, text, text, text, text, text)
  to anon;

create or replace function public.mark_pilgrim_notification_read(
  p_token text, p_announcement_id bigint
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_pid bigint;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then return false; end if;

  insert into public.notification_deliveries (announcement_id, passenger_id, status, read_at)
  values (p_announcement_id, v_pid, 'read', now())
  on conflict (announcement_id, passenger_id) do update
    set read_at = coalesce(notification_deliveries.read_at, now());

  return true;
end;
$$;

comment on function public.mark_pilgrim_notification_read(text, bigint) is
  'س٧ — تعليم التنبيه مقروءاً بالجلسة. لا تقبل «وثيقة + ميلاد» (إغلاق ف٢).';

revoke execute on function public.mark_pilgrim_notification_read(text, bigint)
  from public, authenticated;
grant execute on function public.mark_pilgrim_notification_read(text, bigint)
  to anon;

create or replace function public.unregister_pilgrim_push(
  p_token text, p_endpoint text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_pid bigint;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then return false; end if;

  delete from public.pilgrim_push_subscriptions
   where endpoint = p_endpoint and passenger_id = v_pid;

  return true;
end;
$$;

comment on function public.unregister_pilgrim_push(text, text) is
  'س٧ — إلغاء اشتراك التنبيهات بالجلسة، ولحاجّ الجلسة وحده (إغلاق ف٥).';

revoke execute on function public.unregister_pilgrim_push(text, text)
  from public, authenticated;
grant execute on function public.unregister_pilgrim_push(text, text)
  to anon;
