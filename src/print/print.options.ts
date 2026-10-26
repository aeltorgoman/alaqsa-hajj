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
import type { PrintSeals } from "./print.seals";
import type { PrintBankLine } from "./print.bank";

/** الخياراتُ الخمسة المعتمَدة للحواشي، وسادسٌ خاصٌّ بكشف الفندق:
 *  `summary` سطرُ أرقامٍ عن الغرف المطبوعة — لا يُعرَض على غيره.
 *  و`stamp`/`signature` ختمُ الشركة والتوقيعُ المعتمد على كلّ ورقة
 *  (`print.seals.ts`)، و`bank` بياناتُ البنك والسداد لكشف الحساب وحده. */
export type PrintOptionKey = "header" | "season" | "issuedAt" | "pageNumbers" | "scope" | "summary"
  | "stamp" | "signature" | "bank";

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
  header: false, season: false, issuedAt: false, pageNumbers: false, scope: false, summary: false,
  stamp: false, signature: false, bank: false,
};
const state = (on: Partial<PrintOptionsState>): PrintOptionsState => ({ ...OFF, ...on });

/** تسمياتُ الخيارات كما يقرأها الموظّف. */
export const PRINT_OPTION_LABEL: Record<PrintOptionKey, string> = {
  header:      "إظهار الترويسة / الهوية",
  season:      "إظهار الموسم",
  issuedAt:    "إظهار تاريخ الطباعة",
  pageNumbers: "إظهار أرقام الصفحات",
  scope:       "إظهار نطاق / فلاتر التقرير",
  summary:     "إظهار الملخص الإحصائي",
  stamp:       "إظهار ختم الشركة",
  signature:   "إظهار التوقيع المعتمد",
  bank:        "إظهار بيانات البنك والسداد",
};

/* ═══ مواصفاتُ التقارير ═══
   ولا مطبوعاتِ شنطٍ ولا ملصقات — لكلٍّ هندستُه المعتمَدة. والختمُ والتوقيعُ
   مطفآن افتراضاً في كلّ تقريرٍ لم يكن يعرضهما، فأوّلُ طبعةٍ كما كانت.
   ولا ختمَ على صور المستندات الرسميّة (الجواز والهويّة): `documents` بلا خيارَيه. */
const SEALS: PrintOptionKey[] = ["stamp", "signature"];

/** الكشوفُ التشغيليّة: الموسمُ في سطر العنوان، ولا ترقيمَ ولا ترويسةَ افتراضاً. */
const OPERATIONAL: PrintOptionsSpec = {
  available: ["header", "season", "issuedAt", "pageNumbers", ...SEALS],
  defaults: state({ season: true }),
  headerMode: "compact",
};

export const PRINT_SPECS = {
  bus:   OPERATIONAL,
  mina:  OPERATIONAL,
  arafa: OPERATIONAL,
  /* ⚠️ ما كانت ترويستُه الكاملةُ تحمل تاريخاً قبل الخيارات يبدأ
     بـ`issuedAt: true` — فالخيارُ يصف ما هو كائنٌ على الورق، لا ما
     نتمنّاه. وإطفاؤه يُخفي ذاك التاريخَ نفسَه في موضعه، ولا يُنشئ
     تاريخاً ثانياً في غيره. */
  /* الرحلات: الترويسةُ والترقيمُ والتاريخُ جزءٌ من المطبوع المقبول */
  flights: {
    available: ["header", "season", "issuedAt", "pageNumbers", ...SEALS],
    defaults: state({ header: true, season: true, issuedAt: true, pageNumbers: true }),
    headerMode: "full",
  } as PrintOptionsSpec,
  /* كشفُ الطيران مستندٌ متدفّق: لا ترقيمَ يُعرَض عليه */
  airline: {
    available: ["header", "season", "issuedAt", ...SEALS],
    defaults: state({ header: true, season: true, issuedAt: true }),
    headerMode: "full",
  } as PrintOptionsSpec,
  /* كشفُ الحجاج متدفّقٌ كذلك، وله نطاقُ فرزٍ ذو معنى */
  pilgrims: {
    available: ["header", "season", "issuedAt", "scope", ...SEALS],
    defaults: state({ header: true, season: true, issuedAt: true, scope: true }),
    headerMode: "full",
  } as PrintOptionsSpec,
  /* ⚠️ المالية بلا ترقيمِ صفحات — وهذا قرارُ صدقٍ لا نقصُ إنجاز.
     مستنداتُها تُقطَّع بعدد الصفوف (`PER_PAGE = 30`) لا بقياس الورقة،
     وذاك **تخمينٌ لارتفاع الصفّ** لا قياسٌ له. وقد جُرّب: ثلاثون صفّاً
     تُعلن كتلةً واحدةً وتطبع ورقتين؛ وستّون صفّاً بأسماءٍ طويلةٍ تُعلن
     كتلتين وتطبع أربعاً؛ وسجلُّ الدفعات يزيد سطرَ المدّة وملخّصَ الطرق
     خارج الكتل فيزيد ورقة. فأربعٌ من سبعِ حالاتٍ مُختبَرة يكذب فيها
     الرقم. ورقمٌ كاذبٌ على ورقةٍ ماليّة أسوأُ من لا رقم.

     وتصحيحُه يقتضي إعادةَ بناء مستندات المالية أوراقاً ذرّيّةً كما
     صُنع بالفندق — وذاك خارجُ نطاق هذه المرحلة صراحةً. فلا يُعرَض
     الخيارُ أصلاً، ولا يبقى في الواجهة زرٌّ لا يفعل شيئاً. */
  finance: {
    available: ["header", "season", "issuedAt", ...SEALS],
    defaults: state({ header: true, season: true, issuedAt: true }),
    headerMode: "full",
  } as PrintOptionsSpec,
  /* كشفُ الفندق — من صفحة الفندق وصفحة التقارير بالمواصفة نفسها. الافتراضُ
     هو مطبوعُه المقبول بحرفه: الموسمُ والنطاقُ والترقيم، بلا تاريخ ولا ملخّص.
     ولا خيارَ للترويسة: هويّتُه وشريطُ عنوانه جزءٌ من هندسة الورقة الذرّيّة
     (ستّ عشرة غرفةً أو خمسَ عشرة)، فلا تُطفأ. والملخّصُ يُكتب في شريط
     العنوان نفسه، فلا يزيد الورقةَ سطراً ولا يُنقص غرفةً ولا يصغّر اسماً. */
  hotel: {
    available: ["season", "issuedAt", "pageNumbers", "scope", "summary", ...SEALS],
    defaults: state({ season: true, pageNumbers: true, scope: true }),
    headerMode: "compact",
  } as PrintOptionsSpec,
  /* المستندات: مظهرُها المقبول بلا ترويسةٍ ولا حواشٍ — فكلُّها مطفأة */
  documents: {
    available: ["header", "season", "issuedAt", "pageNumbers"],
    defaults: { ...OFF },
    headerMode: "compact",
  } as PrintOptionsSpec,
  /* كشوفُ القوائم ذاتُ الحواشي الثابتة (كشفُ الحجاج في صفحتهم، وكشفُ
     الإداريين): لا خيارَ لها إلا الختمُ والتوقيع — وحواشيها كما هي. */
  lists: {
    available: [...SEALS],
    defaults: { ...OFF },
  } as PrintOptionsSpec,
  /* كشفُ حساب الحاجّ الفرديّ: قشرتُه كما قُبلت، وتُزاد عليه ثلاثةُ خيارات
     كلُّها مطفأة — والبنكُ هنا وحده بين المطبوعات. */
  statement: {
    available: ["bank", ...SEALS],
    defaults: { ...OFF },
  } as PrintOptionsSpec,
  /* إيصالُ الدفعة: كان يعرض الختمَ والتوقيعَ كلّما وُجدا — فيبقيان مشعَلين
     افتراضاً، والمطفأُ يُبقي خانتَه فارغةً للختم والتوقيع باليد. ولا بنك. */
  receipt: {
    available: [...SEALS],
    defaults: state({ stamp: true, signature: true }),
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
  /** الصورُ المحمَّلة لهذه الطبعة — تُرسَم منها ما طُلب وحده. */
  seals?: PrintSeals | null;
  /** سطورُ البنك المملوءة — تُرسَم إن طُلبت وأتاحها التقرير. */
  bank?: PrintBankLine[] | null;
};

/** الخياراتُ كما تُطبَع: المعطَّلُ (ختمٌ لم يُرفع، بنكٌ لم يُملأ) مطفأٌ
 *  أيّاً كانت حالُه المحفوظة — فلا يُطلَب ما لا وجودَ له. */
export function effectiveOptions(
  opts: PrintOptionsState, disabled: Partial<Record<PrintOptionKey, string>> = {},
): PrintOptionsState {
  const out = { ...opts };
  for (const k of Object.keys(disabled) as PrintOptionKey[]) if (disabled[k]) out[k] = false;
  return out;
}

/** ما طلبه الموظّفُ من الختم والتوقيع في هذا التقرير — لا يُحمَّل غيرُه. */
export function requestedSeals(key: PrintReportKey, opts: PrintOptionsState): { stamp: boolean; signature: boolean } {
  const av = PRINT_SPECS[key].available as readonly PrintOptionKey[];
  return { stamp: av.includes("stamp") && opts.stamp, signature: av.includes("signature") && opts.signature };
}

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
    /* المطفأُ لا يُرسَم ولا يحجز هامشاً — فالطبعةُ بلا ختمٍ كما كانت بالحرف */
    seals: (can("stamp") && inputs.seals?.stamp) || (can("signature") && inputs.seals?.signature)
      ? { ...(can("stamp") && inputs.seals?.stamp ? { stamp: inputs.seals.stamp } : {}),
          ...(can("signature") && inputs.seals?.signature ? { signature: inputs.seals.signature } : {}) }
      : null,
    bank: can("bank") && inputs.bank && inputs.bank.length ? inputs.bank : null,
  };
}
