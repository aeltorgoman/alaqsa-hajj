-- ============================================================
-- معالجةُ تفويضِ الإعدادات — حدٌّ ضيّقٌ للبوابة، وبايتاتٌ محميّة
-- ============================================================
-- ثلاثةُ عيوبٍ أُثبتت في مرحلة التحقّق (Phase 0)، وعلاجُها هنا:
--
--   ١) صفحةُ البوابة تُفتح بـ`manage_portal`، وتكتب في
--      `company_config` التي تشترط سياستُها `manage_users`. فمن
--      يملك البوابةَ وحدها لا يكتب شيئاً — و`UPDATE` يُرشَّح صفرَ
--      صفوفٍ بلا خطأ، فتقول الشاشةُ «تم الحفظ» ولم يُحفظ شيء.
--
--   ٢) وبايتاتُ هويّة الحملة في حاوية `company-assets` مفتوحةٌ
--      للكتابة **لكلّ مصادَق**، بينما جدولُ `company_assets` الذي
--      يشير إليها مقفلٌ بـ`manage_users`. فالمؤشّرُ محميٌّ
--      والمشارُ إليه مكشوف.
--
-- ⚠️ ولا تُوسَّع سياسةُ `company_config` — وهذا قرارٌ لا سهو:
--    توسيعُها يمنح `manage_portal` كتابةَ **كلّ عمود** (الحسابُ
--    البنكيّ والألوانُ واسمُ الحملة)، فيتحوّل عيبُ التضييق إلى عيبِ
--    التوسيع. فالبابُ الوحيد دالّةٌ ضيّقةٌ لا تقبل إلا ستّةَ حقول.
--
-- المرجع: Settings Phase 0 · Security Remediation Design
-- ============================================================


-- ------------------------------------------------------------
-- ١) دالّةُ إعدادات البوابة — ستّةُ حقولٍ لا سابعَ لها
-- ------------------------------------------------------------
-- الحقولُ **معلَنةٌ في التوقيع** لا مُمرَّرةٌ كائناً حرّاً: لا اسمَ
-- عمودٍ يأتي من العميل، ولا SQL يُركَّب نصّاً. فما لا يُذكَر هنا لا
-- يُكتَب بهذا الباب مهما صيغ الطلب.
--
-- وما استُثني عمداً — الفندقُ ومنى وعرفةُ والدولةُ والمدينةُ
-- و`features` و`season_label` — يبقى على `manage_users` كما هو،
-- لأنّ ملكيّتَه الموسميّة **لم تُقرَّر بعد**. واستثناؤه هنا يحفظ
-- القرارَ مفتوحاً: إضافتُه لاحقاً سطرٌ في التوقيع، ونقلُه إلى جدولٍ
-- موسميّ لا يمسّ هذه الدالّة أصلاً.
create or replace function public.update_portal_settings(
  p_portal_settings        jsonb,
  p_portal_welcome_message text,
  p_portal_help_message    text,
  p_admin_name             text,
  p_admin_phone            text,
  p_admin_whatsapp         text
)
returns public.company_config
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.company_config;
begin
  -- الحارسُ **داخل الجسم** لا في السياسة: الدالّة `SECURITY DEFINER`
  -- فهي تتجاوز RLS بطبعها، ولا يحرسها إلا هذا الشرط.
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

  -- صفرُ صفوفٍ ليس نجاحاً صامتاً: الصفّ الوحيد مفقودٌ فعلاً.
  if not found then
    raise exception 'لا يوجد صفّ إعدادات للحملة.'
      using errcode = 'P0002';
  end if;

  -- الصفُّ المعاد هو **برهانُ الأثر**: لا يستطيع النداءُ أن ينجح
  -- بلا صفّ، فيستحيل أن يُقرأ الصمتُ نجاحاً.
  return v_row;
end;
$$;

comment on function public.update_portal_settings(jsonb, text, text, text, text, text) is
  'إعداداتُ بوابة الحاج — البابُ الوحيد لـmanage_portal إلى company_config. ستّةُ حقولٍ معلَنةٌ في التوقيع، والحارسُ داخل الجسم، والصفُّ المعاد برهانُ الأثر. ولا تُوسَّع سياسةُ الجدول.';

-- لا تنفيذَ ضمنيّ: السحبُ صريحٌ ثم المنحُ للمصادَق وحده.
revoke execute on function public.update_portal_settings(jsonb, text, text, text, text, text) from public, anon;
grant  execute on function public.update_portal_settings(jsonb, text, text, text, text, text) to authenticated;


-- ------------------------------------------------------------
-- ٢) بايتاتُ هويّة الحملة تُقفَل بما يُقفَل به مؤشّرُها
-- ------------------------------------------------------------
-- القراءةُ العامّة **لا تُمسّ**: شاشةُ الدخول وبوابةُ الحاج وأيقونةُ
-- التطبيق تعرض الشعارَ قبل وجود جلسةٍ أصلاً. المشكلةُ في الكتابة.
--
-- وقد أُحصي كلُّ كاتبٍ شرعيّ قبل هذا الترحيل: `uploadCompanyAsset`
-- وحدها، بنداءَين في `UsersPage` كلاهما خلف `manage_users` أصلاً.
-- فالتضييقُ لا يكسر مساراً قائماً. ومعالجُ الإقلاع (ب٠) غيرُ مبنيٍّ
-- بعد، ورفعُ الأصول فيه اختياريٌّ بقراره المعتمَد.
--
-- ⚠️ و`upsert: true` في مسار الرفع يعني أنّ الرفعَ قد يكون تحديثاً:
-- فلو شُدّد أحدُ الأمرين دون الآخر بقي البابُ مفتوحاً من جهة.

drop policy if exists "Employees upload company assets"  on storage.objects;
drop policy if exists "Employees replace company assets" on storage.objects;
drop policy if exists "Employees delete company assets"  on storage.objects;

create policy "Employees upload company assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-assets' and public.has_permission('manage_users'));

create policy "Employees replace company assets" on storage.objects
  for update to authenticated
  using       (bucket_id = 'company-assets' and public.has_permission('manage_users'))
  with check  (bucket_id = 'company-assets' and public.has_permission('manage_users'));

create policy "Employees delete company assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-assets' and public.has_permission('manage_users'));

-- سياسةُ القراءة `Anyone reads company assets` **لم تُمسّ**.


-- ============================================================
-- التراجع (يدويّ عند الحاجة)
-- ------------------------------------------------------------
--   drop function if exists public.update_portal_settings(jsonb, text, text, text, text, text);
--   ثمّ إعادةُ السياسات الثلاث بلا شرط الصلاحية كما كانت في
--   20260811180000_s6_company_assets_bucket.sql
-- ولا بيانَ يُهاجَر ولا كائنَ يُنقَل، فالتراجعُ بلا أثرٍ على البيانات.
-- ============================================================
