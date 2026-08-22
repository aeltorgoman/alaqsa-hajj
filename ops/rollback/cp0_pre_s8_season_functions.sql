-- ============================================================
-- S8 / CP0 — ROLLBACK ARTIFACT (pre-S8 production definitions)
-- Captured read-only from project zkucwcnclbfvukhdqhgc
-- CP0 baseline timestamp (UTC): 2026-08-22 20:29:29
-- Source: pg_get_functiondef() on the live catalog
-- Contains NO secrets. Executable as-is by the database owner.
--
-- CP1 ROLLBACK SEQUENCE (execute in this order, owner privilege):
--   1) drop trigger if exists user_profiles_audit_trg  on public.user_profiles;
--      drop trigger if exists payments_audit_trg       on public.payments;
--      drop trigger if exists custom_charges_audit_trg on public.custom_charges;
--      drop trigger if exists passengers_audit_trg     on public.passengers;
--         -> auditing stops; every business write resumes immediately
--   2) drop function if exists public.close_season(text, text, uuid);
--      drop function if exists public.delete_season(bigint, uuid);
--   3) execute the two definitions below (restores the pre-S8 signatures)
--   4) revoke execute on function public.close_season(text, text)
--        from public, anon, authenticated;
--      revoke execute on function public.delete_season(bigint)
--        from public, anon, authenticated;
--         -> restores the m1 grant posture (service_role only)
--   5) redeploy the previous season-admin (and user-admin) Edge Functions
--
-- NEVER rolled back:
--   * public.audit_log  — evidence already collected is not destroyed
--   * the user_profiles TRUNCATE/TRIGGER/REFERENCES revoke (a defect fix)
--   * the delete_empty_financial_group PUBLIC revoke
-- ============================================================

CREATE OR REPLACE FUNCTION public.close_season(p_new_name text, p_closed_by text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old bigint;
  v_new bigint;
  v_name text := btrim(coalesce(p_new_name, ''));
begin
  if v_name = '' then
    raise exception 'اسم الموسم الجديد مطلوب.' using errcode = 'P0001';
  end if;

  -- قفل الموسم النشط أولاً: يسلسل الإقفالات المتزامنة، ويمنع أي
  -- كتابة جارية (تأخذ for share) من أن تسبقنا وتصير في موسم مقفل
  select id into v_old from public.seasons where closed_at is null for update;
  if v_old is null then
    raise exception 'لا يوجد موسم مفتوح لإقفاله.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.seasons where name = v_name) then
    raise exception 'يوجد موسم باسم % بالفعل.', v_name using errcode = 'P0001';
  end if;

  update public.seasons
     set closed_at = now(), closed_by = p_closed_by
   where id = v_old;

  insert into public.seasons (name) values (v_name) returning id into v_new;

  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_season(p_season_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_closed timestamptz;
  v_name   text;
begin
  select closed_at, name into v_closed, v_name
    from public.seasons where id = p_season_id for update;

  if v_name is null then
    raise exception 'لا يوجد موسم بالمعرّف %.', p_season_id using errcode = 'P0001';
  end if;
  if v_closed is null then
    raise exception 'موسم % مفتوح — لا يُحذف إلا موسم مقفل.', v_name using errcode = 'P0001';
  end if;

  -- الحذف هو الاستثناء الوحيد لـ ث٣: المحفّز يمنع الكتابة على
  -- موسم مقفل، والحذف كتابة. المَنفذ محصور في هذه المعاملة وحدها،
  -- ولا سبيل لفتحه من الواجهة لأن PostgREST لا يمرّر إعدادات جلسة.
  set local app.season_maintenance = 'on';

  -- الحجاج أولاً: التوابع (الدفعات · الرسوم · التسليمات ·
  -- الاشتراكات · عضويات المجموعات) تسقط بـ on delete cascade
  delete from public.passengers where season_id = p_season_id;
  delete from public.rooms       where season_id = p_season_id;
  delete from public.camps       where season_id = p_season_id;
  delete from public.buses       where season_id = p_season_id;

  -- المفتاح الأجنبي restrict هو شبكة الأمان: لو بقي صفّ موسميّ
  -- في جدول أُضيف لاحقاً ونُسي هنا، يفشل هذا السطر بدل أن يُيتَّم
  delete from public.seasons where id = p_season_id;

  set local app.season_maintenance = 'off';
end;
$function$;
