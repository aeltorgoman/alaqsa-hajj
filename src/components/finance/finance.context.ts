// ============================================================
// سياقُ «المطلوب مقابل المُسنَد» — إخبارٌ محض، لا يدخل أيّ حساب
// ============================================================
import type { Passenger } from "../../types";
import type { AllocTypeMaps } from "./finance.types";
import { paidFlightService } from "./finance.utils";

export type ServiceContextRow = {
  service: string;   // اسم الخدمة
  wanted: string;    // ما طُلب ودُفع — وهو وحده ما يُحسب
  actual: string;    // ما أُسنِد فعلاً، أو حالُ عدم الإسناد
  mismatch: boolean; // طُلبت درجةٌ وأُسنِد غيرها
};

/* ⚠️ لا يُحسَب من هذا شيء. الحاجّ يُحاسَب على ما طلبه ودفعه، فلو طلب
   باص VIP وأُسنِد إلى عاديّ فالمبلغ لا ينقص — لكنّ الموظّف يرى
   التفاوت في الشاشة التي يُقرَّر فيها المال. ولا صفوفَ إلا حيث
   يوجد تفاوتٌ حقيقيّ أو خدمةٌ ممتازةٌ لم تُسنَد بعد. */
export function serviceContextRows(p: Passenger, maps: AllocTypeMaps): ServiceContextRow[] {
  const rows: ServiceContextRow[] = [];

  const add = (service: string, wanted: string, premium: boolean, id: number | null | undefined, actualType: string | undefined) => {
    if (!premium) return;                       // العاديّ لا تفاوتَ فيه يُقال
    if (id == null) { rows.push({ service, wanted, actual: "لم يُسنَد بعد", mismatch: false }); return; }
    if (actualType === undefined) return;       // تصنيفٌ غير معروف — لا يُخترع له قول
    if (actualType !== wanted) rows.push({ service, wanted, actual: actualType, mismatch: true });
  };

  const s = p.services;
  add("الباص",      "VIP",  s.bus === "VIP",         p.bus_id,         maps.bus.get(p.bus_id ?? -1));
  add("مخيّم منى",  "خاص",  s.camp_mina === "خاص",   p.camp_mina_id,   maps.camp.get(p.camp_mina_id ?? -1));
  add("مخيّم عرفة", "خاص",  s.camp_arafa === "خاص",  p.camp_arafa_id,  maps.camp.get(p.camp_arafa_id ?? -1));
  add("الغرفة",     s.hotel_type, s.hotel_type === "خاص", p.room_id,   maps.room.get(p.room_id ?? -1));

  /* الطيران: `Flight.type` اتّجاهٌ لا درجة، فلا تفاوتَ درجةٍ يُقاس.
     والمقصود هنا حالُ الحجز وحدها — والمبلغ مستقلٌّ عنها تماماً. */
  const fp = paidFlightService(p);
  if (fp === "درجة أولى") {
    const legs = [p.flight_id != null ? "ذهاب" : "", p.return_flight_id != null ? "إياب" : ""].filter(Boolean);
    rows.push({
      service: "الطيران",
      wanted: "درجة أولى",
      actual: legs.length === 2 ? "محجوز ذهاباً وإياباً" : legs.length === 1 ? `محجوز ${legs[0]} فقط` : "لم يُحجَز بعد",
      mismatch: false,
    });
  }
  return rows;
}
