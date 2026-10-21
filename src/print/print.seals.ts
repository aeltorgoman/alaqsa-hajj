// ============================================================
// ختمُ الشركة والتوقيعُ المعتمد على كلّ ورقةٍ مطبوعة
// ============================================================
/* المطلوب: ختمٌ وتوقيعٌ متجاوران أسفلَ **كلِّ ورقةٍ فعليّة**، بمقاسٍ واقعيّ
   ونسبةِ الصورة الأصليّة، بلا إطارٍ ولا خلفيّةٍ ولا تسمية — كورقةٍ خُتمت
   ووُقّعت باليد. ولا يغطّيان سطراً من التقرير أبداً.

   ⚠️ وما جُرِّب على Chromium 141 بطباعةٍ حقيقيّة إلى PDF، فحُسم به الاختيار:
     • `position: fixed` يتكرّر على كلّ ورقة، لكنّه **يعلو** الصفوفَ الأخيرة
       في الورقة الممتلئة فيغطّي أسماءً وأرقاماً — مرفوض.
     • صورةٌ تخرج من صندوق الهامش إلى منطقة المحتوى **تُقصّ** عند حدّها.
     • `background-image` في صندوق الهامش لا يُطبَع إن أُطفئت «خلفيّات
       الصفحة» في حوار الطباعة (وهو افتراضُه) — ولا تُفرَض الطباعةُ على
       `html` لأنّها تفرض النقشةَ معها.
     • `content: image-set(url(...) Nx)` في صندوق هامش `@page` **يُطبَع
       دائماً، وعلى كلّ ورقة، وخارج المحتوى**. وبـ`Nx` يُضبط المقاسُ الفعليّ
       من أبعاد الصورة الطبيعيّة.
   فالمستندُ المتدفّق (والكشوفُ المقسَّمة أقساماً) يحجز في هامشه السفليّ
   **أقلَّ ما يسع الأطولَ من الصورتين** لا أكثر، ويرسمهما فيه. وما يُبنى
   أوراقاً ذرّيّةً بهامشٍ صفر (الفندق) يرسمهما داخل الورقة نفسها.

   ⚠️ ولا يُعرَف هنا رابطٌ دائم: `url` رابطٌ موقَّعٌ قصيرُ العمر يأتي من
   المنادي بعد أن حمّل الصورةَ وفكّها — انظر `company/printSeals.ts`. */

/** صورةٌ جاهزةٌ للطباعة: رابطٌ موقَّع، وأبعادُها الطبيعيّة بالبكسل. */
export type SealImage = { url: string; width: number; height: number };
/** الختمُ والتوقيعُ المطلوبان لهذه الطبعة — الغائبُ لم يُطلَب. */
export type PrintSeals = { stamp?: SealImage; signature?: SealImage };

/* ═══ المقاسات الواقعيّة — مستقلّةٌ لكلٍّ منهما ═══
   ختمُ الشركة المستدير ٣٠–٣٥مم في الواقع، والتوقيعُ أعرضُ منه وأقصر.
   فلكلٍّ صندوقٌ أقصى، والصورةُ تُحفَظ نسبتُها داخله. */
export const STAMP_BOX_MM = { w: 36, h: 32 } as const;
export const SIGNATURE_BOX_MM = { w: 48, h: 20 } as const;
/** بُعدُ الصورتين عن حافّة الورقة السفلى — هامشُ أمانٍ للطابعات. */
export const SEAL_EDGE_MM = 7;
/** المسافةُ بين آخرِ سطرٍ في التقرير وأعلى الصورتين. */
export const SEAL_GAP_MM = 3;
/** المسافةُ بين الختم والتوقيع. */
export const SEAL_BETWEEN_MM = 8;

const MM_PER_CSS_PX = 25.4 / 96;
const round = (n: number) => Math.round(n * 100) / 100;

export const hasSeals = (s: PrintSeals | null | undefined): s is PrintSeals =>
  !!s && !!(s.stamp || s.signature);

/** مقاسُ الصورة على الورق بالمليمتر: أكبرُ ما يسعه صندوقُها بنسبتها. */
export function sealSizeMm(img: SealImage, box: { w: number; h: number }): { w: number; h: number } {
  const w = Math.max(1, img.width), h = Math.max(1, img.height);
  const k = Math.min(box.w / w, box.h / h);
  return { w: round(w * k), h: round(h * k) };
}

const sized = (s: PrintSeals) => ({
  stamp: s.stamp ? { img: s.stamp, mm: sealSizeMm(s.stamp, STAMP_BOX_MM) } : null,
  signature: s.signature ? { img: s.signature, mm: sealSizeMm(s.signature, SIGNATURE_BOX_MM) } : null,
});

/** ارتفاعُ الأطول من الصورتين — ما يُحجَز لهما فوق حافّة الورقة. */
export function sealBandMm(s: PrintSeals): number {
  const z = sized(s);
  return Math.max(z.stamp?.mm.h ?? 0, z.signature?.mm.h ?? 0);
}

/** الهامشُ السفليّ اللازم: لا يقلّ عن هامش المستند القائم، ولا يزيد
 *  على ما يسع الصورتين — فالحجزُ أقلُّ ما يكفي، لا شريطٌ ثابت. */
export function sealBottomMarginMm(s: PrintSeals, baseBottomMm: number): number {
  return round(Math.max(baseBottomMm, SEAL_EDGE_MM + sealBandMm(s) + SEAL_GAP_MM));
}

/* `url` موقَّعٌ من التخزين — لا اقتباسَ فيه، لكنّه يُهرَّب احتياطاً */
const cssUrl = (u: string) => `url("${u.replace(/["\\\n\r]/g, encodeURIComponent)}")`;
/** صورةٌ في `content` بمقاسٍ فعليّ: الكثافةُ = بكسلاتُها ÷ بكسلاتِ ارتفاعِها المطلوب. */
const imageContent = (img: SealImage, mm: { w: number; h: number }) =>
  `image-set(${cssUrl(img.url)} ${(img.height / (mm.h / MM_PER_CSS_PX)).toFixed(4)}x)`;

/** قاعدةُ `@page` للمستند المتدفّق: هامشٌ سفليٌّ يسع الصورتين، وهما فيه.
 *  تُضاف **بعد** قاعدة المستند فتُعدّل الهامشَ السفليّ وحده.
 *  والترتيبُ من اليسار: الختمُ ثمّ التوقيع، متجاورَين على خطٍّ سفليٍّ واحد. */
export function sealPageCSS(s: PrintSeals, baseBottomMm: number): string {
  if (!hasSeals(s)) return "";
  const z = sized(s);
  const items: string[] = [];
  if (z.stamp) items.push(imageContent(z.stamp.img, z.stamp.mm));
  /* فاصلٌ بعرض «em» واحد — والخطُّ في الصندوق بمقاس الفاصل، فهو SEAL_BETWEEN_MM بالضبط */
  if (z.stamp && z.signature) items.push(`"\\2003"`);
  if (z.signature) items.push(imageContent(z.signature.img, z.signature.mm));
  return `@page { margin-bottom: ${sealBottomMarginMm(s, baseBottomMm)}mm;
    @bottom-left { content: ${items.join(" ")}; direction: ltr; text-align: left; vertical-align: bottom;
      font-size: ${SEAL_BETWEEN_MM}mm; line-height: 1; padding-bottom: ${SEAL_EDGE_MM}mm; } }`;
}

/** صورٌ مخفيّةٌ بالروابط نفسها: `printInPage` تنتظر صورَ المستند قبل
 *  الطباعة، وصورُ CSS لا تدخل في انتظارها — فبهذه تدخل. */
export function sealPreloadHTML(s: PrintSeals | null | undefined): string {
  if (!hasSeals(s)) return "";
  return [s.stamp, s.signature].filter((x): x is SealImage => !!x)
    .map(i => `<img src="${i.url.replace(/"/g, "&quot;")}" alt="" style="display:none" />`).join("");
}

/** الصورتان داخل ورقةٍ ذرّيّة (هامشُ `@page` فيها صفر): صفٌّ بلا إطار،
 *  ارتفاعُه ارتفاعُ الأطول منهما، في الطرف الأيسر من الورقة. */
export function sealRowHTML(s: PrintSeals | null | undefined): string {
  if (!hasSeals(s)) return "";
  const z = sized(s);
  const img = (x: { img: SealImage; mm: { w: number; h: number } }) =>
    `<img src="${x.img.url.replace(/"/g, "&quot;")}" alt="" style="width:${x.mm.w}mm;height:${x.mm.h}mm;display:block" />`;
  const parts = [z.signature ? img(z.signature) : "", z.stamp ? img(z.stamp) : ""].filter(Boolean);
  return `<div class="print-seals" style="display:flex;flex-direction:row;justify-content:flex-end;align-items:flex-end;` +
         `gap:${SEAL_BETWEEN_MM}mm;height:${sealBandMm(s)}mm;margin-top:${SEAL_GAP_MM}mm;flex-shrink:0">${parts.join("")}</div>`;
}

/** الهامشُ السفليّ لقاعدة `@page` القائمة — من صيغتها المختصرة (١–٤ قيم). */
export function bottomOfMargin(margin: string): number {
  const v = margin.trim().split(/\s+/).map(x => parseFloat(x));
  const mm = (i: number) => (Number.isFinite(v[i]) ? v[i] : 0);
  return v.length >= 3 ? mm(2) : mm(0);
}
