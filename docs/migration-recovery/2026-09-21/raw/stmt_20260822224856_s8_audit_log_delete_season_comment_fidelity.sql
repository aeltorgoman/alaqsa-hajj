-- Restores public.delete_season to the byte-exact body of the reviewed
-- artifact (PR #103, migration sha256 eaa6311c…). The previously applied
-- body was functionally identical — code-only fingerprint matched exactly —
-- but omitted 11 explanatory comment lines (M-2 ten-category rationale and
-- the B-1 suppression-marker rationale). No behavioural change.

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

revoke execute on function public.delete_season(bigint, uuid) from public, anon, authenticated;
grant  execute on function public.delete_season(bigint, uuid) to service_role;