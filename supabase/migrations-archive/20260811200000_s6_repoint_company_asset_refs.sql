-- ============================================================
-- س٦ / الخطوة ٣ (ب) — تحويل مراجع أصول الشركة إلى حاويتها
-- ============================================================
-- المبدأ المُلزِم: **انسخ ← تحقّق ← حوّل المرجع**. النسخ تمّ بسكربت
-- `copy_company_assets.mjs`، والتحقّق تمّ على الإنتاج بمطابقة
-- **المجموع الاختباري `eTag`** لا الحجم وحده — أي تطابق بايتات.
--
-- ولا يُحذف أصلٌ هنا ولا في هذه الخطوة كلها: الكائنات الـ٤٢ تحت
-- `0/` تبقى مكانها، والحذف في الخطوة ٥ بعد ثبوت النسخة الجديدة.
--
-- التحويل نصّيّ محصور: `/passengers-docs/0/` ← `/company-assets/`،
-- فيحتفظ بالمضيف والاسم كما هما. وشرط `exists` يمنع تحويل مرجع إلى
-- كائن لم يُنسخ — فلا يمكن أن يشير صفٌّ إلى فراغ.

update public.company_assets a
   set asset_url = replace(a.asset_url, '/passengers-docs/0/', '/company-assets/')
 where a.asset_url like '%/passengers-docs/0/%'
   and exists (
     select 1 from storage.objects o
      where o.bucket_id = 'company-assets'
        and o.name = split_part(a.asset_url, '/passengers-docs/0/', 2)
   );

update public.company_config c
   set logo_url = replace(c.logo_url, '/passengers-docs/0/', '/company-assets/')
 where c.logo_url like '%/passengers-docs/0/%'
   and exists (
     select 1 from storage.objects o
      where o.bucket_id = 'company-assets'
        and o.name = split_part(c.logo_url, '/passengers-docs/0/', 2)
   );

update public.company_config c
   set banner_image_url = replace(c.banner_image_url, '/passengers-docs/0/', '/company-assets/')
 where c.banner_image_url like '%/passengers-docs/0/%'
   and exists (
     select 1 from storage.objects o
      where o.bucket_id = 'company-assets'
        and o.name = split_part(c.banner_image_url, '/passengers-docs/0/', 2)
   );
