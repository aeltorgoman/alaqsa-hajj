-- ═══════════════════════════════════════════════════════════════
-- س١ / PR١ — أساس الهوية
-- Security Architecture v1.1 §٤ · §٥ · S1 Implementation Design v1.1
--
-- هذا الترحيل يبني البنية ولا يستهلكها شيء بعد. التطبيق يواصل
-- الدخول عبر verify_user و public.users بلا أي تغيير — النظامان
-- يتعايشان حتى س٢.
--
-- ⚠️ لا يلمس هذا الترحيل أي كائن قائم: لا alter ولا drop ولا
-- revoke على جدول أو دالة أو سياسة سابقة. الإضافة فقط.
--
-- قابل لإعادة التشغيل: if not exists · or replace · drop policy if exists.
-- ═══════════════════════════════════════════════════════════════

-- ── ١. user_profiles — جسر الهوية والصلاحية ────────────────────
-- auth.users تملك الهوية · user_profiles تملك الصلاحية.
-- الثابت أ١٠: id هنا هو المرجع الوحيد إلى auth.users في النظام
-- كلّه. لا جدول آخر ولا دالة أخرى تمسّ جداول Supabase الداخلية.
create table if not exists public.user_profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  username    text        not null unique,
  name        text        not null,
  permissions jsonb       not null default '{}'::jsonb,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.user_profiles is
  'ملفّ المستخدم: الصلاحيات وحالة التفعيل. الهوية في auth.users. الثابت أ١٠ يمنع أي اعتماد آخر على auth.users.';

-- username فريد: قيد جديد لا نظير له على public.users. يمنع
-- ازدواجاً يكسر اشتقاق البريد الاصطناعي في س١/PR٢.

-- ── ٢. has_permission — نقطة التفويض الوحيدة ───────────────────
-- كل قرار تفويض في النظام يمرّ من هنا. لا فحص صلاحية في أي موضع
-- آخر — لا في سياسة ولا في دالة ولا في Edge Function.
--
-- security definer مقصود: يقرأ الجدول بلا حاجة لمنح المستخدم
-- قراءة مباشرة، ويمنع كذلك التكرار اللانهائي حين تستدعيه سياسة
-- على الجدول نفسه (مالك الجدول لا تنطبق عليه RLS).
--
-- ثلاثة مسارات تعود false، وهي جوهر الثابتين أ٢ و أ٣:
--   لا ملفّ أصلاً        → false   (الوجود في auth.users لا يمنح شيئاً)
--   is_active = false    → false   (التعطيل يسري على الطلب التالي)
--   مفتاح غير موجود      → false
create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select up.is_active
              and coalesce((up.permissions ->> p_key)::boolean, false)
       from public.user_profiles up
      where up.id = (select auth.uid())),
    false);
$$;

comment on function public.has_permission(text) is
  'نقطة التفويض الوحيدة. تقرأ صلاحية المستخدم الحالي من user_profiles وتفحص is_active. غياب الملفّ أو التعطيل أو غياب المفتاح كلها false.';

-- ── ٣. الصلاحيات ───────────────────────────────────────────────
-- ⚠️ لا يُفترض أن مخطّط public نظيف: الامتيازات الافتراضية قد
-- تمنح الجدول الجديد لـ anon تلقائياً. السحب صريح لا ضمنيّ.
revoke all on table public.user_profiles from public;
revoke all on table public.user_profiles from anon;

grant select, insert, update, delete on table public.user_profiles to authenticated;
grant all    on table public.user_profiles to service_role;

revoke execute on function public.has_permission(text) from public;
revoke execute on function public.has_permission(text) from anon;
grant  execute on function public.has_permission(text) to authenticated, service_role;

-- ── ٤. RLS — من لحظة الإنشاء لا لاحقاً ─────────────────────────
-- الدرس من C2: enable row level security مع سياسة using (true)
-- أسوأ من لا شيء — يبدو محمياً وهو مكشوف. هذا الجدول يُولد
-- بسياسات حقيقية، فلا نخلق ديناً نصلحه في س٤.
alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select on public.user_profiles;
create policy user_profiles_select on public.user_profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.has_permission('manage_users'));

drop policy if exists user_profiles_insert on public.user_profiles;
create policy user_profiles_insert on public.user_profiles
  for insert to authenticated
  with check (public.has_permission('manage_users'));

drop policy if exists user_profiles_update on public.user_profiles;
create policy user_profiles_update on public.user_profiles
  for update to authenticated
  using      (public.has_permission('manage_users'))
  with check (public.has_permission('manage_users'));

drop policy if exists user_profiles_delete on public.user_profiles;
create policy user_profiles_delete on public.user_profiles
  for delete to authenticated
  using (public.has_permission('manage_users'));

-- ملاحظة على سياسة القراءة: الشقّ الأول يسمح لكل مستخدم بقراءة
-- ملفّه هو. بدونه لا يستطيع أحد قراءة صلاحياته الخاصة، ويلزم
-- منح manage_users للجميع — وهو نقيض المقصود.
