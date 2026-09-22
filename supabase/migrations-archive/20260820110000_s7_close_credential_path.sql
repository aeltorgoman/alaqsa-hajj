-- ============================================================
-- س٧ / M2 — إغلاق مسار الاعتماد الثابت (القطع النهائي)
-- ============================================================
-- ⛔ **لا تُطبَّق هذه الهجرة إلا بعد اجتياز بوابة القبول** في
-- `S7_IMPLEMENTATION_DESIGN.md` §٧ — القرار ق٤ المعتمد.
--
-- ولماذا هجرة منفصلة أصلاً: انتقالٌ ذرّيّ واحد عبر ثلاثة أنظمة
-- تُنشر مستقلّة (Postgres · Deno · Vercel CDN) **غير ممكن**. فيبقى
-- المسار القديم حيّاً **جسرَ تراجع** مدّة نشرٍ متحقَّق منه، ثم
-- يموت في اليوم نفسه. وهذه ليست طبقة توافق: لا مسار هوية ثانياً
-- يُبنى، بل مسارٌ قديم يُمهَل ساعاتٍ ثم يُقطع.
--
-- بعد هذه الهجرة تبقى في النظام كلّه **دالة واحدة** تحوّل
-- «رقم وثيقة + تاريخ ميلاد» إلى هوية: `create_pilgrim_session`.
--
-- ═══ التراجع ═══
-- إعادة `get_pilgrim_portal` بتوقيعها القديم: أعد تشغيل جسم
-- `20260812090000_s6_portal_hardening.sql` كما هو ثم:
--     grant execute on function public.get_pilgrim_portal(text,integer,integer,integer) to anon;
-- (لا يُنسخ الجسم هنا عمداً — مصدرٌ واحد للحقيقة، وتكراره يخلق
--  نسختين تفترقان.)
-- وإعادة دوال التنبيهات الثلاث: نصّها الكامل محفوظ في نهاية هذا
-- الملفّ تعليقاً، لأنها لا مصدر لها في المستودع (سبقت نقل الدوال
-- إليه).

-- ------------------------------------------------------------
-- ١) مسار الدخول القديم
-- ------------------------------------------------------------
drop function if exists public.get_pilgrim_portal(text, integer, integer, integer);

-- ------------------------------------------------------------
-- ٢) مخبرا الهوية غير المحدودين (ف١ · ف٢) ومسار الإلغاء بلا هوية (ف٥)
-- ------------------------------------------------------------
-- تُسقَط التواقيع لا تُسحب منحها وحدها: توقيعٌ باقٍ بلا منح يظلّ
-- باباً ينتظر منحاً ساهياً. والإسقاط يجعل العودة إليه قراراً
-- صريحاً لا سهواً.
drop function if exists public.register_pilgrim_push(text, integer, integer, integer, text, text, text, text, text);
drop function if exists public.mark_pilgrim_notification_read(text, integer, integer, integer, bigint);
drop function if exists public.unregister_pilgrim_push(text);

-- ------------------------------------------------------------
-- ٣) ملاحظة على `resolve_pilgrim_id`
-- ------------------------------------------------------------
-- تبقى قائمة و`service_role` وحدها تنفّذها — لا يبلغها عميل. لكنها
-- بعد هذه الهجرة **بلا مستدعٍ**: `pilgrim-doc` انتقلت إلى
-- `verify_pilgrim_session`، ودوال التنبيهات القديمة سقطت.
-- **لا تُحذف هنا:** حذفها خارج نطاق س٧ المعتمد، ويُسجَّل في
-- `BACKLOG.md` تنظيفاً مستقلّاً.

/* ════════════════════════════════════════════════════════════
   نصّ دوال التنبيهات القديمة — للتراجع وحده، لا للتشغيل
   ════════════════════════════════════════════════════════════

create or replace function public.register_pilgrim_push(
  p_doc text, p_day integer, p_month integer, p_year integer,
  p_endpoint text, p_p256dh text, p_auth text,
  p_platform text default 'web', p_user_agent text default null
) returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare v_pid bigint;
begin
  v_pid := resolve_pilgrim_id(p_doc, p_day, p_month, p_year);
  if v_pid is null then return false; end if;

  insert into pilgrim_push_subscriptions
    (passenger_id, endpoint, p256dh, auth, platform, user_agent)
  values
    (v_pid, p_endpoint, p_p256dh, p_auth, coalesce(p_platform, 'web'), p_user_agent)
  on conflict (endpoint) do update set
    passenger_id = excluded.passenger_id,
    p256dh       = excluded.p256dh,
    auth         = excluded.auth,
    platform     = excluded.platform,
    user_agent   = excluded.user_agent,
    last_seen_at = now();

  return true;
end; $function$;
grant execute on function public.register_pilgrim_push(text,integer,integer,integer,text,text,text,text,text) to anon, authenticated;

create or replace function public.mark_pilgrim_notification_read(
  p_doc text, p_day integer, p_month integer, p_year integer, p_announcement_id bigint
) returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare v_pid bigint;
begin
  v_pid := resolve_pilgrim_id(p_doc, p_day, p_month, p_year);
  if v_pid is null then return false; end if;

  insert into notification_deliveries (announcement_id, passenger_id, status, read_at)
  values (p_announcement_id, v_pid, 'read', now())
  on conflict (announcement_id, passenger_id) do update
    set read_at = coalesce(notification_deliveries.read_at, now());

  return true;
end; $function$;
grant execute on function public.mark_pilgrim_notification_read(text,integer,integer,integer,bigint) to anon, authenticated;

create or replace function public.unregister_pilgrim_push(p_endpoint text)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
begin
  delete from pilgrim_push_subscriptions where endpoint = p_endpoint;
  return true;
end; $function$;
grant execute on function public.unregister_pilgrim_push(text) to anon, authenticated;

   ════════════════════════════════════════════════════════════ */
