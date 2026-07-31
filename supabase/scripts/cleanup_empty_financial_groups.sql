-- ============================================================
-- سكربت يدوي: تنظيف المجموعات المالية الفارغة المتراكمة
-- ============================================================
-- ⚠️ يحذف بيانات. لا يعمل تلقائياً — خارج مجلد migrations عمداً
--    حتى لا يُنفَّذ ضمن أي ترقية.
--
-- متى يُستخدم: مرة واحدة على قاعدة قائمة، بعد تطبيق الـ migration
--   20260731000000_delete_empty_financial_groups.sql
--   لتنظيف ما تراكم قبل وجود المحفّز.
--
-- القاعدة الجديدة لا تحتاجه إطلاقاً — المحفّز يمنع تكوّن مجموعة
-- فارغة من الأصل.

-- ── الخطوة ١: عايِن قبل الحذف ───────────────────────────────
-- شغّل هذا وحده أولاً وراجع النتيجة:
select g.id, g.name, g.created_by, g.created_at
from public.financial_groups g
where not exists (
  select 1 from public.financial_group_members m where m.group_id = g.id
)
order by g.id;

-- ── الخطوة ٢: احذف بعد الاقتناع بالقائمة أعلاه ──────────────
-- أزل التعليق عن الكتلة التالية ثم شغّلها.
-- begin;
--
-- delete from public.financial_groups g
-- where not exists (
--   select 1 from public.financial_group_members m where m.group_id = g.id
-- );
--
-- -- تحقّق أن العدد المحذوف يطابق ما عاينته في الخطوة ١،
-- -- ثم commit — أو rollback إن اختلف.
-- commit;
