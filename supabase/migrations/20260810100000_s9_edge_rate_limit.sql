-- ============================================================
-- س٩ / M4 — حدّ الاستدعاءات لدوال Edge
-- ============================================================
-- Security Architecture §٧.٢ · §١٤ (صفّ س٩) · BACKLOG أ٣.
--
-- الدوال الثلاث محميّة بالنمط الثلاثي كاملاً منذ س٣، فلا يصلها إلا
-- موظّف نشط يملك الصلاحية. لكن الصلاحية لا تحدّ **الكمّ**: موظّف
-- واحد — أو جهاز مسروق بجلسة حيّة — يستطيع استنزاف مفتاح مدفوع أو
-- إغراق أجهزة الحجاج بالتنبيهات. هذا الحدّ طبقة كمّية خلف التفويض،
-- لا بديلاً عنه.
--
-- لماذا في القاعدة لا في ذاكرة الدالة: عزلات Deno عابرة ومتعدّدة،
-- فعدّاد الذاكرة يُصفَّر مع كلّ إقلاع بارد ولا يُجمَع بين العزلات.
--
-- النافذة ثابتة (fixed window) لا منزلقة: أبسط، وكافٍ لغرض الحدّ
-- من الاستنزاف. وأسوأ حالاتها ضِعف الحدّ على حدّ نافذتين.

create table if not exists public.edge_rate_limits (
  scope        text        not null,
  subject      uuid        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (scope, subject, window_start)
);

comment on table public.edge_rate_limits is
  'س٩ — عدّادات حدّ الاستدعاءات لدوال Edge. لا يقرؤها ولا يكتبها عميل: service_role وحده عبر consume_rate_limit().';

/* قاعدة الأساس الأمني ١: الجدول الجديد لا يرث صلاحيات مجهولة.
   ولا صلاحيات موظّف كذلك — لا مسار عميل إلى هذا الجدول أصلاً. */
alter table public.edge_rate_limits enable row level security;
revoke all on public.edge_rate_limits from anon, authenticated;
grant all on public.edge_rate_limits to service_role;

-- ------------------------------------------------------------
-- consume_rate_limit — تسجّل محاولة وتقول هل بقيت داخل الحدّ
-- ------------------------------------------------------------
-- الفاعل يُمرَّر صراحةً لا يُقرأ من auth.uid()، لأن المستدعي هو
-- الدالة الحافّية بمفتاح الخدمة بعد أن أثبتت الهوية في authorize().
-- ولذلك EXECUTE محصورة في service_role: لو مُنحت للعميل لاستطاع
-- استهلاك حصّته بنفسه أو التلاعب بالنطاق.
create or replace function public.consume_rate_limit(
  p_scope          text,
  p_subject        uuid,
  p_limit          integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_subject is null or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    return false;
  end if;

  /* بداية النافذة الثابتة التي تقع فيها اللحظة الحالية */
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.edge_rate_limits as r (scope, subject, window_start, hits)
  values (p_scope, p_subject, v_window, 1)
  on conflict (scope, subject, window_start)
  do update set hits = r.hits + 1
  returning r.hits into v_hits;

  /* تنظيف محصور بصاحب الطلب: نوافذه المنتهية وحدها، فلا مسح دوريّ
     ولا نموّ بلا حدّ */
  delete from public.edge_rate_limits
   where subject = p_subject and window_start < v_window;

  return v_hits <= p_limit;
end;
$$;

comment on function public.consume_rate_limit(text, uuid, integer, integer) is
  'س٩ — تسجّل استدعاءً وتُرجع true ما دام داخل الحدّ. تُستدعى من دوال Edge بمفتاح الخدمة وحده.';

revoke execute on function public.consume_rate_limit(text, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, uuid, integer, integer)
  to service_role;
