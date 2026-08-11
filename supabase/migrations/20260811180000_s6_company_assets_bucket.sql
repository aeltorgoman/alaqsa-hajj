-- ============================================================
-- س٦ / الخطوة ٣ — حاوية أصول الشركة
-- ============================================================
-- القرار ق١: حاويتان لا واحدة.
--
--   company-assets    عامّة  ←  شعار · خلفية · أيقونة
--   passengers-docs   خاصّة  ←  جوازات · بطاقات · تصاريح   (الخطوة ٤)
--
-- هوية الحملة **عامة بطبيعتها**: شاشة الدخول تعرضها لزائر مجهول
-- قبل وجود أي جلسة. وتوقيعها تمثيلٌ بلا فائدة يضيف تأخيراً على أول
-- شاشة يراها المستخدم. أمّا الجوازات فلا تُقرأ بلا هوية — فبقاء
-- النوعين في حاوية واحدة هو ما يجعل خصخصتها تكسر شاشة الدخول.
--
-- ⚠️ **لا يُحذف كائن واحد هنا.** النسخ يسبق التحقّق، والتحقّق يسبق
-- تحديث المراجع، والحذف في الخطوة ٥ وحدها بعد ثبوت النسخة الجديدة.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets', 'company-assets', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/svg+xml','image/x-icon']
)
on conflict (id) do nothing;

/* القراءة للجميع — هذا هو الغرض. والكتابة للموظّف المصادَق وحده،
   على النمط نفسه الذي أُقرّ لحاوية المستندات في PR #81. */
create policy "Anyone reads company assets" on storage.objects
  for select to public
  using (bucket_id = 'company-assets');

create policy "Employees upload company assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-assets');

create policy "Employees replace company assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'company-assets')
  with check (bucket_id = 'company-assets');

create policy "Employees delete company assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-assets');
