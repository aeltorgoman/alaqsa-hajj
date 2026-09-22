-- ════════════════════════════════════════════════════════════
-- تمهيدُ الصلاحيات — يُطبَّق **قبل** إنشاء أيّ كائن
-- ════════════════════════════════════════════════════════════
-- هذا أوّلُ ما يُنفَّذ من خطّ الأساس، ولا يجوز تأخيرُه بحال.
--
-- العلّة (الجولة ٦): نسخةُ سوبابيس المحلّيّة تُنشَأ وفيها صلاحياتٌ
-- افتراضيّةٌ يملكها `postgres` على `public` تمنح **كلَّ شيء**
-- لـ`anon` و`authenticated` و`service_role`. فكلُّ جدولٍ وتسلسلٍ
-- ودالّةٍ يُنشئها خطُّ الأساس **يرث** تلك الصلاحيات لحظةَ الإنشاء.
-- ثمّ تأتي مِنَحُ المستخرَج (`GRANT SELECT …`) فلا تضيف شيئاً:
-- المِنحةُ توسّع ولا تضيّق. فخرجت القاعدةُ المبنيّةُ **أوسعَ**
-- من الحيّة: `anon` يملك كلَّ شيءٍ على ٢٣ علاقة — ومنها
-- `audit_log` و`audit_suppression` — والحيُّ لا يمنحه إلا
-- قراءتَين اثنتين.
--
-- والمشروعُ الحيُّ لا يملك صلاحياتٍ افتراضيّةً لـ`anon` على
-- `public` أصلاً (تُحقَّق قراءةً من `pg_default_acl`).
--
-- ولمَ لا يكفي ما يُخرجه `pg_dump` نفسُه؟ لأنّ `pg_dump` يُصدر
-- `ALTER DEFAULT PRIVILEGES` **بعد** `CREATE TABLE` — أُثبت ذلك
-- تجريبيّاً على عنقودٍ محلّيّ: الإنشاء في السطر ٤٥ والصلاحياتُ
-- الافتراضيّةُ في السطر ١٠٩. فهي تصحّح المستقبلَ ولا ترجع على
-- ما مضى. ولذلك يلزم تحييدُها **قبل** كلّ شيء.
--
-- والإبطالُ هنا لا «يكتم» مِنحةً: يُعيد البيئةَ إلى الحياد فيرث
-- كلُّ كائنٍ لا شيء، ثمّ تُقرّر مِنَحُ المستخرَج وحدَها — وهي
-- كاملةٌ لأنّ `pg_dump` يكتب الصلاحيةَ كاملةً لا فرقاً.
--
-- ⚠️ ولا يُمَسُّ `postgres` (المالك) ولا `PUBLIC`: الأوّلُ مالكٌ
--    ضمناً، والثاني افتراضٌ مُدمَجٌ في بوستجرس نفسِه يطابق الحيّ.

-- شرطٌ مسبَق: الأدوارُ الثلاثةُ موجودة. وغيابُها يعني أنّ الهدفَ
-- ليس نسخةَ سوبابيس، فيسقط الأمرُ صراحةً لا ضمناً.
do $$
declare missing text;
begin
  select string_agg(r, ', ' order by r) into missing
    from unnest(array['anon','authenticated','service_role']) r
   where not exists (select 1 from pg_catalog.pg_roles where rolname = r);
  if missing is not null then
    raise exception 'خطُّ الأساس يلزمُه أدوارُ سوبابيس، وهذه مفقودة: %', missing
      using errcode = 'P0001';
  end if;
end;
$$;

alter default privileges for role postgres in schema public
  revoke all on tables    from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on types     from anon, authenticated, service_role;

-- وبعد هذا: لا صلاحيةَ افتراضيّةً يملكها `postgres` على `public`
-- لهذه الأدوار. يُتحقَّق منه في سير العمل بخطوةٍ مستقلّة.
