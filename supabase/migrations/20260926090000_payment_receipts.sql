-- ════════════════════════════════════════════════════════════
-- إيصالُ الدفع — صفُّ الإيصالِ هو الأبُ، والدفعاتُ سطورُ توزيع
-- ════════════════════════════════════════════════════════════
-- `payment.id` لم يكن صالحاً رقماً رسميّاً بحال: تسلسلٌ عامٌّ لا موسميّ،
-- ويحمل فراغاتٍ من كلِّ حذفٍ سابق (الإنتاجُ اليومَ ٨ دفعاتٍ بمعرّفاتٍ
-- ٢٤–٣٥). فصار للإيصالِ صفُّه ورقمُه.
--
-- والبنيةُ أبٌ وسطور، فلا جدولَ رأسٍ ثالث:
--   · إيصالٌ فرديّ  → سطرُ توزيعٍ واحد
--   · إيصالُ مجموعة → سطورٌ عدّة، ورقمٌ واحد، وصفٌّ واحدٌ في التقرير
--
-- و`total_amount` **مبلغٌ تاريخيٌّ لا يُحسَب**: لا يُشتقّ من مجموعِ
-- السطورِ الباقيةِ بعد الإصدار بحال. حاجٌّ يُزال من إيصالِ مجموعةٍ
-- يأخذ سطرَه وحدَه، ويبقى إجماليُّ الإيصالِ كما كُتب — لأنّ ذلك هو ما
-- استُلم فعلاً.
--
-- ولا مفتاحَ أجنبيّاً إلى `seasons` ولا إلى `passengers`: الإيصالُ
-- يبقى بعد حذفِ الموسمِ وبعد إزالةِ الحاجّ — وهو نمطُ
-- `season_pricing_snapshot` نفسُه («بلا مفتاح أجنبيّ عمداً: يبقى بعد
-- حذف الموسم»). ولذلك يحمل لقطتَه: اسمُ الموسمِ واسمُ الدافعِ مجمَّدان.

-- ── ١) عدّادُ الموسم ─────────────────────────────────────────
-- على `seasons` سياسةُ `select` وحدَها للعميل — لا `insert` ولا
-- `update`. فالعدّادُ هنا لا تبلغه يدٌ إلا عبر دالّةٍ مُفوَّضة، وهذا
-- أصغرُ بيتٍ آمنٍ له: بلا جدولٍ جديدٍ للترقيم.
alter table public.seasons
  add column if not exists receipt_start_number integer not null default 1,
  add column if not exists receipt_next_number  integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'seasons_receipt_start_positive') then
    alter table public.seasons add constraint seasons_receipt_start_positive
      check (receipt_start_number >= 1);
  end if;
  -- العدّادُ لا ينزل تحت البداية أبداً: رقمٌ صدر لا يُعاد.
  if not exists (select 1 from pg_constraint where conname = 'seasons_receipt_next_not_below_start') then
    alter table public.seasons add constraint seasons_receipt_next_not_below_start
      check (receipt_next_number >= receipt_start_number);
  end if;
end;
$$;

comment on column public.seasons.receipt_start_number is
  'أوّلُ رقمِ إيصالٍ في هذا الموسم. يُعدَّل ما دام receipt_next_number = receipt_start_number (أي لم يصدر إيصالٌ بعد)، وبعدها يُقفَل — والقفلُ محسوبٌ لا عمودٌ ثالث.';
comment on column public.seasons.receipt_next_number is
  'الرقمُ القادم. يتقدّم بجملةِ UPDATE ذرّيّةٍ واحدةٍ داخل معاملةِ الإصدار. لا ينقص أبداً، فالرقمُ الملغى لا يُعاد.';

-- ── ٢) صفُّ الإيصال ──────────────────────────────────────────
create table if not exists public.payment_receipts (
  id             bigint generated always as identity primary key,
  season_id      bigint  not null,
  season_name    text    not null,
  receipt_number integer not null,
  issued_at      timestamptz not null default now(),
  issued_by      text,
  group_name     text,
  total_amount   numeric(10,2) not null,
  payer_name     text    not null,
  method         text    not null,
  payment_date   date    not null,
  notes          text,
  status         text    not null default 'valid',
  cancel_reason  text,
  cancelled_at   timestamptz,
  cancelled_by   text,
  constraint payment_receipts_number_unique     unique (season_id, receipt_number),
  constraint payment_receipts_number_positive   check (receipt_number >= 1),
  constraint payment_receipts_total_positive    check (total_amount > 0),
  constraint payment_receipts_payer_not_blank   check (btrim(payer_name) <> ''),
  constraint payment_receipts_status_vocab      check (status in ('valid', 'cancelled')),
  constraint payment_receipts_method_check      check (method in ('نقدي', 'تحويل بنكي', 'شيك')),
  -- الإلغاءُ حزمةٌ لا تتجزّأ: سببٌ ووقتٌ وفاعلٌ معاً أو لا شيء.
  constraint payment_receipts_cancel_complete check (
    (status = 'valid'     and cancel_reason is null and cancelled_at is null and cancelled_by is null)
 or (status = 'cancelled' and btrim(coalesce(cancel_reason,'')) <> '' and cancelled_at is not null)
  )
);

comment on table public.payment_receipts is
  'الإيصالُ هو الحدثُ الماليُّ نفسُه، و`payments` سطورُ توزيعِه على الحجّاج. بلا مفتاحٍ أجنبيٍّ إلى seasons ولا passengers عمداً: يبقى بعد حذفِ الموسمِ وبعد إزالةِ الحاجّ، ولذلك يحمل لقطتَه المجمَّدة.';
comment on column public.payment_receipts.total_amount is
  'المبلغُ التاريخيُّ كما استُلم. ⚠️ لا يُحسَب ولا يُحدَّث من مجموعِ سطورِ التوزيعِ الباقيةِ بعد الإصدار بحال.';
comment on column public.payment_receipts.group_name is
  'اسمُ المجموعة/العائلة لإيصالِ المجموعة، وNULL للفرديّ. مجمَّدٌ كبقيّةِ اللقطة.';

create index if not exists payment_receipts_season_idx on public.payment_receipts (season_id, receipt_number);
create index if not exists payment_receipts_status_idx on public.payment_receipts (status);

-- ── ٣) ربطُ سطرِ التوزيعِ بأبيه ───────────────────────────────
-- قابلٌ للتصفير: الدفعاتُ السابقةُ لهذه الترحيلةِ بلا إيصال، وتبقى
-- صالحةً كما هي. و`restrict` تمنع حذفَ إيصالٍ له سطور.
alter table public.payments
  add column if not exists receipt_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_receipt_id_fkey') then
    alter table public.payments
      add constraint payments_receipt_id_fkey
      foreign key (receipt_id) references public.payment_receipts(id) on delete restrict;
  end if;
end;
$$;

create index if not exists payments_receipt_id_idx on public.payments (receipt_id);

-- ── ٤) الصفُّ مُجمَّدٌ إلا الإلغاء ─────────────────────────────
-- محفِّزٌ لا رجاءٌ في الواجهة. ولا يحترم `app.season_maintenance`:
-- الإيصالُ يبقى حتى داخلَ `delete_season`.
create or replace function public.payment_receipts_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'صفُّ الإيصال لا يُحذف بحال — الإلغاءُ وحدَه، والرقمُ يبقى.'
      using errcode = 'P0001';
  end if;

  if new.receipt_number is distinct from old.receipt_number
     or new.season_id    is distinct from old.season_id
     or new.season_name  is distinct from old.season_name
     or new.total_amount is distinct from old.total_amount
     or new.payer_name   is distinct from old.payer_name
     or new.group_name   is distinct from old.group_name
     or new.method       is distinct from old.method
     or new.payment_date is distinct from old.payment_date
     or new.notes        is distinct from old.notes
     or new.issued_at    is distinct from old.issued_at
     or new.issued_by    is distinct from old.issued_by then
    raise exception 'بياناتُ الإيصالِ الصادرِ مجمَّدة — لا تُعدَّل بعد الإصدار.'
      using errcode = 'P0001';
  end if;

  if old.status = 'cancelled' and new.status = 'valid' then
    raise exception 'الإيصالُ الملغى لا يعود صالحاً.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

alter function public.payment_receipts_immutable() owner to postgres;
revoke execute on function public.payment_receipts_immutable() from public, anon, authenticated;

drop trigger if exists trg_payment_receipts_immutable on public.payment_receipts;
create trigger trg_payment_receipts_immutable
  before update or delete on public.payment_receipts
  for each row execute function public.payment_receipts_immutable();

-- ── ٤ب) لا سطرَ دفعٍ جديدٍ بلا أب ────────────────────────────
-- بغير هذا الحارسِ يبقى البابُ مفتوحاً: لمن يملك `manage_payments`
-- أن يُدرج في `payments` مباشرةً عبر PostgREST بلا `receipt_id`، فيصنع
-- دفعةً بلا إيصالٍ ولا رقمٍ رسميّ — ويُبطل المعمارَ المعتمَدَ من حيث
-- لا يُرى. فالإدراجُ الآن مقصورٌ فعلاً على `issue_payment_receipt`.
--
-- والصفوفُ السابقةُ لهذه الترحيلةِ لا تُمَسّ: الحارسُ على الإدراجِ
-- وحدَه، فتبقى الدفعاتُ القديمةُ صالحةً ومقروءةً كما هي.
create or replace function public.payments_require_receipt()
returns trigger
language plpgsql
as $$
begin
  if new.receipt_id is null then
    raise exception 'لا تُسجَّل دفعةٌ بلا إيصال — استخدم issue_payment_receipt().'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

alter function public.payments_require_receipt() owner to postgres;
revoke execute on function public.payments_require_receipt() from public, anon, authenticated;

drop trigger if exists trg_payments_require_receipt on public.payments;
create trigger trg_payments_require_receipt
  before insert on public.payments
  for each row execute function public.payments_require_receipt();

-- ── ٥) الأذونات: قراءةٌ للموظّف، والكتابةُ للدالّاتِ وحدَها ─────
alter table public.payment_receipts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='payment_receipts'
                    and policyname='payment_receipts_select') then
    create policy "payment_receipts_select" on public.payment_receipts
      for select to authenticated using (public.is_active_employee());
  end if;
end;
$$;

-- ولا سياسةَ insert/update/delete لأيِّ دور: المسارُ الوحيدُ دالّةٌ
-- مُفوَّضةٌ يملكها postgres، فلا يبلغ الصفَّ طلبٌ مباشرٌ من PostgREST.
grant select on public.payment_receipts to authenticated;
grant all    on public.payment_receipts to service_role;

-- ── ٦) رقمُ البداية: يُعدَّل قبل أوّلِ إيصالٍ فقط ───────────────
create or replace function public.set_season_receipt_start(
  p_season_id bigint,
  p_start     integer
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_start integer; v_next integer; v_closed timestamptz;
begin
  if not public.has_permission('manage_payments') then
    raise exception 'لا تملك صلاحية إدارة الحسابات المالية.' using errcode = 'P0001';
  end if;
  if p_start is null or p_start < 1 then
    raise exception 'رقمُ البدايةِ يجب أن يكون ١ أو أكبر.' using errcode = 'P0001';
  end if;

  select receipt_start_number, receipt_next_number, closed_at
    into v_start, v_next, v_closed
    from public.seasons where id = p_season_id for update;

  if v_start is null then
    raise exception 'لا يوجد موسم بالمعرّف %.', p_season_id using errcode = 'P0001';
  end if;
  if v_closed is not null then
    raise exception 'الموسم مقفل — لا تُعدَّل إعداداتُه المالية.' using errcode = 'P0001';
  end if;
  -- القفلُ محسوبٌ لا مخزَّن: تقدُّمُ العدّادِ عن البدايةِ يعني أنّ
  -- إيصالاً صدر، وتحريكُ البدايةِ بعده يُنتج تكراراً أو ارتباكاً.
  if v_next <> v_start then
    raise exception 'صدرت إيصالاتٌ في هذا الموسم (الرقمُ القادم %) — لا يُعدَّل رقمُ البداية.', v_next
      using errcode = 'P0001';
  end if;

  update public.seasons
     set receipt_start_number = p_start,
         receipt_next_number  = p_start
   where id = p_season_id;

  return p_start;
end;
$$;

alter function public.set_season_receipt_start(bigint, integer) owner to postgres;
revoke execute on function public.set_season_receipt_start(bigint, integer) from public, anon;
grant  execute on function public.set_season_receipt_start(bigint, integer) to authenticated, service_role;

-- ── ٧) الإصدار: رقمٌ وإيصالٌ وسطورٌ في معاملةٍ واحدة ────────────
-- `p_allocations` = [{"passenger_id": 12, "amount": 5000.00}, ...]
-- والإجماليُّ **يُحسب من السطور** فلا يُمرَّر ولا يختلف عنها.
create or replace function public.issue_payment_receipt(
  p_allocations  jsonb,
  p_payment_date date,
  p_method       text,
  p_notes        text default null,
  p_group_name   text default null
) returns public.payment_receipts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_season      bigint;
  v_season_name text;
  v_number      integer;
  v_total       numeric(10,2);
  v_n           integer;
  v_seasons     integer;
  v_payer       text;
  v_actor       text;
  v_receipt     public.payment_receipts;
  v_note        text;
begin
  if not public.has_permission('manage_payments') then
    raise exception 'لا تملك صلاحية إدارة الحسابات المالية.' using errcode = 'P0001';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'لا سطورَ توزيعٍ للإيصال.' using errcode = 'P0001';
  end if;

  -- بلا جدولٍ مؤقّت: المصفوفةُ صغيرةٌ وتُقرأ مباشرةً، فلا أثرَ على
  -- ذاكرةِ الخطط ولا حالةَ تعيش بين نداءين في معاملةٍ واحدة.
  select count(*), sum(round((e ->> 'amount')::numeric, 2)),
         count(distinct (e ->> 'passenger_id')::bigint)
    into v_n, v_total, v_seasons
    from jsonb_array_elements(p_allocations) e;

  if v_n <> v_seasons then
    raise exception 'حاجٌّ مكرَّرٌ في سطورِ التوزيع.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_allocations) e
              where (e ->> 'amount') is null
                 or round((e ->> 'amount')::numeric, 2) <= 0) then
    raise exception 'كلُّ نصيبٍ يجب أن يكون مبلغاً أكبر من صفر.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_allocations) e
              where not exists (select 1 from public.passengers p
                                 where p.id = (e ->> 'passenger_id')::bigint)) then
    raise exception 'أحدُ الحجّاجِ في التوزيعِ غيرُ موجود.' using errcode = 'P0001';
  end if;

  -- موسمٌ واحدٌ لكلِّ إيصال: إيصالٌ يعبر موسمين يُفقد الترقيمَ
  -- الموسميَّ معناه، ويُربك حارسَ الإقفال.
  select count(distinct p.season_id), min(p.season_id)
    into v_seasons, v_season
    from jsonb_array_elements(p_allocations) e
    join public.passengers p on p.id = (e ->> 'passenger_id')::bigint;
  if v_seasons <> 1 then
    raise exception 'سطورُ التوزيعِ تعبر % موسماً — الإيصالُ لموسمٍ واحد.', v_seasons
      using errcode = 'P0001';
  end if;

  -- ⚠️ نقطةُ التسلسل: جملةُ UPDATE **واحدة** تأخذ قفلَ صفِّ الموسمِ
  --    ضمناً وتُعيد الرقم. لا قراءةٌ ثُمّ كتابة، ولا MAX()+1، ولا
  --    حسابٌ في المتصفّح. والمتزامنون يصطفّون على هذا الصفّ.
  --    و`closed_at is null` هنا هو مَن يُنفّذ قاعدةَ الموسمِ المقفل:
  --    لا صفَّ يُحدَّث، فلا رقمَ، فلا إيصال.
  update public.seasons
     set receipt_next_number = receipt_next_number + 1
   where id = v_season and closed_at is null
  returning receipt_next_number - 1, name into v_number, v_season_name;

  if v_number is null then
    raise exception 'الموسم مقفل أو غير موجود — لا يُصدَر إيصال.' using errcode = 'P0001';
  end if;

  -- الفاعلُ من الرمزِ لا من جسمِ الطلب
  select up.email into v_actor from public.user_profiles up where up.id = (select auth.uid());

  if p_group_name is not null and btrim(p_group_name) <> '' then
    v_payer := btrim(p_group_name);
  else
    select coalesce(nullif(btrim(coalesce(p.short_ar, '')), ''), nullif(btrim(coalesce(p.name_ar, '')), ''), 'حاجّ')
      into v_payer
        from jsonb_array_elements(p_allocations) e
      join public.passengers p on p.id = (e ->> 'passenger_id')::bigint
     limit 1;
  end if;

  insert into public.payment_receipts (
    season_id, season_name, receipt_number, issued_by, group_name,
    total_amount, payer_name, method, payment_date, notes
  ) values (
    v_season, v_season_name, v_number, v_actor,
    nullif(btrim(coalesce(p_group_name, '')), ''),
    v_total, v_payer, p_method, p_payment_date, nullif(btrim(coalesce(p_notes, '')), '')
  ) returning * into v_receipt;

  -- سطورُ التوزيع. ونصُّ الملاحظةِ يُبنى **هنا** لأنّ الرقمَ لم يكن
  -- معروفاً قبل التخصيص، فلا يُخمَّن في المتصفّح.
  if v_receipt.group_name is not null then
    v_note := coalesce(nullif(btrim(coalesce(p_notes,'')),'') || ' — ', '')
              || 'ضمن دفعة مجموعة/عائلة ' || v_receipt.group_name
              || ' — إيصال رقم ' || v_number::text;
  else
    v_note := nullif(btrim(coalesce(p_notes,'')), '');
  end if;

  insert into public.payments (passenger_id, amount, payment_date, method, notes, created_by, receipt_id)
  select (e ->> 'passenger_id')::bigint, round((e ->> 'amount')::numeric, 2),
         p_payment_date, p_method, v_note, v_actor, v_receipt.id
    from jsonb_array_elements(p_allocations) e;

  return v_receipt;
end;
$$;

alter function public.issue_payment_receipt(jsonb, date, text, text, text) owner to postgres;
revoke execute on function public.issue_payment_receipt(jsonb, date, text, text, text) from public, anon;
grant  execute on function public.issue_payment_receipt(jsonb, date, text, text, text) to authenticated, service_role;

-- ── ٨) الإلغاء: الرقمُ يبقى، والسطورُ لا تُمَسّ ────────────────
create or replace function public.cancel_payment_receipt(
  p_receipt_id bigint,
  p_reason     text
) returns public.payment_receipts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_receipt public.payment_receipts;
  v_closed  timestamptz;
  v_exists  boolean;
  v_actor   text;
begin
  if not public.has_permission('manage_payments') then
    raise exception 'لا تملك صلاحية إدارة الحسابات المالية.' using errcode = 'P0001';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'سببُ الإلغاءِ مطلوب.' using errcode = 'P0001';
  end if;

  select * into v_receipt from public.payment_receipts where id = p_receipt_id for update;
  if v_receipt.id is null then
    raise exception 'لا يوجد إيصالٌ بالمعرّف %.', p_receipt_id using errcode = 'P0001';
  end if;
  if v_receipt.status = 'cancelled' then
    raise exception 'الإيصالُ ملغىً أصلاً.' using errcode = 'P0001';
  end if;

  -- قاعدةُ الموسمِ المقفل: لا إلغاءَ ولا تصحيحَ ماليٍّ بعد الإقفال.
  -- وموسمٌ محذوفٌ يُعامَل معاملةَ المقفل — لا حالةَ تُستنبط منه.
  select true, s.closed_at into v_exists, v_closed
    from public.seasons s where s.id = v_receipt.season_id;
  if not coalesce(v_exists, false) then
    raise exception 'موسمُ هذا الإيصالِ لم يبقَ — لا يُلغى.' using errcode = 'P0001';
  end if;
  if v_closed is not null then
    raise exception 'موسم % مقفل — لا يُلغى إيصالٌ فيه.', v_receipt.season_name
      using errcode = 'P0001';
  end if;

  select up.email into v_actor from public.user_profiles up where up.id = (select auth.uid());

  update public.payment_receipts
     set status = 'cancelled',
         cancel_reason = btrim(p_reason),
         cancelled_at  = now(),
         cancelled_by  = v_actor
   where id = p_receipt_id
  returning * into v_receipt;

  -- ⚠️ سطورُ `payments` لا تُحذف ولا تُعدَّل: الحسابُ يستثنيها عبر
  --    حالةِ أبيها، فيبقى الأثرُ كاملاً ويبقى الرقمُ مشغولاً.
  return v_receipt;
end;
$$;

alter function public.cancel_payment_receipt(bigint, text) owner to postgres;
revoke execute on function public.cancel_payment_receipt(bigint, text) from public, anon;
grant  execute on function public.cancel_payment_receipt(bigint, text) to authenticated, service_role;

-- ── ٩) شرطٌ لاحقٌ يفشل بوضوحٍ بدل أن يُسلّم بصمت ────────────────
do $$
declare v_n integer;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='seasons'
                    and column_name='receipt_next_number') then
    raise exception 'عمودُ العدّادِ لم يُضَف.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='payments'
                    and column_name='receipt_id') then
    raise exception 'عمودُ الربطِ لم يُضَف.' using errcode = 'P0001';
  end if;

  -- الإيصالُ بلا مفتاحٍ أجنبيٍّ إلى seasons ولا passengers — وهذا شرطُ
  -- بقائِه بعد حذفِ الموسمِ وإزالةِ الحاجّ، فيُفحَص لا يُفترَض.
  select count(*) into v_n from pg_constraint c
    join pg_class t on t.oid = c.conrelid
   where c.contype = 'f' and t.relname = 'payment_receipts';
  if v_n <> 0 then
    raise exception 'على payment_receipts % مفتاحاً أجنبيّاً — يجب ألّا يكون له أيّ مفتاح.', v_n
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_payment_receipts_immutable' and not tgisinternal) then
    raise exception 'محفِّزُ التجميدِ لم يُركَّب.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_payments_require_receipt' and not tgisinternal) then
    raise exception 'حارسُ «لا دفعةَ بلا إيصال» لم يُركَّب.' using errcode = 'P0001';
  end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('issue_payment_receipt', 'cancel_payment_receipt', 'set_season_receipt_start');
  if v_n <> 3 then
    raise exception 'الدالّاتُ الثلاثُ ناقصة: وُجد % من ٣.', v_n using errcode = 'P0001';
  end if;

  -- ولا سياسةَ كتابةٍ على الإيصالِ لأيِّ دور
  select count(*) into v_n from pg_policies
   where schemaname='public' and tablename='payment_receipts' and cmd <> 'SELECT';
  if v_n <> 0 then
    raise exception 'وُجدت % سياسةَ كتابةٍ على payment_receipts — المسارُ الدالّاتُ وحدَها.', v_n
      using errcode = 'P0001';
  end if;
end;
$$;
