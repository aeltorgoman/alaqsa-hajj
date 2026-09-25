-- ════════════════════════════════════════════════════════════
-- حاويةٌ خاصّةٌ للخِتم وتوقيع المسؤول
-- ════════════════════════════════════════════════════════════
-- `company-assets` حاويةٌ **عامّة** (`public = 't'`)، وعلانيّةُ الحاوية
-- في Supabase صفةُ حاويةٍ لا صفةُ مسار: المسارُ
--     /storage/v1/object/public/<bucket>/<path>
-- يخدم أيَّ كائنٍ فيها **بلا مصادقةٍ وبلا مرورٍ على سياسات
-- `storage.objects` أصلاً**. فلا وجودَ لمسارٍ محميٍّ داخل حاويةٍ عامّة
-- مهما كُتب من سياسات — ومن عرف الرابطَ أخذ الملفّ.
--
-- ولهذا لا يكفي أن يكون صفُّ `company_assets` محجوباً عن `anon`
-- (وهو محجوبٌ فعلاً: `company_assets_public_read` قائمةُ سماحٍ لا
-- تضمّ هذين المفتاحين): الصفُّ محجوبٌ والكائنُ مكشوف.
--
-- والعلاجُ حاويةٌ ثانيةٌ خاصّة — وهو **النمطُ القائمُ في المشروع
-- نفسِه**: `passengers-docs` خاصّةٌ منذ الأساس، ويُخزَّن منها
-- **مفتاحُ الكائن** لا رابطٌ، ويُوقَّع عند العرض. نتبع المنوالَ ذاته
-- بدل اختراع ثالث.
--
-- ⚠️ ولا تُمَسّ `company-assets` ولا سياساتُها: الشعارُ وخلفيةُ
--    الدخولِ والبانرُ تحتاج القراءةَ العلنيّةَ فعلاً — شاشةُ الدخول
--    تعرضها قبل وجودِ جلسة. علانيّتُها مشروعةٌ وتبقى.

-- ── الحاوية ─────────────────────────────────────────────────
-- `public = 'f'`: لا مسارَ علنيّاً لها بحال، والقراءةُ تمرّ على
-- السياسةِ أدناه أو على رابطٍ موقّعٍ قصيرِ العمر.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-private', 'company-private', 'f', 5242880,
        '{image/jpeg,image/png,image/webp}'::text[])
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── السياساتُ الأربع — كلُّها خلف `manage_users`، ولا شيءَ لـ`anon` ──
-- وحتى القراءةُ مشروطةٌ بالصلاحية: الموظّفُ المصادَقُ بلا
-- `manage_users` لا يقرأ توقيعَ المسؤول. وهذا أضيقُ من
-- `passengers-docs` التي تكتفي بالمصادقة — والتوقيعُ يستحقّ الأضيق.
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'Managers read company private assets') then
    create policy "Managers read company private assets" on storage.objects
      for SELECT to authenticated
      using (bucket_id = 'company-private' and public.has_permission('manage_users'));
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'Managers upload company private assets') then
    create policy "Managers upload company private assets" on storage.objects
      for INSERT to authenticated
      with check (bucket_id = 'company-private' and public.has_permission('manage_users'));
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'Managers replace company private assets') then
    create policy "Managers replace company private assets" on storage.objects
      for UPDATE to authenticated
      using      (bucket_id = 'company-private' and public.has_permission('manage_users'))
      with check (bucket_id = 'company-private' and public.has_permission('manage_users'));
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'Managers delete company private assets') then
    create policy "Managers delete company private assets" on storage.objects
      for DELETE to authenticated
      using (bucket_id = 'company-private' and public.has_permission('manage_users'));
  end if;
end;
$$;

-- ── شرطٌ لاحقٌ يفشل بوضوحٍ بدل أن يُسلّم بصمت ────────────────
do $$
declare
  v_public boolean;
  v_n      integer;
  v_anon   integer;
begin
  select public into v_public from storage.buckets where id = 'company-private';
  if v_public is null then
    raise exception 'الحاوية company-private لم تُنشأ.' using errcode = 'P0001';
  end if;
  if v_public then
    raise exception 'الحاوية company-private عامّة — وهذا ينقض الغرضَ كلَّه.' using errcode = 'P0001';
  end if;

  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('Managers read company private assets',
                        'Managers upload company private assets',
                        'Managers replace company private assets',
                        'Managers delete company private assets');
  if v_n <> 4 then
    raise exception 'سياساتُ الحاوية الخاصّة ناقصة: وُجد % من ٤.', v_n using errcode = 'P0001';
  end if;

  -- ولا سياسةَ واحدةً تمنح `anon` أو `public` شيئاً على هذه الحاوية.
  -- ⚠️ `coalesce` على الطرفين لا على واحد: `qual` تكون NULL في سياسة
  --    INSERT، و`NULL || 'x'` = NULL، فالشرطُ كان يعمى عن سياسةِ
  --    إدراجٍ مفتوحةٍ لغير المصادَق — وهي أخطرُ ما يُفحَص هنا.
  select count(*) into v_anon from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and coalesce(qual, '') || coalesce(with_check, '') like '%company-private%'
     and ('anon' = any(roles) or 'public' = any(roles));
  if v_anon <> 0 then
    raise exception 'وُجدت % سياسةً تفتح company-private لغير المصادَق.', v_anon using errcode = 'P0001';
  end if;

  -- وكلُّ واحدةٍ من الأربع تشترط `manage_users` فعلاً — لا بالاسم
  select count(*) into v_anon from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and coalesce(qual, '') || coalesce(with_check, '') like '%company-private%'
     and coalesce(qual, '') || coalesce(with_check, '') like '%has_permission%';
  if v_anon <> 4 then
    raise exception 'سياساتُ الحاوية الخاصّة المشروطةُ بالصلاحية: % من ٤.', v_anon using errcode = 'P0001';
  end if;

  -- والحاويةُ العامّةُ لم تُمَسّ: الشعارُ وشاشةُ الدخول كما كانا
  if not exists (select 1 from storage.buckets where id = 'company-assets' and public) then
    raise exception 'الحاوية company-assets لم تعد عامّة — شاشةُ الدخول تفقد شعارَها.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'Anyone reads company assets') then
    raise exception 'سياسةُ القراءة العلنيّة للشعار اختفت.' using errcode = 'P0001';
  end if;
end;
$$;
