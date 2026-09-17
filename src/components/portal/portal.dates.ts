/* ═══ تواريخُ البوابة — منطقٌ خالصٌ بلا عرض ═══
   نُقلت كما هي في المرحلة الثانية: لا سطرَ تغيّر. */
/* ═══ يومُ عرفة — يُعرَف أو لا يُعرَف، ولا يُختلَق ═══
   يُبحَث عنه في تقويم الجهاز (٩ ذي الحجّة) ضمن نافذةٍ تبدأ قبل
   أربعين يوماً. فإن لم يعرفه الجهاز رجعت `null`.

   ⚠️ وكان الإخفاق يرجع `الآن + ٣٠ يوماً` — تاريخاً مخترعاً يُعرَض
   على الحاجّ كأنّه حقيقة. وأسوأُ من ذلك أنّه كان يحكم **أيَّ رحلةٍ
   تُعرض**، فيخفي رحلة العودة إلى الأبد على جهازٍ لا يعرف التقويم.
   فصار الجهل يُعلَن لا يُملأ: لا عدّاد بدل عدّادٍ كاذب. */
export function getSeasonArafa(): Date | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric", day: "numeric" });
    const start = new Date();
    start.setDate(start.getDate() - 40);
    for (let i = 0; i < 420; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const parts = fmt.formatToParts(d);
      const m = parseInt(parts.find(p => p.type === "month")!.value);
      const dd = parseInt(parts.find(p => p.type === "day")!.value);
      if (m === 12 && dd === 9) { d.setHours(0, 0, 0, 0); return d; }
    }
  } catch { /* متصفّحٌ لا يعرف أمّ القرى */ }
  return null;
}

/* ═══ تواريخُ الرحلة ═══
   القيمةُ المخزَّنة `YYYY-MM-DD` بلا منطقةٍ زمنيّة. فتُقرأ **يوماً
   مدنيّاً** لا لحظةً: نبنيها بالأجزاء لا بـ`new Date(نصّ)` كي لا
   يزحزحها المتصفّح يوماً إلى الوراء بحسب منطقة الجهاز. */
export function civilDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** تاريخٌ عربيٌّ مقروء: «١٨ مايو ٢٠٢٦» — وإن تعذّر رُدَّ كما هو. */
export function fmtDateAr(iso: string | null | undefined): string {
  const d = civilDate(iso);
  if (!d) return iso ? String(iso) : "";
  try {
    return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(d);
  } catch { return String(iso); }
}

/** فرقُ الأيّام بين يومين مدنيّين — للوصول في اليوم التالي. */
export function dayGap(fromIso: string | null | undefined, toIso: string | null | undefined): number {
  const a = civilDate(fromIso), b = civilDate(toIso);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
