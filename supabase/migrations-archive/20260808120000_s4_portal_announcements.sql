-- ============================================================
-- س٤ / PR ١ — تنبيهات البوابة خلف إسقاط مضبوط
-- ============================================================
-- Security Architecture v1.3 §٦.٢ · §٨ · S4 Implementation Design v1.1 §٣.٦
--
-- البوابة تقرأ اليوم جدول announcements مباشرةً بصفتها anon، وهو
-- منح جدوليّ يجب ألّا يبقى بعد س٤. البديل هو النمط المعتمد نفسه
-- الذي تستعمله get_pilgrim_portal:
--
--   anon  →  دالة SECURITY DEFINER  →  إسقاط مضبوط
--
-- هذا الترحيل **إضافيّ بحت**: لا يسحب منحاً ولا يحذف سياسة، فنشره
-- وحده لا يكسر شيئاً. سحب المنح في ترحيل س٤ الثاني، بعده.
--
-- الإسقاط مطابق حرفياً لما يقرأه العميل اليوم — أربعة حقول بنفس
-- الترشيح والترتيب. و expires_at تُستعمل في الترشيح ولا تخرج، وهي
-- اليوم تخرج ضمناً لأن المنح على الجدول كاملة.

create or replace function public.get_portal_announcements()
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'id', a.id,
        'body', a.body,
        'priority', a.priority,
        'show_at', a.show_at
      )
      order by (a.priority = 'عاجل') desc, a.show_at desc
    ),
    '[]'::json)
  from public.announcements a
  where a.show_at <= now()
    and (a.expires_at is null or a.expires_at > now());
$$;

comment on function public.get_portal_announcements() is
  'بوابة الحاج — إسقاط التنبيهات السارية لـ anon. مدخل مجهول موثَّق (ج٤) في جرد الوصول المجهول.';

/* الحاج anon وحده يستدعيها. الموظّف يقرأ الجدول بصلاحيته لا بهذه. */
revoke execute on function public.get_portal_announcements() from public, authenticated;
grant execute on function public.get_portal_announcements() to anon, service_role;
