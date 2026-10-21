-- ═══════════════════════════════════════════════════════════════════
-- version : 20261021120000
-- name    : m5_schedule_push_dispatch
-- ═══════════════════════════════════════════════════════════════════
--
-- M5 — التفعيل: مهمّةٌ واحدة في pg_cron تستدعي `push_dispatch_tick()` كلَّ دقيقة.
-- **هذا كلُّ ما تفعله:** لا تُمسّ دالّةٌ ولا جدولٌ ولا صفٌّ في public، ولا سرّ، ولا طلب.
--
-- ما يحدث بعدها كلَّ دقيقة (منطقُ 20261020211932 كما هو، بلا تعديل):
--   · لا مستحقّ ← 'idle' بلا كتابة ولا طلب.
--   · مستحقٌّ (موسمٌ مفتوح، `id > cutoff_id`، حان `show_at`، لم ينتهِ، لم يُختم) ← عقدٌ
--     (١٨٠ث) وطلبٌ واحدٌ عبر pg_net إلى push-dispatch بـ`x-push-dispatch-token`، والتسليمُ
--     بحجز M6 وختمه. والتنبيهاتُ التاريخيّة (`id ≤ cutoff_id`) لا تُرسل أبداً.
--   · بلا سرَّي Vault (تثبيتٌ جديد لعميل) ← 'not_configured' بلا طلب.
--
-- `cron.schedule` بالاسم يُحدّث المهمّةَ إن وُجدت، فإعادةُ الترحيلة لا تُنشئ ثانية.
-- والمهمّةُ تعمل بدور من جدولها (postgres، مالكُ التيك) على قاعدة `cron.database_name`.
--
-- الإيقافُ الطارئ (يوقف كلَّ دفعٍ مجدوَل فوراً، ولا يمسّ الإرسالَ اليدويّ M6):
--   select cron.unschedule('m5-push-dispatch');

select cron.schedule('m5-push-dispatch', '* * * * *', 'SELECT public.push_dispatch_tick();');

-- ── شروطٌ لاحقة (S-38) ───────────────────────────────────────────────
do $post$
declare
  j cron.job%rowtype;
begin
  if (select count(*) from cron.job where jobname = 'm5-push-dispatch') <> 1 then
    raise exception 'المطلوب مهمّةٌ واحدة باسم m5-push-dispatch.' using errcode = 'P0001';
  end if;
  select * into j from cron.job where jobname = 'm5-push-dispatch';
  if j.schedule <> '* * * * *' or j.command <> 'SELECT public.push_dispatch_tick();' or not j.active then
    raise exception 'مهمّةُ m5-push-dispatch ليست بالجدول أو الأمر المعتمَد، أو غيرُ مفعّلة.' using errcode = 'P0001';
  end if;
  -- بدور مالك التيك وعلى قاعدته: لا تُرفض بصلاحيّة ولا تعمل على قاعدةٍ أخرى
  if j.username <> current_user or j.database <> current_database() then
    raise exception 'مهمّةُ m5-push-dispatch بدورٍ أو قاعدةٍ غير متوقَّعين.' using errcode = 'P0001';
  end if;
  -- مُجدوِلٌ واحد: لا مهمّةَ أخرى توقظ التيك أو الفحص
  if exists (select 1 from cron.job where jobname is distinct from 'm5-push-dispatch'
                                      and command ~* 'push_dispatch_(tick|probe)') then
    raise exception 'مهمّةٌ أخرى تستدعي التيك أو الفحص.' using errcode = 'P0001';
  end if;

  -- التيكُ والفحصُ للمالك وحده كما كانا
  if has_function_privilege('service_role', 'public.push_dispatch_tick()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.push_dispatch_tick()', 'EXECUTE')
     or has_function_privilege('anon', 'public.push_dispatch_tick()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.push_dispatch_probe()', 'EXECUTE') then
    raise exception 'صلاحياتُ التيك أو الفحص تغيّرت.' using errcode = 'P0001';
  end if;
  -- cron مغلقٌ على أدوار الواجهة كما كان
  if has_schema_privilege('anon', 'cron', 'USAGE') or has_schema_privilege('authenticated', 'cron', 'USAGE') then
    raise exception 'مخطّط cron مفتوحٌ لـanon أو authenticated.' using errcode = 'P0001';
  end if;
end
$post$;
