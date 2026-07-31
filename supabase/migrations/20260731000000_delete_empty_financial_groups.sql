-- ============================================================
-- ضمان عدم بقاء مجموعة مالية بلا أعضاء بعد حذف عضو
-- ============================================================
-- هذه الـ migration تنشئ الدالة والمحفّز فقط.
-- لا تحذف ولا تعدّل أي بيانات موجودة — تشغيلها على قاعدة فيها
-- مجموعات فارغة قديمة يتركها كما هي.
-- تنظيف المتراكم قبل هذا المحفّز في سكربت يدوي منفصل:
--   supabase/scripts/cleanup_empty_financial_groups.sql
--
-- لماذا لا تكفي الواجهة:
--   1) حذف الحاج نفسه — financial_group_members_passenger_id_fkey
--      معرّف ON DELETE CASCADE، وله ثلاثة مداخل:
--      PassengersPage.tsx / AdminsPage.tsx / ArchivePage.tsx
--      ولا واحد منها يعلم بوجود المجموعات المالية.
--   2) سباق تزامني: مستخدمان يزيلان آخِرَين عضوين في اللحظة نفسها،
--      فيرى كلٌّ منهما أن عضوه "ليس الأخير".

create or replace function public.delete_empty_financial_group()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.financial_group_members where group_id = old.group_id
  ) then
    delete from public.financial_groups where id = old.group_id;
  end if;
  return null;
end;
$$;

-- المحفّزات تُستدعى من المحرّك لا من العميل، فسحب EXECUTE
-- لا يؤثر على عملها ويمنع استدعاءها مباشرةً عبر REST.
revoke execute on function public.delete_empty_financial_group() from public, anon, authenticated;

-- constraint trigger مؤجَّل حتى الـ commit: عند حذف المجموعة مباشرةً
-- تُحذف عضوياتها بـ CASCADE ثم يعمل هذا المحفّز، فلا يجد المجموعة
-- ويطابق صفر صفوف — بلا تكرار لا نهائي ولا خطأ.
drop trigger if exists trg_delete_empty_financial_group on public.financial_group_members;

create constraint trigger trg_delete_empty_financial_group
  after delete on public.financial_group_members
  deferrable initially deferred
  for each row
  execute function public.delete_empty_financial_group();
