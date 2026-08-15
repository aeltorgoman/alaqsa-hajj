import type { Passenger } from "../types";

/* ═══════════════════════════════════════════════════════════════
   تصريح الحج — الشكل المشترك ومقارنة الاسم

   ملف بلا مكوّنات عن قصد: يستعمله المودال وصفحة الحجاج معاً، ولو
   سكن مع المكوّن لكسر التحديث السريع (fast refresh).
   ═══════════════════════════════════════════════════════════════ */

/** ما يُقرأ من التصريح — أي حقل غائب يعود فارغاً */
export type PermitParsed = {
  national_id: string;
  passport_number: string;
  full_name: string;
};

export type PermitConfirmState = {
  /** الملف نفسه لا رابطه: لا رفع قبل التأكيد */
  file: File;
  field: string;
  /** الحاجّ المرشَّح — null إذا تعذّر التحديد بأمان */
  passenger: Passenger | null;
  /** دليل المطابقة، وnull عند الاختيار اليدوي */
  matchedBy: "national_id" | "passport" | null;
  nameMismatch: boolean;
  parsed: PermitParsed;
};

/* ── مقارنة الاسم المستخرَج باسم الحاجّ ──
   الاسم عامل تأكيد لا مفتاح مطابقة، فالمطلوب كشف الاختلاف **الواضح**
   لا التطابق الحرفي: الإملاء يختلف بين وثيقة وأخرى (أ/إ/آ · ة/ه ·
   ى/ي)، والتصريح قد يحمل الاسم الرباعي والقاعدة الثلاثي. فالتطبيع
   يزيل فروق الرسم، والحكم على تقاطع الكلمات: كلمتان مشتركتان أو
   أكثر تكفيان لاعتبار الاسمين متوافقين. */
function normalizeArabic(name: string): string {
  return name
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[ىئ]/g, "ي").replace(/ؤ/g, "و")
    .replace(/[^\p{L}\s]/gu, " ")
    .trim().replace(/\s+/g, " ")
    .toLowerCase();
}

export function namesClearlyDiffer(extracted: string, passenger: Passenger): boolean {
  const candidates = [passenger.name_ar, passenger.short_ar, passenger.name_en]
    .filter(Boolean).map(v => normalizeArabic(String(v)));
  const words = normalizeArabic(extracted).split(" ").filter(w => w.length > 1);
  if (!words.length || !candidates.length) return false;   /* لا بيانات = لا تحذير */
  return !candidates.some(c => {
    const shared = words.filter(w => c.includes(w)).length;
    return shared >= 2 || (shared >= 1 && words.length === 1);
  });
}
