-- ═══════════════════════════════════════════════════════════════
-- م١ / الجزء ٥ — حصر تنفيذ الدالتين الهدّامتين
-- بوستجرس يمنح execute لـ PUBLIC تلقائياً عند إنشاء أي دالة. وهذا
-- يعني أن close_season و delete_season صارتا — لحظة إنشائهما —
-- قابلتين للاستدعاء بمفتاح النشر العلني.
--
-- لا شيء في التطبيق يستدعيهما بعد (استدعاؤهما يبدأ في م٥). فسحب
-- الصلاحية الآن لا يكسر شيئاً، ويمنع شحن نقطة نهاية هدّامة مفتوحة.
-- كيف تستدعيهما صفحة المواسم في م٥ — قرار يُتخذ هناك، لا هنا.
--
-- هذا ليس إصلاحاً لدين أمني قائم، بل امتناع عن إنشاء دين جديد.
--
-- active_season_id() تبقى متاحة للجميع عن قصد: إنها قيمة الـ
-- default على أربعة أعمدة، فبدون execute يفشل كل إدراج من التطبيق.
-- ═══════════════════════════════════════════════════════════════
revoke execute on function public.close_season(text, text)  from public, anon, authenticated;
revoke execute on function public.delete_season(bigint)     from public, anon, authenticated;

-- دوال المحفّزات لا تُستدعى مباشرة إطلاقاً — تنفّذها القاعدة وحدها
revoke execute on function public.reject_write_closed_season()         from public, anon, authenticated;
revoke execute on function public.reject_write_closed_season_derived() from public, anon, authenticated;
