-- ============================================================
-- س٩ — تثبيت pg_temp أخيراً في search_path لدوال SECURITY DEFINER
-- ============================================================
-- Security Architecture §١٤ (س٩) · النتيجة H5 من تدقيق المرحلة الأولى
--
-- اثنتا عشرة دالة SECURITY DEFINER تحمل `search_path = public` بلا
-- ذكر pg_temp. وبوستجرس يبحث في مخطّط الجداول المؤقتة **أولاً** حين
-- لا يُذكر pg_temp صراحةً في المسار — فيمكن نظرياً لجدول مؤقت أن
-- يحجب جدولاً حقيقياً داخل دالة تعمل بصلاحيات مالكها.
--
-- ذكر pg_temp **أخيراً** يضعه بعد public فيسقط الحجب.
--
-- الاستغلال يتطلّب جلسة قاعدة يستطيع صاحبها إنشاء جدول مؤقت — وهو
-- ما لا يتيحه PostgREST. فالخطر نظريّ، والإصلاح مجانيّ ولا يمسّ
-- جسم دالة واحدة: `alter function ... set` تغيّر الإعداد وحده.
--
-- الستّ الأخرى (has_permission · get_pilgrim_portal ·
-- get_portal_announcements · verify_user · create_user · update_user)
-- تحمل pg_temp سلفاً ولا تُمسّ.

alter function public.active_season_id() set search_path = public, pg_temp;
alter function public.announcement_audience(p_target_type text, p_target_ids bigint[]) set search_path = public, pg_temp;
alter function public.close_season(p_new_name text, p_closed_by text) set search_path = public, pg_temp;
alter function public.delete_empty_financial_group() set search_path = public, pg_temp;
alter function public.delete_season(p_season_id bigint) set search_path = public, pg_temp;
alter function public.mark_pilgrim_notification_read(p_doc text, p_day integer, p_month integer, p_year integer, p_announcement_id bigint) set search_path = public, pg_temp;
alter function public.push_enabled_passengers() set search_path = public, pg_temp;
alter function public.register_pilgrim_push(p_doc text, p_day integer, p_month integer, p_year integer, p_endpoint text, p_p256dh text, p_auth text, p_platform text, p_user_agent text) set search_path = public, pg_temp;
alter function public.reject_write_closed_season() set search_path = public, pg_temp;
alter function public.reject_write_closed_season_derived() set search_path = public, pg_temp;
alter function public.resolve_pilgrim_id(p_doc text, p_day integer, p_month integer, p_year integer) set search_path = public, pg_temp;
alter function public.unregister_pilgrim_push(p_endpoint text) set search_path = public, pg_temp;
