-- ═══════════════════════════════════════════════════════════════
-- س١ / PR٢ — تصحيح: معرّف الدخول بريد لا اسم مستخدم
-- Security Architecture v1.2 §٤.١ · S1 Implementation Design v1.2 §٣.٣
--
-- القرار المعتمد ألغى Username كلياً: معرّف الدخول هو Email،
-- ويُستعمل Supabase Auth بطريقته الطبيعية. العمود username الذي
-- شُحن في PR١ يحمل الآن اسماً لا يصف محتواه.
--
-- إعادة التسمية آمنة تماماً: الجدول فارغ (صفر صفّ)، ولا شيء في
-- التطبيق يقرؤه — قيد «بلا تغيير في التطبيق» ما زال قائماً.
--
-- ⚠️ لا يلمس هذا الترحيل أي كائن آخر. public.users كما هو حتى س٥.
-- قابل لإعادة التشغيل.
-- ═══════════════════════════════════════════════════════════════

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'user_profiles'
       and column_name  = 'username'
  ) then
    alter table public.user_profiles rename column username to email;
  end if;
end $$;

comment on column public.user_profiles.email is
  'معرّف الدخول (Login ID). يعكس auth.users.email. لا يشترط أن يكون بريداً حقيقياً ولا قابلاً لاستقبال الرسائل، لكنه يجب أن يكون بصيغة بريد صحيحة. يُقرأ من هنا لا من auth.users — الثابت أ١٠.';

comment on table public.user_profiles is
  'ملفّ المستخدم: معرّف الدخول والصلاحيات وحالة التفعيل. الهوية في auth.users. الثابت أ١٠ يمنع أي اعتماد آخر على auth.users.';
