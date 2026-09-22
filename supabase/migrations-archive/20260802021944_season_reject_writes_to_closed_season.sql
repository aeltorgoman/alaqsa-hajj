-- ═══════════════════════════════════════════════════════════════
-- م١ / الجزء ٢ — ث٣: لا كتابة على موسم مقفل
-- الضمانة الحقيقية. لا تحتاج Supabase Auth ولا RLS: المحفّز يقرأ
-- الموسم من الصفّ نفسه، أو يشتقّه عبر passenger_id.
-- ═══════════════════════════════════════════════════════════════

-- ملاحظة على القفل: كل فحص يأخذ `for share` على صفّ الموسم قبل
-- قراءة closed_at، و close_season() تأخذ `for update` على الصفّ
-- نفسه. فالكتابة الجارية أثناء الإقفال إمّا أن تسبقه فتُقبل، أو
-- تليه فتُرفض — ولا توجد نافذة تمرّ فيها كتابة إلى موسم صار مقفلاً.
-- هذا ما يغلق خ٥ فعلياً؛ و«الكنس» المذكور في #42 لم يعد له صفوف
-- يكنسها بعد أن صار season_id غير قابل للفراغ.

-- ── الجداول التي تخزّن season_id ──────────────────────────────
create or replace function public.reject_write_closed_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed timestamptz;
  v_name   text;
begin
  -- مَنفذ الصيانة: delete_season() وحدها تفتحه، وهو معاملة المدى
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- الخروج من موسم مقفل ممنوع كالبقاء فيه
  if tg_op in ('UPDATE', 'DELETE') then
    select s.closed_at, s.name into v_closed, v_name
      from public.seasons s where s.id = old.season_id for share;
    if v_closed is not null then
      raise exception 'موسم % مقفل — لا يمكن تعديل بياناته أو حذفها.', v_name
        using errcode = 'P0001';
    end if;
  end if;

  -- والدخول إليه ممنوع كذلك
  if tg_op in ('INSERT', 'UPDATE') then
    select s.closed_at, s.name into v_closed, v_name
      from public.seasons s where s.id = new.season_id for share;
    if v_closed is not null then
      raise exception 'موسم % مقفل — لا يمكن إضافة بيانات إليه.', v_name
        using errcode = 'P0001';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ── الجداول التي تشتقّ موسمها عبر passenger_id ────────────────
-- §٤ من #42 قرّر عدم تخزين season_id هنا تفادياً للتناقض. لكن
-- الاشتقاق يخدم القراءة ولا يمنع كتابة. بدون هذا المحفّز تبقى
-- «دفعة على حاج مؤرشَف» ممكنة، ويصير ثبات الأرشيف نصف ضمانة.
create or replace function public.reject_write_closed_season_derived()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed timestamptz;
  v_name   text;
begin
  if coalesce(current_setting('app.season_maintenance', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select s.closed_at, s.name into v_closed, v_name
      from public.passengers p
      join public.seasons s on s.id = p.season_id
      where p.id = old.passenger_id
      for share of s;
    if v_closed is not null then
      raise exception 'الحاج يتبع موسم % المقفل — لا يمكن تعديل بياناته أو حذفها.', v_name
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select s.closed_at, s.name into v_closed, v_name
      from public.passengers p
      join public.seasons s on s.id = p.season_id
      where p.id = new.passenger_id
      for share of s;
    if v_closed is not null then
      raise exception 'الحاج يتبع موسم % المقفل — لا يمكن إضافة بيانات له.', v_name
        using errcode = 'P0001';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ── تركيب المحفّزات ───────────────────────────────────────────
do $$
declare v_tbl text;
begin
  foreach v_tbl in array array['passengers','buses','camps','rooms'] loop
    execute format('drop trigger if exists trg_reject_closed_season on public.%I', v_tbl);
    execute format(
      'create trigger trg_reject_closed_season
         before insert or update or delete on public.%I
         for each row execute function public.reject_write_closed_season()', v_tbl);
  end loop;

  foreach v_tbl in array array[
    'payments','custom_charges','notification_deliveries',
    'pilgrim_push_subscriptions','financial_group_members'
  ] loop
    execute format('drop trigger if exists trg_reject_closed_season on public.%I', v_tbl);
    execute format(
      'create trigger trg_reject_closed_season
         before insert or update or delete on public.%I
         for each row execute function public.reject_write_closed_season_derived()', v_tbl);
  end loop;
end $$;
