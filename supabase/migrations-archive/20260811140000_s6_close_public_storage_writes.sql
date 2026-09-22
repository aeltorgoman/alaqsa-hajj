-- ============================================================
-- س٦ / PR ١ — إغلاق الكتابة العامة على التخزين
-- ============================================================
-- Security Architecture §٦ · BACKLOG أ١ (C3).
--
-- 🔴 الخطر الذي يغلقه هذا الترحيل **ليس السرّية بل الفقد**:
-- حاوية passengers-docs كانت تحمل ثلاث سياسات كلها `to public`،
-- ومنها **Public upload** و**Public delete**. و`public` في RLS تشمل
-- `anon`، ومفتاح النشر العلني منشور في حزمة المتصفح. أي أن أي أحد
-- كان يستطيع **حذف الكائنات الـ١٤٤ كلها** — جوازات الحجاج وبطاقاتهم
-- وشعار الحملة معها — أو الكتابة فوقها، أو ملء الحاوية بما يشاء.
--
-- ⚠️ درس س٤ مطبَّق هنا: لا يكفي التفكير في `anon` وحده. السياسات
-- كانت `to public`، وهي أوسع من `anon` وتشملها. فالإسقاط بالاسم
-- والمنح المحصور في `authenticated` هما ما يغلق الباب فعلاً.
--
-- **القراءة العامة تبقى مؤقتاً** وعمداً: خصخصة الحاوية تكسر شاشة
-- الدخول والبوابة وكل عارض مستند، وتأتي في آخر خطوات س٦ بعد أن
-- يمرّ كل قارئ بطبقة التوقيع. هذا الترحيل **لا يغيّر `public=true`
-- ولا يمسّ رابطاً واحداً ولا سطراً في الواجهة**.

drop policy if exists "Public upload" on storage.objects;
drop policy if exists "Public delete" on storage.objects;

/* الكتابة للموظّف المصادَق وحده، ومحصورة في حاوية المستندات */
create policy "Employees upload passenger docs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'passengers-docs');

create policy "Employees replace passenger docs" on storage.objects
  for update to authenticated
  using (bucket_id = 'passengers-docs')
  with check (bucket_id = 'passengers-docs');

create policy "Employees delete passenger docs" on storage.objects
  for delete to authenticated
  using (bucket_id = 'passengers-docs');

-- ── لماذا لا يوجد `revoke … from anon` هنا ──────────────────
-- جُرِّب فسقط صامتاً: منح `anon` على storage.objects صادر عن
-- supabase_storage_admin، و postgres لا يستطيع سحب منحِ غيره ولا
-- انتحال ذلك الدور (`permission denied to set role`). وهذا تصميم
-- Supabase لا نقص فيه: المنح الجدوليّ مفتوح عمداً لكل الأدوار،
-- و**RLS هي أداة التحكّم الوحيدة في التخزين**.
--
-- فالسياسات أعلاه ليست طبقةً ثانية بل هي الطبقة نفسها. وأُثبت
-- عملياً: إدراج بدور anon يسقط بـ
--   42501 new row violates row-level security policy
-- ولا يُترك في الملفّ سطرٌ لا يفعل شيئاً فيوهم بحماية لا وجود لها.
