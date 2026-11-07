-- ════════════════════════════════════════════════════════════
-- المخيّمُ «الخاص» بلا جنس — قسمٌ مستقلّ في منى وعرفة
-- ════════════════════════════════════════════════════════════
-- منذ 20261107104607 (في المستودع 20261107120000) يقبل الخاصُّ الجنسين، لكنّ
-- `camps.gender` بقي إلزاميّاً فبقي الخاصُّ «مخيّمَ رجال» أو «مخيّمَ نساء» في الاسمِ
-- الفريد وترتيبِ المجموعة. هنا يصير الجنسُ صفةً للمخيّم العاديّ وحده:
--
--   · `type` إلزاميٌّ من مفردتين: «عادي» (الافتراضيّ كما كان) و«خاص».
--   · العاديّ: الجنسُ إلزاميّ «ذكر» أو «أنثى» — كما كان حرفاً.
--     الخاصّ: الجنسُ اختياريّ ولا معنى له؛ الواجهةُ تُنشئه بلا جنس (NULL).
--     وقيمتُه القديمة في الخاصّ القائم تبقى كما هي ولا يقرؤها شيء: مخيّمان
--     خاصّان منها في موسمٍ مقفل، والموسمُ المقفل لا يُعدَّل (`reject_write_closed_season`)
--     — فلا تُفتح بوابةُ الصيانة لأجل قيمةٍ لا أثر لها.
--   · المجموعة = «خاص» للخاصّ، والجنسُ للعاديّ: بها يكون الاسمُ فريداً
--     (`camps_season_page_group_name_uniq` بدل `camps_season_page_gender_name_uniq`)
--     ويُعطى المخيّمُ الجديد ترتيبَه (`camps_assign_sort_order`) ويُفهرَس ترتيبُ المجموعة.
--     فخاصّان باسمٍ واحد في الصفحة نفسها لا يجتمعان وإن اختلف جنسُهما القديم،
--     والعاديّ للرجال والعاديّ للنساء باسمٍ واحد كما كانا.
--   · لا يمسّ القبولَ ولا الحراسة: `assert_camp_admits` (الخاصّ يُعرف بنوعه)
--     و`camps_guard_occupants` (تحويلُ خاصٍّ مأهولٍ إلى عاديّ يُرفض إن خالفه نازل؛
--     والقيدُ هنا يُلزمه بجنسٍ في التحديث نفسه) باقيتان كما هما.
--
-- لا تحديثَ ولا حذفَ لصفوف. والشرطان المسبقان يرفضان الترحيلةَ كلَّها قبل أيّ
-- تغيير: نوعٌ خارج المفردتين، أو خاصّان باسمٍ واحد في الصفحة نفسها.

do $$
begin
  if exists (select 1 from public.camps where type is null or type not in ('عادي', 'خاص')) then
    raise exception 'camps.type outside (عادي, خاص) — fix those rows first; nothing was changed'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.camps where type = 'خاص'
              group by season_id, page_type, btrim(name) having count(*) > 1) then
    raise exception 'two private camps share a name on the same page and season — rename one first; nothing was changed'
      using errcode = 'P0001';
  end if;
end;
$$;

-- النوع: إلزاميٌّ من مفردتين (الافتراضيّ «عادي» باقٍ)
alter table public.camps alter column type set not null;
alter table public.camps add constraint camps_type_vocab check (type in ('عادي', 'خاص'));

-- الجنس: إلزاميٌّ للعاديّ وحده
alter table public.camps alter column gender drop not null;
alter table public.camps drop constraint camps_gender_vocab;
-- ⚠️ `gender is not null` صريحٌ: `NULL in (…)` تُقيَّم NULL، والقيدُ يمرّر NULL —
--    فبدونه يمرّ عاديٌّ بلا جنس.
alter table public.camps add constraint camps_gender_by_type check (
  (type = 'عادي' and gender is not null and gender in ('ذكر', 'أنثى'))
  or (type = 'خاص' and (gender is null or gender in ('ذكر', 'أنثى')))
);

-- الاسمُ فريدٌ في مجموعته: «خاص» للخاصّ، والجنسُ للعاديّ
drop index if exists public.camps_season_page_gender_name_uniq;
create unique index camps_season_page_group_name_uniq on public.camps
  (season_id, page_type, (case when type = 'خاص' then 'خاص' else gender end), btrim(name));

drop index if exists public.idx_camps_group_order;
create index idx_camps_group_order on public.camps
  (season_id, page_type, (case when type = 'خاص' then 'خاص' else gender end), sort_order, id);

-- الترتيبُ الابتدائيّ للمخيّم الجديد: آخرُ مجموعته (الخاصّ كلُّه مجموعةٌ واحدة)
create or replace function public.camps_assign_sort_order()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_group text := case when new.type = 'خاص' then 'خاص' else coalesce(new.gender, '') end;
begin
  if new.sort_order is null or new.sort_order = 0 then
    perform pg_advisory_xact_lock(
      hashtext('camps.sort_order:' || coalesce(new.season_id, 0)::text
               || ':' || coalesce(new.page_type, '') || ':' || v_group)
    );
    select coalesce(max(sort_order), 0) + 10
      into new.sort_order
      from public.camps
     where season_id is not distinct from new.season_id
       and page_type is not distinct from new.page_type
       and (case when type = 'خاص' then 'خاص' else coalesce(gender, '') end) = v_group;
  end if;
  return new;
end;
$$;
