-- ════════════════════════════════════════════════════════════
-- MOD-001 / PR 1 — أساسُ تعدّد الفنادق في الموسم (إضافيٌّ محض)
-- ════════════════════════════════════════════════════════════
-- كان «الفندق» ثلاثةَ أعمدةٍ في صفّ الموسم (`seasons.hotel_*`)، والغرفُ
-- تتبع الموسمَ مباشرةً. وهذه الترحيلةُ تُضيف الكيانَ ولا تُبدّل سلوكاً:
--
--   ١) `hotels` — جدولٌ موسميٌّ بحارس ث٣ المعتمَد نفسِه.
--   ٢) `hotel_package_prices` — سعرُ الباقة الأساسيّ لكلّ فندق، بصلاحية
--      `manage_payments` نفسِها التي تحرس `pricing_settings`.
--   ٣) `rooms.hotel_id` و`passengers.requested_hotel_id` — **فارغان
--      مسموحان** في هذه المرحلة، بمفتاحٍ أجنبيٍّ **مركّب** على
--      `(id, season_id)` فلا يُشير صفٌّ إلى فندقِ موسمٍ آخر بحال، ولا
--      يُنقَل فندقٌ إلى موسمٍ آخر وله توابع (M-86 من الطرفين، بالقيد
--      لا بالمحفّز).
--   ٤) تفرّدُ الغرفة داخل الفندق `(hotel_id, floor, number)` — **بجانب**
--      `rooms_season_floor_number_uniq` القائم لا بدلاً منه. القديمُ
--      يُسقَط في ترحيلة التشديد بعد الإطلاق.
--   ٥) تعبئةٌ افتراضيةٌ **مؤقّتة**: حين يُدرَج صفٌّ بلا فندق والموسمُ
--      فيه فندقٌ واحدٌ بالضبط، يُسنَد إليه. هذا ما يُبقي الواجهةَ
--      الحالية تعمل على المخطّط الجديد. ولا تعبئةَ عند صفرٍ أو أكثر
--      من فندق — الغموضُ لا يُخمَّن. تُزال في ترحيلة التشديد.
--   ٦) `delete_season()` تُصرِّف الفنادقَ بعد الحجّاج والغرف، وتعدّها.
--
-- ⚠️ لا يمسّ هذا أيَّ صفٍّ قائم: لا تعبئةَ ولا تعديلَ ولا حذف. تعبئةُ
--    الفنادق للمواسم القائمة ترحيلةٌ مستقلّة (PR 2).
-- ⚠️ ولا يمسّ RLS على `rooms` أو `passengers`، ولا `close_season()`:
--    الموسمُ الجديد يبدأ بلا فنادق كما يبدأ بلا غرف.

-- ── ١) الفنادق ───────────────────────────────────────────────
create table if not exists public.hotels (
  id          bigint generated always as identity primary key,
  season_id   bigint not null default public.active_season_id(),
  city        text   not null default 'مكة',
  name        text   not null,
  address     text,
  map_url     text,
  notes       text,
  sort_order  integer,
  created_at  timestamptz not null default now(),
  constraint hotels_season_id_fkey
    foreign key (season_id) references public.seasons(id) on delete restrict,
  -- المدينةُ مفردةٌ معتمَدة. والمدينةُ المنوّرةُ لاحقاً توسيعٌ لهذا القيد وحده.
  constraint hotels_city_vocab    check (city in ('مكة')),
  constraint hotels_name_present  check (btrim(name) <> ''),
  -- الرابطُ يُعرَض للحاجّ ويُفتح: لا يُقبل إلا http(s).
  constraint hotels_map_url_http  check (map_url is null or map_url ~* '^https?://'),
  -- هدفُ المفاتيح المركّبة: يجعل «الفندق في الموسم» قابلاً للإشارة.
  constraint hotels_id_season_key unique (id, season_id)
);

-- D5 — الاسمُ فريدٌ في الموسم، ولا يفرّق بينهما مسافةٌ زائدة.
create unique index if not exists hotels_season_name_uniq
  on public.hotels (season_id, btrim(name));

comment on table public.hotels is
  'MOD-001 — فنادقُ الموسم. موسميٌّ بالتخزين ومحروسٌ بـ trg_reject_closed_season. الحذفُ لا يمرّ من PostgREST (لا سياسةَ حذف) — يمرّ بدالّةٍ ذرّيّةٍ تفحص الإسنادَ والطلب.';
comment on column public.hotels.city is 'المدينة — «مكة» وحدها اليوم. توسيعُ القيد hotels_city_vocab هو بابُ المدينة المنوّرة.';

alter table public.hotels owner to postgres;
alter table public.hotels enable row level security;

create policy hotels_select on public.hotels
  for select to authenticated using (public.is_active_employee());
create policy hotels_insert on public.hotels
  for insert to authenticated with check (public.has_permission('manage_hotel'));
create policy hotels_update on public.hotels
  for update to authenticated
  using (public.has_permission('manage_hotel'))
  with check (public.has_permission('manage_hotel'));
-- ⚠️ لا سياسةَ حذف عمداً (D3): حذفُ فندقٍ بغرفه الفارغة عمليةٌ ذرّيّةٌ
--    تفحص الإسنادَ والطلبَ معاً، وتأتي دالّةً في PR 3.

revoke all on table public.hotels from public, anon, authenticated;
grant select, insert, update on table public.hotels to authenticated;
grant all on table public.hotels to service_role;

create or replace trigger trg_reject_closed_season
  before insert or update or delete on public.hotels
  for each row execute function public.reject_write_closed_season();

-- ── ٢) أسعارُ الباقات لكلّ فندق ──────────────────────────────
-- غيابُ الصفّ = سعرٌ أساسيٌّ صفر (D6)، ولا رجوعَ إلى `pricing_settings`.
-- و`season_id` مخزَّنٌ ليقرأه حارسُ ث٣ من الصفّ نفسه، والمفتاحُ المركّب
-- يمنع أن يخالف موسمَ فندقه.
create table if not exists public.hotel_package_prices (
  hotel_id     bigint not null,
  season_id    bigint not null default public.active_season_id(),
  package_key  text   not null,
  amount       numeric(10,2) not null,
  updated_at   timestamptz not null default now(),
  constraint hotel_package_prices_pkey primary key (hotel_id, package_key),
  constraint hotel_package_prices_hotel_season_fkey
    foreign key (hotel_id, season_id) references public.hotels(id, season_id)
    on update restrict on delete cascade,
  -- مفاتيحُ الباقات الأربعة نفسُها في `pricing_settings`.
  constraint hotel_package_prices_key_vocab check (
    package_key in ('package_double', 'package_triple', 'package_quad', 'package_suite')),
  constraint hotel_package_prices_amount_nonneg check (amount >= 0)
);

comment on table public.hotel_package_prices is
  'MOD-001 — سعرُ الباقة الأساسيّ لكلّ فندق. غيابُ الصفّ يعني صفراً ولا رجوعَ إلى pricing_settings. الكتابةُ manage_payments كأسعار الشركة.';

alter table public.hotel_package_prices owner to postgres;
alter table public.hotel_package_prices enable row level security;

create policy hotel_package_prices_select on public.hotel_package_prices
  for select to authenticated using (public.is_active_employee());
create policy hotel_package_prices_insert on public.hotel_package_prices
  for insert to authenticated with check (public.has_permission('manage_payments'));
create policy hotel_package_prices_update on public.hotel_package_prices
  for update to authenticated
  using (public.has_permission('manage_payments'))
  with check (public.has_permission('manage_payments'));
create policy hotel_package_prices_delete on public.hotel_package_prices
  for delete to authenticated using (public.has_permission('manage_payments'));

revoke all on table public.hotel_package_prices from public, anon, authenticated;
grant select, insert, update, delete on table public.hotel_package_prices to authenticated;
grant all on table public.hotel_package_prices to service_role;

create index if not exists hotel_package_prices_season_id_idx
  on public.hotel_package_prices (season_id);

create or replace trigger trg_reject_closed_season
  before insert or update or delete on public.hotel_package_prices
  for each row execute function public.reject_write_closed_season();

-- ── ٣) الغرفة ← الفندق (فارغٌ مسموحٌ في هذه المرحلة) ───────────
alter table public.rooms add column if not exists hotel_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_hotel_season_fkey') then
    -- MATCH SIMPLE: `hotel_id` الفارغ لا يُفحص — وهذا مقصود حتى التشديد.
    alter table public.rooms
      add constraint rooms_hotel_season_fkey
      foreign key (hotel_id, season_id) references public.hotels(id, season_id)
      on update restrict on delete restrict;
  end if;
end;
$$;

create index if not exists rooms_hotel_id_idx on public.rooms (hotel_id);

-- رقمُ الغرفة فريدٌ في الدور داخل الفندق. والقديمُ على الموسم يبقى
-- حتى التشديد، فلا تتغيّر رسالةُ الواجهة الحالية ولا سلوكُها.
create unique index if not exists rooms_hotel_floor_number_uniq
  on public.rooms (hotel_id, floor, number);

-- ── ٤) الحاجّ ← الفندق المطلوب (فارغٌ مسموحٌ في هذه المرحلة) ───
-- المطلوبُ لا المُسنَد: المُسنَدُ يُقرأ من الغرفة (`room_id → rooms.hotel_id`)
-- ولا يُخزَّن مرّتين (M-36). وإلزامُه للحاجّ قيدٌ في ترحيلة التشديد.
alter table public.passengers add column if not exists requested_hotel_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'passengers_requested_hotel_season_fkey') then
    alter table public.passengers
      add constraint passengers_requested_hotel_season_fkey
      foreign key (requested_hotel_id, season_id) references public.hotels(id, season_id)
      on update restrict on delete restrict;
  end if;
end;
$$;

create index if not exists passengers_requested_hotel_id_idx
  on public.passengers (requested_hotel_id);

comment on column public.passengers.requested_hotel_id is
  'MOD-001 — الفندقُ المطلوب (أساسُ تسعير الباقة). المُسنَدُ يُشتقّ من الغرفة ولا يُخزَّن هنا.';
comment on column public.rooms.hotel_id is
  'MOD-001 — فندقُ الغرفة. يُلزَم بعد إطلاق الواجهة الجديدة (ترحيلة التشديد).';

-- ── ٥) التعبئةُ الافتراضيةُ المؤقّتة — حيث لا غموضَ وحده ───────
-- الواجهةُ الحالية تُدرج الغرفَ والحجّاجَ بلا فندق. فإن كان في الموسم
-- فندقٌ واحدٌ بالضبط فهو المقصودُ بلا ريب. وإلا يبقى العمودُ فارغاً.
-- الإدراجُ وحده — التعديلُ القائمُ لا يمسّ هذين العمودين.
-- ⚠️ مؤقّتة: تُحذف في ترحيلة التشديد مع إلزام العمودين.
create or replace function public.mod001_single_hotel_of_season(p_season_id bigint)
returns bigint
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when count(*) = 1 then min(h.id) end
    from public.hotels h
   where h.season_id = p_season_id;
$$;

alter function public.mod001_single_hotel_of_season(bigint) owner to postgres;
revoke execute on function public.mod001_single_hotel_of_season(bigint) from public, anon, authenticated;

create or replace function public.rooms_fill_single_hotel()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.hotel_id is null then
    new.hotel_id := public.mod001_single_hotel_of_season(new.season_id);
  end if;
  return new;
end;
$$;

alter function public.rooms_fill_single_hotel() owner to postgres;
revoke execute on function public.rooms_fill_single_hotel() from public, anon, authenticated;

create or replace trigger trg_rooms_fill_single_hotel
  before insert on public.rooms
  for each row execute function public.rooms_fill_single_hotel();

-- الحاجّ وحده (D7): الإداريُّ ومن في حكمه بلا فندقٍ مطلوب، فلا يُعبَّأ له.
create or replace function public.passengers_fill_single_requested_hotel()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.requested_hotel_id is null
     and coalesce(new.passenger_type, 'حاج') = 'حاج' then
    new.requested_hotel_id := public.mod001_single_hotel_of_season(new.season_id);
  end if;
  return new;
end;
$$;

alter function public.passengers_fill_single_requested_hotel() owner to postgres;
revoke execute on function public.passengers_fill_single_requested_hotel() from public, anon, authenticated;

create or replace trigger trg_passengers_fill_single_requested_hotel
  before insert on public.passengers
  for each row execute function public.passengers_fill_single_requested_hotel();

-- ── ٦) دورةُ الحياة — `delete_season()` تُصرِّف الفنادق ─────────
-- الجسدُ هو جسدُ 20260926091000 حرفاً بحرف، وما أُضيف سطورُ الفنادق
-- وحدها (موسومةٌ MOD-001). والمفتاحُ `restrict` على الموسم يبقى شبكةَ
-- الأمان: لو نُسي التصريفُ لفشل حذفُ الموسم بدل أن يُيتَّم صفّ.
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
  n_hotels bigint;
  n_hprice bigint;
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

  /* MOD-001 — أسعارُ الفنادق تسقط بـ`on delete cascade` من `hotels`،
     فتُعدّ قبل الحذف كسائر ما يسقط بالتعاقب. */
  select count(*) into n_hprice from public.hotel_package_prices hp
   where hp.season_id = p_season_id;

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

  /* MOD-001 — الفنادقُ بعد الحجّاج والغرف لا قبلهم: كلاهما يشير إليها
     بمفتاحٍ مركّبٍ `restrict`. وأسعارُها تسقط معها بـ`on delete cascade`. */
  delete from public.hotels where season_id = p_season_id;
  get diagnostics n_hotels = row_count;
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
      'hotels', n_hotels, 'hotel_package_prices', n_hprice,
      'payments', n_pay, 'custom_charges', n_charge,
      'financial_group_members', n_fgm, 'notification_deliveries', n_notif,
      'pilgrim_push_subscriptions', n_push, 'pilgrim_sessions', n_sess))
  );
end;
$$;

-- ── ٧) شرطٌ لاحق: البنيةُ كما قُصدت، والقائمُ لم يُمَسّ ──────────
do $chk$
declare
  v_n   integer;
  v_def text;
begin
  -- الجدولان بـRLS مفعّل
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('hotels', 'hotel_package_prices') and c.relrowsecurity;
  if v_n <> 2 then
    raise exception 'RLS غير مفعّل على الجدولين: % من ٢.', v_n using errcode = 'P0001';
  end if;

  -- السياساتُ بأسمائها بالضبط: ثلاثٌ للفنادق (لا حذف) وأربعٌ للأسعار
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'hotels'
     and policyname in ('hotels_select', 'hotels_insert', 'hotels_update');
  if v_n <> 3 or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'hotels') <> 3 then
    raise exception 'سياساتُ hotels ليست الثلاثَ المقصودة.' using errcode = 'P0001';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'hotel_package_prices') <> 4 then
    raise exception 'سياساتُ hotel_package_prices ليست الأربعَ المقصودة.' using errcode = 'P0001';
  end if;

  -- لا شيءَ لـanon، ولا حذفَ مباشرٌ للفنادق
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name in ('hotels', 'hotel_package_prices')
                and grantee in ('anon', 'PUBLIC')) then
    raise exception 'anon/PUBLIC يملك صلاحيةً على الجدولين الجديدين.' using errcode = 'P0001';
  end if;
  if has_table_privilege('authenticated', 'public.hotels', 'DELETE') then
    raise exception 'authenticated يملك DELETE على hotels.' using errcode = 'P0001';
  end if;

  -- حارسُ ث٣ على الجدولين، والتعبئتان المؤقّتتان
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
     and ((c.relname in ('hotels', 'hotel_package_prices') and t.tgname = 'trg_reject_closed_season')
       or (c.relname = 'rooms'      and t.tgname = 'trg_rooms_fill_single_hotel')
       or (c.relname = 'passengers' and t.tgname = 'trg_passengers_fill_single_requested_hotel'));
  if v_n <> 4 then
    raise exception 'المحفّزاتُ لم تُركَّب كما يجب: وُجد % من ٤.', v_n using errcode = 'P0001';
  end if;

  -- المفاتيحُ المركّبةُ بتعريفها المتوقَّع حرفاً بحرف
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'rooms_hotel_season_fkey';
  if v_def is distinct from 'FOREIGN KEY (hotel_id, season_id) REFERENCES hotels(id, season_id) ON UPDATE RESTRICT ON DELETE RESTRICT' then
    raise exception 'rooms_hotel_season_fkey بتعريفٍ غير متوقَّع: %', v_def using errcode = 'P0001';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'passengers_requested_hotel_season_fkey';
  if v_def is distinct from 'FOREIGN KEY (requested_hotel_id, season_id) REFERENCES hotels(id, season_id) ON UPDATE RESTRICT ON DELETE RESTRICT' then
    raise exception 'passengers_requested_hotel_season_fkey بتعريفٍ غير متوقَّع: %', v_def using errcode = 'P0001';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'hotel_package_prices_hotel_season_fkey';
  if v_def is distinct from 'FOREIGN KEY (hotel_id, season_id) REFERENCES hotels(id, season_id) ON UPDATE RESTRICT ON DELETE CASCADE' then
    raise exception 'hotel_package_prices_hotel_season_fkey بتعريفٍ غير متوقَّع: %', v_def using errcode = 'P0001';
  end if;

  -- الفهرسان معاً: الجديدُ على الفندق، والقديمُ على الموسم باقٍ للتوافق
  select count(*) into v_n from pg_indexes
   where schemaname = 'public' and tablename = 'rooms'
     and indexname in ('rooms_hotel_floor_number_uniq', 'rooms_season_floor_number_uniq');
  if v_n <> 2 then
    raise exception 'فهرسا تفرّد الغرفة ليسا كلاهما قائمَين: % من ٢.', v_n using errcode = 'P0001';
  end if;

  -- العمودان الجديدان فارغان مسموحان، ولم يُعبَّأ صفٌّ قائم
  if exists (select 1 from public.rooms where hotel_id is not null)
     or exists (select 1 from public.passengers where requested_hotel_id is not null) then
    raise exception 'صفوفٌ قائمةٌ عُبّئت — هذه الترحيلةُ لا تمسّ البيانات.' using errcode = 'P0001';
  end if;

  -- `delete_season` تُصرِّف الفنادق، وما زالت تحذف الدفعاتِ صريحاً وتكتب صفَّ التدقيق
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'delete_season'
     and p.prosrc like '%delete from public.hotels where season_id = p_season_id%'
     and p.prosrc like '%delete from public.payments p%'
     and p.prosrc like '%deleted_counts%';
  if v_n <> 1 then
    raise exception 'delete_season لا تحمل تصريفَ الفنادق مع سلوكها القائم.' using errcode = 'P0001';
  end if;

  -- صلاحيةُ التنفيذ على delete_season لم تتّسع
  if has_function_privilege('authenticated', 'public.delete_season(bigint, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.delete_season(bigint, uuid)', 'EXECUTE') then
    raise exception 'delete_season صارت قابلةً للتنفيذ من دورٍ تطبيقيّ.' using errcode = 'P0001';
  end if;
end;
$chk$;
