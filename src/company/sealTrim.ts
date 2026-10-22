// ============================================================
// قصُّ حشو الختم والتوقيع قبل الطباعة — بلا اعتماديّات (يُختبر في المتصفّح)
// ============================================================
import type { SealImage } from "../print/print.seals";

/* ═══ قصُّ الحشو الشفّاف/الأبيض حول الحبر ═══
   الصورةُ المرفوعة كثيراً ما يحيط بالختم فيها حشوٌ شفّافٌ أو أبيضُ واسع،
   فيُحسب الحشوُ من مقاسها ويصغر الحبرُ المطبوع. فيُقاس صندوقُ الحبر المرئيّ
   ويُقصّ إليه (بحاشيةٍ ٢٪) قبل الحساب. والحشوُ الأبيضُ على ورقٍ أبيض لا يُرى،
   فقصُّه لا يغيّر شيئاً مطبوعاً سوى المقاس.

   ⚠️ القصُّ يحتاج قراءةَ البكسلات: تُجلب الصورةُ بـ`fetch` إلى blob (فلا تتلوّث
   اللوحة)، فإن تعذّر الجلبُ (CORS أو شبكة) طُبعت الصورةُ كما رُفعت — القصُّ
   تحسينٌ لا شرطٌ للطباعة. والناتجُ data: URL، فلا يدخل الرابطُ الموقَّعُ المستند. */

/** صندوقُ الحبر المرئيّ في بكسلات RGBA — أو null إن كانت الصورةُ فارغة. */
export function alphaBounds(data: ArrayLike<number>, width: number, height: number):
  { x: number; y: number; w: number; h: number } | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const ink = data[i + 3] > 16 && !(data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240);
      if (!ink) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(x1 - x0 + 1, y1 - y0 + 1) * 0.02);
  const x = Math.max(0, x0 - pad), y = Math.max(0, y0 - pad);
  return { x, y, w: Math.min(width, x1 + 1 + pad) - x, h: Math.min(height, y1 + 1 + pad) - y };
}

/** أطولُ ضلعٍ للصورة بعد القصّ — يكفي ٦٠٠dpi لختمٍ ٤٢مم ويُبقي المستند خفيفاً. */
const TRIM_MAX_PX = 1000;

/** يجلب الصورةَ ويقصّها إلى حبرها — أو null إن تعذّر (فتُطبع كما رُفعت). */
export async function trimSealImage(url: string): Promise<SealImage | null> {
  if (typeof fetch !== "function" || typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const bmp = await createImageBitmap(await res.blob());
  const probe = document.createElement("canvas");
  probe.width = bmp.width; probe.height = bmp.height;
  const pc = probe.getContext("2d", { willReadFrequently: true });
  if (!pc) return null;
  pc.drawImage(bmp, 0, 0);
  const b = alphaBounds(pc.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height);
  if (!b) return null;
  const k = Math.min(1, TRIM_MAX_PX / Math.max(b.w, b.h));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(b.w * k)); out.height = Math.max(1, Math.round(b.h * k));
  const oc = out.getContext("2d");
  if (!oc) return null;
  oc.imageSmoothingQuality = "high";
  oc.drawImage(bmp, b.x, b.y, b.w, b.h, 0, 0, out.width, out.height);
  bmp.close?.();
  return { url: out.toDataURL("image/png"), width: out.width, height: out.height };
}
