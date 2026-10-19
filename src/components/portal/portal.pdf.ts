/* ═══ pdf.js للبوابة — يُحمَّل عند فتح أوّل PDF وحده ═══
   هذه الوحدةُ لا تُستورد إلا بـ`import()` من عارض المستند، فلا تدخل حزمةَ
   البوابة الأولى ولا يُطلب عاملُها قبل الحاجة.

   والتصييرُ صفحةً صفحة على Canvas عند الطلب (لا صوراً للملفّ كلّه):
   العارضُ يطلب الصفحةَ حين تقترب من الشاشة ويحرّرها حين تبتعد. والذاكرةُ
   محروسةٌ بسقفٍ لمساحة اللوحة الواحدة (حدودُ Canvas في Safari على iOS)،
   لا بعددٍ للصفحات. */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** أقصى مساحةٍ للوحة الواحدة بالبكسل — دون حدّ iOS (~16.7M) بهامشٍ واسع */
export const MAX_CANVAS_PIXELS = 5_000_000;
/** دقّةُ الشاشة المستعملة — ٢ تكفي للقراءة، وما فوقها ذاكرةٌ بلا فائدة */
const MAX_DPR = 2;

export type PageSize = { width: number; height: number };
export type RenderJob = { promise: Promise<void>; cancel: () => void };

export type PortalPdf = {
  numPages: number;
  pageSize: (n: number) => Promise<PageSize>;
  /** يُصيّر الصفحة `n` على `canvas` بعرض `cssWidth`؛ وإلغاؤه يُوقف الرسم */
  render: (n: number, canvas: HTMLCanvasElement, cssWidth: number) => RenderJob;
  /** يحرّر الصفحة من ذاكرة pdf.js بعد إزالة لوحتها */
  release: (n: number) => void;
  destroy: () => Promise<void>;
};

/** يفتح المستند. وإلغاءُ `signal` قبل اكتمال الفتح يُنهي مهمّة التحميل وعاملها. */
export async function openPortalPdf(bytes: Uint8Array, signal: AbortSignal): Promise<PortalPdf> {
  const task = pdfjs.getDocument({
    data: bytes,
    /* لا تنفيذَ لشيفرةٍ يولّدها الملفّ (CVE-2024-4367 وأمثالها) */
    isEvalSupported: false,
    /* لا جلبَ لأيّ مورد بعد البايتات: الملفُّ كلُّه في الذاكرة */
    disableAutoFetch: true,
    disableStream: true,
  });
  const onAbort = () => { void task.destroy(); };
  signal.addEventListener("abort", onAbort, { once: true });
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (e) {
    /* ملفٌّ تالف: المهمّةُ تُنهى وعاملُها معها — لا عاملَ يبقى بعد الخطأ */
    await task.destroy();
    throw e;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
  if (signal.aborted) { await task.destroy(); throw new DOMException("aborted", "AbortError"); }

  const pages = new Map<number, pdfjs.PDFPageProxy>();
  const page = async (n: number) => {
    let p = pages.get(n);
    if (!p) { p = await doc.getPage(n); pages.set(n, p); }
    return p;
  };

  return {
    numPages: doc.numPages,
    async pageSize(n) {
      const v = (await page(n)).getViewport({ scale: 1 });
      return { width: v.width, height: v.height };
    },
    render(n, canvas, cssWidth) {
      let cancelled = false;
      let renderTask: pdfjs.RenderTask | null = null;
      const promise = (async () => {
        const p = await page(n);
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        let scale = (cssWidth * dpr) / base.width;
        const area = base.width * base.height * scale * scale;
        if (area > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / area);
        const viewport = p.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("تعذّر تجهيز لوحة الرسم");
        /* أرضيّةٌ بيضاء: صفحاتُ الـPDF شفّافة */
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        renderTask = p.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      })();
      return {
        promise,
        cancel: () => { cancelled = true; renderTask?.cancel(); },
      };
    },
    release(n) {
      const p = pages.get(n);
      if (p) { p.cleanup(); pages.delete(n); }
    },
    async destroy() {
      pages.forEach(p => p.cleanup());
      pages.clear();
      await task.destroy();
    },
  };
}
