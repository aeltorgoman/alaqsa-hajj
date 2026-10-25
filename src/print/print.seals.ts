// ============================================================
// ختمُ الشركة والتوقيعُ المعتمد على كلّ ورقةٍ مطبوعة
// ============================================================
/* المطلوب: ختمٌ وتوقيعٌ متجاوران أسفلَ **كلِّ ورقةٍ فعليّة**، بمقاسٍ واقعيّ
   ونسبةِ الصورة الأصليّة، بلا إطارٍ ولا خلفيّةٍ ولا تسمية — كورقةٍ خُتمت
   ووُقّعت باليد. ولا يغطّيان سطراً من التقرير أبداً، ولا يزيدان ورقةً إلا
   حيث لا مفرّ.

   ⚠️ ما جُرِّب على Chromium بطباعةٍ حقيقيّة إلى PDF فحُسم به الاختيار:
     • `position: fixed` يتكرّر على كلّ ورقة لكنّه **يعلو** الصفوفَ الأخيرة
       في الورقة الممتلئة — مرفوض.
     • صورةٌ تخرج من صندوق هامش `@page` إلى المحتوى **تُقصّ** عند حدّه.
     • `background-image` في صندوق الهامش لا يُطبَع إن أُطفئت «خلفيّات الصفحة».
     • `content: image-set(url(...) Nx)` في صندوق هامش `@page` **يُطبَع دائماً
       وعلى كلّ ورقة وخارج المحتوى** — وهو «الشريط» أدناه.

   ⚠️ وما أظهرته المعاينةُ الحقيقيّة: شريطٌ ثابتٌ في كلّ ورقة (قرارٌ ساكنٌ في
   الباني) يقتطع من كلّ ورقةٍ قدرَه، فكشفٌ يملأ ورقتَه بخطوط جهاز الموظّف
   ينقلب ورقتين. ولا يُعرَف امتلاءُ الورقة في الباني: الخطُّ على جهاز الموظّف
   (Arial ويندوز بحروفه العربيّة) غيرُه في أيّ بيئة اختبار.
   فالقرارُ صار **في المستند نفسه لحظةَ الطباعة**، بقياسٍ بمحرّك المتصفّح
   وخطوطه (`sealPlanHTML`):
     ١) كلُّ قسمٍ يبدأ ورقتَه (فاصلُ صفحة) يُقاس. إن وسع الختمَ تحته في
        ورقته وُضع **في فراغها** أسفلَها — لا شريط ولا إزاحة ولا ورقة زائدة.
     ٢) وإن لم يسعه بفارقٍ يسير صُغِّر خطُّ جداول ذلك القسم وحده قليلاً
        (حتى ٨٥٪، ولا دون ٩pt) — والمقروئيّةُ محفوظة.
     ٣) وإلا (ورقةٌ ممتلئةٌ حقّاً أو جدولٌ يمتدّ أوراقاً) فالشريطُ في هامش
        كلّ ورقة، وقد يزيد ورقةً — زيادةٌ لا مفرّ منها، والمحتوى لا يُغطّى.
   والورقةُ الذرّيّةُ (الفندق) ترسمهما داخلها — انظر `print.reports.ts`. */

/** صورةٌ جاهزةٌ للطباعة: رابطٌ (موقَّعٌ أو data: بعد القصّ)، وأبعادُها بالبكسل. */
export type SealImage = {
  url: string; width: number; height: number;
  /** أبعادُ الحبر المرئيّ داخل الصورة (بكسل) — من القصّ؛ وغيابُها يعني أنّ الصورة كلَّها حبر. */
  inkWidth?: number; inkHeight?: number;
};
/** الختمُ والتوقيعُ المطلوبان لهذه الطبعة — الغائبُ لم يُطلَب. */
export type PrintSeals = { stamp?: SealImage; signature?: SealImage };

/* ═══ المقاسات الواقعيّة — مستقلّةٌ لكلٍّ منهما ═══
   ختمُ الشركة المستدير نحو ٤٠مم قطراً على ورقة A4، والتوقيعُ أعرضُ منه
   وأقصر. والمقاسُ مقاسُ **الحبر المرئيّ**: الحشوُ الشفّافُ حول الصورة يُقصّ
   قبل الطباعة (`company/printSeals.ts`)، فلا يصغر الختمُ داخل صندوقه.
   والإيصالُ A5 بنسبة الورقة نفسها (٠٫٧٥) فيبدو كما يبدو على A4. */
export const STAMP_BOX_MM = { w: 42, h: 40 } as const;
export const SIGNATURE_BOX_MM = { w: 62, h: 28 } as const;
/** نسبةُ ورقة A5 إلى A4 — لمقاس الختم في الإيصال. */
export const A5_SEAL_SCALE = 0.75;
/** بُعدُ الصورتين عن حافّة الورقة السفلى في الشريط — هامشُ أمانٍ للطابعات. */
export const SEAL_EDGE_MM = 6;
/** المسافةُ بين آخرِ سطرٍ في التقرير وأعلى الصورتين. */
export const SEAL_GAP_MM = 3;
/** المسافةُ بين الختم والتوقيع. */
export const SEAL_BETWEEN_MM = 10;

const MM_PER_CSS_PX = 25.4 / 96;
const round = (n: number) => Math.round(n * 100) / 100;

export const hasSeals = (s: PrintSeals | null | undefined): s is PrintSeals =>
  !!s && !!(s.stamp || s.signature);

/** مقاسُ الصورة على الورق بالمليمتر: أكبرُ ما يسعه صندوقُها بنسبتها. */
export function sealSizeMm(img: SealImage, box: { w: number; h: number }, scale = 1): { w: number; h: number } {
  const w = Math.max(1, img.width), h = Math.max(1, img.height);
  const k = Math.min((box.w * scale) / w, (box.h * scale) / h);
  return { w: round(w * k), h: round(h * k) };
}

type Sized = { img: SealImage; mm: { w: number; h: number } };
const sized = (s: PrintSeals, scale = 1) => ({
  stamp: s.stamp ? { img: s.stamp, mm: sealSizeMm(s.stamp, STAMP_BOX_MM, scale) } as Sized : null,
  signature: s.signature ? { img: s.signature, mm: sealSizeMm(s.signature, SIGNATURE_BOX_MM, scale) } as Sized : null,
});

/** ارتفاعُ الأطول من الصورتين. */
export function sealBandMm(s: PrintSeals, scale = 1): number {
  const z = sized(s, scale);
  return Math.max(z.stamp?.mm.h ?? 0, z.signature?.mm.h ?? 0);
}

/** عرضُ الصورتين متجاورتين — لمعرفة ما يسعهما من فراغ. */
export function sealWidthMm(s: PrintSeals, scale = 1): number {
  const z = sized(s, scale);
  return round((z.stamp?.mm.w ?? 0) + (z.signature?.mm.w ?? 0) + (z.stamp && z.signature ? SEAL_BETWEEN_MM * scale : 0));
}

/** الهامشُ السفليّ للشريط: لا يقلّ عن هامش المستند القائم، ولا يزيد على ما يسعهما. */
export function sealBottomMarginMm(s: PrintSeals, baseBottomMm: number, scale = 1): number {
  return round(Math.max(baseBottomMm, (SEAL_EDGE_MM + SEAL_GAP_MM) * scale + sealBandMm(s, scale)));
}

/* `url` موقَّعٌ أو data: — لا اقتباسَ فيه، لكنّه يُهرَّب احتياطاً */
const cssUrl = (u: string) => `url("${u.replace(/["\\\n\r]/g, encodeURIComponent)}")`;
const attrUrl = (u: string) => u.replace(/"/g, "&quot;");
/** صورةٌ في `content` بمقاسٍ فعليّ: الكثافةُ = بكسلاتُها ÷ بكسلاتِ ارتفاعِها المطلوب. */
const imageContent = (x: Sized) =>
  `image-set(${cssUrl(x.img.url)} ${(x.img.height / (x.mm.h / MM_PER_CSS_PX)).toFixed(4)}x)`;

/** الشريط: قاعدةُ `@page` تحجز في الهامش السفليّ أقلَّ ما يسع الصورتين
 *  وترسمهما فيه على كلّ ورقة. تُضاف **بعد** قاعدة المستند فتُعدّل الهامشَ
 *  السفليّ وحده. والترتيبُ من اليسار: الختمُ ثمّ التوقيع على خطٍّ سفليٍّ واحد. */
export function sealPageCSS(s: PrintSeals, baseBottomMm: number, scale = 1): string {
  if (!hasSeals(s)) return "";
  const z = sized(s, scale);
  const items: string[] = [];
  if (z.stamp) items.push(imageContent(z.stamp));
  /* فاصلٌ بعرض «em» واحد — والخطُّ في الصندوق بمقاس الفاصل */
  if (z.stamp && z.signature) items.push(`"\\2003"`);
  if (z.signature) items.push(imageContent(z.signature));
  return `@page { margin-bottom: ${sealBottomMarginMm(s, baseBottomMm, scale)}mm;
    @bottom-left { content: ${items.join(" ")}; direction: ltr; text-align: left; vertical-align: bottom;
      font-size: ${round(SEAL_BETWEEN_MM * scale)}mm; line-height: 1; padding-bottom: ${round(SEAL_EDGE_MM * scale)}mm; } }`;
}

/** الصورتان متجاورتين بلا إطار، أسفلُهما على خطٍّ واحد، في الطرف الأيسر. */
export function sealImagesHTML(s: PrintSeals, scale = 1, cls = "print-seals"): string {
  if (!hasSeals(s)) return "";
  const z = sized(s, scale);
  const img = (x: Sized) => `<img src="${attrUrl(x.img.url)}" alt="" style="width:${x.mm.w}mm;height:${x.mm.h}mm;display:block" />`;
  /* في الاتّجاه العربيّ: الأوّلُ يميناً — فالتوقيعُ يميناً والختمُ يساراً كما في الشريط */
  const parts = [z.signature ? img(z.signature) : "", z.stamp ? img(z.stamp) : ""].filter(Boolean);
  return `<div class="${cls}" style="display:flex;flex-direction:row;justify-content:flex-end;align-items:flex-end;` +
         `gap:${round(SEAL_BETWEEN_MM * scale)}mm;height:${sealBandMm(s, scale)}mm;break-inside:avoid;page-break-inside:avoid">${parts.join("")}</div>`;
}

/** صورٌ مخفيّةٌ بالروابط نفسها: `printInPage` تنتظر صورَ المستند قبل
 *  الطباعة، وصورُ CSS لا تدخل في انتظارها — فبهذه تدخل. */
export function sealPreloadHTML(s: PrintSeals | null | undefined): string {
  if (!hasSeals(s)) return "";
  return [s.stamp, s.signature].filter((x): x is SealImage => !!x)
    .map(i => `<img src="${attrUrl(i.url)}" alt="" style="display:none" />`).join("");
}

/** المجموعةُ داخل ورقةٍ ذرّيّة (الفندق): صفٌّ تحت الشبكة في طرف الورقة الأيسر. */
export function sealRowHTML(s: PrintSeals | null | undefined): string {
  return sealGroupHTML(s, "print-seals", `margin-top:${SEAL_GAP_MM}mm;flex-shrink:0;align-self:flex-end;`);
}

/** الهامشُ لقاعدة `@page` القائمة — من صيغتها المختصرة (١–٤ قيم): أعلى، جانب، أسفل. */
export function marginsOf(margin: string): { top: number; side: number; bottom: number } {
  const v = margin.trim().split(/\s+/).map(x => parseFloat(x)).map(x => (Number.isFinite(x) ? x : 0));
  const [a, b = a, c = a] = v.length ? v : [0];
  return { top: a, side: b, bottom: c };
}
export const bottomOfMargin = (margin: string) => marginsOf(margin).bottom;

/** مقاسُ الورقة بالمليمتر. */
export const PAGE_MM = {
  A4: { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } },
  A5: { portrait: { w: 148, h: 210 }, landscape: { w: 210, h: 148 } },
} as const;

/** ورقةُ المستند كما يحتاجها المخطِّط: المقاسُ والهامش. */
export type SealPage = {
  size?: "A4" | "A5"; landscape?: boolean; margin: string; scale?: number;
  /** الإيصال: الصورتان في خانتيهما (`img` بهذا المحدِّد) ما دام ورقةً واحدة؛ وإلا
   *  أُضيف `multipageClass` إلى <html> (يخفي الخانتين) ورُسمتا في الشريط. */
  boxes?: { img: string; multipageClass: string };
};

/** أقلُّ معاملِ تصغيرٍ لخطّ الجداول كي لا تزيد ورقة — ولا دون ٩pt. */
export const SEAL_FIT_MIN_SCALE = 0.85;
export const SEAL_FIT_MIN_PT = 9;
/** أصغرُ مقاسٍ للصورتين (نسبةً إلى الواقعيّ) قبل قبول ورقةٍ زائدة. */
export const SEAL_MIN_SIZE_SCALE = 0.6;

/** المخطِّط: يُلحَق بآخر جسم المستند حين يُطلب الختم. يحاكي تقسيمَ المتصفّح
 *  للمستند إلى أوراق بعرض الورقة الفعليّ وخطوط الجهاز، ثمّ يرسم الصورتين في
 *  هامش كلّ ورقة (الشريط) بأكبر مقاسٍ واقعيٍّ لا يزيد ورقة. ويُعلم
 *  `printInPage` بانتهائه (`data-seal-plan`) فلا تُطبع الورقةُ قبل قراره. */
export function sealPlanHTML(s: PrintSeals | null | undefined, page: SealPage): string {
  if (!hasSeals(s)) return "";
  const scale = page.scale ?? 1;
  const m = marginsOf(page.margin);
  const dim = PAGE_MM[page.size ?? "A4"][page.landscape ? "landscape" : "portrait"];
  const z = sized(s, scale);
  const img = (x: Sized | null) => x && { url: x.img.url, px: x.img.height, w: x.mm.w, h: x.mm.h };
  const cfg = {
    contentWidthMm: round(dim.w - 2 * m.side),
    contentHeightMm: round(dim.h - m.top - m.bottom),
    baseBottomMm: m.bottom,
    edgeMm: SEAL_EDGE_MM * scale, gapMm: SEAL_GAP_MM * scale, betweenMm: SEAL_BETWEEN_MM * scale,
    stamp: img(z.stamp), signature: img(z.signature),
    safetyMm: 2,
    minScale: SEAL_FIT_MIN_SCALE, minPt: SEAL_FIT_MIN_PT,
    sizes: [1, 0.9, 0.8, 0.7, SEAL_MIN_SIZE_SCALE],
    boxes: page.boxes ?? null,
  };
  return `${sealPreloadHTML(s)}<script>(${SEAL_PLAN_RUNTIME})(${JSON.stringify(cfg)});</script>`;
}

/* ═══ المخطِّطُ داخل المستند ═══
   نصٌّ صريح (لا دالّةٌ مُسلسَلة) كي لا يغيّره المُصغِّر: يُحقَن كما هو.

   المحاكاة: كلُّ فاصلِ صفحةٍ يبدأ قسماً. والقسمُ قائمةُ «ذرّات» لا تنقسم —
   صفُّ جدولٍ، أو كتلةٌ لا جدولَ فيها، أو كتلةٌ «لا تنقسم» — تُرصّ في أوراقٍ
   بارتفاع المحتوى، ورأسُ الجدول المتكرّر يُحسب في كلّ ورقة. فيُعرَف عددُ
   أوراق كلّ قسمٍ بلا ختم وبالشريط، قبل الطباعة.

   الترتيبُ (أولويّاتُ المطلوب): لا تراكبَ أبداً (الشريطُ في الهامش)، ثم لا
   ورقةَ زائدة: المقاسُ الواقعيّ أوّلاً، فإن زاد ورقةً صُغِّر خطُّ جداول القسم
   الزائد وحده قليلاً (حتى ٨٥٪ ولا دون ٩pt)، ثمّ الصورتان قليلاً (حتى ٦٠٪ —
   ختمٌ نحو ٢٤مم، وهو أصغرُ مقاسٍ مقبولٍ لختم شركة؛ فترتيبُ الأولويّات يقدّم
   عددَ الأوراق على المقاس).
   فإن لم يكفِ شيءٌ قُبلت الورقةُ بالمقاس الواقعيّ وسُجّل ذلك في القرار. */
/* الأجزاءُ المشتركة بين المخطِّطَين (الإيصال A5 بالشريط، وتقارير A4 بالمجموعة):
   المحاكاةُ (الذرّات والأقسام والأوراق) وتصغيرُ خطّ الجداول. نصوصٌ تُوصَل كما هي. */
const SIM_RUNTIME = `  var MM = 96 / 25.4, doc = document, body = doc.body, root = doc.documentElement;
  function cs(e) { return getComputedStyle(e); }
  function isBreak(e, side) {
    var c = cs(e), v = side === "before" ? (c.breakBefore || c.pageBreakBefore) : (c.breakAfter || c.pageBreakAfter);
    return v === "page" || v === "always" || v === "left" || v === "right";
  }
  function measurable(e) {
    if (!e || e.nodeType !== 1) return false;
    var t = e.tagName;
    if (t === "SCRIPT" || t === "STYLE" || t === "LINK" || t === "META") return false;
    return cs(e).display !== "none";
  }
  /* ── الذرّات ── */
  function atoms(top) {
    var out = [];
    function rect(e) { var r = e.getBoundingClientRect(); return { top: r.top - top, bottom: r.bottom - top, h: r.height }; }
    function table(t) {
      var head = 0, th = t.tHead;
      if (th && cs(th).display === "table-header-group") head = th.getBoundingClientRect().height;
      var cap = t.caption; if (cap && measurable(cap)) { var c = rect(cap); out.push({ top: c.top, bottom: c.bottom, head: 0, el: cap }); }
      for (var i = 0; i < t.rows.length; i++) {
        var r = t.rows[i]; if (!measurable(r)) continue;
        var x = rect(r); if (x.h <= 0) continue;
        var inHead = th && r.parentNode === th;
        out.push({ top: x.top, bottom: x.bottom, head: inHead ? 0 : head, el: r });
      }
    }
    function walk(el) {
      for (var i = 0; i < el.children.length; i++) {
        var c = el.children[i];
        if (!measurable(c)) continue;
        var x = rect(c); if (x.h <= 0) continue;
        var pos = cs(c).position;
        if (pos === "absolute" || pos === "fixed") continue;
        var avoid = cs(c).breakInside === "avoid" || cs(c).pageBreakInside === "avoid";
        var hasTable = c.tagName === "TABLE" || !!c.querySelector("table");
        if (avoid && x.h <= cfg.contentHeightMm * MM) out.push({ top: x.top, bottom: x.bottom, head: 0, el: c });
        else if (c.tagName === "TABLE") table(c);
        else if (hasTable || isBreakHost(c)) {
          /* حشوُ الحاوية وحدُّها السفليّان بعد آخر أبنائها يُطبعان في آخر قطعةٍ منها —
             فإن لم يسعهما ما بقي من الورقة دُفعا وحدَهما إلى ورقة */
          var from = out.length; walk(c);
          var last = -Infinity; for (var j = from; j < out.length; j++) last = Math.max(last, out[j].bottom);
          if (last > -Infinity && x.bottom - last > 0.5) out.push({ top: last, bottom: x.bottom, head: 0, el: c, tail: true });
        }
        else out.push({ top: x.top, bottom: x.bottom, head: 0, el: c });
      }
    }
    function isBreakHost(c) {
      var all = c.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) if (measurable(all[i]) && (isBreak(all[i], "before") || isBreak(all[i], "after"))) return true;
      return false;
    }
    walk(body);
    return out;
  }
  /* ── الأقسام: [أوّلُ المستند … فاصل) ── */
  function layout() {
    var top = body.getBoundingClientRect().top, marks = [];
    var all = body.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (!measurable(e)) continue;
      if (isBreak(e, "before")) marks.push(e.getBoundingClientRect().top - top);
      if (isBreak(e, "after")) marks.push(e.getBoundingClientRect().bottom - top);
    }
    marks.sort(function (a, b) { return a - b; });
    var at = atoms(top), end = 0;
    for (var j = 0; j < at.length; j++) end = Math.max(end, at[j].bottom);
    var segs = [], start = 0;
    for (var k = 0; k <= marks.length; k++) {
      var stop = k < marks.length ? marks[k] : end + 1;
      if (stop - start > 0.5) {
        var list = at.filter(function (a) { return a.top >= start - 0.5 && a.top < stop - 0.5; });
        if (list.length) segs.push({ start: start, atoms: list });
      }
      start = Math.max(start, stop);
    }
    return segs;
  }
  /* أوراقُ القسم بارتفاع محتوى «room» */
  function pagesOf(seg, room) {
    var n = 1, pageTop = seg.start;
    for (var i = 0; i < seg.atoms.length; i++) {
      var a = seg.atoms[i];
      if (a.bottom - pageTop > room + 0.5 && a.top - a.head > pageTop + 0.5) { n++; pageTop = a.top - a.head; }
    }
    return n;
  }
`;
const CELLS_RUNTIME = `  /* ── تصغيرُ خطّ جداول الأقسام الزائدة وحدها ── */
  var cells = null;
  function collect(segs) {
    cells = [];
    var top = body.getBoundingClientRect().top, list = body.querySelectorAll("td, th");
    for (var i = 0; i < list.length; i++) {
      var y = list[i].getBoundingClientRect().top - top, seg = 0;
      for (var k = 0; k < segs.length; k++) if (y >= segs[k].start - 0.5) seg = k;
      var c = cs(list[i]);
      cells.push({ e: list[i], seg: seg, fs: parseFloat(c.fontSize), pt: parseFloat(c.paddingTop),
                   pb: parseFloat(c.paddingBottom), style: list[i].getAttribute("style") });
    }
  }
  function scaleCells(f, bad) {
    var minPx = cfg.minPt * 96 / 72;
    for (var k = 0; k < cells.length; k++) {
      var c = cells[k];
      if (c.style === null) c.e.removeAttribute("style"); else c.e.setAttribute("style", c.style);
      if (f >= 1 || !bad[c.seg]) continue;
      var fs = Math.max(minPx, c.fs * f);
      if (fs >= c.fs) continue;
      var r = fs / c.fs;
      c.e.style.fontSize = fs + "px";
      c.e.style.paddingTop = (c.pt * r) + "px";
      c.e.style.paddingBottom = (c.pb * r) + "px";
    }
  }
`;

/* ── التذييلُ الختاميّ وحده في الورقة الأخيرة ──
   سطرُ التذييل (بهامشه العلويّ ١٠pt وحشوه وحدّه نحو ٨٫٦مم) يُدفع وحده إلى ورقةٍ جديدة متى بقي
   تحت آخر صفٍّ أقلُّ من ذلك. فيُعرَف هنا، بارتفاع الورقة ناقصاً هامشَ الأمان، ويُعالَج بما لا يُخفيه:
   تضييقُ حواشيه هو، فإن لم يكفِ فحملُ آخر صفٍّ معه إلى الورقة التالية (ورقةٌ فيها بيانات). */
const FOOTER_TAIL_RUNTIME = `  function footerAlone(room) {
    var segs = layout(); if (!segs.length) return null;
    var seg = segs[segs.length - 1], pageTop = seg.start, onPage = [];
    for (var i = 0; i < seg.atoms.length; i++) {
      var a = seg.atoms[i];
      if (a.bottom - pageTop > room + 0.5 && a.top - a.head > pageTop + 0.5) { pageTop = a.top - a.head; onPage = []; }
      onPage.push(a);
    }
    if (pageTop === seg.start) return null;
    var els = [];
    for (var j = 0; j < onPage.length; j++) {
      var b = onPage[j];
      if (b.tail) continue;
      if (!(b.el.matches && b.el.matches(cfg.decorative))) return null;
      els.push(b);
    }
    if (!els.length) return null;
    var k = seg.atoms.indexOf(els[0]) - 1;
    while (k >= 0 && seg.atoms[k].tail) k--;
    return { els: els.map(function (x) { return x.el; }), before: k >= 0 ? seg.atoms[k] : null };
  }
  function compactFooter(els) { els.forEach(function (e) { e.style.marginTop = "3pt"; e.style.paddingTop = "2pt"; }); }
`;

const SEAL_PLAN_RUNTIME = `function (cfg) {
${SIM_RUNTIME}  /* ── الصورتان بالمقاس k ── */
  function sealH(k) { return Math.max(cfg.stamp ? cfg.stamp.h : 0, cfg.signature ? cfg.signature.h : 0) * k; }
  function marginFor(k) { return Math.max(cfg.baseBottomMm, (cfg.edgeMm + cfg.gapMm) * k + sealH(k)); }
  function roomFor(k) { return (cfg.contentHeightMm - (marginFor(k) - cfg.baseBottomMm) - cfg.safetyMm) * MM; }
  function url(u) { return 'url("' + u.replace(/["\\\\\\n\\r]/g, encodeURIComponent) + '")'; }
  function image(x, k) { return "image-set(" + url(x.url) + " " + (x.px / (x.h * k * MM)).toFixed(4) + "x)"; }
  function bandCSS(k) {
    var items = [];
    if (cfg.stamp) items.push(image(cfg.stamp, k));
    if (cfg.stamp && cfg.signature) items.push('"\\\\2003"');
    if (cfg.signature) items.push(image(cfg.signature, k));
    return "@page { margin-bottom: " + marginFor(k).toFixed(2) + "mm; @bottom-left { content: " + items.join(" ") +
      "; direction: ltr; text-align: left; vertical-align: bottom; font-size: " + (cfg.betweenMm * k).toFixed(2) +
      "mm; line-height: 1; padding-bottom: " + (cfg.edgeMm * k).toFixed(2) + "mm; } }";
  }
${CELLS_RUNTIME}  function plan() {
    var w = body.style.width;
    body.style.width = cfg.contentWidthMm + "mm";
    var full = cfg.contentHeightMm * MM, boxImgs = cfg.boxes ? doc.querySelectorAll(cfg.boxes.img) : [];
    /* المرجع: المستندُ كما يُطبع بلا ختم — وفي الإيصال خانتاه فارغتان */
    for (var bi = 0; bi < boxImgs.length; bi++) boxImgs[bi].style.display = "none";
    var segs = layout(), base = [], total0 = 0;
    for (var i = 0; i < segs.length; i++) { base.push(pagesOf(segs[i], full)); total0 += base[i]; }
    for (var bj = 0; bj < boxImgs.length; bj++) boxImgs[bj].style.display = "";
    if (cfg.boxes) {
      var inBoxes = layout(), n = 0;
      for (var q = 0; q < inBoxes.length; q++) n += pagesOf(inBoxes[q], full);
      /* ورقةٌ واحدة: الصورتان في خانتيهما كما في الإيصال دائماً */
      if (n === 1 && total0 === 1) {
        body.style.width = w;
        root.setAttribute("data-seal-sim", "1");
        root.setAttribute("data-seal-plan", "boxes");
        return;
      }
      root.classList.add(cfg.boxes.multipageClass);
      segs = layout();
    }
    collect(segs);
    var chosen = null;
    for (var si = 0; si < cfg.sizes.length && !chosen; si++) {
      var k = cfg.sizes[si], room = roomFor(k), bad = {}, nbad = 0;
      for (var a = 0; a < segs.length; a++) if (pagesOf(segs[a], room) > base[a]) { bad[a] = true; nbad++; }
      if (!nbad) { chosen = { k: k, f: 1 }; break; }
      for (var f = 0.97; f >= cfg.minScale - 1e-9; f -= 0.03) {
        scaleCells(f, bad);
        var again = layout();
        var ok = again.length === segs.length;
        for (var b = 0; ok && b < again.length; b++) if (pagesOf(again[b], room) > base[b]) ok = false;
        if (ok) { chosen = { k: k, f: f }; break; }
      }
      if (!chosen) scaleCells(1, bad);
    }
    var extra = 0;
    if (!chosen) {
      chosen = { k: 1, f: 1, extra: true };
      var fin = layout();
      for (var e = 0; e < fin.length; e++) extra += pagesOf(fin[e], roomFor(1)) - (base[e] || 0);
      /* الدليل: أكبرُ ما يُحجز أسفلَ كلّ ورقةٍ دون أن تزيد ورقة، مقابلَ أصغر شريطٍ مسموح */
      var slack = 0;
      for (var mm = 0; mm <= 60; mm++) {
        var okmm = true;
        for (var g = 0; g < fin.length && okmm; g++) if (pagesOf(fin[g], (cfg.contentHeightMm - mm) * MM) > (base[g] || 0)) okmm = false;
        if (okmm) slack = mm; else break;
      }
      root.setAttribute("data-seal-evidence", "slack=" + slack + "mm;min-band=" +
        (marginFor(cfg.sizes[cfg.sizes.length - 1]) - cfg.baseBottomMm + cfg.safetyMm).toFixed(1) + "mm");
    }
    var st = doc.createElement("style");
    st.textContent = bandCSS(chosen.k);
    doc.head.appendChild(st);
    body.style.width = w;
    root.setAttribute("data-seal-sim", String(total0));
    root.setAttribute("data-seal-plan", "band" + (chosen.k < 1 ? ":size" + chosen.k.toFixed(2) : "") +
      (chosen.f < 1 ? ":text" + chosen.f.toFixed(2) : "") + (chosen.extra ? ":extra+" + Math.max(1, extra) : ""));
  }
  /* أيُّ عطلٍ في القياس يعود إلى الشريط بالمقاس الواقعيّ — فلا تُطبَع ورقةٌ بلا ختمٍ طُلب ولا تراكب */
  function go() {
    try { plan(); }
    catch (err) {
      try { var st = doc.createElement("style"); st.textContent = bandCSS(1); doc.head.appendChild(st); } catch (e2) { /* لا شيء */ }
      root.setAttribute("data-seal-plan", "band:fallback");
    }
  }
  var ready = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
  ready.then(function () { if (doc.readyState === "complete") go(); else addEventListener("load", go); }, go);
}`;

/* ═══════════════════════════════════════════════════════════════
   تقارير A4: الختمُ والتوقيعُ مجموعةٌ واحدة بمقاسٍ ثابت (المعتمَد)
   ═══════════════════════════════════════════════════════════════
   المطلوب النهائيّ: مقاسٌ واقعيٌّ ثابت لا يُصغَّر أبداً (الختمُ نحو ٤٢مم عرضاً،
   والتوقيعُ نحو ٦٠مم)، متقاربان يتداخلان نحو ٨مم كختمٍ وُضع على طرف التوقيع،
   أسفلَ كلّ ورقة — بلا شريطٍ محجوزٍ يدفع المحتوى، وموضعُها في كلّ ورقةٍ حيث
   لا تعلو نصّاً (انظر «موضعُ المجموعة ورقةً ورقة» أدناه).

   ⚠️ ما حُسم بالطباعة الحقيقيّة إلى PDF:
     • `position: fixed` يُرسَم على **كلّ ورقة** في الموضع نفسه ولا يغيّر التدفّق،
       فعددُ الأوراق كما هو بلا ختم.
     • وما يخرج منه تحت حدّ المحتوى (في الهامش السفليّ) **يُعاد رسمُه أعلى الورقة
       التالية** (شريطٌ فوق رأس الجدول) — ولو بـ`transform`. فأسفلُ المجموعة على
       حدّ المحتوى السفليّ تماماً (`bottom: 0`) لا دونه.

   والمجموعةُ قد تعلو أسفلَ الورقة — حدودَ جدولٍ أو فراغاً — لكن **لا نصّاً**:
   فيحاكي المخطِّطُ تقسيمَ الأوراق، ويجمع مستطيلَ كلّ نصٍّ مرئيّ، ويعرف ما يقع منها
   تحت المجموعة في كلّ ورقة. فإن وقع نصٌّ تحتها نُقل صفُّه (وما بعده) إلى الورقة
   التالية — ما دام عددُ الأوراق لا يزيد. وإلا صُغِّر خطُّ جداول القسم الزائد قليلاً
   (حتى ٨٥٪ ولا دون ٩pt). فإن لم يكفِ: **استثناءٌ مُعلَن** (`exception`) — تبقى
   البياناتُ مقروءةً كاملةً بورقةٍ زائدة، ولا تُصغَّر الصورتان ولا يُغطّى نصّ. */

/** مقاسُ التوقيع على A4 — أكبرُ ما يسعه صندوقُه بنسبة الصورة (بعد قصّ حشوها). والختمُ
 *  مستقلٌّ عنه بقطر حبره (`A4_STAMP_INK_MM`). */
export const A4_SIGNATURE_BOX_MM = { w: 60, h: 30 } as const;
/** تداخلُ الختم مع طرف التوقيع. */
export const SEAL_OVERLAP_MM = 8;
/** فسحةٌ فوق المجموعة لا يقع فيها نصّ. */
const GROUP_CLEAR_MM = 1;
/** ما يجوز أن تعلوه المجموعة من النصوص: سطرُ التذييل الختاميّ (زينةٌ متكرّرة لا بيانات). */
const SEAL_DECORATIVE = "body > .footer";

/** قطرُ الختم المرئيّ على A4 — المقاسُ الفعليّ لختم الحملة (٤سم) كما أكّده المستخدم. */
export const A4_STAMP_INK_MM = 40;

/** مقاسُ صورة الختم بالمليمتر بحيث يكون **حبرُه** (لا صندوقُ صورته) بقطر `inkMm`:
 *  الصورةُ بعد القصّ = الحبرُ وحاشيةٌ، فتُكبَّر بنسبتها إلى الحبر. والقطرُ متوسّطُ عرض الحبر
 *  وارتفاعه — فختمٌ صُوِّر بميلٍ يسير (بيضاويٌّ قليلاً) لا يبعد محورٌ منه عن المقاس. وبلا أبعاد
 *  حبرٍ (صورةٌ لم تُقصّ) يُعامَل عرضُها كلُّه حبراً. */
export function stampSizeByInk(img: SealImage, inkMm: number): { w: number; h: number } {
  const w = Math.max(1, img.width), h = Math.max(1, img.height);
  const iw = img.inkWidth && img.inkWidth > 0 ? Math.min(img.inkWidth, w) : w;
  const ink = img.inkWidth && img.inkHeight && img.inkHeight > 0 ? (iw + Math.min(img.inkHeight, h)) / 2 : iw;
  const mmW = inkMm * (w / ink);
  return { w: round(mmW), h: round(mmW * (h / w)) };
}

/** مقاسُ كلٍّ منهما ومقاسُ المجموعة بالمليمتر — **مستقلّان**: الختمُ بقطر حبره (٤٠مم)،
 *  والتوقيعُ بصندوقه هو؛ وتغييرُ أحدهما لا يمسّ الآخر. */
export function sealGroupSize(s: PrintSeals): { stamp: { w: number; h: number } | null; signature: { w: number; h: number } | null; w: number; h: number } {
  const stamp = s.stamp ? stampSizeByInk(s.stamp, A4_STAMP_INK_MM) : null;
  const signature = s.signature ? sealSizeMm(s.signature, A4_SIGNATURE_BOX_MM) : null;
  const w = (stamp?.w ?? 0) + (signature?.w ?? 0) - (stamp && signature ? SEAL_OVERLAP_MM : 0);
  return { stamp, signature, w: round(w), h: Math.max(stamp?.h ?? 0, signature?.h ?? 0) };
}

/** المجموعة: الختمُ يساراً فوق طرف التوقيع الأيسر، بلا إطارٍ ولا تسمية. `style` موضعُها. */
export function sealGroupHTML(s: PrintSeals | null | undefined, cls: string, style: string): string {
  if (!hasSeals(s)) return "";
  const z = sealGroupSize(s);
  const img = (src: SealImage, mm: { w: number; h: number }, extra: string) =>
    `<img src="${attrUrl(src.url)}" alt="" style="width:${mm.w}mm;height:${mm.h}mm;display:block;flex-shrink:0;mix-blend-mode:multiply;${extra}" />`;
  const parts = [
    s.stamp && z.stamp ? img(s.stamp, z.stamp, "position:relative;z-index:2") : "",
    s.signature && z.signature ? img(s.signature, z.signature, s.stamp ? `margin-left:-${SEAL_OVERLAP_MM}mm` : "") : "",
  ].join("");
  return `<div class="${cls}" style="${style}width:${z.w}mm;height:${z.h}mm;direction:ltr;display:flex;flex-direction:row;` +
         `align-items:center;break-inside:avoid;page-break-inside:avoid">${parts}</div>`;
}

/** أقصى ارتفاعٍ للمجموعة عن أسفل الورقة حين لا يسعها أسفلُها. */
const GROUP_MAX_RAISE_MM = 40;
/** أقلُّ نسبةٍ لحشو الصفوف العموديّ حين يُضيَّق القسمُ ليسع المجموعة — الخطُّ لا يُمسّ في هذه الخطوة. */
const GROUP_MIN_ROW_PAD = 0.4;
/** بُعدُ أسفل المجموعة عن حدّ المحتوى السفليّ — تبقى داخل الورقة فلا تفيض إلى التالية. */
const GROUP_EDGE_MM = 1;
/** هامشُ أمانٍ يُخطَّط بدونه أسفلَ كلّ ورقة: القياسُ على الشاشة لا يطابق تخطيطَ الطباعة على كلّ جهاز
 *  (خطوطٌ وتقريبٌ مختلفان) — فخطّةٌ تملأ الورقةَ حتى آخر بكسلٍ تفيض في الطباعة الحقيقيّة. */
const GROUP_SAFETY_MM = 3;

/** مخطِّطُ تقارير A4: لكلّ ورقةٍ موضعُ المجموعة الذي لا يعلو نصّاً — أسفلَ اليسار
 *  ما أمكن، وإلا أسفلَ الورقة يميناً منه، وإلا أعلى قليلاً. */
export function sealGroupPlanHTML(s: PrintSeals | null | undefined, page: { landscape?: boolean; margin: string }): string {
  if (!hasSeals(s)) return "";
  const m = marginsOf(page.margin);
  const dim = PAGE_MM.A4[page.landscape ? "landscape" : "portrait"];
  const z = sealGroupSize(s);
  const cfg = {
    contentWidthMm: round(dim.w - 2 * m.side),
    contentHeightMm: round(dim.h - m.top - m.bottom),
    groupWmm: z.w, groupHmm: z.h, clearMm: GROUP_CLEAR_MM, decorative: SEAL_DECORATIVE,
    edgeMm: GROUP_EDGE_MM, safetyMm: GROUP_SAFETY_MM, maxRaiseMm: GROUP_MAX_RAISE_MM, stepMm: 2, minPad: GROUP_MIN_ROW_PAD,
    minScale: SEAL_FIT_MIN_SCALE, minPt: SEAL_FIT_MIN_PT,
    groupHTML: sealGroupHTML(s, "seal-group", "position:absolute;z-index:5;pointer-events:none;"),
  };
  return `${sealPreloadHTML(s)}<script>(${SEAL_GROUP_RUNTIME})(${JSON.stringify(cfg)});</script>`;
}

/* ═══ موضعُ المجموعة ورقةً ورقة ═══
   ⚠️ عنصرٌ ثابت (`position: fixed`) واحدٌ في كلّ الأوراق بالموضع نفسه؛ فإن وقع
   نصٌّ تحته في ورقةٍ لم يبقَ إلا نقلُ صفوفها — فتزيد ورقة. فصار لكلّ ورقةٍ مجموعتُها:
   مرساةٌ مطلقةٌ بلا إزاحة (`position: absolute` — خارج التدفّق فلا تغيّر سطراً)
   في أوّل صفٍّ من الورقة، تقع في قطعة تلك الورقة نفسها (حُسم بالطباعة الحقيقيّة،
   مع رأس الجدول المتكرّر والفواصل)، والمجموعةُ منها على الإزاحة المختارة.

   الاختيار لكلّ ورقة — من مستطيلات نصوصها الفعليّة:
     ١) أسفلَ اليسار (الموضع المعتمَد).
     ٢) أسفلَ الورقة منزاحةً يميناً بخطوة ٢مم حتى الطرف الأيمن.
     ٣) الشيءُ نفسه أعلى بخطوة ٢مم حتى ٤٠مم.
   والمجموعةُ كلُّها داخل حدّ المحتوى (١مم فوقه) فلا يفيض منها شيءٌ إلى التالية.
   فإن لم يسعها موضعٌ في ورقةٍ نُقل أوّلُ صفٍّ في أسفلها إلى التالية (إن لم تزد
   الأوراق)، ثمّ تصغيرُ خطّ الجداول ≥ ٨٥٪، ثمّ استثناءٌ مُعلَن بدليله. */
const SEAL_GROUP_RUNTIME = `function (cfg) {
${SIM_RUNTIME}${CELLS_RUNTIME}${FOOTER_TAIL_RUNTIME}  /* ⚠️ قسمٌ يبدأ بفاصلٍ داخل جدولٍ رأسُه متكرّر (صفٌّ نقله المخطِّط): يطبع Chromium
     الرأسَ فوقه في الورقة الجديدة — فبدايةُ الورقة قبل الصفّ بارتفاع الرأس. وبدونه
     تقع المجموعةُ أدنى بقدره فتفيض إلى ورقةٍ تالية (ظهر في كشف الحجّاج العرضيّ). */
  var layoutBase = layout;
  layout = function () {
    var segs = layoutBase();
    for (var i = 1; i < segs.length; i++) { var a = segs[i].atoms[0]; if (a && a.head > 0 && !a.tail) segs[i].start = a.top - a.head; }
    return segs;
  };
  /* أوراقُ القسم: بدايتُها، وأوّلُ ذرّةٍ فيها، ورأسُ الجدول المتكرّر أعلاها */
  function pagesFrom(segs, room) {
    var out = [];
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i], pageTop = seg.start, first = seg.atoms[0], head = seg.start < first.top - 0.5 ? first.head : 0, list = [];
      for (var k = 0; k < seg.atoms.length; k++) {
        var a = seg.atoms[k];
        if (a.bottom - pageTop > room + 0.5 && a.top - a.head > pageTop + 0.5) {
          list.push({ top: pageTop, first: first, head: head });
          pageTop = a.top - a.head; first = a; head = a.head;
        }
      }
      list.push({ top: pageTop, first: first, head: head });
      for (var j = 0; j < list.length; j++) {
        list[j].seg = i;
        list[j].end = j + 1 < list.length ? list[j + 1].top : (i + 1 < segs.length ? segs[i + 1].start : Infinity);
        out.push(list[j]);
      }
    }
    return out;
  }
  /* مستطيلُ كلّ نصٍّ مرئيّ في المستند — بإحداثيّات الجسم */
  function texts() {
    var b = body.getBoundingClientRect(), out = [], rg = doc.createRange();
    var tw = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT), n;
    while ((n = tw.nextNode())) {
      if (!/\\S/.test(n.nodeValue)) continue;
      var p = n.parentElement;
      /* سطرُ التذييل (اسمُ الحملة · عنوانُ الكشف) زينةٌ لا بيانات — يجوز أن تعلوه المجموعة */
      if (!p || p.closest("script, style, .seal-group, " + cfg.decorative)) continue;
      if (cs(p).visibility === "hidden") continue;
      rg.selectNodeContents(n);
      var rs = rg.getClientRects();
      for (var i = 0; i < rs.length; i++) {
        var r = rs[i];
        if (r.width > 0 && r.height > 0) out.push({ top: r.top - b.top, bottom: r.bottom - b.top, left: r.left - b.left, right: r.right - b.left, text: n.nodeValue.trim().slice(0, 40) });
      }
    }
    return out;
  }
  /* نصوصُ الورقة بإحداثيّاتها داخل الورقة — ورأسُ الجدول المتكرّر مشغولٌ أعلاها */
  function textsOn(pg, tx) {
    var out = [];
    for (var t = 0; t < tx.length; t++) {
      var x = tx[t];
      if (x.top < pg.top - 0.5 || x.top >= pg.end - 0.5) continue;
      out.push({ top: x.top - pg.top, bottom: x.bottom - pg.top, left: x.left, right: x.right, text: x.text });
    }
    if (pg.head) out.push({ top: 0, bottom: pg.head, left: -1e9, right: 1e9, text: "" });
    return out;
  }
  /* أوّلُ موضعٍ خالٍ للمجموعة في الورقة بترتيب التفضيل — أو null */
  /* الدليلُ لورقةٍ بلا موضع: أعرضُ فجوةٍ خاليةٍ من النصّ في شريط المجموعة أسفلَها،
     وأدنى موضعٍ خالٍ في الورقة كلّها، وأمثلةٌ ممّا يشغل أسفلها */
  function evidenceFor(mine, room) {
    var W = cfg.contentWidthMm * MM, gh = cfg.groupHmm * MM, c = cfg.clearMm * MM;
    var bottom = room - cfg.edgeMm * MM, top = bottom - gh, best = 0, run = 0, seen = {};
    for (var x = 0; x <= W; x += MM) {
      var busy = false;
      for (var t = 0; t < mine.length && !busy; t++) {
        var m = mine[t];
        if (m.bottom > top - c && m.top < bottom + c && m.right > x - c && m.left < x + MM + c) busy = true;
      }
      run = busy ? 0 : run + 1; if (run > best) best = run;
    }
    var keep = cfg.maxRaiseMm; cfg.maxRaiseMm = 1e4;
    var anywhere = spot(mine, room); cfg.maxRaiseMm = keep;
    var sample = [];
    for (var u = 0; u < mine.length && sample.length < 4; u++)
      if (mine[u].text && mine[u].bottom > top && !seen[mine[u].text]) { seen[mine[u].text] = 1; sample.push(mine[u].text); }
    return "widest text-free gap in the bottom " + cfg.groupHmm.toFixed(1) + "mm band = " + best + "mm (group needs " +
      cfg.groupWmm.toFixed(1) + "mm); lowest free spot on the page: " +
      (anywhere ? Math.round(anywhere.dy / MM) + "mm above the bottom" : "none") + "; bottom band holds: " + sample.join(" | ");
  }
  function spot(mine, room) {
    var W = cfg.contentWidthMm * MM, gw = cfg.groupWmm * MM, gh = cfg.groupHmm * MM, c = cfg.clearMm * MM, step = cfg.stepMm * MM;
    var xs = [];
    for (var x = 0; x < W - gw - 0.5; x += step) xs.push(x);
    xs.push(Math.max(0, W - gw));
    for (var dy = 0; dy <= cfg.maxRaiseMm * MM + 0.01; dy += step) {
      var bottom = room - cfg.edgeMm * MM - dy, top = bottom - gh;
      if (top < 0) break;
      for (var i = 0; i < xs.length; i++) {
        var l = xs[i], r = l + gw, free = true;
        for (var t = 0; t < mine.length && free; t++) {
          var m = mine[t];
          if (m.bottom > top - c && m.top < bottom + c && m.right > l - c && m.left < r + c) free = false;
        }
        if (free) return { x: l, y: top, dy: dy };
      }
    }
    return null;
  }
  /* أوّلُ ذرّةٍ نصُّها في أسفل الورقة (حيث يُطلب للمجموعة مكان) — لتُنقل إلى التالية */
  function lowest(pg, segs, mine, room) {
    var band = room - cfg.edgeMm * MM - (cfg.groupHmm + cfg.clearMm) * MM, first = null;
    for (var t = 0; t < mine.length; t++) if (mine[t].text && mine[t].bottom > band && (!first || mine[t].top < first.top)) first = mine[t];
    if (!first) return null;
    var list = segs[pg.seg].atoms, y = first.top + pg.top;
    for (var a = 0; a < list.length; a++) {
      var at = list[a];
      if (!at.tail && at.top <= y + 0.5 && at.bottom >= y + 0.5) return at.top - at.head > pg.top + 0.5 ? at : null;
    }
    return null;
  }
  /* ورقةٌ أخيرةٌ لا يقع فيها إلا التذييلُ الزخرفيّ (يقع في main نفسه بلا ختم: جدولٌ يملأ
     ورقته فيُدفع سطرُ التذييل وحده إلى التالية) — فلا تُضاف إليها مجموعةٌ ولا تُترك */
  function decorativeTail(segs, room) {
    var pages = pagesFrom(segs, room);
    if (pages.length < 2) return null;
    var last = pages[pages.length - 1], list = segs[last.seg].atoms, els = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.top < last.top - 0.5) continue;
      if (a.tail) continue;
      if (!(a.el.matches && a.el.matches(cfg.decorative))) return null;
      els.push(a.el);
    }
    return els.length ? { seg: last.seg, els: els } : null;
  }
  var moved = [];
  function move(el) {
    moved.push({ e: el, v: el.style.getPropertyValue("break-before") });
    el.style.setProperty("break-before", "page");
  }
  function unmove() {
    for (var i = moved.length - 1; i >= 0; i--) {
      if (moved[i].v) moved[i].e.style.setProperty("break-before", moved[i].v); else moved[i].e.style.removeProperty("break-before");
    }
    moved = [];
  }
  /* تضييقُ صفوف الأقسام الزائدة: حشوٌ عموديّ × padF، وخطٌّ × fontF (لا دون cfg.minPt) */
  function fitCells(fontF, padF, bad) {
    var minPx = cfg.minPt * 96 / 72;
    for (var k = 0; k < cells.length; k++) {
      var c = cells[k];
      if (c.style === null) c.e.removeAttribute("style"); else c.e.setAttribute("style", c.style);
      if ((fontF >= 1 && padF >= 1) || !bad[c.seg]) continue;
      var fs = fontF < 1 ? Math.max(minPx, Math.min(c.fs, c.fs * fontF)) : c.fs, rr = fs / c.fs;
      if (fs < c.fs) c.e.style.fontSize = fs + "px";
      c.e.style.paddingTop = (c.pt * rr * padF) + "px";
      c.e.style.paddingBottom = (c.pb * rr * padF) + "px";
    }
  }
  /* موضعٌ لكلّ ورقة، بنقل صفوفٍ حيث لا موضع؛ ويُعيد الأوراقَ ومواضعَها وما بقي بلا موضع */
  function resolve(room) {
    for (var guard = 0; guard < 400; guard++) {
      var segs = layout(), pages = pagesFrom(segs, room), tx = texts(), missing = [];
      for (var p = 0; p < pages.length; p++) {
        var mine = textsOn(pages[p], tx);
        pages[p].spot = spot(mine, room);
        if (!pages[p].spot) missing.push({ page: p, mine: mine });
      }
      if (!missing.length) return { pages: pages, stuck: [] };
      var at = lowest(pages[missing[0].page], segs, missing[0].mine, room);
      if (!at) return { pages: pages, stuck: missing };
      move(at.el);
    }
    return { pages: [], stuck: [{ page: -1 }] };
  }
  /* المجموعةُ في ورقتها: مرساةٌ في أوّل صفٍّ منها، والمجموعةُ على الإزاحة المختارة */
  function draw(pg) {
    var el = pg.first.el, host = el.tagName === "TR" && el.cells.length ? el.cells[0] : el;
    var anchor = doc.createElement("div");
    anchor.className = "seal-anchor";
    anchor.style.cssText = "position:absolute;width:0;height:0;margin:0;padding:0;border:0";
    host.insertBefore(anchor, host.firstChild);
    var b = body.getBoundingClientRect(), r = anchor.getBoundingClientRect();
    var t = doc.createElement("template");
    t.innerHTML = cfg.groupHTML;
    var g = t.content.firstChild;
    g.style.left = (pg.spot.x - (r.left - b.left)) + "px";
    g.style.top = (pg.top + pg.spot.y - (r.top - b.top)) + "px";
    anchor.appendChild(g);
  }
  /* ⚠️ عرفة بخمسين: الخطّةُ ضغطت الصفوفَ حتى وسع التذييلُ الورقةَ الأولى بأقلَّ من مليمتر،
     فطُبعت عند المستخدم ورقتين — الثانيةُ ذيلُ التذييل والمجموعة. فالمحاكاةُ (عددُ الأوراق بلا ختم)
     بارتفاع الورقة كلّه، والتخطيطُ — المواضعُ والنقلُ والتضييقُ والتذييل — بارتفاعٍ ينقص هامشَ
     الأمان، فيبقى أسفلَ كلّ ورقةٍ فسحةٌ تحتمل فرقَ الطباعة. */
  function plan() {
    var w = body.style.width;
    body.style.width = cfg.contentWidthMm + "mm";
    var full = cfg.contentHeightMm * MM, room = full - cfg.safetyMm * MM, segs = layout(), base = [], total0 = 0;
    for (var i = 0; i < segs.length; i++) { base.push(pagesOf(segs[i], full)); total0 += base[i]; }
    collect(segs);
    /* الدليل: الأوراقُ التي لا موضعَ فيها قبل نقل أيّ صفّ */
    var pages0 = pagesFrom(segs, room), tx0 = texts(), proof = [], crowded = {};
    for (var e = 0; e < pages0.length; e++) {
      var mine0 = textsOn(pages0[e], tx0);
      if (!spot(mine0, room)) { proof.push("page " + (e + 1) + ": " + evidenceFor(mine0, room)); crowded[pages0[e].seg] = true; }
    }
    /* التذييلُ وحده في الورقة الأخيرة: الهدفُ ورقةٌ أقلّ، وقسمُه يُضيَّق كغيره */
    var tailFull = decorativeTail(segs, full), tail = tailFull || decorativeTail(segs, room), target = tailFull ? total0 - 1 : total0, tailHow = "absorbed";
    if (tail) crowded[tail.seg] = true;
    var r = resolve(room), f = 1, pad = 1;
    if (r.pages.length > target || r.stuck.length) {
      /* الأقسامُ التي لا موضعَ للمجموعة في إحدى أوراقها (بالقياس قبل أيّ نقل) وحدها تُضيَّق —
         وأرقامُها أرقامُ الأقسام الأصليّة: النقلُ يزيد الأقسامَ فلا يُقاس بعده */
      var bad = crowded;
      /* أوّلاً حشوُ الصفوف العموديّ وحده (حتى ٤٠٪) والخطُّ كما هو — ثمّ الخطُّ ≥ ٨٥٪ ولا دون ٩pt */
      var ok = false, steps = [];
      for (var pf = 0.9; pf >= cfg.minPad - 1e-9; pf -= 0.1) steps.push([1, pf]);
      for (var ff = 0.97; ff >= cfg.minScale - 1e-9; ff -= 0.03) steps.push([ff, cfg.minPad]);
      /* وإن لم يحفظ شيءٌ عددَ الأوراق (متعدّدة الأوراق وحدها): أقلُّ الخطوات أوراقاً، وأخفُّها عند التساوي —
         فلا تُضاف ورقةٌ لا حاجة إليها */
      var best = { n: r.stuck.length ? Infinity : r.pages.length, s: -1 };
      for (var s = 0; s < steps.length; s++) {
        unmove(); fitCells(steps[s][0], steps[s][1], bad);
        r = resolve(room);
        if (r.pages.length <= target && !r.stuck.length) { ok = true; f = steps[s][0]; pad = steps[s][1]; break; }
        if (!r.stuck.length && r.pages.length < best.n) best = { n: r.pages.length, s: s };
      }
      if (!ok) {
        unmove();
        if (best.s >= 0) { f = steps[best.s][0]; pad = steps[best.s][1]; } else { f = 1; pad = 1; }
        fitCells(f, pad, bad); r = resolve(room);
      }
    }
    /* وإن بقي التذييلُ وحدَه في ورقةٍ أخيرة: تُضيَّق حواشيه، فإن لم يسعه ذلك حُمل معه آخرُ صفّ —
       ولا يُخفى (كان يُحذف سطرُه) */
    var lastTail = decorativeTail(layout(), room);
    if (lastTail) {
      compactFooter(lastTail.els); tailHow = "compact";
      var ft = decorativeTail(layout(), room) && footerAlone(room);
      if (ft && ft.before && !ft.before.tail) { move(ft.before.el); tailHow = "carried"; }
      r = resolve(room);
    }
    /* الأوراقُ كما خُطِّطت: فاصلٌ صريحٌ قبل أوّل صفٍّ في كلّ ورقةٍ تبدأ داخل قسم — فلا يضع المتصفّحُ
       في هامش الأمان صفّاً من الورقة التالية فتنزاح مجموعتُها عن ورقتها */
    for (var q = 1; q < r.pages.length; q++) {
      var a0 = r.pages[q].first;
      if (r.pages[q].seg === r.pages[q - 1].seg && a0 && !a0.tail && a0.el && !isBreak(a0.el, "before")) move(a0.el);
    }
    var placed = [];
    for (var p = 0; p < r.pages.length; p++) {
      var pg = r.pages[p];
      if (!pg.spot) { placed.push(null); continue; }
      draw(pg);
      placed.push({ x: Math.round(pg.spot.x / MM * 10) / 10, raise: Math.round(pg.spot.dy / MM * 10) / 10 });
    }
    body.style.width = w;
    var extra = r.pages.length - total0, exception = extra > 0 || r.stuck.length > 0;
    root.setAttribute("data-seal-sim", String(total0));
    root.setAttribute("data-seal-placements", JSON.stringify(placed));
    if (exception) root.setAttribute("data-seal-evidence",
      (r.stuck.length ? "no free position on page(s) " + r.stuck.map(function (m) { return m.page + 1; }).join(", ") + "; " : "") +
      (extra > 0 ? "rows moved to free a position need " + extra + " more page(s) even with table text at " + Math.round(cfg.minScale * 100) + "%; " : "") +
      proof.join(" || "));
    var adaptive = placed.filter(function (x) { return x && (x.x > 0 || x.raise > 0); }).length;
    root.setAttribute("data-seal-plan", "group" + (adaptive ? ":adaptive" + adaptive : "") + (moved.length ? ":moved" + moved.length : "") +
      (pad < 1 ? ":rows" + pad.toFixed(1) : "") + (tail ? ":footer-page-" + tailHow : "") + (f < 1 ? ":text" + f.toFixed(2) : "") + (exception ? ":exception" + (extra > 0 ? "+" + extra + "page" : "") + (r.stuck.length ? ":noplace" + r.stuck.length : "") : ""));
  }
  function go() {
    try { plan(); }
    catch (err) { root.setAttribute("data-seal-plan", "group:error"); }
  }
  var ready = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
  ready.then(function () { if (doc.readyState === "complete") go(); else addEventListener("load", go); }, go);
}`;

/* ═══ بلا ختم: التذييلُ لا يخرج وحده إلى ورقة ═══
   (عرفة بخمسين: يملأ الجدولُ الورقةَ فيُدفع سطرُ التذييل وحده إلى ثانية.) يُقاس المستندُ كما
   يُطبع (هامشُ أمانٍ لفرق الطباعة)، فإن وقع التذييلُ وحده في الورقة الأخيرة: تُضيَّق حواشيه،
   ثمّ حشوُ صفوف القسم الأخير (الخطُّ كما هو، حتى ٤٠٪)، ثمّ يُحمل معه آخرُ صفّ. ولا شيءَ يتغيّر
   حين يسعه مكانُه. ويُعلن القرار بـ`data-seal-plan` فتنتظره الطباعة. */
export function footerFitHTML(page: { landscape?: boolean; margin: string }): string {
  const m = marginsOf(page.margin);
  const dim = PAGE_MM.A4[page.landscape ? "landscape" : "portrait"];
  const cfg = { contentWidthMm: round(dim.w - 2 * m.side), contentHeightMm: round(dim.h - m.top - m.bottom),
                safetyMm: GROUP_SAFETY_MM, decorative: SEAL_DECORATIVE, minPad: GROUP_MIN_ROW_PAD };
  return `<script data-footer-fit>(${FOOTER_FIT_RUNTIME})(${JSON.stringify(cfg)});</script>`;
}
const FOOTER_FIT_RUNTIME = `function (cfg) {
${SIM_RUNTIME}${FOOTER_TAIL_RUNTIME}  function plan() {
    var w = body.style.width, how = "ok";
    body.style.width = cfg.contentWidthMm + "mm";
    var room = (cfg.contentHeightMm - cfg.safetyMm) * MM, t = footerAlone(room);
    if (t) {
      compactFooter(t.els); how = "compact";
      if (footerAlone(room)) {
        var segs = layout(), from = segs[segs.length - 1].start, top = body.getBoundingClientRect().top, cells = [];
        var list = body.querySelectorAll("td, th");
        for (var i = 0; i < list.length; i++) {
          if (list[i].getBoundingClientRect().top - top < from - 0.5) continue;
          var c = cs(list[i]);
          cells.push({ e: list[i], pt: parseFloat(c.paddingTop), pb: parseFloat(c.paddingBottom), style: list[i].getAttribute("style") });
        }
        var pad = function (f) { cells.forEach(function (c) {
          if (c.style === null) c.e.removeAttribute("style"); else c.e.setAttribute("style", c.style);
          if (f < 1) { c.e.style.paddingTop = (c.pt * f) + "px"; c.e.style.paddingBottom = (c.pb * f) + "px"; } }); };
        how = null;
        for (var pf = 0.9; pf >= cfg.minPad - 1e-9; pf -= 0.1) { pad(pf); if (!footerAlone(room)) { how = "rows" + pf.toFixed(1); break; } }
        if (!how) {
          pad(1);
          var t2 = footerAlone(room);
          if (t2 && t2.before && !t2.before.tail) { t2.before.el.style.setProperty("break-before", "page"); how = "carried"; } else how = "none";
        }
      }
    }
    body.style.width = w;
    root.setAttribute("data-seal-plan", "footer:" + how);
  }
  function go() { try { plan(); } catch (e) { root.setAttribute("data-seal-plan", "footer:error"); } }
  var ready = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
  ready.then(function () { if (doc.readyState === "complete") go(); else addEventListener("load", go); }, go);
}`;

/* ═══ الفندق — الورقةُ الذرّيّة ═══
   هامشُ `@page` صفر فلا شريط، والشبكةُ تملأ الورقة، والصورتان صفٌّ داخلها.
   فيُقرَّر بعد ضبط الأسماء (`data-fit-done`)، دوراً دوراً (الدورُ حدُّ أوراقٍ
   لا تختلط غرفُه بغيره)، بقياسٍ في المستند نفسه:
     ١) المجموعةُ أسفلَ يسار الورقة؛ والشبكةُ ترتفع بقدر ما يلزم كي لا يقع تحتها
        كرت (خلايا فارغةٌ أو التذييلُ الزخرفيّ تحتها مقبول)، إن لم يُقصّ من أيّ كرتٍ
        أكثرُ ممّا يُقصّ منه بلا ختم.
     ٣) وإلا غرفُ الدور بصفٍّ أقلّ في كلّ ورقة — إن لم تزد أوراقُ الدور.
     ٤) وإلا نُقل صفُّ الغرف الأخير من الورقة إلى ورقةٍ تليها — استثناءٌ مُعلَن
        (`extra+`) — ثمّ يُعاد ترقيمُ الأوراق.
   والمجموعةُ بمقاسها الثابت (`sealGroupHTML`) لا تُصغَّر. */
/** بُعدُ أسفل المجموعة عن حافّة ورقة الفندق — داخل حشوها السفليّ (١٢مم)، فوق هامش الطابعة. */
const HOTEL_FLOOR_MM = 8;
export function hotelSealPlanHTML(s: PrintSeals | null | undefined, grid: { cols: number; rows: number }): string {
  if (!hasSeals(s)) return "";
  /* المجموعةُ بمقاسها الثابت (لا تصغير) — المعتمَد لتقارير A4 */
  const z = sealGroupSize(s);
  const cfg = { cols: grid.cols, rows: grid.rows, sealWidthMm: z.w, sealHeightMm: z.h, gapMm: SEAL_GAP_MM, clearMm: GROUP_CLEAR_MM, floorMm: HOTEL_FLOOR_MM,
                blockHTML: sealGroupHTML(s, "print-seals-overlay", ""), sizes: [1] };
  return `<script>(${HOTEL_SEAL_RUNTIME})(${JSON.stringify(cfg)});</script>`;
}

const HOTEL_SEAL_RUNTIME = `function (cfg) {
  var MM = 96 / 25.4, doc = document, root = doc.documentElement;
  function gridOf(sheet) { return sheet.querySelector(".hotel-page"); }
  function cellsOf(sheet) { return Array.prototype.slice.call(gridOf(sheet).children); }
  function isEmpty(c) { return c.classList.contains("hotel-empty"); }
  function rowOf(sheet) { return sheet.querySelector(".print-seals"); }
  /* ── مقاسُ الصورتين k ── */
  function sizeRow(el, k) {
    var imgs = el.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (!im.dataset.w) { im.dataset.w = parseFloat(im.style.width); im.dataset.h = parseFloat(im.style.height); }
      im.style.width = (im.dataset.w * k) + "mm"; im.style.height = (im.dataset.h * k) + "mm";
    }
    if (!el.dataset.h) { el.dataset.h = parseFloat(el.style.height); el.dataset.gap = parseFloat(el.style.gap); }
    el.style.height = (el.dataset.h * k) + "mm"; el.style.gap = (el.dataset.gap * k) + "mm";
  }
  /* ── القصُّ: ما يزيد من الكرت على ارتفاعه ── */
  var base = new Map();
  function excess(c) { return Math.max(0, c.scrollHeight - c.clientHeight); }
  function clippedMore(sheet) {
    var cs = cellsOf(sheet);
    for (var i = 0; i < cs.length; i++) if (!isEmpty(cs[i]) && excess(cs[i]) > (base.get(cs[i]) || 0) + 1) return true;
    return false;
  }
  function clearOverlay(sheet) { var o = sheet.querySelector(".print-seals-overlay"); if (o) o.remove(); }
  /* ═══ المجموعةُ أسفلَ يسار الورقة الفعليّة ═══
     ⚠️ كانت المجموعةُ إمّا في خلايا فارغةٍ تسعها كاملةً، وإمّا صفّاً **فوق** رقم الورقة
     والتذييل — فتأخذ من الكروت ٤٥مم كاملةً، وورقةٌ ممتلئةٌ تنقسم ورقتين. وما تحت
     الشبكة (حشوُ الورقة السفليّ وسطرُ التذييل الزخرفيّ) فراغٌ يسعها جزئيّاً.
     فصارت تُرسم في أسفل يسار الورقة نفسها (حشوُها الأيسر، و\`floorMm\` فوق حافّتها)،
     ويبقى الصفُّ فاصلاً خفيّاً يطول بقدر ما يلزم وحده كي لا يقع تحتها كرتٌ —
     فإن كانت تحتها خلايا فارغةٌ لم يطل شيئاً. ورقمُ الورقة إن غطّته انتقل يميناً. */
  function stampOf(sheet) { return sheet.querySelector(".page-stamp"); }
  function rect(e, pad) { var r = e.getBoundingClientRect(); return { l: r.left - pad, r: r.right + pad, t: r.top - pad, b: r.bottom + pad }; }
  function meets(a, b) { return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b; }
  function cardsUnder(sheet, g) {
    var cs = cellsOf(sheet);
    for (var i = 0; i < cs.length; i++) if (!isEmpty(cs[i]) && meets(rect(cs[i], -0.5), g)) return true;
    return false;
  }
  function textUnder(el, g) {
    if (!el) return false;
    var rg = doc.createRange(); rg.selectNodeContents(el);
    var rs = rg.getClientRects();
    for (var i = 0; i < rs.length; i++) if (rs[i].width > 0 && meets({ l: rs[i].left, r: rs[i].right, t: rs[i].top, b: rs[i].bottom }, g)) return true;
    return false;
  }
  function drawFloor(sheet, k) {
    var holder = doc.createElement("div");
    holder.innerHTML = cfg.blockHTML;
    var ov = holder.firstChild;
    sizeRow(ov, k);
    sheet.style.position = "relative";
    ov.style.position = "absolute";
    ov.style.left = getComputedStyle(sheet).paddingLeft;
    ov.style.bottom = cfg.floorMm + "mm";
    sheet.appendChild(ov);
    return ov;
  }
  /* ورقةٌ بالمقاس k: المجموعةُ أسفلَ اليسار، والشبكةُ ترتفع بقدر ما يلزم ولا يُقصّ كرت */
  /* الكروتُ تُعاد ملاءمتُها لكلّ تغييرٍ في ارتفاعها (ضبطُ الطباعة: \`__hotelFitCard\`)
     — نسبةً إلى مقاسها بلا ختم، فلا يصغر اسمٌ بسبب الختم إلا ١٥٪ على الأكثر */
  function refit(sheet, minPx, fmin) {
    if (typeof window.__hotelFitCard !== "function") return;
    cellsOf(sheet).forEach(function (c) { if (!isEmpty(c) && c.classList.contains("hotel-card")) window.__hotelFitCard(c, minPx, fmin); });
  }
  /* shrink: هل يُسمح بتصغير خطّ الكروت (حتى ٨٥٪ من مقاسه بلا ختم) ليسع الختم؟ */
  /* ═══ تضييقُ الكروت — حين لا يسع الختمَ غيرُه وحدَه ═══
     الترتيبُ المعتمَد هو الأصل. فإن لم تسع الورقةُ المجموعةَ (خمسَ عشرة غرفةً عرضيّاً
     ممتلئة) ضُيِّق ما في الكروت من فراغٍ بدرجات، أقلُّها أوّلاً: فجواتُ الشبكة وحشوُ صفوف
     الأسماء، ثمّ حشوُ رأس الكرت، ثمّ حشوُ الورقة العلويّ وهوامشُ شريط العنوان.
     خطُّ الأسماء لا يُمسّ في هذه الدرجات، والكرتُ لا يُقصّ منه شيء (\`clippedMore\`). */
  var LEVELS = ["",
    ".seal-tight-1 .hotel-page { gap: 3px !important; } .seal-tight-1 .hotel-card td { padding-top: 1px !important; padding-bottom: 1px !important; }",
    ".seal-tight-2 .hotel-card > div:first-child { padding-top: 2px !important; padding-bottom: 2px !important; }",
    ".hotel-print-page.seal-tight-3 { padding-top: 9mm !important; } .seal-tight-3 .doc-title-bar { margin-top: 1mm !important; margin-bottom: 1.5mm !important; }"];
  function tight(sheet, level) {
    if (level && !doc.getElementById("seal-tight-css")) {
      var st = doc.createElement("style"); st.id = "seal-tight-css";
      st.textContent = LEVELS.join(" ");
      doc.head.appendChild(st);
    }
    for (var l = 1; l < LEVELS.length; l++) sheet.classList.toggle("seal-tight-" + l, l <= level);
  }
  function place(sheet, k, shrink, level) {
    clearOverlay(sheet);
    tight(sheet, level || 0);
    var row = rowOf(sheet), stamp = stampOf(sheet), fmin = shrink ? 0.85 : 1;
    if (stamp) stamp.style.textAlign = "";
    if (!row) return false;
    row.style.display = "block"; row.style.visibility = "hidden"; row.style.marginTop = "0px"; row.style.height = "0px";
    refit(sheet, 7, 1);
    var ov = drawFloor(sheet, k), clear = cfg.clearMm * MM, step = MM / 2, limit = (cfg.sealHeightMm * k + cfg.gapMm) * MM + 1;
    for (var h = 0; h <= limit; h += step) {
      row.style.height = h + "px";
      refit(sheet, 7, fmin);
      if (!cardsUnder(sheet, rect(ov, clear))) break;
    }
    if (cardsUnder(sheet, rect(ov, clear))) return false;
    if (stamp && textUnder(stamp, rect(ov, clear))) stamp.style.textAlign = "right";
    return !clippedMore(sheet) && !textUnder(stamp, rect(ov, clear));
  }
  /* ── إعادةُ رصّ غرف الدور بصفّ أقلّ في كلّ ورقة ── */
  function snapshot(sheets) {
    return sheets.map(function (sh) { var g = gridOf(sh); return { g: g, kids: Array.prototype.slice.call(g.children), rows: g.style.gridTemplateRows }; });
  }
  function restore(snap) {
    snap.forEach(function (s) { s.g.innerHTML = ""; s.kids.forEach(function (k) { s.g.appendChild(k); }); s.g.style.gridTemplateRows = s.rows; });
  }
  function repack(sheets, rows) {
    var cards = [], tpl = null;
    sheets.forEach(function (sh) { cellsOf(sh).forEach(function (c) { if (isEmpty(c)) tpl = tpl || c; else cards.push(c); }); });
    var per = cfg.cols * rows, need = Math.ceil(cards.length / per);
    if (need > sheets.length || !tpl) return false;
    sheets.forEach(function (sh, j) {
      var g = gridOf(sh);
      g.innerHTML = "";
      if (j >= need) return;
      cards.slice(j * per, (j + 1) * per).forEach(function (c) { g.appendChild(c); });
      while (g.children.length < per) g.appendChild(tpl.cloneNode(false));
      g.style.gridTemplateRows = "repeat(" + rows + ", 1fr)";
    });
    return true;
  }
  function split(sheet) {
    var grid = gridOf(sheet), cs = cellsOf(sheet), rows = Math.round(cs.length / cfg.cols);
    var lastUsed = -1;
    for (var i = 0; i < cs.length; i++) if (!isEmpty(cs[i])) lastUsed = i;
    var used = Math.floor(lastUsed / cfg.cols) + 1;
    if (used <= 1) return null;
    var tpl = cs.filter(isEmpty)[0] || doc.createElement("div");
    var moving = cs.slice((used - 1) * cfg.cols, used * cfg.cols).filter(function (c) { return !isEmpty(c); });
    var ns = sheet.cloneNode(true), ng = gridOf(ns);
    ng.innerHTML = "";
    moving.forEach(function (c) { ng.appendChild(c); });
    while (ng.children.length < rows * cfg.cols) { var e = tpl.cloneNode(false); e.className = "hotel-empty"; e.setAttribute("style", "background:transparent"); ng.appendChild(e); }
    var strip = ns.querySelector(".hs-strip"); if (strip) strip.remove();
    clearOverlay(ns);
    var keep = (used - 1) * cfg.cols, now = cellsOf(sheet);
    for (var k = now.length - 1; k >= keep; k--) now[k].remove();
    grid.style.gridTemplateRows = "repeat(" + (used - 1) + ", 1fr)";
    sheet.parentNode.insertBefore(ns, sheet.nextSibling);
    return ns;
  }
  function renumber() {
    var st = doc.querySelectorAll(".hotel-print-page .page-stamp"), n = st.length;
    for (var i = 0; i < n; i++) st[i].textContent = "صفحة " + (i + 1) + " من " + n;
  }
  function group(sheets) {
    /* لكلّ مقاس: الترتيبُ المعتمَد، ثمّ درجاتُ التضييق بخطّ الكروت كما هو، ثمّ (الملاذ القديم)
       تصغيرُه قليلاً — وفي كلٍّ: الشبكةُ ثمّ صفٌّ أقلّ */
    var PASSES = [[false, 0], [false, 1], [false, 2], [false, 3], [true, 3]];
    for (var si = 0; si < cfg.sizes.length; si++) for (var pass = 0; pass < PASSES.length; pass++) {
      var k = cfg.sizes[si], shrink = PASSES[pass][0], level = PASSES[pass][1], tag = (level ? ":tight" + level : "") + (shrink ? ":text" : "");
      if (sheets.every(function (sh) { return place(sh, k, shrink, level); })) return { k: k, how: "grid" + tag };
      if (cfg.rows > 1) {
        var snap = snapshot(sheets);
        if (repack(sheets, cfg.rows - 1)) {
          var live = sheets.filter(function (sh) { return gridOf(sh).children.length; });
          if (live.every(function (sh) { return place(sh, k, shrink, level); })) {
            sheets.forEach(function (sh) { if (!gridOf(sh).children.length) sh.remove(); });
            return { k: k, how: "rows" + tag };
          }
        }
        restore(snap);
      }
    }
    /* لا مفرّ: المقاسُ الواقعيّ، ونقلُ صفّ الغرف الأخير حيث يُقصّ كرت */
    var added = 0;
    for (var i = 0; i < sheets.length; i++) {
      var sh = sheets[i];
      if (place(sh, 1, true, 3)) continue;
      for (var g = 0; g < cfg.rows && !place(sh, 1, true, 3); g++) { var ns = split(sh); if (!ns) break; sheets.splice(i + 1, 0, ns); added++; }
    }
    return { k: 1, how: "split", added: added };
  }
  function plan() {
    var all = Array.prototype.slice.call(doc.querySelectorAll(".hotel-print-page")), before = all.length;
    /* المرجع: القصُّ في الشبكة الأصليّة بلا صفّ الصورتين */
    all.forEach(function (sh) { var r = rowOf(sh); if (r) r.style.display = "none"; });
    all.forEach(function (sh) { cellsOf(sh).forEach(function (c) { if (!isEmpty(c)) base.set(c, excess(c)); }); });
    var groups = [], cur = null;
    all.forEach(function (sh) {
      var f = sh.getAttribute("data-floor") || "";
      if (!cur || cur.floor !== f) { cur = { floor: f, sheets: [] }; groups.push(cur); }
      cur.sheets.push(sh);
    });
    var tags = [];
    groups.forEach(function (gr) { var r = group(gr.sheets); tags.push(r.how + (r.k < 1 ? "@" + r.k.toFixed(2) : "") + (r.added ? "+" + r.added : "")); });
    /* الأخيرة: كلُّ كرتٍ بحدّه الأدنى العامّ — فلا يبقى صفٌّ مقصوص */
    Array.prototype.slice.call(doc.querySelectorAll(".hotel-print-page")).forEach(function (sh) {
      cellsOf(sh).forEach(function (c) { if (!isEmpty(c) && c.scrollHeight > c.clientHeight + 1 && window.__hotelFitCard) window.__hotelFitCard(c, 7, 0.3); });
    });
    renumber();
    var after = doc.querySelectorAll(".hotel-print-page").length;
    root.setAttribute("data-seal-sim", String(before));
    root.setAttribute("data-seal-plan", "hotel:" + tags.join(",") + (after > before ? ":extra+" + (after - before) : ""));
  }
  function go() { try { plan(); } catch (e) { root.setAttribute("data-seal-plan", "hotel:error"); } }
  var waited = 0, t = setInterval(function () {
    if (root.getAttribute("data-fit-done") === "1" || (waited += 50) > 6000) { clearInterval(t); go(); }
  }, 50);
}`;
