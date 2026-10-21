-- ═══════════════════════════════════════════════════════════════════
-- version : 20261021030000
-- name    : m5_install_pg_net_pg_cron
-- ═══════════════════════════════════════════════════════════════════
--
-- M5 — تثبيتُ الامتدادين اللذين يحتاجهما المُجدوِل: pg_net (طلبُ HTTP لاتزامنيّ من القاعدة)
-- وpg_cron (التوقيت). **تثبيتٌ وحده: لا مهمّةَ مجدوَلة، ولا طلب، ولا سرّ.**
--
-- بعدها لا يتغيّر شيءٌ في السلوك:
--   · لا مهمّةَ في cron.job — التفعيلُ (`cron.schedule`) ترحيلةٌ منفصلة بموافقةٍ منفصلة.
--   · `push_dispatch_tick()` يجد `net.http_post` الآن، لكنّه لا يطلب شيئاً بلا سرَّي Vault
--     (`push_dispatch_url` و`push_dispatch_token`) — يردّ 'not_configured' أو 'idle'. ولا يستدعيه أحد.
--   · لا تُمسّ دالّةٌ ولا جدولٌ ولا صفٌّ في public.
--
-- الصيغةُ كما في وثائق Supabase: pg_net في `extensions` (وكائناتُه في مخطّط net الخاصّ به)،
-- وpg_cron في `pg_catalog` (وكائناتُه في مخطّط cron). وsupautils يُنشئهما بدور supabase_admin،
-- ويمنح postgres استعمالَ cron (فلا حاجةَ هنا إلى grant).
--
-- ⚠️ خطرٌ معلوم مقبول (قرار المالك): pg_net يمنح PUBLIC كلَّ الصلاحيات على
-- `net.http_request_queue` و`net._http_response`، والمالكُ supabase_admin فلا يملك postgres
-- سحبَها (مثبَتٌ على صورة supabase/postgres 17.6 نفسها). وnet غيرُ معروضٍ في واجهة REST
-- (PGRST106)، وpg_graphql غيرُ مثبَّت. فلا يُضاف هنا REVOKE لا أثرَ له.
--
-- التراجع: `drop extension pg_cron;` ثم `drop extension pg_net;` — لا شيءَ يعتمد عليهما بعد
-- (التيكُ يقرأ net.http_post ديناميكيّاً ويعود 'not_configured' بدونه).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ── شروطٌ لاحقة (S-38) ───────────────────────────────────────────────
do $post$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_net غيرُ مثبَّت.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron غيرُ مثبَّت.' using errcode = 'P0001';
  end if;

  -- التوقيعُ الذي يستدعيه push_dispatch_tick() و_push_dispatch_target() بالضبط
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'net.http_post(text, jsonb, jsonb, jsonb, integer) غيرُ موجود.' using errcode = 'P0001';
  end if;
  if to_regclass('net.http_request_queue') is null or to_regclass('net._http_response') is null then
    raise exception 'جداولُ pg_net غيرُ موجودة.' using errcode = 'P0001';
  end if;

  -- التفعيلُ اللاحق ممكن: postgres يستعمل cron ويجدول ويُلغي
  if to_regclass('cron.job') is null
     or not has_schema_privilege('postgres', 'cron', 'USAGE')
     or not has_function_privilege('postgres', 'cron.schedule(text,text,text)', 'EXECUTE')
     or not has_function_privilege('postgres', 'cron.unschedule(text)', 'EXECUTE') then
    raise exception 'postgres لا يستطيع استعمال cron.' using errcode = 'P0001';
  end if;
  -- ولا تستعمله أدوارُ الواجهة
  if has_schema_privilege('anon', 'cron', 'USAGE') or has_schema_privilege('authenticated', 'cron', 'USAGE') then
    raise exception 'مخطّط cron مفتوحٌ لـanon أو authenticated.' using errcode = 'P0001';
  end if;

  -- لا مهمّةَ مجدوَلة — التفعيلُ ترحيلةٌ منفصلة
  if exists (select 1 from cron.job) then
    raise exception 'في cron.job مهمّة — هذه الترحيلةُ لا تجدول شيئاً.' using errcode = 'P0001';
  end if;
  -- ولا طلبَ HTTP
  if exists (select 1 from net.http_request_queue) then
    raise exception 'في طابور pg_net طلب — هذه الترحيلةُ لا تطلب شيئاً.' using errcode = 'P0001';
  end if;

  -- M5 كما هو: لا عقدَ ولا تيك، والتيكُ والفحصُ للمالك وحده
  if exists (select 1 from public.push_dispatch_state where lease_run_id is not null or last_tick_at is not null) then
    raise exception 'push_dispatch_state تغيّر.' using errcode = 'P0001';
  end if;
  if has_function_privilege('service_role', 'public.push_dispatch_tick()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.push_dispatch_tick()', 'EXECUTE')
     or has_function_privilege('anon', 'public.push_dispatch_tick()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.push_dispatch_probe()', 'EXECUTE') then
    raise exception 'صلاحياتُ التيك أو الفحص تغيّرت.' using errcode = 'P0001';
  end if;
end
$post$;
