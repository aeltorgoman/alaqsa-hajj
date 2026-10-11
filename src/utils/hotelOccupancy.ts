/* ═══ MOD-001 — إشغالُ الفنادق وطلبُها مقابلَ الفعليّ ═══
   مصدرٌ واحدٌ لأرقام تقرير الفندق في صفحة التقارير: الشاشة وExcel
   والطباعة تقرأ منه، فلا ثلاثُ حساباتٍ تفترق.

   القواعد:
   · السعةُ `roomCapacity()` المعتمَدة. غرفةٌ بلا سعةٍ محدّدة («خاص»
     بلا سعة) أو بلا حدّ («مجلس» = 0) لا تدخل الأَسِرّة ولا الشاغرَ ولا
     النسبة — تُعَدّ وحدَها وساكنوها وحدَهم، ولا تُخترع لها سعة.
   · الأَسِرّةُ يشغلها كلُّ ساكنٍ (حاجّاً أو إداريّاً) — قاعدةُ حالة الغرفة
     القائمة. و«الحجّاج» `isHajj` وحدهم؛ والإداريّون عددٌ مستقلّ.
   · الفعليّ: `room_id → rooms.hotel_id`. والمطلوب: `requested_hotel_id`.
     ولا يُنسب حاجٌّ إلى فندقٍ لا تدلّ عليه غرفتُه: غرفةٌ بلا فندق دلوٌ
     مستقلّ، وغرفةٌ غيرُ محمَّلة «غيرُ معروفة» لا تُحسب لأحد.
   · المطلوبُ عددٌ منفصلٌ تماماً عن الإشغال، والفروقُ للحجّاج وحدهم.
   · مجموعُ الموسم = مجموعُ الفنادق + دلوِ الغرف بلا فندق، حرفاً بحرف. */
import type { Hotel, Passenger, Room } from "../types";
import { roomCapacity } from "./room";
import { isHajj } from "./passenger";

export type OccupancyRow = {
  key: string;                // `hotel:<id>` · `unlinked` · `season`
  label: string;
  hotelId: number | null;
  rooms: number;
  capacity: number;           // أَسِرّةُ الغرف ذات السعة المحدّدة
  occupants: number;          // كلُّ الساكنين (حجّاج وإداريّون)
  pilgrims: number;           // الحجّاج الساكنون فعلاً
  staff: number;              // الإداريّون ومن في حكمهم الساكنون
  available: number;          // شاغرُ الغرف ذات السعة (لا سالب)
  overCapacity: number;       // زيادةُ الساكنين على السعة
  occupancyPct: number | null; // ساكنو الغرف ذات السعة ÷ السعة
  uncappedRooms: number;      // غرفٌ بلا سعةٍ محدّدة أو بلا حدّ
  uncappedOccupants: number;
  // الطلبُ مقابلَ الفعليّ (حجّاج)
  requested: number;          // طلبوا هذا الفندق
  requestedHousedHere: number;
  requestedHousedElsewhere: number; // في فندقٍ آخر
  requestedInUnlinked: number;      // في غرفةٍ بلا فندق
  requestedUnassigned: number;      // بلا غرفة
  housedFromOther: number;          // ساكنون هنا وطلبوا غيرَه أو لم يطلبوا
};

export type OccupancyReport = {
  hotels: OccupancyRow[];     // بترتيب فنادق الموسم
  unlinked: OccupancyRow | null; // غرفٌ بلا فندقٍ مربوط — إن وُجدت
  season: OccupancyRow;
  pilgrimsTotal: number;
  pilgrimsUnassigned: number;
  pilgrimsNoRequest: number;      // بلا فندقٍ مطلوب
  pilgrimsMismatched: number;     // ساكنٌ في فندقٍ غيرِ المطلوب
  pilgrimsUnknownRoom: number;    // غرفتُه غيرُ محمَّلة — لا تُنسب لأحد
};

const empty = (key: string, label: string, hotelId: number | null): OccupancyRow => ({
  key, label, hotelId, rooms: 0, capacity: 0, occupants: 0, pilgrims: 0, staff: 0, available: 0,
  overCapacity: 0, occupancyPct: null, uncappedRooms: 0, uncappedOccupants: 0,
  requested: 0, requestedHousedHere: 0, requestedHousedElsewhere: 0, requestedInUnlinked: 0,
  requestedUnassigned: 0, housedFromOther: 0,
});

export const UNLINKED_LABEL = "غرف بلا فندق مربوط";

export function computeHotelOccupancy(
  rooms: readonly Room[], hotels: readonly Hotel[], passengers: readonly Passenger[],
): OccupancyReport {
  const byHotel = new Map<number, OccupancyRow>();
  hotels.forEach(h => byHotel.set(h.id, empty(`hotel:${h.id}`, h.name, h.id)));
  const unlinked = empty("unlinked", UNLINKED_LABEL, null);
  const roomById = new Map(rooms.map(r => [r.id, r]));
  const occupantsOf = new Map<number, Passenger[]>();
  for (const p of passengers) {
    if (p.room_id == null || !roomById.has(p.room_id)) continue;
    occupantsOf.set(p.room_id, [...(occupantsOf.get(p.room_id) ?? []), p]);
  }
  /* غرفةٌ تشير إلى فندقٍ غيرِ محمَّل لا تُنسب إليه ولا تسقط: تدخل دلوَ
     «بلا فندق» فيبقى مجموعُ الموسم صادقاً. (لا يقع حين يُحمَّل الاثنان معاً.) */
  const bucketOf = (r: Room) => (r.hotel_id != null && byHotel.get(r.hotel_id)) || unlinked;

  for (const r of rooms) {
    const b = bucketOf(r);
    const occ = occupantsOf.get(r.id) ?? [];
    const cap = roomCapacity(r);
    b.rooms++;
    b.occupants += occ.length;
    for (const p of occ) { if (isHajj(p)) b.pilgrims++; else b.staff++; }
    if (cap != null && cap > 0) {
      b.capacity += cap;
      b.available += Math.max(0, cap - occ.length);
      b.overCapacity += Math.max(0, occ.length - cap);
    } else {
      b.uncappedRooms++;
      b.uncappedOccupants += occ.length;
    }
  }

  let pilgrimsTotal = 0, pilgrimsUnassigned = 0, pilgrimsNoRequest = 0, pilgrimsMismatched = 0, pilgrimsUnknownRoom = 0;
  for (const p of passengers) {
    if (!isHajj(p)) continue;
    pilgrimsTotal++;
    const req = p.requested_hotel_id ?? null;
    const reqRow = req != null ? byHotel.get(req) : undefined;
    if (req == null) pilgrimsNoRequest++;
    if (reqRow) reqRow.requested++;
    if (p.room_id == null) {
      pilgrimsUnassigned++;
      if (reqRow) reqRow.requestedUnassigned++;
      continue;
    }
    const room = roomById.get(p.room_id);
    if (!room) { pilgrimsUnknownRoom++; continue; }
    const actRow = bucketOf(room);
    if (actRow === unlinked) {
      if (reqRow) reqRow.requestedInUnlinked++;
      continue;
    }
    if (reqRow === actRow) { reqRow.requestedHousedHere++; continue; }
    actRow.housedFromOther++;
    if (reqRow) { reqRow.requestedHousedElsewhere++; pilgrimsMismatched++; }
  }

  const pct = (b: OccupancyRow) => { b.occupancyPct = b.capacity > 0 ? Math.round(((b.occupants - b.uncappedOccupants) / b.capacity) * 1000) / 10 : null; };
  const hotelRows = hotels.map(h => byHotel.get(h.id)!);
  const season = empty("season", "إجمالي الموسم", null);
  for (const b of [...hotelRows, unlinked]) {
    pct(b);
    (["rooms", "capacity", "occupants", "pilgrims", "staff", "available", "overCapacity", "uncappedRooms", "uncappedOccupants",
      "requested", "requestedHousedHere", "requestedHousedElsewhere", "requestedInUnlinked", "requestedUnassigned", "housedFromOther"] as const)
      .forEach(k => { season[k] += b[k]; });
  }
  pct(season);
  return {
    hotels: hotelRows,
    unlinked: unlinked.rooms > 0 ? unlinked : null,
    season, pilgrimsTotal, pilgrimsUnassigned, pilgrimsNoRequest, pilgrimsMismatched, pilgrimsUnknownRoom,
  };
}
