// ============================================================
// تصييرُ صفحات الـPDF إلى صورٍ قابلةٍ للطباعة
// ============================================================
/* المشكلة التي يحلّها هذا الملفّ: التصريحُ في الإنتاج ملفُّ PDF،
   و`<img src="….pdf">` لا يعرض شيئاً، و`<embed>` يعرضه على الشاشة
   لكنّ إخراجه إلى الورق يتبع عارضَ المتصفّح — فيُطلَب من الموظّف أن
   يطبعه من نافذةٍ أخرى، وذاك ليس سلوكاً مقبولاً لمنتَج.

   فالحلّ أن يُصيَّر الـPDF **قبل** الطباعة: تُقرأ بايتاتُه ثم تُرسَم
   كلُّ صفحةٍ على `canvas` وتُحوَّل صورةً، فتدخل المستندَ المطبوع
   كأيّ صورةٍ أخرى — ويكفيها انتظارُ الصور القائم.

   ولا مفسّرَ PDF يُكتب هنا: pdf.js (pdfjs-dist) من موزيلا، وهي
   المكتبةُ المعياريّة لهذا الغرض.

   ⚠️ والأمنُ لا يتغيّر: البايتاتُ تأتي من `fetchDocumentBytes` —
   رابطٌ موقَّعٌ قصير العمر، وثلاثُ بوّابات (مسارُ التوقيع، والنوع
   المعلَن، والتوقيع الثنائيّ). ولا حاويةَ تُفتح، ولا رابطَ دائمٌ
   يُكشَف، والتصييرُ كلُّه في متصفّح الموظّف. */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfRenderOptions = {
  /** أقصى عددِ صفحاتٍ تُصيَّر من ملفٍّ واحد — سدٌّ أمام ملفٍّ ضخم. */
  maxPages?: number;
  /** عرضُ الصفحة المُصيَّرة بالبكسل — دقّةُ الطباعة. */
  targetWidth?: number;
};

const DEFAULT_MAX_PAGES = 20;
const DEFAULT_WIDTH = 1240;   // ‏A4 عند ١٥٠dpi تقريباً — يكفي للقراءة والطباعة

/** يُصيّر صفحاتِ مستندِ PDF صوراً (data URLs)، صفحةً صفحة. */
export async function renderPdfPagesToImages(
  bytes: Uint8Array,
  options: PdfRenderOptions = {},
): Promise<string[]> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const targetWidth = options.targetWidth ?? DEFAULT_WIDTH;

  /* نسخةٌ خاصّة من البايتات: pdf.js يستهلك المخزّن المؤقّت. */
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  try {
    const count = Math.min(doc.numPages, maxPages);
    const images: string[] = [];
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: targetWidth / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("تعذّر تجهيز لوحة الرسم");
      /* أرضيّةٌ بيضاء: صفحاتُ الـPDF شفّافةٌ، ولولاها لخرجت سوداء */
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.92));
      page.cleanup();
    }
    return images;
  } finally {
    /* `destroy` على مهمّة التحميل: تُنهي العامل وتحرّر الذاكرة */
    await task.destroy();
  }
}
