-- ═══════════════════════════════════════════════════════════════════
-- version : 20261101120000
-- name    : passengers_document_uniqueness_per_season
-- ═══════════════════════════════════════════════════════════════════
--
-- رقمُ الجواز ورقمُ الهوية لا يتكرّران داخل الموسم الواحد — تفرضه القاعدة لا الواجهة.
--
-- كان المنعُ في الواجهة وحدها: يقارن بقائمة حجّاج الموسم المحمَّلة في المتصفّح. فلا
-- يمنع موظّفَين يحفظان الرقمَ نفسه معاً، ولا طلبَ حفظٍ أُعيد، ولا كتابةً لا تمرّ بالواجهة.
-- وليس على `passengers` قيدُ تفرّدٍ لأيٍّ منهما.
--
--   · لكلّ موسمٍ مستقلّ (`season_id` في الفهرس): حاجُّ موسمٍ سابق يُسجَّل في الحالي جديداً،
--     ولا يُمسّ صفٌّ تاريخيّ.
--   · التطبيعُ هو نفسُه في الواجهة (`normalizeDocNumber` في src/utils/pilgrimMatch.ts):
--     حذفُ الفراغات، والأرقامُ العربيّة الهنديّة إلى لاتينيّة، والحروفُ كبيرة. لا شرطات
--     تُحذف ولا أصفار — فلا يندمج رقمان مختلفان.
--   · الفارغُ وnull خارج الفهرس (فهرسٌ جزئيّ): صفوفٌ كثيرة بلا رقمٍ بعد.
--   · لا يُحذف صفٌّ ولا يُدمج ولا يُعاد كتابته. وإن وُجد تكرارٌ قائمٌ في موسمٍ ما رُفضت
--     الترحيلةُ كلُّها (شرطٌ مسبق) ليُراجَع يدوياً.
--
-- التراجع: ترحيلةٌ لاحقة تحذف الفهرسين (M-44).

-- ── شرطٌ مسبق: لا تكرارَ قائماً ─────────────────────────────────────
do $pre$
declare v_passport int; v_national int;
begin
  select count(*) into v_passport from (
    select 1 from public.passengers
     where regexp_replace(passport, '\s', '', 'g') <> ''
     group by season_id, upper(translate(regexp_replace(passport, '\s', '', 'g'), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))
    having count(*) > 1) d;
  select count(*) into v_national from (
    select 1 from public.passengers
     where regexp_replace(national_id, '\s', '', 'g') <> ''
     group by season_id, upper(translate(regexp_replace(national_id, '\s', '', 'g'), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))
    having count(*) > 1) d;
  if v_passport > 0 or v_national > 0 then
    raise exception 'passengers: % passport number(s) and % national id(s) are duplicated within a season — resolve them manually; nothing was changed.',
      v_passport, v_national using errcode = '23505';
  end if;
end
$pre$;

-- ── الفهرسان ─────────────────────────────────────────────────────────
create unique index passengers_season_passport_uniq on public.passengers
  (season_id, (upper(translate(regexp_replace(passport, '\s', '', 'g'), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))))
  where regexp_replace(passport, '\s', '', 'g') <> '';

create unique index passengers_season_national_id_uniq on public.passengers
  (season_id, (upper(translate(regexp_replace(national_id, '\s', '', 'g'), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))))
  where regexp_replace(national_id, '\s', '', 'g') <> '';

comment on index public.passengers_season_passport_uniq is
  'رقم الجواز فريدٌ في الموسم بعد التطبيع (بلا فراغات، أرقام لاتينيّة، حروف كبيرة). الفارغ خارج الفهرس.';
comment on index public.passengers_season_national_id_uniq is
  'رقم الهوية فريدٌ في الموسم بعد التطبيع (بلا فراغات، أرقام لاتينيّة، حروف كبيرة). الفارغ خارج الفهرس.';

-- ── شروطٌ لاحقة (S-38) ───────────────────────────────────────────────
do $post$
declare v_name text;
begin
  foreach v_name in array array['passengers_season_passport_uniq', 'passengers_season_national_id_uniq'] loop
    if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                    where c.relname = v_name and c.relnamespace = 'public'::regnamespace
                      and i.indrelid = 'public.passengers'::regclass
                      and i.indisunique and i.indisvalid and i.indpred is not null) then
      raise exception 'index % is missing, not unique, not valid or not partial', v_name using errcode = 'P0001';
    end if;
  end loop;
end
$post$;
