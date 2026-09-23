/* ═══ نتيجةُ الحفظ — النجاحُ يُبرهَن ولا يُفترَض ═══
   كان الحفظُ يُعلَن ناجحاً لمجرّد أن كائنَ الخطأ لم يصل. و`UPDATE`
   يُرشَّح صفرَ صفوفٍ بـRLS لا يصل معه خطأ — فتقول الشاشةُ «تم
   الحفظ» ولم يُحفظ شيء.

   فصار لكلّ كتابةٍ نتيجةٌ مُوسَمة، ولا يُقرأ النجاحُ إلا من
   `saved` أو `unchanged`، وكلاهما **يحمل صفّاً**. */

export type SaveResult<T> =
  /** الصفُّ وُجد وأُذن به وتغيّر — ومعه برهانُه. */
  | { status: "saved"; data: T }
  /** وُجد وأُذن به ولم يختلف شيء — نجاحٌ لا خطأ، وله صفٌّ أيضاً. */
  | { status: "unchanged"; data: T }
  /** رُفض التفويض: صلاحيةٌ ناقصة، لا عطلٌ ولا غياب. */
  | { status: "unauthorized"; message: string }
  /** صفرُ صفوف: الصفُّ المقصود لم يُبلَغ — ولا يُقرأ نجاحاً أبداً. */
  | { status: "not_found"; message: string }
  /** قيمةٌ مرفوضة قبل أن تصل القاعدة. */
  | { status: "invalid"; field: string; message: string }
  /** عطلُ شبكةٍ أو قاعدة. */
  | { status: "failed"; message: string };

/** هل تُعرَض رسالةُ نجاح؟ — الموضعُ الوحيد الذي يقرّر ذلك. */
export function isSaved<T>(r: SaveResult<T>): boolean {
  return r.status === "saved" || r.status === "unchanged";
}

/** نصٌّ عربيٌّ واحدٌ لكلّ إخفاق — فلا تتفرّق الرسائلُ بين الشاشات. */
export function saveErrorText(r: SaveResult<unknown>): string {
  switch (r.status) {
    case "unauthorized": return r.message || "ليست لديك صلاحية لحفظ هذه الإعدادات.";
    case "not_found":    return r.message || "تعذّر الوصول إلى صفّ الإعدادات، لم يُحفظ شيء.";
    case "invalid":      return r.message || "قيمةٌ غير صالحة.";
    case "failed":       return r.message || "تعذّر الحفظ، يرجى المحاولة مرة أخرى.";
    default:             return "";
  }
}

/* ⚠️ رمزُ `42501` هو ما ترفعه دالّةُ البوابة عند نقص الصلاحية، وهو
   نفسُه ما يرفعه PostgreSQL عند منعٍ في الامتيازات. و`P0002` صفرُ
   صفوف. فالتصنيفُ يقرأ الرمزَ لا نصَّ الرسالة. */
export function classifyPostgrestError(
  err: { code?: string | null; message?: string | null } | null | undefined,
): SaveResult<never> {
  const code = err?.code || "";
  const message = err?.message || "";
  if (code === "42501") return { status: "unauthorized", message: message || "ليست لديك صلاحية لحفظ هذه الإعدادات." };
  if (code === "P0002" || code === "PGRST116") return { status: "not_found", message: message || "تعذّر الوصول إلى صفّ الإعدادات، لم يُحفظ شيء." };
  /* `P0001` هو ما ترفعه دوالُّنا حين تردّ قيمةً قبل كتابتها — اسمٌ
     فارغٌ أو سنةٌ مكرّرة. وهو رفضُ إدخالٍ لا عطل، والرسالةُ عربيّةٌ
     مكتوبةٌ للمستخدم فتُعرَض كما هي. */
  if (code === "P0001") return { status: "invalid", field: "", message: message || "قيمةٌ غير صالحة." };
  return { status: "failed", message: message || "تعذّر الحفظ، يرجى المحاولة مرة أخرى." };
}
