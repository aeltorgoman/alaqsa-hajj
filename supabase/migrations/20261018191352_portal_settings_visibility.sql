-- ═══════════════════════════════════════════════════════════════════
-- version : 20261018191352
-- name    : portal_settings_visibility
-- ═══════════════════════════════════════════════════════════════════
--
-- M1 — إعداداتُ البوابة الثمانية، ويُحسم الحسّاسُ منها على الخادم.
--
--   flights · rooms · buses · documents · roommates · lost_card
--   · arafat_countdown  ← منطقيّة، الافتراضُ «ظاهر» (كما كان: `!== false`)
--   · photo_visibility  ← all | men | women | none — الافتراضُ none (إخفاءُ الكلّ)
--
-- ‏`notifications` و`pdf_downloads` لم يعودا إعدادَين: التنبيهاتُ ظاهرةٌ دائماً
-- (مستقلّةً عن تفعيل الدفع)، والتنزيلُ يتبع «المستندات».
--
-- ما يُحسم هنا لا في الواجهة:
--   · `get_pilgrim_portal_by_session`:
--       المستنداتُ المخفيّة ← has_hajj_permit / has_flight_ticket = false
--       الصورةُ المخفيّة لجنس الحاجّ ← has_photo = false
--       رفقاءُ الغرفة المخفيّون ← roommates = [] (الأسرةُ ومنى وعرفةُ كما هي)
--       و`config.portal_settings` تُرسَل **بافتراضاتها** (مصدرٌ واحدٌ للافتراض)،
--       ومعها `config.settings_stamp`.
--   · `pilgrim_doc_allowed(pilgrim, doc_type)` — لـservice_role وحده؛ تناديها
--     `pilgrim-doc` قبل التوقيع، فلا يُوقَّع مستندٌ أو صورةٌ مخفيّة ولو طُلبت مباشرة.
--     والإدارةُ لا تمرّ بهذا المسار أصلاً (روابطُها الموقّعة بصلاحيّاتها).
--   · `portal_settings_stamp()` — بصمةُ ما تعرضه البوابةُ من الإعدادات (md5)،
--     لـanon: تسألها البوابةُ المفتوحة كلّ ٢٠ ثانية وتُحدِّث حين تتغيّر. لا تكتب
--     شيئاً (لا تمرّ بالجلسة) ولا تكشف إلّا «تغيّر/لم يتغيّر».
--   · `update_portal_settings` — المفاتيحُ الثمانية وحدها تُحفظ، بأنواعها؛ ونوعٌ
--     خاطئ لمفتاحٍ معروف يُرفض (22023). والمفاتيحُ الأخرى (ومنها القديمان) تُسقط
--     بصمت، فتبقى واجهةُ الإدارة المنشورةُ تحفظ إلى أن تُستبدل (M-51).
--     التوقيعُ والحارسُ (`manage_portal`) والحقولُ الستّة كما هي: لا عمودَ
--     للشركة يُكتب من هنا.
--
-- ⚠️ لا يُمسّ صفّ. الصفُّ المخزَّن يبقى كما هو حتى أوّل حفظ.
-- ⚠️ تغييرُ سلوك مقصود: الصورةُ مخفيّةٌ افتراضاً حتى تختار الإدارة.
-- الترتيب: هذه الترحيلة قبل نشر `pilgrim-doc` الجديدة — بدونها ترفض الدالّةُ
-- الجديدةُ كلَّ مستند (fail-closed)، ولا تكشف شيئاً.
-- التراجع: ترحيلةٌ لاحقةٌ تعيد الأجساد السابقة (M-44).

-- ── أدواتٌ داخليّة: قراءةُ الإعدادات بافتراضاتها ─────────────────
create function public._portal_flag(p_settings jsonb, p_key text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  -- كما كانت الواجهة: غيرُ `false` صراحةً ظاهر
  select (coalesce(p_settings, '{}'::jsonb) -> p_key) is distinct from 'false'::jsonb
$$;

create function public._portal_settings_effective(p_settings jsonb)
returns jsonb
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'flights',          public._portal_flag(p_settings, 'flights'),
    'rooms',            public._portal_flag(p_settings, 'rooms'),
    'buses',            public._portal_flag(p_settings, 'buses'),
    'documents',        public._portal_flag(p_settings, 'documents'),
    'roommates',        public._portal_flag(p_settings, 'roommates'),
    'lost_card',        public._portal_flag(p_settings, 'lost_card'),
    'arafat_countdown', public._portal_flag(p_settings, 'arafat_countdown'),
    'photo_visibility', case when p_settings ->> 'photo_visibility' in ('all', 'men', 'women', 'none')
                             then p_settings ->> 'photo_visibility' else 'none' end)
$$;

create function public._portal_photo_visible(p_settings jsonb, p_gender text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case public._portal_settings_effective(p_settings) ->> 'photo_visibility'
           when 'all'   then true
           when 'men'   then p_gender = 'ذكر'
           when 'women' then p_gender = 'أنثى'
           else false
         end is true
$$;

comment on function public._portal_settings_effective(jsonb) is
  'M1 — إعداداتُ البوابة الثمانية بافتراضاتها: المنطقيّةُ ظاهرةٌ ما لم تكن false، وphoto_visibility = none ما لم تكن all/men/women/none. مصدرُ الافتراض الوحيد.';

-- ── بصمةُ الإعدادات للمزامنة ─────────────────────────────────────
create function public.portal_settings_stamp()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select md5(json_build_array(
           public._portal_settings_effective(c.portal_settings),
           c.portal_welcome_message, c.portal_help_message,
           c.admin_name, c.admin_phone, c.admin_whatsapp)::text)
    from public.company_config c
   order by c.id
   limit 1
$$;

comment on function public.portal_settings_stamp() is
  'M1 — بصمةُ ما تعرضه البوابةُ من إعدادات الحملة. تسألها البوابةُ المفتوحة دوريّاً فتُحدِّث حين تتغيّر. لا تكتب ولا تكشف إلا التغيّر.';

-- ── حارسُ المستند لـpilgrim-doc ──────────────────────────────────
create function public.pilgrim_doc_allowed(p_pilgrim_id bigint, p_doc_type text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_settings jsonb;
  v_gender   text;
begin
  select p.gender into v_gender from public.passengers p where p.id = p_pilgrim_id;
  if not found then
    return false;
  end if;
  select c.portal_settings into v_settings from public.company_config c order by c.id limit 1;
  return case p_doc_type
           when 'photo'         then public._portal_photo_visible(v_settings, v_gender)
           when 'hajj_permit'   then public._portal_flag(v_settings, 'documents')
           when 'flight_ticket' then public._portal_flag(v_settings, 'documents')
           else false
         end;
end;
$$;

comment on function public.pilgrim_doc_allowed(bigint, text) is
  'M1 — هل تسمح إعداداتُ البوابة بأن يُوقَّع لهذا الحاجّ هذا النوعُ (photo · hajj_permit · flight_ticket)؟ لـpilgrim-doc بمفتاح الخدمة وحده. غيرُ ذلك false.';

-- ── الحفظ: المفاتيحُ الثمانية وحدها، بأنواعها ───────────────────
create or replace function public.update_portal_settings(
  p_portal_settings jsonb, p_portal_welcome_message text, p_portal_help_message text,
  p_admin_name text, p_admin_phone text, p_admin_whatsapp text)
returns public.company_config
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row   public.company_config;
  v_in    jsonb := coalesce(p_portal_settings, '{}'::jsonb);
  v_clean jsonb;
  v_key   text;
begin
  if not public.has_permission('manage_portal') then
    raise exception 'ليست لديك صلاحية إدارة بوابة الحاج.'
      using errcode = '42501';
  end if;

  /* M1 — لا يُحفظ إلا ما تعرفه البوابة، وبنوعه. والمقارناتُ آمنةٌ من NULL
     (`is distinct from`، و`coalesce(…, false)`): مقارنةٌ مجهولةُ النتيجة لا
     تُسقط الرفض أبداً — فـ`null` في JSON لمفتاحٍ معروفٍ مرفوضٌ كأيّ نوعٍ خاطئ.
     والرفضُ استثناءٌ قبل التحديث: لا يُحفظ شيءٌ من الطلب، ولا جزءٌ منه. */
  if jsonb_typeof(v_in) is distinct from 'object' then
    raise exception 'إعداداتُ البوابة غير صالحة.' using errcode = '22023';
  end if;
  foreach v_key in array array['flights','rooms','buses','documents','roommates','lost_card','arafat_countdown'] loop
    if v_in ? v_key and jsonb_typeof(v_in -> v_key) is distinct from 'boolean' then
      raise exception 'قيمةُ الإعداد % غير صالحة.', v_key using errcode = '22023';
    end if;
  end loop;
  if v_in ? 'photo_visibility'
     and (jsonb_typeof(v_in -> 'photo_visibility') is distinct from 'string'
          or not coalesce(v_in ->> 'photo_visibility' in ('all', 'men', 'women', 'none'), false)) then
    raise exception 'قيمةُ إعداد ظهور الصورة غير صالحة.' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_clean
    from jsonb_each(v_in) e
   where e.key in ('flights','rooms','buses','documents','roommates','lost_card','arafat_countdown','photo_visibility');

  update public.company_config
     set portal_settings        = v_clean,
         portal_welcome_message = p_portal_welcome_message,
         portal_help_message    = p_portal_help_message,
         admin_name             = p_admin_name,
         admin_phone            = p_admin_phone,
         admin_whatsapp         = p_admin_whatsapp
   where id = 1
  returning * into v_row;

  if not found then
    raise exception 'لا يوجد صفّ إعدادات للحملة.'
      using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.update_portal_settings(jsonb, text, text, text, text, text) is
  'إعداداتُ بوابة الحاج — البابُ الوحيد لـmanage_portal إلى company_config. ستّةُ حقولٍ معلَنةٌ في التوقيع، والحارسُ داخل الجسم، والصفُّ المعاد برهانُ الأثر. M1: portal_settings تُحفظ بمفاتيحها الثمانية وحدها وبأنواعها (22023 لنوعٍ خاطئ)، وما سواها يُسقط. ولا تُوسَّع سياسةُ الجدول.';

-- ── ملفُّ البوابة: الحسّاسُ المخفيُّ لا يُرسَل ──────────────────
create or replace function public.get_pilgrim_portal_by_session(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
  v_unknown  bigint[];
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

  /* H2 — نوعُ جمهورٍ لا يُعرف لا يُعرض لأحد (fail-closed)، ويُسجَّل في
     سجلّ الخادم بمعرّفاته وحدها — لا نصَّ ولا عنوان — ليُشخَّص ولا يُكشف.
     ‏`RAISE LOG` لا يصل إلى العميل (client_min_messages = notice). */
  select array_agg(a.id order by a.id) into v_unknown
    from public.announcements a
   where a.season_id = v_p.season_id
     and a.show_at <= now() and (a.expires_at is null or a.expires_at > now())
     and a.target_type not in ('all', 'bus', 'camp_mina', 'camp_arafa', 'custom');
  if v_unknown is not null then
    raise log 'portal announcements: unknown target_type hidden (fail-closed), season %, announcement ids %',
      v_p.season_id, v_unknown;
  end if;

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
    /* م٧ — شرط الموسم. H2 — وشرطُ الجمهور: ما وُجّه إلى هذا الحاجّ وحده،
       بالأنواع نفسها التي يُرسَل بها الدفع (`announcement_audience`):
       الكلّ، أو باصُه، أو مخيّمُه في منى أو عرفة، أو هو بعينه. وغيرُها لا أحد. */
    'announcements', (select coalesce(json_agg(json_build_object('id', a.id, 'body', a.body, 'priority', a.priority, 'show_at', a.show_at) order by (a.priority = 'عاجل') desc, a.show_at desc), '[]'::json)
      from public.announcements a
      where a.season_id = v_p.season_id
        and a.show_at <= now() and (a.expires_at is null or a.expires_at > now())
        and case a.target_type
              when 'all'        then true
              when 'bus'        then v_p.bus_id        = any(a.target_ids)
              when 'camp_mina'  then v_p.camp_mina_id  = any(a.target_ids)
              when 'camp_arafa' then v_p.camp_arafa_id = any(a.target_ids)
              when 'custom'     then v_p.id            = any(a.target_ids)
              else false
            end is true)
  ) into v_result;

  return v_result;
end;
$$;

-- ── المِنَح ──────────────────────────────────────────────────────
alter function public._portal_flag(jsonb, text) owner to postgres;
alter function public._portal_settings_effective(jsonb) owner to postgres;
alter function public._portal_photo_visible(jsonb, text) owner to postgres;
alter function public.portal_settings_stamp() owner to postgres;
alter function public.pilgrim_doc_allowed(bigint, text) owner to postgres;
revoke all on function public._portal_flag(jsonb, text) from public, anon, authenticated;
revoke all on function public._portal_settings_effective(jsonb) from public, anon, authenticated;
revoke all on function public._portal_photo_visible(jsonb, text) from public, anon, authenticated;
revoke all on function public.portal_settings_stamp() from public, authenticated;
grant execute on function public.portal_settings_stamp() to anon, service_role;
revoke all on function public.pilgrim_doc_allowed(bigint, text) from public, anon, authenticated;
grant execute on function public.pilgrim_doc_allowed(bigint, text) to service_role;

-- ── شروطٌ لاحقة على ما تملكه هذه الترحيلة وحده (S-38) ─────────────
do $post$
declare
  v_fn regprocedure;
  v_d  jsonb := public._portal_settings_effective(null);
begin
  foreach v_fn in array array[
      'public.portal_settings_stamp()'::regprocedure,
      'public.pilgrim_doc_allowed(bigint, text)'::regprocedure,
      'public.update_portal_settings(jsonb, text, text, text, text, text)'::regprocedure,
      'public.get_pilgrim_portal_by_session(text)'::regprocedure] loop
    if not exists (select 1 from pg_proc p where p.oid = v_fn and p.prosecdef
                    and p.proconfig @> array['search_path=public, pg_temp']) then
      raise exception '% ليست SECURITY DEFINER بـsearch_path ثابت.', v_fn using errcode = 'P0001';
    end if;
  end loop;

  -- المِنَح: من يبلغ ماذا
  if not has_function_privilege('anon', 'public.get_pilgrim_portal_by_session(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_pilgrim_portal_by_session(text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.portal_settings_stamp()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.portal_settings_stamp()', 'EXECUTE')
     or has_function_privilege('anon', 'public.pilgrim_doc_allowed(bigint, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.pilgrim_doc_allowed(bigint, text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.pilgrim_doc_allowed(bigint, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_portal_settings(jsonb, text, text, text, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.update_portal_settings(jsonb, text, text, text, text, text)', 'EXECUTE') then
    raise exception 'مِنَحُ دوالّ إعدادات البوابة ليست كما يجب.' using errcode = 'P0001';
  end if;
  foreach v_fn in array array[
      'public._portal_flag(jsonb, text)'::regprocedure,
      'public._portal_settings_effective(jsonb)'::regprocedure,
      'public._portal_photo_visible(jsonb, text)'::regprocedure] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% داخليّةٌ وقابلةٌ للتنفيذ من دور عميل.', v_fn using errcode = 'P0001';
    end if;
  end loop;

  -- الافتراضات
  if v_d <> '{"flights":true,"rooms":true,"buses":true,"documents":true,"roommates":true,"lost_card":true,"arafat_countdown":true,"photo_visibility":"none"}'::jsonb then
    raise exception 'افتراضاتُ إعدادات البوابة غير متوقَّعة: %', v_d using errcode = 'P0001';
  end if;
  if public._portal_photo_visible('{}', 'ذكر') or not public._portal_photo_visible('{"photo_visibility":"men"}', 'ذكر')
     or public._portal_photo_visible('{"photo_visibility":"men"}', 'أنثى') or not public._portal_photo_visible('{"photo_visibility":"women"}', 'أنثى')
     or public._portal_photo_visible('{"photo_visibility":"bogus"}', 'ذكر') then
    raise exception '_portal_photo_visible لا تطابق القاعدة.' using errcode = 'P0001';
  end if;

  -- التحقّقُ الآمنُ من NULL في الجسد المطبَّق فعلاً
  if position('jsonb_typeof(v_in -> v_key) is distinct from ''boolean''' in (select prosrc from pg_proc where oid = 'public.update_portal_settings(jsonb, text, text, text, text, text)'::regprocedure)) = 0
     or position('jsonb_typeof(v_in -> ''photo_visibility'') is distinct from ''string''' in (select prosrc from pg_proc where oid = 'public.update_portal_settings(jsonb, text, text, text, text, text)'::regprocedure)) = 0 then
    raise exception 'تحقّقُ أنواع إعدادات البوابة ليس آمناً من NULL.' using errcode = 'P0001';
  end if;

  -- الحارسُ في الجسد المطبَّق فعلاً
  if position('v_mates_ok then' in (select prosrc from pg_proc where oid = 'public.get_pilgrim_portal_by_session(text)'::regprocedure)) = 0 then
    raise exception 'حارسُ رفقاء الغرفة غائبٌ عن get_pilgrim_portal_by_session.' using errcode = 'P0001';
  end if;
end
$post$;
