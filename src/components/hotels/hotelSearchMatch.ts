// مطابقةُ البحث الموحّد في الفنادق: الاسمُ العربيّ (الكامل أو المختصر) كما في
// بقيّة الصفحات، ورقمُ الجواز بلا اعتبارٍ لحالة الأحرف
import type { Passenger } from "../../types";
import { matchesPassenger } from "../allocation/useAllocation";

export const matchesHotelSearch = (p: Pick<Passenger, "name_ar" | "short_ar" | "passport">, q: string) => {
  const t = q.trim();
  if (!t) return true;
  return matchesPassenger(p, t) || (p.passport || "").toLowerCase().includes(t.toLowerCase());
};
