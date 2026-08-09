-- ============================================================
-- س٤ / PR ٢ — سياسات RLS حقيقية وسحب صلاحيات anon
-- ============================================================
-- Security Architecture v1.3 §٦ · S4 Implementation Design v1.2
-- يغلق C2: «مفتاح anon العام = صلاحيات كاملة على القاعدة».
--
-- ⚠️ هذا أخطر ترحيل في المشروع أثراً. لا يُطبَّق قبل استيفاء شروط
-- النشر الثلاثة: seed_first_admin · حساب كسر الزجاج ودخوله المتحقَّق
-- ومسار استعادته الموثَّق · الفحص الحيّ لس٣.
--
-- المبدأ: الرفض هو الافتراض. لا يُسمح إلا بما يُذكر صراحةً.
--
--   SELECT                    →  لكل موظّف نشط          (انتقاليّ · §٣.٢.١)
--   INSERT · UPDATE · DELETE  →  الصلاحية المطابقة لبند NAV
--
-- والقراءة الموسَّعة **حلّ انتقاليّ** سببه أن التطبيق يجلب الحجاج
-- جلباً شاملاً عند الإقلاع. تُضيَّق حين ينتقل إلى الجلب الخاصّ بكل
-- ميزة — وذلك خارج س٤.

-- ── ١) الموظّف النشط — أخت has_permission لا بديلها ──────────
-- has_permission تبقى نقطة التفويض الوحيدة (§٥.٢). هذه تجيب سؤالاً
-- آخر: «هل المستدعي موظّف نشط أصلاً؟» — بلا أي مفتاح صلاحية.
create or replace function public.is_active_employee()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select up.is_active from public.user_profiles up where up.id = (select auth.uid())),
    false);
$$;

comment on function public.is_active_employee() is
  'هل المستدعي موظّف نشط له ملفّ؟ تُستعمل في سياسات القراءة وحدها — التفويض يمرّ بـ has_permission.';

revoke execute on function public.is_active_employee() from public, anon;
grant execute on function public.is_active_employee() to authenticated, service_role;

-- ── ٢) إسقاط كل سياسة قائمة على الجداول التشغيلية ────────────
-- بالاسم لا يكفي: «allow all» ليست الاسم الوحيد المستعمل تاريخياً.
-- الإسقاط الشامل يضمن ألّا تبقى سياسة متساهلة منسيّة (خ٢).
do $$
declare
  t text;
  p text;
  tables text[] := array[
    'announcements','buses','camps','custom_charges','financial_group_members',
    'financial_groups','flights','notification_deliveries','passengers',
    'payments','pricing_settings','rooms','seasons','users'];
begin
  foreach t in array tables loop
    for p in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ── ٣) السياسات — أربع صريحة لكل جدول ───────────────────────
-- to authenticated في كل واحدة: لا تنطبق على anon إطلاقاً.
do $$
declare
  r record;
  perms text[][] := array[
    ['passengers',              'manage_passengers'],
    ['buses',                   'manage_buses'],
    ['camps',                   'manage_camps'],
    ['rooms',                   'manage_hotel'],
    ['flights',                 'manage_flights'],
    ['payments',                'manage_payments'],
    ['custom_charges',          'manage_payments'],
    ['financial_groups',        'manage_payments'],
    ['financial_group_members', 'manage_payments'],
    ['pricing_settings',        'manage_payments'],
    ['announcements',           'manage_portal']];
  i int;
  t text;
  k text;
begin
  for i in 1 .. array_length(perms, 1) loop
    t := perms[i][1];
    k := perms[i][2];

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active_employee())',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_permission(%L))',
      t || '_insert', t, k);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_permission(%L)) with check (public.has_permission(%L))',
      t || '_update', t, k, k);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_permission(%L))',
      t || '_delete', t, k);
  end loop;
end $$;

/* المواسم: يقرأها كل موظّف نشط (مزوّد الموسم يحمّلها عند الإقلاع).
   ولا كتابة لأحد من العميل — close_season و delete_season تُنفَّذان
   بمفتاح الخدمة عبر season-admin، وهو يتجاوز RLS. */
create policy seasons_select on public.seasons
  for select to authenticated using (public.is_active_employee());

/* سجل التسليم: تقرير الوصول في صفحة البوابة يقرأه من يملك manage_portal.
   والكتابة لدالة الدفع بمفتاح الخدمة وحدها. */
create policy notification_deliveries_select on public.notification_deliveries
  for select to authenticated using (public.has_permission('manage_portal'));

/* public.users القديم: لا سياسة لأحد — RLS مفعّلة بلا منفذ.
   verify_user تبقى عاملة لأنها SECURITY DEFINER، ولا مستدعي لها في
   المستودع بعد س٣. الجدول والدوال تُحذف في س٥. */

-- ── ٤) سحب صلاحيات anon ─────────────────────────────────────
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

/* ومنع تسرّب مستقبليّ: أي جدول جديد لا يُمنح لـ anon تلقائياً.
   الامتيازات الافتراضية في مخطّط public هي ما منح الجداول القائمة
   صلاحياتها الكاملة أصلاً (خ٣ من تصميم س١). */
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ── ٥) ما يُعاد منحه لـ anon — جرد الوصول المجهول وحده ──────
-- ج١ · ج٢ — سطح الإقلاع وشاشة الدخول
grant select on table public.company_profile_public to anon;
grant select on table public.company_assets        to anon;

-- ج٣ – ج٧ — بوابة الحاج، كلها SECURITY DEFINER بإسقاط مضبوط
grant execute on function public.get_pilgrim_portal(text, integer, integer, integer) to anon;
grant execute on function public.get_portal_announcements()                          to anon;
grant execute on function public.register_pilgrim_push(text, integer, integer, integer, text, text, text, text, text) to anon;
grant execute on function public.unregister_pilgrim_push(text)                       to anon;
grant execute on function public.mark_pilgrim_notification_read(text, integer, integer, integer, bigint) to anon;

-- ── ٦) الصلاحيات المطلوبة للموظّف ────────────────────────────
-- تُعاد صريحةً بعد إسقاط ما لا يلزم (REFERENCES · TRIGGER · TRUNCATE).
do $$
declare
  t text;
  tables text[] := array[
    'announcements','buses','camps','custom_charges','financial_group_members',
    'financial_groups','flights','passengers','payments','pricing_settings','rooms'];
begin
  foreach t in array tables loop
    execute format('revoke all on table public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

/* قراءة فقط للموظّف — الكتابة عبر المسارات الموثوقة وحدها */
revoke all on table public.seasons                 from authenticated;
revoke all on table public.notification_deliveries from authenticated;
revoke all on table public.users                   from authenticated;
grant select on table public.seasons                 to authenticated;
grant select on table public.notification_deliveries to authenticated;

/* المتتاليات: الإدراج يحتاج usage — تبقى للموظّف وتُسحب من anon (أعلاه) */
grant usage, select on all sequences in schema public to authenticated;
