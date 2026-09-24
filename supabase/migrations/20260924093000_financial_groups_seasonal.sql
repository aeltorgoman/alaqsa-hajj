-- ════════════════════════════════════════════════════════════
-- م٧/٣ و م٧/٤ — المجموعة المالية كيانٌ موسميٌّ من الدرجة الأولى
-- ════════════════════════════════════════════════════════════
-- §٤ من #42 صنّفت `financial_groups` في عمود «يُشتقّ»، على أن
-- يُشتقَّ موسمُها من أعضائها. وقواعدُ التشغيل (ت٥ · §٤/٣) نقضت ذلك
-- صراحةً وجعلته بند م٧ الثالث، لأن الاشتقاق **لا يُنتج حارساً**:
--
--   · `trg_reject_closed_season` يقرأ `season_id` من الصفّ نفسه،
--     و`..._derived` يقرؤه عبر `passenger_id`. و`financial_groups`
--     لا تملك أيّاً منهما — فبقيت الجدولَ الوحيد بلا حارسٍ بحال.
--     وهي **الثغرة الوحيدة الباقية في ث٣** بنصّ الـIssue.
--
--   · والثغرةُ اليوم مأهولة لا نظرية: الموسم ٩ أُقفل في
--     2026-09-21، ومجموعاتُه الثلاث (٤ · ٥ · ٦) قابلةٌ للتسمية
--     والحذف بلا مانعٍ في القاعدة. الحارسُ الوحيد ترشيحٌ في
--     `FinancePage`، وواجهةٌ ليست حارساً.
--
-- فتصير المجموعةُ موسميةً بالتخزين كالحاجّ والباص والمخيّم والغرفة
-- والرحلة والتنبيه، وتُحمى بالحارس المعتمَد نفسِه.
--
-- ⚠️ ولا يمسّ هذا RLS ولا الصلاحيات ولا `close_season()`:
--    الموسمُ الجديد يبدأ بمجموعاتٍ جديدة، ومجموعةُ موسمٍ مضى لا
--    تُعاد — وهو ما تفعله الدالّةُ اليوم بلا تعديل، إذ لا تنسخ
--    الأماكنَ ولا المجموعات.

-- ── ١) العمود — نُضيفه فارغاً أولاً ليُملأ ثم يُقيَّد ────────
alter table public.financial_groups
  add column if not exists season_id bigint;

-- ── ٢) الامتناع قبل التعبئة: بياناتٌ لا تُشتقّ لا تُخمَّن ──────
do $$
declare
  v_mixed integer;
  v_empty integer;
  v_ids   text;
begin
  -- مجموعةٌ بأعضاءٍ من موسمين لا موسمَ لها، ولا يجوز اختيارُ أحدهما
  select count(*), string_agg(t.group_id::text, ', ')
    into v_mixed, v_ids
    from (select m.group_id
            from public.financial_group_members m
            join public.passengers p on p.id = m.passenger_id
           group by m.group_id
          having count(distinct p.season_id) > 1) t;
  if v_mixed > 0 then
    raise exception 'مجموعاتٌ ماليةٌ تضمّ أعضاءً من أكثر من موسم (%): لا يُشتقّ لها موسمٌ واحد. عالِجها يدوياً قبل هذه الترحيلة.', v_ids
      using errcode = 'P0001';
  end if;

  -- ومجموعةٌ بلا أعضاء لا يُشتقّ موسمُها بحال. ولا تُسنَد إلى
  -- الموسم النشط اعتباطاً: قد تكون من موسمٍ مضى. والبنيةُ لا
  -- تُنتجها أصلاً — `trg_delete_empty_financial_group` يحذف
  -- المجموعةَ فور خروج آخر عضو، و`create_financial_group_with_member`
  -- تُنشئ المجموعةَ وأولَ عضوٍ في معاملةٍ واحدة. فوجودُها شذوذٌ
  -- يستحقّ وقفةً لا تخميناً.
  select count(*), string_agg(g.id::text, ', ') into v_empty, v_ids
    from public.financial_groups g
   where g.season_id is null
     and not exists (select 1 from public.financial_group_members m where m.group_id = g.id);
  if v_empty > 0 then
    raise exception 'مجموعاتٌ ماليةٌ بلا أعضاء (%): لا يُشتقّ لها موسم. احذفها أو أضف أعضاءها قبل هذه الترحيلة.', v_ids
      using errcode = 'P0001';
  end if;
end;
$$;

-- ── ٣) التعبئة — من الأعضاء وحدهم، وبموسمٍ واحدٍ مؤكَّد ───────
update public.financial_groups g
   set season_id = t.season_id
  from (select m.group_id, min(p.season_id) as season_id
          from public.financial_group_members m
          join public.passengers p on p.id = m.passenger_id
         group by m.group_id
        having count(distinct p.season_id) = 1) t
 where t.group_id = g.id
   and g.season_id is null;

-- ── ٤) شرطٌ لاحق على التعبئة قبل التقييد ────────────────────
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.financial_groups where season_id is null;
  if v_n > 0 then
    raise exception 'بقيت % مجموعةً ماليةً بلا موسم بعد التعبئة.', v_n using errcode = 'P0001';
  end if;
end;
$$;

-- ── ٥) التقييد — على منوال الجداول الموسمية الستّة ──────────
alter table public.financial_groups
  alter column season_id set default public.active_season_id();

alter table public.financial_groups
  alter column season_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'financial_groups_season_id_fkey') then
    alter table public.financial_groups
      add constraint financial_groups_season_id_fkey
      foreign key (season_id) references public.seasons(id) on delete restrict;
  end if;
end;
$$;

create index if not exists financial_groups_season_id_idx
  on public.financial_groups (season_id);

-- ── ٦) ث٣ — الحارس المعتمَد نفسُه، بلا نسخةٍ خاصّة ───────────
-- `reject_write_closed_season` يحترم `app.season_maintenance`،
-- و`delete_season()` وحدها تفتحها، وPostgREST لا يمرّر إعدادات
-- الجلسة — فلا سبيل إلى فتحها من التطبيق.
create or replace trigger trg_reject_closed_season
  before insert or update or delete on public.financial_groups
  for each row execute function public.reject_write_closed_season();

-- ── ٧) اتّساق العضوية — الطرف الابن ─────────────────────────
-- عضويةٌ تربط حاجّاً بمجموعةٍ من موسمٍ آخر تُفسد الاشتقاقَ الماليّ
-- كلَّه: الدفعاتُ والرسومُ تُشتقّ من الحاجّ، والمجموعةُ تجمعها.
create or replace function public.reject_cross_season_group_member()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_group_season bigint;
  v_pass_season  bigint;
  v_group_name   text;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.group_id     is not distinct from old.group_id
     and new.passenger_id is not distinct from old.passenger_id then
    return new;
  end if;

  select g.season_id, g.name into v_group_season, v_group_name
    from public.financial_groups g where g.id = new.group_id;
  if not found then
    raise exception 'المجموعة المالية % غير موجودة.', new.group_id using errcode = 'P0001';
  end if;

  select p.season_id into v_pass_season
    from public.passengers p where p.id = new.passenger_id;
  if not found then
    raise exception 'الحاجّ % غير موجود.', new.passenger_id using errcode = 'P0001';
  end if;

  if v_group_season <> v_pass_season then
    raise exception 'المجموعة المالية «%» تتبع موسماً آخر — لا يُضمّ حاجّ إلى مجموعةٍ خارج موسمه.',
      coalesce(v_group_name, new.group_id::text)
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

alter function public.reject_cross_season_group_member() owner to postgres;
revoke execute on function public.reject_cross_season_group_member() from public, anon, authenticated;

create or replace trigger trg_reject_cross_season_group_member
  before insert or update of group_id, passenger_id on public.financial_group_members
  for each row execute function public.reject_cross_season_group_member();

-- ── ٨) اتّساق العضوية — طرفا الأبوين ────────────────────────
-- تحويلُ موسمِ المجموعة وفيها أعضاء، أو موسمِ حاجٍّ وهو في مجموعة،
-- يكسر الثابتَ من الخلف. ونظيرُهما المعتمَد
-- `rooms_reject_season_change_with_occupants`.
create or replace function public.financial_groups_reject_season_change_with_members()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_n integer;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  if tg_op <> 'UPDATE' or new.season_id is not distinct from old.season_id then
    return new;
  end if;

  select count(*) into v_n
    from public.financial_group_members m where m.group_id = new.id;

  if v_n > 0 then
    raise exception 'المجموعة المالية «%» تضمّ % عضواً، فلا يُحوَّل موسمُها. أخرِج الأعضاء أولاً.',
      coalesce(new.name, new.id::text), v_n
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

alter function public.financial_groups_reject_season_change_with_members() owner to postgres;
revoke execute on function public.financial_groups_reject_season_change_with_members() from public, anon, authenticated;

create or replace trigger trg_financial_groups_reject_season_change
  before update of season_id on public.financial_groups
  for each row execute function public.financial_groups_reject_season_change_with_members();

create or replace function public.passengers_reject_season_change_in_group()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_group_name text;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return new;
  end if;

  if tg_op <> 'UPDATE' or new.season_id is not distinct from old.season_id then
    return new;
  end if;

  select g.name into v_group_name
    from public.financial_group_members m
    join public.financial_groups g on g.id = m.group_id
   where m.passenger_id = new.id
     and g.season_id <> new.season_id
   limit 1;

  if found then
    raise exception 'الحاجّ عضوٌ في المجموعة المالية «%» — أخرِجه منها قبل تحويل موسمه.',
      v_group_name using errcode = 'P0001';
  end if;

  return new;
end;
$$;

alter function public.passengers_reject_season_change_in_group() owner to postgres;
revoke execute on function public.passengers_reject_season_change_in_group() from public, anon, authenticated;

create or replace trigger trg_passengers_reject_season_change_in_group
  before update of season_id on public.passengers
  for each row execute function public.passengers_reject_season_change_in_group();

-- ── ٩) دورةُ الحياة — `delete_season()` لا بدّ أن تُصرِّف الجدول ─
-- المفتاحُ الأجنبيُّ `restrict` شبكةُ الأمان الموصوفة في الدالّة
-- نفسِها: صفٌّ موسميٌّ في جدولٍ لم تُصرِّفه الدالّةُ يُفشل السطرَ
-- الأخير بدل أن يُيتَّم. وبعد هذه الترحيلة صارت `financial_groups`
-- من تلك الجداول — فتُصرَّف صراحةً.
--
-- وعملياً يُصرِّفها الحجّاجُ أنفسُهم: حذفُهم يُسقط العضوياتِ
-- بـ`on delete cascade`، ويحذف `trg_delete_empty_financial_group`
-- المجموعةَ فور خلوّها. فهذا السطرُ يُرجع صفراً في الحالة السويّة،
-- وهو المقصود: شبكةُ أمانٍ لا مسارٌ رئيسيّ.
create or replace function public.delete_season(p_season_id bigint, p_actor uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_closed timestamptz;
  v_name   text;
  v_row    jsonb;
  n_pass   bigint;
  n_rooms  bigint;
  n_camps  bigint;
  n_buses  bigint;
  n_flight bigint;
  n_ann    bigint;
  n_pay    bigint;
  n_charge bigint;
  n_fgm    bigint;
  n_fg     bigint;
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
  -- والأصنافُ **الثلاثةَ عشرَ كاملة** بعد م٧: سبعةٌ تُحذف بالموسم
  -- مباشرةً — أربعةٌ من م١ والرحلاتُ والتنبيهاتُ والمجموعاتُ
  -- المالية — وستّةٌ تسقط بـ`on delete cascade` من `passengers`.
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

  /* م٧ — بعد الحجّاج لا قبلهم: الحاجّ يشير إلى رحلته، فحذف
     الرحلة أولاً كان يصطدم بحارس الإسناد. والتنبيهات تسقط معها
     `notification_deliveries` بـ`on delete cascade`، وقد عُدّت
     أعلاه من جهة الحاجّ — وهي الجهة نفسها إذ الطرفان في الموسم. */
  delete from public.flights where season_id = p_season_id;
  get diagnostics n_flight = row_count;
  delete from public.announcements where season_id = p_season_id;
  get diagnostics n_ann = row_count;

  /* م٧/٣ — وبعد الحجّاج كذلك: عضوياتُهم سقطت معهم، فخلت المجموعاتُ
     وحذفها محفّزُ الخلوّ. ويبقى هذا السطرُ شبكةَ أمانٍ لمجموعةٍ
     نجت من ذلك المسار، فلا يُفشلها المفتاحُ الأجنبيُّ `restrict`. */
  delete from public.financial_groups where season_id = p_season_id;
  get diagnostics n_fg = row_count;

  -- المفتاح الأجنبي restrict هو شبكة الأمان: لو بقي صفّ موسميّ
  -- في جدول أُضيف لاحقاً ونُسي هنا، يفشل هذا السطر بدل أن يُيتَّم
  delete from public.seasons where id = p_season_id;

  delete from public.audit_suppression where txid = txid_current();
  set local app.season_maintenance = 'off';

  perform public.record_season_event(
    p_actor, 'delete', p_season_id, v_row,
    jsonb_build_object('deleted_counts', jsonb_build_object(
      'passengers', n_pass, 'rooms', n_rooms, 'camps', n_camps, 'buses', n_buses,
      'flights', n_flight, 'announcements', n_ann,
      'financial_groups', n_fg,
      'payments', n_pay, 'custom_charges', n_charge,
      'financial_group_members', n_fgm, 'notification_deliveries', n_notif,
      'pilgrim_push_subscriptions', n_push, 'pilgrim_sessions', n_sess))
  );
end;
$$;

-- ── ١٠) شرطٌ لاحق: البنية كما قُصدت ─────────────────────────
do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
     and ((c.relname = 'financial_groups'        and t.tgname in ('trg_reject_closed_season','trg_financial_groups_reject_season_change'))
       or (c.relname = 'financial_group_members' and t.tgname = 'trg_reject_cross_season_group_member')
       or (c.relname = 'passengers'              and t.tgname = 'trg_passengers_reject_season_change_in_group'));
  if v_n <> 4 then
    raise exception 'الحرّاس لم يُركَّبوا كما يجب: وُجد % من ٤.', v_n using errcode = 'P0001';
  end if;

  if exists (select 1 from public.financial_groups where season_id is null) then
    raise exception 'بقيت مجموعةٌ ماليةٌ بلا موسم.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'financial_groups_season_id_fkey') then
    raise exception 'المفتاح الأجنبي للموسم غير موجود.' using errcode = 'P0001';
  end if;
end;
$$;
