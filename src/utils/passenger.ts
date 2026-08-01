// ============================================================
// العقد الوحيد لكائن الحاج داخل التطبيق
// ============================================================
// كل تحويل من صف قاعدة البيانات إلى Passenger يمرّ من هنا حصراً،
// سواء جاء الصف من الجلب الأولي أو من حدث Realtime أو من نتيجة
// insert/update. فلا توجد أشكال متعددة للكائن نفسه.
import { supabase } from "../supabase";
import type { Passenger } from "../types";
import type { Database } from "../types/database";

/* صف جدول passengers كما تولّده Supabase — مصدر الحقيقة لشكل
   البيانات القادمة من القاعدة */
export type PassengerRow = Database["public"]["Tables"]["passengers"]["Row"];

const PASSENGER_TYPES = ["حاج", "مرافق", "مشرف", "إداري"] as const;
type PassengerType = (typeof PASSENGER_TYPES)[number];

function toPassengerType(value: string | null): PassengerType {
  return (PASSENGER_TYPES as readonly string[]).includes(value ?? "")
    ? (value as PassengerType)
    : "حاج";
}

export function mapPassenger(p: PassengerRow): Passenger {
  return {
  id: p.id, name_ar: p.name_ar || "", name_en: p.name_en || "",
  short_ar: p.short_ar || "", short_en: p.short_en || "",
  passport: p.passport || "", national_id: p.national_id || "",
  nat: p.nat || "", dob: p.dob || "", expiry: p.expiry || "",
  gender: p.gender || "", phone: p.phone || "",
  services: { bus: p.bus || "عادي", flight: p.flight || "عادي", hotel_type: p.hotel_type || "ثنائية", hotel_view: p.hotel_view || "مطلة", camp_mina: p.camp_mina || "عادي", camp_arafa: p.camp_arafa || "عادي", custom_price: p.custom_price != null ? String(p.custom_price) : "" },
  rel: "", linked: -1,
  photo_url: p.photo_url || "", id_expiry: p.id_expiry || "",
  national_id_url: p.national_id_url || "", contract_url: p.contract_url || "",
  passport_url: p.passport_url || "",
  hajj_permit_url: p.hajj_permit_url || "", flight_ticket_url: p.flight_ticket_url || "",
  bus_id: p.bus_id || null, camp_mina_id: p.camp_mina_id || null,
  camp_arafa_id: p.camp_arafa_id || null, room_id: p.room_id || null,
  family_id: p.family_id || null,
  flight_id: p.flight_id || null, flight_class: p.flight_class || undefined,
  return_flight_id: p.return_flight_id || null,
  sort_order: p.sort_order || 0,
  passenger_type: toPassengerType(p.passenger_type),
  wants_flight: p.wants_flight || false,
  /* حقول كانت تُسقَط صامتاً فتُعطَّل ميزة التدقيق في PassengersPage */
  season_id: p.season_id ?? null,
  created_at: p.created_at,
  created_by: p.created_by ?? null,
  updated_by: p.updated_by ?? null,
  updated_at: p.updated_at ?? null,
  };
}
/* ترتيب موحّد: نفس ترتيب الجلب الأولي (sort_order ثم id) */
export function sortPassengers(list: Passenger[]): Passenger[] {
  return [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
}

/* دمج حاج واحد في القائمة بصورة لا تتأثر بالتكرار: إن كان موجوداً
   يُستبدل، وإلا يُضاف ثم يُعاد الفرز. تستدعيها كل المسارات التي
   قد تصل بالتوازي — الإدراج المحلي وحدث Realtime — فيصير ترتيب
   وصولها غير مؤثر ولا ينشأ صفّان لنفس الحاج. */
export function upsertPassenger(list: Passenger[], passenger: Passenger): Passenger[] {
  return list.some(p => p.id === passenger.id)
    ? list.map(p => (p.id === passenger.id ? passenger : p))
    : sortPassengers([...list, passenger]);
}

/* هل هذا الشخص حاج؟ — السجلّ بلا passenger_type يُعدّ حاجاً، وهو
   الافتراض القائم في القاعدة منذ ما قبل إضافة العمود. كان هذا
   الشرط مكرراً حرفياً في 39 موضعاً عبر 11 ملفاً. */
export function isHajj(p: { passenger_type?: string | null }): boolean {
  return !p.passenger_type || p.passenger_type === "حاج";
}

/* تحديثات ترتيب الحجاج — تُرجع الوعود ليفحصها writeAllOk عند
   الاستدعاء، فلا تبتلع الأخطاء. كانت مكررة حرفياً في BusesPage
   وCampsPage. */
export function sortOrderUpdates(items: { id: number; sort_order: number }[]) {
  return items.map(item =>
    supabase.from("passengers").update({ sort_order: item.sort_order }).eq("id", item.id)
  );
}
