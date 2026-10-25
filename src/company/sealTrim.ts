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

type Box = { x0: number; y0: number; x1: number; y1: number };

/** صندوقُ الحبر المرئيّ في بكسلات RGBA — أو null إن كانت الصورةُ فارغة. و`within` يحصر البحثَ في منطقة. */
export function alphaBounds(data: ArrayLike<number>, width: number, height: number, within?: Box):
  { x: number; y: number; w: number; h: number; ink: { w: number; h: number } } | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  const r = within ?? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
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
  return { x, y, w: Math.min(width, x1 + 1 + pad) - x, h: Math.min(height, y1 + 1 + pad) - y, ink: { w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

/* ═══ حبرُ الختم المرئيّ — لا كلُّ بكسلٍ غيرِ شفّاف ═══
   ⚠️ ظهر بالورقة المطبوعة: ختمُ الحملة خرج نحو ٣١مم والمطلوبُ ٤٠. فالأصلُ المرفوع صورةُ
   ورقٍ أُزيلت خلفيّتُها (`normalizeStampImage`): يبقى فيها حول الختم بقايا ورقٍ بشفافيّةٍ
   ضئيلةٍ ولونٍ فاتح (ظلٌّ أو تدرّجُ إضاءة) — لا تُرى مطبوعةً، لكنّ `alphaBounds` تعدّها
   حبراً، فيُحسب «قطرُ الحبر» أعرضَ من الختم ويصغر الختمُ المطبوع بقدرها.
   فحبرُ الختم هنا ما **يُرى** على ورقٍ أبيض: شفافيّتُه × دُكنتُه ≥ `STAMP_VISIBLE_INK`،
   ثمّ أكبرُ كتلةٍ متّصلةٍ في إسقاطَي الأعمدة والصفوف (فجوةٌ تفصل بقعةً أو حافّةَ ظلٍّ أو خطّاً
   بعيداً تُخرجها). وذلك صندوقُ القطر وحده؛ أمّا القصُّ فبالمعيار القديم داخل جوار الختم
   (٦٪ حوله) — فما خفت من حلقته لا يُقطع — ومعه كلُّ كتلةٍ أخرى ذاتِ وزن (≥ ربع الختم)،
   فلا يُحذف من الرسم شيءٌ يُرى. والتوقيعُ لا يمرّ بهذا: قصُّه كما كان. */
const STAMP_VISIBLE_INK = 0.1;
const lum = (d: ArrayLike<number>, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** الكتلُ المتّصلة في إسقاطٍ (عددُ بكسلات الحبر لكلّ عمودٍ/صفّ) — فجواتٌ أصغرُ من `gap` لا تفصل. */
function runsOf(counts: Uint32Array, from: number, to: number, minCount: number, gap: number) {
  const runs: { a: number; b: number; mass: number }[] = [];
  let cur: { a: number; b: number; mass: number } | null = null;
  for (let i = from; i < to; i++) {
    if (counts[i] < minCount) continue;
    if (cur && i - cur.b - 1 <= gap) { cur.b = i; cur.mass += counts[i]; }
    else { cur = { a: i, b: i, mass: counts[i] }; runs.push(cur); }
  }
  return runs;
}

/** حبرُ الختم المرئيّ: `ink` صندوقُ الختم نفسه (للقطر)، و`keep` منطقةُ القصّ (الختمُ وجوارُه وما
 *  يُرى بوزنٍ معه). أو null إن لم يكن فيه حبرٌ مرئيٌّ يُعتدّ به (فيبقى القصُّ القديم). */
export function stampInkBounds(data: ArrayLike<number>, width: number, height: number): { ink: Box; keep: Box } | null {
  const vis = new Uint8Array(width * height);
  let total = 0;
  for (let p = 0, i = 0; p < vis.length; p++, i += 4) {
    if ((data[i + 3] / 255) * (1 - lum(data, i) / 255) >= STAMP_VISIBLE_INK) { vis[p] = 1; total++; }
  }
  if (total < 50) return null;
  const cols = new Uint32Array(width), rows = new Uint32Array(height);
  const count = (y0: number, y1: number, x0: number, x1: number) => {
    cols.fill(0); rows.fill(0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (vis[y * width + x]) { cols[x]++; rows[y]++; }
  };
  const pick = (c: Uint32Array, n: number, other: number) => {
    const runs = runsOf(c, 0, n, Math.max(2, Math.round(other * 0.003)), Math.max(2, Math.round(n * 0.03)));
    if (!runs.length) return null;
    const main = runs.reduce((m, r) => (r.mass > m.mass ? r : m));
    const heavy = runs.filter(r => r.mass >= main.mass * 0.25);
    return { a: main.a, b: main.b, ka: Math.min(...heavy.map(r => r.a)), kb: Math.max(...heavy.map(r => r.b)) };
  };
  /* الأعمدةُ في الصورة كلّها، ثمّ الصفوفُ داخل أعمدة الختم، ثمّ الأعمدةُ داخل صفوفه */
  count(0, height - 1, 0, width - 1);
  let X = pick(cols, width, height);
  if (!X) return null;
  count(0, height - 1, X.a, X.b);
  const Y = pick(rows, height, X.b - X.a + 1);
  if (!Y) return null;
  count(Y.a, Y.b, 0, width - 1);
  X = pick(cols, width, Y.b - Y.a + 1) ?? X;
  const m = Math.round(Math.max(X.b - X.a + 1, Y.b - Y.a + 1) * 0.06);
  return { ink: { x0: X.a, y0: Y.a, x1: X.b, y1: Y.b },
           keep: { x0: Math.max(0, X.ka - m), y0: Math.max(0, Y.ka - m), x1: Math.min(width - 1, X.kb + m), y1: Math.min(height - 1, Y.kb + m) } };
}

/** أطولُ ضلعٍ للصورة بعد القصّ — يكفي ٦٠٠dpi لختمٍ ٤٢مم ويُبقي المستند خفيفاً. */
const TRIM_MAX_PX = 1000;

/** يجلب الصورةَ ويقصّها إلى حبرها — أو null إن تعذّر (فتُطبع كما رُفعت). والختمُ (`kind`)
 *  يُقصّ إلى حبره المرئيّ (`stampInkBounds`)، والتوقيعُ كما كان. */
export async function trimSealImage(url: string, kind: "stamp" | "signature" = "signature"): Promise<SealImage | null> {
  if (typeof fetch !== "function" || typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const bmp = await createImageBitmap(await res.blob());
  const probe = document.createElement("canvas");
  probe.width = bmp.width; probe.height = bmp.height;
  const pc = probe.getContext("2d", { willReadFrequently: true });
  if (!pc) return null;
  pc.drawImage(bmp, 0, 0);
  const px = pc.getImageData(0, 0, bmp.width, bmp.height).data;
  let b = alphaBounds(px, bmp.width, bmp.height);
  if (!b) return null;
  const st = kind === "stamp" ? stampInkBounds(px, bmp.width, bmp.height) : null;
  const near = st && alphaBounds(px, bmp.width, bmp.height, st.keep);
  if (st && near) b = { ...near, ink: { w: st.ink.x1 - st.ink.x0 + 1, h: st.ink.y1 - st.ink.y0 + 1 } };
  const k = Math.min(1, TRIM_MAX_PX / Math.max(b.w, b.h));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(b.w * k)); out.height = Math.max(1, Math.round(b.h * k));
  const oc = out.getContext("2d");
  if (!oc) return null;
  oc.imageSmoothingQuality = "high";
  oc.drawImage(bmp, b.x, b.y, b.w, b.h, 0, 0, out.width, out.height);
  bmp.close?.();
  /* أبعادُ الحبر نفسه داخل الصورة الناتجة — يُحسب بها المقاسُ المرئيّ (قطرُ الختم الفعليّ) */
  return { url: out.toDataURL("image/png"), width: out.width, height: out.height,
           inkWidth: Math.round(b.ink.w * k), inkHeight: Math.round(b.ink.h * k) };
}
