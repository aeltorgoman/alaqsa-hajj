-- ════════════════════════════════════════════════════════════
-- MOD-001 / PR 3 — عملياتُ الفنادق وتوافقُ البوابة والإعدادات
-- ════════════════════════════════════════════════════════════
-- دوالٌّ لا جداول، ولا يُمسّ صفٌّ قائمٌ عند التطبيق:
--
--   ١) assign_passenger_room(passenger, room|null) — إسنادٌ وإخراجٌ ونقلٌ
--      بين الغرف والفنادق. تكتب `room_id` **وحده**.
--   ٢) set_room_order(room, [passengers]) — ترتيبُ نزلاء غرفةٍ واحدة،
--      وتكتب `room_sort_order` وحده، والقائمةُ = نزلاءُ الغرفة بالضبط.
--   ٣) delete_hotel(hotel) — حذفُ فندقٍ بغرفه الفارغة ذرّيّاً (D3).
--   ٤) get_pilgrim_portal_by_session — مفتاحٌ جديد `accommodation`
--      يميّز المطلوب من المُسنَد (D8)، وكلُّ المفاتيح القديمة باقية.
--   ٥) update_active_season — نسخةٌ جديدةٌ بلا مُعامِلات الفندق للواجهة
--      الجديدة، والقديمةُ باقيةٌ بتوقيعها وتُزامِن فندقَ الموسم الوحيد.
--
-- ⚠️ التفويض (D4): لا تُمسّ سياسةُ `passengers_update` ولا يُسحب منها شيء.
--    فـ`manage_passengers` (للحاجّ) و`manage_admins` (لغيره) يكتبان كما
--    كانا، مباشرةً أو عبر الدالّتين. و`manage_hotel` يُضاف **عبر الدالّتين
--    وحدهما**، ولا سياسةَ تحديثٍ له على `passengers`: فلا يبلغ عموداً
--    آخر من أعمدة الحاجّ — لا اسمَ ولا وثيقةَ ولا سعرَ ولا خدمة.
-- ⚠️ السعة والموسم وث٣ تبقى في المحفّزات القائمة على `passengers`
--    و`rooms` و`hotels`، وتسري داخل الدوالّ كما تسري خارجها. ولا تُفتح
--    رايةُ الصيانة هنا بحال.
-- ⚠️ لا يُذكر هنا عمودٌ ساقطٌ من `company_config` بمؤهِّل `c.` — حارسُ
--    20260920120000 يقرأ أجسادَ الدوالّ.

-- ── ٠) حكمُ التفويض على حاجٍّ بعينه — مصدرٌ واحد ─────────────
-- يعكس `passengers_update` حرفاً بحرف، ويزيد `manage_hotel` لعمودَي
-- الغرفة وحدهما. داخليّة: لا يُنفّذها دورٌ تطبيقيّ مباشرةً.
create or replace function public.mod001_may_place_passenger(p_passenger_type text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.has_permission('manage_hotel')
      or (public.has_permission('manage_passengers')
          and (p_passenger_type is null or p_passenger_type = 'حاج'))
      or (public.has_permission('manage_admins')
          and p_passenger_type is not null and p_passenger_type <> 'حاج');
$$;

alter function public.mod001_may_place_passenger(text) owner to postgres;
revoke execute on function public.mod001_may_place_passenger(text) from public, anon, authenticated;

-- ── ١) الإسنادُ والإخراجُ والنقل ─────────────────────────────
create or replace function public.assign_passenger_room(p_passenger_id bigint, p_room_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_type   text;
  v_before bigint;
  v_hotel  bigint;
  v_req    bigint;
begin
  -- رفضٌ قبل أيّ قراءة: من لا يملك أيَّ صلاحية إسنادٍ لا يعرف حتى وجودَ الحاجّ
  if not (public.has_permission('manage_hotel')
          or public.has_permission('manage_passengers')
          or public.has_permission('manage_admins')) then
    raise exception 'ليست لديك صلاحية تسكين الغرف.' using errcode = '42501';
  end if;
  if p_passenger_id is null then
    raise exception 'الحاجّ مطلوب.' using errcode = '22004';
  end if;

  select p.passenger_type, p.room_id into v_type, v_before
    from public.passengers p where p.id = p_passenger_id
   for update;
  if not found then
    raise exception 'الحاجّ رقم % غير موجود.', p_passenger_id using errcode = 'P0002';
  end if;

  if not public.mod001_may_place_passenger(v_type) then
    raise exception 'ليست لديك صلاحية تسكين هذا الشخص.' using errcode = '42501';
  end if;

  -- العمودُ الواحد. والسعةُ والموسمُ وث٣ في المحفّزات القائمة.
  if p_room_id is distinct from v_before then
    update public.passengers set room_id = p_room_id where id = p_passenger_id;
  end if;

  select r.hotel_id into v_hotel from public.rooms r where r.id = p_room_id;
  select p.requested_hotel_id into v_req from public.passengers p where p.id = p_passenger_id;

  return jsonb_build_object(
    'passenger_id',       p_passenger_id,
    'previous_room_id',   v_before,
    'room_id',            p_room_id,
    'hotel_id',           v_hotel,
    'requested_hotel_id', v_req
  );
end;
$$;

comment on function public.assign_passenger_room(bigint, bigint) is
  'MOD-001 — يكتب passengers.room_id وحده (null = إخراج). manage_hotel، أو manage_passengers للحاجّ، أو manage_admins لغيره. السعة والموسم وث٣ في المحفّزات القائمة.';

alter function public.assign_passenger_room(bigint, bigint) owner to postgres;
revoke all on function public.assign_passenger_room(bigint, bigint) from public, anon;
grant execute on function public.assign_passenger_room(bigint, bigint) to authenticated, service_role;

-- ── ٢) ترتيبُ نزلاء الغرفة ───────────────────────────────────
-- القائمةُ يجب أن تساوي نزلاءَ الغرفة الآنَ بالضبط: لا ناقصَ فيُترك
-- ترتيبُه معلّقاً، ولا زائدَ من غرفةٍ أخرى يُكتب ترتيبُه هنا. والقيمُ
-- (i+1)×10 كما يكتبها `reorderUpdates` في الواجهة.
create or replace function public.set_room_order(p_room_id bigint, p_passenger_ids bigint[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_occupants bigint[];
  v_n         integer;
begin
  if not (public.has_permission('manage_hotel')
          or public.has_permission('manage_passengers')
          or public.has_permission('manage_admins')) then
    raise exception 'ليست لديك صلاحية ترتيب الغرف.' using errcode = '42501';
  end if;
  if p_room_id is null or p_passenger_ids is null or cardinality(p_passenger_ids) = 0 then
    raise exception 'الغرفةُ وقائمةُ النزلاء مطلوبتان.' using errcode = '22023';
  end if;
  if array_position(p_passenger_ids, null) is not null then
    raise exception 'في القائمة عنصرٌ فارغ.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_passenger_ids) x) <> cardinality(p_passenger_ids) then
    raise exception 'في القائمة حاجٌّ مكرّر.' using errcode = '22023';
  end if;

  perform 1 from public.rooms r where r.id = p_room_id for update;
  if not found then
    raise exception 'الغرفة رقم % غير موجودة.', p_room_id using errcode = 'P0002';
  end if;

  perform 1 from public.passengers p where p.room_id = p_room_id for update;
  select coalesce(array_agg(p.id order by p.id), '{}') into v_occupants
    from public.passengers p where p.room_id = p_room_id;

  if v_occupants <> (select array_agg(x order by x) from unnest(p_passenger_ids) x) then
    raise exception 'القائمةُ لا تطابق نزلاءَ الغرفة الآن — حدّث الصفحة ثمّ أعد الترتيب.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.passengers p
              where p.room_id = p_room_id
                and not public.mod001_may_place_passenger(p.passenger_type)) then
    raise exception 'ليست لديك صلاحية ترتيب أحد نزلاء هذه الغرفة.' using errcode = '42501';
  end if;

  update public.passengers p
     set room_sort_order = o.ord * 10
    from unnest(p_passenger_ids) with ordinality as o(id, ord)
   where p.id = o.id
     and p.room_id = p_room_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.set_room_order(bigint, bigint[]) is
  'MOD-001 — يكتب passengers.room_sort_order وحده لنزلاء غرفةٍ واحدة؛ القائمةُ = النزلاء الآن بالضبط. التفويضُ كـassign_passenger_room.';

alter function public.set_room_order(bigint, bigint[]) owner to postgres;
revoke all on function public.set_room_order(bigint, bigint[]) from public, anon;
grant execute on function public.set_room_order(bigint, bigint[]) to authenticated, service_role;

-- ── ٣) حذفُ فندقٍ بغرفه الفارغة (D3) ──────────────────────────
-- ذرّيّ: يُقفل الفندقَ وغرفَه أوّلاً، فلا يسبقه إسنادٌ (حارسُ السعة يقفل
-- الغرفةَ نفسَها) ولا طلبٌ جديد (المفتاحُ الأجنبيّ يقفل صفَّ الفندق).
-- ولا رايةَ صيانة: فندقُ موسمٍ مقفلٍ يرفضه ث٣ كما يرفض أيَّ كتابة.
create or replace function public.delete_hotel(p_hotel_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name     text;
  v_season   bigint;
  v_occupied integer;
  v_request  integer;
  v_rooms    integer;
  v_prices   integer;
begin
  if not public.has_permission('manage_hotel') then
    raise exception 'ليست لديك صلاحية حذف الفنادق.' using errcode = '42501';
  end if;

  select h.name, h.season_id into v_name, v_season
    from public.hotels h where h.id = p_hotel_id for update;
  if not found then
    raise exception 'الفندق رقم % غير موجود.', p_hotel_id using errcode = 'P0002';
  end if;

  perform 1 from public.rooms r where r.hotel_id = p_hotel_id for update;

  select count(*) into v_occupied
    from public.passengers p join public.rooms r on r.id = p.room_id
   where r.hotel_id = p_hotel_id;
  if v_occupied > 0 then
    raise exception 'الفندق «%» فيه % نزيلاً مُسكَّناً — أخرِجهم أولاً.', v_name, v_occupied
      using errcode = 'P0001';
  end if;

  select count(*) into v_request
    from public.passengers p where p.requested_hotel_id = p_hotel_id;
  if v_request > 0 then
    raise exception 'الفندق «%» مطلوبٌ لـ% حاجّاً — غيّر فندقهم المطلوب أولاً.', v_name, v_request
      using errcode = 'P0001';
  end if;

  select count(*) into v_prices from public.hotel_package_prices hp where hp.hotel_id = p_hotel_id;

  delete from public.rooms where hotel_id = p_hotel_id;
  get diagnostics v_rooms = row_count;
  -- الأسعارُ تسقط بـ`on delete cascade`.
  delete from public.hotels where id = p_hotel_id;

  return jsonb_build_object(
    'hotel_id', p_hotel_id, 'name', v_name, 'season_id', v_season,
    'rooms_deleted', v_rooms, 'prices_deleted', v_prices
  );
end;
$$;

comment on function public.delete_hotel(bigint) is
  'MOD-001 — يحذف الفندقَ وغرفَه الفارغة وأسعارَه ذرّيّاً. manage_hotel. يرفض فندقاً فيه مُسكَّن أو مطلوبٌ لحاجّ، وفندقَ موسمٍ مقفل (ث٣).';

alter function public.delete_hotel(bigint) owner to postgres;
revoke all on function public.delete_hotel(bigint) from public, anon;
grant execute on function public.delete_hotel(bigint) to authenticated, service_role;

-- ── ٤) البوابة — المطلوبُ غيرُ المُسنَد (D8) ──────────────────
-- الجديد: `accommodation`
--   status = 'assigned'  ← للحاجّ غرفة: فندقُ الغرفة (اسم · عنوان · رابط)
--                          والغرفة (رقم · دور · نوع).
--   status = 'requested' ← لا غرفة: اسمُ الفندق المطلوب **وحده** — لا عنوانَ
--                          ولا رابطَ يُفهم منهما سكنٌ مؤكَّد.
--   status = 'none'      ← لا هذا ولا ذاك.
-- القديم باقٍ كلُّه بأسمائه. و`season.hotel_*` لواجهة البوابة الحالية:
--   مُسنَدٌ ← فندقُ غرفته · لا غرفة والموسمُ بفندقٍ واحد ← ذلك الفندق (كما
--   تعرضه اليوم) · لا فنادقَ في الموسم ← أعمدةُ الموسم القديمة (كما اليوم) ·
--   وإلا ← فارغ، فلا تعرض الواجهةُ القديمة فندقاً غيرَ مؤكَّد.
-- ولا تُكشف ملاحظاتُ الفندق ولا أسعارُه ولا ترتيبُه.
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

  v_status := case when v_p.room_id is not null then 'assigned'
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
      'requested_hotel', case when v_status = 'requested' then json_build_object('name', v_rh_name) end
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
    /* م٧ — شرط الموسم. */
    'announcements', (select coalesce(json_agg(json_build_object('id', a.id, 'body', a.body, 'priority', a.priority, 'show_at', a.show_at) order by (a.priority = 'عاجل') desc, a.show_at desc), '[]'::json)
      from public.announcements a
      where a.season_id = v_p.season_id
        and a.show_at <= now() and (a.expires_at is null or a.expires_at > now()))
  ) into v_result;

  return v_result;
end;
$$;

-- ── ٥) إعداداتُ الموسم ────────────────────────────────────────
-- أ) الجديدة للواجهة الجديدة: بلا الفندق — الفنادقُ تُدار من صفحتها.
create or replace function public.update_active_season(
  p_name text, p_mina_address text, p_mina_url text, p_arafa_address text, p_arafa_url text)
returns public.seasons
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row  public.seasons;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.has_permission('manage_users') then
    raise exception 'ليست لديك صلاحية تعديل إعدادات الموسم.' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'اسم الموسم مطلوب.' using errcode = 'P0001';
  end if;

  update public.seasons
     set name          = v_name,
         mina_address  = nullif(btrim(coalesce(p_mina_address,  '')), ''),
         mina_url      = nullif(btrim(coalesce(p_mina_url,      '')), ''),
         arafa_address = nullif(btrim(coalesce(p_arafa_address, '')), ''),
         arafa_url     = nullif(btrim(coalesce(p_arafa_url,     '')), '')
   where closed_at is null
   returning * into v_row;

  if not found then
    raise exception 'لا يوجد موسم مفتوح لتعديله.' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.update_active_season(text, text, text, text, text) is
  'MOD-001 — تعديلُ الموسم النشط بلا الفندق (الفنادقُ في صفحتها). يشترط manage_users، ويعمل على الموسم المفتوح وحده. لا يمسّ hijri_year ولا أعمدة hotel_*.';

alter function public.update_active_season(text, text, text, text, text) owner to postgres;
revoke all on function public.update_active_season(text, text, text, text, text) from public, anon;
grant execute on function public.update_active_season(text, text, text, text, text) to authenticated, service_role;

-- ب) القديمة بتوقيعها نفسِه للواجهة الحالية — تكتب أعمدةَ الموسم كما
--    كانت، وتُزامِن فندقَ الموسم **إن كان وحيداً** فلا يفترق ما تعرضه
--    البوابةُ عمّا حُفظ. والاسمُ الفارغُ لا يمحو اسمَ الفندق (مطلوب)،
--    والرابطُ غيرُ http لا يُنقل إليه. ومع أكثرَ من فندقٍ لا مزامنة: غامض.
create or replace function public.update_active_season(
  p_name text, p_hotel_name text, p_hotel_address text, p_hotel_url text,
  p_mina_address text, p_mina_url text, p_arafa_address text, p_arafa_url text)
returns public.seasons
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row  public.seasons;
  v_name text := btrim(coalesce(p_name, ''));
  v_url  text := nullif(btrim(coalesce(p_hotel_url, '')), '');
begin
  if not public.has_permission('manage_users') then
    raise exception 'ليست لديك صلاحية تعديل إعدادات الموسم.' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'اسم الموسم مطلوب.' using errcode = 'P0001';
  end if;

  update public.seasons
     set name          = v_name,
         hotel_name    = nullif(btrim(coalesce(p_hotel_name,    '')), ''),
         hotel_address = nullif(btrim(coalesce(p_hotel_address, '')), ''),
         hotel_url     = v_url,
         mina_address  = nullif(btrim(coalesce(p_mina_address,  '')), ''),
         mina_url      = nullif(btrim(coalesce(p_mina_url,      '')), ''),
         arafa_address = nullif(btrim(coalesce(p_arafa_address, '')), ''),
         arafa_url     = nullif(btrim(coalesce(p_arafa_url,     '')), '')
   where closed_at is null
   returning * into v_row;

  if not found then
    raise exception 'لا يوجد موسم مفتوح لتعديله.' using errcode = 'P0002';
  end if;

  if (select count(*) from public.hotels h where h.season_id = v_row.id) = 1 then
    update public.hotels h
       set name    = coalesce(nullif(btrim(coalesce(p_hotel_name, '')), ''), h.name),
           address = nullif(btrim(coalesce(p_hotel_address, '')), ''),
           map_url = case when v_url ~* '^https?://' then v_url end
     where h.season_id = v_row.id;
  end if;

  return v_row;
end;
$$;

-- ── ٦) شرطٌ لاحق ─────────────────────────────────────────────
do $chk$
declare
  v_fn  text;
  v_n   integer;
begin
  -- كلُّ دالّةٍ جديدةٍ أو مُعدَّلة: SECURITY DEFINER بـsearch_path ثابت
  foreach v_fn in array array[
    'public.mod001_may_place_passenger(text)',
    'public.assign_passenger_room(bigint, bigint)',
    'public.set_room_order(bigint, bigint[])',
    'public.delete_hotel(bigint)',
    'public.get_pilgrim_portal_by_session(text)',
    'public.update_active_season(text, text, text, text, text)',
    'public.update_active_season(text, text, text, text, text, text, text, text)'] loop
    if not exists (select 1 from pg_proc p where p.oid = v_fn::regprocedure and p.prosecdef
                    and p.proconfig @> array['search_path=public, pg_temp']) then
      raise exception '% ليست SECURITY DEFINER بـsearch_path ثابت.', v_fn using errcode = 'P0001';
    end if;
    if has_function_privilege('anon', v_fn, 'EXECUTE')
       and v_fn <> 'public.get_pilgrim_portal_by_session(text)' then
      raise exception 'anon يملك تنفيذ %.', v_fn using errcode = 'P0001';
    end if;
  end loop;

  -- الداخليّةُ لا تُنفَّذ من دورٍ تطبيقيّ، والعامّةُ لـauthenticated
  if has_function_privilege('authenticated', 'public.mod001_may_place_passenger(text)', 'EXECUTE') then
    raise exception 'mod001_may_place_passenger قابلةٌ للتنفيذ من authenticated.' using errcode = 'P0001';
  end if;
  foreach v_fn in array array[
    'public.assign_passenger_room(bigint, bigint)', 'public.set_room_order(bigint, bigint[])',
    'public.delete_hotel(bigint)', 'public.update_active_season(text, text, text, text, text)',
    'public.update_active_season(text, text, text, text, text, text, text, text)'] loop
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'authenticated لا يملك تنفيذ %.', v_fn using errcode = 'P0001';
    end if;
  end loop;

  -- البوابةُ ما زالت لـanon (مسارُ الجلسة) ولم تتّسع
  if not has_function_privilege('anon', 'public.get_pilgrim_portal_by_session(text)', 'EXECUTE') then
    raise exception 'البوابةُ فقدت تنفيذَ anon.' using errcode = 'P0001';
  end if;

  -- لا سياسةَ تحديثٍ جديدةٌ على passengers: التفويضُ القائمُ كما هو
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'passengers' and cmd = 'UPDATE';
  if v_n <> 1 then
    raise exception 'سياساتُ تحديث passengers تغيّرت: %.', v_n using errcode = 'P0001';
  end if;
end;
$chk$;
