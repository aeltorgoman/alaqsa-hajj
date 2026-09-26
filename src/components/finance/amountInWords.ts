// ============================================================
// المبلغُ كتابةً بالعربيّة — للإيصالِ الرسميّ
// ============================================================
/* وحدةٌ خالصةٌ بلا تبعيّات: رقمٌ يدخل ونصٌّ يخرج، فتُختبَر وحدَها.
   والريالُ القطريُّ يتجزّأ إلى **مئةِ درهم**، فالكسرُ دراهمُ لا هللات.

   ⚠️ والإعرابُ هنا ليس تزيّناً: «٢٥ ريالاً» و«٥ ريالات» و«ريالان»
   صيَغٌ يقرؤها المحاسب، وخطؤها يُقرأ إهمالاً في ورقةٍ ماليّة.

   ومسألتان دقيقتان أخطأتُ فيهما أوّلاً وكشفهما الفحص:
     ١) «عشرة آلاف» — والعشرةُ ليست في خانةِ الأحاد.
     ٢) **حالُ الإضافة**: المقياسُ الملاصقُ للمعدودِ يتجرّد من التنوين،
        فـ«عشرون ألفَ ريالٍ» لا «عشرون ألفاً ريال». والملاصقُ هو مقياسُ
        أدنى مجموعةٍ غيرِ صفريّةٍ وحدَه: في ٢٠٥٠٠ المُلاصقُ «خمسمئة»
        فيبقى الألفُ منوَّناً — «عشرون ألفاً وخمسمئة ريال قطري». */

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر",
               "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة",
                  "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"];

/* صيغُ المقياس. و`twoAnnexed` للمثنّى في الإضافة: يسقط نونُه
   («ألفا ريال» لا «ألفان ريال»). */
const SCALES: { one: string; two: string; twoAnnexed: string; few: string; acc: string }[] = [
  { one: "", two: "", twoAnnexed: "", few: "", acc: "" },
  { one: "ألف",   two: "ألفان",   twoAnnexed: "ألفا",   few: "آلاف",   acc: "ألفاً" },
  { one: "مليون", two: "مليونان", twoAnnexed: "مليونا", few: "ملايين", acc: "مليوناً" },
];

/** يكتب عدداً من ١ إلى ٩٩٩ حروفاً. */
function underThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (r >= 10 && r <= 19) parts.push(TEENS[r - 10]);
  else {
    const t = Math.floor(r / 10);
    const o = r % 10;
    /* الوحداتُ قبل العشرات: «خمسةٌ وعشرون» لا «عشرون وخمسة» */
    if (o > 0) parts.push(ONES[o]);
    if (t >= 2) parts.push(TENS[t]);
  }
  return parts.join(" و");
}

/** مجموعةٌ واحدةٌ مع مقياسِها. `annexed` = يليها المعدودُ مباشرةً. */
function groupWithScale(n: number, scaleIndex: number, annexed: boolean): string {
  if (n === 0) return "";
  if (scaleIndex === 0) return underThousand(n);
  const s = SCALES[scaleIndex];
  if (n === 1) return s.one;
  if (n === 2) return annexed ? s.twoAnnexed : s.two;
  /* ٣–١٠ جمعٌ في الحالين · و«عشرة» من الـTEENS لا من الأحاد */
  if (n >= 3 && n <= 10) return `${underThousand(n)} ${s.few}`;
  /* ١١–٩٩ منصوبٌ منوَّنٌ وحدَه، ومجرَّدٌ في الإضافة */
  if (n <= 99) return `${underThousand(n)} ${annexed ? s.one : s.acc}`;
  return `${underThousand(n)} ${s.one}`;
}

function splitGroups(n: number): number[] {
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) { groups.push(rest % 1000); rest = Math.floor(rest / 1000); }
  return groups;
}

/** فهرسُ أدنى مجموعةٍ غيرِ صفريّة — وهي المُلاصقةُ للمعدود. */
function lowestNonZeroGroup(groups: number[]): number {
  for (let i = 0; i < groups.length; i++) if (groups[i] !== 0) return i;
  return 0;
}

/**
 * يكتب عدداً صحيحاً حروفاً.
 * `annexed` يعني أنّ معدوداً يلي العددَ، فيُجرَّد المقياسُ الملاصق.
 */
export function integerToArabicWords(value: number, annexed = false): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "صفر";
  const groups = splitGroups(n);
  const lowest = lowestNonZeroGroup(groups);
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const part = groupWithScale(groups[i], i, annexed && i === lowest);
    if (part) words.push(part);
  }
  return words.join(" و");
}

/* تمييزُ المعدود. إن كانت أدنى مجموعةٍ غيرِ صفريّةٍ مقياساً (ألفٌ أو
   مليون) فالمعدودُ مفردٌ مجرور: «عشرون ألف ريال». وإلا فالقاعدةُ على
   آخرِ مئةٍ من تلك المجموعة. */
function riyalForm(n: number): string {
  const groups = splitGroups(n);
  if (lowestNonZeroGroup(groups) >= 1) return "ريال قطري";
  const r = n % 100;
  if (r === 1) return "ريال قطري";
  if (r === 2) return "ريالان قطريان";
  if (r >= 3 && r <= 10) return "ريالات قطرية";
  if (r >= 11 && r <= 99) return "ريالاً قطريّاً";
  return "ريال قطري";
}

function dirhamForm(n: number): string {
  if (n === 1) return "درهم";
  if (n === 2) return "درهمان";
  if (n >= 3 && n <= 10) return "دراهم";
  return "درهماً";
}

/* الواحدُ والاثنان لا يُذكَر عددُهما: الصيغةُ تحمله.
   «ريال قطري واحد» و«ريالان قطريان» — لا «واحد ريال» ولا «اثنان ريالان». */
function countedPhrase(n: number, form: string, oneSuffix: string): string {
  if (n === 1) return `${form} ${oneSuffix}`;
  if (n === 2) return form;
  return `${integerToArabicWords(n, true)} ${form}`;
}

/**
 * المبلغُ كتابةً كما يُكتب على إيصالٍ رسميّ.
 *   20000   → «فقط عشرون ألف ريال قطري لا غير»
 *   1250.75 → «فقط ألف ومئتان وخمسون ريالاً قطريّاً وخمسة وسبعون درهماً لا غير»
 */
export function amountInArabicWords(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const negative = amount < 0;
  /* التقريبُ على الدرهمِ أوّلاً: ٠٫١+٠٫٢ في الحسابِ العائم ينتج
     ٠٫٣٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٤، فالضربُ المباشرُ يُخرج دراهمَ و«شيئاً». */
  const units = Math.round(Math.abs(amount) * 100);
  const riyals = Math.floor(units / 100);
  const dirhams = units % 100;

  const parts: string[] = [];
  if (riyals > 0)  parts.push(countedPhrase(riyals,  riyalForm(riyals),   "واحد"));
  if (dirhams > 0) parts.push(countedPhrase(dirhams, dirhamForm(dirhams), "واحد"));
  if (parts.length === 0) parts.push("صفر ريال قطري");

  return `فقط ${negative ? "سالب " : ""}${parts.join(" و")} لا غير`;
}
