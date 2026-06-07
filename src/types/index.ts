export interface Passenger {
  id: number; name_ar: string; name_en: string; short_ar: string; short_en: string;
  passport: string; national_id: string; nat: string; dob: string; expiry: string;
  gender: string; phone: string;
  services: { bus: string; flight: string; hotel_type: string; hotel_view: string; camp_mina: string; camp_arafa: string; };
  rel: string; linked: number;
  photo_url?: string; passport_url?: string; national_id_url?: string;
  contract_url?: string; id_expiry?: string;
  bus_id?: number | null; camp_mina_id?: number | null; camp_arafa_id?: number | null;
  room_id?: number | null; family_id?: string | null;
  flight_id?: number | null; flight_class?: string | null;
}

export interface User { id: number; name: string; username: string; password: string; permissions: Record<string, boolean>; }
export interface Bus { id: number; name: string; type: string; }
export interface Camp { id: number; name: string; gender: "ذكر" | "أنثى"; type: "عادي" | "خاص"; page_type: string; }
export interface Room { id: number; number: string; floor: string; type: "ثنائية" | "ثلاثية" | "رباعية" | "سويت"; }
export interface Flight { id: number; name: string; type: "ذهاب" | "إياب"; airline: string; date: string; time: string; from_airport: string; to_airport: string; }

export const ALL_PERMISSIONS = [
  { key: "add_passenger", label: "إضافة حجاج" },
  { key: "edit_passenger", label: "تعديل حجاج" },
  { key: "delete_passenger", label: "حذف حجاج" },
  { key: "view_passengers", label: "عرض الحجاج" },
  { key: "manage_buses", label: "إدارة الباصات" },
  { key: "manage_camps", label: "إدارة المخيمات" },
  { key: "manage_hotel", label: "إدارة الفندق" },
  { key: "view_reports", label: "عرض التقارير" },
  { key: "export_reports", label: "تصدير التقارير" },
  { key: "print_reports", label: "طباعة التقارير" },
  { key: "manage_users", label: "إدارة المستخدمين" },
  { key: "view_archive", label: "عرض الأرشيف" },
  { key: "manage_flights", label: "إدارة الطيران" },
];

export const ROOM_TYPES = ["ثنائية", "ثلاثية", "رباعية", "سويت"] as const;

export const ROOM_COLORS: Record<string, [string, string]> = {
  "ثنائية": ["#E6F1FB", "#0C447C"],
  "ثلاثية": ["#FAEEDA", "#633806"],
  "رباعية": ["#E1F5EE", "#085041"],
  "سويت": ["#EEEDFE", "#3C3489"],
};

export const NAV = [
  { section: "الرئيسية", items: [{ id: "dash", label: "🏠 الرئيسية", perm: "" }] },
  { section: "التنظيم", items: [
    { id: "passengers", label: "🕌 الحجاج", perm: "view_passengers" },
    { id: "buses", label: "🚌 الباصات", perm: "manage_buses" },
    { id: "flights", label: "✈️ الطيران", perm: "manage_flights" },
    { id: "mina", label: "⛺ مخيمات منى", perm: "manage_camps" },
    { id: "arafa", label: "🏔 مخيمات عرفة", perm: "manage_camps" },
    { id: "hotel", label: "🏨 الفندق", perm: "manage_hotel" },
  ]},
  { section: "التقارير", items: [{ id: "reports", label: "📄 التقارير", perm: "view_reports" }] },
  { section: "الأرشيف", items: [{ id: "archive", label: "🗄 الأرشيف", perm: "view_archive" }] },
  { section: "الإعدادات", items: [{ id: "users", label: "👥 المستخدمين", perm: "manage_users" }] },
];

export const inp = { fontSize: 12, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 8, padding: "7px 10px", width: "100%", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };
export const btnP = (extra?: any) => ({ background: "#1D9E75", color: "white", border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500, ...extra });
export const btnS = (extra?: any) => ({ background: "transparent", border: "0.5px solid #ddd", padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#333", ...extra });
