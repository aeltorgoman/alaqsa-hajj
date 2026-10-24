// ============================================================
// الاسمُ المختصر — مصدرٌ واحدٌ للشاشة والمطبوع
// ============================================================
/* خرج من `utils/index.ts` بحرفه كي يستورده `utils/passenger.ts` (ومنه
   `src/print`) بلا دورة: `utils/index` يعيد تصدير `src/print`.
   و`utils/index` يعيد تصديره فلا يتغيّر نداءٌ قائم. */
export function makeShort(fullName: string): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return parts.join(" ");
  return [parts[0], parts[1], parts[parts.length - 1]].join(" ");
}
