-- ============================================================
-- س٩ (إعادة) — تثبيت pg_temp في مسار البحث، بالتوقيعات القائمة
-- ============================================================
-- بديلٌ أماميٌّ لـ`20260809100000_s9_pin_search_path` الذي **لم
-- يُطبَّق قطّ**. والبرهان على ذلك ليس غيابَ سجلٍّ بل حضورُ أثر:
-- كلُّ دالّةٍ استهدفها وبقيت على توقيعها الأصليّ ما زالت تحمل
-- `search_path = public` بلا ذكر `pg_temp`؛ وكلُّ دالّةٍ تحمل
-- `public, pg_temp` اليوم **تبدّل توقيعُها** فنالت التثبيتَ من
-- إعادة كتابتها لا منه.
--
-- ولا يُعاد تشغيلُ الملفّ القديم: فيه `close_season(text,text)` و
-- `delete_season(bigint)` و`create_user` و`update_user` وتوقيعاتٌ
-- أخرى لم تعد موجودة، فيسقط بـ42883. وهذا سببُ عطبه الأصليّ:
-- كُتب على توقيعاتٍ انزاحت تحته. فهذا الملفّ **لا يفترض** شيئاً،
-- بل يتحقّق من كلّ هدفٍ في `pg_proc` قبل أن يمسّه.
--
-- ⚠️ الخطرُ نظريٌّ لا عمليّ: حجبُ جدولٍ مؤقّتٍ يتطلّب جلسةً تستطيع
-- إنشاءه، وPostgREST لا تتيح ذلك. لكنّ الضبطَ مجانيّ، و`alter
-- function … set` لا تمسّ جسدَ دالّةٍ واحدة — فلا سلوكَ يتغيّر.
--
-- ونطاقُ هذا الترحيل تصليبٌ لا إعادةُ هيكلة: لا جسدَ دالّةٍ يُكتب،
-- ولا RLS، ولا بيانات، ولا دلالاتِ موسمٍ مقفل.
--
-- والترحيلُ معاملةٌ واحدة: إمّا أن يتمّ، أو لا يتغيّر شيء.

begin;

-- ════════════════════════════════════════════════════════════
-- ١) شروطٌ مسبقة — لا هدفَ يُمَسّ قبل أن يُثبَت
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_targets constant text[][] := array[
    ['active_season_id',                   ''],
    ['announcement_audience',              'p_target_type text, p_target_ids bigint[]'],
    ['push_enabled_passengers',            ''],
    ['reject_write_closed_season',         ''],
    ['reject_write_closed_season_derived', ''],
    ['delete_empty_financial_group',       '']
  ];
  v_name  text;
  v_args  text;
  v_n     integer;
  v_oid   oid;
  v_sec   boolean;
  v_cfg   text;
  v_done  integer := 0;
  v_todo  integer := 0;
begin
  for i in 1 .. array_length(v_targets, 1) loop
    v_name := v_targets[i][1];
    v_args := v_targets[i][2];

    /* التوقيعُ بعينه لا الاسمُ وحده: تعدّدُ الأحمال كان سيجعل
       `alter function` غامضةً، وغيابُه هو ما أسقط الملفّ القديم. */
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name
       and pg_get_function_identity_arguments(p.oid) = v_args;

    if v_n <> 1 then
      raise exception 'الهدف public.%(%) وُجد % مرّة لا مرّةً واحدة — التوقيعات انزاحت، أوقِف الترحيل.',
        v_name, v_args, v_n using errcode = 'P0001';
    end if;

    select p.oid, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
      into v_oid, v_sec, v_cfg
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name
       and pg_get_function_identity_arguments(p.oid) = v_args;

    if not v_sec then
      raise exception 'الهدف public.%(%) ليس SECURITY DEFINER — الافتراضُ خاطئ، أوقِف الترحيل.',
        v_name, v_args using errcode = 'P0001';
    end if;

    if v_cfg ~ '\mpg_temp\M' then
      v_done := v_done + 1;   -- مثبَّتٌ سلفاً: لا ضرر، ولا عمل
    else
      v_todo := v_todo + 1;
    end if;
  end loop;

  raise notice 'أهداف التثبيت: % مثبَّتة سلفاً · % تحتاج التثبيت.', v_done, v_todo;
end $$;

-- ── الدالّة الميتة: يُعاد إثباتُ موتها **لحظةَ التطبيق** ───────
-- التدقيقُ وقتَ الكتابة لا يكفي: قد يظهر مستدعٍ بين الكتابة
-- والتطبيق. فالإسقاطُ لا يمرّ إلا ببرهانٍ يُعاد الآن.
do $$
declare
  v_oid     oid;
  v_sec     boolean;
  v_deps    integer;
  v_callers text;
begin
  select p.oid, p.prosecdef into v_oid, v_sec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolve_pilgrim_id'
     and pg_get_function_identity_arguments(p.oid) = 'p_doc text, p_day integer, p_month integer, p_year integer';

  if v_oid is null then
    raise exception 'public.resolve_pilgrim_id(text,int,int,int) غير موجودة — الحالةُ غيرُ متوقَّعة، أوقِف الترحيل.'
      using errcode = 'P0001';
  end if;
  if not v_sec then
    raise exception 'public.resolve_pilgrim_id ليست SECURITY DEFINER — الافتراضُ خاطئ، أوقِف الترحيل.'
      using errcode = 'P0001';
  end if;

  /* (أ) تابعٌ صلبٌ في `pg_depend` — عرضٌ أو قيدٌ أو عمودٌ مولَّد */
  select count(*) into v_deps
    from pg_depend d
   where d.refclassid = 'pg_proc'::regclass and d.refobjid = v_oid
     and d.deptype <> 'i';
  if v_deps > 0 then
    raise exception 'ما زال % تابعاً يتعلّق بـresolve_pilgrim_id — لا إسقاط.', v_deps
      using errcode = 'P0001';
  end if;

  /* (ب) جسدُ دالّةٍ يذكرها — `pg_depend` لا يرى أجسادَ plpgsql.
         والدالّةُ نفسُها مستثناة، ولا يُفحَص مخطّطٌ من مخطّطات
         النظام. */
  select coalesce(string_agg(n.nspname || '.' || p.proname, '، '), '') into v_callers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prokind = 'f' and p.oid <> v_oid
     and n.nspname not in ('pg_catalog', 'information_schema')
     and p.prosrc ~* 'resolve_pilgrim_id';
  if v_callers <> '' then
    raise exception 'دوالٌّ ما زالت تستدعي resolve_pilgrim_id: % — لا إسقاط.', v_callers
      using errcode = 'P0001';
  end if;

  /* (ج) عرضٌ أو سياسةٌ أو قيمةٌ افتراضيةٌ أو قيدٌ أو فهرسٌ يذكرها */
  select
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('v','m') and n.nspname not in ('pg_catalog','information_schema')
        and pg_get_viewdef(c.oid) ~* 'resolve_pilgrim_id')
  + (select count(*) from pg_policies
      where (coalesce(qual,'') || coalesce(with_check,'')) ~* 'resolve_pilgrim_id')
  + (select count(*) from pg_attrdef ad
      where pg_get_expr(ad.adbin, ad.adrelid) ~* 'resolve_pilgrim_id')
  + (select count(*) from pg_constraint
      where pg_get_constraintdef(oid) ~* 'resolve_pilgrim_id')
  + (select count(*) from pg_indexes
      where schemaname not in ('pg_catalog','information_schema')
        and indexdef ~* 'resolve_pilgrim_id')
  into v_deps;
  if v_deps > 0 then
    raise exception 'عروضٌ/سياساتٌ/قيودٌ تذكر resolve_pilgrim_id (%) — لا إسقاط.', v_deps
      using errcode = 'P0001';
  end if;

  /* (د) ولا تُنشَر على الـAPI: `anon` و`authenticated` بلا EXECUTE
         منذ `s7_close_credential_path`. لو عادت، فثمّة مسارٌ حيّ. */
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'resolve_pilgrim_id ما زالت منشورةً لـanon/authenticated — راجِع قبل الإسقاط.'
      using errcode = 'P0001';
  end if;

  raise notice 'resolve_pilgrim_id: لا تابعَ ولا مستدعيَ ولا نشرَ — الإسقاطُ آمن.';
end $$;

-- ── دالّةُ سعة الغرف: يُتحقَّق من سلسلتها قبل تغيير صلاحياتها ──
do $$
declare
  v_oid  oid;
  v_sec  boolean;
  v_n    integer;
begin
  select p.oid, p.prosecdef into v_oid, v_sec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'room_type_capacity'
     and pg_get_function_identity_arguments(p.oid) = 'p_type text';
  if v_oid is null then
    raise exception 'public.room_type_capacity(text) غير موجودة — أوقِف الترحيل.' using errcode = 'P0001';
  end if;
  if v_sec then
    raise exception 'public.room_type_capacity صارت SECURITY DEFINER — الافتراضُ خاطئ، أوقِف الترحيل.'
      using errcode = 'P0001';
  end if;

  /* ⚠️ `rooms_apply_capacity` هي المستدعي الوحيد، وهي **SECURITY
     INVOKER**: تعمل بصلاحيات مَن يكتب في `rooms`. فالمستدعي هو
     `authenticated`، وسحبُ EXECUTE منه يكسر محفّزَ سعة الغرف.
     ولهذا يُسحَب الإذنُ من PUBLIC وحده ويبقى للدورين الحقيقيّين. */
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'rooms_apply_capacity'
     and p.prosrc ~* 'room_type_capacity';
  if v_n <> 1 then
    raise exception 'rooms_apply_capacity لم تعد تستدعي room_type_capacity (وُجد %) — راجِع قبل تغيير الصلاحيات.', v_n
      using errcode = 'P0001';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
-- ٢) التثبيت — إعدادٌ لا جسد
-- ════════════════════════════════════════════════════════════
-- `pg_temp` **أخيراً**: بوستجرس يبحث في مخطّط الجداول المؤقّتة أولاً
-- ما لم يُذكر صراحةً. وذكرُه في آخر المسار يضعه بعد `public`
-- فيسقط الحجب. و`public` يبقى أوّلاً كما كان، فلا يتبدّل معنى
-- اسمٍ غيرِ مؤهَّلٍ في أيّ جسد.
alter function public.active_season_id()                   set search_path = public, pg_temp;
alter function public.announcement_audience(p_target_type text, p_target_ids bigint[])
                                                            set search_path = public, pg_temp;
alter function public.push_enabled_passengers()            set search_path = public, pg_temp;
alter function public.reject_write_closed_season()         set search_path = public, pg_temp;
alter function public.reject_write_closed_season_derived() set search_path = public, pg_temp;
alter function public.delete_empty_financial_group()       set search_path = public, pg_temp;

-- ════════════════════════════════════════════════════════════
-- ٣) إسقاط المسار الميت
-- ════════════════════════════════════════════════════════════
-- `resolve_pilgrim_id` مسارُ الاعتماد الثابت الذي أغلقته س٧،
-- وخلَفَتها `verify_pilgrim_session`. تصليبُ شيفرةٍ ميتةٍ أسوأُ من
-- إزالتها: يُبقيها في السطح ويوحي بأنها تُصان.
-- وبلا `cascade`: البرهانُ أعلاه أثبت أن لا تابع، فإن ظهر تابعٌ
-- الآن فليسقط الترحيلُ بدل أن يحذفه بصمت.
drop function public.resolve_pilgrim_id(p_doc text, p_day integer, p_month integer, p_year integer);

-- ════════════════════════════════════════════════════════════
-- ٤) سعةُ الغرف — أضيقُ إذنٍ يكفي، ومسارٌ فارغ
-- ════════════════════════════════════════════════════════════
-- كانت `=X/postgres` أي EXECUTE لـPUBLIC: كلُّ دورٍ في القاعدة بما
-- فيه `anon`. ولا حاجة: المستدعي الوحيد محفّزُ `rooms`، ولا تُستدعى
-- من الواجهة (`src/utils/room.ts` نسخةٌ مستقلّةٌ في المتصفّح لا
-- استدعاءُ RPC).
revoke execute on function public.room_type_capacity(p_type text) from public;
grant  execute on function public.room_type_capacity(p_type text) to authenticated, service_role;

-- ⚠️ ومسارُها `''` لا `public, pg_temp` — وهو أقوى، وهنا مجّانيّ:
-- جسدُها `case btrim(coalesce(p_type,'')) … end` لا يذكر كائنَ
-- مخطّطٍ واحداً، و`pg_catalog` يبقى مضموناً ضمناً. فلا شيء يُعاد
-- كتابتُه لتبنّيه. وهذا هو المعيارُ للدوالّ الجديدة؛ أمّا الستُّ
-- أعلاه فأجسادُها تذكر `public.*` وإعادةُ كتابتها خارج نطاق هذا
-- الترحيل صراحةً.
alter function public.room_type_capacity(p_type text) set search_path = '';

-- ════════════════════════════════════════════════════════════
-- ٥) تحقّقٌ بعديّ — الترحيلُ يشهد على نفسه
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_targets constant text[][] := array[
    ['active_season_id',                   ''],
    ['announcement_audience',              'p_target_type text, p_target_ids bigint[]'],
    ['push_enabled_passengers',            ''],
    ['reject_write_closed_season',         ''],
    ['reject_write_closed_season_derived', ''],
    ['delete_empty_financial_group',       '']
  ];
  v_name text;
  v_args text;
  v_cfg  text;
  v_oid  oid;
  v_n    integer;
  v_bad  text;
begin
  -- (أ) كلُّ هدفٍ موجودٌ ومثبَّت
  for i in 1 .. array_length(v_targets, 1) loop
    v_name := v_targets[i][1];
    v_args := v_targets[i][2];
    select coalesce(array_to_string(p.proconfig, ','), '') into v_cfg
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name
       and pg_get_function_identity_arguments(p.oid) = v_args;
    if v_cfg is null then
      raise exception 'بعد التثبيت: public.%(%) اختفت.', v_name, v_args using errcode = 'P0001';
    end if;
    if v_cfg !~ '\mpg_temp\M' then
      raise exception 'بعد التثبيت: public.%(%) ما زالت بلا pg_temp (%).', v_name, v_args, v_cfg
        using errcode = 'P0001';
    end if;
  end loop;

  /* (ب) تدقيقٌ **إخباريٌّ لا حاكم**: يعدّ دوالَّ SECURITY DEFINER
     في `public` الباقيةَ بلا `pg_temp`، ويطبعها ملاحظةً فحسب.
     ⚠️ ولا يرفع استثناءً: هذا الترحيل يملك الستَّ أعلاه وحدها،
     فلو أُدخلت دالّةٌ غيرُها بين الكتابة والتطبيق لَأسقطته بلا
     ذنب. فالحكمُ على ما نملك، والإخبارُ عمّا لا نملك. */
  select coalesce(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', '، '), '')
    into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
     and coalesce(array_to_string(p.proconfig, ','), '') !~ '\mpg_temp\M';
  if v_bad <> '' then
    raise notice 'تدقيقٌ إخباريّ (لا يُسقط الترحيل): دوالُّ SECURITY DEFINER في public بلا pg_temp خارج نطاق هذا الترحيل: %', v_bad;
  else
    raise notice 'تدقيقٌ إخباريّ: لا دالّةَ SECURITY DEFINER في public بلا pg_temp.';
  end if;

  -- (ج) الدالّةُ الميتة اختفت
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolve_pilgrim_id';
  if v_n <> 0 then
    raise exception 'بعد الإسقاط: resolve_pilgrim_id ما زالت موجودة (%).', v_n using errcode = 'P0001';
  end if;

  -- (د) سعةُ الغرف: لا PUBLIC، والدوران الحقيقيّان باقيان، والمسار مضبوط
  select p.oid, coalesce(array_to_string(p.proconfig, ','), '') into v_oid, v_cfg
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'room_type_capacity'
     and pg_get_function_identity_arguments(p.oid) = 'p_type text';
  if v_oid is null then
    raise exception 'بعد الضبط: room_type_capacity اختفت.' using errcode = 'P0001';
  end if;

  /* المستفيدُ ٠ في `aclexplode` هو PUBLIC — فحصٌ من الفهرس لا من
     نصّ الـACL. */
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = v_oid and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'بعد السحب: room_type_capacity ما زالت تمنح EXECUTE لـPUBLIC.' using errcode = 'P0001';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'بعد السحب: authenticated فقدت EXECUTE على room_type_capacity — محفّزُ سعة الغرف يكسر.'
      using errcode = 'P0001';
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'بعد السحب: service_role فقدت EXECUTE على room_type_capacity.' using errcode = 'P0001';
  end if;
  /* ⚠️ بوستجرس يخزّن المسارَ الفارغ مقتبَساً: `search_path=""` لا
     `search_path=`. والمقارنةُ الحرفيّة بالثاني كانت تُسقط الترحيل
     عند التطبيق — أوقفها الاختبارُ المحلّيّ قبل أن تبلغ الإنتاج.
     فالفحصُ بنمطٍ يقبل الصيغتين، فلا يتعلّق بإصدار. */
  if v_cfg !~ '^search_path=("")?$' then
    raise exception 'بعد الضبط: مسارُ room_type_capacity غير متوقَّع (%).', v_cfg using errcode = 'P0001';
  end if;

  -- (هـ) سلسلةُ المحفّز سليمة: المستدعي باقٍ ومحفّزُه مركَّب
  select count(*) into v_n
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid join pg_namespace n on n.oid = p.pronamespace
   where c.relname = 'rooms' and n.nspname = 'public'
     and p.proname = 'rooms_apply_capacity' and not t.tgisinternal;
  if v_n <> 1 then
    raise exception 'بعد الضبط: محفّزُ rooms_apply_capacity على rooms وُجد % لا مرّةً واحدة.', v_n
      using errcode = 'P0001';
  end if;

  raise notice 'التحقّق البعديّ تمّ: ٦ دوالّ مثبَّتة · الميتةُ أُسقطت · سعةُ الغرف ضُيِّقت.';
end $$;

commit;
