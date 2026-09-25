/* ═══════════════════════════════════════════════════════════════
   تطبيعُ صورةِ الخِتم/التوقيع — وحدةٌ خالصةٌ بلا تبعيّات

   لا تعرف Supabase ولا React: مدخَلُها `File` ومخرَجُها `Blob`
   وأبعاد. فتُختبَر وحدَها في متصفّحٍ بلا تهيئةِ مشروع.
   ═══════════════════════════════════════════════════════════════ */

export type NormalizedImage = {
  blob: Blob;
  width: number; height: number;
  originalWidth: number; originalHeight: number;
  mimeType: string;
  hasAlpha: boolean;
  trimmed: boolean;
};

/* أقصى بُعدٍ للمخرَج: يكفي طباعةَ خِتمٍ بعرض ٤ سم عند 300dpi (≈٤٧٢px)
   بفارقٍ مريح، ولا يُثقل مستنداً. ولا **تكبيرَ** أبداً: صورةٌ صغيرةٌ
   تبقى على حالها، وتكبيرُها يُنتج ضبابةً تبدو أسوأ من الأصل. */
const PRINT_MAX_DIM = 1600;
/* عتبةُ الشفافية: ما دون هذه القيمةِ يُعدّ فراغاً عند حساب الإطار.
   ٨ من ٢٥٥ تتجاوز ضجيجَ الضغطِ الخفيف ولا تأكل حافّةً حقيقيّة. */
const ALPHA_FLOOR = 8;
/* هامشٌ يُترك حول المحتوى بعد القصّ — حتى لا تُقصّ حوافُّ التنعيم */
const TRIM_PAD_RATIO = 0.02;

/* ═══ تطبيعُ صورةِ الخِتم/التوقيع ═══
   الغرضُ أن يملأ المحتوى إطارَه، فيظهر لاحقاً في مساحةٍ ثابتةٍ
   بـ`object-fit: contain` بحجمٍ معقولٍ لا نقطةً ضائعةً في بياض.

   وما **لا** تفعله عمداً:
     · لا إزالةَ خلفيةٍ ولا تخمينَ أنّ الأبيضَ فراغ — توقيعٌ رفيعٌ أو
       ختمٌ فاتحٌ يُتلفه ذلك التخمين. الأبيضُ المُصمَتُ يبقى كما هو
       ويظهر في المعاينةِ ليراه صاحبُه ويقرّر.
     · لا تدويرَ تلقائيّاً.
     · لا تمديدَ ولا تشويهَ نسبة — كلُّ تحجيمٍ بنسبةٍ واحدة.
     · لا تكبير.
     · ولا قصَّ إلا لشفافيةٍ حقيقيّةٍ محسوبةٍ من قناةِ ألفا. */
export async function normalizeStampImage(file: File): Promise<NormalizedImage | null> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>(resolve => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = bitmapUrl;
    });
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;

    const originalWidth = img.naturalWidth;
    const originalHeight = img.naturalHeight;

    /* النوعُ يحدّد وجودَ قناةِ ألفا: JPEG لا ألفا فيه بحالٍ، فلا
       يُقرأ بكسلُه ولا يُقصّ — يُنسخ كما هو ويُحجَّم إن كبر. */
    const alphaCapable = file.type === "image/png" || file.type === "image/webp";

    const src = document.createElement("canvas");
    src.width = originalWidth; src.height = originalHeight;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    if (!sctx) return null;
    sctx.drawImage(img, 0, 0);

    /* ── الإطارُ المحيطُ بالمحتوى ── */
    let x0 = 0, y0 = 0, x1 = originalWidth, y1 = originalHeight;
    let hasAlpha = false, trimmed = false;

    if (alphaCapable) {
      let data: Uint8ClampedArray;
      try {
        data = sctx.getImageData(0, 0, originalWidth, originalHeight).data;
      } catch {
        /* لوحةٌ ملوَّثةٌ لا تُقرأ — يُمضى بلا قصّ بدل الفشل */
        return await encodeCanvas(src, file, {
          originalWidth, originalHeight, hasAlpha: false, trimmed: false,
        });
      }
      let minX = originalWidth, minY = originalHeight, maxX = -1, maxY = -1;
      for (let y = 0; y < originalHeight; y++) {
        for (let x = 0; x < originalWidth; x++) {
          const a = data[(y * originalWidth + x) * 4 + 3];
          if (a < 255) hasAlpha = true;
          if (a >= ALPHA_FLOOR) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      /* صورةٌ شفّافةٌ بالكامل: لا إطارَ لها، فلا تُقصّ — ولو قُصّت
         لخرجت لوحةً بعرضِ صفر. تُترك ليرى صاحبُها أنّها فارغة. */
      if (maxX >= minX && maxY >= minY && hasAlpha) {
        const padX = Math.round((maxX - minX + 1) * TRIM_PAD_RATIO);
        const padY = Math.round((maxY - minY + 1) * TRIM_PAD_RATIO);
        const nx0 = Math.max(0, minX - padX);
        const ny0 = Math.max(0, minY - padY);
        const nx1 = Math.min(originalWidth, maxX + 1 + padX);
        const ny1 = Math.min(originalHeight, maxY + 1 + padY);
        if (nx1 - nx0 > 0 && ny1 - ny0 > 0 &&
            (nx0 > 0 || ny0 > 0 || nx1 < originalWidth || ny1 < originalHeight)) {
          x0 = nx0; y0 = ny0; x1 = nx1; y1 = ny1;
          trimmed = true;
        }
      }
    }

    const cropW = x1 - x0, cropH = y1 - y0;

    /* ── التحجيمُ بنسبةٍ واحدة، ولا تكبير ── */
    const scale = Math.min(1, PRINT_MAX_DIM / Math.max(cropW, cropH));
    const outW = Math.max(1, Math.round(cropW * scale));
    const outH = Math.max(1, Math.round(cropH * scale));

    const out = document.createElement("canvas");
    out.width = outW; out.height = outH;
    const octx = out.getContext("2d");
    if (!octx) return null;
    octx.imageSmoothingQuality = "high";
    /* JPEG لا شفافيةَ فيه: تُملأ اللوحةُ بياضاً صريحاً قبل الرسم كي لا
       تخرج الحوافُّ سوداءَ عند الترميز. وهذا **ليس** إزالةَ خلفية —
       الصورةُ أصلاً مُصمَتةٌ بيضاء، ولا بكسلَ يُمسّ. */
    if (!alphaCapable) { octx.fillStyle = "#ffffff"; octx.fillRect(0, 0, outW, outH); }
    octx.drawImage(src, x0, y0, cropW, cropH, 0, 0, outW, outH);

    return await encodeCanvas(out, file, {
      originalWidth, originalHeight, hasAlpha: alphaCapable && hasAlpha, trimmed,
    });
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/* الترميز: ما يحمل ألفا يخرج PNG بلا فقد، وما سواه JPEG عالي الجودة.
   و**PNG للـWebP الشفّاف** عن قصد: الشفافيةُ تُصان، وPNG مقروءٌ في كلّ
   مسارِ طباعةٍ وPDF بلا استثناء — وWebP ليس كذلك في كلّها. */
async function encodeCanvas(
  canvas: HTMLCanvasElement, file: File,
  meta: { originalWidth: number; originalHeight: number; hasAlpha: boolean; trimmed: boolean },
): Promise<NormalizedImage | null> {
  const alphaCapable = file.type === "image/png" || file.type === "image/webp";
  const mimeType = alphaCapable ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(b => resolve(b), mimeType, alphaCapable ? 1 : 0.92));
  if (!blob) return null;
  return {
    blob, mimeType,
    width: canvas.width, height: canvas.height,
    originalWidth: meta.originalWidth, originalHeight: meta.originalHeight,
    hasAlpha: meta.hasAlpha, trimmed: meta.trimmed,
  };
}
