// ============================================================
// جاهزية الحاجّ — تعريفٌ واحد لكل «نقص»
// ============================================================
// كان السؤال «هل ينقص هذا الحاجّ غرفة؟» يُجاب في أربعة مواضع
// بأربع كتابات: الداشبورد، وعدّاد غرفة العمليات، وفلترها، وبحث
// صفحة الحجاج. فاتفقت الأربعة بالمصادفة لا بالبناء — ومتى اختلفت
// واحدة صار الشاشتان تقولان عن الحاجّ نفسه قولين.
//
// هذه الوحدة **مجال لا عرض**: مفتاحٌ ثابت لكل نقص، ودالّةٌ نقيّة
// تقول هل ينطبق. لا نصوص عربية، ولا أيقونات، ولا ترتيب، ولا شدّة.
// الترتيبُ والتسميةُ والأيقونةُ تبقى لكل شاشة وحدها — الداشبورد
// ملخّصٌ مضغوط، وغرفة العمليات مساحةُ عملٍ مفصّلة، ولا حرج أن
// تختلفا في العرض ما دامتا لا تختلفان في التعريف.
//
// وما ليس هنا مقصودٌ ألّا يكون: «أرقام مكرّرة» شرطٌ بين الحجّاج لا
// شرطُ حاجٍّ واحد، فلا يُقاس بدالّة على صفٍّ واحد ويبقى في غرفة
// العمليات وحدها.
import type { Passenger } from "../types";
import { isExpired, isExpiringSoon, isMissingService } from "./index";

/** مفتاح النقص — هوية ثابتة تعبر بين الشاشات بدل النصّ المترجَم */
export type IssueKey =
  | "expired_passport"
  | "expiring_passport"
  | "missing_phone"
  | "missing_passport"
  | "missing_id"
  | "missing_photo"
  | "missing_ticket"
  | "missing_permit"
  | "missing_hotel"
  | "missing_bus"
  | "missing_mina"
  | "missing_arafah"
  | "missing_flight";

type Predicate = (p: Passenger) => boolean;

/* صلاحية الجواز تمرّ بـ`isExpired`/`isExpiringSoon` وحدهما — وهما
   تبنيان على `parseDate` وتردّان false للفارغ، فلا حاجة لحارس. ولا
   تاريخ ثابت هنا ولا نافذة أيام محسوبة يدوياً. */
const RULES: Record<IssueKey, Predicate> = {
  expired_passport:  p => isExpired(p.expiry),
  /* «يقترب» يستبعد «انتهى»: بندان لا بند واحد مكرّر */
  expiring_passport: p => !isExpired(p.expiry) && isExpiringSoon(p.expiry),

  missing_phone:     p => !p.phone,

  missing_passport:  p => !p.passport_url,
  missing_id:        p => !p.national_id_url,
  missing_photo:     p => !p.photo_url,
  missing_ticket:    p => !p.flight_ticket_url,
  missing_permit:    p => !p.hajj_permit_url,

  /* التوزيعات عبر `isMissingService` وحدها — فهي التي تحفظ
     استثناء «بدون»: من لم يطلب الخدمة لا ينقصه شيء. */
  missing_hotel:     p => isMissingService(p, "hotel_type"),
  missing_bus:       p => isMissingService(p, "bus"),
  missing_mina:      p => isMissingService(p, "camp_mina"),
  missing_arafah:    p => isMissingService(p, "camp_arafa"),
  missing_flight:    p => isMissingService(p, "flight"),
};

/** هل ينطبق هذا النقص على هذا الحاجّ؟ — المصدر الوحيد للحكم */
export function hasIssue(key: IssueKey, p: Passenger): boolean {
  return RULES[key](p);
}

/** الشكل الجاهز للتمرير إلى `filter` — عدٌّ وقائمةٌ من دالّة واحدة */
export function issuePredicate(key: IssueKey): Predicate {
  return RULES[key];
}

/** هل المفتاح القادم من التنقّل مفتاحُ نقصٍ معروف؟ */
export function isIssueKey(v: unknown): v is IssueKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(RULES, v);
}
