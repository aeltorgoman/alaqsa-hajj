// ============================================================
// مستنداتُ الحاجّ في المطبوع — الصورةُ صورةٌ والـPDF ليس صورة
// ============================================================
/* الجذرُ الذي أظهرته المعاينة: «التصريح لا يظهر». والحقلُ سليم
   (`hajj_permit_url`)، والمفتاحُ سليمٌ وبالشكل نفسه (`X/X.X`)،
   والتوقيعُ يعمل. لكنّ التصريح في الإنتاج **PDF** والجواز والبطاقة
   **JPG** — و`<img src="….pdf">` لا يعرض شيئاً في أيّ متصفّح.
   فالعطبُ أن الطباعة كانت تفترض أن كلّ مستندٍ صورة.

   والحلُّ ليس عنصرَ عرضٍ آخر يُحيل الموظّف إلى نافذةٍ ثانية، بل
   **تصييرُ صفحات الـPDF صوراً قبل الطباعة** (`print.pdf.ts`) — فيدخل
   التصريحُ المطبوعَ كأيّ صورة. ولهذا لم يبق هنا إلا نوعُ الملفّ
   وجسمُ الصورة: بابٌ واحدٌ لكل مستند.

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
/** جسمُ بطاقةِ صورةٍ — سواءٌ صورةُ مستندٍ موقَّعة أو صفحةُ PDF مُصيَّرة. */
export function docImageBody(src: string): string {
  if (!src) return `<div style="color:#999;font-size:12px">لا مستند</div>`;
  return `<img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain" />`;
}

/** رسالةٌ صريحة حين يتعذّر تجهيز المستند — لا صندوقٌ فارغٌ صامت. */
export function docFailedBody(reason = "تعذّر تجهيز المستند"): string {
  return `<div style="color:#999;font-size:12px">${reason}</div>`;
}
