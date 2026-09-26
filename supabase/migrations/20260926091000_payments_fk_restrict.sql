-- ════════════════════════════════════════════════════════════
-- تاريخُ الدفعِ لا يُمحى بحذفِ حاجّ
-- ════════════════════════════════════════════════════════════
-- `payments_passenger_id_fkey` كانت `on delete cascade`، و`deleteP` في
-- الواجهةِ تحذف الحاجَّ **بلا أيِّ فحصٍ ماليّ**. فنقرةٌ واحدةٌ كانت
-- تمحو دفعاتِه وإيصالاتِها، ولا يبقى إلا صفُّ تدقيقٍ بـ`season_id`
-- فارغ — فيسري عليه حدُّ الاحتفاظِ الزمنيُّ (خمسُ سنوات) ثُمّ يُهَذَّب.
-- وقد جرى هذا في الإنتاجِ خمسَ مرّاتٍ فعلاً.
--
-- والعلاجُ `restrict`: لا سطرَ دفعٍ يسقط بالتعاقبِ أبداً. وإزالةُ
-- الحاجِّ تمرّ بدالّةٍ واحدةٍ صريحةٍ مُدقَّقةٍ خلف تحذيرٍ وتأكيد.
--
-- ⚠️ وهذا يُلزم تعديلَ `delete_season` في **نفسِ الملفّ**: هي تحذف
--    الحجّاجَ وتتّكل على التعاقب، فبين الترحيلتين كانت تُكسَر.

-- ── ١) المفتاح: cascade → restrict ───────────────────────────
alter table public.payments drop constraint if exists payments_passenger_id_fkey;
alter table public.payments
  add constraint payments_passenger_id_fkey
  foreign key (passenger_id) references public.passengers(id) on delete restrict;

comment on constraint payments_passenger_id_fkey on public.payments is
  'restrict لا cascade: تاريخُ الدفعِ لا يسقط بحذفِ حاجّ. الإزالةُ عبر remove_passenger_with_history() وحدَها، و`delete_season` تحذف الدفعاتِ صريحاً.';

-- ── ٢) `delete_season` تحذف الدفعاتِ صريحاً قبل الحجّاج ────────
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
  /* ⚠️ الدفعاتُ تُحذف **صريحاً وقبلَ الحجّاج**. كانت تسقط بـ
     `on delete cascade`، وقد صار المفتاحُ `restrict` في هذه الترحيلةِ
     نفسِها حتى لا يمحو حذفُ حاجٍّ تاريخَه الماليَّ صامتاً. فبغير هذا
     السطرِ يفشل حذفُ الحجّاجِ أدناه.
     وصفوفُ `payment_receipts` **لا تُحذف**: لا مفتاحَ أجنبيّاً لها،
     و`payments.receipt_id` بـ`restrict` يحمي الأبَ لا الابن. فتبقى
     الإيصالاتُ وأرقامُها بعد ذهابِ الموسمِ كلِّه. */
  delete from public.payments p
   using public.passengers pa
   where pa.id = p.passenger_id and pa.season_id = p_season_id;
  get diagnostics n_pay = row_count;

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

-- ── ٣) إزالةُ الحاجِّ مع حفظِ تاريخِ الإيصالات ──────────────────
-- المسارُ الوحيدُ لإخراجِ حاجٍّ له دفعات. وما يبقى بعدَها:
--   · صفُّ الإيصالِ كاملاً — رقمُه وإجماليُّه التاريخيُّ ولقطتُه
--   · وإيصالُ المجموعةِ لا يتغيّر إجماليُّه، ولا تُمَسّ سطورُ رفاقِه
-- وما يزول: سطرُ توزيعِ هذا الحاجِّ وحدَه — ووظيفتُه الرصيدُ الحيُّ،
-- ولا رصيدَ لحاجٍّ أُزيل.
--
-- ولا يُعاد حسابُ `total_amount` من السطورِ الباقيةِ بحال: هو المبلغُ
-- الذي استُلم فعلاً، ونقصانُ سطرٍ لا يُغيّر ما استُلم.
create or replace function public.remove_passenger_with_history(
  p_passenger_id bigint
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_season   bigint;
  v_closed   timestamptz;
  v_name     text;
  v_n_pay    integer;
  v_total    numeric(10,2);
  v_receipts integer;
begin
  if not public.has_permission('manage_payments') then
    raise exception 'لا تملك صلاحية إدارة الحسابات المالية.' using errcode = 'P0001';
  end if;

  select p.season_id, p.name_ar, s.closed_at
    into v_season, v_name, v_closed
    from public.passengers p join public.seasons s on s.id = p.season_id
   where p.id = p_passenger_id
     for update of p;

  if v_season is null then
    raise exception 'لا يوجد حاجٌّ بالمعرّف %.', p_passenger_id using errcode = 'P0001';
  end if;
  -- قاعدةُ الموسمِ المقفل. والمحفِّزاتُ تفرضها أيضاً، لكنّ الرسالةَ
  -- هنا أوضحُ من رسالةِ حارسٍ عامّ.
  if v_closed is not null then
    raise exception 'الحاجُّ يتبع موسماً مقفلاً — لا يُزال.' using errcode = 'P0001';
  end if;

  select count(*), coalesce(sum(amount), 0), count(distinct receipt_id)
    into v_n_pay, v_total, v_receipts
    from public.payments where passenger_id = p_passenger_id;

  -- سطورُ التوزيعِ وحدَها. ولا تُمَسّ `payment_receipts` بحرف.
  delete from public.payments where passenger_id = p_passenger_id;
  delete from public.passengers where id = p_passenger_id;

  return jsonb_build_object(
    'passenger_id',        p_passenger_id,
    'name',                v_name,
    'allocations_removed', v_n_pay,
    'amount_removed',      v_total,
    'receipts_touched',    v_receipts
  );
end;
$fn$;

alter function public.remove_passenger_with_history(bigint) owner to postgres;
revoke execute on function public.remove_passenger_with_history(bigint) from public, anon;
grant  execute on function public.remove_passenger_with_history(bigint) to authenticated, service_role;

-- ── ٤) شرطٌ لاحق ─────────────────────────────────────────────
do $chk$
declare v_rule text; v_n integer;
begin
  select confdeltype into v_rule from pg_constraint where conname = 'payments_passenger_id_fkey';
  if v_rule is null then
    raise exception 'المفتاحُ الأجنبيُّ اختفى.' using errcode = 'P0001';
  end if;
  -- 'r' = RESTRICT · 'c' = CASCADE
  if v_rule <> 'r' then
    raise exception 'قاعدةُ الحذفِ % لا restrict.', v_rule using errcode = 'P0001';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='remove_passenger_with_history') then
    raise exception 'دالّةُ الإزالةِ لم تُركَّب.' using errcode = 'P0001';
  end if;

  -- و`delete_season` تحمل الحذفَ الصريحَ للدفعات، وإلا كُسِرت
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='delete_season'
         and p.prosrc like '%delete from public.payments p%') <> 1 then
    raise exception 'delete_season لا تحذف الدفعاتِ صريحاً — ستُكسَر مع restrict.'
      using errcode = 'P0001';
  end if;

  -- والأصنافُ ما زالت ثلاثةَ عشرَ في صفِّ التدقيق
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='delete_season' and p.prosrc like '%deleted_counts%';
  if v_n <> 1 then
    raise exception 'delete_season فقدت صفَّ التدقيقِ الملخّص.' using errcode = 'P0001';
  end if;
end;
$chk$;
