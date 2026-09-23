-- ═══════════════════════════════════════════════════════════════
-- م١ / الجزء ٣ — الإقفال والحذف كعمليتين ذرّيتين
-- ث٢: موسم نشط واحد لا أقل — الإقفال والإنشاء في معاملة واحدة،
-- فلا توجد لحظة يكون فيها النظام بلا موسم مفتوح.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.close_season(p_new_name text, p_closed_by text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old bigint;
  v_new bigint;
  v_name text := btrim(coalesce(p_new_name, ''));
begin
  if v_name = '' then
    raise exception 'اسم الموسم الجديد مطلوب.' using errcode = 'P0001';
  end if;

  -- قفل الموسم النشط أولاً: يسلسل الإقفالات المتزامنة، ويمنع أي
  -- كتابة جارية (تأخذ for share) من أن تسبقنا وتصير في موسم مقفل
  select id into v_old from public.seasons where closed_at is null for update;
  if v_old is null then
    raise exception 'لا يوجد موسم مفتوح لإقفاله.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.seasons where name = v_name) then
    raise exception 'يوجد موسم باسم % بالفعل.', v_name using errcode = 'P0001';
  end if;

  update public.seasons
     set closed_at = now(), closed_by = p_closed_by
   where id = v_old;

  insert into public.seasons (name) values (v_name) returning id into v_new;

  return v_new;
end;
$$;

comment on function public.close_season(text, text) is
  'يُقفل الموسم النشط ويفتح موسماً جديداً في معاملة واحدة. الفشل في أي خطوة يُرجع الحالة كما كانت.';


create or replace function public.delete_season(p_season_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed timestamptz;
  v_name   text;
begin
  select closed_at, name into v_closed, v_name
    from public.seasons where id = p_season_id for update;

  if v_name is null then
    raise exception 'لا يوجد موسم بالمعرّف %.', p_season_id using errcode = 'P0001';
  end if;
  if v_closed is null then
    raise exception 'موسم % مفتوح — لا يُحذف إلا موسم مقفل.', v_name using errcode = 'P0001';
  end if;

  -- الحذف هو الاستثناء الوحيد لـ ث٣: المحفّز يمنع الكتابة على
  -- موسم مقفل، والحذف كتابة. المَنفذ محصور في هذه المعاملة وحدها،
  -- ولا سبيل لفتحه من الواجهة لأن PostgREST لا يمرّر إعدادات جلسة.
  set local app.season_maintenance = 'on';

  -- الحجاج أولاً: التوابع (الدفعات · الرسوم · التسليمات ·
  -- الاشتراكات · عضويات المجموعات) تسقط بـ on delete cascade
  delete from public.passengers where season_id = p_season_id;
  delete from public.rooms       where season_id = p_season_id;
  delete from public.camps       where season_id = p_season_id;
  delete from public.buses       where season_id = p_season_id;

  -- المفتاح الأجنبي restrict هو شبكة الأمان: لو بقي صفّ موسميّ
  -- في جدول أُضيف لاحقاً ونُسي هنا، يفشل هذا السطر بدل أن يُيتَّم
  delete from public.seasons where id = p_season_id;

  set local app.season_maintenance = 'off';
end;
$$;

comment on function public.delete_season(bigint) is
  'يحذف موسماً مقفلاً وكل بياناته في معاملة واحدة. الموسم المفتوح لا يُحذف.';
