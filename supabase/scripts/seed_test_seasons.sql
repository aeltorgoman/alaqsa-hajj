-- ═══════════════════════════════════════════════════════════════
-- م٢.٥ — بيئة اختبار مزروعة بثلاثة مواسم
-- ═══════════════════════════════════════════════════════════════
-- بلا هذه البيئة لا يمكن التحقق من م٣ إطلاقاً: الإنتاج فيه موسم
-- واحد وصفر مقفلة، فلا شيء يُتصفَّح ولا حالة readOnly تُبلَغ.
--
-- ينتج: موسمان مقفلان ببيانات مختلفة + موسم نشط.
--
--   1446   مقفل    3 حجاج · 2 باص · 2 مخيم · 2 غرفة
--   1447   مقفل    2 حاج  · 1 باص · 1 مخيم · 1 غرفة
--   1448   نشط    30 حاجّاً · 2 باص · 2 مخيم · 4 غرف · دفعة · رسم
--
-- الأسماء تحمل اسم موسمها، فأي تسرّب بين المواسم يُرى بالعين بلا
-- مقارنة معرّفات.
--
-- ═══ توقيع close_season بعد س٨ ═══
-- س٨ أسقطت `close_season(text, text)` وأحلّت محلّها
-- `close_season(text, text, uuid)` — الوسيط الثالث هو الفاعل. وهذا
-- السكربت يمرّر `null` عن قصد: البذر ليس فعل شخص، فيُسجَّل الصفّ
-- الملخّص بـ`actor_source='system'` وهو الوصف الصادق لما جرى. ولا
-- يُختلق فاعلٌ بشريّ لعمليةٍ نفّذتها أداة.
--
-- ═══ ما يكفي لحملة القبول §٨ ═══
-- الموسم النشط يحمل **٣٠ حاجّاً** (٢ مسمَّيان + ٢٨ مولَّدين): ٢٨
-- منهم **بلا باص** عمداً ليكون لاختبار التخصيص الجماعي (ت١٠) عملٌ
-- حقيقيّ يفعله. وباصٌ ثانٍ فارغ هدفاً له.
-- وفيه دفعةٌ (ب٢) ورسمٌ مخصَّص (ب٣) على حاجَّين مختلفين، فلا يفسد
-- اختبارٌ موضوعَ الآخر.
--
-- ═══ مستندات البوابة — مراجع لا كائنات ═══
-- إسقاط س٦ يعيد **قيماً منطقية** (`has_photo` …) مشتقّة من كون
-- العمود غير فارغ، فلا يخرج مفتاح كائن من القاعدة. ولذلك تكفي هنا
-- **مراجع نصّية** لعرض وجود المستند. أمّا فتحُ المستند فيمرّ بـ
-- `pilgrim-doc` التي توقّع المفتاح على الحاوية — وذلك **يحتاج
-- كائناً حقيقياً يُرفع إلى بيئة الاختبار وحدها**، ولا يفعله هذا
-- السكربت. المفاتيح أدناه تتبع شكل `uploadDoc` نفسه ليُرفع إليها.
--
-- ⚠️ كل ما يُزرع هنا **اصطناعيّ بالكامل**: لا اسم ولا وثيقة ولا
--    تاريخ ميلاد ولا كائن تخزين مأخوذ من الإنتاج.
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
  v_portal bigint;
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

  /* ═══ التسعير — يُزرع قبل أوّل إقفال عمداً ═══
     لقطة التسعير تُلتقط داخل `close_season`، فتسعيرٌ يُزرع بعد
     الإقفال لا يُلتقط لذلك الموسم. والترتيب هنا هو الترتيب الزمنيّ
     الحقيقيّ: تُسعَّر الشركة، ثمّ يُقفل الموسم، ثمّ يتغيّر السعر
     للموسم التالي. وهذا وحده ما يجعل اختبار ثبات المالية التاريخية
     ممكناً — بذرةٌ بسعرٍ واحد لكلّ المواسم لا تُثبت شيئاً. */
  insert into public.pricing_settings (key, label, type, amount) values
    ('package_double',     'باقة ثنائي',        'package',  10000),
    ('package_triple',     'باقة ثلاثي',        'package',   9000),
    ('package_quad',       'باقة رباعي',        'package',   8000),
    ('package_suite',      'باقة فردية',        'package',  14000),
    ('addon_view',         'إضافة مطلة',        'addon',     1500),
    ('addon_mina',         'خيمة خاصة - منى',  'addon',     2000),
    ('addon_arafa',        'خيمة خاصة - عرفة', 'addon',     1000),
    ('addon_bus_vip',      'باص VIP',           'addon',      800),
    ('addon_first_class',  'طيران درجة أولى',   'addon',     3000),
    ('discount_no_ticket', 'خصم بدون تذكرة',    'discount',  2500);

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

  perform public.close_season('1447', 'بذرة الاختبار', null::uuid);

  /* رفعُ سعرٍ بعد الإقفال: موسم 1446 يجب أن يبقى على ١٠٬٠٠٠ مهما
     تغيّر الحيّ بعده. وهذا هو الفارق الذي يقيسه الاختبار. */
  update public.pricing_settings set amount = 11000 where key = 'package_double';

  -- ── 1447 ──────────────────────────────────────────────────
  insert into public.buses (name, type)  values ('باص 1447', 'عادي') returning id into v_bus;
  insert into public.camps (name, page_type, type) values ('مخيم منى 1447', 'منى', 'خاص') returning id into v_camp;
  insert into public.rooms (number, floor, type) values ('201', 'الثاني', 'رباعية') returning id into v_room;
  insert into public.passengers (name_ar, passport, nat, dob, gender, passenger_type, bus_id, camp_mina_id, room_id, sort_order)
  values
    ('حاج موسم 1447 الأول',  'B1447001', 'أردني', '04/04/1973', 'ذكر',  'حاج',    v_bus, v_camp, v_room, 1),
    ('مرافق موسم 1447',      'B1447002', 'أردني', '05/05/1974', 'أنثى', 'مرافق',  v_bus, v_camp, v_room, 2);

  perform public.close_season('1448', 'بذرة الاختبار', null::uuid);

  /* رفعٌ ثانٍ: فتصير الأسعار الثلاثة متمايزة —
     1446 = ١٠٬٠٠٠ (لقطة) · 1447 = ١١٬٠٠٠ (لقطة) · 1448 = ١٢٬٠٠٠ (حيّ).
     ثلاث قيم مختلفة تُثبت أن كلّ موسم يقرأ تسعيره هو. */
  update public.pricing_settings set amount = 12000 where key = 'package_double';

  -- ── 1448 — النشط ──────────────────────────────────────────
  insert into public.buses (name, type)  values ('باص 1448', 'VIP') returning id into v_bus;
  /* باصٌ ثانٍ فارغ — هدف التخصيص الجماعي في ت١٠. ولو زُرع الحجاج
     عليه ابتداءً لما بقي للاختبار ما يفعله. */
  insert into public.buses (name, type)  values ('باص 1448 ب — هدف ت١٠', 'عادي');
  insert into public.camps (name, page_type, type) values ('مخيم منى 1448', 'منى', 'عادي') returning id into v_camp;
  insert into public.camps (name, page_type, type) values ('مخيم عرفة 1448', 'عرفة', 'عادي');
  insert into public.rooms (number, floor, type) values ('301', 'الثالث', 'ثنائية') returning id into v_room;
  insert into public.rooms (number, floor, type) values ('302', 'الثالث', 'ثلاثية');
  insert into public.rooms (number, floor, type) values ('303', 'الثالث', 'رباعية');
  insert into public.rooms (number, floor, type) values ('304', 'الثالث', 'فردية');

  insert into public.passengers (name_ar, passport, nat, dob, gender, passenger_type, bus_id, camp_mina_id, room_id, sort_order)
  values
    ('حاج موسم 1448 الأول',  'C1448001', 'سعودي', '06/06/1975', 'ذكر',  'حاج', v_bus, v_camp, v_room, 1),
    ('حاج موسم 1448 الثاني', 'C1448002', 'سعودي', '07/07/1976', 'أنثى', 'حاج', v_bus, v_camp, v_room, 2);

  /* ٢٨ حاجّاً مولَّدين بمجموعة لا بثمانيةٍ وعشرين كتلةً منسوخة:
     أقصر، وأسهل تدقيقاً، وحتميّ — الرقم يشتقّ منه كل حقل.
     · الوثائق `C1448101`…`C1448128` — لا تتقاطع مع المسمَّيين
     · الميلاد بصيغة `DD/MM/YYYY` وهي ما يقبله محلّل البوابة
     · `bus_id` فارغ عمداً (ت١٠)، والغرف تدور على الأربع الموجودة */
  insert into public.passengers
    (name_ar, passport, nat, dob, gender, passenger_type, bus_id, camp_mina_id, room_id, sort_order)
  select
    'حاج اختبار 1448 رقم ' || i,
    'C1448' || to_char(100 + i, 'FM000'),
    'سعودي',
    to_char(((i % 28) + 1), 'FM00') || '/' || to_char(((i % 12) + 1), 'FM00') || '/' || (1960 + i)::text,
    case when i % 2 = 0 then 'ذكر' else 'أنثى' end,
    'حاج',
    null,
    v_camp,
    (select r.id from public.rooms r
      where r.season_id = public.active_season_id()
      order by r.id offset (i - 1) % 4 limit 1),
    10 + i
  from generate_series(1, 28) as g(i);

  /* دفعة على حاج الموسم النشط: تُثبت أن الجداول المشتقّة تعمل في
     النشط، ويقابلها في الاختبار رفضُ دفعةٍ على حاج مؤرشَف */
  insert into public.payments (passenger_id, amount, method)
  select id, 1000, 'نقدي' from public.passengers where passport = 'C1448001';

  /* رسمٌ مخصَّص على حاجّ **آخر**: موضوع ب٣ منفصلٌ عن موضوع ب٢، فلا
     يُفسد اختبارٌ صفوفَ الآخر في السجل. و`type` محكومٌ بقيد
     `custom_charges_type_check` — «إضافة» أو «خصم» لا ثالث لهما. */
  insert into public.custom_charges (passenger_id, amount, description, type, notes)
  select id, 250, 'رسم اختبار — موضوع ب٣', 'إضافة', 'بذرة اختبار'
    from public.passengers where passport = 'C1448002';

  /* فِخّ البوابة (ب١١ · ت١١): حاجّ في الموسم النشط بوثيقة وميلاد
     يقبلهما `create_pilgrim_session(p_doc, p_day, p_month, p_year)`.
     المطابقة على `passport` أو `national_id` داخل الموسم النشط
     وحده، والميلاد يُحلَّل إلى ثلاثة أعداد — و«06/06/1975» تعطي
     يوم ٦ · شهر ٦ · سنة ١٩٧٥.
     والمراجع الثلاثة أدناه **نصوصٌ فقط**: الإسقاط يحوّلها إلى
     `has_photo`/`has_hajj_permit`/`has_flight_ticket`. وشكلها هو
     شكل `uploadDoc` نفسه (`<id>/<نوع>_*.jpg`) ليُرفع إليها كائنٌ
     اصطناعيّ في بيئة الاختبار عند اختبار الفتح لا العرض. */
  select id into v_portal from public.passengers where passport = 'C1448001';
  update public.passengers
     set photo_url         = v_portal || '/photo_seed.jpg',
         hajj_permit_url   = v_portal || '/hajj_permit_seed.jpg',
         flight_ticket_url = v_portal || '/flight_ticket_seed.jpg'
   where id = v_portal;
end $$;

-- ── ملخّص ما زُرع ────────────────────────────────────────────
select s.id, s.name,
       case when s.closed_at is null then 'نشط' else 'مقفل' end as الحالة,
       (select count(*) from public.passengers p where p.season_id = s.id) as حجاج,
       (select count(*) from public.buses    b where b.season_id = s.id) as باصات,
       (select count(*) from public.camps    c where c.season_id = s.id) as مخيمات,
       (select count(*) from public.rooms    r where r.season_id = s.id) as غرف
from public.seasons s order by s.id;

-- ── ما يخصّ حملة القبول تحديداً ──────────────────────────────
select
  (select count(*) from public.passengers where season_id = public.active_season_id())            as حجاج_الموسم_النشط,
  (select count(*) from public.passengers where season_id = public.active_season_id()
     and bus_id is null)                                                                          as بلا_باص_لـت١٠,
  (select count(*) from public.payments)                                                          as دفعات,
  (select count(*) from public.custom_charges)                                                    as رسوم,
  (select count(*) from public.passengers
     where nullif(trim(coalesce(photo_url,'')),'') is not null)                                   as حجاج_بمستندات;
