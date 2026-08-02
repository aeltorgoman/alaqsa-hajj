-- ═══════════════════════════════════════════════════════════════
-- م٢.٥ — بيئة اختبار مزروعة بثلاثة مواسم
-- ═══════════════════════════════════════════════════════════════
-- بلا هذه البيئة لا يمكن التحقق من م٣ إطلاقاً: الإنتاج فيه موسم
-- واحد وصفر مقفلة، فلا شيء يُتصفَّح ولا حالة readOnly تُبلَغ.
--
-- ينتج: موسمان مقفلان ببيانات مختلفة + موسم نشط.
--
--   1446   مقفل   3 حجاج · 2 باص · 2 مخيم · 2 غرفة
--   1447   مقفل   2 حاج  · 1 باص · 1 مخيم · 1 غرفة
--   1448   نشط    2 حاج  · 1 باص · 1 مخيم · 1 غرفة
--
-- الأسماء تحمل اسم موسمها، فأي تسرّب بين المواسم يُرى بالعين بلا
-- مقارنة معرّفات.
--
-- ⚠️ لا يعمل على قاعدة فيها بيانات. الحارس أدناه شرط بنيوي لا
--    راية تُنسى: وجود حاجّ واحد أو موسمين يوقف السكربت.
--
-- الإقفال يتمّ بـ close_season() الحقيقية لا بكتابة closed_at
-- يدوياً — فالبيئة الناتجة تمرّ بنفس المسار الذي يمرّ به الإنتاج،
-- وتُختبر الدالة نفسها ضمناً.
--
-- التشغيل:  psql "$DATABASE_URL" -f supabase/scripts/seed_test_seasons.sql
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  v_pax   int;
  v_seas  int;
  v_bus   bigint;
  v_camp  bigint;
  v_room  bigint;
begin
  select count(*) into v_pax  from public.passengers;
  select count(*) into v_seas from public.seasons;
  if v_pax > 0 or v_seas > 1 then
    raise exception
      'قاعدة غير فارغة (% حاجاً · % موسماً). هذا السكربت لبيئات الاختبار وحدها.',
      v_pax, v_seas;
  end if;

  -- الموسم الأول يوجد أصلاً من ترحيل م١؛ يُسمّى هنا فقط
  if v_seas = 0 then insert into public.seasons (name) values ('1446');
  else update public.seasons set name = '1446' where closed_at is null;
  end if;

  -- ── 1446 ──────────────────────────────────────────────────
  insert into public.buses (name, type)  values ('باص 1446 أ', 'عادي') returning id into v_bus;
  insert into public.buses (name, type)  values ('باص 1446 ب', 'VIP');
  insert into public.camps (name, page_type, type) values ('مخيم منى 1446', 'منى', 'عادي') returning id into v_camp;
  insert into public.camps (name, page_type, type) values ('مخيم عرفة 1446', 'عرفة', 'عادي');
  insert into public.rooms (number, floor, type) values ('101', 'الأول', 'ثنائية') returning id into v_room;
  insert into public.rooms (number, floor, type) values ('102', 'الأول', 'ثلاثية');
  insert into public.passengers (name_ar, passport, nat, dob, gender, passenger_type, bus_id, camp_mina_id, room_id, sort_order)
  values
    ('حاج موسم 1446 الأول',  'A1446001', 'مصري', '01/01/1970', 'ذكر',  'حاج',   v_bus, v_camp, v_room, 1),
    ('حاج موسم 1446 الثاني', 'A1446002', 'مصري', '02/02/1971', 'أنثى', 'حاج',   v_bus, v_camp, v_room, 2),
    ('مشرف موسم 1446',       'A1446003', 'مصري', '03/03/1972', 'ذكر',  'مشرف',  v_bus, v_camp, v_room, 3);

  perform public.close_season('1447', 'بذرة الاختبار');

  -- ── 1447 ──────────────────────────────────────────────────
  insert into public.buses (name, type)  values ('باص 1447', 'عادي') returning id into v_bus;
  insert into public.camps (name, page_type, type) values ('مخيم منى 1447', 'منى', 'خاص') returning id into v_camp;
  insert into public.rooms (number, floor, type) values ('201', 'الثاني', 'رباعية') returning id into v_room;
  insert into public.passengers (name_ar, passport, nat, dob, gender, passenger_type, bus_id, camp_mina_id, room_id, sort_order)
  values
    ('حاج موسم 1447 الأول',  'B1447001', 'أردني', '04/04/1973', 'ذكر',  'حاج',    v_bus, v_camp, v_room, 1),
    ('مرافق موسم 1447',      'B1447002', 'أردني', '05/05/1974', 'أنثى', 'مرافق',  v_bus, v_camp, v_room, 2);

  perform public.close_season('1448', 'بذرة الاختبار');

  -- ── 1448 — النشط ──────────────────────────────────────────
  insert into public.buses (name, type)  values ('باص 1448', 'VIP') returning id into v_bus;
  insert into public.camps (name, page_type, type) values ('مخيم منى 1448', 'منى', 'عادي') returning id into v_camp;
  insert into public.rooms (number, floor, type) values ('301', 'الثالث', 'ثنائية') returning id into v_room;
  insert into public.passengers (name_ar, passport, nat, dob, gender, passenger_type, bus_id, camp_mina_id, room_id, sort_order)
  values
    ('حاج موسم 1448 الأول',  'C1448001', 'سعودي', '06/06/1975', 'ذكر',  'حاج', v_bus, v_camp, v_room, 1),
    ('حاج موسم 1448 الثاني', 'C1448002', 'سعودي', '07/07/1976', 'أنثى', 'حاج', v_bus, v_camp, v_room, 2);

  /* دفعة على حاج الموسم النشط: تُثبت أن الجداول المشتقّة تعمل في
     النشط، ويقابلها في الاختبار رفضُ دفعةٍ على حاج مؤرشَف */
  insert into public.payments (passenger_id, amount, method)
  select id, 1000, 'نقدي' from public.passengers where passport = 'C1448001';
end $$;

-- ── ملخّص ما زُرع ────────────────────────────────────────────
select s.id, s.name,
       case when s.closed_at is null then 'نشط' else 'مقفل' end as الحالة,
       (select count(*) from public.passengers p where p.season_id = s.id) as حجاج,
       (select count(*) from public.buses    b where b.season_id = s.id) as باصات,
       (select count(*) from public.camps    c where c.season_id = s.id) as مخيمات,
       (select count(*) from public.rooms    r where r.season_id = s.id) as غرف
from public.seasons s order by s.id;
