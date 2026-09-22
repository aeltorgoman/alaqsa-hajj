-- ════════════════════════════════════════════════════════════
-- مِسبارُ توافق التطبيق — **محلّيٌّ فقط**
-- ════════════════════════════════════════════════════════════
-- ⚠️ لا يُشغَّل على البعيد بحال. يُثبت أن المخطَّطَ المبنيَّ من خطّ
-- الأساس يقبل أشكالَ الكتابة التي يقوم عليها التطبيق.
--
-- وكلُّ كتابةٍ هنا داخل معاملةٍ **تُرَدّ**: لا صفَّ يبقى.
-- وليس بديلاً عن E2E يدويّ — يثبت المعمارية لا السلوك.
--
-- ⚠️ وكلُّ مِسبارٍ هنا **يُسقط السكربتَ** إذا كذَب. وكانت المسابيرُ
--    قبلَ هذا تطبعُ `f` وتمضي: فقيمةُ `ok` كانت تُعرَض لا تُلزِم،
--    ولا يُسقط السكربتَ إلا خطأٌ من بوستجرس نفسِه. فصارت كلُّها
--    تمرّ عبر `pg_temp.assert` التي ترفع استثناءً عند الكذب.

\set ON_ERROR_STOP on
\pset tuples_only off

begin;

-- المُلزِمُ: دالّةٌ مؤقّتة، تذهب مع المعاملة المردودة.
create function pg_temp.assert(p_probe text, p_ok boolean) returns text
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'PROBE FAILED: % (got %)', p_probe, coalesce(p_ok::text, 'null')
      using errcode = 'P0001';
  end if;
  return 'PASS  ' || p_probe;
end;
$$;

-- ١) البنية: كلُّ ما يعتمده التطبيق موجود
select pg_temp.assert('tables_present=22', count(*) = 22)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r';

-- ⚠️ لا `max()` على `text[]`: بوستجرس لا يعرّفها، وكان السطرُ
--    يسقط بـ٤٢٨٨٣.
-- ⚠️ ولا دعوى هنا على `security_invoker`: قيمتُه على الحيِّ
--    `false` عن قصد، والمستوى الثاني يقارنُ `VIEW opts=`
--    حرفاً بحرف مع المرجع. فهذا مِسبارُ وجودٍ وقابليةٍ
--    للاستعلام لا مِسبارُ سياسة.
select pg_temp.assert('view_company_profile_public present', count(*) = 1)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v' and c.relname = 'company_profile_public';

-- واستعلامُه يثبتُ أنَّ كلَّ ما يعتمدُ عليه موجودٌ ويُحلَّ.
select pg_temp.assert('view_company_profile_public queryable', count(*) >= 0)
  from public.company_profile_public;

select pg_temp.assert('storage_buckets=2', count(*) = 2) from storage.buckets;

select pg_temp.assert('storage_policies=8', count(*) = 8)
  from pg_policies where schemaname = 'storage' and tablename = 'objects';

select pg_temp.assert('has_permission present', count(*) = 1)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'has_permission';

select pg_temp.assert('pilgrim_sessions RLS enabled', count(*) = 1)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'pilgrim_sessions' and c.relrowsecurity;

-- ٢) سلوكُ سعة الغرف — نقيُّ الأثر، بلا كتابة
select pg_temp.assert('room_type_capacity',
       public.room_type_capacity('ثنائية') = 2
       and public.room_type_capacity('رباعية') = 4
       and public.room_type_capacity('مجلس') = 0
       and public.room_type_capacity('نوعٌ غير معروف') is null);

-- ٣) أشكالُ الكتابة — تُجرَّب ثم تُرَدّ كلُّها
-- ⚠️ وكلُّ إدراجٍ هنا يُسمّي كلَّ عمودٍ تلزمُه القيود: العدمُ
--    الممنوع (NOT NULL) وقيودُ التحقُّق (CHECK) معاً. وكانت
--    المسابيرُ قبلَ هذا تدرجُ الموسمَ وحدَه؛ فكانت تسقطُ على
--    `buses_name_present` وأخواتِها — والخللُ في المِسبار لا في
--    خطِّ الأساس.
savepoint probe_writes;

insert into public.seasons (name, hijri_year) values ('موسم مِسبار', 1490);
select pg_temp.assert('active_season_id', public.active_season_id() is not null);

insert into public.passengers (season_id) values (public.active_season_id());
select pg_temp.assert('passenger_insert', count(*) = 1) from public.passengers;

-- `name` يلزمُه `buses_name_present`، و`capacity` له افتراضٌ ٥٠.
insert into public.buses (name, season_id) values ('باص مِسبار', public.active_season_id());
select pg_temp.assert('bus_insert', count(*) = 1) from public.buses;

-- وهذا يثبتُ الافتراضَ `active_season_id()` على `season_id` نفسَه.
insert into public.buses (name) values ('باص الافتراض');
-- باستعلامٍ قياسيٍّ لا بـ`from`: صفٌّ مفقودٌ مع `from` يعني صفرَ
-- صفوفٍ فلا يُستدعى المُلزِمُ أصلاً — وهذا نجاحٌ كاذب.
select pg_temp.assert('bus_season_default',
       (select season_id from public.buses where name = 'باص الافتراض')
       = public.active_season_id());

-- `gender` و`page_type` لا افتراضَ لهما ولهما مُعجمٌ مغلق.
insert into public.camps (name, gender, page_type, season_id)
  values ('مخيم مِسبار منى', 'ذكر', 'منى', public.active_season_id());
insert into public.camps (name, gender, page_type, season_id)
  values ('مخيم مِسبار عرفة', 'أنثى', 'عرفة', public.active_season_id());
select pg_temp.assert('camp_insert_mina_arafa', count(*) = 2) from public.camps;

-- و`camps_assign_sort_order` مبنيٌّ على الإدراج: نثبتُ أنَّه عمِل.
select pg_temp.assert('camp_sort_order_trigger', count(*) = 2)
  from public.camps where sort_order is not null and sort_order > 0;

-- و`rooms_apply_capacity` يشتقُّ السعةَ من النوع.
insert into public.rooms (number, type, season_id)
  values ('مِسبار-1', 'رباعية', public.active_season_id());
select pg_temp.assert('room_capacity_trigger',
       (select capacity from public.rooms where number = 'مِسبار-1') = 4);

-- `type` لا افتراضَ له، و`flights_identity_present` يلزمُ الاسمَ
-- والتاريخَ والوقتَ غيرَ فارغة.
insert into public.flights (name, date, "time", type, season_id)
  values ('رحلة مِسبار', '1490-12-01', '08:00', 'ذهاب', public.active_season_id());
insert into public.flights (name, date, "time", type, season_id)
  values ('عودة مِسبار', '1490-12-20', '22:00', 'إياب', public.active_season_id());
select pg_temp.assert('flight_insert', count(*) = 2) from public.flights;

insert into public.financial_groups (name) values ('مجموعة مِسبار');
insert into public.payments (passenger_id, amount)
  select id, 1 from public.passengers limit 1;
select pg_temp.assert('finance_shape',
       (select count(*) from public.financial_groups) = 1
       and (select count(*) from public.payments) = 1);

-- `record_audit()` مِنيٌّ على إدراج الدفعات، ويكتبُ في `audit_log`
-- ويقرأ `audit_suppression` و`auth.uid()`: فنجاحُه يثبتُ أنّ
-- الثلاثةَ موجودةٌ في المبنيّ من خطّ الأساس.
select pg_temp.assert('audit_trigger_fired', count(*) >= 1)
  from public.audit_log where table_name = 'payments';

-- `body` ممنوعٌ من العدم ولا افتراضَ له.
insert into public.announcements (body, season_id)
  values ('إعلان مِسبار', public.active_season_id());
select pg_temp.assert('announcement_insert', count(*) = 1) from public.announcements;

rollback to savepoint probe_writes;

-- ٤) لا أثرَ باقٍ
select pg_temp.assert('no_residue',
       (select count(*) from public.passengers) = 0
       and (select count(*) from public.seasons) = 0
       and (select count(*) from public.rooms) = 0
       and (select count(*) from public.buses) = 0
       and (select count(*) from public.camps) = 0
       and (select count(*) from public.flights) = 0
       and (select count(*) from public.financial_groups) = 0
       and (select count(*) from public.payments) = 0
       and (select count(*) from public.announcements) = 0
       and (select count(*) from public.audit_log) = 0);

select 'ALL COMPATIBILITY PROBES PASSED' as result;

rollback;

-- ولا معاملةَ مفتوحة، ولا صفَّ باقٍ: المعاملةُ كلُّها مردودة،
-- ومعها الدالّةُ المؤقّتة.
