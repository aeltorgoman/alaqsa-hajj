-- ============================================================
-- ب — صلاحيتان مستقلّتان، يفرضهما الخادم لا الواجهة
-- ============================================================
-- صفحة الإداريين محروسة في الواجهة بـ`manage_admins`، بينما RLS
-- كان يشترط `manage_passengers` وحدها لكل كتابة على `passengers`.
-- فمن يملك `manage_passengers` بلا `manage_admins` — وهذه حال حساب
-- قائم اليوم — يُمنع من الشاشة ولا يُمنع من القاعدة. وإخفاء زرّ
-- ليس تصريحاً؛ من بلغ الـAPI مباشرةً كتب على الإداريين بلا مانع.
--
-- ⚠️ ولا يكفي أن تُضاف سياسات لـ`manage_admins` مع إبقاء القديمة:
-- سياسات PERMISSIVE تُجمَع بـ**OR**، فتبقى `manage_passengers` بلا
-- قيد وتوسّع الصلاحية ولا تضيّقها:
--     mp  OR  (ma AND إداري)   ≡  mp على كل صفّ
-- فالتضييق يوجب **استبدال** الثلاث لا الإضافة إليها. وكل سياسة
-- تحمل الشرطين معاً، فيقرأ المرء أثرها في موضع واحد.
--
-- وتعريف السكّان هنا هو نفسه في التطبيق (`isHajj`) وفي محفِّز س-١:
--   حاجّ  = passenger_type IS NULL OR = 'حاج'
--   إداري = passenger_type IS NOT NULL AND <> 'حاج'
-- فلا يفترق الخادم عن الواجهة في تصنيف الشخص نفسه، ولا يفتح
-- الصفُّ بلا نوع مسارَ التفاف.
--
-- وفي UPDATE يُقيَّم `USING` على الصفّ **القديم** و`WITH CHECK` على
-- **الجديد**. فقلب حاجّ إلى إداري يوجب `manage_passengers` للقديم
-- و`manage_admins` للجديد معاً — ومن يملك واحدة يُرفض. وكذلك
-- العكس. وهذا وحده يسدّ التحايل بتغيير النوع.
--
-- `passengers_select` و`has_permission` خارج هذا الترحيل تماماً.

drop policy passengers_insert on passengers;
drop policy passengers_update on passengers;
drop policy passengers_delete on passengers;

create policy passengers_insert on passengers
  for insert to authenticated
  with check (
       (has_permission('manage_passengers') and (passenger_type is null or passenger_type = 'حاج'))
    or (has_permission('manage_admins')     and  passenger_type is not null and passenger_type <> 'حاج')
  );

create policy passengers_update on passengers
  for update to authenticated
  using (
       (has_permission('manage_passengers') and (passenger_type is null or passenger_type = 'حاج'))
    or (has_permission('manage_admins')     and  passenger_type is not null and passenger_type <> 'حاج')
  )
  with check (
       (has_permission('manage_passengers') and (passenger_type is null or passenger_type = 'حاج'))
    or (has_permission('manage_admins')     and  passenger_type is not null and passenger_type <> 'حاج')
  );

create policy passengers_delete on passengers
  for delete to authenticated
  using (
       (has_permission('manage_passengers') and (passenger_type is null or passenger_type = 'حاج'))
    or (has_permission('manage_admins')     and  passenger_type is not null and passenger_type <> 'حاج')
  );

-- ============================================================
-- التراجع — سياسات فقط، بلا أي مساس بالبيانات
-- ============================================================
--   drop policy passengers_insert on passengers;
--   drop policy passengers_update on passengers;
--   drop policy passengers_delete on passengers;
--
--   create policy passengers_insert on passengers for insert to authenticated
--     with check (has_permission('manage_passengers'));
--
--   create policy passengers_update on passengers for update to authenticated
--     using      (has_permission('manage_passengers'))
--     with check (has_permission('manage_passengers'));
--
--   create policy passengers_delete on passengers for delete to authenticated
--     using (has_permission('manage_passengers'));
