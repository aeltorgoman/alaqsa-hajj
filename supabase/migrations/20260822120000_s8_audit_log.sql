-- ============================================================
-- س٨ — سجل التدقيق (audit_log) والفاعل المفوَّض
-- ============================================================
-- Security Architecture v1.7 · §٦.٤ · §١٠ · §١٠.١ · الثابت أ٧
-- و`docs/architecture/S8_IMPLEMENTATION_DESIGN.md` v1.0 (ق١–ق١٢).
--
-- تُغلق M3، وتُفعِّل الثابت **أ٧** — آخر ثوابت س٠–س٩ غير المفروضة.
--
-- ═══ لماذا الفاعل بمصدرين لا بواحد (§١٠.١) ═══
-- `auth.uid()` كافٍ للكتابة المباشرة بدور `authenticated`. وغيرُ
-- كافٍ لثلاثة مسارات تكتب بمفتاح الخدمة: كتابة `user_profiles` من
-- `user-admin`، و`close_season`، و`delete_season`. وأخطرها الأول —
-- وهو عين سؤال «من منح هذه الصلاحية؟».
--
-- ولا يُحلّ هذا بتمرير الفاعل من العميل (انتحال)، بل بفاعلٍ **يُثبَت
-- من JWT في الخادم** ثم يُمرَّر **داخل حدود الخادم وحده** عبر باب
-- بامتياز الخدمة: `set_audit_actor`.
--
-- ═══ حدّ المعاملة — مُثبَت لا مفترَض ═══
-- GUC المضبوط بـ`set_config(...,true)` **لا يعيش خارج معاملته**،
-- وPostgREST يجعل كل طلب معاملةً مستقلّة. فاستدعاءان متتاليان من
-- `supabase-js` لا يتشاركان معاملة — وهذا مُثبَت عملياً على هذا
-- النشر قبل كتابة هذا الملف، ومكتوبٌ أصلاً في تعليق `delete_season`
-- منذ م١: «PostgREST لا يمرّر إعدادات جلسة».
--
-- **ولذلك يدخل الفاعل وسيطاً في الدالة التي تنفّذ العملية نفسها**،
-- وتضبطه الدالة داخلياً في معاملتها. ولا يوجد في هذا الملف مسار
-- واحد يعتمد على بقاء GUC بين استدعاءين.
--
-- ═══ راية الإيقاف — حارسٌ بالصلاحية لا بالعُرف (B-1) ═══
-- إيقاف المحفّزات الصفّية داخل `delete_season` **لا يُنقل براية GUC**.
-- الـGUC ليس كائناً يُمنح ويُسحب، فلا آلية تحرسه: وقد ثبت بالاختبار
-- أن دور `authenticated` القادر على `SET LOCAL` **يُسكت أثره بصمت**.
--
-- وفحصُ الدور لا يصلح حارساً كذلك — **مُثبَت لا مفترَض**: داخل
-- `record_audit` وهي `SECURITY DEFINER` يملكها `postgres`، تكون
-- `current_user = postgres` **دائماً**، سواء أطلق المحفّزَ موظّفٌ أم
-- مفتاحُ خدمة. فشرطٌ على `current_user` صادقٌ أبداً ولا يحرس شيئاً.
-- و`session_user` كذلك: `authenticator` لكل طلب من PostgREST.
--
-- **فالحارس صلاحية:** جدول `audit_suppression` بلا أي منح لأي دور —
-- ولا حتى `service_role` — فلا يكتب فيه إلا مالكه، أي لا تبلغه إلا
-- دالة `SECURITY DEFINER` يملكها `postgres`. والراية صفٌّ برقم
-- المعاملة الجارية، يعيش داخلها ويموت معها.
--
-- ═══ ما لا تفعله هذه الهجرة ═══
-- لا تمسّ سياسة RLS قائمة · ولا `has_permission()` · ولا مساراً من
-- مسارات البوابة · ولا حاوية تخزين · ولا تضيف مدخلاً واحداً إلى
-- جرد الوصول المجهول · ولا تحذف بياناً · ولا تبني آلية احتفاظ أو
-- حذف أو إخفاء (ق٥ — السياسة موثَّقة، والآلية تُصمَّم مستقلّة).
-- ============================================================


-- ------------------------------------------------------------
-- ١) الجدول — بلا مفاتيح أجنبية عمداً (ق٨ · المعماريّ «أ»)
-- ------------------------------------------------------------
-- الدليل يجب أن يبقى بعد اختفاء مصدره، وإلا فهو ليس دليلاً:
--   · `user_profiles.id → auth.users on delete cascade` — فمفتاحٌ
--     أجنبيّ على `actor_id` يمحو تاريخ الموظّف يوم يُحذف حسابه،
--     وهو بالضبط اليوم الذي يُحتاج فيه.
--   · `delete_season` يمحو `seasons` و`passengers` — فمفتاحٌ أجنبيّ
--     على `season_id` أو `row_id` يمحو **الدليل على الحذف نفسه**.
-- ولهذا `row_id` نصّ: المفاتيح `bigint` هنا و`uuid` هناك، والصفّ
-- المشار إليه قد لا يبقى موجوداً أصلاً — فهو وصفٌ لا علاقة.
create table if not exists public.audit_log (
  id             bigint      generated always as identity primary key,
  at             timestamptz not null default now(),
  actor_id       uuid,
  actor_username text,
  actor_source   text        not null,
  table_name     text        not null,
  row_id         text        not null,
  action         text        not null,
  season_id      bigint,
  old_value      jsonb,
  new_value      jsonb,
  constraint audit_log_action_chk
    check (action in ('insert', 'update', 'delete')),
  constraint audit_log_actor_source_chk
    check (actor_source in ('session', 'delegated', 'system'))
);

comment on table public.audit_log is
  'سجل تدقيق إلحاقيّ — س٨. لا تعديل ولا حذف ولا اقتطاع لأي دور تطبيقيّ. الاحتفاظ: خمس سنوات بعد نهاية الموسم، أو من at لما لا موسم له. والآلية تُصمَّم مستقلّة (Security Architecture v1.6 §١٠).';
comment on column public.audit_log.actor_source is
  'مصدر الإسناد: session = auth.uid() · delegated = فاعلٌ أُثبت من JWT ومُرِّر داخل الخادم · system = غير مُسنَد إلى شخص (لوحة التحكّم · مفتاح الخدمة · أداة الطوارئ).';
comment on column public.audit_log.actor_id is
  'بلا مفتاح أجنبي عمداً — الصفّ يبقى بعد حذف حساب الموظّف.';
comment on column public.audit_log.season_id is
  'بلا مفتاح أجنبي عمداً — الصفّ يبقى بعد حذف الموسم. ويكون NULL لجدول بلا عمود موسم (payments · custom_charges · user_profiles)، فيسري عليه حدّ الاحتفاظ الزمنيّ.';

create index if not exists audit_log_row_idx    on public.audit_log (table_name, row_id, at desc);
create index if not exists audit_log_at_idx     on public.audit_log (at desc);
create index if not exists audit_log_actor_idx  on public.audit_log (actor_id, at desc);


-- ------------------------------------------------------------
-- ٢) الصلاحيات — الطبقة الأولى من ثلاث (§١٠ قاعدة ١)
-- ------------------------------------------------------------
-- لا `insert` ولا `update` ولا `delete` ولا `truncate` لأي دور
-- تطبيقيّ. والقراءة وحدها، وخلف سياسة، وخلف صلاحية.
alter table public.audit_log enable row level security;

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- و`service_role` كذلك **لا يكتب في السجل مباشرةً** (قرار صاحب المشروع).
-- الامتيازات الافتراضية في Supabase تمنحه كل شيء على كل جدول جديد، فلولا
-- هذا السحب لأمكن لحامل مفتاح الخدمة أن يسكّ صفّاً مختلقاً بفاعلٍ ينتحله.
-- والكتابة الشرعية كلّها من `record_audit` و`record_season_event`، وهما
-- `SECURITY DEFINER` يملكهما `postgres` فتكتبان بامتياز المالك لا بامتياز
-- المستدعي — فالسحب لا يعطّل مساراً شرعياً واحداً.
--
-- و`trigger` مسحوب معه عن قصد: من يملك `TRIGGER` على الجدول يستطيع أن
-- يربط به محفّزاً يبتلع الإدراج، فيصير مانعاً للكتابة من باب آخر. ومنعُ
-- الكتابة المباشرة لا يتمّ بسدّ `insert` وحده.
--
-- ويبقى `select` له: القراءة ليست تزويراً، ودوال الخادم قد تحتاجها.
revoke insert, update, delete, truncate, trigger, references
  on public.audit_log from service_role;

-- عمود الهوية `generated always as identity` متتاليته تابعة للجدول،
-- وصلاحيتها مشتقّة من صلاحيته — فسحب الكتابة أعلاه يكفي، ولا يُمسّ
-- شيء خارج هذا الجدول.


-- ------------------------------------------------------------
-- ٢.١) راية الإيقاف — جدولٌ لا يبلغه دورٌ تطبيقيّ (B-1)
-- ------------------------------------------------------------
-- الصفّ يحمل رقم المعاملة الجارية، فلا يُقرأ في معاملة أخرى، ويموت
-- بموت معاملته سواء أُتمّت أم أُجهضت. والحراسة **منحٌ مسحوب** —
-- آلية حقيقية — لا افتراضُ أن PostgREST لا يعرّض `set_config`.
create table if not exists public.audit_suppression (
  txid bigint primary key
);

comment on table public.audit_suppression is
  'راية إيقاف المحفّزات الصفّية داخل delete_season وحدها. بلا منح لأي دور — ولا service_role — فلا يكتب فيها إلا مالك القاعدة عبر دالة SECURITY DEFINER (B-1).';

alter table public.audit_suppression enable row level security;
revoke all on public.audit_suppression from public, anon, authenticated, service_role;


-- ------------------------------------------------------------
-- ٣) RLS — الطبقة الثانية: سياسة قراءة واحدة، ولا سياسة كتابة
-- ------------------------------------------------------------
-- `view_audit` صلاحية مستقلّة (ق٢ · D2): ربط رؤية السجل بـ
-- `manage_users` يجعل المراقِب هو المراقَب.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.has_permission('view_audit'));


-- ------------------------------------------------------------
-- ٤) المنع — الطبقة الثالثة: محفّزان بلا شرط ولا استثناء (ق٩)
-- ------------------------------------------------------------
-- ولماذا طبقة ثالثة والصلاحيات تكفي: لأن طبقةً واحدة تسقط بخطأ
-- ترحيلٍ واحد، ولأن هذه الطبقة **تجعل النيّة مقروءة في المخطَّط**
-- لا مستنتَجة من صلاحية غائبة. وهي كذلك ما يسدّ `TRUNCATE` —
-- وهي الفجوة التي لا يراها أي محفّز صفّيّ.
--
-- ومحفّزان لا واحد لأن `TRUNCATE` حدثٌ على مستوى العبارة ولا يجتمع
-- مع أحداث الصفّ في محفّز واحد.
create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'سجل التدقيق إلحاقيّ: لا تعديل ولا حذف ولا اقتطاع.'
    using errcode = 'P0001';
end;
$$;

comment on function public.audit_log_immutable() is
  'يرفض أي تعديل أو حذف أو اقتطاع على audit_log — بلا شرط ولا استثناء ولا راية (ق٩).';

-- دالة محفّز لا تُستدعى مباشرة — والقاعدة نفسها التي أُغلق بها البند
-- أ٧ في هذا الملف تسري عليها: ما لا يُستدعى لا يُترك ممنوحاً.
-- و`service_role` مشمولٌ بالسحب لأن الامتيازات الافتراضية في Supabase
-- تمنحه كل دالة جديدة — فبدونه يكذب هذا التعليق على الإنتاج (M-1).
revoke execute on function public.audit_log_immutable() from public, anon, authenticated, service_role;

drop trigger if exists audit_log_immutable_row_trg  on public.audit_log;
drop trigger if exists audit_log_immutable_stmt_trg on public.audit_log;

create trigger audit_log_immutable_row_trg
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

create trigger audit_log_immutable_stmt_trg
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();


-- ------------------------------------------------------------
-- ٥) باب الفاعل المفوَّض — بامتياز الخدمة وحده (§١٠.١ الضابط ٢)
-- ------------------------------------------------------------
-- ⚠️ `EXECUTE` ممنوح لـ`PUBLIC` افتراضاً في Postgres، و`PUBLIC`
-- تشمل `anon`. فالسحب من `anon` وحده يترك الباب مفتوحاً. الترتيب
-- هنا مقصود: `revoke ... from public` **أوّلاً**، ثم المنح صراحةً.
--
-- و`SECURITY INVOKER` عمداً (لا DEFINER): ضبط GUC في نطاق `app.`
-- لا يحتاج امتيازاً، والحراسة كلّها في `EXECUTE`. فلا يُضاف إلى
-- النظام كائن `SECURITY DEFINER` بلا حاجة.
create or replace function public.set_audit_actor(p_actor uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  select set_config('app.audit_actor', coalesce(p_actor::text, ''), true);
$$;

comment on function public.set_audit_actor(uuid) is
  'يضبط الفاعل المفوَّض **محليّاً بالمعاملة** (§١٠.١ الضابط ٣). لا يعيش بعدها، ولا يُستدعى إلا من داخل الدالة التي تنفّذ العملية نفسها.';

revoke execute on function public.set_audit_actor(uuid) from public, anon, authenticated;
grant  execute on function public.set_audit_actor(uuid) to service_role;


-- ------------------------------------------------------------
-- ٦) الكاتب الوحيد للسجل — `record_audit()`
-- ------------------------------------------------------------
-- `SECURITY DEFINER` بحقّ هنا: الموظّف بدور `authenticated` لا يملك
-- `insert` على `audit_log` — ولا يجوز أن يملكه. فالمحفّز وحده يكتب.
-- و`search_path` مثبَّت (قاعدة س٩).
--
-- الفاعل بترتيب ثابت (§١٠.١)، ولا يُقرأ من عمود ولا من وسيط محفّز
-- ولا من جسد طلب — أبداً:
--     ١) auth.uid()            → session
--     ٢) الفاعل المفوَّض        → delegated
--     ٣) وإلا                  → system  (ويُصرَّح به لا يُخفى)
--
-- و`actor_username` من **`user_profiles`** لا من `auth.users`
-- (الثابت أ١٠)، ويُلتقط لحظة الفعل: الأسماء تتغيّر، والصفّ يحفظ
-- ما كان الاسم يومها.
--
-- fail-closed (ق٣ · D3): هذا محفّز `AFTER`، فأي خطأ فيه **يُسقط
-- المعاملة التجارية**. والفعل الذي لم يُكتب أثره لا يقع. وهذا
-- **يخالف عمداً** سياسة fail-open في حدّ استدعاءات س٩: ثمن فشل
-- الحدّ خنقٌ فائت يُعوَّض، وثمن فشل التدقيق دليلٌ ضائع لا يُستعاد.
create or replace function public.record_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid;
  v_source   text;
  v_username text;
  v_row      jsonb;
  v_old      jsonb;
  v_new      jsonb;
  v_key      text;
  v_before   jsonb;
  v_after    jsonb;
begin
  /* راية الإيقاف — الاستثناء الوحيد، ونطاقه `delete_season` وحدها.
     والحارس **صلاحية**: `audit_suppression` بلا منح لأي دور، فلا
     يكتب فيها إلا مالك القاعدة. فراية مزوّرة من دور تطبيقيّ **لا
     وجود لها أصلاً** — لا تُقرأ ولا تُكتب (B-1).
     ولا يصحّ هنا فحص الدور: `current_user` داخل هذه الدالة
     `postgres` دائماً لأنها `SECURITY DEFINER`. */
  if exists (select 1 from public.audit_suppression where txid = txid_current()) then
    return null;
  end if;

  v_actor := auth.uid();
  if v_actor is not null then
    v_source := 'session';
  else
    begin
      v_actor := nullif(current_setting('app.audit_actor', true), '')::uuid;
    exception when others then
      v_actor := null;
    end;
    v_source := case when v_actor is not null then 'delegated' else 'system' end;
  end if;

  if v_actor is not null then
    select name into v_username from public.user_profiles where id = v_actor;
  end if;

  /* تقليل البيانات (§١٠ قاعدة ٦):
       insert → new وحده · delete → old كاملاً (وهو الدليل نفسه)
       update → **المفاتيح المتغيّرة وحدها** لا لقطتان كاملتان */
  if TG_OP = 'DELETE' then
    v_row := to_jsonb(OLD);
    v_old := v_row;
  elsif TG_OP = 'INSERT' then
    v_row := to_jsonb(NEW);
    v_new := v_row;
  else
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    v_row    := v_after;
    v_old := '{}'::jsonb;
    v_new := '{}'::jsonb;
    for v_key in select jsonb_object_keys(v_after) loop
      if (v_after -> v_key) is distinct from (v_before -> v_key) then
        v_old := v_old || jsonb_build_object(v_key, v_before -> v_key);
        v_new := v_new || jsonb_build_object(v_key, v_after  -> v_key);
      end if;
    end loop;
    /* تعديلٌ لم يغيّر شيئاً ليس تاريخاً */
    if v_new = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_log (
    actor_id, actor_username, actor_source,
    table_name, row_id, action, season_id, old_value, new_value
  ) values (
    v_actor, v_username, v_source,
    TG_TABLE_NAME,
    coalesce(v_row ->> 'id', ''),
    lower(TG_OP),
    nullif(v_row ->> 'season_id', '')::bigint,
    v_old, v_new
  );

  return null;
end;
$$;

comment on function public.record_audit() is
  'الكاتب الوحيد لـaudit_log. الفاعل من auth.uid() أو من الفاعل المفوَّض، ولا يُقبل من العميل بحال (§١٠ قاعدة ٢).';

-- كاتب المحفّز — لا يُستدعى مباشرة، ولا يُترك ممنوحاً لأي دور بما
-- فيها `service_role` (M-1). تنفّذه القاعدة وحدها عند إطلاق المحفّز.
revoke execute on function public.record_audit() from public, anon, authenticated, service_role;


-- ------------------------------------------------------------
-- ٧) المحفّزات — التغطية الأولى بحرفها، ولا سطر خارجها (ق١٢)
-- ------------------------------------------------------------
-- `AFTER` لا `BEFORE` عمداً: `trg_reject_closed_season` محفّز
-- `BEFORE`، والكتابة التي يرفضها لا تبلغ محفّز `AFTER` أصلاً —
-- فلا يُسجَّل ما لم يقع. الترتيب يحلّ المسألة لا استثناءٌ مكتوب.
--
-- و`passengers` **حذفاً وحده** (ق٦ · D6): §١٠ تقول «(حذف)»،
-- وتخصيص الباصات والغرف عملٌ جماعيّ يوميّ على ٤٦ عموداً — وتدقيق
-- تعديله هو نموّ غير محدود بلا سؤالٍ يجيب عنه.
drop trigger if exists user_profiles_audit_trg  on public.user_profiles;
drop trigger if exists payments_audit_trg       on public.payments;
drop trigger if exists custom_charges_audit_trg on public.custom_charges;
drop trigger if exists passengers_audit_trg     on public.passengers;

create trigger user_profiles_audit_trg
  after insert or update or delete on public.user_profiles
  for each row execute function public.record_audit();

create trigger payments_audit_trg
  after insert or update or delete on public.payments
  for each row execute function public.record_audit();

create trigger custom_charges_audit_trg
  after insert or update or delete on public.custom_charges
  for each row execute function public.record_audit();

create trigger passengers_audit_trg
  after delete on public.passengers
  for each row execute function public.record_audit();


-- ------------------------------------------------------------
-- ٨) كتابة ملفّ المستخدم بفاعلٍ مُثبَت — المعاملة الواحدة (ق١ · D1)
-- ------------------------------------------------------------
-- `user-admin` يثبت الهوية من JWT (`callerId`)، ثم يمرّرها هنا.
-- وهذه الدالة **تضبط الفاعل وتكتب في المعاملة نفسها** — لأن
-- استدعاءين متتاليين لا يتشاركان معاملة، وقد أُثبت ذلك عملياً.
--
-- و`p_actor` مصدره واحد لا ثانيَ له: JWT الجلسة. ولو أرسل المتصفّح
-- حقلاً باسم `actor` **فهو مُهمَل بالكامل** — لا يصل إلى هنا أصلاً.
--
-- `SECURITY INVOKER` عمداً: `service_role` يكتب `user_profiles`
-- بامتيازه، فلا حاجة إلى `DEFINER`. والحراسة في `EXECUTE`.
create or replace function public.admin_write_user_profile(
  p_actor       uuid,
  p_mode        text,
  p_id          uuid,
  p_email       text    default null,
  p_name        text    default null,
  p_permissions jsonb   default null,
  p_is_active   boolean default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_actor is null then
    raise exception 'الفاعل مطلوب: لا كتابة على ملفّات المستخدمين بلا إسناد.'
      using errcode = 'P0001';
  end if;
  if p_mode not in ('insert', 'update') then
    raise exception 'وضع غير معروف: %.', p_mode using errcode = 'P0001';
  end if;

  perform public.set_audit_actor(p_actor);

  if p_mode = 'insert' then
    insert into public.user_profiles (id, email, name, permissions, is_active)
    values (p_id, p_email, p_name, coalesce(p_permissions, '{}'::jsonb), coalesce(p_is_active, true));
  else
    /* NULL = «لم يُرسَل» فلا يُمسّ — لا «امسح القيمة» */
    update public.user_profiles
       set email       = coalesce(p_email, email),
           name        = coalesce(p_name, name),
           permissions = coalesce(p_permissions, permissions),
           is_active   = coalesce(p_is_active, is_active),
           updated_at  = now()
     where id = p_id;

    if not found then
      raise exception 'لا يوجد ملفّ بالمعرّف %.', p_id using errcode = 'P0001';
    end if;
  end if;
end;
$$;

comment on function public.admin_write_user_profile(uuid, text, uuid, text, text, jsonb, boolean) is
  'كتابة ملفّ مستخدم بفاعلٍ مُثبَت من JWT، في معاملة واحدة مع ضبط الفاعل المفوَّض (ق١). service_role وحده.';

revoke execute on function public.admin_write_user_profile(uuid, text, uuid, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_write_user_profile(uuid, text, uuid, text, text, jsonb, boolean)
  to service_role;


-- حذف الملفّ بفاعلٍ مُثبَت — وإلا لسقط الصفّ بـ`on delete cascade`
-- من `auth.users` بفاعلٍ فارغ، وهو أسوأ سؤالٍ يُترك بلا جواب:
-- «من حذف هذا المستخدم؟». والحساب في `auth.users` يُحذف بعدها من
-- `user-admin`، فلا يجد الـ cascade صفّاً ليحذفه.
create or replace function public.admin_delete_user_profile(
  p_actor uuid,
  p_id    uuid
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_actor is null then
    raise exception 'الفاعل مطلوب: لا حذف لملفّ مستخدم بلا إسناد.'
      using errcode = 'P0001';
  end if;

  perform public.set_audit_actor(p_actor);
  delete from public.user_profiles where id = p_id;
end;
$$;

comment on function public.admin_delete_user_profile(uuid, uuid) is
  'يحذف ملفّ المستخدم بفاعلٍ مُثبَت قبل حذف الحساب من auth.users. service_role وحده.';

revoke execute on function public.admin_delete_user_profile(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.admin_delete_user_profile(uuid, uuid) to service_role;


-- ------------------------------------------------------------
-- ٩) عمليتا الموسم — تدقيق ملخَّص محدود (ق١٠ · المعماريّ «ج»)
-- ------------------------------------------------------------
-- حذف موسم فيه ألف حاجّ يولّد بمحفّز صفّيّ ألف صفّ بلقطة كاملة لكل
-- حاجّ — داخل معاملة ثقيلة أصلاً. فينفجر الحجم، وتبطؤ عمليةٌ لا
-- رجعة فيها، ويصير السجلّ غير مقروء في اللحظة التي يُقرأ فيها.
--
-- والصفّ الملخَّص **يلخّص العملية ولا يخفيها**: ما العملية · على أي
-- موسم · متى · **وبيد أي موظّف مُثبَت** · وكم صفّاً سقط في كل جدول.
--
-- ═══ تغيير التوقيعين — وهو ما يوجب نشر `season-admin` معه ═══
-- كلتاهما تكتسب `p_actor uuid`. و`close_season` كانت تحمل
-- `p_closed_by text` وهو **اسم** لا معرّف: الأسماء تتغيّر وتتكرّر،
-- فلا تصلح إسناداً. ويبقى `p_closed_by` كما هو **للإيصال**،
-- ويُكمَّل بـ`actor_id` ولا يُستبدل به.

-- كاتب الصفّ الملخّص — لا يُمنح لأي دور: تستدعيه دالتا الموسم
-- وحدهما، وكلتاهما `SECURITY DEFINER` فتنفّذانه بامتياز المالك.
create or replace function public.record_season_event(
  p_actor     uuid,
  p_action    text,
  p_season_id bigint,
  p_old       jsonb,
  p_new       jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_username text;
begin
  if p_actor is not null then
    select name into v_username from public.user_profiles where id = p_actor;
  end if;

  insert into public.audit_log (
    actor_id, actor_username, actor_source,
    table_name, row_id, action, season_id, old_value, new_value
  ) values (
    p_actor, v_username,
    case when p_actor is not null then 'delegated' else 'system' end,
    'seasons', p_season_id::text, p_action, p_season_id, p_old, p_new
  );
end;
$$;

comment on function public.record_season_event(uuid, text, bigint, jsonb, jsonb) is
  'يكتب صفّ التدقيق الملخّص لعمليتَي الموسم — صفّ واحد لكل عملية لا صفّ لكل سطر ساقط (ق١٠).';

-- كاتبٌ داخليّ بحت: لا يبلغه `PUBLIC` ولا `anon` ولا `authenticated`
-- **ولا `service_role`** (M-1). والامتيازات الافتراضية في Supabase
-- تمنح الدوال الجديدة لثلاثة أدوار، فالسحب هنا يشملها جميعاً —
-- وإلا لأمكن لحامل مفتاح الخدمة أن يسكّ صفّ تدقيق بفاعلٍ مختلق.
-- ولا تُستدعى إلا من `close_season`/`delete_season` وهما
-- `SECURITY DEFINER` يملكهما `postgres`، فتنفّذانها بامتياز المالك.
revoke execute on function public.record_season_event(uuid, text, bigint, jsonb, jsonb)
  from public, anon, authenticated, service_role;


drop function if exists public.close_season(text, text);

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

  insert into public.seasons (name) values (v_name) returning id into v_new;

  perform public.record_season_event(
    p_actor, 'update', v_old, v_old_row,
    jsonb_build_object('closed_by', p_closed_by, 'new_season_id', v_new, 'new_season_name', v_name)
  );

  return v_new;
end;
$$;

comment on function public.close_season(text, text, uuid) is
  'يُقفل الموسم النشط ويفتح موسماً جديداً في معاملة واحدة، ويكتب صفّ تدقيق ملخّصاً بالفاعل المُثبَت. الفشل في أي خطوة يُرجع الحالة كما كانت.';


drop function if exists public.delete_season(bigint);

create or replace function public.delete_season(p_season_id bigint, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed timestamptz;
  v_name   text;
  v_row    jsonb;
  n_pass   bigint;
  n_rooms  bigint;
  n_camps  bigint;
  n_buses  bigint;
  n_pay    bigint;
  n_charge bigint;
  n_fgm    bigint;
  n_notif  bigint;
  n_push   bigint;
  n_sess   bigint;
begin
  select closed_at, name, to_jsonb(s) into v_closed, v_name, v_row
    from public.seasons s where s.id = p_season_id for update;

  if v_name is null then
    raise exception 'لا يوجد موسم بالمعرّف %.', p_season_id using errcode = 'P0001';
  end if;
  if v_closed is null then
    raise exception 'موسم % مفتوح — لا يُحذف إلا موسم مقفل.', v_name using errcode = 'P0001';
  end if;

  -- ما سيسقط بـ`on delete cascade` يُعدّ **قبل** الحذف: بعده لا
  -- يبقى ما يُعدّ، والصفّ الملخّص بلا أعداد لا يثبت حجم ما جرى.
  --
  -- والأصناف **العشرة كاملة** (M-2): أربعة تُحذف بالموسم مباشرةً،
  -- وستّة تسقط بـ`on delete cascade` من `passengers` — وهي كل ما
  -- يشير إلى `passengers` أو `seasons` في مخطَّط الإنتاج. فالعدّ
  -- الناقص يوحي بحجمٍ أصغر مما جرى، والصفّ الملخّص دليلٌ لا ملخّص
  -- تقريبيّ.
  select count(*) into n_pay    from public.payments       p
    join public.passengers pa on pa.id = p.passenger_id  where pa.season_id = p_season_id;
  select count(*) into n_charge from public.custom_charges c
    join public.passengers pa on pa.id = c.passenger_id  where pa.season_id = p_season_id;
  select count(*) into n_fgm    from public.financial_group_members m
    join public.passengers pa on pa.id = m.passenger_id  where pa.season_id = p_season_id;
  select count(*) into n_notif  from public.notification_deliveries d
    join public.passengers pa on pa.id = d.passenger_id  where pa.season_id = p_season_id;
  select count(*) into n_push   from public.pilgrim_push_subscriptions s
    join public.passengers pa on pa.id = s.passenger_id  where pa.season_id = p_season_id;
  select count(*) into n_sess   from public.pilgrim_sessions ps
    join public.passengers pa on pa.id = ps.passenger_id where pa.season_id = p_season_id;

  -- الحذف هو الاستثناء الوحيد لـ ث٣: المحفّز يمنع الكتابة على
  -- موسم مقفل، والحذف كتابة. المَنفذ محصور في هذه المعاملة وحدها،
  -- ولا سبيل لفتحه من الواجهة لأن PostgREST لا يمرّر إعدادات جلسة.
  set local app.season_maintenance = 'on';

  -- وراية الإيقاف صفٌّ في جدولٍ لا يبلغه دورٌ تطبيقيّ (B-1) — لا
  -- إعداد جلسة يستطيع أي دور تزويره. تعيش داخل هذه المعاملة وتموت
  -- معها، أُتمّت أم أُجهضت.
  insert into public.audit_suppression (txid) values (txid_current())
    on conflict (txid) do nothing;

  -- الحجاج أولاً: التوابع (الدفعات · الرسوم · التسليمات ·
  -- الاشتراكات · عضويات المجموعات) تسقط بـ on delete cascade
  delete from public.passengers where season_id = p_season_id;
  get diagnostics n_pass = row_count;
  delete from public.rooms where season_id = p_season_id;
  get diagnostics n_rooms = row_count;
  delete from public.camps where season_id = p_season_id;
  get diagnostics n_camps = row_count;
  delete from public.buses where season_id = p_season_id;
  get diagnostics n_buses = row_count;

  -- المفتاح الأجنبي restrict هو شبكة الأمان: لو بقي صفّ موسميّ
  -- في جدول أُضيف لاحقاً ونُسي هنا، يفشل هذا السطر بدل أن يُيتَّم
  delete from public.seasons where id = p_season_id;

  delete from public.audit_suppression where txid = txid_current();
  set local app.season_maintenance = 'off';

  perform public.record_season_event(
    p_actor, 'delete', p_season_id, v_row,
    jsonb_build_object('deleted_counts', jsonb_build_object(
      'passengers', n_pass, 'rooms', n_rooms, 'camps', n_camps, 'buses', n_buses,
      'payments', n_pay, 'custom_charges', n_charge,
      'financial_group_members', n_fgm, 'notification_deliveries', n_notif,
      'pilgrim_push_subscriptions', n_push, 'pilgrim_sessions', n_sess))
  );
end;
$$;

comment on function public.delete_season(bigint, uuid) is
  'يحذف موسماً مقفلاً وكل بياناته في معاملة واحدة، ويكتب صفّ تدقيق ملخّصاً واحداً بالفاعل وبأعداد الأصناف العشرة كاملةً — لا صفّاً لكل سطر ساقط. الموسم المفتوح لا يُحذف.';

revoke execute on function public.close_season(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.delete_season(bigint, uuid)    from public, anon, authenticated;
grant  execute on function public.close_season(text, text, uuid) to service_role;
grant  execute on function public.delete_season(bigint, uuid)    to service_role;


-- ------------------------------------------------------------
-- ١٠) تصحيحا الصلاحيات (ق٧ · D7)
-- ------------------------------------------------------------
-- (أ) **شرطٌ مسبق لا تحسين.** `authenticated` يملك `TRUNCATE` على
--     `user_profiles` — بقيّة `grant all` عند الإنشاء، وهو الجدول
--     الوحيد كذلك. و`TRUNCATE` **لا تخضع لـRLS ولا تُشعل محفّزاً
--     صفّياً**: أي موظّف داخل يستطيع نظرياً محو كل الملفّات **بلا
--     أن يترك أثراً واحداً في السجل**. فهي تتجاوز هدف س٨ نفسه.
--     و`TRIGGER` تتيح له ربط محفّزٍ خاصّ بالجدول.
--     ومُثبَت أن لا مسار عميل ولا دالة حافّية تستعمل أياً منها.
revoke truncate, trigger, references on public.user_profiles from authenticated;

-- (ب) تنظيفٌ مرصود منذ س٤ (البند أ٧ في BACKLOG)، موعده «أول ترحيل
--     يمسّ الصلاحيات» — وهذا هو. دالة محفّز لا تُستدعى مباشرة،
--     وPostgres يرفضها بـ`0A000`، لكن Advisor يرفعها WARN بحقّ:
--     ما لا يُستدعى لا يُترك ممنوحاً.
revoke execute on function public.delete_empty_financial_group() from public, anon, authenticated;
