-- ════════════════════════════════════════════════════════════
-- passengers.room_id — المفتاحُ الأجنبيُّ الأخيرُ الناقص
-- ════════════════════════════════════════════════════════════
-- الوصفُ الأصليُّ للعدد #23 قال «صفرُ مفاتيحَ أجنبيّةٍ على passengers».
-- وقد بطُل: الجدولُ اليومَ يحمل ستّةً، كلُّها `on delete restrict`:
--   bus_id · camp_mina_id · camp_arafa_id · flight_id ·
--   return_flight_id · season_id
-- و`room_id` وحدَه بقي بلا قيد — هو الاستثناءُ الوحيدُ بين أعمدةِ
-- الربطِ الستّة، لا القاعدة.
--
-- ── الثغرةُ الباقيةُ بالضبط ──────────────────────────────────
-- الكتابةُ محروسةٌ أصلاً: `reject_cross_season_room()` (ترحيلة
-- 20260922195044) ترفع «الغرفة رقم % غير موجودة» عند إسنادِ غرفةٍ
-- معدومة، وترفض غرفةَ موسمٍ آخر. فلا يولد اليتيمُ من جهةِ الحاجّ.
--
-- لكنّه يولد من جهةِ الغرفة: **حذفُ غرفةٍ فيها نزلاء لا يمنعه شيءٌ
-- في القاعدة.** المحفِّزاتُ على `rooms` ثلاثةٌ لا رابع:
--   · trg_reject_closed_season      → حالةُ الموسم، لا الإشغال
--   · trg_rooms_apply_capacity      → insert/update of type,capacity
--   · trg_rooms_capacity_floor      → insert/update of type,capacity
--   · trg_rooms_reject_season_change→ update of season_id
-- ولا واحدَ منها يفحص الإشغالَ عند الحذف.
--
-- والحارسُ الوحيدُ في `HotelPage.deleteRoom` (السطر ٣٦٩):
--     if (occ.length > 0) { showAlert("error", "لا يمكن حذف غرفة بها نزلاء"); return; }
-- وهو يقرأ `passengers` من حالةِ المكوّن — لقطةً من آخرِ عرض. فموظّفٌ
-- يرى الغرفةَ فارغةً بينما أسند إليها زميلُه حاجّاً يمرّ من الحارس
-- ويحذفها، فيبقى الحاجُّ بـ`room_id` يشير إلى غرفةٍ معدومة. ولا شيءَ
-- يكتشفه بعدها: كلُّ القراءاتِ بـ`find` تُرجع `undefined` صامتةً.
-- والمسارُ المباشرُ عبر PostgREST (`from("rooms").delete()`) لا يمرّ
-- بالواجهةِ أصلاً.
--
-- ── ولماذا RESTRICT لا SET NULL ─────────────────────────────
-- القاعدةُ المعلنةُ في المنتج: «لا يمكن حذف غرفة بها نزلاء» — منعٌ
-- لا تفريغٌ صامت. و`set null` كان سيُخرج النزلاءَ من غرفتهم بلا علمِ
-- أحد، فيُبدّل سلوكَ المنتجِ بحجّةِ تسهيلِ الـDDL. و`restrict` هو
-- عينُ ما تفعله الأعمدةُ الخمسةُ الشقيقة، فالجدولُ يعود متّسقاً مع
-- نفسه: الحاويةُ المشغولةُ لا تُحذف، باصاً كانت أو مخيّماً أو رحلةً
-- أو غرفة.
--
-- ── ولا تعارُضَ مع ما سبق ────────────────────────────────────
-- · `delete_season()` تحذف الحجّاجَ **قبل** الغرف، فلا يبقى مُشير
--   عند حذفِ الغرفة. الترتيبُ قائمٌ من قبلُ ولم يُمَسّ.
-- · رايةُ `app.season_maintenance` تُعطّل المحفِّزات لا المفاتيحَ
--   الأجنبيّة — وهذا مقصود: الترتيبُ الصحيحُ يُغني عنها، والقيدُ
--   يبقى شبكةَ أمانٍ لو أُضيف جدولٌ موسميٌّ ونُسي.
-- · الحارسُ الموسميُّ والقيدُ يتكاملان ولا يتداخلان: القيدُ يضمن
--   **الوجود**، والحارسُ يضمن **اتّفاقَ الموسم**. غرفتان موجودتان
--   من موسمين مختلفين يمرّان على القيدِ ويقفان عند الحارس.
-- · لا مساسَ بـRLS ولا بالصلاحيّات ولا بقراءةِ المواسمِ المؤرشفة.

-- ── شرطٌ سابق: لا يتيمَ قبل القيد ───────────────────────────
-- القيدُ يفشل من تلقائه على بياناتٍ يتيمة، لكنّ رسالةَ Postgres
-- عامّةٌ. نُفصح عن العددِ بدل أن يُترك للتخمين — ولا نحذف ولا نُصلح
-- بياناتِ عميلٍ تلقائياً بحال.
do $$
declare v_n integer;
begin
  select count(*) into v_n
    from public.passengers p
   where p.room_id is not null
     and not exists (select 1 from public.rooms r where r.id = p.room_id);
  if v_n > 0 then
    raise exception 'يوجد % حاجّاً يشير إلى غرفةٍ معدومة. تُراجَع هذه الصفوفُ يدوياً قبل إضافة القيد — ولا تُحذف تلقائياً.', v_n
      using errcode = 'P0001';
  end if;
end;
$$;

-- ── القيد ───────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'passengers_room_id_fkey'
  ) then
    alter table public.passengers
      add constraint passengers_room_id_fkey
      foreign key (room_id) references public.rooms(id) on delete restrict;
  end if;
end;
$$;

-- الأعمدةُ الخمسةُ الشقيقةُ مفهرسةٌ من قبلُ، و`room_id` كذلك يحتاج
-- فهرساً: `restrict` يفحص المُشيرين عند كلِّ حذفِ غرفة.
create index if not exists passengers_room_id_idx
  on public.passengers (room_id);

-- ── شرطٌ لاحق: القيدُ قائمٌ بتعريفِه المتوقَّعِ حرفاً بحرف ──────
do $$
declare v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'passengers'
     and c.conname = 'passengers_room_id_fkey';

  if v_def is null then
    raise exception 'القيد passengers_room_id_fkey لم يُركَّب.'
      using errcode = 'P0001';
  end if;

  if v_def <> 'FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT' then
    raise exception 'القيد رُكِّب بتعريفٍ غيرِ المتوقَّع: %', v_def
      using errcode = 'P0001';
  end if;

  -- وأعمدةُ الربطِ الستّةُ صارت كلُّها محروسة
  if (select count(*) from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
       where c.contype = 'f' and t.relname = 'passengers'
         and a.attname in ('bus_id','room_id','camp_mina_id','camp_arafa_id',
                           'flight_id','return_flight_id')) <> 6 then
    raise exception 'أعمدةُ الربطِ الستّةُ ليست كلُّها محروسةً بمفتاحٍ أجنبيّ.'
      using errcode = 'P0001';
  end if;
end;
$$;
