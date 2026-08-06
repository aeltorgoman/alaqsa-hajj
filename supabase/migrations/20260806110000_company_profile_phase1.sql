-- Company Profile Phase 1: additive, single-company-per-deployment foundation.
alter table public.company_config
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_iban text,
  add column if not exists bank_swift text,
  add column if not exists portal_welcome_message text,
  add column if not exists portal_help_message text,
  add column if not exists portal_settings jsonb not null default '{"flights":true,"rooms":true,"buses":true,"financial_balance":false,"qr_codes":true,"documents":true,"notifications":true,"pdf_downloads":true,"roommates":true,"lost_card":true}'::jsonb;

create table if not exists public.company_assets (
  asset_key text primary key,
  asset_url text not null,
  alt_text text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  constraint company_assets_key_format check (asset_key ~ '^[a-z][a-z0-9_]*$'),
  constraint company_assets_url_not_blank check (btrim(asset_url) <> '')
);
comment on table public.company_assets is 'Deployment-level company assets. Keys are extensible without schema changes.';

alter table public.company_assets enable row level security;
drop policy if exists "allow all" on public.company_assets;
create policy "allow all" on public.company_assets for all using (true) with check (true);
grant select, insert, update, delete on public.company_assets to anon, authenticated, service_role;

-- Existing URL columns remain untouched. Seed aliases make the asset service usable
-- immediately while legacy consumers continue reading company_config.
insert into public.company_assets(asset_key, asset_url, alt_text)
select 'logo', logo_url, name_ar from public.company_config where id = 1 and logo_url is not null
on conflict (asset_key) do nothing;
insert into public.company_assets(asset_key, asset_url, alt_text)
select 'dashboard_banner', banner_image_url, name_ar from public.company_config where id = 1 and banner_image_url is not null
on conflict (asset_key) do nothing;

CREATE OR REPLACE FUNCTION public.get_pilgrim_portal(p_doc text, p_day integer, p_month integer, p_year integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_p passengers%ROWTYPE;
  v_matched boolean := false;
  v_nums text[];
  v_y int; v_m int; v_d int;
  v_result json;
BEGIN
  FOR v_p IN
    SELECT * FROM passengers
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

  IF NOT v_matched THEN RETURN NULL; END IF;

  SELECT json_build_object(
    'pilgrim', json_build_object(
      'name_ar', v_p.name_ar, 'short_ar', v_p.short_ar, 'name_en', v_p.name_en,
      'gender', v_p.gender, 'photo_url', v_p.photo_url,
      'hajj_permit_url', v_p.hajj_permit_url, 'flight_ticket_url', v_p.flight_ticket_url,
      'hotel_type', v_p.hotel_type, 'hotel_view', v_p.hotel_view,
      'camp_mina', v_p.camp_mina, 'camp_arafa', v_p.camp_arafa,
      'camp_mina_name', (SELECT c.name FROM camps c WHERE c.id = v_p.camp_mina_id),
      'camp_arafa_name', (SELECT c.name FROM camps c WHERE c.id = v_p.camp_arafa_id),
      'phone', v_p.phone
    ),
    'bus', (SELECT json_build_object('name', b.name, 'type', b.type) FROM buses b WHERE b.id = v_p.bus_id),
    'room', (SELECT json_build_object('number', r.number, 'floor', r.floor, 'type', r.type) FROM rooms r WHERE r.id = v_p.room_id),
    'roommates', CASE
      WHEN v_p.room_id IS NOT NULL THEN
        (SELECT coalesce(json_agg(json_build_object(
          'name', pp.name_ar, 'short_ar', pp.short_ar,
          'room_number', r2.number, 'room_floor', r2.floor,
          'bus_name', b2.name,
          'is_family', (pp.family_id IS NOT NULL AND pp.family_id = v_p.family_id)
        )), '[]'::json)
         FROM passengers pp
         LEFT JOIN rooms r2 ON r2.id = pp.room_id
         LEFT JOIN buses b2 ON b2.id = pp.bus_id
         WHERE pp.room_id = v_p.room_id AND pp.id <> v_p.id)
      ELSE '[]'::json END,
    'family', CASE
      WHEN v_p.family_id IS NOT NULL THEN
        (SELECT coalesce(json_agg(json_build_object(
          'name', pp.name_ar, 'short_ar', pp.short_ar,
          'gender', pp.gender,
          'room_number', r2.number, 'room_floor', r2.floor,
          'bus_name', b2.name,
          'camp_mina_name', (SELECT c.name FROM camps c WHERE c.id = pp.camp_mina_id),
          'camp_arafa_name', (SELECT c.name FROM camps c WHERE c.id = pp.camp_arafa_id)
        )), '[]'::json)
         FROM passengers pp
         LEFT JOIN rooms r2 ON r2.id = pp.room_id
         LEFT JOIN buses b2 ON b2.id = pp.bus_id
         WHERE pp.family_id = v_p.family_id AND pp.id <> v_p.id)
      ELSE '[]'::json END,
    'flight_go', (SELECT json_build_object('name', f.name, 'airline', f.airline, 'from_airport', f.from_airport, 'to_airport', f.to_airport, 'date', f.date, 'time', f.time, 'arrival_time', f.arrival_time, 'arrival_date', f.arrival_date, 'class', v_p.flight_class) FROM flights f WHERE f.id = v_p.flight_id),
    'flight_back', (SELECT json_build_object('name', f.name, 'airline', f.airline, 'from_airport', f.from_airport, 'to_airport', f.to_airport, 'date', f.date, 'time', f.time, 'arrival_time', f.arrival_time, 'arrival_date', f.arrival_date, 'class', v_p.flight_class) FROM flights f WHERE f.id = v_p.return_flight_id),
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
      'assets', (SELECT coalesce(jsonb_object_agg(a.asset_key, a.asset_url), '{}'::jsonb) FROM company_assets a)
    ) FROM company_config c ORDER BY c.id LIMIT 1),
    'announcements', (SELECT coalesce(json_agg(json_build_object('id', a.id, 'body', a.body, 'priority', a.priority, 'show_at', a.show_at) ORDER BY (a.priority = 'عاجل') DESC, a.show_at DESC), '[]'::json)
      FROM announcements a
      WHERE a.show_at <= now() AND (a.expires_at IS NULL OR a.expires_at > now()))
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
