-- ═══════════════════════════════════════════════════════════════
-- م٧ — الرحلات والتنبيهات تصير موسميّة
-- المرحلة الأخيرة من معمارية المواسم (Issue #42) — تُغلق #40.
-- ═══════════════════════════════════════════════════════════════
-- بعد م١–م٦ بقي جدولان يشيران إلى الموسم بلا أن يعرفاه:
--
--   `flights`        سجلّ تشغيليّ مملوك للموسم — رحلة 1446 ليست
--                    رحلة 1447، والتشابه في الاسم لا يجعلهما واحدة.
--   `announcements`  رسالةٌ إلى حجّاج موسمٍ بعينه. وكانت البوابة
--                    ترشّحها بالنافذة الزمنية وحدها، فتنبيهٌ بلا
--                    `expires_at` (وهي اختيارية) يبقى ظاهراً
--                    **لحجّاج الموسم التالي** إلى الأبد.
--
-- والملف كله قابل لإعادة التشغيل.
--
-- ═══ ما لا يفعله هذا الترحيل ═══
-- · **لا يستنسخ رحلات إلى الموسم الجديد.** الموسم الجديد يبدأ بلا
--   رحلات — فرحلة موسمٍ مضى ليست قالباً، ونسخُها كان سيصنع بيانات
--   تشغيل لم يُدخلها أحد. `close_season` لم تُمسّ هنا.
-- · لا يُلفَّق انتماءٌ تاريخيّ (البند ٠ أدناه).
-- · لا تنبيهات عابرة للمواسم ولا تنبيه «عامّ»: كل تنبيه لموسمٍ
--   واحدٍ بالضبط، بحكم `not null`.
-- · لا يمسّ الجمهور (`target_type`/`target_ids`) ولا النافذة
--   الزمنية (`show_at`/`expires_at`) — و`expires_at` تبقى اختيارية،
--   وعزل الموسم **لا يعتمد عليها** بحال.


-- ------------------------------------------------------------
-- ٠) التعبئة — بصوتٍ مسموع لا بتخمين
-- ------------------------------------------------------------
-- الصفوف القائمة لا تحمل موسماً، ولا عمود فيها يدلّ عليه: لا
-- `passenger_id` تُشتقّ منه (كنمط `_derived`)، ولا تاريخ إنشاءٍ
-- يُقارَن بحدود المواسم اعتماداً (فـ`created_at` قد يكون فارغاً،
-- والحدّ الزمنيّ لا يُثبت ملكيّة).
--
-- فالقاعدة الوحيدة الآمنة: **موسمٌ واحدٌ في القاعدة ⇒ لا احتمال
-- غيره**. وأكثر من موسم مع وجود صفوف ⇒ الجواب غير معروف، ولا
-- يُخمَّن — يفشل الترحيل ويُترك التوزيع لقرار بشريّ.
do $$
declare
  v_seasons int;
  v_active  bigint;
  v_tbl     text;
  v_rows    bigint;
begin
  select count(*) into v_seasons from public.seasons;
  if v_seasons = 0 then
    raise exception 'م٧ يتطلّب وجود موسم واحد على الأقل. شغّل ترحيل م١ أولاً.'
      using errcode = 'P0001';
  end if;

  select public.active_season_id() into v_active;
  if v_active is null then
    raise exception 'م٧ يتطلّب موسماً مفتوحاً — والافتراض على العمود الجديد يقرؤه.'
      using errcode = 'P0001';
  end if;

  foreach v_tbl in array array['flights','announcements'] loop
    -- إضافة العمود أولاً (فارغاً)، فالتعبئة والقيود تليه
    execute format('alter table public.%I add column if not exists season_id bigint', v_tbl);

    execute format('select count(*) from public.%I where season_id is null', v_tbl)
      into v_rows;

    if v_rows > 0 then
      if v_seasons > 1 then
        -- الفشل المسموع: لا تُنسب صفوفٌ إلى موسمٍ بالتخمين. لو
        -- نُسبت خطأً، لصارت رحلة موسمٍ ماضٍ ظاهرةً في موسمٍ لم
        -- تكن فيه — تاريخٌ كاذب يبدو موثوقاً، ولا يكشفه شيء بعدها.
        raise exception
          'م٧: في % صفٌّ/صفوف بلا موسم (%) والقاعدة تحوي % موسماً. حدّد season_id يدوياً لكل صفّ ثم أعد التشغيل — التخمين ممنوع.',
          v_tbl, v_rows, v_seasons
          using errcode = 'P0001';
      end if;

      -- موسم واحد لا غير: الإسناد استنتاجٌ وحيد لا اختيار بين
      -- احتمالات، فلا تلفيق فيه.
      execute format('update public.%I set season_id = $1 where season_id is null', v_tbl)
        using v_active;
    end if;

    -- ث٥: كل صفّ موسميّ له موسم — والختم في القاعدة لا في الواجهة
    execute format(
      'alter table public.%I alter column season_id set default public.active_season_id()', v_tbl);
    execute format(
      'alter table public.%I alter column season_id set not null', v_tbl);

    -- restrict كبقيّة الجداول الموسميّة: حذف الموسم يمرّ عبر
    -- delete_season() التي تكنس الصفوف أولاً، فبقاء صفّ خطأٌ
    -- يجب أن يُسمَع لا أن يُبتلع.
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', v_tbl)::regclass
        and conname  = format('%s_season_id_fkey', v_tbl)
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (season_id)
           references public.seasons(id) on delete restrict',
        v_tbl, v_tbl || '_season_id_fkey');
    end if;

    execute format(
      'create index if not exists %I on public.%I (season_id)',
      'idx_' || v_tbl || '_season_id', v_tbl);
  end loop;
end $$;

comment on column public.flights.season_id is
  'م٧ — الموسم المالك للرحلة. الرحلات لا تُستنسخ إلى موسم جديد: كل موسم يبدأ بلا رحلات.';
comment on column public.announcements.season_id is
  'م٧ — الموسم المخاطَب بالتنبيه. عزل الموسم لا يعتمد على expires_at: تنبيهٌ بلا انتهاء يبقى داخل موسمه وحده.';


-- ------------------------------------------------------------
-- ١) ث٣ — لا كتابة على موسم مقفل
-- ------------------------------------------------------------
-- الجدولان يخزّنان `season_id` مباشرةً، فالمحفّز المباشر هو
-- الصحيح — لا `_derived`، إذ لا `passenger_id` فيهما أصلاً.
-- والدالّة نفسها التي تحرس passengers/buses/camps/rooms منذ م١:
-- لا نسخة ثانية منها، فالسلوك واحدٌ بحكم الاشتراك لا بحكم التشابه.
do $$
declare v_tbl text;
begin
  foreach v_tbl in array array['flights','announcements'] loop
    execute format('drop trigger if exists trg_reject_closed_season on public.%I', v_tbl);
    execute format(
      'create trigger trg_reject_closed_season
         before insert or update or delete on public.%I
         for each row execute function public.reject_write_closed_season()', v_tbl);
  end loop;
end $$;


-- ------------------------------------------------------------
-- ٢) سلامة الإسناد — حاجٌّ لا يركب رحلة موسمٍ آخر
-- ------------------------------------------------------------
-- الترشيح في الواجهة دفاعٌ في العمق لا حدُّ السلامة: PostgREST
-- يقبل `update passengers set flight_id = <أي رقم>` من أي موظّف
-- يملك صلاحية التعديل، والواجهة ليست في المسار.
--
-- ولماذا محفّز لا مفتاح أجنبيّ مركّب: `passengers` **لا تحمل
-- مفتاحاً أجنبياً واحداً** إلى الباصات ولا الغرف ولا المخيّمات —
-- سلامة الإسناد فيها محروسة بالمحفّزات منذ م١. فمفتاحٌ مركّب إلى
-- `flights` وحدها كان سيُدخل نمطاً ثالثاً لا يشبه ما حوله، ويغيّر
-- سلوك حذف الرحلة صامتاً. والمحفّز هنا **أصغر تغيير يحقّق الضمان**.
--
-- ويحرس الساقين معاً: `flight_id` و`return_flight_id` مستقلّان،
-- وإغفال إحداهما يترك نصف الباب مفتوحاً.
--
-- ولا حاجة إلى حارسٍ على `flights` نفسها: نقل رحلة من موسم إلى
-- آخر ممتنع أصلاً — المحفّز أعلاه يرفض الخروج من موسم مقفل
-- والدخول إليه، والمفتوح واحدٌ لا غير (ث١). فموسم الرحلة ثابت
-- عملياً بعد إنشائها، ويكفي الحرس عند الإسناد.
create or replace function public.reject_cross_season_flight()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season bigint;
begin
  -- الفحص عند تغيّر أحد الطرفين فقط: تعديل اسم حاجّ لا يستدعي
  -- قراءتين إضافيتين، والصفوف القائمة الصحيحة لا تُعاد مساءلتها.
  if new.flight_id is not null
     and (tg_op = 'INSERT'
          or new.flight_id is distinct from old.flight_id
          or new.season_id is distinct from old.season_id) then
    select f.season_id into v_season from public.flights f where f.id = new.flight_id;
    if v_season is null then
      raise exception 'رحلة الذهاب رقم % غير موجودة.', new.flight_id
        using errcode = 'P0001';
    end if;
    if v_season <> new.season_id then
      raise exception 'رحلة الذهاب رقم % تتبع موسماً آخر — لا يُسنَد حاجّ إلى رحلة خارج موسمه.', new.flight_id
        using errcode = 'P0001';
    end if;
  end if;

  if new.return_flight_id is not null
     and (tg_op = 'INSERT'
          or new.return_flight_id is distinct from old.return_flight_id
          or new.season_id is distinct from old.season_id) then
    select f.season_id into v_season from public.flights f where f.id = new.return_flight_id;
    if v_season is null then
      raise exception 'رحلة العودة رقم % غير موجودة.', new.return_flight_id
        using errcode = 'P0001';
    end if;
    if v_season <> new.season_id then
      raise exception 'رحلة العودة رقم % تتبع موسماً آخر — لا يُسنَد حاجّ إلى رحلة خارج موسمه.', new.return_flight_id
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.reject_cross_season_flight() is
  'م٧ — يمنع إسناد حاجّ إلى رحلة من موسم آخر، في الساقين معاً. حدّ السلامة في القاعدة؛ ترشيح الواجهة دفاعٌ في العمق فوقه.';

-- محفّزٌ منفصل لا توسعةٌ لـ`trg_reject_closed_season`: ذاك يحرس
-- الموسم المقفل ويعمل على تسعة جداول، وخلط الحارسين كان سيجعل
-- تعديل أحدهما يمسّ الآخر. والاسم يرتّبهما أبجدياً بعده، فيسبق
-- فحصُ الإقفال فحصَ الإسناد — وهو الترتيب المرغوب.
drop trigger if exists trg_reject_cross_season_flight on public.passengers;
create trigger trg_reject_cross_season_flight
  before insert or update on public.passengers
  for each row execute function public.reject_cross_season_flight();

-- الاشتقاق يقرأ `flights` بامتياز المالك، فلا يحتاج منحاً لأي دور.
revoke execute on function public.reject_cross_season_flight()
  from public, anon, authenticated, service_role;


-- ------------------------------------------------------------
-- ٣) البوابة — تنبيهات الموسم النشط وحده
-- ------------------------------------------------------------
-- جلسة الحاجّ مربوطة بالموسم النشط أصلاً (`_pilgrim_session_owner`
-- تشترط `s.season_id = active_season_id()`)، فالترشيح بالموسم
-- النشط هنا **لا يحجب تنبيهاً عن صاحبه**: من يصل إلى هذه الدالة
-- هو بالضرورة حاجّ الموسم النشط.
--
-- ولذلك لا تتغيّر التواقيع ولا المنح ولا الإسقاط: شرطٌ واحد يُضاف
-- إلى `where`. ولا ضابط أمنيّ يُمسّ.

create or replace function public.get_portal_announcements()
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'id', a.id,
        'body', a.body,
        'priority', a.priority,
        'show_at', a.show_at
      )
      order by (a.priority = 'عاجل') desc, a.show_at desc
    ),
    '[]'::json)
  from public.announcements a
  where a.season_id = public.active_season_id()
    and a.show_at <= now()
    and (a.expires_at is null or a.expires_at > now());
$$;

comment on function public.get_portal_announcements() is
  'بوابة الحاج — إسقاط تنبيهات الموسم النشط السارية لـ anon. مدخل مجهول موثَّق (ج٤). م٧: العزل بالموسم لا بانتهاء الصلاحية.';

revoke execute on function public.get_portal_announcements() from public, authenticated;
grant execute on function public.get_portal_announcements() to anon, service_role;


-- المسار الثاني — ولا يكفي إصلاح أحدهما: البوابة تقرأ التنبيهات
-- مرّتين، مرّةً ضمن ملفّ الحاجّ عند الفتح ومرّةً بالتحديث الدوريّ.
-- والجسم هنا هو جسم س٧ **بحرفه** عدا شرط الموسم في `announcements`
-- — لا إسقاط يتغيّر ولا ضابط يُمسّ.
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
    /* م٧ — شرط الموسم. الحاجّ يقرأ تنبيهات موسمه، ولا يرث تنبيهاً
       بلا انتهاءٍ من موسمٍ سبقه. والجلسة نفسها موسمها النشط. */
    'announcements', (select coalesce(json_agg(json_build_object('id', a.id, 'body', a.body, 'priority', a.priority, 'show_at', a.show_at) order by (a.priority = 'عاجل') desc, a.show_at desc), '[]'::json)
      from public.announcements a
      where a.season_id = v_p.season_id
        and a.show_at <= now() and (a.expires_at is null or a.expires_at > now()))
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_pilgrim_portal_by_session(text) is
  'س٧ — إسقاط بوابة الحاجّ بالجلسة. نفس إسقاط س٦: قيمٌ منطقية للمستندات لا مفاتيح. م٧: التنبيهات مرشَّحة بموسم الحاجّ.';

revoke execute on function public.get_pilgrim_portal_by_session(text) from public, authenticated;
grant execute on function public.get_pilgrim_portal_by_session(text) to anon;


-- ------------------------------------------------------------
-- ٤) delete_season — الصنفان الجديدان في الكنس وفي العدّ
-- ------------------------------------------------------------
-- **التوقيع كما هو** `(bigint, uuid)` — فلا نشر لـ`season-admin`.
--
-- والترتيب يتبع الاعتماد: الحجّاج أولاً (فـ`flight_id` يشير إلى
-- رحلة، وحذف الرحلة قبله كان سيصطدم بمحفّز الإسناد أو يترك إشارة
-- معلّقة)، ثم الرحلات والتنبيهات، ثم الموسم.
--
-- و`audit_log` و`season_pricing_snapshot` **يبقيان**: لا مفتاح
-- أجنبيّ لأيّهما على `seasons`، ولا سطر هنا يمسّهما — عمداً في
-- الحالتين، وهو ما يجعل حذف الموسم قابلاً للإثبات بعد وقوعه.
create or replace function public.delete_season(p_season_id bigint, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  n_notif  bigint;
  n_push   bigint;
  n_sess   bigint;
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
  -- والأصناف **الاثنا عشر كاملة** بعد م٧ (M-2): ستّة تُحذف بالموسم
  -- مباشرةً — أربعة من م١ والرحلات والتنبيهات من م٧ — وستّة تسقط
  -- بـ`on delete cascade` من `passengers`. فالعدّ الناقص يوحي
  -- بحجمٍ أصغر مما جرى، والصفّ الملخّص دليلٌ لا ملخّص تقريبيّ.
  select count(*) into n_pay    from public.payments       p
    join public.passengers pa on pa.id = p.passenger_id  where pa.season_id = p_season_id;
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
  delete from public.passengers where season_id = p_season_id;
  get diagnostics n_pass = row_count;
  delete from public.rooms where season_id = p_season_id;
  get diagnostics n_rooms = row_count;
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

  -- المفتاح الأجنبي restrict هو شبكة الأمان: لو بقي صفّ موسميّ
  -- في جدول أُضيف لاحقاً ونُسي هنا، يفشل هذا السطر بدل أن يُيتَّم
  delete from public.seasons where id = p_season_id;

  delete from public.audit_suppression where txid = txid_current();
  set local app.season_maintenance = 'off';

  perform public.record_season_event(
    p_actor, 'delete', p_season_id, v_row,
    jsonb_build_object('deleted_counts', jsonb_build_object(
      'passengers', n_pass, 'rooms', n_rooms, 'camps', n_camps, 'buses', n_buses,
      'flights', n_flight, 'announcements', n_ann,
      'payments', n_pay, 'custom_charges', n_charge,
      'financial_group_members', n_fgm, 'notification_deliveries', n_notif,
      'pilgrim_push_subscriptions', n_push, 'pilgrim_sessions', n_sess))
  );
end;
$$;

comment on function public.delete_season(bigint, uuid) is
  'يحذف موسماً مقفلاً وكل بياناته في معاملة واحدة، ويكتب صفّ تدقيق ملخّصاً واحداً بالفاعل وبأعداد الأصناف الاثني عشر كاملةً بعد م٧ — لا صفّاً لكل سطر ساقط. الموسم المفتوح لا يُحذف.';

revoke execute on function public.delete_season(bigint, uuid) from public, anon, authenticated;
grant  execute on function public.delete_season(bigint, uuid) to service_role;


-- ------------------------------------------------------------
-- ٥) التراجع
-- ------------------------------------------------------------
-- إسقاط العمودين يمحو انتماءً لا يُستعاد بعد أن تتوزّع الرحلات
-- والتنبيهات على موسمين — فهو إتلافُ بيانات لا تراجع (قاعدة أ٩).
-- وقبل أوّل إقفالٍ بعد هذا الترحيل، التراجع ممكن نظرياً:
--   drop trigger trg_reject_cross_season_flight on public.passengers;
--   drop function public.reject_cross_season_flight();
--   drop trigger trg_reject_closed_season on public.flights;
--   drop trigger trg_reject_closed_season on public.announcements;
--   alter table public.flights       drop column season_id;
--   alter table public.announcements drop column season_id;
-- ثم إرجاع الدوال الثلاث إلى نسختَي س٧/س٨. وإعادة العيب ليست
-- تراجعاً: البوابة تعود عندها تعرض تنبيهات موسمٍ مضى.
