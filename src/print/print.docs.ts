// ============================================================
// مستنداتُ الحاجّ في المطبوع — الصورةُ صورةٌ والـPDF ليس صورة
// ============================================================
/* الجذرُ الذي أظهرته المعاينة: «التصريح لا يظهر». والحقلُ سليم
   (`hajj_permit_url`)، والمفتاحُ سليمٌ وبالشكل نفسه (`X/X.X`)،
   والتوقيعُ يعمل. لكنّ التصريح في الإنتاج **PDF** والجواز والبطاقة
   **JPG** — و`<img src="….pdf">` لا يعرض شيئاً في أيّ متصفّح.
   فالعطبُ أن الطباعة كانت تفترض أن كلّ مستندٍ صورة.

   فُحص بمتصفّحٍ حقيقيّ على PDF صحيح:
     `<img>`   → `naturalWidth = 0`  — لا يُعرض بحال
     `<embed>` → عنصرٌ بارتفاعٍ كامل — يُعرض

   والقرارُ هنا حدٌّ مشترك لا ترقيعٌ في موضع: نوعُ الملفّ يُعرَف من
   مفتاحه، وكلُّ منتِجِ مطبوعٍ يسأل هذه الدالّة. */

export type DocKind = "image" | "pdf" | "unknown";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif"]);

/** نوعُ المستند من امتداد مفتاحه — لا من ظنٍّ ولا من حقلٍ منفصل. */
export function docFileKind(keyOrUrl: string | null | undefined): DocKind {
  if (!keyOrUrl) return "unknown";
  const clean = keyOrUrl.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot === -1) return "unknown";
  const ext = clean.slice(dot + 1).toLowerCase();
  if (ext === "pdf") return "pdf";
  return IMAGE_EXT.has(ext) ? "image" : "unknown";
}

/** جسمُ بطاقةِ مستندٍ واحد داخل شبكة الطباعة — بحسب نوعه.
 *  ⚠️ الرابطُ موقَّعٌ قصيرُ العمر يأتي من `signedDocUrl`؛ لا يُبنى هنا. */
export function docPrintBody(signedUrl: string, kind: DocKind): string {
  if (!signedUrl) return `<div style="color:#999;font-size:12px">لا مستند</div>`;
  if (kind === "pdf") {
    /* الـPDF لا يُحقَن في `<img>`. و`<embed>` يعرضه، وإخراجُه إلى
       الورق يتبع عارضَ المتصفّح — ولهذا يُقال للموظّف إنه PDF. */
    return `<embed src="${signedUrl}" type="application/pdf" style="width:100%;height:100%;min-height:0;border:0" />`;
  }
  return `<img src="${signedUrl}" style="max-width:100%;max-height:100%;object-fit:contain" />`;
}
