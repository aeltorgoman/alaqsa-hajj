/* ═══ دخولُ البوابة — التطبيعُ والتحقّقُ والرسائل ═══
   التطبيعُ هنا نسخةُ `_portal_normalize_doc` في القاعدة: الفراغاتُ المحيطة
   (ومعها NBSP ومحارفُ الاتّجاه)، والأرقامُ العربيّة والفارسيّة، والحالة.
   والقاعدةُ هي المرجع — تطبّع الطرفين (المُدخَل والمخزَّن) — وهذه تجعل
   الواجهةَ ترسل ما ستقارنه القاعدةُ أصلاً، وترفض الشكلَ الفاسد قبل الشبكة.

   M3 — رسالتان لا ثالثة لهما للفشل: بياناتٌ لا تطابق (ولا يُعرف منها هل
   الوثيقةُ موجودة)، أو تعذّرُ الوصول إلى الخادم. وحدُّ المحاولات كما هو. */

export const PORTAL_LOGIN_MESSAGES = {
  invalid: "البيانات غير صحيحة، يرجى المحاولة مرة أخرى",
  network: "تعذر الاتصال بالخادم، يرجى التحقق من الإنترنت والمحاولة مرة أخرى",
} as const;

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, ch => {
    const i = ARABIC_DIGITS.indexOf(ch);
    return String(i >= 0 ? i : PERSIAN_DIGITS.indexOf(ch));
  });
}

const EDGE_SPACE = /^[\s\u200b\u200e\u200f\ufeff]+|[\s\u200b\u200e\u200f\ufeff]+$/g;

export function normalizeDoc(s: string): string {
  return toAsciiDigits(s.replace(EDGE_SPACE, "")).toUpperCase();
}

/* جوازٌ أو هويّة: حروفٌ لاتينيّةٌ وأرقام، وفي الداخل وحده شرطةٌ أو فراغ،
   من ٣ إلى ٣٢ (والقاعدةُ ترفض ما فوق ٣٢ أيضاً). */
export function isValidDoc(normalized: string): boolean {
  return /^[A-Z0-9](?:[A-Z0-9 -]{1,30}[A-Z0-9])$/.test(normalized);
}

/** أرقامُ حقل التاريخ: العربيّةُ والفارسيّةُ ← لاتينيّة، وما سوى الأرقام يُحذف */
export function dobDigits(s: string, max: number): string {
  return toAsciiDigits(s).replace(/[^0-9]/g, "").slice(0, max);
}

export const isValidDay = (v: string) => /^\d{1,2}$/.test(v) && +v >= 1 && +v <= 31;
export const isValidMonth = (v: string) => /^\d{1,2}$/.test(v) && +v >= 1 && +v <= 12;
export const isValidYear = (v: string) => /^\d{4}$/.test(v) && +v >= 1900 && +v <= new Date().getFullYear();

/** تاريخٌ موجودٌ في التقويم (لا ٣١ فبراير) وليس في المستقبل */
export function isValidDob(day: string, month: string, year: string): boolean {
  if (!isValidDay(day) || !isValidMonth(month) || !isValidYear(year)) return false;
  const d = new Date(+year, +month - 1, +day);
  return d.getFullYear() === +year && d.getMonth() === +month - 1 && d.getDate() === +day && d.getTime() <= Date.now();
}
