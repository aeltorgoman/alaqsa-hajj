/* ═══ جمهورُ التنبيه — النوعُ والأدوات (Phase 1) ═══
   يبني `announcements.audience` كما تقبله القاعدة (`_announcement_audience_check`)
   ويصفه لبطاقات الإدارة. ملفٌّ بلا مكوّنات (Fast Refresh). */

export type Audience = {
  all?: boolean;
  types?: string[];
  bus?: number[]; camp_mina?: number[]; camp_arafa?: number[];
  hotel?: number[]; flight?: number[]; pilgrim?: number[];
};
export type IdKey = "bus" | "camp_mina" | "camp_arafa" | "hotel" | "flight" | "pilgrim";
export type Opt = { id: number; name: string; group?: string };
export type Pilgrim = { id: number; name: string; type: string; doc: string };

export const PASSENGER_TYPES = ["حاج", "مرافق", "مشرف", "إداري"] as const;

export const CATS: { key: Exclude<IdKey, "pilgrim">; label: string }[] = [
  { key: "bus", label: "الباصات" },
  { key: "camp_mina", label: "مخيمات منى" },
  { key: "camp_arafa", label: "مخيمات عرفة" },
  { key: "hotel", label: "الفنادق" },
  { key: "flight", label: "الرحلات" },
];

/** تنظيف: لا مفاتيح فارغة، ولا types مطابقة للافتراض (الحجّاج وحدهم). */
export function cleanAudience(a: Audience): Audience {
  const out: Audience = {};
  if (a.all) out.all = true;
  const types = (a.types || []).filter(t => (PASSENGER_TYPES as readonly string[]).includes(t));
  if (types.length && !(types.length === 1 && types[0] === "حاج")) out.types = types;
  for (const k of ["bus", "camp_mina", "camp_arafa", "hotel", "flight", "pilgrim"] as IdKey[]) {
    const v = Array.from(new Set(a[k] || [])).filter(n => Number.isSafeInteger(n) && n > 0);
    if (v.length) out[k] = v;
  }
  return out;
}

export function audienceIsEmpty(a: Audience): boolean {
  return !a.all && !(["bus", "camp_mina", "camp_arafa", "hotel", "flight", "pilgrim"] as IdKey[]).some(k => (a[k] || []).length);
}

/** وصفٌ موجزٌ لبطاقة التنبيه. `names` من خياراتٍ محمّلة؛ وما لم يُحمَّل يُعدّ رقماً. */
export function describeAudience(a: Audience | null | undefined, legacy: { type?: string | null; ids?: number[] | null },
                                 names: Record<string, Record<number, string>>): string {
  if (!a) {
    const t = legacy.type || "all";
    const n = (legacy.ids || []).length;
    return t === "all" ? "جميع الحجاج" : t === "bus" ? `باصات (${n})` : t === "camp_mina" ? `مخيمات منى (${n})`
      : t === "camp_arafa" ? `مخيمات عرفة (${n})` : t === "custom" ? `حجاج محددون (${n})` : "جمهور غير معروف";
  }
  const parts: string[] = [];
  if (a.all) parts.push("جميع الحجاج");
  const label: Record<IdKey, string> = { bus: "باص", camp_mina: "منى", camp_arafa: "عرفة", hotel: "فندق", flight: "رحلة", pilgrim: "حاج" };
  for (const k of ["bus", "camp_mina", "camp_arafa", "hotel", "flight"] as IdKey[]) {
    const ids = a[k] || [];
    if (!ids.length) continue;
    const shown = ids.slice(0, 3).map(id => names[k]?.[id] || `#${id}`).join("، ");
    parts.push(`${label[k]}: ${shown}${ids.length > 3 ? ` +${ids.length - 3}` : ""}`);
  }
  if ((a.pilgrim || []).length) parts.push(`${(a.pilgrim || []).length} حاج محدد`);
  const extra = (a.types || []).filter(t => t !== "حاج");
  if (extra.length) parts.push(`يشمل: ${extra.join("، ")}`);
  return parts.join(" · ") || "—";
}

