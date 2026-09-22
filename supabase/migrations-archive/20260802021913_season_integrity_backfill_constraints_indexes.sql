-- ═══════════════════════════════════════════════════════════════
-- م١ / الجزء ١ — سلامة الموسم: التعبئة والقيود والفهارس
-- ث١ موسم مفتوح واحد لا أكثر · ث٥ كل صفّ موسميّ له موسم
-- الملف كله قابل لإعادة التشغيل.
-- ═══════════════════════════════════════════════════════════════

-- ── ث١: موسم مفتوح واحد لا أكثر ───────────────────────────────
-- التعبير المفهرس ثابت داخل الصفوف المرشَّحة، فيمنع وجود صفّين
-- بـ closed_at فارغ. يُنشأ أولاً لأن كل ما بعده يفترض وحدانية
-- الموسم النشط.
create unique index if not exists seasons_one_open_idx
  on public.seasons ((closed_at is null))
  where closed_at is null;

-- ── معرّف الموسم النشط ────────────────────────────────────────
-- مصدر الحقيقة الوحيد لسؤال «إلى أي موسم ينتمي الصفّ الجديد؟».
-- security definer لأن RLS مفعَّل على seasons وهذه الدالة تُستدعى
-- كـ default أثناء إدراج أي صفّ.
create or replace function public.active_season_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.seasons s where s.closed_at is null
$$;

comment on function public.active_season_id() is
  'معرّف الموسم المفتوح. يُرجع NULL إن لم يوجد موسم مفتوح — وعندها يُرفض أي إدراج جديد بحكم not null.';

-- ── التعبئة + not null + default، جدولاً جدولاً ────────────────
do $$
declare
  v_active bigint;
  v_open   int;
  v_tbl    text;
begin
  -- قاعدة جديدة: الـ baseline ينشئ جدول seasons بلا صفّ، وكل ما
  -- يلي يحتاج موسماً نشطاً. فيُبذَر واحد هنا بدل أن يفشل الترحيل.
  if not exists (select 1 from public.seasons) then
    insert into public.seasons (name) values ('الموسم الأول');
  end if;

  -- صفر مواسم مفتوحة مع وجود مواسم: حالة تحتاج قراراً بشرياً
  -- (أيّ موسم يُستأنف؟) فلا تُخمَّن هنا — ولذلك تفشل بصوت مسموع.
  select count(*) into v_open from public.seasons where closed_at is null;
  if v_open <> 1 then
    raise exception 'الترحيل يتطلّب موسماً مفتوحاً واحداً بالضبط، والموجود %', v_open;
  end if;
  select id into v_active from public.seasons where closed_at is null;

  foreach v_tbl in array array['passengers','buses','camps','rooms'] loop
    -- التعبئة: لا أثر لها في التشغيل الثاني، إذ لا يبقى صفّ فارغ
    execute format(
      'update public.%I set season_id = $1 where season_id is null', v_tbl)
      using v_active;

    -- ث٥: كل صفّ موسميّ له موسم — والختم يتمّ في القاعدة لا في الواجهة
    execute format(
      'alter table public.%I alter column season_id set default public.active_season_id()', v_tbl);
    execute format(
      'alter table public.%I alter column season_id set not null', v_tbl);

    -- مفتاح أجنبي: not null يضمن وجود قيمة، وهذا يضمن وجود موسم.
    -- restrict لأن حذف الموسم يمرّ عبر delete_season() التي تكنس
    -- الصفوف أولاً — فبقاء صفّ يعني خطأً يجب أن يُسمَع لا أن يُبتلع.
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', v_tbl)::regclass
        and conname  = format('%s_season_id_fkey', v_tbl)
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (season_id)
           references public.seasons(id) on delete restrict',
        v_tbl, v_tbl || '_season_id_fkey');
    end if;

    -- كل صفحة موسمية سترشّح بـ season_id في م٢–م٤
    execute format(
      'create index if not exists %I on public.%I (season_id)',
      'idx_' || v_tbl || '_season_id', v_tbl);
  end loop;
end $$;
