-- ============================================================
-- لقطة التسعير التاريخيّة — ثبات مالية الموسم المُقفَل
-- ============================================================
-- امتدادٌ لمعمارية المواسم (Issue #42) في منطقة **لم يقرّرها #42**.
--
-- §٤ من #42 قرّر أن `pricing_settings` **ليست موسمية** — وهو قرار عن
-- *الإعداد* لا عن *ثبات المالية التاريخية*، والسؤال الثاني لم يُطرح
-- هناك أصلاً. فهذا الترحيل **لا ينقض §٤ ولا يعيد تفسيره**: يبقى
-- `pricing_settings` إعداد شركة حاليّاً كما هو، وتُضاف طبقةٌ تحته.
--
-- ═══ المشكلة — مُثبَتة لا مفترَضة ═══
-- `calcTotalDue` في `src/components/finance/finance.utils.ts` يحسب
-- مستحقّ الحاجّ **لحظة العرض** من `pricing_settings` الحيّ. ولا لقطة
-- سعرٍ على الموسم. فتعديل سعر باقةٍ لموسمٍ قادم **يُعيد كتابة أرصدة
-- موسمٍ مؤرشَف بأثر رجعيّ**: المستحقّ والرصيد وحالة السداد وتقارير
-- الذمم. بلا أثر في `audit_log` (الجدول خارج تغطية س٨)، وبلا مانع من
-- ث٣ (الجدول غير موسميّ فلا محفّز عليه).
--
-- ═══ العلاج — لقطة على مستوى الموسم لا على مستوى الحاجّ ═══
-- ثلاث طبقات للسعر، اثنتان منها قائمتان اليوم:
--   ١) `passengers.custom_price`  — لقطة الفرد   (قائمة · تُقدَّم)
--   ٢) `season_pricing_snapshot`  — لقطة الموسم  (**هذا الملفّ**)
--   ٣) `pricing_settings`         — إعداد الشركة (قائم · للمفتوح)
--
-- واللقطة على مستوى الموسم **لا تعرف الحجاج**، فلا يربطها شيء بقرار
-- الحذف اللطيف المؤجَّل (ق٥): لا صفّ يُرشَّح ولا صفّ يُحفَظ عند حذف
-- حاجّ. لقطةٌ لكلّ حاجّ كانت ستربطهما ربطاً محكماً — ولذلك رُفضت.
--
-- ═══ بلا مفتاح أجنبيّ عمداً — كنمط `audit_log` ═══
-- اللقطة **تبقى بعد حذف الموسم حذفاً دائماً**. وهي دليلٌ ماليّ لا
-- بيانات تشغيل: الموسم يزول وتاريخ تسعيره يبقى. ولذلك لا مفتاح أجنبيّ
-- على `season_id` — وإلا لمحا `delete_season` الدليلَ على ما كان.
-- ============================================================


-- ------------------------------------------------------------
-- ١) الجدول
-- ------------------------------------------------------------
create table if not exists public.season_pricing_snapshot (
  season_id   bigint      not null,
  key         text        not null,
  label       text        not null,
  type        text        not null,
  amount      numeric(10,2) not null,
  captured_at timestamptz not null default now(),
  primary key (season_id, key)
);

comment on table public.season_pricing_snapshot is
  'تسعير الموسم كما كان لحظة إقفاله. يُكتب مرّة واحدة داخل معاملة close_season، ولا يُعدَّل بعدها. بلا مفتاح أجنبيّ عمداً: يبقى بعد حذف الموسم.';
comment on column public.season_pricing_snapshot.season_id is
  'الموسم المُقفَل. بلا مفتاح أجنبي — الصفّ يبقى بعد حذف الموسم (كنمط audit_log).';
comment on column public.season_pricing_snapshot.label is
  'اسم البند يوم الإقفال — الأسماء تتغيّر، والصفّ يحفظ ما كان.';
comment on column public.season_pricing_snapshot.amount is
  'القيمة المجمَّدة. هي ما تقرأه مالية الموسم المؤرشَف بدل pricing_settings الحيّ.';


-- ------------------------------------------------------------
-- ٢) الصلاحيات — قراءةٌ خلف صلاحية، ولا كتابة لأي دور تطبيقيّ
-- ------------------------------------------------------------
-- الكاتب الوحيد `close_season` وهي `SECURITY DEFINER` يملكها
-- `postgres`، فتكتب بامتياز المالك لا بامتياز المستدعي. فالسحب لا
-- يعطّل مساراً شرعياً واحداً — ويمنع أن يسكّ حاملُ مفتاح الخدمة
-- تسعيراً تاريخياً مختلقاً.
alter table public.season_pricing_snapshot enable row level security;

revoke all on public.season_pricing_snapshot from public, anon, authenticated, service_role;
grant select on public.season_pricing_snapshot to authenticated;

-- سياسة قراءة حقيقية تُشحن مع الجدول نفسه: جدولٌ بلا سياسة يرفع
-- ملاحظة Advisor، وبوابة «لا يزيد العدد» (ب١٢ من س٨) تُقاس عليه.
--
-- والشرط `is_active_employee()` **هو شرط `pricing_settings_select` نفسه**
-- عمداً، لا `has_permission('manage_payments')`. فمن يقرأ سعر الباقة
-- اليوم يقرأ ما كان سعرها أمس — والصلاحية تحرس *تعديل* التسعير لا
-- *قراءته* (هذا هو نمط س٤: `_select` بـ`is_active_employee`، والكتابة
-- بـ`has_permission`).
--
-- وتضييقها هنا كان سيُحدث عيباً ماليّاً حقيقياً: موظّفٌ نشِط بلا
-- `manage_payments` يقرأ `pricing_settings` ولا يقرأ اللقطة، فيعود إلى
-- التسعير الحيّ **ويرى أرقاماً تخالف ما يراه زميله على الشاشة نفسها**
-- لموسمٍ مؤرشَف. وهو عين ما بُني هذا الجدول لمنعه.
drop policy if exists season_pricing_snapshot_select on public.season_pricing_snapshot;
create policy season_pricing_snapshot_select on public.season_pricing_snapshot
  for select to authenticated
  using (public.is_active_employee());


-- ------------------------------------------------------------
-- ٣) الالتقاط — داخل `close_season`، في معاملتها نفسها
-- ------------------------------------------------------------
-- **لا تغيير في التوقيع** `(text, text, uuid)` — فلا نشر لـ
-- `season-admin` مع هذا الترحيل، وتُتفادى نافذة العطل التي فرضت في
-- س٨ نشر الدالة مع الترحيل (خ٤ هناك).
--
-- والموضع مقصود: بعد ختم `closed_at` وقبل إنشاء الموسم الجديد.
-- الدالة تأخذ `for update` على صفّ الموسم أعلاه، فالإقفالات المتزامنة
-- متسلسلة ولا تُلتقط اللقطة مرّتين.
--
-- fail-closed (ق٣): فشل كتابة اللقطة **يُسقط الإقفال كلّه**. وإقفالٌ
-- بلا لقطةٍ يفقد التسعير فقداً لا يُسترجع — فمنعُه أرخص من قبوله.
create or replace function public.close_season(p_new_name text, p_closed_by text, p_actor uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old  bigint;
  v_new  bigint;
  v_name text := btrim(coalesce(p_new_name, ''));
  v_old_row jsonb;
  v_priced  int;
begin
  if v_name = '' then
    raise exception 'اسم الموسم الجديد مطلوب.' using errcode = 'P0001';
  end if;

  -- قفل الموسم النشط أولاً: يسلسل الإقفالات المتزامنة، ويمنع أي
  -- كتابة جارية (تأخذ for share) من أن تسبقنا وتصير في موسم مقفل
  select id into v_old from public.seasons where closed_at is null for update;
  if v_old is null then
    raise exception 'لا يوجد موسم مفتوح لإقفاله.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.seasons where name = v_name) then
    raise exception 'يوجد موسم باسم % بالفعل.', v_name using errcode = 'P0001';
  end if;

  select to_jsonb(s) into v_old_row from public.seasons s where s.id = v_old;

  update public.seasons
     set closed_at = now(), closed_by = p_closed_by
   where id = v_old;

  /* لقطة التسعير — قبل إنشاء الموسم الجديد، وفي هذه المعاملة.
     `on conflict do nothing` حارسٌ لا حاجة عملية له: الموسم لا يُقفل
     مرّتين (شرط `closed_at is null` أعلاه)، لكنّه يجعل الدالة آمنة
     التكرار بحكم البناء لا بحكم الافتراض. */
  insert into public.season_pricing_snapshot (season_id, key, label, type, amount)
  select v_old, ps.key, ps.label, ps.type, ps.amount
    from public.pricing_settings ps
  on conflict (season_id, key) do nothing;

  get diagnostics v_priced = row_count;

  insert into public.seasons (name) values (v_name) returning id into v_new;

  /* الصفّ الملخّص يذكر عدد بنود التسعير الملتقَطة: صفرٌ يعني أن
     `pricing_settings` كان فارغاً لحظة الإقفال — وهي حقيقةٌ تُقال
     لا تُخفى، والواجهة تعرض عندها تحذير «بلا لقطة». */
  perform public.record_season_event(
    p_actor, 'update', v_old, v_old_row,
    jsonb_build_object(
      'closed_by',        p_closed_by,
      'new_season_id',    v_new,
      'new_season_name',  v_name,
      'pricing_snapshot', v_priced)
  );

  return v_new;
end;
$$;

comment on function public.close_season(text, text, uuid) is
  'يُقفل الموسم النشط ويفتح موسماً جديداً في معاملة واحدة، ويلتقط لقطة تسعير الموسم المُقفَل، ويكتب صفّ تدقيق ملخّصاً بالفاعل المُثبَت. الفشل في أي خطوة يُرجع الحالة كما كانت.';

revoke execute on function public.close_season(text, text, uuid) from public, anon, authenticated;
grant  execute on function public.close_season(text, text, uuid) to service_role;


-- ------------------------------------------------------------
-- ٤) ما لا يفعله هذا الترحيل — صراحةً
-- ------------------------------------------------------------
-- · لا يُلفَّق تسعيرٌ للمواسم المقفلة قبل اليوم. من أُقفل بلا لقطة
--   يبقى بلا لقطة، والواجهة ترجع إلى التسعير الحيّ **مع تحذير ظاهر**.
--   وتعبئتها بالأسعار الحالية كانت ستصنع تاريخاً كاذباً يبدو موثوقاً.
-- · لا يمسّ `pricing_settings` ولا صلاحياتها ولا سياساتها.
-- · لا يمسّ `delete_season` — اللقطة تبقى بعد حذف الموسم عمداً.
-- · لا يوسّع تغطية تدقيق س٨: اللقطة تُكتب مرّة واحدة داخل معاملة
--   مدقَّقة أصلاً، وعدد بنودها مذكور في صفّها الملخّص.
--
-- ⚠️ التراجع بعد أوّل إقفال بلقطة **إتلافُ تاريخ لا تراجع** — على
--    غرار قاعدة أ٩: إعادة العيب ليست تراجعاً. وقبل أوّل إقفال، إسقاط
--    الجدول وإرجاع الدالة إلى نسخة س٨ عمليةٌ بلا أثر.
