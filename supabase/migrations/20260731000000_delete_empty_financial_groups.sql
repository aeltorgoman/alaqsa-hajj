-- ============================================================
-- ضمان عدم بقاء مجموعة مالية بلا أعضاء — في أي سيناريو
-- ============================================================
-- منطق الواجهة يغطّي الإزالة المقصودة فقط. تبقى مسارات لا يراها:
--   1) حذف الحاج نفسه — financial_group_members_passenger_id_fkey
--      معرّف ON DELETE CASCADE، وله ثلاثة مداخل:
--      PassengersPage.tsx / AdminsPage.tsx / ArchivePage.tsx
--      ولا واحد منها يعلم بوجود المجموعات المالية.
--   2) سباق تزامني: مستخدمان يزيلان آخِرَين عضوين في اللحظة نفسها،
--      فيرى كلٌّ منهما أن عضوه "ليس الأخير".
-- القاعدة وحدها تستطيع إغلاق الاثنين.

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

-- تنظيف المجموعات الفارغة الموجودة حالياً.
-- ⚠️ يحذف بيانات: عند كتابة هذا الملف كانت مجموعة واحدة فارغة
--    (id=1 «عائلة الترجمان»، صفر أعضاء). راجِع القائمة قبل التطبيق:
--    select g.id, g.name from financial_groups g
--      left join financial_group_members m on m.group_id = g.id
--     where m.id is null;
delete from public.financial_groups g
where not exists (
  select 1 from public.financial_group_members m where m.group_id = g.id
);
