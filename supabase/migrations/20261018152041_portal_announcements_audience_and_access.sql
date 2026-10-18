-- ═══════════════════════════════════════════════════════════════════
-- version : 20261018152041
-- name    : portal_announcements_audience_and_access
-- ═══════════════════════════════════════════════════════════════════
--
-- H2 + H3 — من يرى التنبيه. تغييرٌ منطقيٌّ واحد بشقّين:
--
-- H2) `get_pilgrim_portal_by_session` كانت تُرجع كلَّ تنبيهٍ ساري في
--     الموسم لكلّ حاجّ، فالتنبيهُ الموجَّه إلى باصٍ أو مخيّمٍ أو حاجٍّ
--     بعينه يظهر للجميع — والاستهدافُ كان للدفع وحده.
--     الآن: شرطُ جمهورٍ على الحاجّ نفسِه بالأنواع الخمسة التي يعرفها
--     `announcement_audience`: all · bus · camp_mina · camp_arafa · custom.
--     ونوعٌ لا يُعرف ← لا أحد (fail-closed)، ويُسجَّل `RAISE LOG` بمعرّفات
--     التنبيهات وحدها. والجسدُ منقولٌ بحرفه من 20261011012258 عدا ذلك.
--     ⚠️ `announcement_audience` (الدفع) لا تُمسّ هنا: نوعٌ مجهولٌ يبقى فيها
--     «الكلّ» — وتوحيدُها قرارٌ مستقلّ. والأنواعُ المعروفة تتطابق في الدالّتين.
--
-- H3) `get_portal_announcements()` بلا وسيط: كانت تُنفَّذ من `anon` بلا
--     جلسة، فتُعيد تنبيهات الموسم النشط كلَّها — الموجَّهةَ منها — لكلّ من
--     يحمل المفتاح العامّ. تُسحب من `anon` (والدالّة باقية — لا DROP):
--       · العميل لا يناديها بعد هذا التغيير (كان إسقاطاً عند عطل الشبكة)،
--         والقديمُ منه يتلقّى رفضاً فيُبقي ما عنده (`if (anns)`) — آمنٌ في
--         الاتّجاهين (M-51).
--       · لا مستدعيَ إداريّ: صفحةُ البوابة تقرأ جدول `announcements` بسياساته،
--         و`send-pilgrim-push` لا يناديها. و`authenticated` لم يُمنحها قطّ.
--     فالتنبيهاتُ للحاجّ من مسار الجلسة وحده: جلسةٌ صالحةٌ في الموسم النشط
--     (`_pilgrim_session_owner`) وجمهورُه.
--
-- ⚠️ لا يُمسّ صفّ. لا سياسةَ جديدة. التوقيعاتُ والمالكون كما هم.
-- التراجع: ترحيلةٌ لاحقةٌ تعيد جسد 20261011012258 و/أو المِنحة (M-44).

-- ── H2) بوابةُ الحاجّ بالجلسة: التنبيهاتُ بجمهورها ─────────────────
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
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then
    return null;
  end if;

  select * into v_p from public.passengers where id = v_pid;
  if not found then
    return null;
  end if;

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

    'roommates', case
      when v_p.room_id is not null then
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
      'portal_settings', c.portal_settings,
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

comment on function public.get_pilgrim_portal_by_session(text) is
  'بوابة الحاجّ بالجلسة. MOD-001: accommodation.status = assigned | assigned_unlinked | requested | none. D8: قبل الإسناد يُوسَم المطلوبُ مطلوباً (اسمٌ بلا عنوانٍ ولا رابط)، وبعده يُعرض فندقُ الغرفة الفعليّ. season.hotel_* للواجهة الحاليّة وحدها ولا يحكم على accommodation. H2: announcements بجمهورها (all/bus/camp_mina/camp_arafa/custom)، والنوعُ المجهول لا يُعرض لأحد ويُسجَّل RAISE LOG بالمعرّفات.';

-- ── H3) لا تنبيهاتٍ بلا جلسة ──────────────────────────────────────
revoke execute on function public.get_portal_announcements() from anon;

comment on function public.get_portal_announcements() is
  'H3: لم تعد لـanon — تنبيهاتُ الحاجّ من get_pilgrim_portal_by_session وحدها (جلسة + موسم + جمهور). باقيةٌ لـservice_role ولا مستدعيَ لها في الواجهة.';

-- ── شروطٌ لاحقة على ما تملكه هذه الترحيلة وحده (S-38) ─────────────
do $post$
declare
  v_portal constant regprocedure := 'public.get_pilgrim_portal_by_session(text)'::regprocedure;
  v_anns   constant regprocedure := 'public.get_portal_announcements()'::regprocedure;
  v_src text;
begin
  if not exists (select 1 from pg_proc p where p.oid = v_portal and p.prosecdef
                  and p.proconfig @> array['search_path=public, pg_temp']) then
    raise exception 'get_pilgrim_portal_by_session ليست SECURITY DEFINER بـsearch_path ثابت.' using errcode = 'P0001';
  end if;
  -- البوابةُ ما زالت لـanon (مسارُ الجلسة) ولم تتّسع
  if not has_function_privilege('anon', v_portal, 'EXECUTE') then
    raise exception 'البوابةُ فقدت تنفيذَ anon.' using errcode = 'P0001';
  end if;
  if has_function_privilege('authenticated', v_portal, 'EXECUTE') then
    raise exception 'البوابةُ صارت قابلةً للتنفيذ من authenticated.' using errcode = 'P0001';
  end if;
  -- شرطُ الجمهور في الجسد المطبَّق فعلاً
  select p.prosrc into v_src from pg_proc p where p.oid = v_portal;
  if position('when ''custom''     then v_p.id            = any(a.target_ids)' in v_src) = 0
     or position('else false' in v_src) = 0 then
    raise exception 'شرطُ جمهور التنبيهات غائبٌ عن جسد البوابة.' using errcode = 'P0001';
  end if;
  -- H3: لا anon ولا authenticated على تنبيهات الموسم بلا جلسة
  if has_function_privilege('anon', v_anns, 'EXECUTE')
     or has_function_privilege('authenticated', v_anns, 'EXECUTE') then
    raise exception 'get_portal_announcements ما زالت قابلةً للتنفيذ من anon أو authenticated.' using errcode = 'P0001';
  end if;
  -- تشخيصٌ عند التطبيق: تنبيهاتٌ قائمةٌ بنوعٍ مجهول ستُخفى عن الجميع
  raise notice 'تنبيهاتٌ بنوع جمهورٍ مجهول (ستُخفى عن البوابة): %',
    (select count(*) from public.announcements
      where target_type not in ('all', 'bus', 'camp_mina', 'camp_arafa', 'custom'));
end
$post$;
