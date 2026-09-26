-- ════════════════════════════════════════════════════════════
-- قراءةُ الخِتمِ والتوقيعِ لموظّفِ المالية — للطباعةِ وحدَها
-- ════════════════════════════════════════════════════════════
-- version : 20260926092000
--
-- العلّة، مُثبَتةٌ بفحصٍ لا بظنّ: حاويةُ `company-private` سياساتُها
-- الأربعُ كلُّها تشترط `manage_users`، والإيصالَ يطبعه موظّفُ ماليةٍ
-- يملك `manage_payments`. فكان توقيعُ الرابطِ يفشل له، ويُطبَع
-- الإيصالُ بإطارٍ فارغٍ بلا ختمٍ ولا توقيع.
--
-- والتغييرُ **إضافةٌ لا تعديل**: تُضاف سياسةُ قراءةٍ واحدةٌ جديدة،
-- ولا تُمَسُّ سياسةٌ قائمةٌ بحرف. وسياساتُ RLS لنفسِ الأمرِ تتحّد
-- بـOR، فيبقى `manage_users` على ما كان **كاملاً** — قراءةً ورفعاً
-- واستبدالاً وحذفاً — ويُضاف لـ`manage_payments` حقُّ القراءةِ فقط.
--
-- ولا سطرَ هنا يذكر INSERT أو UPDATE أو DELETE: الكتابةُ تبقى
-- حيث كانت. ولا تُمَسُّ علانيّةُ الحاويةِ ولا حدُّ حجمِها ولا أنواعُها.
--
-- والنطاقُ أضيقُ من «الحاوية»: القراءةُ مقصورةٌ على كائنَي الخِتمِ
-- والتوقيعِ بالاسم (`company_stamp_*` و`manager_signature_*` كما
-- يسمّيهما `uploadPrivateCompanyAsset`)، فأيُّ أصلٍ خاصٍّ يُضاف
-- مستقبلاً يبقى محجوباً عن المالية افتراضاً حتى يُقرَّر عمداً.
--
-- ⚠️ ولا تُعدَّل الترحيلةُ 20260925090000 المطبَّقةُ أصلاً بحال.

-- ── شرطٌ مسبَق: الحالةُ التي نبني عليها كما نتوقّعها ─────────
do $$
declare v_public boolean; v_manage integer;
begin
  select public into v_public from storage.buckets where id = 'company-private';
  if v_public is null then
    raise exception 'حاويةُ company-private غير موجودة — الترحيلةُ 20260925090000 لم تُطبَّق.'
      using errcode = 'P0001';
  end if;
  if v_public then
    raise exception 'حاويةُ company-private صارت عامّة — يُوقَف كلُّ شيءٍ حتى يُفهَم السبب.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_manage from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and coalesce(qual, '') || coalesce(with_check, '') like '%company-private%'
     and coalesce(qual, '') || coalesce(with_check, '') like '%manage_users%';
  if v_manage <> 4 then
    raise exception 'سياساتُ manage_users على company-private % لا ٤ — الحالةُ غيرُ المتوقَّعة.', v_manage
      using errcode = 'P0001';
  end if;
end;
$$;

-- ── السياسةُ الجديدة: قراءةٌ فقط، ولكائنَي الطباعةِ فقط ───────
drop policy if exists "Payments staff read company seals" on storage.objects;
create policy "Payments staff read company seals"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'company-private'
    and (name like 'company_stamp\_%' or name like 'manager\_signature\_%')
    and public.has_permission('manage_payments')
  );

-- ── شرطٌ لاحقٌ يفشل بوضوحٍ بدل أن يُسلّم بصمت ─────────────────
do $$
declare v_n integer; v_cmd text; v_anon integer;
begin
  -- السياساتُ الأربعُ القائمةُ لم تُمَسّ
  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and coalesce(qual, '') || coalesce(with_check, '') like '%company-private%'
     and coalesce(qual, '') || coalesce(with_check, '') like '%manage_users%';
  if v_n <> 4 then
    raise exception 'سياساتُ manage_users صارت % لا ٤ — شيءٌ مُسّ وما كان له أن يُمَسّ.', v_n
      using errcode = 'P0001';
  end if;

  -- والجديدةُ واحدةٌ و**قراءةٌ** لا غير
  select count(*), min(cmd) into v_n, v_cmd from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'Payments staff read company seals';
  if v_n <> 1 then
    raise exception 'سياسةُ قراءةِ المالية لم تُركَّب.' using errcode = 'P0001';
  end if;
  if v_cmd <> 'SELECT' then
    raise exception 'سياسةُ المالية أمرُها % لا SELECT — الكتابةُ يجب أن تبقى ممنوعة.', v_cmd
      using errcode = 'P0001';
  end if;

  -- ولا سياسةَ كتابةٍ واحدةٍ تذكر manage_payments
  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and coalesce(qual, '') || coalesce(with_check, '') like '%manage_payments%'
     and cmd <> 'SELECT';
  if v_n <> 0 then
    raise exception 'وُجدت % سياسةَ كتابةٍ تمنح manage_payments — ممنوع.', v_n
      using errcode = 'P0001';
  end if;

  -- ولا شيءَ لغيرِ المصادَق (coalesce على الطرفين: qual تكون NULL في INSERT)
  select count(*) into v_anon from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and coalesce(qual, '') || coalesce(with_check, '') like '%company-private%'
     and ('anon' = any(roles) or 'public' = any(roles));
  if v_anon <> 0 then
    raise exception 'وُجدت % سياسةً تفتح company-private لغير المصادَق.', v_anon
      using errcode = 'P0001';
  end if;

  -- والحاويةُ ما زالت خاصّة
  if (select public from storage.buckets where id = 'company-private') then
    raise exception 'حاويةُ company-private صارت عامّة.' using errcode = 'P0001';
  end if;
end;
$$;

comment on policy "Payments staff read company seals" on storage.objects is
  'قراءةُ ختمِ الشركةِ وتوقيعِ المسؤولِ لمن يملك manage_payments — للطباعةِ وحدَها. لا رفعَ ولا استبدالَ ولا حذف؛ تلك تبقى لـmanage_users.';
