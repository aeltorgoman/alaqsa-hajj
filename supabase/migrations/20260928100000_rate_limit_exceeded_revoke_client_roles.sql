-- ═══════════════════════════════════════════════════════════════════
-- version : 20260928100000
-- name    : rate_limit_exceeded_revoke_client_roles
-- ═══════════════════════════════════════════════════════════════════
--
-- تصحيحٌ أماميّ للترحيلة 20260928090000 — صلاحياتٌ لا غير.
--
-- `rate_limit_exceeded` فحصٌ داخليّ للقراءة يناديه `create_pilgrim_session`
-- (SECURITY DEFINER). والقصدُ ألّا يناديه عميلٌ أبداً. لكنّ الصلاحياتِ
-- الافتراضيّةَ في `public` (`alter default privileges ... grant execute
-- on functions to authenticated`) منحت `authenticated` حقَّ التنفيذ لحظةَ
-- الإنشاء، والترحيلةُ السابقةُ سحبت من PUBLIC وحده. فهذه تسحب صراحةً من
-- الأدوار العميلة، وتُبقي `service_role` وحده.
--
-- لا يمسّ جسمَ الدالّة، ولا `create_pilgrim_session`، ولا سلوكَ الحدود.
-- لا جدول ولا فهرس ولا سياسة. وإعادةُ تشغيله لا تفعل شيئاً.

revoke execute on function public.rate_limit_exceeded(text, uuid, integer, integer) from public;
revoke execute on function public.rate_limit_exceeded(text, uuid, integer, integer) from anon;
revoke execute on function public.rate_limit_exceeded(text, uuid, integer, integer) from authenticated;
grant  execute on function public.rate_limit_exceeded(text, uuid, integer, integer) to service_role;
