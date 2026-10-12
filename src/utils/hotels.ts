/* ═══ MOD-001 — أسماءُ الفنادق والغرف للعرض ═══
   رقمُ الغرفة لم يعد يكفي وحده: الرقمُ نفسُه قد يتكرّر في فندقٍ آخر
   من فنادق الموسم. فكلُّ تسميةٍ تُعرض خارج صفحة الفندق الواحد تحمل
   اسمَ الفندق — من هنا، لا بصياغةٍ ثانية في كلّ صفحة. */
import type { Hotel, Room } from "../types";

export function hotelNameOf(hotels: readonly Hotel[], id: number | null | undefined): string | null {
  if (id == null) return null;
  return hotels.find(h => h.id === id)?.name ?? null;
}

/** «فندق الصفوة · ط1 · غرفة 101» — والفندقُ يسقط حين لا يُعرف (غرفةٌ لم تُربط بعد). */
export function roomLabel(room: Pick<Room, "number" | "floor" | "hotel_id">, hotels: readonly Hotel[]): string {
  const hotel = hotelNameOf(hotels, room.hotel_id);
  const parts = [hotel ?? "بلا فندق", room.floor ? `ط${room.floor}` : null, `غرفة ${room.number}`];
  return parts.filter(Boolean).join(" · ");
}
