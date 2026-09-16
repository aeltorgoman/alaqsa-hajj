// ============================================================
// خياراتُ الطباعة — نموذجٌ واحدٌ لكلّ التقارير، لا نموذجٌ لكلّ تقرير
// ============================================================
/* R2 جعل ما يحيط بالجسم **قدرةً** في `PrintChrome`. وهذا الملفّ يفتح
   تلك القدرةَ للموظّف: أيَّ خيارٍ يملكه كلُّ تقرير، وعلى أيّ حالٍ
   يبدأ، وكيف تتحوّل اختياراتُه إلى `PrintChrome`.

   ⚠️ وثلاث قواعدَ تحكمه:

   ١) **عرضٌ لا بيانات.** لا خيارَ هنا يمسّ صفّاً ولا حساباً ولا فرزاً
      ولا ترتيباً ولا صلاحية. ما يتغيّر هو ما يُرى على الورق فقط.

   ٢) **الافتراضُ هو المعتمَد.** أوّلُ طبعةٍ بلا فتحِ الخيارات تُخرج
      الورقةَ التي قُبلت في المعاينة — ولذلك تختلف الافتراضاتُ من
      تقريرٍ إلى تقرير: المستنداتُ بلا ترويسة، والباصُ بلا ترقيم،
      والماليّةُ بترقيم. فالافتراضُ يصف ما هو كائن، لا ما هو «أجمل».

   ٣) **لا تُعرَض قدرةٌ لا تصحّ.** ترقيمُ الصفحات لا يُعرَض على مستندٍ
      متدفّقٍ (كشف الحجاج، كشف الطيران) لأنّ المتصفّحَ لا يرقّم تدفّقاً
      ترقيماً صادقاً — انظر `print.chrome.ts`. ونطاقُ الفرز لا يُعرَض
      إلا حيث له معنًى. */
import type { PrintChrome, HeaderMode, PrintSeason } from "./print.chrome";

/** الخياراتُ الخمسة المعتمَدة — ولا سادسَ لها. */
export type PrintOptionKey = "header" | "season" | "issuedAt" | "pageNumbers" | "scope";

export type PrintOptionsState = Record<PrintOptionKey, boolean>;

/** ما يملكه تقريرٌ بعينه: الخياراتُ المتاحة له، وحالُها الابتدائيّ. */
export type PrintOptionsSpec = {
  /** الخياراتُ التي تُعرَض لهذا التقرير — بهذا الترتيب. */
  available: PrintOptionKey[];
  /** الحالُ الابتدائيّ = المظهرُ المعتمَد لهذا التقرير بالضبط. */
  defaults: PrintOptionsState;
  /** نمطُ الترويسة حين تُشعَل — كاملةٌ أو مضغوطة. */
  headerMode?: Exclude<HeaderMode, "none">;
};

const OFF: PrintOptionsState = {
  header: false, season: false, issuedAt: false, pageNumbers: false, scope: false,
};
const state = (on: Partial<PrintOptionsState>): PrintOptionsState => ({ ...OFF, ...on });

/** تسمياتُ الخيارات كما يقرأها الموظّف. */
export const PRINT_OPTION_LABEL: Record<PrintOptionKey, string> = {
  header:      "إظهار الترويسة / الهوية",
  season:      "إظهار الموسم",
  issuedAt:    "إظهار تاريخ الطباعة",
  pageNumbers: "إظهار أرقام الصفحات",
  scope:       "إظهار نطاق / فلاتر التقرير",
};

/* ═══ مواصفاتُ التقارير ═══
   ولا فندقَ هنا: مطبوعُه أُقفل بشكله المقبول، فلا خيارَ يُعرَض عليه.
   ولا مطبوعاتِ شنطٍ ولا إيصالَ دفعة — لكلٍّ هندستُه المعتمَدة. */

/** الكشوفُ التشغيليّة: الموسمُ في سطر العنوان، ولا ترقيمَ ولا ترويسةَ افتراضاً. */
const OPERATIONAL: PrintOptionsSpec = {
  available: ["header", "season", "issuedAt", "pageNumbers"],
  defaults: state({ season: true }),
  headerMode: "compact",
};

export const PRINT_SPECS = {
  bus:   OPERATIONAL,
  mina:  OPERATIONAL,
  arafa: OPERATIONAL,
  /* الرحلات: الترويسةُ والترقيمُ جزءٌ من المطبوع المقبول */
  flights: {
    available: ["header", "season", "issuedAt", "pageNumbers"],
    defaults: state({ header: true, season: true, pageNumbers: true }),
    headerMode: "full",
  } as PrintOptionsSpec,
  /* كشفُ الطيران مستندٌ متدفّق: لا ترقيمَ يُعرَض عليه */
  airline: {
    available: ["header", "season", "issuedAt"],
    defaults: state({ header: true, season: true }),
    headerMode: "full",
  } as PrintOptionsSpec,
  /* كشفُ الحجاج متدفّقٌ كذلك، وله نطاقُ فرزٍ ذو معنى */
  pilgrims: {
    available: ["header", "season", "issuedAt", "scope"],
    defaults: state({ header: true, season: true, scope: true }),
    headerMode: "full",
  } as PrintOptionsSpec,
  /* المالية: صفحاتُها مبنيّةٌ مصفوفةً فالترقيمُ يصحّ عليها */
  finance: {
    available: ["header", "season", "issuedAt", "pageNumbers"],
    defaults: state({ header: true, season: true, pageNumbers: true }),
    headerMode: "full",
  } as PrintOptionsSpec,
  /* المستندات: مظهرُها المقبول بلا ترويسةٍ ولا حواشٍ — فكلُّها مطفأة */
  documents: {
    available: ["header", "season", "issuedAt", "pageNumbers"],
    defaults: { ...OFF },
    headerMode: "compact",
  } as PrintOptionsSpec,
} as const satisfies Record<string, PrintOptionsSpec>;

export type PrintReportKey = keyof typeof PRINT_SPECS;

/** حالٌ ابتدائيّةٌ لتقرير — نسخةٌ مستقلّة لا مرجعٌ مشترك. */
export const initialPrintOptions = (key: PrintReportKey): PrintOptionsState =>
  ({ ...PRINT_SPECS[key].defaults });

/** ما يُغذّي الخيارات من بيانات التقرير — لا يُخترَع منها شيء. */
export type PrintOptionInputs = {
  season?: PrintSeason;
  scope?: string | null;
  resultCount?: { label: string; value: number } | null;
};

/** تحويلُ اختيارِ الموظّف إلى `PrintChrome` — الجسرُ الوحيد بينهما.
 *
 *  والمطفأُ يُحذَف لا يُمرَّر فارغاً: `season: undefined` يعني «لا موسمَ
 *  على الورقة»، فينغلق سطرُ العنوان الثانويّ من نفسه ولا يترك فراغاً. */
export function chromeFromOptions(
  key: PrintReportKey, opts: PrintOptionsState, inputs: PrintOptionInputs = {},
): PrintChrome {
  const spec = PRINT_SPECS[key];
  const can = (k: PrintOptionKey) => spec.available.includes(k) && opts[k];
  return {
    header: can("header") ? (spec.headerMode ?? "compact") : "none",
    season: can("season") ? inputs.season : undefined,
    issuedAt: can("issuedAt"),
    pageNumbers: can("pageNumbers"),
    scope: can("scope") ? (inputs.scope ?? null) : null,
    /* عدُّ النتائج يتبع نطاقَ الفرز: كلاهما وصفٌ لما يحويه المطبوع */
    resultCount: can("scope") ? (inputs.resultCount ?? null) : null,
  };
}
