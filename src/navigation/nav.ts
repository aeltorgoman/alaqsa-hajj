// ============================================================
// التنقّل — المصدرُ الواحدُ لبيانات الصفحات
// ============================================================
// معرّفُ الصفحة، واسمُها العربيّ، ووصفُها، وأيقونتُها، وصلاحيتُها —
// في موضعٍ واحد. يقرؤه السايدبار والشريطُ العلويّ وقائمتا ⚙ والرئيسيّةُ
// وحارسُ الصفحات في App، فلا تتباعد تسميةٌ ولا صلاحيةٌ بين موضعين.
// المعرّفاتُ هي هي — لا تُعاد تسميتُها: تُحفَظ في sessionStorage
// وتُرسَل في حدث `hajj_goto_page`.
import type { User } from "../types";

export type PageId =
  | "dash" | "passengers" | "hotel" | "flights" | "buses" | "mina" | "arafa"
  | "admins" | "finance" | "portal" | "reports" | "users" | "archive";

export interface NavPage {
  id: PageId;
  label: string;
  /** سطرُ الوصف في الشريط العلويّ */
  sub: string;
  /** صلاحيةُ الوصول — فارغةٌ = متاحةٌ لكلّ مستخدم */
  perm: string;
  /** محتوى SVG داخل viewBox="0 0 24 24" */
  icon: string;
}

const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  people: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  hotel: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 22v-4h4v4"/>',
  plane: '<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>',
  bus: '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>',
  // منى: خيمة
  tent: '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  // عرفة: جبلٌ (جبل الرحمة) — تمييزٌ بصريٌّ عن خيمة منى
  mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/>',
  staff: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
  // الحسابات: محفظة
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  // بوابة الحاج: هاتف
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
} as const;

export const NAV_ICON = ICONS;

export const NAV_PAGES: Record<PageId, NavPage> = {
  dash:       { id: "dash",       label: "الرئيسية",       sub: "",                                     perm: "",                  icon: ICONS.home },
  passengers: { id: "passengers", label: "الحجاج",         sub: "إدارة بيانات الحجاج",                  perm: "manage_passengers", icon: ICONS.people },
  hotel:      { id: "hotel",      label: "الفندق",         sub: "غرف وإقامة الحجاج",                    perm: "manage_hotel",      icon: ICONS.hotel },
  flights:    { id: "flights",    label: "الطيران",        sub: "رحلات وتذاكر الحجاج",                  perm: "manage_flights",    icon: ICONS.plane },
  buses:      { id: "buses",      label: "الباصات",        sub: "توزيع الحجاج على الحافلات",            perm: "manage_buses",      icon: ICONS.bus },
  mina:       { id: "mina",       label: "مخيمات منى",     sub: "توزيع الحجاج في منى",                  perm: "manage_camps",      icon: ICONS.tent },
  arafa:      { id: "arafa",      label: "مخيمات عرفة",    sub: "توزيع الحجاج في عرفة",                 perm: "manage_camps",      icon: ICONS.mountain },
  admins:     { id: "admins",     label: "الإداريون",      sub: "إدارة فريق الحملة",                    perm: "manage_admins",     icon: ICONS.staff },
  finance:    { id: "finance",    label: "الحسابات",       sub: "مدفوعات وحسابات الحجاج",               perm: "manage_payments",   icon: ICONS.wallet },
  portal:     { id: "portal",     label: "بوابة الحاج",    sub: "التنبيهات وإعدادات بوابة الحاج",       perm: "manage_portal",     icon: ICONS.phone },
  reports:    { id: "reports",    label: "التقارير",       sub: "تقارير وإحصاءات الحملة",               perm: "view_reports",      icon: ICONS.report },
  users:      { id: "users",      label: "الإعدادات",      sub: "إعدادات وبيانات الحملة والمستخدمون",   perm: "manage_users",      icon: ICONS.gear },
  archive:    { id: "archive",    label: "إدارة المواسم",  sub: "إقفال الموسم وتصفّح المواسم السابقة",  perm: "view_archive",      icon: ICONS.calendar },
};

/* ترتيبُ السايدبار المعتمَد. العنوانُ حيث يضيف تسلسلاً حقيقيّاً فقط —
   البنودُ الأساسيّةُ تُعرَض مباشرةً بلا عنوانٍ يكرّر اسمَها. */
export const NAV_LAYOUT: ReadonlyArray<{ section?: string; items: readonly PageId[] }> = [
  { items: ["dash", "passengers"] },
  { section: "التوزيع والتشغيل", items: ["hotel", "flights", "buses", "mina", "arafa", "admins"] },
  { items: ["finance", "portal", "reports"] },
  { section: "الإدارة", items: ["users", "archive"] },
];

/* بياناتُ عنوانٍ لصفحاتٍ خارج التنقّل — تُبقي عنوانَ الشريط العلويّ
   كما كان لمعرّفٍ قديمٍ لا بندَ له. */
const EXTRA_META: Record<string, { label: string; sub: string; icon: string }> = {
  scan: { label: "مسح مستند", sub: "استخراج بيانات جواز السفر", icon: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>' },
};

export function isPageId(id: string): id is PageId {
  return Object.prototype.hasOwnProperty.call(NAV_PAGES, id);
}

export function pageMeta(id: string): { label: string; sub: string; icon: string } {
  if (isPageId(id)) return NAV_PAGES[id];
  return EXTRA_META[id] ?? { label: id, sub: "", icon: "" };
}

/** الصلاحيةُ المطلوبة للصفحة — "" لما لا يشترط شيئاً أو ليس في التنقّل */
export function pagePerm(id: string): string {
  return isPageId(id) ? NAV_PAGES[id].perm : "";
}

export function canAccessPage(user: Pick<User, "permissions">, id: string): boolean {
  const perm = pagePerm(id);
  return !perm || !!user.permissions?.[perm];
}
