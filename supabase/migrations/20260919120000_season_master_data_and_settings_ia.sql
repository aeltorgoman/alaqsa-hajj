-- ============================================================
-- بياناتُ الموسم الرئيسة — ملكيّةٌ موسميّةٌ وهويّةٌ صريحة
-- ============================================================
-- الموسمُ يملك اسمَه وسنتَه وفندقَه ومنى وعرفة. و`company_config`
-- تبقى للشركة وحدها.
--
-- ═══ لماذا ═══
-- `company_config` صفٌّ عالميٌّ واحد، بلا `season_id` وبلا محفّز
-- `trg_reject_closed_season`. فاسمُ الفندق وعنوانُ منى وعرفةَ
-- واسمُ الموسم كلُّها **تُعاد كتابتُها بأثرٍ رجعيّ** لحظةَ تهيئة
-- الموسم التالي: تفتح موسماً مؤرشفاً فتقرأ فندقَ الموسم الجديد.
-- وهذا عينُ العيب الذي عالجه `season_pricing_snapshot` للتسعير
-- (20260827120000) — وهذا الترحيل يعالجه للأماكن، لا بلقطةٍ عند
-- الإقفال بل **بملكيّةٍ موسميّةٍ من الأصل**: ما يملكه الموسم لا
-- يحتاج أن يُلتقَط، لأنّه لم يكن يوماً في مكانٍ آخر.
--
-- ═══ الهويّةُ سنةٌ لا اسم ═══
-- اسمُ الموسم نصٌّ حرٌّ للعرض: «موسم 1448» و«موسم الحج 1448 هـ»
-- و«حج 1448» ثلاثةُ أسماءٍ لموسمٍ **واحد**. فالتفرّدُ على
-- `hijri_year` لا على `name` — والاسمُ يُصحَّح بلا أن تتبدّل هويّةُ
-- الموسم.
--
-- ⚠️ ولا يُنقل `company_config.season_label` إلى `seasons.name`:
--    قرارٌ صريحٌ من مراجعة المعمارية. ما في `seasons.name` اليوم هو
--    المرجع، والمديرُ يُثريه بيده من «إعدادات الموسم».
--
-- ⚠️ ولا يُحذف عمودٌ قديمٌ في هذا الترحيل. الأعمدةُ الموروثة تبقى
--    كما هي حتى ترحيلِ التنظيف (PR B) بعد تحقّقٍ في الإنتاج.
--
-- المرجع: Settings & Season Master Data — Implementation Design
-- ============================================================


-- ------------------------------------------------------------
-- ١) التحقّقُ من الحالة المتوقَّعة — قبل أيّ تغيير
-- ------------------------------------------------------------
-- الترحيلُ يفشل ولا يخمّن. البِنيةُ تُضاف بعد هذا الفحص، فإن كانت
-- القاعدةُ غيرَ ما يتوقّع هذا الملفّ لم يُكتب فيها حرف.
do $$
declare
  v_seasons int;
  v_config  int;
begin
  select count(*) into v_seasons from public.seasons;
  if v_seasons = 0 then
    raise exception 'لا يوجد أيّ موسم — الترحيل يتوقّع موسماً واحداً على الأقلّ.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_config from public.company_config where id = 1;
  if v_config <> 1 then
    raise exception 'صفُّ إعدادات الحملة (id=1) غير موجود — الترحيل يعتمد عليه في النقل.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'company_config'
                and column_name in ('commercial_registration', 'cr_number',
                                    'registration_number', 'tax_number')) then
    raise exception 'يوجد عمودٌ مكافئٌ لرقم السجلّ التجاريّ بالفعل — أوقِف وراجِع قبل الإضافة.'
      using errcode = 'P0001';
  end if;
end $$;


-- ------------------------------------------------------------
-- ٢) أعمدةُ الموسم — السنةُ والاسمُ والأماكن
-- ------------------------------------------------------------
-- كلُّها `null` بلا قيمةٍ افتراضية، وهذا **هو** ما يجعل الموسمَ
-- الجديد يبدأ فارغاً: `close_season` يُدرج `(name, hijri_year)` ولا
-- شيءَ سواهما، فتأتي الأماكنُ فارغةً بحكم البناء لا بحكم سطرٍ
-- يتذكّر أن يفرّغها.
--
-- وأسماءُ منى وعرفةَ بلا بادئة `camp_`: هذه **مواقعُ الموسم
-- العامّة** لا مخيّماتُه. والمخيّماتُ تبقى في `camps` بملكيّتها
-- التشغيليّة ومحفّزِ الموسم المقفل عليها.
alter table public.seasons
  add column if not exists hijri_year    integer,
  add column if not exists hotel_name    text,
  add column if not exists hotel_address text,
  add column if not exists hotel_url     text,
  add column if not exists mina_address  text,
  add column if not exists mina_url      text,
  add column if not exists arafa_address text,
  add column if not exists arafa_url     text;

comment on column public.seasons.hijri_year is
  'سنةُ الحجّ الهجريّة — هويّةُ الموسم. فريدةٌ ولا تُشتقّ من الاسم أبداً.';
comment on column public.seasons.name is
  'اسمُ العرض كما كتبه المدير، حرفاً بحرف. نصٌّ حرٌّ غيرُ فريد — التفرّدُ على hijri_year.';
comment on column public.seasons.hotel_name is    'فندقُ هذا الموسم — يبقى مع الموسم بعد إقفاله.';
comment on column public.seasons.hotel_address is 'عنوانُ فندق هذا الموسم.';
comment on column public.seasons.hotel_url is     'رابطُ فندق هذا الموسم على الخريطة.';
comment on column public.seasons.mina_address is  'عنوانُ موقع منى العامّ لهذا الموسم — لا عنوانُ مخيّم بعينه.';
comment on column public.seasons.mina_url is      'رابطُ موقع منى العامّ على الخريطة.';
comment on column public.seasons.arafa_address is 'عنوانُ موقع عرفات العامّ لهذا الموسم.';
comment on column public.seasons.arafa_url is     'رابطُ موقع عرفات العامّ على الخريطة.';


-- ------------------------------------------------------------
-- ٣) تعبئةُ السنة الهجريّة — مرّةً واحدةً، ولبياناتٍ متحقَّقٍ منها
-- ------------------------------------------------------------
-- ⚠️ ليس هذا محلّلاً عامّاً يستخرج السنةَ من اسمٍ كيفما كان، ولن
--    يصير. هو تعبئةٌ لمرّةٍ واحدة لصفٍّ **قُرئ وتُحقّق منه** قبل
--    كتابة هذا الملفّ: موسمٌ واحدٌ مفتوحٌ اسمُه «1448».
--
--    وما عدا ذلك يفشل. الفشلُ هنا أرخص من تخمينٍ يُسنِد بياناتِ
--    موسمٍ إلى سنةٍ ليست له.
do $$
declare
  v_id   bigint;
  v_name text;
  v_cnt  int;
begin
  -- أُعيد تشغيلُ الترحيل بعد نجاحه؟ لا شيء ليُفعَل.
  if not exists (select 1 from public.seasons where hijri_year is null) then
    raise notice 'hijri_year معبّأٌ لكلّ المواسم — لا حاجة للتعبئة.';
    return;
  end if;

  select count(*) into v_cnt from public.seasons;
  if v_cnt <> 1 then
    raise exception 'التعبئة تتوقّع موسماً واحداً بالضبط، ووجدت %. أوقِف وأسنِد السنواتِ يدوياً.', v_cnt
      using errcode = 'P0001';
  end if;

  select id, btrim(name) into v_id, v_name from public.seasons;
  if v_name <> '1448' then
    raise exception 'التعبئة تتوقّع اسمَ الموسم «1448»، ووجدت «%». أوقِف وراجِع.', v_name
      using errcode = 'P0001';
  end if;

  update public.seasons set hijri_year = 1448 where id = v_id;
  raise notice 'الموسم % (%) ← hijri_year = 1448', v_id, v_name;
end $$;


-- ------------------------------------------------------------
-- ٤) الثابتُ على مستوى القاعدة — سنةٌ واحدةٌ لموسمٍ واحد
-- ------------------------------------------------------------
-- الثلاثةُ معاً، وبعد التعبئة مباشرةً، فلا تمرّ لحظةٌ يكون فيها
-- الجدولُ بلا حارس:
--   `not null`  — لا موسمَ بلا هويّة
--   `check`     — عددٌ موجبٌ رباعيُّ الخانات على أكثر تقدير. وحدٌّ
--                 أعلى ٩٩٩٩ لا يحتاج صيانةً في أيّ عمرٍ معقولٍ
--                 للنظام، فليس فيه تاريخٌ يمرّ عليه
--   `unique`    — **قاعدةُ العمل**: موسمٌ واحدٌ لكلّ سنة حجّ
alter table public.seasons alter column hijri_year set not null;

alter table public.seasons drop constraint if exists seasons_hijri_year_valid;
alter table public.seasons add  constraint seasons_hijri_year_valid
  check (hijri_year > 0 and hijri_year < 10000);

create unique index if not exists seasons_hijri_year_key
  on public.seasons (hijri_year);

comment on index public.seasons_hijri_year_key is
  'موسمٌ واحدٌ لكلّ سنةٍ هجريّة. التفرّدُ هنا لا على الاسم: الأسماءُ تُصحَّح، والسنةُ هي الهويّة.';


-- ------------------------------------------------------------
-- ٥) رقمُ السجلّ التجاريّ — بيانُ شركةٍ لا موسم
-- ------------------------------------------------------------
-- نصٌّ حرٌّ بلا قيد: صِيَغُ السجلّات تختلف باختلاف الدول، وقيدُ
-- صيغةٍ هنا قاعدةٌ مخترَعة.
alter table public.company_config
  add column if not exists commercial_registration text;

comment on column public.company_config.commercial_registration is
  'رقمُ السجلّ التجاريّ للحملة — بيانُ شركةٍ عابرٌ للمواسم. لا يُعرَض في company_profile_public.';


-- ------------------------------------------------------------
-- ٦) نقلُ أماكنِ الموسم النشط من `company_config`
-- ------------------------------------------------------------
-- `coalesce(s.col, c.col)` يجعله غيرَ هدّامٍ وقابلاً للتكرار: قيمةٌ
-- عدّلها المديرُ بعد الترحيل لا يدهسها تشغيلٌ ثانٍ.
--
-- ⚠️ والمواسمُ المقفلةُ **لا تُملأ**. لا يوجد اليوم أيُّ موسمٍ مقفل،
--    ولو وُجد لكان ملؤه من إعداداتِ الحملة الحاليّة **اختلاقاً
--    لتاريخ** — وهو عينُ ما جاء هذا الترحيل يمنعه. الفراغُ الصادقُ
--    أصدقُ من قيمةٍ صحيحةِ الشكل خاطئةِ الزمن.
update public.seasons s
   set hotel_name    = coalesce(s.hotel_name,    c.hotel_name),
       hotel_address = coalesce(s.hotel_address, c.hotel_address),
       hotel_url     = coalesce(s.hotel_url,     c.hotel_url),
       mina_address  = coalesce(s.mina_address,  c.camp_mina_address),
       mina_url      = coalesce(s.mina_url,      c.camp_mina_url),
       arafa_address = coalesce(s.arafa_address, c.camp_arafa_address),
       arafa_url     = coalesce(s.arafa_url,     c.camp_arafa_url)
  from public.company_config c
 where c.id = 1
   and s.closed_at is null;


-- ------------------------------------------------------------
-- ٧) بابُ تعديل الموسم النشط — ضيّقٌ كبابِ البوابة
-- ------------------------------------------------------------
-- نفسُ نمط `update_portal_settings` (20260918120000): حقولٌ معلَنةٌ
-- في التوقيع، وحارسٌ في الجسد، وصفٌّ معادٌ برهاناً على الأثر.
--
-- ولماذا `security definer` أصلاً: على `seasons` سياسةُ `select`
-- وحدها — لا `update` ولا `insert` ولا `delete`. وهذا **تصميمٌ لا
-- نقص**: المواسمُ لا تُكتب إلا بدالّةٍ تعرف ما تفعل. فالدالّةُ هي
-- البابُ الوحيد، والحارسُ فيها لا حولها.
--
-- و`hijri_year` **ليست في التوقيع**: هويّةُ الموسم لا تُعدَّل بباب
-- تحرير البيانات العامّة. ومن احتاج تصحيحَها فله قرارٌ منفصل.
create or replace function public.update_active_season(
  p_name          text,
  p_hotel_name    text,
  p_hotel_address text,
  p_hotel_url     text,
  p_mina_address  text,
  p_mina_url      text,
  p_arafa_address text,
  p_arafa_url     text
)
returns public.seasons
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row  public.seasons;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.has_permission('manage_users') then
    raise exception 'ليست لديك صلاحية تعديل إعدادات الموسم.' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'اسم الموسم مطلوب.' using errcode = 'P0001';
  end if;

  /* `closed_at is null` هو الحارسان في شرطٍ واحد: «النشطُ وحده
     يُعدَّل» و«المؤرشفُ لا يُمَسّ». وفهرسُ seasons_one_open_idx
     يضمن أنّ الشرط يطابق صفّاً واحداً على الأكثر. */
  update public.seasons
     set name          = v_name,
         hotel_name    = nullif(btrim(coalesce(p_hotel_name,    '')), ''),
         hotel_address = nullif(btrim(coalesce(p_hotel_address, '')), ''),
         hotel_url     = nullif(btrim(coalesce(p_hotel_url,     '')), ''),
         mina_address  = nullif(btrim(coalesce(p_mina_address,  '')), ''),
         mina_url      = nullif(btrim(coalesce(p_mina_url,      '')), ''),
         arafa_address = nullif(btrim(coalesce(p_arafa_address, '')), ''),
         arafa_url     = nullif(btrim(coalesce(p_arafa_url,     '')), '')
   where closed_at is null
   returning * into v_row;

  /* صفرُ صفوفٍ خطأٌ لا نجاح. وبدون هذا السطر يعود `null` بلا خطأ،
     فتقول الشاشةُ «تم الحفظ» ولم يُحفظ شيء — وهو العيبُ بعينه الذي
     أزاله ترحيلُ 20260918120000 من بابِ البوابة. */
  if not found then
    raise exception 'لا يوجد موسم مفتوح لتعديله.' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.update_active_season(text,text,text,text,text,text,text,text) is
  'تعديلُ بيانات الموسم النشط الرئيسة — اسمُ العرض والفندقُ ومنى وعرفة. يشترط manage_users، ويعمل على الموسم المفتوح وحده، ويعيد الصفَّ برهاناً على الأثر. لا يمسّ hijri_year.';

revoke execute on function public.update_active_season(text,text,text,text,text,text,text,text)
  from public, anon;
grant  execute on function public.update_active_season(text,text,text,text,text,text,text,text)
  to authenticated;


-- ------------------------------------------------------------
-- ٨) إقفالُ الموسم — توقيعٌ جديدٌ بسنةٍ صريحة
-- ------------------------------------------------------------
-- ⚠️ التوقيعُ القديم `(text, text, uuid)` **يُسقَط** في آخر هذا
--    القسم. وإبقاؤه كان سيترك باباً ثانياً يُنشئ موسماً **بلا سنة**
--    — والعمودُ `not null` فيفشل، لكنّ الفشلَ في منتصف معاملةِ
--    إقفالٍ أسوأُ من غياب البابِ أصلاً.
--
-- ⚠️ ترتيبُ النشر إذاً ليس حرّاً: **الترحيلُ ثمّ نشرُ دالّة الحافّة**.
--    وبينهما يتعذّر إقفالُ الموسم — وهي عمليّةٌ تُنفَّذ مرّةً في
--    السنة بقرارٍ مقصود، فالنافذةُ لا تمسّ التشغيل اليوميّ.
--
-- وشرطُ التفرّد تبدّل: كان على `name`، وصار على `hijri_year`. فاسمٌ
-- مكرّرٌ مسموحٌ — الأسماءُ نصٌّ حرّ — وسنةٌ مكرّرةٌ مرفوضة.
create or replace function public.close_season(
  p_new_name       text,
  p_new_hijri_year integer,
  p_closed_by      text,
  p_actor          uuid
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old     bigint;
  v_new     bigint;
  v_name    text := btrim(coalesce(p_new_name, ''));
  v_old_row jsonb;
  v_priced  int;
begin
  if v_name = '' then
    raise exception 'اسم الموسم الجديد مطلوب.' using errcode = 'P0001';
  end if;

  if p_new_hijri_year is null then
    raise exception 'السنة الهجرية للموسم الجديد مطلوبة.' using errcode = 'P0001';
  end if;

  if p_new_hijri_year <= 0 or p_new_hijri_year >= 10000 then
    raise exception 'السنة الهجرية % غير صالحة.', p_new_hijri_year using errcode = 'P0001';
  end if;

  -- قفل الموسم النشط أولاً: يسلسل الإقفالات المتزامنة، ويمنع أي
  -- كتابة جارية (تأخذ for share) من أن تسبقنا وتصير في موسم مقفل
  select id into v_old from public.seasons where closed_at is null for update;
  if v_old is null then
    raise exception 'لا يوجد موسم مفتوح لإقفاله.' using errcode = 'P0001';
  end if;

  /* الهويّةُ هي السنة. والفحصُ هنا ليُقال بالعربيّة قبل أن يقوله
     الفهرسُ الفريد برمزٍ إنجليزيّ — والفهرسُ يبقى الحارسَ الأخير. */
  if exists (select 1 from public.seasons where hijri_year = p_new_hijri_year) then
    raise exception 'يوجد موسم للسنة % بالفعل.', p_new_hijri_year using errcode = 'P0001';
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

  /* الأماكنُ **لا تُنسَخ** من الموسم السابق: قرارٌ صريح. وهذا
     الإدراجُ يذكر عمودين لا تسعة، فتأتي البقيّةُ `null` بحكم
     البناء — لا بسطرٍ يتذكّر أن يفرّغها. */
  insert into public.seasons (name, hijri_year)
  values (v_name, p_new_hijri_year)
  returning id into v_new;

  /* الصفّ الملخّص يذكر عدد بنود التسعير الملتقَطة: صفرٌ يعني أن
     `pricing_settings` كان فارغاً لحظة الإقفال — وهي حقيقةٌ تُقال
     لا تُخفى، والواجهة تعرض عندها تحذير «بلا لقطة». */
  perform public.record_season_event(
    p_actor, 'update', v_old, v_old_row,
    jsonb_build_object(
      'closed_by',             p_closed_by,
      'new_season_id',         v_new,
      'new_season_name',       v_name,
      'new_season_hijri_year', p_new_hijri_year,
      'pricing_snapshot',      v_priced)
  );

  return v_new;
end;
$$;

comment on function public.close_season(text, integer, text, uuid) is
  'يُقفل الموسم النشط ويفتح موسماً جديداً بسنةٍ هجريّةٍ صريحةٍ واسمِ عرضٍ حرّ، في معاملة واحدة. الأماكنُ تبدأ فارغةً عمداً. الفشل في أي خطوة يُرجع الحالة كما كانت.';

revoke execute on function public.close_season(text, integer, text, uuid) from public, anon, authenticated;
grant  execute on function public.close_season(text, integer, text, uuid) to service_role;

-- البابُ القديم يُغلَق — ولا يُترك توقيعٌ يُنشئ موسماً بلا سنة
drop function if exists public.close_season(text, text, uuid);


-- ------------------------------------------------------------
-- ٩) إسقاطُ البوابة — الموسمُ من الموسم، لا من إعدادات الحملة
-- ------------------------------------------------------------
-- تغييرٌ في الإسقاط وحده. التفويضُ والمنحُ و`search_path` وحارسُ
-- الجلسة كما هي: `anon` وحده، بالرمز، وموسمُ الحاجّ نفسه.
--
-- ويُقرأ الموسمُ بـ`v_p.season_id` لا بـ«الموسم النشط»، فالإسقاطُ
-- صحيحٌ تاريخيّاً حتى لو اتّسعت قاعدةُ الجلسات يوماً.
--
-- و`features` يخرج من الإسقاط: `portal_settings` صارت المرجعَ
-- الوحيد لظهور أقسام البوابة. والعمودُ يبقى في القاعدة حتى PR B.
--
-- و`logo_url` **يبقى** في الإسقاط عمداً: عمودُ التوافق لم يُحذف
-- بعد، والبوابةُ تفضّل `assets.logo` عليه أصلاً. يخرج مع العمود.
create or replace function public.get_pilgrim_portal_by_session(p_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pid    bigint;
  v_p      public.passengers%ROWTYPE;
  v_result json;
begin
  v_pid := public._pilgrim_session_owner(p_token);
  if v_pid is null then
    return null;
  end if;

  select * into v_p from public.passengers where id = v_pid;
  if not found then
    return null;
  end if;

  select json_build_object(
    'pilgrim', json_build_object(
      'name_ar', v_p.name_ar, 'short_ar', v_p.short_ar, 'name_en', v_p.name_en,
      'gender', v_p.gender,
      'has_photo',         (nullif(trim(coalesce(v_p.photo_url,'')), '')         is not null),
      'has_hajj_permit',   (nullif(trim(coalesce(v_p.hajj_permit_url,'')), '')   is not null),
      'has_flight_ticket', (nullif(trim(coalesce(v_p.flight_ticket_url,'')), '') is not null),
      'hotel_type', v_p.hotel_type, 'hotel_view', v_p.hotel_view,
      'camp_mina', v_p.camp_mina, 'camp_arafa', v_p.camp_arafa,
      'camp_mina_name', (select c.name from public.camps c where c.id = v_p.camp_mina_id),
      'camp_arafa_name', (select c.name from public.camps c where c.id = v_p.camp_arafa_id),
      'phone', v_p.phone
    ),
    'bus', (select json_build_object('name', b.name, 'type', b.type) from public.buses b where b.id = v_p.bus_id),
    'room', (select json_build_object('number', r.number, 'floor', r.floor, 'type', r.type) from public.rooms r where r.id = v_p.room_id),
    'roommates', case
      when v_p.room_id is not null then
        (select coalesce(json_agg(json_build_object(
          'name', pp.name_ar, 'short_ar', pp.short_ar,
          'room_number', r2.number, 'room_floor', r2.floor,
          'bus_name', b2.name,
          'is_family', (pp.family_id is not null and pp.family_id = v_p.family_id)
        )), '[]'::json)
         from public.passengers pp
         left join public.rooms r2 on r2.id = pp.room_id
         left join public.buses b2 on b2.id = pp.bus_id
         where pp.room_id = v_p.room_id and pp.id <> v_p.id)
      else '[]'::json end,
    'family', case
      when v_p.family_id is not null then
        (select coalesce(json_agg(json_build_object(
          'name', pp.name_ar, 'short_ar', pp.short_ar,
          'gender', pp.gender,
          'room_number', r2.number, 'room_floor', r2.floor,
          'bus_name', b2.name,
          'camp_mina_name', (select c.name from public.camps c where c.id = pp.camp_mina_id),
          'camp_arafa_name', (select c.name from public.camps c where c.id = pp.camp_arafa_id)
        )), '[]'::json)
         from public.passengers pp
         left join public.rooms r2 on r2.id = pp.room_id
         left join public.buses b2 on b2.id = pp.bus_id
         where pp.family_id = v_p.family_id and pp.id <> v_p.id)
      else '[]'::json end,
    'flight_go', (select json_build_object('name', f.name, 'airline', f.airline, 'from_airport', f.from_airport, 'to_airport', f.to_airport, 'date', f.date, 'time', f.time, 'arrival_time', f.arrival_time, 'arrival_date', f.arrival_date, 'class', v_p.flight_class) from public.flights f where f.id = v_p.flight_id),
    'flight_back', (select json_build_object('name', f.name, 'airline', f.airline, 'from_airport', f.from_airport, 'to_airport', f.to_airport, 'date', f.date, 'time', f.time, 'arrival_time', f.arrival_time, 'arrival_date', f.arrival_date, 'class', v_p.flight_class) from public.flights f where f.id = v_p.return_flight_id),

    /* موسمُ الحاجّ — اسمُه وأماكنُه. لا `company_config` ولا
       «الموسم النشط»: الصفُّ الذي ينتمي إليه الحاجّ نفسُه. */
    'season', (select json_build_object(
        'name',          s.name,
        'hijri_year',    s.hijri_year,
        'hotel_name',    s.hotel_name,
        'hotel_address', s.hotel_address,
        'hotel_url',     s.hotel_url,
        'mina_address',  s.mina_address,
        'mina_url',      s.mina_url,
        'arafa_address', s.arafa_address,
        'arafa_url',     s.arafa_url)
      from public.seasons s where s.id = v_p.season_id),

    'config', (select json_build_object(
      'name_ar', c.name_ar, 'logo_url', c.logo_url, 'tagline', c.tagline,
      'color_primary', c.color_primary, 'color_accent', c.color_accent,
      'admin_name', c.admin_name,
      'admin_phone', c.admin_phone, 'admin_whatsapp', c.admin_whatsapp,
      'country', c.country, 'city', c.city,
      'portal_welcome_message', c.portal_welcome_message,
      'portal_help_message', c.portal_help_message,
      'portal_settings', c.portal_settings,
      'assets', (select coalesce(jsonb_object_agg(a.asset_key, a.asset_url), '{}'::jsonb)
        from public.company_assets a
        where a.asset_key = any (array['logo', 'portal_banner', 'favicon']))
    ) from public.company_config c order by c.id limit 1),
    /* م٧ — شرط الموسم. الحاجّ يقرأ تنبيهات موسمه، ولا يرث تنبيهاً
       بلا انتهاءٍ من موسمٍ سبقه. والجلسة نفسها موسمها النشط. */
    'announcements', (select coalesce(json_agg(json_build_object('id', a.id, 'body', a.body, 'priority', a.priority, 'show_at', a.show_at) order by (a.priority = 'عاجل') desc, a.show_at desc), '[]'::json)
      from public.announcements a
      where a.season_id = v_p.season_id
        and a.show_at <= now() and (a.expires_at is null or a.expires_at > now()))
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_pilgrim_portal_by_session(text) is
  'س٧ — إسقاط بوابة الحاجّ بالجلسة. قيمٌ منطقية للمستندات لا مفاتيح. م٧: التنبيهات مرشَّحة بموسم الحاجّ. والاسمُ والأماكنُ من صفّ موسمه لا من إعدادات الحملة.';

revoke execute on function public.get_pilgrim_portal_by_session(text) from public, authenticated;
grant execute on function public.get_pilgrim_portal_by_session(text) to anon;


-- ------------------------------------------------------------
-- ١٠) الإسقاطُ العلنيّ — ما تحتاجه شاشةُ الدخول وحده
-- ------------------------------------------------------------
-- كان يكشف ثلاثين عموداً لغير المصادَق: هواتفَ التواصل وواتسابَ
-- المشرف والفندقَ ومنى وعرفةَ ورسائلَ البوابة وإعداداتِها. وشاشةُ
-- الدخول لا تقرأ منها إلا الاسمَ والشعارَ النصّيَّ والشعارَ
-- والألوان.
--
-- ولا `commercial_registration` ولا بنكَ هنا — ولا يُضافان.
-- و`logo_url`/`banner_image_url` يبقيان لأنّ شاشةَ البدء تقرؤهما
-- حتى ترحيلِ التنظيف.
-- ⚠️ `create or replace view` **لا يستطيع إسقاط عمود** — تردّه
-- القاعدةُ بـ42P16 «cannot drop columns from view». وهذا العرضُ
-- يفقد تسعةَ عشرَ عموداً، فلا بدّ من الإسقاط ثمّ الإنشاء. و`drop`
-- بلا `cascade` عمداً: لو تعلّق به شيءٌ لم نعلمه فليفشل الترحيلُ
-- ويُقال، لا أن يُسقَط المعلَّقُ صامتاً.
drop view if exists public.company_profile_public;

-- ⚠️⚠️ و`security_invoker = false` **يُكتَب صراحةً** ولا يُترك
-- للافتراض: عليه يقوم الإسقاط كلُّه. فالعرضُ يقرأ `company_config`
-- بصلاحيّات مالكه (postgres) لا بصلاحيّات القارئ، وبه يرى غيرُ
-- المصادَق أحدَ عشرَ عموداً ولا يرى الجدول. وهي خاصّيّةٌ أمنيّةٌ
-- لا تُورَّث ضمناً.
create view public.company_profile_public
with (security_invoker = false)
as
  select id,
         name_ar, name_en, tagline,
         logo_url, banner_image_url,
         color_primary, color_accent, color_sidebar,
         banner_position, banner_position_x
    from public.company_config
   where id = 1;

comment on view public.company_profile_public is
  'إسقاطُ هويّة الحملة لغير المصادَق — شاشةُ الدخول وشاشةُ البدء وحدهما. لا تواصلَ ولا بنكَ ولا سجلّاً تجاريّاً ولا أماكنَ موسمٍ ولا إعداداتِ بوابة.';

-- ⚠️⚠️ الإسقاطُ والإنشاءُ يُعيدان العرضَ صفحةً بيضاء — و«البيضاءُ»
-- هنا ليست فارغة: في هذه القاعدة `alter default privileges` لدور
-- `postgres` على علاقات `public` يمنح **`arwdDxtm` كاملةً** لـ
-- `authenticated` و`service_role` لكلّ علاقةٍ تُنشَأ. فالعرضُ
-- الجديد يولد ومعه INSERT وUPDATE وDELETE لكلّ موظّفٍ مصادَق.
--
-- وهذا العرضُ **قابلٌ للتحديث تلقائياً** (جدولٌ واحد، أعمدةٌ بسيطة،
-- بلا تجميعٍ ولا DISTINCT)، و`security_invoker = false` يجعل
-- الكتابةَ تُنفَّذ بصلاحيّات المالك — وهو مالكُ `company_config`
-- نفسِه، فتُتجاوَز RLS كلُّها. فموظّفٌ بلا أيّ صلاحيّةٍ كان
-- سيكتب في هويّة الحملة من بابٍ خلفيّ، ويتجاوز
-- `company_config_management_update` التي تشترط `manage_users`.
--
-- ولذلك يُسحَب صراحةً من `anon` و`authenticated` — لا من `public`
-- وحده: الامتيازُ مُنح لهما بأسمائهما، فلا يرفعه سحبٌ من `public`.
-- وهذا هو نمطُ 20260806110000 نفسُه، ولسببه نفسِه.
revoke all on table public.company_profile_public from public, anon, authenticated;
grant select on table public.company_profile_public to anon, authenticated, service_role;


-- ------------------------------------------------------------
-- ١١) صلاحيةُ دورة حياة الموسم — تُمنح بيدٍ لا بأداة
-- ------------------------------------------------------------
-- `manage_season_lifecycle` تعني شيئين لا ثالثَ لهما: إقفالُ الموسم
-- النشط، وحذفُ موسمٍ مقفلٍ **حذفاً دائماً**. ولا تعني عرضَ الأرشيف
-- ولا تعديلَ إعدادات الموسم.
--
-- ═══ لماذا لا تُستنتَج من صلاحياتٍ قائمة ═══
-- منحُها لمن يملك `view_archive` و`manage_users` كان سيُسنِد **حذفَ
-- موسمٍ كاملٍ** إلى قرارٍ لم يُتَّخذ قطّ: من منح «عرضَ الأرشيف»
-- لموظّفٍ سنةَ ٢٠٢٦ لم يكن يمنحه حذفَ مواسم.
--
-- ═══ والسابقةُ في المستودع نفسه ═══
-- `seed_first_admin.mjs` يستثني `view_audit` من حسابِ الإقلاع عمداً،
-- ونصُّ تعليقِه: «فمن يقرأ تاريخ البيانات الحسّاسة كلَّه يُمنح بيدٍ
-- لا بأداة». وهذه أولى بذلك: القراءةُ تُطلَع، والحذفُ لا يُستردّ.
--
-- ═══ فلمن تُمنح هنا؟ لحسابِ كسر الزجاج وحدَه ═══
-- `breakglass@system.local` — هويّةٌ **ثابتةٌ وموثَّقةٌ** في
-- `docs/architecture/BREAK_GLASS.md` §٢، تُعرَّف بمعرّف الدخول لا
-- باسمِ عرضٍ يتبدّل. وهي مسارُ الإدارة الاحتياطيّ المقصود.
--
-- ولا قفلَ من هذا: كلُّ من يملك `manage_users` اليوم يستطيع منحَها
-- من «الإعدادات ← المستخدمون» فوراً، ويُسجَّل المنحُ في سجلّ
-- التدقيق بفاعلٍ مُثبَت. فالقدرةُ على المنح متاحةٌ كاملة، والقدرةُ
-- على الهدم وحدها هي التي تنتظر قراراً بشريّاً.
do $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.user_profiles
   where email = 'breakglass@system.local' and is_active;

  if v_id is null then
    raise exception 'حساب كسر الزجاج (breakglass@system.local) غير موجود أو غير نشط — وهو شرطُ نشرٍ موثَّق (BREAK_GLASS.md). أصلِحه ثمّ أعِد الترحيل، فلا تُمنح صلاحيةُ الحذف الدائم بالتخمين.'
      using errcode = 'P0001';
  end if;

  update public.user_profiles
     set permissions = permissions || jsonb_build_object('manage_season_lifecycle', true)
   where id = v_id
     and not coalesce((permissions ->> 'manage_season_lifecycle')::boolean, false);

  raise notice 'manage_season_lifecycle مُنحت لحساب كسر الزجاج وحده. امنحها لمن يلزم من «الإعدادات ← المستخدمون».';
end $$;


-- ============================================================
-- التراجع (يدويّ عند الحاجة)
-- ------------------------------------------------------------
--   ١) استعادةُ توقيع الإقفال القديم من
--      20260827120000_season_pricing_snapshot.sql، ثمّ
--      drop function if exists public.close_season(text, integer, text, uuid);
--   ٢) drop function if exists public.update_active_season(text,text,text,text,text,text,text,text);
--   ٣) استعادةُ get_pilgrim_portal_by_session و company_profile_public من
--      20260829120000_m7_season_flights_announcements.sql و
--      20260806110000_company_profile_phase1.sql
--   ٤) drop index if exists public.seasons_hijri_year_key;
--      alter table public.seasons drop constraint if exists seasons_hijri_year_valid;
--      alter table public.seasons alter column hijri_year drop not null;
--   ٥) الأعمدةُ المضافةُ تُترك: لا قارئَ لها بعد التراجع، وإسقاطُها
--      يُفقِد ما أدخله المديرُ بينهما.
--
-- ولا عمودَ موروثٌ حُذف في هذا الترحيل، فالتراجعُ لا يُفقِد بياناً.
-- ============================================================
