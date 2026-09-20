-- ============================================================
-- ترحيل التنظيف (PR B) — إسقاطُ أعمدة الإرث من `company_config`
-- ============================================================
-- المرحلةُ السابقة (PR #122) نقلت السلطةَ ولم تهدم المصدرَ القديم
-- عمداً: `seasons` صارت تملك الاسمَ والسنةَ والأماكن، و`portal_settings`
-- صارت مرجعَ ظهور أقسام البوابة، و`company_assets` صارت مرجعَ الأصول.
-- وبقيت الأعمدةُ القديمةُ أعمدةَ توافقٍ مجمَّدةً حتى يُثبَت أن لا
-- قارئَ لها. هذا الترحيلُ يُسقطها بعد أن ثبت ذلك.
--
-- ⚠️ ولا `cascade` في هذا الملفّ بحال. الإسقاطُ المتتالي يحذف ما لم
-- نره، وما لم نره هو بالضبط ما نخاف منه. فإن تعلّق بالعمود شيءٌ لم
-- نحسبه، فليقف الترحيلُ بخطأ صريح.
--
-- والترحيلُ كلُّه معاملةٌ واحدة: إمّا أن يتمّ، أو لا يتغيّر شيء.

begin;

-- ════════════════════════════════════════════════════════════
-- ١) شروطٌ مسبقةٌ على البيانات — البرهانُ قبل الهدم
-- ════════════════════════════════════════════════════════════
-- كلُّ فحصٍ هنا يجيب سؤالاً واحداً: «هل يضيع بهذا الإسقاط معنًى لا
-- يحمله المصدرُ الجديد؟». والجوابُ لا يُفترض، يُقرأ من الصفوف.

do $$
declare
  v_cfg   public.company_config%rowtype;
  v_logo  text;
  v_bann  text;
  v_open  public.seasons%rowtype;
begin
  select * into v_cfg from public.company_config where id = 1;
  if not found then
    raise exception 'لا صفَّ إعداداتٍ (id=1) — حالةٌ غيرُ متوقَّعة، أوقِف الترحيل.';
  end if;

  /* ── أ) الأصول: الشعارُ والغلاف ────────────────────────────
     شرطُ الإسقاط أن يكون لكلّ رابطٍ قديمٍ **غيرِ فارغ** صفٌّ مقابلٌ
     في `company_assets`. ولا يُشترط تطابقُ النصّ: المديرُ قد يكون
     بدّل الشعارَ بعد المرحلة السابقة، فالجديدُ هو الصحيح. المطلوبُ
     ألّا يذهب العمودُ ولا بديلَ له. */
  select nullif(trim(asset_url), '') into v_logo
    from public.company_assets where asset_key = 'logo';
  select nullif(trim(asset_url), '') into v_bann
    from public.company_assets where asset_key = 'dashboard_banner';

  if nullif(trim(coalesce(v_cfg.logo_url, '')), '') is not null and v_logo is null then
    raise exception 'شعارُ الحملة في `company_config.logo_url` ولا صفَّ `logo` في `company_assets` — الإسقاطُ يُفقده. أوقِف الترحيل.';
  end if;
  if nullif(trim(coalesce(v_cfg.banner_image_url, '')), '') is not null and v_bann is null then
    raise exception 'غلافُ اللوحة في `company_config.banner_image_url` ولا صفَّ `dashboard_banner` في `company_assets` — الإسقاطُ يُفقده. أوقِف الترحيل.';
  end if;

  /* ── ب) الموسمُ المفتوح يحمل ما كانت تحمله الحملة ──────────
     ⚠️ والفحصُ على **الموسم المفتوح وحده** عمداً. المواسمُ المؤرشفةُ
     لا يُطلب منها أن تحمل قيمَ الحملة الحاليّة، بل يُمنع ذلك: استيكرُ
     موسمٍ مضى يحمل فندقَ ذلك الموسم أو لا يحمل شيئاً — ولا يرث أبداً
     فندقَ الموسم الجاري. فغيابُ القيمة في المؤرشف صوابٌ لا نقص. */
  select * into v_open from public.seasons where closed_at is null order by id limit 1;
  if not found then
    raise exception 'لا موسمَ مفتوح — لا مرجعَ يُتحقَّق منه. أوقِف الترحيل.';
  end if;

  if nullif(trim(coalesce(v_cfg.season_label, '')), '') is not null
     and nullif(trim(coalesce(v_open.name, '')), '') is null then
    raise exception 'اسمُ الموسم المفتوح فارغ و`season_label` ليست فارغة — الإسقاطُ يُفقد اسمَ الموسم. أوقِف الترحيل.';
  end if;

  if nullif(trim(coalesce(v_cfg.hotel_name, '')), '') is not null
     and nullif(trim(coalesce(v_open.hotel_name, '')), '') is null then
    raise exception 'اسمُ الفندق في `company_config` ولا يقابله شيء في الموسم المفتوح. أوقِف الترحيل.';
  end if;
  if nullif(trim(coalesce(v_cfg.hotel_address, '')), '') is not null
     and nullif(trim(coalesce(v_open.hotel_address, '')), '') is null then
    raise exception 'عنوانُ الفندق في `company_config` ولا يقابله شيء في الموسم المفتوح. أوقِف الترحيل.';
  end if;
  if nullif(trim(coalesce(v_cfg.hotel_url, '')), '') is not null
     and nullif(trim(coalesce(v_open.hotel_url, '')), '') is null then
    raise exception 'رابطُ الفندق في `company_config` ولا يقابله شيء في الموسم المفتوح. أوقِف الترحيل.';
  end if;
  if nullif(trim(coalesce(v_cfg.camp_mina_address, '')), '') is not null
     and nullif(trim(coalesce(v_open.mina_address, '')), '') is null then
    raise exception 'عنوانُ منى في `company_config` ولا يقابله شيء في الموسم المفتوح. أوقِف الترحيل.';
  end if;
  if nullif(trim(coalesce(v_cfg.camp_mina_url, '')), '') is not null
     and nullif(trim(coalesce(v_open.mina_url, '')), '') is null then
    raise exception 'رابطُ منى في `company_config` ولا يقابله شيء في الموسم المفتوح. أوقِف الترحيل.';
  end if;
  if nullif(trim(coalesce(v_cfg.camp_arafa_address, '')), '') is not null
     and nullif(trim(coalesce(v_open.arafa_address, '')), '') is null then
    raise exception 'عنوانُ عرفة في `company_config` ولا يقابله شيء في الموسم المفتوح. أوقِف الترحيل.';
  end if;
  if nullif(trim(coalesce(v_cfg.camp_arafa_url, '')), '') is not null
     and nullif(trim(coalesce(v_open.arafa_url, '')), '') is null then
    raise exception 'رابطُ عرفة في `company_config` ولا يقابله شيء في الموسم المفتوح. أوقِف الترحيل.';
  end if;

end $$;

-- ════════════════════════════════════════════════════════════
-- ٢) دالّةُ البوابة — يسقط `logo_url` من إسقاط `config`
-- ════════════════════════════════════════════════════════════
-- نُقلت بحرفها من التعريف القائم، ولم يتغيّر فيها إلا مفتاحٌ واحد:
-- `'logo_url', c.logo_url` خرج. والعميلُ يقرأ `assets.logo` وهي
-- موجودةٌ في الحمولة أصلاً، فلا يفقد شعارَ البوابة شيئاً.
create or replace function public.get_pilgrim_portal_by_session(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

    /* موسمُ الحاجّ — اسمُه وأماكنُه. لا `company_config` ولا
       «الموسم النشط»: الصفُّ الذي ينتمي إليه الحاجّ نفسُه. */
    'season', (select json_build_object(
        'name',          s.name,
        'hijri_year',    s.hijri_year,
        'hotel_name',    s.hotel_name,
        'hotel_address', s.hotel_address,
        'hotel_url',     s.hotel_url,
        'mina_address',  s.mina_address,
        'mina_url',      s.mina_url,
        'arafa_address', s.arafa_address,
        'arafa_url',     s.arafa_url)
      from public.seasons s where s.id = v_p.season_id),

    /* ⚠️ لا `logo_url` هنا. شعارُ البوابة يأتي في `assets.logo`
       أدناه، ومصدرُه `company_assets` وحدها. */
    'config', (select json_build_object(
      'name_ar', c.name_ar, 'tagline', c.tagline,
      'color_primary', c.color_primary, 'color_accent', c.color_accent,
      'admin_name', c.admin_name,
      'admin_phone', c.admin_phone, 'admin_whatsapp', c.admin_whatsapp,
      'country', c.country, 'city', c.city,
      'portal_welcome_message', c.portal_welcome_message,
      'portal_help_message', c.portal_help_message,
      'portal_settings', c.portal_settings,
      'assets', (select coalesce(jsonb_object_agg(a.asset_key, a.asset_url), '{}'::jsonb)
        from public.company_assets a
        where a.asset_key = any (array['logo', 'portal_banner', 'favicon']))
    ) from public.company_config c order by c.id limit 1),
    /* م٧ — شرط الموسم. */
    'announcements', (select coalesce(json_agg(json_build_object('id', a.id, 'body', a.body, 'priority', a.priority, 'show_at', a.show_at) order by (a.priority = 'عاجل') desc, a.show_at desc), '[]'::json)
      from public.announcements a
      where a.season_id = v_p.season_id
        and a.show_at <= now() and (a.expires_at is null or a.expires_at > now()))
  ) into v_result;

  return v_result;
end;
$function$;

-- ════════════════════════════════════════════════════════════
-- ٣) الإسقاطُ العلنيّ — هويّةٌ وألوانٌ ولا شيء غيرهما
-- ════════════════════════════════════════════════════════════
-- هذا العرضُ يقرؤه `anon` قبل تسجيل الدخول. فما لا تحتاجه شاشةُ
-- الدخول لا مكانَ له فيه:
--   · `logo_url` و`banner_image_url` — سقطتا مع العمودين، والشعارُ
--     يأتي لغير المصادَق من `company_assets` بسياسة القراءة العلنيّة.
--   · `banner_position` و`banner_position_x` — تخطيطُ غلافِ لوحةٍ
--     لا يراها إلا مصادَق، فلا سبب لنشرها. وغيابُهما يعود إلى
--     الافتراضين في `normalizeCompanyProfile` بلا أثر.
-- ولا بنوكَ ولا سجلَّ تجاريّاً ولا إعداداتِ بوابةٍ إداريّة، ولا
-- `season_label` ولا `features` ولا أماكنَ موسم.
--
-- ⚠️ `create or replace view` لا تستطيع إسقاط عمود (42P16)، فالعرضُ
-- يُسقَط ويُنشَأ. وبلا `cascade`: لا شيء يعتمد عليه اليوم، ولو تعلّق
-- به شيءٌ غداً فليفشل الترحيلُ بدل أن يحذفه.
drop view if exists public.company_profile_public;

create view public.company_profile_public
  with (security_invoker = false)
as
  select
    id,
    name_ar,
    name_en,
    tagline,
    color_primary,
    color_accent,
    color_sidebar
  from public.company_config
  where id = 1;

/* ⚠️ في هذه القاعدة `alter default privileges` لدور postgres على
   علاقات `public` يمنح `arwdDxtm` كاملةً لـ`authenticated` و
   `service_role` لكلّ علاقةٍ تُنشأ. والعرضُ قابلٌ للتحديث تلقائياً
   و`security_invoker = false`، فلولا السحبُ الصريح لوُلد ومعه بابُ
   كتابةٍ إلى `company_config` يتجاوز RLS. */
revoke all on public.company_profile_public from public, anon, authenticated;
grant select on public.company_profile_public to anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- ٤) فحصُ التوابع — بعد أن أُعيد بناءُ كلِّ ما نملكه
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_n     integer;
  v_names text;
begin
  /* ── ج) لا تابعَ في القاعدة غيرَ ما نعيد بناءه بأنفسنا ─────
     `pg_depend` يرى العروضَ والقيودَ والفهارسَ والأعمدةَ المولَّدة.
     وقد أُعيد بناءُ العرض في الخطوة ٣ قبل هذا الفحص، فلم يبقَ أن
     يتعلّق بالعمود شيء. وما يُعثر عليه هنا هو بالضبط ما كان
     `cascade` سيحذفه بصمت. */
  select count(*), coalesce(string_agg(distinct d.classid::regclass::text, '، '), '')
    into v_n, v_names
  from pg_attribute a
  join pg_depend d
    on d.refobjid = a.attrelid and d.refobjsubid = a.attnum
  where a.attrelid = 'public.company_config'::regclass
    and a.attname in ('season_label','hotel_name','hotel_address','hotel_url',
                      'camp_mina_address','camp_mina_url','camp_arafa_address','camp_arafa_url',
                      'features','logo_url','banner_image_url')
    and d.deptype <> 'a';   -- 'a' = القيمةُ الافتراضية، تسقط مع عمودها

  if v_n > 0 then
    raise exception 'ما زال % تابعاً يتعلّق بأعمدة الإرث (%) — لا إسقاطَ بلا مراجعة.', v_n, v_names;
  end if;

  /* ── د) لا دالّةَ في `public` ما زالت تذكر عموداً منها ──────
     `pg_depend` لا يرى أجسادَ دوالّ plpgsql، فيُقرأ النصُّ نفسُه.
     والفحصُ على `c.<عمود>` تحديداً — وهي الصيغةُ التي تُقرأ بها
     أعمدةُ الحملة في دوالّنا — فلا يخلط بينها وبين `s.hotel_name`
     في صفّ الموسم ولا بين مُعامِلات `p_hotel_name`. */
  select count(*), coalesce(string_agg(p.proname, '، '), '') into v_n, v_names
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and (
      /* أسماءٌ لا تشترك مع جدولٍ آخر — تُفحص بحدّ الكلمة وحده */
      p.prosrc ~ '\m(season_label|camp_mina_address|camp_mina_url|camp_arafa_address|camp_arafa_url|logo_url|banner_image_url)\M'
      /* وأسماءٌ يحملها `seasons` أيضاً — تُفحص بالمؤهِّل `c.` وحده،
         وهو ما تُقرأ به أعمدةُ الحملة في دوالّنا، فلا يُخلَط بينها
         وبين `s.hotel_name` ولا مُعامِلات `p_hotel_name`. */
      or p.prosrc ~ 'c\.(hotel_name|hotel_address|hotel_url|features)\M'
    );

  if v_n > 0 then
    raise exception 'دوالٌّ ما زالت تقرأ أعمدةَ الإرث: % — صحّحها قبل الإسقاط.', v_names;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
-- ٥) الإسقاط — عموداً عموداً، وبلا `cascade`
-- ════════════════════════════════════════════════════════════
-- بيانُ الموسم: صار في `seasons` (اسماً وسنةً وأماكن).
alter table public.company_config drop column season_label;
alter table public.company_config drop column hotel_name;
alter table public.company_config drop column hotel_address;
alter table public.company_config drop column hotel_url;
alter table public.company_config drop column camp_mina_address;
alter table public.company_config drop column camp_mina_url;
alter table public.company_config drop column camp_arafa_address;
alter table public.company_config drop column camp_arafa_url;

-- ظهورُ أقسام البوابة: صار في `portal_settings` وحدها.
alter table public.company_config drop column features;

-- أصولُ الحملة: صارت في `company_assets` وحدها.
alter table public.company_config drop column logo_url;
alter table public.company_config drop column banner_image_url;

-- ════════════════════════════════════════════════════════════
-- ٦) تحقّقٌ بعديّ — الترحيلُ يشهد على نفسه
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_left integer;
begin
  select count(*) into v_left
  from information_schema.columns
  where table_schema = 'public' and table_name = 'company_config'
    and column_name in ('season_label','hotel_name','hotel_address','hotel_url',
                        'camp_mina_address','camp_mina_url','camp_arafa_address','camp_arafa_url',
                        'features','logo_url','banner_image_url');
  if v_left <> 0 then
    raise exception 'بقي % عموداً من أعمدة الإرث بعد الإسقاط.', v_left;
  end if;

  /* الأعمدةُ التي يجب أن تبقى — لئلّا يكون الإسقاطُ قد جاوز حدَّه */
  select count(*) into v_left
  from information_schema.columns
  where table_schema = 'public' and table_name = 'company_config'
    and column_name in ('name_ar','name_en','tagline','color_primary','color_accent','color_sidebar',
                        'contact_phone','contact_email','country','city',
                        'bank_name','bank_account_name','bank_account_number','bank_iban','bank_swift',
                        'commercial_registration','portal_settings','portal_welcome_message',
                        'portal_help_message','admin_name','admin_phone','admin_whatsapp',
                        'banner_position','banner_position_x');
  if v_left <> 24 then
    raise exception 'أعمدةُ `company_config` الباقية % لا 24 — راجِع قبل الإتمام.', v_left;
  end if;
end $$;

commit;
