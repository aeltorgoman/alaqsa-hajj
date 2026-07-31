-- ============================================================
-- إنشاء المجموعة المالية وأول عضو فيها كعملية ذرّية واحدة
-- ============================================================
-- كانت الواجهة تنفّذ طلبين منفصلين: إدراج المجموعة ثم إدراج العضو،
-- بينهما تكون المجموعة فارغة. الكود يتراجع إن فشل الطلب الثاني،
-- لكن انقطاع الاتصال أو إغلاق المتصفح بينهما يترك مجموعة فارغة —
-- ومحفّز trg_delete_empty_financial_group لا يراها لأنه لم يحدث أي DELETE.
--
-- هذه الدالة تجعل الإدراجين داخل معاملة واحدة: جسم دالة plpgsql
-- يعمل كوحدة ذرّية، فأي خطأ في أي سطر يُرجع كل ما سبقه.
-- لا يمكن أن تبقى مجموعة بلا عضو بسبب فشل أو انقطاع.
--
-- ملاحظة أمنية مقصودة: الدالة SECURITY INVOKER (الوضع الافتراضي)
-- لا SECURITY DEFINER — فتعمل بصلاحيات المستدعي وتحترم أي RLS
-- تُضاف لاحقاً، ولا تفتح مساراً متجاوزاً للصلاحيات كما في
-- create_user/update_user الحاليتين.

create or replace function public.create_financial_group_with_member(
  p_name         text,
  p_notes        text,
  p_created_by   text,
  p_passenger_id integer
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
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

  -- قيد financial_group_members_passenger_id_key UNIQUE (passenger_id)
  -- يرفع 23505 لو كان الحاج منتمياً لمجموعة أخرى، فتُلغى المعاملة
  -- بالكامل ولا تبقى المجموعة المُنشأة أعلاه.
  insert into public.financial_group_members (group_id, passenger_id)
  values (v_group.id, p_passenger_id)
  returning * into v_member;

  return json_build_object(
    'group',  to_json(v_group),
    'member', to_json(v_member)
  );
end;
$$;

revoke execute on function public.create_financial_group_with_member(text, text, text, integer) from public;
grant  execute on function public.create_financial_group_with_member(text, text, text, integer) to anon, authenticated, service_role;
