-- ════════════════════════════════════════════════════════════
-- تمهيدُ الصلاحيات — يُطبَّق **قبل** إنشاء أيّ كائن
-- ════════════════════════════════════════════════════════════
-- هذا أوّلُ ما يُنفَّذ من خطّ الأساس، ولا يجوز تأخيرُه بحال.
--
-- العلّة (الجولة ٦): نسخةُ سوبابيس المحلّيّة تُنشَأ وفيها صلاحياتٌ
-- افتراضيّةٌ يملكها `postgres` على `public` تمنح **كلَّ شيء**
-- لـ`anon` و`authenticated` و`service_role`. فكلُّ جدولٍ وتسلسلٍ
-- ودالّةٍ يُنشئها خطُّ الأساس **يرث** تلك الصلاحيات لحظةَ الإنشاء.
-- ثمّ تأتي مِنَحُ المستخرَج (`GRANT SELECT …`) فلا تضيف شيئاً:
-- المِنحةُ توسّع ولا تضيّق. فخرجت القاعدةُ المبنيّةُ **أوسعَ**
-- من الحيّة: `anon` يملك كلَّ شيءٍ على ٢٣ علاقة — ومنها
-- `audit_log` و`audit_suppression` — والحيُّ لا يمنحه إلا
-- قراءتَين اثنتين.
--
-- والمشروعُ الحيُّ لا يملك صلاحياتٍ افتراضيّةً لـ`anon` على
-- `public` أصلاً (تُحقَّق قراءةً من `pg_default_acl`).
--
-- ولمَ لا يكفي ما يُخرجه `pg_dump` نفسُه؟ لأنّ `pg_dump` يُصدر
-- `ALTER DEFAULT PRIVILEGES` **بعد** `CREATE TABLE` — أُثبت ذلك
-- تجريبيّاً على عنقودٍ محلّيّ: الإنشاء في السطر ٤٥ والصلاحياتُ
-- الافتراضيّةُ في السطر ١٠٩. فهي تصحّح المستقبلَ ولا ترجع على
-- ما مضى. ولذلك يلزم تحييدُها **قبل** كلّ شيء.
--
-- والإبطالُ هنا لا «يكتم» مِنحةً: يُعيد البيئةَ إلى الحياد فيرث
-- كلُّ كائنٍ لا شيء، ثمّ تُقرّر مِنَحُ المستخرَج وحدَها — وهي
-- كاملةٌ لأنّ `pg_dump` يكتب الصلاحيةَ كاملةً لا فرقاً.
--
-- ⚠️ ولا يُمَسُّ `postgres` (المالك) ولا `PUBLIC`: الأوّلُ مالكٌ
--    ضمناً، والثاني افتراضٌ مُدمَجٌ في بوستجرس نفسِه يطابق الحيّ.

-- شرطٌ مسبَق: الأدوارُ الثلاثةُ موجودة. وغيابُها يعني أنّ الهدفَ
-- ليس نسخةَ سوبابيس، فيسقط الأمرُ صراحةً لا ضمناً.
do $$
declare missing text;
begin
  select string_agg(r, ', ' order by r) into missing
    from unnest(array['anon','authenticated','service_role']) r
   where not exists (select 1 from pg_catalog.pg_roles where rolname = r);
  if missing is not null then
    raise exception 'خطُّ الأساس يلزمُه أدوارُ سوبابيس، وهذه مفقودة: %', missing
      using errcode = 'P0001';
  end if;
end;
$$;

alter default privileges for role postgres in schema public
  revoke all on tables    from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on types     from anon, authenticated, service_role;

-- وبعد هذا: لا صلاحيةَ افتراضيّةً يملكها `postgres` على `public`
-- لهذه الأدوار. يُتحقَّق منه في سير العمل بخطوةٍ مستقلّة.
--
-- PostgreSQL database dump
--

-- \restrict dmNyo0WxflFaeRqaqIBEW2fxiGCC9p8VvlpAW8qZ4PLRyToHWMGWO7zLdAUVv8i

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: _pilgrim_session_owner("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."_pilgrim_session_owner"("p_token" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_hash bytea;
  v_pid  bigint;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return null;
  end if;

  v_hash := extensions.digest(p_token, 'sha256');

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


ALTER FUNCTION "public"."_pilgrim_session_owner"("p_token" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "_pilgrim_session_owner"("p_token" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."_pilgrim_session_owner"("p_token" "text") IS 'س٧ — داخليّة. تُرجع صاحب الجلسة إن كانت صالحة، وتُنزلق الخمول دون تجاوز الحدّ المطلق. بلا منح لأي دور عميل.';


--
-- Name: active_season_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."active_season_id"() RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select s.id from public.seasons s where s.closed_at is null
$$;


ALTER FUNCTION "public"."active_season_id"() OWNER TO "postgres";

--
-- Name: FUNCTION "active_season_id"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."active_season_id"() IS 'معرّف الموسم المفتوح. يُرجع NULL إن لم يوجد موسم مفتوح — وعندها يُرفض أي إدراج جديد بحكم not null.';


--
-- Name: admin_delete_user_profile("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."admin_delete_user_profile"("p_actor" "uuid", "p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if p_actor is null then
    raise exception 'الفاعل مطلوب: لا حذف لملفّ مستخدم بلا إسناد.'
      using errcode = 'P0001';
  end if;

  perform public.set_audit_actor(p_actor);
  delete from public.user_profiles where id = p_id;
end;
$$;


ALTER FUNCTION "public"."admin_delete_user_profile"("p_actor" "uuid", "p_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "admin_delete_user_profile"("p_actor" "uuid", "p_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."admin_delete_user_profile"("p_actor" "uuid", "p_id" "uuid") IS 'يحذف ملفّ المستخدم بفاعلٍ مُثبَت قبل حذف الحساب من auth.users. service_role وحده.';


--
-- Name: admin_write_user_profile("uuid", "text", "uuid", "text", "text", "jsonb", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."admin_write_user_profile"("p_actor" "uuid", "p_mode" "text", "p_id" "uuid", "p_email" "text" DEFAULT NULL::"text", "p_name" "text" DEFAULT NULL::"text", "p_permissions" "jsonb" DEFAULT NULL::"jsonb", "p_is_active" boolean DEFAULT NULL::boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if p_actor is null then
    raise exception 'الفاعل مطلوب: لا كتابة على ملفّات المستخدمين بلا إسناد.'
      using errcode = 'P0001';
  end if;
  if p_mode not in ('insert', 'update') then
    raise exception 'وضع غير معروف: %.', p_mode using errcode = 'P0001';
  end if;

  perform public.set_audit_actor(p_actor);

  if p_mode = 'insert' then
    insert into public.user_profiles (id, email, name, permissions, is_active)
    values (p_id, p_email, p_name, coalesce(p_permissions, '{}'::jsonb), coalesce(p_is_active, true));
  else
    /* NULL = «لم يُرسَل» فلا يُمسّ — لا «امسح القيمة» */
    update public.user_profiles
       set email       = coalesce(p_email, email),
           name        = coalesce(p_name, name),
           permissions = coalesce(p_permissions, permissions),
           is_active   = coalesce(p_is_active, is_active),
           updated_at  = now()
     where id = p_id;

    if not found then
      raise exception 'لا يوجد ملفّ بالمعرّف %.', p_id using errcode = 'P0001';
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."admin_write_user_profile"("p_actor" "uuid", "p_mode" "text", "p_id" "uuid", "p_email" "text", "p_name" "text", "p_permissions" "jsonb", "p_is_active" boolean) OWNER TO "postgres";

--
-- Name: FUNCTION "admin_write_user_profile"("p_actor" "uuid", "p_mode" "text", "p_id" "uuid", "p_email" "text", "p_name" "text", "p_permissions" "jsonb", "p_is_active" boolean); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."admin_write_user_profile"("p_actor" "uuid", "p_mode" "text", "p_id" "uuid", "p_email" "text", "p_name" "text", "p_permissions" "jsonb", "p_is_active" boolean) IS 'كتابة ملفّ مستخدم بفاعلٍ مُثبَت من JWT، في معاملة واحدة مع ضبط الفاعل المفوَّض (ق١). service_role وحده.';


--
-- Name: announcement_audience("text", bigint[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."announcement_audience"("p_target_type" "text", "p_target_ids" bigint[]) RETURNS TABLE("passenger_id" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select p.id from passengers p
  where (
      p.season_id is null
      or p.season_id = (select s.id from seasons s where s.closed_at is null order by s.id desc limit 1)
    )
    and case coalesce(p_target_type, 'all')
          when 'bus'        then p.bus_id        = any(p_target_ids)
          when 'camp_mina'  then p.camp_mina_id  = any(p_target_ids)
          when 'camp_arafa' then p.camp_arafa_id = any(p_target_ids)
          when 'custom'     then p.id            = any(p_target_ids)
          else true
        end;
$$;


ALTER FUNCTION "public"."announcement_audience"("p_target_type" "text", "p_target_ids" bigint[]) OWNER TO "postgres";

--
-- Name: assert_camp_admits(bigint, bigint, bigint, "text", bigint, integer, "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."assert_camp_admits"("p_passenger_id" bigint, "p_camp_id" bigint, "p_pax_season" bigint, "p_pax_gender" "text", "p_camp_season" bigint, "p_camp_cap" integer, "p_camp_name" "text", "p_camp_gender" "text", "p_column" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_occ integer;
begin
  if p_camp_season <> p_pax_season then
    raise exception 'المخيّم «%» يتبع موسماً آخر — لا يُسنَد حاجّ إلى مخيّمٍ خارج موسمه.', p_camp_name
      using errcode = 'P0001';
  end if;

  /* الفصل بالجنس مطلق في هذا الإصدار: «خاص» تصنيفٌ تجاريّ لا
     استثناءٌ من الفصل. كانت الواجهة تجعله يقبل الجنسين، وقرار
     المنتج ألغى ذلك الاستثناء. */
  if p_pax_gender is null or btrim(p_pax_gender) = '' then
    raise exception 'الحاجّ بلا جنسٍ مسجَّل — لا يُسنَد إلى مخيّم قبل تسجيله.'
      using errcode = 'P0001';
  end if;
  if p_camp_gender <> p_pax_gender then
    raise exception 'المخيّم «%» مخيّم %، والحاجّ %. الفصل بالجنس لا يُتجاوز.',
      p_camp_name, p_camp_gender, p_pax_gender using errcode = 'P0001';
  end if;

  if p_camp_cap is null then
    raise exception 'المخيّم «%» بلا سعة محدّدة — حدّد سعته قبل الإسناد.', p_camp_name
      using errcode = 'P0001';
  end if;

  if p_column = 'camp_mina_id' then
    select count(*) into v_occ from public.passengers p
     where p.camp_mina_id = p_camp_id and p.id <> p_passenger_id;
  else
    select count(*) into v_occ from public.passengers p
     where p.camp_arafa_id = p_camp_id and p.id <> p_passenger_id;
  end if;

  if v_occ >= p_camp_cap then
    raise exception 'المخيّم «%» مكتمل (%/%) — لا يتّسع لنازلٍ آخر.', p_camp_name, v_occ, p_camp_cap
      using errcode = 'P0001';
  end if;
end;
$$;


ALTER FUNCTION "public"."assert_camp_admits"("p_passenger_id" bigint, "p_camp_id" bigint, "p_pax_season" bigint, "p_pax_gender" "text", "p_camp_season" bigint, "p_camp_cap" integer, "p_camp_name" "text", "p_camp_gender" "text", "p_column" "text") OWNER TO "postgres";

--
-- Name: audit_log_immutable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."audit_log_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  raise exception 'سجل التدقيق إلحاقيّ: لا تعديل ولا حذف ولا اقتطاع.'
    using errcode = 'P0001';
end;
$$;


ALTER FUNCTION "public"."audit_log_immutable"() OWNER TO "postgres";

--
-- Name: FUNCTION "audit_log_immutable"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."audit_log_immutable"() IS 'يرفض أي تعديل أو حذف أو اقتطاع على audit_log — بلا شرط ولا استثناء ولا راية (ق٩).';


--
-- Name: buses_guard_occupants(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."buses_guard_occupants"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_occ integer;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;
  if new.capacity is not distinct from old.capacity then
    return new;
  end if;

  select count(*) into v_occ from public.passengers p where p.bus_id = new.id;

  if new.capacity < v_occ then
    raise exception 'الباص «%» يضمّ % مسافراً، فلا تُخفَّض سعته إلى %. أخرِج المسافرين أولاً.',
      coalesce(new.name, new.id::text), v_occ, new.capacity using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."buses_guard_occupants"() OWNER TO "postgres";

--
-- Name: camps_assign_sort_order(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."camps_assign_sort_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.sort_order is null or new.sort_order = 0 then
    perform pg_advisory_xact_lock(
      hashtext('camps.sort_order:' || coalesce(new.season_id, 0)::text
               || ':' || coalesce(new.page_type, '') || ':' || coalesce(new.gender, ''))
    );
    select coalesce(max(sort_order), 0) + 10
      into new.sort_order
      from public.camps
     where season_id  is not distinct from new.season_id
       and page_type  is not distinct from new.page_type
       and gender     is not distinct from new.gender;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."camps_assign_sort_order"() OWNER TO "postgres";

--
-- Name: camps_guard_occupants(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."camps_guard_occupants"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_occ integer;
  v_bad integer;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  select count(*) into v_occ from public.passengers p
   where p.camp_mina_id = new.id or p.camp_arafa_id = new.id;

  if v_occ = 0 then
    return new;   -- مخيّمٌ خالٍ: لا نازلَ يُبطله تغيير
  end if;

  if new.capacity is distinct from old.capacity
     and new.capacity is not null and new.capacity < v_occ then
    raise exception 'المخيّم «%» يضمّ % نازلاً، فلا تُخفَّض سعته إلى %. أخرِج النازلين أولاً.',
      coalesce(new.name, new.id::text), v_occ, new.capacity using errcode = 'P0001';
  end if;

  if new.gender is distinct from old.gender then
    select count(*) into v_bad from public.passengers p
     where (p.camp_mina_id = new.id or p.camp_arafa_id = new.id)
       and p.gender is distinct from new.gender;
    if v_bad > 0 then
      raise exception 'المخيّم «%» يضمّ % نازلاً من جنسٍ آخر، فلا يصير مخيّم %. أخرِجهم أولاً.',
        coalesce(new.name, new.id::text), v_bad, new.gender using errcode = 'P0001';
    end if;
  end if;

  if new.page_type is distinct from old.page_type then
    raise exception 'المخيّم «%» يضمّ % نازلاً — لا يُنقل بين منى وعرفة. أخرِجهم أولاً.',
      coalesce(new.name, new.id::text), v_occ using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."camps_guard_occupants"() OWNER TO "postgres";

--
-- Name: close_season("text", integer, "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."close_season"("p_new_name" "text", "p_new_hijri_year" integer, "p_closed_by" "text", "p_actor" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_old     bigint;
  v_new     bigint;
  v_name    text := btrim(coalesce(p_new_name, ''));
  v_old_row jsonb;
  v_priced  int;
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
      'pricing_snapshot',      v_priced)
  );

  return v_new;
end;
$$;


ALTER FUNCTION "public"."close_season"("p_new_name" "text", "p_new_hijri_year" integer, "p_closed_by" "text", "p_actor" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "close_season"("p_new_name" "text", "p_new_hijri_year" integer, "p_closed_by" "text", "p_actor" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."close_season"("p_new_name" "text", "p_new_hijri_year" integer, "p_closed_by" "text", "p_actor" "uuid") IS 'يُقفل الموسم النشط ويفتح موسماً جديداً بسنةٍ هجريّةٍ صريحةٍ واسمِ عرضٍ حرّ، في معاملة واحدة. الأماكنُ تبدأ فارغةً عمداً. الفشل في أي خطوة يُرجع الحالة كما كانت.';


--
-- Name: consume_rate_limit("text", "uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."consume_rate_limit"("p_scope" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_subject is null or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    return false;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.edge_rate_limits as r (scope, subject, window_start, hits)
  values (p_scope, p_subject, v_window, 1)
  on conflict (scope, subject, window_start)
  do update set hits = r.hits + 1
  returning r.hits into v_hits;

  delete from public.edge_rate_limits
   where subject = p_subject and window_start < v_window;

  return v_hits <= p_limit;
end;
$$;


ALTER FUNCTION "public"."consume_rate_limit"("p_scope" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";

--
-- Name: FUNCTION "consume_rate_limit"("p_scope" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."consume_rate_limit"("p_scope" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer) IS 'س٩ — تسجّل استدعاءً وتُرجع true ما دام داخل الحدّ. تُستدعى من دوال Edge بمفتاح الخدمة وحده.';


--
-- Name: create_financial_group_with_member("text", "text", "text", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_financial_group_with_member"("p_name" "text", "p_notes" "text", "p_created_by" "text", "p_passenger_id" integer) RETURNS json
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_group  public.financial_groups;
  v_member public.financial_group_members;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'اسم المجموعة مطلوب' using errcode = '22023';
  end if;

  insert into public.financial_groups (name, notes, created_by)
  values (btrim(p_name), p_notes, p_created_by)
  returning * into v_group;

  insert into public.financial_group_members (group_id, passenger_id)
  values (v_group.id, p_passenger_id)
  returning * into v_member;

  return json_build_object(
    'group',  to_json(v_group),
    'member', to_json(v_member)
  );
end;
$$;


ALTER FUNCTION "public"."create_financial_group_with_member"("p_name" "text", "p_notes" "text", "p_created_by" "text", "p_passenger_id" integer) OWNER TO "postgres";

--
-- Name: create_pilgrim_session("text", integer, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_pilgrim_session"("p_doc" "text", "p_day" integer, "p_month" integer, "p_year" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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

  delete from public.pilgrim_sessions
   where absolute_expires_at < v_now
      or idle_expires_at     < v_now
      or revoked_at is not null;

  v_token := replace(replace(replace(
               encode(extensions.gen_random_bytes(32), 'base64'),
               '+', '-'), '/', '_'), '=', '');
  v_abs   := v_now + interval '90 days';
  v_idle  := least(v_now + interval '30 days', v_abs);

  insert into public.pilgrim_sessions
    (token_hash, passenger_id, season_id, issued_at, idle_expires_at, absolute_expires_at, last_seen_at)
  values
    (extensions.digest(v_token, 'sha256'), v_p.id, v_p.season_id, v_now, v_idle, v_abs, v_now);

  return json_build_object(
    'token', v_token,
    'idle_expires_at', v_idle,
    'absolute_expires_at', v_abs
  );
end;
$$;


ALTER FUNCTION "public"."create_pilgrim_session"("p_doc" "text", "p_day" integer, "p_month" integer, "p_year" integer) OWNER TO "postgres";

--
-- Name: FUNCTION "create_pilgrim_session"("p_doc" "text", "p_day" integer, "p_month" integer, "p_year" integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."create_pilgrim_session"("p_doc" "text", "p_day" integer, "p_month" integer, "p_year" integer) IS 'س٧ — المسار المجهول الوحيد الذي يحوّل «وثيقة + ميلاد» إلى جلسة. حدّ مصدر قبل الإثبات، وحدّ وثيقة عند الفشل وحده، وكلاهما fail-closed.';


--
-- Name: delete_empty_financial_group(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."delete_empty_financial_group"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not exists (
    select 1 from public.financial_group_members
    where group_id = old.group_id
  ) then
    delete from public.financial_groups where id = old.group_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."delete_empty_financial_group"() OWNER TO "postgres";

--
-- Name: delete_season(bigint, "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."delete_season"("p_season_id" bigint, "p_actor" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."delete_season"("p_season_id" bigint, "p_actor" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "delete_season"("p_season_id" bigint, "p_actor" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."delete_season"("p_season_id" bigint, "p_actor" "uuid") IS 'يحذف موسماً مقفلاً وكل بياناته في معاملة واحدة، ويكتب صفّ تدقيق ملخّصاً واحداً بالفاعل وبأعداد الأصناف الاثني عشر كاملةً بعد م٧ — لا صفّاً لكل سطر ساقط. الموسم المفتوح لا يُحذف.';


--
-- Name: flights_guard_occupants(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."flights_guard_occupants"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            declare v_occ integer;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            begin
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  return new;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      /* الإشغال في الساق الموافقة لاتجاه الرحلة. ولا تُجمع الساقان:
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           رحلة ذهاب لا يشير إليها عمود الإياب أصلاً (حارس أعلاه). */
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             select count(*) into v_occ from public.passengers p
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                where p.flight_id = new.id or p.return_flight_id = new.id;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  if v_occ = 0 then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      return new;   -- رحلةٌ خالية: لا مسافرَ يُبطله تغيير
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          if new.capacity is distinct from old.capacity
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               and new.capacity is not null and new.capacity < v_occ then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   raise exception 'الرحلة «%» تضمّ % مسافراً، فلا تُخفَّض مقاعد الحملة إلى %. أخرِج المسافرين أولاً.',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         coalesce(new.name, new.id::text), v_occ, new.capacity using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             if new.type is distinct from old.type then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 raise exception 'الرحلة «%» تضمّ % مسافراً — لا يُقلب اتجاهها. أخرِجهم أولاً.',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       coalesce(new.name, new.id::text), v_occ using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           return new;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           end;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           $$;


ALTER FUNCTION "public"."flights_guard_occupants"() OWNER TO "postgres";

--
-- Name: get_pilgrim_portal_by_session("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_pilgrim_portal_by_session"("p_token" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_pilgrim_portal_by_session"("p_token" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "get_pilgrim_portal_by_session"("p_token" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_pilgrim_portal_by_session"("p_token" "text") IS 'س٧ — إسقاط بوابة الحاجّ بالجلسة. قيمٌ منطقية للمستندات لا مفاتيح. م٧: التنبيهات مرشَّحة بموسم الحاجّ. والاسمُ والأماكنُ من صفّ موسمه لا من إعدادات الحملة.';


--
-- Name: get_portal_announcements(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_portal_announcements"() RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_portal_announcements"() OWNER TO "postgres";

--
-- Name: FUNCTION "get_portal_announcements"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_portal_announcements"() IS 'بوابة الحاج — إسقاط تنبيهات الموسم النشط السارية لـ anon. مدخل مجهول موثَّق (ج٤). م٧: العزل بالموسم لا بانتهاء الصلاحية.';


--
-- Name: has_permission("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."has_permission"("p_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (select up.is_active
              and coalesce((up.permissions ->> p_key)::boolean, false)
       from public.user_profiles up
      where up.id = (select auth.uid())),
    false);
$$;


ALTER FUNCTION "public"."has_permission"("p_key" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "has_permission"("p_key" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."has_permission"("p_key" "text") IS 'نقطة التفويض الوحيدة. تقرأ صلاحية المستخدم الحالي من user_profiles وتفحص is_active. غياب الملفّ أو التعطيل أو غياب المفتاح كلها false.';


--
-- Name: is_active_employee(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_active_employee"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce((select up.is_active from public.user_profiles up where up.id = (select auth.uid())), false);
$$;


ALTER FUNCTION "public"."is_active_employee"() OWNER TO "postgres";

--
-- Name: FUNCTION "is_active_employee"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."is_active_employee"() IS 'هل المستدعي موظّف نشط له ملفّ؟ تُستعمل في سياسات القراءة وحدها — التفويض يمرّ بـ has_permission.';


--
-- Name: mark_pilgrim_notification_read("text", bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."mark_pilgrim_notification_read"("p_token" "text", "p_announcement_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."mark_pilgrim_notification_read"("p_token" "text", "p_announcement_id" bigint) OWNER TO "postgres";

--
-- Name: FUNCTION "mark_pilgrim_notification_read"("p_token" "text", "p_announcement_id" bigint); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."mark_pilgrim_notification_read"("p_token" "text", "p_announcement_id" bigint) IS 'س٧ — تعليم التنبيه مقروءاً بالجلسة. لا تقبل «وثيقة + ميلاد» (إغلاق ف٢).';


--
-- Name: passengers_assign_sort_order(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."passengers_assign_sort_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  is_admin boolean := (new.passenger_type is not null and new.passenger_type <> 'حاج');
begin
  if new.sort_order is null or new.sort_order = 0 then
    perform pg_advisory_xact_lock(
      hashtext('passengers.sort_order:' || coalesce(new.season_id, 0)::text || ':' || is_admin::text)
    );
    select coalesce(max(sort_order), 0) + 10
      into new.sort_order
      from passengers
     where season_id is not distinct from new.season_id
       and (passenger_type is not null and passenger_type <> 'حاج') = is_admin;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."passengers_assign_sort_order"() OWNER TO "postgres";

--
-- Name: FUNCTION "passengers_assign_sort_order"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."passengers_assign_sort_order"() IS 'يمنح الصفّ الجديد آخر موضع في تسلسل سكّانه (حاجّ/إداري) داخل موسمه';


--
-- Name: push_enabled_passengers(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."push_enabled_passengers"() RETURNS TABLE("passenger_id" bigint, "devices" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select s.passenger_id, count(*)::bigint
  from pilgrim_push_subscriptions s
  group by s.passenger_id;
$$;


ALTER FUNCTION "public"."push_enabled_passengers"() OWNER TO "postgres";

--
-- Name: record_audit(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor    uuid;
  v_source   text;
  v_username text;
  v_row      jsonb;
  v_old      jsonb;
  v_new      jsonb;
  v_key      text;
  v_before   jsonb;
  v_after    jsonb;
begin
  /* راية الإيقاف — الاستثناء الوحيد، ونطاقه `delete_season` وحدها.
     والحارس **صلاحية**: `audit_suppression` بلا منح لأي دور، فلا
     يكتب فيها إلا مالك القاعدة. فراية مزوّرة من دور تطبيقيّ **لا
     وجود لها أصلاً** — لا تُقرأ ولا تُكتب (B-1).
     ولا يصحّ هنا فحص الدور: `current_user` داخل هذه الدالة
     `postgres` دائماً لأنها `SECURITY DEFINER`. */
  if exists (select 1 from public.audit_suppression where txid = txid_current()) then
    return null;
  end if;

  v_actor := auth.uid();
  if v_actor is not null then
    v_source := 'session';
  else
    begin
      v_actor := nullif(current_setting('app.audit_actor', true), '')::uuid;
    exception when others then
      v_actor := null;
    end;
    v_source := case when v_actor is not null then 'delegated' else 'system' end;
  end if;

  if v_actor is not null then
    select name into v_username from public.user_profiles where id = v_actor;
  end if;

  /* تقليل البيانات (§١٠ قاعدة ٦):
       insert → new وحده · delete → old كاملاً (وهو الدليل نفسه)
       update → **المفاتيح المتغيّرة وحدها** لا لقطتان كاملتان */
  if TG_OP = 'DELETE' then
    v_row := to_jsonb(OLD);
    v_old := v_row;
  elsif TG_OP = 'INSERT' then
    v_row := to_jsonb(NEW);
    v_new := v_row;
  else
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    v_row    := v_after;
    v_old := '{}'::jsonb;
    v_new := '{}'::jsonb;
    for v_key in select jsonb_object_keys(v_after) loop
      if (v_after -> v_key) is distinct from (v_before -> v_key) then
        v_old := v_old || jsonb_build_object(v_key, v_before -> v_key);
        v_new := v_new || jsonb_build_object(v_key, v_after  -> v_key);
      end if;
    end loop;
    /* تعديلٌ لم يغيّر شيئاً ليس تاريخاً */
    if v_new = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_log (
    actor_id, actor_username, actor_source,
    table_name, row_id, action, season_id, old_value, new_value
  ) values (
    v_actor, v_username, v_source,
    TG_TABLE_NAME,
    coalesce(v_row ->> 'id', ''),
    lower(TG_OP),
    nullif(v_row ->> 'season_id', '')::bigint,
    v_old, v_new
  );

  return null;
end;
$$;


ALTER FUNCTION "public"."record_audit"() OWNER TO "postgres";

--
-- Name: FUNCTION "record_audit"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."record_audit"() IS 'الكاتب الوحيد لـaudit_log. الفاعل من auth.uid() أو من الفاعل المفوَّض، ولا يُقبل من العميل بحال (§١٠ قاعدة ٢).';


--
-- Name: record_season_event("uuid", "text", bigint, "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_season_event"("p_actor" "uuid", "p_action" "text", "p_season_id" bigint, "p_old" "jsonb", "p_new" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_username text;
begin
  if p_actor is not null then
    select name into v_username from public.user_profiles where id = p_actor;
  end if;

  insert into public.audit_log (
    actor_id, actor_username, actor_source,
    table_name, row_id, action, season_id, old_value, new_value
  ) values (
    p_actor, v_username,
    case when p_actor is not null then 'delegated' else 'system' end,
    'seasons', p_season_id::text, p_action, p_season_id, p_old, p_new
  );
end;
$$;


ALTER FUNCTION "public"."record_season_event"("p_actor" "uuid", "p_action" "text", "p_season_id" bigint, "p_old" "jsonb", "p_new" "jsonb") OWNER TO "postgres";

--
-- Name: FUNCTION "record_season_event"("p_actor" "uuid", "p_action" "text", "p_season_id" bigint, "p_old" "jsonb", "p_new" "jsonb"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."record_season_event"("p_actor" "uuid", "p_action" "text", "p_season_id" bigint, "p_old" "jsonb", "p_new" "jsonb") IS 'يكتب صفّ التدقيق الملخّص لعمليتَي الموسم — صفّ واحد لكل عملية لا صفّ لكل سطر ساقط (ق١٠).';


--
-- Name: register_pilgrim_push("text", "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."register_pilgrim_push"("p_token" "text", "p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_platform" "text" DEFAULT 'web'::"text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."register_pilgrim_push"("p_token" "text", "p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_platform" "text", "p_user_agent" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "register_pilgrim_push"("p_token" "text", "p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_platform" "text", "p_user_agent" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."register_pilgrim_push"("p_token" "text", "p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_platform" "text", "p_user_agent" "text") IS 'س٧ — تسجيل جهاز الحاجّ للتنبيهات بالجلسة. لا تقبل «وثيقة + ميلاد» (إغلاق ف١).';


--
-- Name: reject_cross_season_flight(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reject_cross_season_flight"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."reject_cross_season_flight"() OWNER TO "postgres";

--
-- Name: FUNCTION "reject_cross_season_flight"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."reject_cross_season_flight"() IS 'م٧ — يمنع إسناد حاجّ إلى رحلة من موسم آخر، في الساقين معاً. حدّ السلامة في القاعدة؛ ترشيح الواجهة دفاعٌ في العمق فوقه.';


--
-- Name: reject_invalid_allocation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reject_invalid_allocation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_season   bigint;
  v_cap      integer;
  v_name     text;
  v_gender   text;
  v_page     text;
  v_occ      integer;
  v_changed  boolean;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  -- ── الباص ──────────────────────────────────────────────────
  v_changed := tg_op = 'INSERT'
            or new.bus_id    is distinct from old.bus_id
            or new.season_id is distinct from old.season_id;

  if new.bus_id is not null and v_changed then
    select b.season_id, b.capacity, b.name into v_season, v_cap, v_name
      from public.buses b where b.id = new.bus_id for update;

    if not found then
      raise exception 'الباص رقم % غير موجود.', new.bus_id using errcode = 'P0001';
    end if;
    if v_season <> new.season_id then
      raise exception 'الباص «%» يتبع موسماً آخر — لا يُسنَد حاجّ إلى باصٍ خارج موسمه.', v_name
        using errcode = 'P0001';
    end if;

    select count(*) into v_occ
      from public.passengers p where p.bus_id = new.bus_id and p.id <> new.id;

    if v_occ >= v_cap then
      raise exception 'الباص «%» مكتمل (%/%) — لا يتّسع لمسافرٍ آخر.', v_name, v_occ, v_cap
        using errcode = 'P0001';
    end if;
  end if;

  -- ── مخيّم منى ──────────────────────────────────────────────
  v_changed := tg_op = 'INSERT'
            or new.camp_mina_id is distinct from old.camp_mina_id
            or new.season_id    is distinct from old.season_id
            or new.gender       is distinct from old.gender;

  if new.camp_mina_id is not null and v_changed then
    select c.season_id, c.capacity, c.name, c.gender, c.page_type
      into v_season, v_cap, v_name, v_gender, v_page
      from public.camps c where c.id = new.camp_mina_id for update;

    if not found then
      raise exception 'المخيّم رقم % غير موجود.', new.camp_mina_id using errcode = 'P0001';
    end if;
    if v_page <> 'منى' then
      raise exception 'المخيّم «%» من مخيّمات % — لا يُسنَد في عمود منى.', v_name, v_page
        using errcode = 'P0001';
    end if;
    perform public.assert_camp_admits(
      new.id, new.camp_mina_id, new.season_id, new.gender,
      v_season, v_cap, v_name, v_gender, 'camp_mina_id');
  end if;

  -- ── مخيّم عرفة ─────────────────────────────────────────────
  v_changed := tg_op = 'INSERT'
            or new.camp_arafa_id is distinct from old.camp_arafa_id
            or new.season_id     is distinct from old.season_id
            or new.gender        is distinct from old.gender;

  if new.camp_arafa_id is not null and v_changed then
    select c.season_id, c.capacity, c.name, c.gender, c.page_type
      into v_season, v_cap, v_name, v_gender, v_page
      from public.camps c where c.id = new.camp_arafa_id for update;

    if not found then
      raise exception 'المخيّم رقم % غير موجود.', new.camp_arafa_id using errcode = 'P0001';
    end if;
    if v_page <> 'عرفة' then
      raise exception 'المخيّم «%» من مخيّمات % — لا يُسنَد في عمود عرفة.', v_name, v_page
        using errcode = 'P0001';
    end if;
    perform public.assert_camp_admits(
      new.id, new.camp_arafa_id, new.season_id, new.gender,
      v_season, v_cap, v_name, v_gender, 'camp_arafa_id');
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."reject_invalid_allocation"() OWNER TO "postgres";

--
-- Name: reject_invalid_flight_booking(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reject_invalid_flight_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
                                                                                                                                                                                                                                                                                                                  declare
                                                                                                                                                                                                                                                                                                                    v_cap     integer;
                                                                                                                                                                                                                                                                                                                      v_name    text;
                                                                                                                                                                                                                                                                                                                        v_type    text;
                                                                                                                                                                                                                                                                                                                          v_season  bigint;
                                                                                                                                                                                                                                                                                                                            v_occ     integer;
                                                                                                                                                                                                                                                                                                                              v_changed boolean;
                                                                                                                                                                                                                                                                                                                                v_want    text;
                                                                                                                                                                                                                                                                                                                                begin
                                                                                                                                                                                                                                                                                                                                  -- مَنفذ الصيانة — `delete_season()` وحدها تفتحه
                                                                                                                                                                                                                                                                                                                                    if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
                                                                                                                                                                                                                                                                                                                                        return new;
                                                                                                                                                                                                                                                                                                                                          end if;

                                                                                                                                                                                                                                                                                                                                            /* الدرجة المدفوعة: «درجة أولى» أو «عادي». والفارغ عاديّ — وهو
                                                                                                                                                                                                                                                                                                                                                 حال الصفوف السابقة لعمود الخدمة. */
                                                                                                                                                                                                                                                                                                                                                   v_want := case when new.flight = 'درجة أولى' then 'درجة أولى' else 'عادي' end;

                                                                                                                                                                                                                                                                                                                                                     -- ── ساق الذهاب ─────────────────────────────────────────────
                                                                                                                                                                                                                                                                                                                                                       v_changed := tg_op = 'INSERT'
                                                                                                                                                                                                                                                                                                                                                                   or new.flight_id is distinct from old.flight_id
                                                                                                                                                                                                                                                                                                                                                                               or new.season_id is distinct from old.season_id
                                                                                                                                                                                                                                                                                                                                                                                           or new.flight    is distinct from old.flight;

                                                                                                                                                                                                                                                                                                                                                                                             if new.flight_id is not null and v_changed then
                                                                                                                                                                                                                                                                                                                                                                                                 /* «بدون» استبعادٌ صلب: لا تأكيدَ يتجاوزه ولا «وزّع على أي حال».
                                                                                                                                                                                                                                                                                                                                                                                                        التذكرة تُخصم قيمتها ممّا على الحاجّ، وهو خارج كشف الحجز. */
                                                                                                                                                                                                                                                                                                                                                                                                            if new.flight = 'بدون' then
                                                                                                                                                                                                                                                                                                                                                                                                                  raise exception 'الحاجّ طلب «بدون طيران» — لا تُحجَز له تذكرة ولا يُسنَد إلى رحلة.'
                                                                                                                                                                                                                                                                                                                                                                                                                          using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                              end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                  select f.capacity, f.name, f.type, f.season_id into v_cap, v_name, v_type, v_season
                                                                                                                                                                                                                                                                                                                                                                                                                                        from public.flights f where f.id = new.flight_id for update;

                                                                                                                                                                                                                                                                                                                                                                                                                                            if not found then
                                                                                                                                                                                                                                                                                                                                                                                                                                                  raise exception 'رحلة الذهاب رقم % غير موجودة.', new.flight_id using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                      end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                          if v_type <> 'ذهاب' then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                raise exception 'الرحلة «%» رحلةُ %، فلا تُسنَد في عمود الذهاب.', v_name, v_type using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                        if v_season <> new.season_id then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                              raise exception 'الرحلة «%» تتبع موسماً آخر — لا يُسنَد مسافر إلى رحلةٍ خارج موسمه.', v_name
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              if v_cap is null then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    raise exception 'الرحلة «%» بلا مقاعد محدَّدة للحملة — حدّد عددها قبل الإسناد.', v_name
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    select count(*) into v_occ from public.passengers p
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         where p.flight_id = new.flight_id and p.id <> new.id;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             if v_occ >= v_cap then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   raise exception 'الرحلة «%» مكتملة (%/% من مقاعد الحملة) — لا تتّسع لمسافرٍ آخر.', v_name, v_occ, v_cap
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   -- ── ساق الإياب ─────────────────────────────────────────────
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     v_changed := tg_op = 'INSERT'
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 or new.return_flight_id is distinct from old.return_flight_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             or new.season_id        is distinct from old.season_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         or new.flight           is distinct from old.flight;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           if new.return_flight_id is not null and v_changed then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               if new.flight = 'بدون' then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     raise exception 'الحاجّ طلب «بدون طيران» — لا تُحجَز له تذكرة ولا يُسنَد إلى رحلة.'
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     select f.capacity, f.name, f.type, f.season_id into v_cap, v_name, v_type, v_season
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           from public.flights f where f.id = new.return_flight_id for update;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               if not found then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     raise exception 'رحلة العودة رقم % غير موجودة.', new.return_flight_id using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             if v_type <> 'إياب' then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   raise exception 'الرحلة «%» رحلةُ %، فلا تُسنَد في عمود الإياب.', v_name, v_type using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           if v_season <> new.season_id then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 raise exception 'الرحلة «%» تتبع موسماً آخر — لا يُسنَد مسافر إلى رحلةٍ خارج موسمه.', v_name
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 if v_cap is null then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       raise exception 'الرحلة «%» بلا مقاعد محدَّدة للحملة — حدّد عددها قبل الإسناد.', v_name
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       select count(*) into v_occ from public.passengers p
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            where p.return_flight_id = new.return_flight_id and p.id <> new.id;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                if v_occ >= v_cap then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      raise exception 'الرحلة «%» مكتملة (%/% من مقاعد الحملة) — لا تتّسع لمسافرٍ آخر.', v_name, v_occ, v_cap
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      -- ── الدرجة المحجوزة تتبع المدفوعة ──────────────────────────
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        -- `flight_class` ليست قراراً للموظّف: تُشتقّ من المدفوع كلّما وُجدت
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          -- ساق، وتُمحى إذا خلت الساقان — فلا تبقى حالةُ حجزٍ بلا حجز.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            -- ويبقى المرفوض هو الكتابةُ الصريحة المخالفة وحدها؛ أما القيمةُ
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              -- الموروثة التي تقادمت بتغيُّر المدفوع فتُصحَّح ولا تُجمِّد الصفّ.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                if new.flight_id is not null or new.return_flight_id is not null then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    /* «صريحة» = قيمةٌ غير فارغةٍ جاءت في هذه الجملة نفسها: كلُّ
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           قيمةٍ في الإدراج، وفي التحديث ما خالف `old` وحده. */
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               if new.flight_class is not null and new.flight_class <> v_want
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      and (tg_op = 'INSERT' or new.flight_class is distinct from old.flight_class) then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            raise exception 'الدرجة المحجوزة «%» تخالف المدفوعة «%» — لا تُحجَز درجةٌ غير التي دُفعت.',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    new.flight_class, v_want using errcode = 'P0001';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            new.flight_class := v_want;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              else
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  new.flight_class := null;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      return new;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      end;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      $$;


ALTER FUNCTION "public"."reject_invalid_flight_booking"() OWNER TO "postgres";

--
-- Name: reject_room_over_capacity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reject_room_over_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_cap integer;
  v_num text;
  v_type text;
  v_occ integer;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  if new.room_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.room_id is not distinct from old.room_id then
    return new;
  end if;

  select r.capacity, r.number, r.type
    into v_cap, v_num, v_type
    from public.rooms r
   where r.id = new.room_id
   for update;

  if not found then
    raise exception 'الغرفة رقم % غير موجودة.', new.room_id
      using errcode = 'P0001';
  end if;

  if v_cap is null then
    raise exception 'الغرفة % بلا سعة محدّدة — حدّد سعتها قبل الإسناد.',
      coalesce(v_num, new.room_id::text)
      using errcode = 'P0001';
  end if;

  if v_cap = 0 then
    raise exception 'الغرفة % من نوع «%» ولا تستقبل نزلاء.',
      coalesce(v_num, new.room_id::text), coalesce(v_type, '؟')
      using errcode = 'P0001';
  end if;

  select count(*) into v_occ
    from public.passengers p
   where p.room_id = new.room_id
     and p.id <> new.id;

  if v_occ >= v_cap then
    raise exception 'الغرفة % مكتملة (%/%) — لا تتّسع لنزيلٍ آخر.',
      coalesce(v_num, new.room_id::text), v_occ, v_cap
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."reject_room_over_capacity"() OWNER TO "postgres";

--
-- Name: reject_write_closed_season(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reject_write_closed_season"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_closed timestamptz;
  v_name   text;
begin
  -- مَنفذ الصيانة: delete_season() وحدها تفتحه، وهو معاملة المدى
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- الخروج من موسم مقفل ممنوع كالبقاء فيه
  if tg_op in ('UPDATE', 'DELETE') then
    select s.closed_at, s.name into v_closed, v_name
      from public.seasons s where s.id = old.season_id for share;
    if v_closed is not null then
      raise exception 'موسم % مقفل — لا يمكن تعديل بياناته أو حذفها.', v_name
        using errcode = 'P0001';
    end if;
  end if;

  -- والدخول إليه ممنوع كذلك
  if tg_op in ('INSERT', 'UPDATE') then
    select s.closed_at, s.name into v_closed, v_name
      from public.seasons s where s.id = new.season_id for share;
    if v_closed is not null then
      raise exception 'موسم % مقفل — لا يمكن إضافة بيانات إليه.', v_name
        using errcode = 'P0001';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."reject_write_closed_season"() OWNER TO "postgres";

--
-- Name: reject_write_closed_season_derived(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reject_write_closed_season_derived"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_closed timestamptz;
  v_name   text;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select s.closed_at, s.name into v_closed, v_name
      from public.passengers p
      join public.seasons s on s.id = p.season_id
      where p.id = old.passenger_id
      for share of s;
    if v_closed is not null then
      raise exception 'الحاج يتبع موسم % المقفل — لا يمكن تعديل بياناته أو حذفها.', v_name
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select s.closed_at, s.name into v_closed, v_name
      from public.passengers p
      join public.seasons s on s.id = p.season_id
      where p.id = new.passenger_id
      for share of s;
    if v_closed is not null then
      raise exception 'الحاج يتبع موسم % المقفل — لا يمكن إضافة بيانات له.', v_name
        using errcode = 'P0001';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."reject_write_closed_season_derived"() OWNER TO "postgres";

--
-- Name: revoke_pilgrim_session("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."revoke_pilgrim_session"("p_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."revoke_pilgrim_session"("p_token" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "revoke_pilgrim_session"("p_token" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."revoke_pilgrim_session"("p_token" "text") IS 'س٧ — إبطال جلسة البوابة (الخروج). تُرجع true دائماً كي لا تكون مخبراً عن صلاحية الرموز.';


--
-- Name: room_type_capacity("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."room_type_capacity"("p_type" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case btrim(coalesce(p_type, ''))
    when 'فردية'  then 1
    when 'ثنائية' then 2
    when 'ثلاثية' then 3
    when 'رباعية' then 4
    when 'مجلس'   then 0
    else null
  end;
$$;


ALTER FUNCTION "public"."room_type_capacity"("p_type" "text") OWNER TO "postgres";

--
-- Name: rooms_apply_capacity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rooms_apply_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_std integer;
begin
  v_std := public.room_type_capacity(new.type);

  if v_std is not null then
    new.capacity := v_std;
  else
    if new.capacity is null or new.capacity < 1 then
      raise exception 'غرفة «%» تحتاج سعةً صريحة أكبر من صفر.', coalesce(new.type, '؟')
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."rooms_apply_capacity"() OWNER TO "postgres";

--
-- Name: rooms_capacity_not_below_occupancy(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rooms_capacity_not_below_occupancy"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_occ integer;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.capacity is not distinct from old.capacity then
    return new;
  end if;

  select count(*) into v_occ
    from public.passengers p
   where p.room_id = new.id;

  if new.capacity < v_occ then
    raise exception 'الغرفة % تضمّ % نزيلاً، فلا تُخفَّض سعتها إلى %. أخرِج النزلاء أولاً.',
      coalesce(new.number, new.id::text), v_occ, new.capacity
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."rooms_capacity_not_below_occupancy"() OWNER TO "postgres";

--
-- Name: set_audit_actor("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_audit_actor"("p_actor" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select set_config('app.audit_actor', coalesce(p_actor::text, ''), true);
$$;


ALTER FUNCTION "public"."set_audit_actor"("p_actor" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "set_audit_actor"("p_actor" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."set_audit_actor"("p_actor" "uuid") IS 'يضبط الفاعل المفوَّض **محليّاً بالمعاملة** (§١٠.١ الضابط ٣). لا يعيش بعدها، ولا يُستدعى إلا من داخل الدالة التي تنفّذ العملية نفسها.';


--
-- Name: unregister_pilgrim_push("text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."unregister_pilgrim_push"("p_token" "text", "p_endpoint" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_pid bigint;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then return false; end if;

  delete from public.pilgrim_push_subscriptions
   where endpoint = p_endpoint and passenger_id = v_pid;

  return true;
end;
$$;


ALTER FUNCTION "public"."unregister_pilgrim_push"("p_token" "text", "p_endpoint" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "unregister_pilgrim_push"("p_token" "text", "p_endpoint" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."unregister_pilgrim_push"("p_token" "text", "p_endpoint" "text") IS 'س٧ — إلغاء اشتراك التنبيهات بالجلسة، ولحاجّ الجلسة وحده (إغلاق ف٥).';


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: seasons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."seasons" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "closed_by" "text",
    "hijri_year" integer NOT NULL,
    "hotel_name" "text",
    "hotel_address" "text",
    "hotel_url" "text",
    "mina_address" "text",
    "mina_url" "text",
    "arafa_address" "text",
    "arafa_url" "text",
    CONSTRAINT "seasons_hijri_year_valid" CHECK ((("hijri_year" > 0) AND ("hijri_year" < 10000)))
);


ALTER TABLE "public"."seasons" OWNER TO "postgres";

--
-- Name: COLUMN "seasons"."name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."seasons"."name" IS 'اسمُ العرض كما كتبه المدير، حرفاً بحرف. نصٌّ حرٌّ غيرُ فريد — التفرّدُ على hijri_year.';


--
-- Name: COLUMN "seasons"."hijri_year"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."seasons"."hijri_year" IS 'سنةُ الحجّ الهجريّة — هويّةُ الموسم. فريدةٌ ولا تُشتقّ من الاسم أبداً.';


--
-- Name: COLUMN "seasons"."hotel_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."seasons"."hotel_name" IS 'فندقُ هذا الموسم — يبقى مع الموسم بعد إقفاله.';


--
-- Name: COLUMN "seasons"."hotel_address"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."seasons"."hotel_address" IS 'عنوانُ فندق هذا الموسم.';


--
-- Name: COLUMN "seasons"."hotel_url"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."seasons"."hotel_url" IS 'رابطُ فندق هذا الموسم على الخريطة.';


--
-- Name: COLUMN "seasons"."mina_address"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."seasons"."mina_address" IS 'عنوانُ موقع منى العامّ لهذا الموسم — لا عنوانُ مخيّم بعينه.';


--
-- Name: COLUMN "seasons"."mina_url"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."seasons"."mina_url" IS 'رابطُ موقع منى العامّ على الخريطة.';


--
-- Name: COLUMN "seasons"."arafa_address"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."seasons"."arafa_address" IS 'عنوانُ موقع عرفات العامّ لهذا الموسم.';


--
-- Name: COLUMN "seasons"."arafa_url"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."seasons"."arafa_url" IS 'رابطُ موقع عرفات العامّ على الخريطة.';


--
-- Name: update_active_season("text", "text", "text", "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_active_season"("p_name" "text", "p_hotel_name" "text", "p_hotel_address" "text", "p_hotel_url" "text", "p_mina_address" "text", "p_mina_url" "text", "p_arafa_address" "text", "p_arafa_url" "text") RETURNS "public"."seasons"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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

  /* `closed_at is null` هو الحارسان في شرطٍ واحد: «النشطُ وحده
     يُعدَّل» و«المؤرشفُ لا يُمَسّ». وفهرسُ seasons_one_open_idx
     يضمن أنّ الشرط يطابق صفّاً واحداً على الأكثر. */
  update public.seasons
     set name          = v_name,
         hotel_name    = nullif(btrim(coalesce(p_hotel_name,    '')), ''),
         hotel_address = nullif(btrim(coalesce(p_hotel_address, '')), ''),
         hotel_url     = nullif(btrim(coalesce(p_hotel_url,     '')), ''),
         mina_address  = nullif(btrim(coalesce(p_mina_address,  '')), ''),
         mina_url      = nullif(btrim(coalesce(p_mina_url,      '')), ''),
         arafa_address = nullif(btrim(coalesce(p_arafa_address, '')), ''),
         arafa_url     = nullif(btrim(coalesce(p_arafa_url,     '')), '')
   where closed_at is null
   returning * into v_row;

  /* صفرُ صفوفٍ خطأٌ لا نجاح. */
  if not found then
    raise exception 'لا يوجد موسم مفتوح لتعديله.' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."update_active_season"("p_name" "text", "p_hotel_name" "text", "p_hotel_address" "text", "p_hotel_url" "text", "p_mina_address" "text", "p_mina_url" "text", "p_arafa_address" "text", "p_arafa_url" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "update_active_season"("p_name" "text", "p_hotel_name" "text", "p_hotel_address" "text", "p_hotel_url" "text", "p_mina_address" "text", "p_mina_url" "text", "p_arafa_address" "text", "p_arafa_url" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."update_active_season"("p_name" "text", "p_hotel_name" "text", "p_hotel_address" "text", "p_hotel_url" "text", "p_mina_address" "text", "p_mina_url" "text", "p_arafa_address" "text", "p_arafa_url" "text") IS 'تعديلُ بيانات الموسم النشط الرئيسة — اسمُ العرض والفندقُ ومنى وعرفة. يشترط manage_users، ويعمل على الموسم المفتوح وحده، ويعيد الصفَّ برهاناً على الأثر. لا يمسّ hijri_year.';


--
-- Name: company_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."company_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "name_ar" "text" DEFAULT 'نظام الحج'::"text" NOT NULL,
    "name_en" "text" DEFAULT 'Hajj System'::"text",
    "tagline" "text" DEFAULT 'نظام إدارة الحج'::"text",
    "color_primary" "text" DEFAULT '#1D9E75'::"text",
    "color_accent" "text" DEFAULT '#085041'::"text",
    "color_sidebar" "text" DEFAULT '#f9f9f9'::"text",
    "contact_phone" "text",
    "contact_email" "text",
    "banner_position" "text" DEFAULT 'center'::"text",
    "banner_position_x" "text" DEFAULT '50'::"text",
    "admin_name" "text",
    "admin_phone" "text",
    "admin_whatsapp" "text",
    "country" "text",
    "city" "text",
    "bank_name" "text",
    "bank_account_name" "text",
    "bank_account_number" "text",
    "bank_iban" "text",
    "bank_swift" "text",
    "portal_welcome_message" "text",
    "portal_help_message" "text",
    "portal_settings" "jsonb" DEFAULT '{"buses": true, "rooms": true, "flights": true, "qr_codes": true, "documents": true, "lost_card": true, "roommates": true, "notifications": true, "pdf_downloads": true, "financial_balance": false}'::"jsonb" NOT NULL,
    "commercial_registration" "text"
);


ALTER TABLE "public"."company_config" OWNER TO "postgres";

--
-- Name: COLUMN "company_config"."commercial_registration"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."company_config"."commercial_registration" IS 'رقمُ السجلّ التجاريّ للحملة — بيانُ شركةٍ عابرٌ للمواسم. لا يُعرَض في company_profile_public.';


--
-- Name: update_portal_settings("jsonb", "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_portal_settings"("p_portal_settings" "jsonb", "p_portal_welcome_message" "text", "p_portal_help_message" "text", "p_admin_name" "text", "p_admin_phone" "text", "p_admin_whatsapp" "text") RETURNS "public"."company_config"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_row public.company_config;
begin
  if not public.has_permission('manage_portal') then
    raise exception 'ليست لديك صلاحية إدارة بوابة الحاج.'
      using errcode = '42501';
  end if;

  update public.company_config
     set portal_settings        = coalesce(p_portal_settings, '{}'::jsonb),
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


ALTER FUNCTION "public"."update_portal_settings"("p_portal_settings" "jsonb", "p_portal_welcome_message" "text", "p_portal_help_message" "text", "p_admin_name" "text", "p_admin_phone" "text", "p_admin_whatsapp" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "update_portal_settings"("p_portal_settings" "jsonb", "p_portal_welcome_message" "text", "p_portal_help_message" "text", "p_admin_name" "text", "p_admin_phone" "text", "p_admin_whatsapp" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."update_portal_settings"("p_portal_settings" "jsonb", "p_portal_welcome_message" "text", "p_portal_help_message" "text", "p_admin_name" "text", "p_admin_phone" "text", "p_admin_whatsapp" "text") IS 'إعداداتُ بوابة الحاج — البابُ الوحيد لـmanage_portal إلى company_config. ستّةُ حقولٍ معلَنةٌ في التوقيع، والحارسُ داخل الجسم، والصفُّ المعاد برهانُ الأثر. ولا تُوسَّع سياسةُ الجدول.';


--
-- Name: verify_pilgrim_session("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."verify_pilgrim_session"("p_token" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  return public._pilgrim_session_owner(p_token);
end;
$$;


ALTER FUNCTION "public"."verify_pilgrim_session"("p_token" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "verify_pilgrim_session"("p_token" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."verify_pilgrim_session"("p_token" "text") IS 'س٧ — تتحقّق من جلسة البوابة وتُرجع صاحبها. لـpilgrim-doc بمفتاح الخدمة وحده — لا يبلغها عميل.';


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" bigint NOT NULL,
    "body" "text" NOT NULL,
    "priority" "text" DEFAULT 'عام'::"text" NOT NULL,
    "show_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "title" "text",
    "target_type" "text" DEFAULT 'all'::"text" NOT NULL,
    "target_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    "push_sent_at" timestamp with time zone,
    "season_id" bigint DEFAULT "public"."active_season_id"() NOT NULL
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";

--
-- Name: COLUMN "announcements"."season_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."announcements"."season_id" IS 'م٧ — الموسم المخاطَب بالتنبيه. عزل الموسم لا يعتمد على expires_at: تنبيهٌ بلا انتهاء يبقى داخل موسمه وحده.';


--
-- Name: announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."announcements" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."announcements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid",
    "actor_username" "text",
    "actor_source" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "row_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "season_id" bigint,
    "old_value" "jsonb",
    "new_value" "jsonb",
    CONSTRAINT "audit_log_action_chk" CHECK (("action" = ANY (ARRAY['insert'::"text", 'update'::"text", 'delete'::"text"]))),
    CONSTRAINT "audit_log_actor_source_chk" CHECK (("actor_source" = ANY (ARRAY['session'::"text", 'delegated'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";

--
-- Name: TABLE "audit_log"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."audit_log" IS 'سجل تدقيق إلحاقيّ — س٨. لا تعديل ولا حذف ولا اقتطاع لأي دور تطبيقيّ. الاحتفاظ: خمس سنوات بعد نهاية الموسم، أو من at لما لا موسم له. والآلية تُصمَّم مستقلّة (Security Architecture v1.6 §١٠).';


--
-- Name: COLUMN "audit_log"."actor_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."audit_log"."actor_id" IS 'بلا مفتاح أجنبي عمداً — الصفّ يبقى بعد حذف حساب الموظّف.';


--
-- Name: COLUMN "audit_log"."actor_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."audit_log"."actor_source" IS 'مصدر الإسناد: session = auth.uid() · delegated = فاعلٌ أُثبت من JWT ومُرِّر داخل الخادم · system = غير مُسنَد إلى شخص (لوحة التحكّم · مفتاح الخدمة · أداة الطوارئ).';


--
-- Name: COLUMN "audit_log"."season_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."audit_log"."season_id" IS 'بلا مفتاح أجنبي عمداً — الصفّ يبقى بعد حذف الموسم. ويكون NULL لجدول بلا عمود موسم (payments · custom_charges · user_profiles)، فيسري عليه حدّ الاحتفاظ الزمنيّ.';


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_suppression; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."audit_suppression" (
    "txid" bigint NOT NULL
);


ALTER TABLE "public"."audit_suppression" OWNER TO "postgres";

--
-- Name: TABLE "audit_suppression"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."audit_suppression" IS 'راية إيقاف المحفّزات الصفّية داخل delete_season وحدها. بلا منح لأي دور — ولا service_role — فلا يكتب فيها إلا مالك القاعدة عبر دالة SECURITY DEFINER (B-1).';


--
-- Name: buses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."buses" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    "type" "text" DEFAULT 'عادي'::"text",
    "season_id" bigint DEFAULT "public"."active_season_id"() NOT NULL,
    "capacity" integer DEFAULT 50 NOT NULL,
    CONSTRAINT "buses_capacity_positive" CHECK (("capacity" >= 1)),
    CONSTRAINT "buses_name_present" CHECK ((("name" IS NOT NULL) AND ("btrim"("name") <> ''::"text")))
);


ALTER TABLE "public"."buses" OWNER TO "postgres";

--
-- Name: buses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."buses" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."buses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: camps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."camps" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    "gender" "text" NOT NULL,
    "type" "text" DEFAULT 'عادي'::"text",
    "page_type" "text" NOT NULL,
    "season_id" bigint DEFAULT "public"."active_season_id"() NOT NULL,
    "capacity" integer,
    "sort_order" integer,
    CONSTRAINT "camps_capacity_positive" CHECK ((("capacity" IS NULL) OR ("capacity" >= 1))),
    CONSTRAINT "camps_gender_vocab" CHECK (("gender" = ANY (ARRAY['ذكر'::"text", 'أنثى'::"text"]))),
    CONSTRAINT "camps_name_present" CHECK ((("name" IS NOT NULL) AND ("btrim"("name") <> ''::"text"))),
    CONSTRAINT "camps_page_type_vocab" CHECK (("page_type" = ANY (ARRAY['منى'::"text", 'عرفة'::"text"])))
);


ALTER TABLE "public"."camps" OWNER TO "postgres";

--
-- Name: COLUMN "camps"."capacity"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."camps"."capacity" IS 'سعة المخيّم — يُدخِلها الموظّف، لا تُستنبط من نوعٍ. null = غير محدّدة: لا تقبل إسناداً حتى تُحدَّد.';


--
-- Name: COLUMN "camps"."sort_order"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."camps"."sort_order" IS 'ترتيب المخيّم داخل مجموعته (الموسم · نوع الصفحة · الجنس) — قرارٌ تشغيليّ يملكه الموظّف. ليس فريداً، والفجوات مقبولة، و`id` يحسم التساوي. ⚠️ لا يُخلَط مع passengers.camp_mina_sort_order / camp_arafa_sort_order: تلك ترتيب النازلين داخل مخيّم، وهذا ترتيب المخيّمات نفسها.';


--
-- Name: camps_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."camps" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."camps_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: company_assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."company_assets" (
    "asset_key" "text" NOT NULL,
    "asset_url" "text" NOT NULL,
    "alt_text" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "company_assets_key_format" CHECK (("asset_key" ~ '^[a-z][a-z0-9_]*$'::"text")),
    CONSTRAINT "company_assets_url_not_blank" CHECK (("btrim"("asset_url") <> ''::"text"))
);


ALTER TABLE "public"."company_assets" OWNER TO "postgres";

--
-- Name: TABLE "company_assets"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."company_assets" IS 'Deployment-level company assets. Keys are extensible without schema changes.';


--
-- Name: company_profile_public; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."company_profile_public" WITH ("security_invoker"='false') AS
 SELECT "id",
    "name_ar",
    "name_en",
    "tagline",
    "color_primary",
    "color_accent",
    "color_sidebar"
   FROM "public"."company_config"
  WHERE ("id" = 1);


ALTER VIEW "public"."company_profile_public" OWNER TO "postgres";

--
-- Name: custom_charges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."custom_charges" (
    "id" integer NOT NULL,
    "passenger_id" integer NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "type" "text" NOT NULL,
    "notes" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "custom_charges_type_check" CHECK (("type" = ANY (ARRAY['إضافة'::"text", 'خصم'::"text"])))
);


ALTER TABLE "public"."custom_charges" OWNER TO "postgres";

--
-- Name: custom_charges_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE IF NOT EXISTS "public"."custom_charges_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."custom_charges_id_seq" OWNER TO "postgres";

--
-- Name: custom_charges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."custom_charges_id_seq" OWNED BY "public"."custom_charges"."id";


--
-- Name: edge_rate_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."edge_rate_limits" (
    "scope" "text" NOT NULL,
    "subject" "uuid" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "hits" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."edge_rate_limits" OWNER TO "postgres";

--
-- Name: TABLE "edge_rate_limits"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."edge_rate_limits" IS 'س٩ — عدّادات حدّ الاستدعاءات لدوال Edge. لا يقرؤها ولا يكتبها عميل: service_role وحده عبر consume_rate_limit().';


--
-- Name: financial_group_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."financial_group_members" (
    "id" integer NOT NULL,
    "group_id" integer NOT NULL,
    "passenger_id" integer NOT NULL
);


ALTER TABLE "public"."financial_group_members" OWNER TO "postgres";

--
-- Name: financial_group_members_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE IF NOT EXISTS "public"."financial_group_members_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."financial_group_members_id_seq" OWNER TO "postgres";

--
-- Name: financial_group_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."financial_group_members_id_seq" OWNED BY "public"."financial_group_members"."id";


--
-- Name: financial_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."financial_groups" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "notes" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."financial_groups" OWNER TO "postgres";

--
-- Name: financial_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE IF NOT EXISTS "public"."financial_groups_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."financial_groups_id_seq" OWNER TO "postgres";

--
-- Name: financial_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."financial_groups_id_seq" OWNED BY "public"."financial_groups"."id";


--
-- Name: flights; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."flights" (
    "id" bigint NOT NULL,
    "name" "text",
    "airline" "text",
    "date" "text",
    "time" "text",
    "from_airport" "text",
    "to_airport" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text" NOT NULL,
    "arrival_time" "text",
    "arrival_date" "text",
    "season_id" bigint DEFAULT "public"."active_season_id"() NOT NULL,
    "capacity" integer,
    CONSTRAINT "flights_capacity_positive" CHECK ((("capacity" IS NULL) OR ("capacity" >= 1))),
    CONSTRAINT "flights_identity_present" CHECK ((("name" IS NOT NULL) AND ("btrim"("name") <> ''::"text") AND ("date" IS NOT NULL) AND ("btrim"("date") <> ''::"text") AND ("time" IS NOT NULL) AND ("btrim"("time") <> ''::"text"))),
    CONSTRAINT "flights_type_vocab" CHECK (("type" = ANY (ARRAY['ذهاب'::"text", 'إياب'::"text"])))
);


ALTER TABLE "public"."flights" OWNER TO "postgres";

--
-- Name: COLUMN "flights"."season_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."flights"."season_id" IS 'م٧ — الموسم المالك للرحلة. الرحلات لا تُستنسخ إلى موسم جديد: كل موسم يبدأ بلا رحلات.';


--
-- Name: COLUMN "flights"."capacity"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."flights"."capacity" IS 'عدد المقاعد المخصَّصة للحملة على هذه الرحلة — لا سعة الطائرة. null = غير محدّدة: لا تقبل إسناداً حتى تُحدَّد.';


--
-- Name: flights_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."flights" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."flights_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notification_deliveries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."notification_deliveries" (
    "id" bigint NOT NULL,
    "announcement_id" bigint NOT NULL,
    "passenger_id" bigint NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."notification_deliveries" OWNER TO "postgres";

--
-- Name: notification_deliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE IF NOT EXISTS "public"."notification_deliveries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."notification_deliveries_id_seq" OWNER TO "postgres";

--
-- Name: notification_deliveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."notification_deliveries_id_seq" OWNED BY "public"."notification_deliveries"."id";


--
-- Name: passengers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."passengers" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name_ar" "text",
    "name_en" "text",
    "short_en" "text",
    "passport" "text",
    "national_id" "text",
    "nat" "text",
    "dob" "text",
    "expiry" "text",
    "gender" "text",
    "phone" "text",
    "bus" "text",
    "flight" "text",
    "camp_mina" "text",
    "camp_arafa" "text",
    "photo_url" "text",
    "passport_url" "text",
    "national_id_url" "text",
    "contract_url" "text",
    "short_ar" "text",
    "id_expiry" "text",
    "bus_id" bigint,
    "camp_mina_id" bigint,
    "camp_arafa_id" bigint,
    "room_id" bigint,
    "family_id" "text",
    "season_id" bigint DEFAULT "public"."active_season_id"() NOT NULL,
    "hotel_type" "text",
    "hotel_view" "text",
    "flight_class" "text",
    "flight_id" bigint,
    "sort_order" integer DEFAULT 0,
    "created_by" "text",
    "updated_by" "text",
    "updated_at" timestamp with time zone,
    "return_flight_id" bigint,
    "passenger_type" "text" DEFAULT 'حاج'::"text",
    "custom_price" numeric DEFAULT 0,
    "hajj_permit_url" "text",
    "flight_ticket_url" "text",
    "wants_flight" boolean DEFAULT false,
    "bus_sort_order" integer,
    "camp_mina_sort_order" integer,
    "camp_arafa_sort_order" integer,
    "room_sort_order" integer
);


ALTER TABLE "public"."passengers" OWNER TO "postgres";

--
-- Name: COLUMN "passengers"."bus_sort_order"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."passengers"."bus_sort_order" IS 'ترتيب الراكب داخل باصه — مستقلّ عن الترتيب العام وعن بقيّة الموارد';


--
-- Name: COLUMN "passengers"."camp_mina_sort_order"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."passengers"."camp_mina_sort_order" IS 'ترتيب النازل داخل مخيّم منى';


--
-- Name: COLUMN "passengers"."camp_arafa_sort_order"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."passengers"."camp_arafa_sort_order" IS 'ترتيب النازل داخل مخيّم عرفة';


--
-- Name: COLUMN "passengers"."room_sort_order"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."passengers"."room_sort_order" IS 'ترتيب الاسم داخل الغرفة — عرضٌ تشغيلي لا إسناد أسرّة';


--
-- Name: passengers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."passengers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."passengers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" integer NOT NULL,
    "passenger_id" integer NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "method" "text" DEFAULT 'نقدي'::"text" NOT NULL,
    "notes" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payments_method_check" CHECK (("method" = ANY (ARRAY['نقدي'::"text", 'تحويل بنكي'::"text", 'شيك'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE IF NOT EXISTS "public"."payments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."payments_id_seq" OWNER TO "postgres";

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."payments_id_seq" OWNED BY "public"."payments"."id";


--
-- Name: pilgrim_push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pilgrim_push_subscriptions" (
    "id" bigint NOT NULL,
    "passenger_id" bigint NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "platform" "text" DEFAULT 'web'::"text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pilgrim_push_subscriptions" OWNER TO "postgres";

--
-- Name: pilgrim_push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE IF NOT EXISTS "public"."pilgrim_push_subscriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pilgrim_push_subscriptions_id_seq" OWNER TO "postgres";

--
-- Name: pilgrim_push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."pilgrim_push_subscriptions_id_seq" OWNED BY "public"."pilgrim_push_subscriptions"."id";


--
-- Name: pilgrim_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pilgrim_sessions" (
    "token_hash" "bytea" NOT NULL,
    "passenger_id" bigint NOT NULL,
    "season_id" bigint NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idle_expires_at" timestamp with time zone NOT NULL,
    "absolute_expires_at" timestamp with time zone NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "pilgrim_sessions_idle_within_absolute" CHECK (("idle_expires_at" <= "absolute_expires_at"))
);


ALTER TABLE "public"."pilgrim_sessions" OWNER TO "postgres";

--
-- Name: TABLE "pilgrim_sessions"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."pilgrim_sessions" IS 'س٧ — جلسات بوابة الحاجّ. يُخزَّن sha256 للرمز لا الرمز. لا يقرؤه ولا يكتبه عميل: service_role وحده عبر دوال SECURITY DEFINER.';


--
-- Name: COLUMN "pilgrim_sessions"."token_hash"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."pilgrim_sessions"."token_hash" IS 'sha256 للرمز الخام. الرمز نفسه لا يوجد في القاعدة إطلاقاً.';


--
-- Name: COLUMN "pilgrim_sessions"."absolute_expires_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."pilgrim_sessions"."absolute_expires_at" IS 'issued_at + ٩٠ يوماً. لا يُمدَّد بحال — سقفٌ على الخمول المنزلق.';


--
-- Name: pricing_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pricing_settings" (
    "id" integer NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "type" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pricing_settings_type_check" CHECK (("type" = ANY (ARRAY['package'::"text", 'addon'::"text", 'discount'::"text"])))
);


ALTER TABLE "public"."pricing_settings" OWNER TO "postgres";

--
-- Name: pricing_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE IF NOT EXISTS "public"."pricing_settings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pricing_settings_id_seq" OWNER TO "postgres";

--
-- Name: pricing_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."pricing_settings_id_seq" OWNED BY "public"."pricing_settings"."id";


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "number" "text",
    "floor" "text",
    "type" "text" DEFAULT 'مطل'::"text",
    "season_id" bigint DEFAULT "public"."active_season_id"() NOT NULL,
    "notes" "text",
    "capacity" integer
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";

--
-- Name: rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."rooms" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."rooms_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: season_pricing_snapshot; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."season_pricing_snapshot" (
    "season_id" bigint NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."season_pricing_snapshot" OWNER TO "postgres";

--
-- Name: TABLE "season_pricing_snapshot"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."season_pricing_snapshot" IS 'تسعير الموسم كما كان لحظة إقفاله. يُكتب مرّة واحدة داخل معاملة close_season، ولا يُعدَّل بعدها. بلا مفتاح أجنبيّ عمداً: يبقى بعد حذف الموسم.';


--
-- Name: COLUMN "season_pricing_snapshot"."season_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."season_pricing_snapshot"."season_id" IS 'الموسم المُقفَل. بلا مفتاح أجنبي — الصفّ يبقى بعد حذف الموسم (كنمط audit_log).';


--
-- Name: COLUMN "season_pricing_snapshot"."label"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."season_pricing_snapshot"."label" IS 'اسم البند يوم الإقفال — الأسماء تتغيّر، والصفّ يحفظ ما كان.';


--
-- Name: COLUMN "season_pricing_snapshot"."amount"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."season_pricing_snapshot"."amount" IS 'القيمة المجمَّدة. هي ما تقرأه مالية الموسم المؤرشَف بدل pricing_settings الحيّ.';


--
-- Name: seasons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."seasons" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."seasons_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";

--
-- Name: TABLE "user_profiles"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."user_profiles" IS 'ملفّ المستخدم: معرّف الدخول والصلاحيات وحالة التفعيل. الهوية في auth.users. الثابت أ١٠ يمنع أي اعتماد آخر على auth.users.';


--
-- Name: COLUMN "user_profiles"."email"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_profiles"."email" IS 'معرّف الدخول (Login ID). يعكس auth.users.email. لا يشترط أن يكون بريداً حقيقياً ولا قابلاً لاستقبال الرسائل، لكنه يجب أن يكون بصيغة بريد صحيحة. يُقرأ من هنا لا من auth.users — الثابت أ١٠.';


--
-- Name: custom_charges id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."custom_charges" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."custom_charges_id_seq"'::"regclass");


--
-- Name: financial_group_members id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."financial_group_members" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."financial_group_members_id_seq"'::"regclass");


--
-- Name: financial_groups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."financial_groups" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."financial_groups_id_seq"'::"regclass");


--
-- Name: notification_deliveries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_deliveries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."notification_deliveries_id_seq"'::"regclass");


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payments_id_seq"'::"regclass");


--
-- Name: pilgrim_push_subscriptions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pilgrim_push_subscriptions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pilgrim_push_subscriptions_id_seq"'::"regclass");


--
-- Name: pricing_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pricing_settings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pricing_settings_id_seq"'::"regclass");


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: audit_suppression audit_suppression_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_suppression"
    ADD CONSTRAINT "audit_suppression_pkey" PRIMARY KEY ("txid");


--
-- Name: buses buses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."buses"
    ADD CONSTRAINT "buses_pkey" PRIMARY KEY ("id");


--
-- Name: camps camps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."camps"
    ADD CONSTRAINT "camps_pkey" PRIMARY KEY ("id");


--
-- Name: company_assets company_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."company_assets"
    ADD CONSTRAINT "company_assets_pkey" PRIMARY KEY ("asset_key");


--
-- Name: company_config company_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."company_config"
    ADD CONSTRAINT "company_config_pkey" PRIMARY KEY ("id");


--
-- Name: custom_charges custom_charges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."custom_charges"
    ADD CONSTRAINT "custom_charges_pkey" PRIMARY KEY ("id");


--
-- Name: edge_rate_limits edge_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."edge_rate_limits"
    ADD CONSTRAINT "edge_rate_limits_pkey" PRIMARY KEY ("scope", "subject", "window_start");


--
-- Name: financial_group_members financial_group_members_group_id_passenger_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."financial_group_members"
    ADD CONSTRAINT "financial_group_members_group_id_passenger_id_key" UNIQUE ("group_id", "passenger_id");


--
-- Name: financial_group_members financial_group_members_passenger_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."financial_group_members"
    ADD CONSTRAINT "financial_group_members_passenger_id_key" UNIQUE ("passenger_id");


--
-- Name: financial_group_members financial_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."financial_group_members"
    ADD CONSTRAINT "financial_group_members_pkey" PRIMARY KEY ("id");


--
-- Name: financial_groups financial_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."financial_groups"
    ADD CONSTRAINT "financial_groups_pkey" PRIMARY KEY ("id");


--
-- Name: flights flights_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flights"
    ADD CONSTRAINT "flights_pkey" PRIMARY KEY ("id");


--
-- Name: notification_deliveries notification_deliveries_announcement_id_passenger_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_announcement_id_passenger_id_key" UNIQUE ("announcement_id", "passenger_id");


--
-- Name: notification_deliveries notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id");


--
-- Name: passengers passengers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."passengers"
    ADD CONSTRAINT "passengers_pkey" PRIMARY KEY ("id");


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");


--
-- Name: pilgrim_push_subscriptions pilgrim_push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pilgrim_push_subscriptions"
    ADD CONSTRAINT "pilgrim_push_subscriptions_endpoint_key" UNIQUE ("endpoint");


--
-- Name: pilgrim_push_subscriptions pilgrim_push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pilgrim_push_subscriptions"
    ADD CONSTRAINT "pilgrim_push_subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: pilgrim_sessions pilgrim_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pilgrim_sessions"
    ADD CONSTRAINT "pilgrim_sessions_pkey" PRIMARY KEY ("token_hash");


--
-- Name: pricing_settings pricing_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pricing_settings"
    ADD CONSTRAINT "pricing_settings_key_key" UNIQUE ("key");


--
-- Name: pricing_settings pricing_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pricing_settings"
    ADD CONSTRAINT "pricing_settings_pkey" PRIMARY KEY ("id");


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");


--
-- Name: season_pricing_snapshot season_pricing_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."season_pricing_snapshot"
    ADD CONSTRAINT "season_pricing_snapshot_pkey" PRIMARY KEY ("season_id", "key");


--
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_pkey" PRIMARY KEY ("id");


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");


--
-- Name: user_profiles user_profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_username_key" UNIQUE ("email");


--
-- Name: audit_log_actor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "audit_log_actor_idx" ON "public"."audit_log" USING "btree" ("actor_id", "at" DESC);


--
-- Name: audit_log_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "audit_log_at_idx" ON "public"."audit_log" USING "btree" ("at" DESC);


--
-- Name: audit_log_row_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "audit_log_row_idx" ON "public"."audit_log" USING "btree" ("table_name", "row_id", "at" DESC);


--
-- Name: buses_season_name_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "buses_season_name_uniq" ON "public"."buses" USING "btree" ("season_id", "btrim"("name"));


--
-- Name: camps_season_page_gender_name_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "camps_season_page_gender_name_uniq" ON "public"."camps" USING "btree" ("season_id", "page_type", "gender", "btrim"("name"));


--
-- Name: flights_operational_identity_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "flights_operational_identity_uniq" ON "public"."flights" USING "btree" ("season_id", "type", "btrim"("name"), "btrim"("date"), "btrim"("time"));


--
-- Name: idx_announcements_season_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_announcements_season_id" ON "public"."announcements" USING "btree" ("season_id");


--
-- Name: idx_buses_season_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_buses_season_id" ON "public"."buses" USING "btree" ("season_id");


--
-- Name: idx_camps_group_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_camps_group_order" ON "public"."camps" USING "btree" ("season_id", "page_type", "gender", "sort_order", "id");


--
-- Name: idx_camps_season_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_camps_season_id" ON "public"."camps" USING "btree" ("season_id");


--
-- Name: idx_flights_season_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_flights_season_id" ON "public"."flights" USING "btree" ("season_id");


--
-- Name: idx_nd_announcement; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_nd_announcement" ON "public"."notification_deliveries" USING "btree" ("announcement_id");


--
-- Name: idx_nd_passenger; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_nd_passenger" ON "public"."notification_deliveries" USING "btree" ("passenger_id");


--
-- Name: idx_passengers_bus_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_passengers_bus_id" ON "public"."passengers" USING "btree" ("bus_id") WHERE ("bus_id" IS NOT NULL);


--
-- Name: idx_passengers_camp_arafa_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_passengers_camp_arafa_id" ON "public"."passengers" USING "btree" ("camp_arafa_id") WHERE ("camp_arafa_id" IS NOT NULL);


--
-- Name: idx_passengers_camp_mina_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_passengers_camp_mina_id" ON "public"."passengers" USING "btree" ("camp_mina_id") WHERE ("camp_mina_id" IS NOT NULL);


--
-- Name: idx_passengers_flight_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_passengers_flight_id" ON "public"."passengers" USING "btree" ("flight_id") WHERE ("flight_id" IS NOT NULL);


--
-- Name: idx_passengers_return_flight_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_passengers_return_flight_id" ON "public"."passengers" USING "btree" ("return_flight_id") WHERE ("return_flight_id" IS NOT NULL);


--
-- Name: idx_passengers_season_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_passengers_season_id" ON "public"."passengers" USING "btree" ("season_id");


--
-- Name: idx_passengers_sort_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_passengers_sort_order" ON "public"."passengers" USING "btree" ("sort_order");


--
-- Name: idx_pps_passenger; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pps_passenger" ON "public"."pilgrim_push_subscriptions" USING "btree" ("passenger_id");


--
-- Name: idx_rooms_season_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_rooms_season_id" ON "public"."rooms" USING "btree" ("season_id");


--
-- Name: pilgrim_sessions_passenger_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pilgrim_sessions_passenger_idx" ON "public"."pilgrim_sessions" USING "btree" ("passenger_id");


--
-- Name: rooms_season_floor_number_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "rooms_season_floor_number_uniq" ON "public"."rooms" USING "btree" ("season_id", "floor", "number");


--
-- Name: seasons_hijri_year_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "seasons_hijri_year_key" ON "public"."seasons" USING "btree" ("hijri_year");


--
-- Name: INDEX "seasons_hijri_year_key"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON INDEX "public"."seasons_hijri_year_key" IS 'موسمٌ واحدٌ لكلّ سنةٍ هجريّة. التفرّدُ هنا لا على الاسم: الأسماءُ تُصحَّح، والسنةُ هي الهويّة.';


--
-- Name: seasons_one_open_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "seasons_one_open_idx" ON "public"."seasons" USING "btree" ((("closed_at" IS NULL))) WHERE ("closed_at" IS NULL);


--
-- Name: audit_log audit_log_immutable_row_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "audit_log_immutable_row_trg" BEFORE DELETE OR UPDATE ON "public"."audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_immutable"();


--
-- Name: audit_log audit_log_immutable_stmt_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "audit_log_immutable_stmt_trg" BEFORE TRUNCATE ON "public"."audit_log" FOR EACH STATEMENT EXECUTE FUNCTION "public"."audit_log_immutable"();


--
-- Name: camps camps_assign_sort_order_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "camps_assign_sort_order_trg" BEFORE INSERT ON "public"."camps" FOR EACH ROW EXECUTE FUNCTION "public"."camps_assign_sort_order"();


--
-- Name: custom_charges custom_charges_audit_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "custom_charges_audit_trg" AFTER INSERT OR DELETE OR UPDATE ON "public"."custom_charges" FOR EACH ROW EXECUTE FUNCTION "public"."record_audit"();


--
-- Name: passengers passengers_assign_sort_order_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "passengers_assign_sort_order_trg" BEFORE INSERT ON "public"."passengers" FOR EACH ROW EXECUTE FUNCTION "public"."passengers_assign_sort_order"();


--
-- Name: passengers passengers_audit_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "passengers_audit_trg" AFTER DELETE ON "public"."passengers" FOR EACH ROW EXECUTE FUNCTION "public"."record_audit"();


--
-- Name: payments payments_audit_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "payments_audit_trg" AFTER INSERT OR DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."record_audit"();


--
-- Name: buses trg_buses_guard_occupants; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_buses_guard_occupants" BEFORE UPDATE OF "capacity" ON "public"."buses" FOR EACH ROW EXECUTE FUNCTION "public"."buses_guard_occupants"();


--
-- Name: camps trg_camps_guard_occupants; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_camps_guard_occupants" BEFORE UPDATE OF "capacity", "gender", "page_type" ON "public"."camps" FOR EACH ROW EXECUTE FUNCTION "public"."camps_guard_occupants"();


--
-- Name: financial_group_members trg_delete_empty_financial_group; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_delete_empty_financial_group" AFTER DELETE ON "public"."financial_group_members" FOR EACH ROW EXECUTE FUNCTION "public"."delete_empty_financial_group"();


--
-- Name: flights trg_flights_guard_occupants; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_flights_guard_occupants" BEFORE UPDATE OF "capacity", "type" ON "public"."flights" FOR EACH ROW EXECUTE FUNCTION "public"."flights_guard_occupants"();


--
-- Name: announcements trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season"();


--
-- Name: buses trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."buses" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season"();


--
-- Name: camps trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."camps" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season"();


--
-- Name: custom_charges trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."custom_charges" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season_derived"();


--
-- Name: financial_group_members trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."financial_group_members" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season_derived"();


--
-- Name: flights trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."flights" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season"();


--
-- Name: notification_deliveries trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."notification_deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season_derived"();


--
-- Name: passengers trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."passengers" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season"();


--
-- Name: payments trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season_derived"();


--
-- Name: pilgrim_push_subscriptions trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."pilgrim_push_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season_derived"();


--
-- Name: rooms trg_reject_closed_season; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_closed_season" BEFORE INSERT OR DELETE OR UPDATE ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "public"."reject_write_closed_season"();


--
-- Name: passengers trg_reject_cross_season_flight; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_cross_season_flight" BEFORE INSERT OR UPDATE ON "public"."passengers" FOR EACH ROW EXECUTE FUNCTION "public"."reject_cross_season_flight"();


--
-- Name: passengers trg_reject_invalid_allocation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_invalid_allocation" BEFORE INSERT OR UPDATE OF "bus_id", "camp_mina_id", "camp_arafa_id", "season_id", "gender" ON "public"."passengers" FOR EACH ROW EXECUTE FUNCTION "public"."reject_invalid_allocation"();


--
-- Name: passengers trg_reject_invalid_flight_booking; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_invalid_flight_booking" BEFORE INSERT OR UPDATE OF "flight_id", "return_flight_id", "flight", "flight_class", "season_id" ON "public"."passengers" FOR EACH ROW EXECUTE FUNCTION "public"."reject_invalid_flight_booking"();


--
-- Name: passengers trg_reject_room_over_capacity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reject_room_over_capacity" BEFORE INSERT OR UPDATE OF "room_id" ON "public"."passengers" FOR EACH ROW EXECUTE FUNCTION "public"."reject_room_over_capacity"();


--
-- Name: rooms trg_rooms_apply_capacity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_rooms_apply_capacity" BEFORE INSERT OR UPDATE OF "type", "capacity" ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "public"."rooms_apply_capacity"();


--
-- Name: rooms trg_rooms_capacity_floor; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_rooms_capacity_floor" AFTER INSERT OR UPDATE OF "type", "capacity" ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "public"."rooms_capacity_not_below_occupancy"();


--
-- Name: user_profiles user_profiles_audit_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "user_profiles_audit_trg" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."record_audit"();


--
-- Name: announcements announcements_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE RESTRICT;


--
-- Name: buses buses_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."buses"
    ADD CONSTRAINT "buses_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE RESTRICT;


--
-- Name: camps camps_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."camps"
    ADD CONSTRAINT "camps_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE RESTRICT;


--
-- Name: custom_charges custom_charges_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."custom_charges"
    ADD CONSTRAINT "custom_charges_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("id") ON DELETE CASCADE;


--
-- Name: financial_group_members financial_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."financial_group_members"
    ADD CONSTRAINT "financial_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."financial_groups"("id") ON DELETE CASCADE;


--
-- Name: financial_group_members financial_group_members_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."financial_group_members"
    ADD CONSTRAINT "financial_group_members_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("id") ON DELETE CASCADE;


--
-- Name: flights flights_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flights"
    ADD CONSTRAINT "flights_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE RESTRICT;


--
-- Name: notification_deliveries notification_deliveries_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;


--
-- Name: notification_deliveries notification_deliveries_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("id") ON DELETE CASCADE;


--
-- Name: passengers passengers_bus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."passengers"
    ADD CONSTRAINT "passengers_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE RESTRICT;


--
-- Name: passengers passengers_camp_arafa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."passengers"
    ADD CONSTRAINT "passengers_camp_arafa_id_fkey" FOREIGN KEY ("camp_arafa_id") REFERENCES "public"."camps"("id") ON DELETE RESTRICT;


--
-- Name: passengers passengers_camp_mina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."passengers"
    ADD CONSTRAINT "passengers_camp_mina_id_fkey" FOREIGN KEY ("camp_mina_id") REFERENCES "public"."camps"("id") ON DELETE RESTRICT;


--
-- Name: passengers passengers_flight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."passengers"
    ADD CONSTRAINT "passengers_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE RESTRICT;


--
-- Name: passengers passengers_return_flight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."passengers"
    ADD CONSTRAINT "passengers_return_flight_id_fkey" FOREIGN KEY ("return_flight_id") REFERENCES "public"."flights"("id") ON DELETE RESTRICT;


--
-- Name: passengers passengers_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."passengers"
    ADD CONSTRAINT "passengers_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE RESTRICT;


--
-- Name: payments payments_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("id") ON DELETE CASCADE;


--
-- Name: pilgrim_push_subscriptions pilgrim_push_subscriptions_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pilgrim_push_subscriptions"
    ADD CONSTRAINT "pilgrim_push_subscriptions_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("id") ON DELETE CASCADE;


--
-- Name: pilgrim_sessions pilgrim_sessions_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pilgrim_sessions"
    ADD CONSTRAINT "pilgrim_sessions_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("id") ON DELETE CASCADE;


--
-- Name: rooms rooms_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE RESTRICT;


--
-- Name: user_profiles user_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements announcements_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "announcements_delete" ON "public"."announcements" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_portal'::"text"));


--
-- Name: announcements announcements_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "announcements_insert" ON "public"."announcements" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_portal'::"text"));


--
-- Name: announcements announcements_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "announcements_select" ON "public"."announcements" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: announcements announcements_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "announcements_update" ON "public"."announcements" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_portal'::"text")) WITH CHECK ("public"."has_permission"('manage_portal'::"text"));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "audit_log_select" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."has_permission"('view_audit'::"text"));


--
-- Name: audit_suppression; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_suppression" ENABLE ROW LEVEL SECURITY;

--
-- Name: buses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."buses" ENABLE ROW LEVEL SECURITY;

--
-- Name: buses buses_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "buses_delete" ON "public"."buses" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_buses'::"text"));


--
-- Name: buses buses_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "buses_insert" ON "public"."buses" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_buses'::"text"));


--
-- Name: buses buses_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "buses_select" ON "public"."buses" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: buses buses_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "buses_update" ON "public"."buses" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_buses'::"text")) WITH CHECK ("public"."has_permission"('manage_buses'::"text"));


--
-- Name: camps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."camps" ENABLE ROW LEVEL SECURITY;

--
-- Name: camps camps_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "camps_delete" ON "public"."camps" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_camps'::"text"));


--
-- Name: camps camps_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "camps_insert" ON "public"."camps" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_camps'::"text"));


--
-- Name: camps camps_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "camps_select" ON "public"."camps" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: camps camps_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "camps_update" ON "public"."camps" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_camps'::"text")) WITH CHECK ("public"."has_permission"('manage_camps'::"text"));


--
-- Name: company_assets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."company_assets" ENABLE ROW LEVEL SECURITY;

--
-- Name: company_assets company_assets_management_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "company_assets_management_delete" ON "public"."company_assets" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_users'::"text"));


--
-- Name: company_assets company_assets_management_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "company_assets_management_insert" ON "public"."company_assets" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_users'::"text"));


--
-- Name: company_assets company_assets_management_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "company_assets_management_read" ON "public"."company_assets" FOR SELECT TO "authenticated" USING (true);


--
-- Name: company_assets company_assets_management_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "company_assets_management_update" ON "public"."company_assets" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_users'::"text")) WITH CHECK ("public"."has_permission"('manage_users'::"text"));


--
-- Name: company_assets company_assets_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "company_assets_public_read" ON "public"."company_assets" FOR SELECT TO "anon" USING (("asset_key" = ANY (ARRAY['logo'::"text", 'login_logo'::"text", 'login_background'::"text", 'favicon'::"text", 'portal_banner'::"text", 'dashboard_banner'::"text"])));


--
-- Name: company_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."company_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: company_config company_config_management_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "company_config_management_read" ON "public"."company_config" FOR SELECT TO "authenticated" USING (true);


--
-- Name: company_config company_config_management_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "company_config_management_update" ON "public"."company_config" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_users'::"text")) WITH CHECK ("public"."has_permission"('manage_users'::"text"));


--
-- Name: custom_charges; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."custom_charges" ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_charges custom_charges_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "custom_charges_delete" ON "public"."custom_charges" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: custom_charges custom_charges_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "custom_charges_insert" ON "public"."custom_charges" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: custom_charges custom_charges_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "custom_charges_select" ON "public"."custom_charges" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: custom_charges custom_charges_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "custom_charges_update" ON "public"."custom_charges" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_payments'::"text")) WITH CHECK ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: edge_rate_limits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."edge_rate_limits" ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_group_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."financial_group_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_group_members financial_group_members_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "financial_group_members_delete" ON "public"."financial_group_members" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: financial_group_members financial_group_members_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "financial_group_members_insert" ON "public"."financial_group_members" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: financial_group_members financial_group_members_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "financial_group_members_select" ON "public"."financial_group_members" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: financial_group_members financial_group_members_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "financial_group_members_update" ON "public"."financial_group_members" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_payments'::"text")) WITH CHECK ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: financial_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."financial_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_groups financial_groups_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "financial_groups_delete" ON "public"."financial_groups" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: financial_groups financial_groups_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "financial_groups_insert" ON "public"."financial_groups" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: financial_groups financial_groups_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "financial_groups_select" ON "public"."financial_groups" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: financial_groups financial_groups_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "financial_groups_update" ON "public"."financial_groups" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_payments'::"text")) WITH CHECK ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: flights; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."flights" ENABLE ROW LEVEL SECURITY;

--
-- Name: flights flights_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "flights_delete" ON "public"."flights" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_flights'::"text"));


--
-- Name: flights flights_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "flights_insert" ON "public"."flights" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_flights'::"text"));


--
-- Name: flights flights_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "flights_select" ON "public"."flights" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: flights flights_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "flights_update" ON "public"."flights" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_flights'::"text")) WITH CHECK ("public"."has_permission"('manage_flights'::"text"));


--
-- Name: notification_deliveries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notification_deliveries" ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_deliveries notification_deliveries_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_deliveries_select" ON "public"."notification_deliveries" FOR SELECT TO "authenticated" USING ("public"."has_permission"('manage_portal'::"text"));


--
-- Name: passengers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."passengers" ENABLE ROW LEVEL SECURITY;

--
-- Name: passengers passengers_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "passengers_delete" ON "public"."passengers" FOR DELETE TO "authenticated" USING ((("public"."has_permission"('manage_passengers'::"text") AND (("passenger_type" IS NULL) OR ("passenger_type" = 'حاج'::"text"))) OR ("public"."has_permission"('manage_admins'::"text") AND ("passenger_type" IS NOT NULL) AND ("passenger_type" <> 'حاج'::"text"))));


--
-- Name: passengers passengers_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "passengers_insert" ON "public"."passengers" FOR INSERT TO "authenticated" WITH CHECK ((("public"."has_permission"('manage_passengers'::"text") AND (("passenger_type" IS NULL) OR ("passenger_type" = 'حاج'::"text"))) OR ("public"."has_permission"('manage_admins'::"text") AND ("passenger_type" IS NOT NULL) AND ("passenger_type" <> 'حاج'::"text"))));


--
-- Name: passengers passengers_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "passengers_select" ON "public"."passengers" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: passengers passengers_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "passengers_update" ON "public"."passengers" FOR UPDATE TO "authenticated" USING ((("public"."has_permission"('manage_passengers'::"text") AND (("passenger_type" IS NULL) OR ("passenger_type" = 'حاج'::"text"))) OR ("public"."has_permission"('manage_admins'::"text") AND ("passenger_type" IS NOT NULL) AND ("passenger_type" <> 'حاج'::"text")))) WITH CHECK ((("public"."has_permission"('manage_passengers'::"text") AND (("passenger_type" IS NULL) OR ("passenger_type" = 'حاج'::"text"))) OR ("public"."has_permission"('manage_admins'::"text") AND ("passenger_type" IS NOT NULL) AND ("passenger_type" <> 'حاج'::"text"))));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payments_delete" ON "public"."payments" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: payments payments_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payments_insert" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: payments payments_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payments_select" ON "public"."payments" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: payments payments_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payments_update" ON "public"."payments" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_payments'::"text")) WITH CHECK ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: pilgrim_push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pilgrim_push_subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: pilgrim_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pilgrim_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pricing_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_settings pricing_settings_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pricing_settings_delete" ON "public"."pricing_settings" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: pricing_settings pricing_settings_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pricing_settings_insert" ON "public"."pricing_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: pricing_settings pricing_settings_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pricing_settings_select" ON "public"."pricing_settings" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: pricing_settings pricing_settings_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pricing_settings_update" ON "public"."pricing_settings" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_payments'::"text")) WITH CHECK ("public"."has_permission"('manage_payments'::"text"));


--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms rooms_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rooms_delete" ON "public"."rooms" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_hotel'::"text"));


--
-- Name: rooms rooms_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rooms_insert" ON "public"."rooms" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_hotel'::"text"));


--
-- Name: rooms rooms_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rooms_select" ON "public"."rooms" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: rooms rooms_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rooms_update" ON "public"."rooms" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_hotel'::"text")) WITH CHECK ("public"."has_permission"('manage_hotel'::"text"));


--
-- Name: season_pricing_snapshot; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."season_pricing_snapshot" ENABLE ROW LEVEL SECURITY;

--
-- Name: season_pricing_snapshot season_pricing_snapshot_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "season_pricing_snapshot_select" ON "public"."season_pricing_snapshot" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: seasons; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."seasons" ENABLE ROW LEVEL SECURITY;

--
-- Name: seasons seasons_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "seasons_select" ON "public"."seasons" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());


--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles user_profiles_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_profiles_delete" ON "public"."user_profiles" FOR DELETE TO "authenticated" USING ("public"."has_permission"('manage_users'::"text"));


--
-- Name: user_profiles user_profiles_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_profiles_insert" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('manage_users'::"text"));


--
-- Name: user_profiles user_profiles_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_profiles_select" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_permission"('manage_users'::"text")));


--
-- Name: user_profiles user_profiles_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_profiles_update" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('manage_users'::"text")) WITH CHECK ("public"."has_permission"('manage_users'::"text"));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "_pilgrim_session_owner"("p_token" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."_pilgrim_session_owner"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pilgrim_session_owner"("p_token" "text") TO "service_role";


--
-- Name: FUNCTION "active_season_id"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."active_season_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."active_season_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."active_season_id"() TO "service_role";


--
-- Name: FUNCTION "admin_delete_user_profile"("p_actor" "uuid", "p_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."admin_delete_user_profile"("p_actor" "uuid", "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_user_profile"("p_actor" "uuid", "p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "admin_write_user_profile"("p_actor" "uuid", "p_mode" "text", "p_id" "uuid", "p_email" "text", "p_name" "text", "p_permissions" "jsonb", "p_is_active" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."admin_write_user_profile"("p_actor" "uuid", "p_mode" "text", "p_id" "uuid", "p_email" "text", "p_name" "text", "p_permissions" "jsonb", "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_write_user_profile"("p_actor" "uuid", "p_mode" "text", "p_id" "uuid", "p_email" "text", "p_name" "text", "p_permissions" "jsonb", "p_is_active" boolean) TO "service_role";


--
-- Name: FUNCTION "announcement_audience"("p_target_type" "text", "p_target_ids" bigint[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."announcement_audience"("p_target_type" "text", "p_target_ids" bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."announcement_audience"("p_target_type" "text", "p_target_ids" bigint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."announcement_audience"("p_target_type" "text", "p_target_ids" bigint[]) TO "service_role";


--
-- Name: FUNCTION "assert_camp_admits"("p_passenger_id" bigint, "p_camp_id" bigint, "p_pax_season" bigint, "p_pax_gender" "text", "p_camp_season" bigint, "p_camp_cap" integer, "p_camp_name" "text", "p_camp_gender" "text", "p_column" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_camp_admits"("p_passenger_id" bigint, "p_camp_id" bigint, "p_pax_season" bigint, "p_pax_gender" "text", "p_camp_season" bigint, "p_camp_cap" integer, "p_camp_name" "text", "p_camp_gender" "text", "p_column" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_camp_admits"("p_passenger_id" bigint, "p_camp_id" bigint, "p_pax_season" bigint, "p_pax_gender" "text", "p_camp_season" bigint, "p_camp_cap" integer, "p_camp_name" "text", "p_camp_gender" "text", "p_column" "text") TO "service_role";


--
-- Name: FUNCTION "audit_log_immutable"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."audit_log_immutable"() FROM PUBLIC;


--
-- Name: FUNCTION "buses_guard_occupants"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."buses_guard_occupants"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."buses_guard_occupants"() TO "service_role";


--
-- Name: FUNCTION "camps_assign_sort_order"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."camps_assign_sort_order"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."camps_assign_sort_order"() TO "service_role";


--
-- Name: FUNCTION "camps_guard_occupants"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."camps_guard_occupants"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."camps_guard_occupants"() TO "service_role";


--
-- Name: FUNCTION "close_season"("p_new_name" "text", "p_new_hijri_year" integer, "p_closed_by" "text", "p_actor" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."close_season"("p_new_name" "text", "p_new_hijri_year" integer, "p_closed_by" "text", "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_season"("p_new_name" "text", "p_new_hijri_year" integer, "p_closed_by" "text", "p_actor" "uuid") TO "service_role";


--
-- Name: FUNCTION "consume_rate_limit"("p_scope" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."consume_rate_limit"("p_scope" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_rate_limit"("p_scope" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer) TO "service_role";


--
-- Name: FUNCTION "create_financial_group_with_member"("p_name" "text", "p_notes" "text", "p_created_by" "text", "p_passenger_id" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_financial_group_with_member"("p_name" "text", "p_notes" "text", "p_created_by" "text", "p_passenger_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_financial_group_with_member"("p_name" "text", "p_notes" "text", "p_created_by" "text", "p_passenger_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_financial_group_with_member"("p_name" "text", "p_notes" "text", "p_created_by" "text", "p_passenger_id" integer) TO "service_role";


--
-- Name: FUNCTION "create_pilgrim_session"("p_doc" "text", "p_day" integer, "p_month" integer, "p_year" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_pilgrim_session"("p_doc" "text", "p_day" integer, "p_month" integer, "p_year" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_pilgrim_session"("p_doc" "text", "p_day" integer, "p_month" integer, "p_year" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."create_pilgrim_session"("p_doc" "text", "p_day" integer, "p_month" integer, "p_year" integer) TO "anon";


--
-- Name: FUNCTION "delete_empty_financial_group"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."delete_empty_financial_group"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_empty_financial_group"() TO "service_role";


--
-- Name: FUNCTION "delete_season"("p_season_id" bigint, "p_actor" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."delete_season"("p_season_id" bigint, "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_season"("p_season_id" bigint, "p_actor" "uuid") TO "service_role";


--
-- Name: FUNCTION "flights_guard_occupants"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."flights_guard_occupants"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."flights_guard_occupants"() TO "service_role";


--
-- Name: FUNCTION "get_pilgrim_portal_by_session"("p_token" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_pilgrim_portal_by_session"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_pilgrim_portal_by_session"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_pilgrim_portal_by_session"("p_token" "text") TO "anon";


--
-- Name: FUNCTION "get_portal_announcements"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_portal_announcements"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_portal_announcements"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_portal_announcements"() TO "anon";


--
-- Name: FUNCTION "has_permission"("p_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_permission"("p_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("p_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("p_key" "text") TO "service_role";


--
-- Name: FUNCTION "is_active_employee"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_active_employee"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_employee"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_employee"() TO "service_role";


--
-- Name: FUNCTION "mark_pilgrim_notification_read"("p_token" "text", "p_announcement_id" bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."mark_pilgrim_notification_read"("p_token" "text", "p_announcement_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_pilgrim_notification_read"("p_token" "text", "p_announcement_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."mark_pilgrim_notification_read"("p_token" "text", "p_announcement_id" bigint) TO "anon";


--
-- Name: FUNCTION "passengers_assign_sort_order"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."passengers_assign_sort_order"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."passengers_assign_sort_order"() TO "service_role";


--
-- Name: FUNCTION "push_enabled_passengers"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."push_enabled_passengers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_enabled_passengers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."push_enabled_passengers"() TO "service_role";


--
-- Name: FUNCTION "record_audit"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_audit"() FROM PUBLIC;


--
-- Name: FUNCTION "record_season_event"("p_actor" "uuid", "p_action" "text", "p_season_id" bigint, "p_old" "jsonb", "p_new" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_season_event"("p_actor" "uuid", "p_action" "text", "p_season_id" bigint, "p_old" "jsonb", "p_new" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "register_pilgrim_push"("p_token" "text", "p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_platform" "text", "p_user_agent" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."register_pilgrim_push"("p_token" "text", "p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_platform" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_pilgrim_push"("p_token" "text", "p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_platform" "text", "p_user_agent" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."register_pilgrim_push"("p_token" "text", "p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_platform" "text", "p_user_agent" "text") TO "anon";


--
-- Name: FUNCTION "reject_cross_season_flight"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reject_cross_season_flight"() FROM PUBLIC;


--
-- Name: FUNCTION "reject_invalid_allocation"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reject_invalid_allocation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_invalid_allocation"() TO "service_role";


--
-- Name: FUNCTION "reject_invalid_flight_booking"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reject_invalid_flight_booking"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_invalid_flight_booking"() TO "service_role";


--
-- Name: FUNCTION "reject_room_over_capacity"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reject_room_over_capacity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_room_over_capacity"() TO "service_role";


--
-- Name: FUNCTION "reject_write_closed_season"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reject_write_closed_season"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_write_closed_season"() TO "service_role";


--
-- Name: FUNCTION "reject_write_closed_season_derived"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reject_write_closed_season_derived"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_write_closed_season_derived"() TO "service_role";


--
-- Name: FUNCTION "revoke_pilgrim_session"("p_token" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."revoke_pilgrim_session"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_pilgrim_session"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."revoke_pilgrim_session"("p_token" "text") TO "anon";


--
-- Name: FUNCTION "room_type_capacity"("p_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."room_type_capacity"("p_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."room_type_capacity"("p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."room_type_capacity"("p_type" "text") TO "service_role";


--
-- Name: FUNCTION "rooms_apply_capacity"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rooms_apply_capacity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rooms_apply_capacity"() TO "service_role";


--
-- Name: FUNCTION "rooms_capacity_not_below_occupancy"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rooms_capacity_not_below_occupancy"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rooms_capacity_not_below_occupancy"() TO "service_role";


--
-- Name: FUNCTION "set_audit_actor"("p_actor" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_audit_actor"("p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_audit_actor"("p_actor" "uuid") TO "service_role";


--
-- Name: FUNCTION "unregister_pilgrim_push"("p_token" "text", "p_endpoint" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."unregister_pilgrim_push"("p_token" "text", "p_endpoint" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unregister_pilgrim_push"("p_token" "text", "p_endpoint" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."unregister_pilgrim_push"("p_token" "text", "p_endpoint" "text") TO "anon";


--
-- Name: TABLE "seasons"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."seasons" TO "service_role";
GRANT SELECT ON TABLE "public"."seasons" TO "authenticated";


--
-- Name: FUNCTION "update_active_season"("p_name" "text", "p_hotel_name" "text", "p_hotel_address" "text", "p_hotel_url" "text", "p_mina_address" "text", "p_mina_url" "text", "p_arafa_address" "text", "p_arafa_url" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_active_season"("p_name" "text", "p_hotel_name" "text", "p_hotel_address" "text", "p_hotel_url" "text", "p_mina_address" "text", "p_mina_url" "text", "p_arafa_address" "text", "p_arafa_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_active_season"("p_name" "text", "p_hotel_name" "text", "p_hotel_address" "text", "p_hotel_url" "text", "p_mina_address" "text", "p_mina_url" "text", "p_arafa_address" "text", "p_arafa_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_active_season"("p_name" "text", "p_hotel_name" "text", "p_hotel_address" "text", "p_hotel_url" "text", "p_mina_address" "text", "p_mina_url" "text", "p_arafa_address" "text", "p_arafa_url" "text") TO "service_role";


--
-- Name: TABLE "company_config"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."company_config" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."company_config" TO "authenticated";


--
-- Name: FUNCTION "update_portal_settings"("p_portal_settings" "jsonb", "p_portal_welcome_message" "text", "p_portal_help_message" "text", "p_admin_name" "text", "p_admin_phone" "text", "p_admin_whatsapp" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_portal_settings"("p_portal_settings" "jsonb", "p_portal_welcome_message" "text", "p_portal_help_message" "text", "p_admin_name" "text", "p_admin_phone" "text", "p_admin_whatsapp" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_portal_settings"("p_portal_settings" "jsonb", "p_portal_welcome_message" "text", "p_portal_help_message" "text", "p_admin_name" "text", "p_admin_phone" "text", "p_admin_whatsapp" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_portal_settings"("p_portal_settings" "jsonb", "p_portal_welcome_message" "text", "p_portal_help_message" "text", "p_admin_name" "text", "p_admin_phone" "text", "p_admin_whatsapp" "text") TO "service_role";


--
-- Name: FUNCTION "verify_pilgrim_session"("p_token" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."verify_pilgrim_session"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_pilgrim_session"("p_token" "text") TO "service_role";


--
-- Name: TABLE "announcements"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."announcements" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."announcements" TO "authenticated";


--
-- Name: SEQUENCE "announcements_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."announcements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."announcements_id_seq" TO "service_role";


--
-- Name: TABLE "audit_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."audit_log" TO "service_role";
GRANT SELECT ON TABLE "public"."audit_log" TO "authenticated";


--
-- Name: SEQUENCE "audit_log_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";


--
-- Name: TABLE "buses"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."buses" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."buses" TO "authenticated";


--
-- Name: SEQUENCE "buses_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."buses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."buses_id_seq" TO "service_role";


--
-- Name: TABLE "camps"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."camps" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."camps" TO "authenticated";


--
-- Name: SEQUENCE "camps_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."camps_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."camps_id_seq" TO "service_role";


--
-- Name: TABLE "company_assets"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."company_assets" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_assets" TO "authenticated";
GRANT SELECT ON TABLE "public"."company_assets" TO "anon";


--
-- Name: TABLE "company_profile_public"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."company_profile_public" TO "service_role";
GRANT SELECT ON TABLE "public"."company_profile_public" TO "anon";
GRANT SELECT ON TABLE "public"."company_profile_public" TO "authenticated";


--
-- Name: TABLE "custom_charges"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."custom_charges" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."custom_charges" TO "authenticated";


--
-- Name: SEQUENCE "custom_charges_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."custom_charges_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."custom_charges_id_seq" TO "service_role";


--
-- Name: TABLE "edge_rate_limits"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."edge_rate_limits" TO "service_role";


--
-- Name: TABLE "financial_group_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."financial_group_members" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."financial_group_members" TO "authenticated";


--
-- Name: SEQUENCE "financial_group_members_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."financial_group_members_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."financial_group_members_id_seq" TO "service_role";


--
-- Name: TABLE "financial_groups"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."financial_groups" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."financial_groups" TO "authenticated";


--
-- Name: SEQUENCE "financial_groups_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."financial_groups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."financial_groups_id_seq" TO "service_role";


--
-- Name: TABLE "flights"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."flights" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."flights" TO "authenticated";


--
-- Name: SEQUENCE "flights_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."flights_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."flights_id_seq" TO "service_role";


--
-- Name: TABLE "notification_deliveries"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notification_deliveries" TO "service_role";
GRANT SELECT ON TABLE "public"."notification_deliveries" TO "authenticated";


--
-- Name: SEQUENCE "notification_deliveries_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."notification_deliveries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notification_deliveries_id_seq" TO "service_role";


--
-- Name: TABLE "passengers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."passengers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."passengers" TO "authenticated";


--
-- Name: SEQUENCE "passengers_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."passengers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."passengers_id_seq" TO "service_role";


--
-- Name: TABLE "payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."payments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."payments" TO "authenticated";


--
-- Name: SEQUENCE "payments_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."payments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payments_id_seq" TO "service_role";


--
-- Name: TABLE "pilgrim_push_subscriptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pilgrim_push_subscriptions" TO "service_role";


--
-- Name: SEQUENCE "pilgrim_push_subscriptions_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."pilgrim_push_subscriptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pilgrim_push_subscriptions_id_seq" TO "service_role";


--
-- Name: TABLE "pilgrim_sessions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pilgrim_sessions" TO "service_role";


--
-- Name: TABLE "pricing_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pricing_settings" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."pricing_settings" TO "authenticated";


--
-- Name: SEQUENCE "pricing_settings_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."pricing_settings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pricing_settings_id_seq" TO "service_role";


--
-- Name: TABLE "rooms"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."rooms" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."rooms" TO "authenticated";


--
-- Name: SEQUENCE "rooms_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."rooms_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rooms_id_seq" TO "service_role";


--
-- Name: TABLE "season_pricing_snapshot"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."season_pricing_snapshot" TO "authenticated";


--
-- Name: SEQUENCE "seasons_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."seasons_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."seasons_id_seq" TO "service_role";


--
-- Name: TABLE "user_profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict dmNyo0WxflFaeRqaqIBEW2fxiGCC9p8VvlpAW8qZ4PLRyToHWMGWO7zLdAUVv8i

-- ═══ storage buckets (application-owned) ═══
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('company-assets', 'company-assets', 't', 5242880, '{image/jpeg,image/png,image/webp,image/svg+xml,image/x-icon}'::text[]) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('passengers-docs', 'passengers-docs', 'f', 5242880, '{image/jpeg,image/png,image/webp,application/pdf}'::text[]) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- ═══ storage.objects policies (application security) ═══
create policy "Anyone reads company assets" on storage.objects for SELECT to public using ((bucket_id = 'company-assets'::text));
create policy "Employees delete company assets" on storage.objects for DELETE to authenticated using (((bucket_id = 'company-assets'::text) AND public.has_permission('manage_users'::text)));
create policy "Employees delete passenger docs" on storage.objects for DELETE to authenticated using ((bucket_id = 'passengers-docs'::text));
create policy "Employees read passenger docs" on storage.objects for SELECT to authenticated using ((bucket_id = 'passengers-docs'::text));
create policy "Employees replace company assets" on storage.objects for UPDATE to authenticated using (((bucket_id = 'company-assets'::text) AND public.has_permission('manage_users'::text))) with check (((bucket_id = 'company-assets'::text) AND public.has_permission('manage_users'::text)));
create policy "Employees replace passenger docs" on storage.objects for UPDATE to authenticated using ((bucket_id = 'passengers-docs'::text)) with check ((bucket_id = 'passengers-docs'::text));
create policy "Employees upload company assets" on storage.objects for INSERT to authenticated with check (((bucket_id = 'company-assets'::text) AND public.has_permission('manage_users'::text)));
create policy "Employees upload passenger docs" on storage.objects for INSERT to authenticated with check ((bucket_id = 'passengers-docs'::text));
-- ═══ default privileges owned by postgres on public ═══
-- ⚠️ includes MAINTAIN (m), which requires PostgreSQL 17.
alter default privileges for role postgres in schema public grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on tables to authenticated;
alter default privileges for role postgres in schema public grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on tables to service_role;
alter default privileges for role postgres in schema public grant EXECUTE on functions to authenticated;
alter default privileges for role postgres in schema public grant EXECUTE on functions to service_role;
alter default privileges for role postgres in schema public grant SELECT, UPDATE, USAGE on sequences to authenticated;
alter default privileges for role postgres in schema public grant SELECT, UPDATE, USAGE on sequences to service_role;
