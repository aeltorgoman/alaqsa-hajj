-- ═══════════════════════════════════════════════════════════════════
-- version : 20261022090000
-- name    : company_bank_settings_rpc
-- ═══════════════════════════════════════════════════════════════════
--
-- «البنك والسداد» صار له مالكٌ واحد في الواجهة: الحسابات ← إعدادات الحسابات.
-- وتلك الصفحةُ تُفتَح بـ`manage_payments`، أمّا الكتابةُ على `company_config`
-- فسياستُها `manage_users` على الصفّ كلّه. فكان موظّفُ المال يرى البنكَ ولا
-- يحرّره.
--
-- والحلّ بابٌ ضيّقٌ لا توسعةُ سياسة: دالّةٌ واحدة تكتب **الحقولَ الستّة وحدها**
--   bank_name · bank_account_name · bank_account_number · bank_iban · bank_swift
--   · commercial_registration
-- لمن يملك `manage_payments` (أو `manage_users` الذي يملكها أصلاً بالسياسة).
-- ولا يُمسّ شيءٌ غيرها: لا هويّةَ ولا ألوانَ ولا بوابةَ ولا موسم.
--
--   · الطلبُ رقعةٌ (jsonb) بما غيّره المستخدم وحده — الحقلُ الغائبُ لا يُكتَب.
--   · مفتاحٌ خارجَ الستّة يُرفَض صراحةً (22023) ولا يُسقَط بصمت: محاولةُ
--     العبث تفشل كلُّها ولا يُحفظ منها شيء.
--   · القيمةُ نصٌّ أو null؛ تُقَصّ، والفارغُ null، وأقصاها ١٢٠ حرفاً.
--   · سياسةُ `company_config_management_update` وصلاحياتُ الأعمدة كما هي.

create or replace function public.update_company_bank_settings(p_patch jsonb)
returns public.company_config
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_fields constant text[] := array['bank_name','bank_account_name','bank_account_number',
                                    'bank_iban','bank_swift','commercial_registration'];
  v_in   jsonb := p_patch;
  v_key  text;
  v_val  jsonb;
  v_text text;
  v_clean jsonb := '{}'::jsonb;
  v_row  public.company_config;
begin
  if not (public.has_permission('manage_payments') or public.has_permission('manage_users')) then
    raise exception 'ليست لديك صلاحية تعديل بيانات البنك والسداد.' using errcode = '42501';
  end if;

  if v_in is null or jsonb_typeof(v_in) is distinct from 'object' then
    raise exception 'بياناتُ البنك غير صالحة.' using errcode = '22023';
  end if;
  for v_key, v_val in select e.key, e.value from jsonb_each(v_in) e loop
    if not (v_key = any(v_fields)) then
      raise exception 'الحقل % ليس من بيانات البنك والسداد.', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(v_val) = 'null' then
      v_text := null;
    elsif jsonb_typeof(v_val) = 'string' then
      v_text := nullif(btrim(v_val #>> '{}'), '');
    else
      raise exception 'قيمةُ الحقل % غير صالحة.', v_key using errcode = '22023';
    end if;
    if char_length(v_text) > 120 then
      raise exception 'قيمةُ الحقل % أطولُ من المسموح.', v_key using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object(v_key, v_text);
  end loop;

  update public.company_config c
     set bank_name               = case when v_clean ? 'bank_name'               then v_clean ->> 'bank_name'               else c.bank_name end,
         bank_account_name       = case when v_clean ? 'bank_account_name'       then v_clean ->> 'bank_account_name'       else c.bank_account_name end,
         bank_account_number     = case when v_clean ? 'bank_account_number'     then v_clean ->> 'bank_account_number'     else c.bank_account_number end,
         bank_iban               = case when v_clean ? 'bank_iban'               then v_clean ->> 'bank_iban'               else c.bank_iban end,
         bank_swift              = case when v_clean ? 'bank_swift'              then v_clean ->> 'bank_swift'              else c.bank_swift end,
         commercial_registration = case when v_clean ? 'commercial_registration' then v_clean ->> 'commercial_registration' else c.commercial_registration end
   where c.id = 1
  returning * into v_row;

  if not found then
    raise exception 'لا يوجد صفّ إعدادات للحملة.' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke all on function public.update_company_bank_settings(jsonb) from public, anon;
grant execute on function public.update_company_bank_settings(jsonb) to authenticated, service_role;

comment on function public.update_company_bank_settings(jsonb) is
  'البنك والسداد — البابُ الوحيد لـmanage_payments إلى company_config: الحقولُ الستّة (البنك والحساب والرقم وIBAN وSWIFT والسجلّ التجاريّ) وحدها، برقعةٍ بما تغيّر. مفتاحٌ آخر يُرفض (22023)، ومن لا يملك manage_payments ولا manage_users يُرفض (42501). ولا تُوسَّع سياسةُ الجدول.';

-- ── شروطٌ لاحقة (S-38) ───────────────────────────────────────────────
do $post$
begin
  if not exists (select 1 from pg_proc p
                  where p.oid = 'public.update_company_bank_settings(jsonb)'::regprocedure
                    and p.prosecdef and p.proconfig @> array['search_path=public, pg_temp']) then
    raise exception 'update_company_bank_settings ليست SECURITY DEFINER بـsearch_path ثابت.' using errcode = 'P0001';
  end if;
  if has_function_privilege('anon', 'public.update_company_bank_settings(jsonb)', 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                 where p.oid = 'public.update_company_bank_settings(jsonb)'::regprocedure
                   and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'update_company_bank_settings قابلةٌ للتنفيذ من غير المصادَق.' using errcode = 'P0001';
  end if;
  -- سياسةُ الكتابة على الجدول لم تُوسَّع: manage_users وحدها كما كانت
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'company_config' and cmd = 'UPDATE'
                    and policyname = 'company_config_management_update'
                    and qual like '%has_permission(''manage_users''::text)%')
     or (select count(*) from pg_policies
          where schemaname = 'public' and tablename = 'company_config' and cmd in ('UPDATE','ALL')) <> 1 then
    raise exception 'سياسةُ الكتابة على company_config تغيّرت.' using errcode = 'P0001';
  end if;
end
$post$;
