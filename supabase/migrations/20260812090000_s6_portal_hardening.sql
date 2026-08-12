-- ============================================================
-- س٦ / الخطوة ٤ (أ) — تحصين get_pilgrim_portal
-- ============================================================
-- ق٦ + الإضافة المعتمدة داخل س٦. **لا إعادة تصميم ولا جلسات** —
-- الحالة النهائية (جلسة بوابة قصيرة) مسجّلة في BACKLOG ق٤.
--
-- ما يتغيّر شيئان لا ثالث لهما:
--
-- ١) **لا مفاتيح مستندات للعميل المجهول.** كانت الاستجابة تحمل
--    photo_url و hajj_permit_url و flight_ticket_url. بعد الخصخصة
--    تصير عديمة النفع كاعتماد، لكنها تكشف أسماء الملفات وأوقات
--    رفعها. تحلّ محلّها ثلاث قيم منطقية، والبوابة تطلب الرابط من
--    `pilgrim-doc` بنوع مسموح.
--
-- ٢) **حدّ على محاولات التحقّق المجهولة** — إغلاق التهديد ت٤ الذي
--    كشفه جرد س٦: تخمين وثيقة + تاريخ ميلاد بلا سقف.
--
-- ⚠️ المصدر ليس إشارة موثوقة، وأقولها صراحةً: الوسيط يُلحق قيمته
-- بما يرسله العميل في `x-forwarded-for`، فيستطيع المستدعي حشو
-- مدخلات قبلها. آخر مدخل هو ما أضافه أقرب وسيط، وهو أصعبها تزويراً
-- **ولا يُعدّ برهاناً**. ولهذا **لا تقوم الحماية عليه وحده**:
--
--   حدّ (أ) بالمصدر        — سخيّ عمداً: حجّاج كثيرون خلف شبكة واحدة
--   حدّ (ب) بالوثيقة       — **يُستهلك عند الفشل وحده**
--
-- والثاني هو الحارس الحقيقيّ ضدّ التخمين، ولا يعتمد على ترويسة
-- إطلاقاً. واستهلاكه عند الفشل وحده يمنع أن يُعطِّل مهاجمٌ حاجّاً
-- حقيقياً بمجرّد معرفة رقم وثيقته — فالحاجّ الصادق لا ينقص رصيده.
--
-- **Fail closed:** تعذّر العدّاد يمنع الطلب. هنا لا تفويض سبق الحدّ،
-- فالحدّ نفسه جزء من الحماية لا حارس استهلاك.

create or replace function public.get_pilgrim_portal(p_doc text, p_day integer, p_month integer, p_year integer)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_p public.passengers%ROWTYPE;
  v_matched boolean := false;
  v_nums text[];
  v_y int; v_m int; v_d int;
  v_result json;
  v_xff text;
  v_src text;
  v_allowed boolean;
BEGIN
  /* ── حدّ (أ): بالمصدر، قبل أي محاولة إثبات هوية ── */
  BEGIN
    v_xff := coalesce(
      (coalesce(current_setting('request.headers', true), '{}')::json)->>'x-forwarded-for', '');
    v_src := nullif(trim(split_part(v_xff, ',',
               greatest(array_length(string_to_array(v_xff, ','), 1), 1))), '');

    IF v_src IS NOT NULL THEN
      v_allowed := public.consume_rate_limit(
        'portal-verify-src', md5('src:' || v_src)::uuid, 120, 3600);
      IF v_allowed IS NOT TRUE THEN
        RETURN json_build_object('rate_limited', true);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    /* fail closed — عطل العدّاد يمنع لا يمرّر */
    RAISE WARNING 'تعذّر فحص حدّ البوابة بالمصدر: %', sqlerrm;
    RETURN json_build_object('rate_limited', true);
  END;

  /* ── إثبات الهوية: المسار المركزي القائم بلا منطق جديد ── */
  FOR v_p IN
    SELECT * FROM public.passengers
    WHERE season_id = public.active_season_id()
      AND (trim(coalesce(passport,'')) = trim(p_doc)
       OR trim(coalesce(national_id,'')) = trim(p_doc))
  LOOP
    v_nums := regexp_split_to_array(regexp_replace(coalesce(v_p.dob,''), '[^0-9]+', ' ', 'g'), '\s+');
    v_nums := array_remove(v_nums, '');
    IF array_length(v_nums,1) = 3 THEN
      IF length(v_nums[1]) = 4 THEN
        v_y := v_nums[1]::int; v_m := v_nums[2]::int; v_d := v_nums[3]::int;
      ELSE
        v_d := v_nums[1]::int; v_m := v_nums[2]::int; v_y := v_nums[3]::int;
      END IF;
      IF v_y = p_year AND v_m = p_month AND v_d = p_day THEN
        v_matched := true;
        EXIT;
      END IF;
    END IF;
  END LOOP;

  /* ── حدّ (ب): بالوثيقة، **عند الفشل وحده** ── */
  IF NOT v_matched THEN
    BEGIN
      v_allowed := public.consume_rate_limit(
        'portal-verify-doc', md5('doc:' || coalesce(trim(p_doc), ''))::uuid, 10, 3600);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'تعذّر فحص حدّ البوابة بالوثيقة: %', sqlerrm;
      RETURN json_build_object('rate_limited', true);
    END;
    IF v_allowed IS NOT TRUE THEN
      RETURN json_build_object('rate_limited', true);
    END IF;
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'pilgrim', json_build_object(
      'name_ar', v_p.name_ar, 'short_ar', v_p.short_ar, 'name_en', v_p.name_en,
      'gender', v_p.gender,
      /* ق٦: قيم منطقية لا مفاتيح — العميل لا يلمس مفتاح كائن */
      'has_photo',         (nullif(trim(coalesce(v_p.photo_url,'')), '')         is not null),
      'has_hajj_permit',   (nullif(trim(coalesce(v_p.hajj_permit_url,'')), '')   is not null),
      'has_flight_ticket', (nullif(trim(coalesce(v_p.flight_ticket_url,'')), '') is not null),
      'hotel_type', v_p.hotel_type, 'hotel_view', v_p.hotel_view,
      'camp_mina', v_p.camp_mina, 'camp_arafa', v_p.camp_arafa,
      'camp_mina_name', (SELECT c.name FROM public.camps c WHERE c.id = v_p.camp_mina_id),
      'camp_arafa_name', (SELECT c.name FROM public.camps c WHERE c.id = v_p.camp_arafa_id),
      'phone', v_p.phone
    ),
    'bus', (SELECT json_build_object('name', b.name, 'type', b.type) FROM public.buses b WHERE b.id = v_p.bus_id),
    'room', (SELECT json_build_object('number', r.number, 'floor', r.floor, 'type', r.type) FROM public.rooms r WHERE r.id = v_p.room_id),
    'roommates', CASE
      WHEN v_p.room_id IS NOT NULL THEN
        (SELECT coalesce(json_agg(json_build_object(
          'name', pp.name_ar, 'short_ar', pp.short_ar,
          'room_number', r2.number, 'room_floor', r2.floor,
          'bus_name', b2.name,
          'is_family', (pp.family_id IS NOT NULL AND pp.family_id = v_p.family_id)
        )), '[]'::json)
         FROM public.passengers pp
         LEFT JOIN public.rooms r2 ON r2.id = pp.room_id
         LEFT JOIN public.buses b2 ON b2.id = pp.bus_id
         WHERE pp.room_id = v_p.room_id AND pp.id <> v_p.id)
      ELSE '[]'::json END,
    'family', CASE
      WHEN v_p.family_id IS NOT NULL THEN
        (SELECT coalesce(json_agg(json_build_object(
          'name', pp.name_ar, 'short_ar', pp.short_ar,
          'gender', pp.gender,
          'room_number', r2.number, 'room_floor', r2.floor,
          'bus_name', b2.name,
          'camp_mina_name', (SELECT c.name FROM public.camps c WHERE c.id = pp.camp_mina_id),
          'camp_arafa_name', (SELECT c.name FROM public.camps c WHERE c.id = pp.camp_arafa_id)
        )), '[]'::json)
         FROM public.passengers pp
         LEFT JOIN public.rooms r2 ON r2.id = pp.room_id
         LEFT JOIN public.buses b2 ON b2.id = pp.bus_id
         WHERE pp.family_id = v_p.family_id AND pp.id <> v_p.id)
      ELSE '[]'::json END,
    'flight_go', (SELECT json_build_object('name', f.name, 'airline', f.airline, 'from_airport', f.from_airport, 'to_airport', f.to_airport, 'date', f.date, 'time', f.time, 'arrival_time', f.arrival_time, 'arrival_date', f.arrival_date, 'class', v_p.flight_class) FROM public.flights f WHERE f.id = v_p.flight_id),
    'flight_back', (SELECT json_build_object('name', f.name, 'airline', f.airline, 'from_airport', f.from_airport, 'to_airport', f.to_airport, 'date', f.date, 'time', f.time, 'arrival_time', f.arrival_time, 'arrival_date', f.arrival_date, 'class', v_p.flight_class) FROM public.flights f WHERE f.id = v_p.return_flight_id),
    'config', (SELECT json_build_object(
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
      'assets', (SELECT coalesce(jsonb_object_agg(a.asset_key, a.asset_url), '{}'::jsonb)
        FROM public.company_assets a
        WHERE a.asset_key = any (array['logo', 'portal_banner', 'favicon']))
    ) FROM public.company_config c ORDER BY c.id LIMIT 1),
    'announcements', (SELECT coalesce(json_agg(json_build_object('id', a.id, 'body', a.body, 'priority', a.priority, 'show_at', a.show_at) ORDER BY (a.priority = 'عاجل') DESC, a.show_at DESC), '[]'::json)
      FROM public.announcements a
      WHERE a.show_at <= now() AND (a.expires_at IS NULL OR a.expires_at > now()))
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
