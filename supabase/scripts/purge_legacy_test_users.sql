-- ═══════════════════════════════════════════════════════════════
-- س١ / PR٢ — حذف المستخدمين التجريبيين من public.users
--
-- قرار معتمد: بيانات المستخدمين الحالية كلها تجريبية ولا تُنقل.
-- يبقى حساب admin وحده — وهو الجسر الذي يُبقي التطبيق قابلاً
-- للدخول حتى تكتمل س٢، لأن verify_user ما زالت تقرأ من هنا.
--
-- ⚠️ عملية حذف على الإنتاج. تُنفَّذ يدوياً بعد اعتماد PR٢، ولا
--    يستدعيها أي كود ولا أي بناء.
--
-- ⚠️ لا يلمس هذا الملف auth.users ولا user_profiles ولا أي جدول
--    آخر. الحذف محصور في صفوف public.users غير admin.
--
-- 🔴 قبل التنفيذ: تأكّد أنك تعرف كلمة مرور حساب admin. حذف
--    الحسابات الأخرى يُنهي دخولها فوراً.
-- ═══════════════════════════════════════════════════════════════

-- ── ١. المعاينة — نفّذ هذا أولاً واقرأ الناتج ─────────────────
select id, username, name,
       case when username = 'admin' then 'يبقى' else 'سيُحذف' end as المصير
from public.users
order by (username = 'admin') desc, id;

-- ── ٢. الحذف — نفّذه بعد مراجعة المعاينة ──────────────────────
-- حارس بنيوي: يتوقّف إن لم يوجد admin واحد بالضبط، فلا يمكن أن
-- تُفرَّغ الجداول ويبقى النظام بلا مدخل.
do $$
declare v_admin int; v_deleted int;
begin
  select count(*) into v_admin from public.users where username = 'admin';

  if v_admin <> 1 then
    raise exception 'توقّف: عدد حسابات admin = % (المتوقّع ١). لا حذف.', v_admin
      using errcode = 'P0001';
  end if;

  delete from public.users where username <> 'admin';
  get diagnostics v_deleted = row_count;

  raise notice 'حُذف % حساباً تجريبياً · بقي admin وحده.', v_deleted;
end $$;

-- ── ٣. التحقّق ────────────────────────────────────────────────
select count(*) as المتبقّي,
       (select username from public.users limit 1) as الحساب
from public.users;
-- المتوقّع: المتبقّي = 1 · الحساب = admin
