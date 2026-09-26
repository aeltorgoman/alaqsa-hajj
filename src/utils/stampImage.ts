/* ═══════════════════════════════════════════════════════════════
   تطبيعُ صورةِ الخِتم/التوقيع — وحدةٌ خالصةٌ بلا تبعيّات

   لا تعرف Supabase ولا React: مدخَلُها `File` ومخرَجُها `Blob` وأبعاد.
   فتُختبَر وحدَها في متصفّحٍ بلا تهيئةِ مشروع.

   ── المسارُ مسارانِ لا واحد ──────────────────────────────────
   ١) صورةٌ تحمل شفافيةً حقيقيّةً (PNG/WebP بألفا): تُصان كما هي،
      ويُقصّ إطارُها من قناةِ ألفا. **لا تُمَسّ بإزالةِ خلفيّة.**
   ٢) صورةٌ مُصمَتة (JPEG، أو PNG/WebP بلا ألفا): صورةُ ورقٍ مصوَّرةٌ
      أو ممسوحة، فتُزال خلفيّةُ الورقِ لتصير أصلاً صالحاً للطباعة.

   ── ولماذا لا «احذف الأبيض» ─────────────────────────────────
   الورقُ المصوَّرُ ليس #FFFFFF: رماديٌّ أو مائلٌ للدفء، وإضاءتُه غيرُ
   منتظمة، وضغطُ JPEG يُضيف ضجيجاً. فعتبةٌ عامّةٌ ثابتةٌ إمّا تُبقي
   رمادياً أو تأكل الحبرَ الفاتح. ولذلك:

     · يُقدَّر **حقلُ إضاءةِ الورق محلّيّاً** لا لوناً واحداً للصورةِ
       كلِّها: شبكةٌ خشنةٌ تأخذ من كلِّ خليّةٍ المئينَ ٨٥ للإضاءة —
       وهو الورقُ في تلك الناحية — ثُمّ تُمهَّد وتُعايَن بالتوسّطِ
       الثنائيّ. فتدرُّجُ الإضاءةِ يُتتبَّع لا يُقاوَم.
     · وتُقاس «حبريّةُ» البكسل بشيئين: **دُكنتُه** نسبةً إلى ورقِه
       المحلّيّ، و**تشبُّعُه** زائداً على تشبُّعِ الورق. والثاني هو من
       يُنجي الأزرقَ الفاتح: فاتحٌ في الإضاءةِ لكنّه ملوَّنٌ بيّناً.
     · والألفا تتدرّج بين عتبتين (smoothstep) لا تقفز، فتبقى حوافُّ
       التنعيمِ ناعمةً لا مُسنَّنة.

   ولا إزالةَ خلفيّةٍ «ذكيّةٍ» عامّة، ولا خدمةَ خارجيّة، ولا تبعيّة.
   ═══════════════════════════════════════════════════════════════ */

export type StampKind = "stamp" | "signature";

export type NormalizedImage = {
  blob: Blob;
  width: number; height: number;
  originalWidth: number; originalHeight: number;
  mimeType: string;
  hasAlpha: boolean;
  trimmed: boolean;
  /** أُزيلت خلفيّةُ ورقٍ مُصمَتة (المسار ٢) */
  backgroundRemoved: boolean;
  /** نسبةُ البكسلِ المُعتَمِ بعد المعالجة — للتشخيصِ وحدِّ الفراغ */
  inkRatio: number;
};

export type NormalizeResult =
  | { ok: true; image: NormalizedImage }
  | { ok: false; reason: "unreadable" | "no_content" };

/* أقصى بُعدٍ للمخرَج: يكفي طباعةَ خِتمٍ بعرض ٤ سم عند 300dpi (≈٤٧٢px)
   بفارقٍ مريح، ولا يُثقل مستنداً. ولا **تكبيرَ** أبداً. */
const PRINT_MAX_DIM = 1600;
/* عتبةُ الشفافيةِ عند حسابِ الإطار */
const ALPHA_FLOOR = 8;
/* هامشٌ يُترك حول المحتوى بعد القصّ */
const TRIM_PAD_RATIO = 0.02;
/* أقلُّ نسبةِ حبرٍ تُعدّ محتوىً — تحتها الصورةُ ورقٌ فارغ */
const MIN_INK_RATIO = 0.0004;

/* معاملاتٌ متحفّظةٌ لكلِّ نوع. الخِتمُ فيه أزرقُ باهتٌ فيحتاج حسّاً
   أرقّ، والتوقيعُ خطوطٌ رقيقةٌ داكنةٌ فيُرفَع حدُّه قليلاً ليصمد أمام
   ضجيجِ الورقِ بلا أن تُؤكَل خطوطُه. */
const PARAMS: Record<StampKind, { tLow: number; tHigh: number; satWeight: number }> = {
  stamp:     { tLow: 0.085, tHigh: 0.26, satWeight: 1.6 },
  signature: { tLow: 0.110, tHigh: 0.32, satWeight: 1.4 },
};

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** تشبُّعٌ بسيطٌ مستقلٌّ عن الإضاءة: (أعلى−أدنى) ÷ أعلى. */
function sat(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx <= 0 ? 0 : (mx - mn) / mx;
}

function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** المئينُ من مِدرجٍ تكراريٍّ من ٢٥٦ خانة. */
function percentileFromHist(hist: Uint32Array | Uint16Array, offset: number, total: number, q: number): number {
  if (total === 0) return 255;
  const target = q * total;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[offset + i];
    if (acc >= target) return i;
  }
  return 255;
}

/* ═══ حقلُ إضاءةِ الورقِ المحلّيّ ═══
   شبكةٌ خشنةٌ ثابتةُ الدقّةِ تقريباً (≈٢٤ خليّةً على البُعدِ الأصغر)،
   فالكلفةُ لا تنمو مع حجمِ الصورة. وكلُّ خليّةٍ تُعطي المئينَ ٨٥
   لإضاءتِها — أي الورق فيها لا الحبر. */
function buildPaperField(data: Uint8ClampedArray, w: number, h: number, globalPaper: number) {
  const cell = Math.max(16, Math.round(Math.min(w, h) / 24));
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  const hist = new Uint32Array(cols * rows * 256);
  const counts = new Uint32Array(cols * rows);

  for (let y = 0; y < h; y++) {
    const cy = Math.min(rows - 1, (y / cell) | 0);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = lum(data[i], data[i + 1], data[i + 2]) | 0;
      const c = cy * cols + Math.min(cols - 1, (x / cell) | 0);
      hist[c * 256 + l]++; counts[c]++;
    }
  }

  const raw = new Float32Array(cols * rows);
  /* خليّةٌ غارقةٌ في الحبرِ تُعطي تقديراً مظلماً كاذباً، فتُقيَّد إلى
     نسبةٍ من ورقِ الصورةِ العامّ. */
  const floor = 0.55 * globalPaper;
  for (let c = 0; c < cols * rows; c++) {
    raw[c] = Math.max(floor, percentileFromHist(hist, c * 256, counts[c], 0.85));
  }

  /* تمهيدٌ ٣×٣ فلا تظهر حدودُ الخلايا في الألفا */
  const field = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let s = 0, n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
          s += raw[rr * cols + cc]; n++;
        }
      }
      field[r * cols + c] = s / n;
    }
  }
  return { field, cols, rows, cell };
}

/** معاينةُ الحقلِ بتوسّطٍ ثنائيٍّ عند مركزِ البكسل. */
function samplePaper(f: { field: Float32Array; cols: number; rows: number; cell: number }, x: number, y: number): number {
  const gx = Math.min(f.cols - 1, Math.max(0, (x + 0.5) / f.cell - 0.5));
  const gy = Math.min(f.rows - 1, Math.max(0, (y + 0.5) / f.cell - 0.5));
  const x0 = gx | 0, y0 = gy | 0;
  const x1 = Math.min(f.cols - 1, x0 + 1), y1 = Math.min(f.rows - 1, y0 + 1);
  const tx = gx - x0, ty = gy - y0;
  const a = f.field[y0 * f.cols + x0], b = f.field[y0 * f.cols + x1];
  const c = f.field[y1 * f.cols + x0], d = f.field[y1 * f.cols + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = url;
  });
}

export async function normalizeStampImage(file: File, kind: StampKind = "stamp"): Promise<NormalizeResult> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (!img || !img.naturalWidth || !img.naturalHeight) return { ok: false, reason: "unreadable" };

    const originalWidth = img.naturalWidth, originalHeight = img.naturalHeight;
    const src = document.createElement("canvas");
    src.width = originalWidth; src.height = originalHeight;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    if (!sctx) return { ok: false, reason: "unreadable" };
    sctx.drawImage(img, 0, 0);

    let px: ImageData;
    try { px = sctx.getImageData(0, 0, originalWidth, originalHeight); }
    catch { return { ok: false, reason: "unreadable" }; }
    const data = px.data;
    const n = originalWidth * originalHeight;

    /* ── أيُّ المسارين؟ ── */
    const alphaCapable = file.type === "image/png" || file.type === "image/webp";
    let translucent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) translucent++;
    /* شفافيّةٌ **ذاتُ معنى** لا بكسلٌ شاذّ: نصفُ بالمئةِ على الأقلّ */
    const hasRealAlpha = alphaCapable && translucent > n * 0.005;

    let backgroundRemoved = false;

    if (!hasRealAlpha) {
      /* ═══ المسار ٢: إزالةُ خلفيّةِ الورق ═══ */
      backgroundRemoved = true;
      const { tLow, tHigh, satWeight } = PARAMS[kind];

      /* ورقُ الصورةِ عامّاً: المئينُ ٨٥ للإضاءة، ولونُه وسيطُ ما حولَه */
      const gh = new Uint32Array(256);
      for (let i = 0; i < data.length; i += 4) gh[lum(data[i], data[i + 1], data[i + 2]) | 0]++;
      const globalPaper = Math.max(1, percentileFromHist(gh, 0, n, 0.85));
      let sr = 0, sg = 0, sb = 0, sc = 0;
      for (let i = 0; i < data.length; i += 4) {
        const l = lum(data[i], data[i + 1], data[i + 2]);
        if (Math.abs(l - globalPaper) <= 10) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; sc++; }
      }
      const paperSat = sc > 0 ? sat(sr / sc, sg / sc, sb / sc) : 0;

      const f = buildPaperField(data, originalWidth, originalHeight, globalPaper);

      /* الألفا في مصفوفةٍ منفصلة: القناعُ يُنقَّى قبل أن يُكتَب */
      const alpha = new Uint8ClampedArray(n);
      for (let y = 0; y < originalHeight; y++) {
        const localPaper = 0; void localPaper;
        for (let x = 0; x < originalWidth; x++) {
          const i = (y * originalWidth + x) * 4;
          const p = Math.max(1, samplePaper(f, x, y));
          const l = lum(data[i], data[i + 1], data[i + 2]);
          /* دُكنةٌ نسبيّةٌ إلى ورقِ الجوار — فالتدرُّجُ لا يُقرأ حبراً */
          const dark = Math.min(1, Math.max(0, (p - l) / p));
          /* وتشبُّعٌ زائدٌ على تشبُّعِ الورق — وهو مُنجي الأزرقِ الفاتح */
          const colour = Math.max(0, sat(data[i], data[i + 1], data[i + 2]) - paperSat);
          const k = Math.max(dark, colour * satWeight);
          alpha[y * originalWidth + x] = Math.round(255 * smoothstep(tLow, tHigh, k));
        }
      }

      /* نزعُ البقعِ المنفردة: بكسلٌ مُعتِمٌ بلا جارَين مُعتِمَين ضجيجُ
         ضغطٍ لا حبر. وخطٌّ بعرضِ بكسلٍ واحدٍ له جارانِ على طولِه، فلا
         يُؤكَل — وهذا هو الحدُّ الذي يُنجي الخطَّ الرقيق. */
      const cleaned = new Uint8ClampedArray(alpha);
      for (let y = 0; y < originalHeight; y++) {
        for (let x = 0; x < originalWidth; x++) {
          const idx = y * originalWidth + x;
          if (alpha[idx] < ALPHA_FLOOR) continue;
          let neighbours = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || yy >= originalHeight || xx < 0 || xx >= originalWidth) continue;
              if (alpha[yy * originalWidth + xx] >= ALPHA_FLOOR) neighbours++;
            }
          }
          if (neighbours < 2) cleaned[idx] = 0;
        }
      }
      for (let idx = 0; idx < n; idx++) data[idx * 4 + 3] = cleaned[idx];
      sctx.putImageData(px, 0, 0);
    }

    /* ── الإطارُ من قناةِ ألفا (في المسارين معاً) ── */
    let minX = originalWidth, minY = originalHeight, maxX = -1, maxY = -1, ink = 0;
    for (let y = 0; y < originalHeight; y++) {
      for (let x = 0; x < originalWidth; x++) {
        if (data[(y * originalWidth + x) * 4 + 3] < ALPHA_FLOOR) continue;
        ink++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    const inkRatio = ink / n;

    /* ورقٌ فارغٌ أو صورةٌ بلا محتوى: تُرفَض صريحاً ولا تُخرَج لوحةٌ
       فارغةٌ تبدو نجاحاً. */
    if (maxX < minX || maxY < minY || inkRatio < MIN_INK_RATIO) {
      return { ok: false, reason: "no_content" };
    }

    let x0 = 0, y0 = 0, x1 = originalWidth, y1 = originalHeight, trimmed = false;
    const padX = Math.max(2, Math.round((maxX - minX + 1) * TRIM_PAD_RATIO));
    const padY = Math.max(2, Math.round((maxY - minY + 1) * TRIM_PAD_RATIO));
    const nx0 = Math.max(0, minX - padX), ny0 = Math.max(0, minY - padY);
    const nx1 = Math.min(originalWidth, maxX + 1 + padX), ny1 = Math.min(originalHeight, maxY + 1 + padY);
    if (nx1 - nx0 > 0 && ny1 - ny0 > 0 &&
        (nx0 > 0 || ny0 > 0 || nx1 < originalWidth || ny1 < originalHeight)) {
      x0 = nx0; y0 = ny0; x1 = nx1; y1 = ny1; trimmed = true;
    }

    /* ── تحجيمٌ بنسبةٍ واحدة، ولا تكبير ── */
    const cropW = x1 - x0, cropH = y1 - y0;
    const scale = Math.min(1, PRINT_MAX_DIM / Math.max(cropW, cropH));
    const outW = Math.max(1, Math.round(cropW * scale));
    const outH = Math.max(1, Math.round(cropH * scale));

    const out = document.createElement("canvas");
    out.width = outW; out.height = outH;
    const octx = out.getContext("2d");
    if (!octx) return { ok: false, reason: "unreadable" };
    octx.imageSmoothingQuality = "high";
    octx.drawImage(src, x0, y0, cropW, cropH, 0, 0, outW, outH);

    /* المخرَجُ PNG دائماً: الشفافيّةُ تُصان، وPNG مقروءٌ في كلِّ مسارِ
       طباعةٍ وPDF بلا استثناء — وWebP ليس كذلك في كلِّها. */
    const blob = await new Promise<Blob | null>(resolve => out.toBlob(b => resolve(b), "image/png", 1));
    if (!blob) return { ok: false, reason: "unreadable" };

    return {
      ok: true,
      image: {
        blob, mimeType: "image/png",
        width: outW, height: outH,
        originalWidth, originalHeight,
        hasAlpha: true, trimmed, backgroundRemoved, inkRatio,
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
