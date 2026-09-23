// ============================================================
// إخراجُ الطباعة — نسخةٌ واحدة لا نسختان
// ============================================================
/* كانت `printInPage` مكتوبةً مرّتين: في `utils/index.ts` بمهلة ١٠٠٠مللي
   وفي `finance.print.ts` بمهلة ٦٠٠ — اختلافٌ بلا سببٍ منتجيّ. صارت
   واحدةً بالمهلة الأطول، فتحتمل تحميلَ الخطّ قبل نداء الطباعة.

   ⚠️ والمهلةُ الثابتة لا تكفي صفحةً مبنيّةً على صور: مستنداتُ الحاجّ
   تُجلب من التخزين برابطٍ موقَّع، فقد لا تصل في ثانية. ومن طبع قبل
   وصولها طبع إطاراتٍ فارغة. فصار `waitForImages` ينتظر **الصورَ
   نفسها** لا الساعةَ — وبسقفٍ زمنيّ فلا يُعلَّق الأمرُ إلى الأبد. */

/** أقصى انتظارٍ للصور قبل الطباعة على أي حال (ملّي ثانية). */
const IMAGE_WAIT_CAP_MS = 15_000;
/** مهلةُ الخطوط والتخطيط للصفحات النصّيّة. */
const LAYOUT_SETTLE_MS = 1_000;

export type PrintOptions = {
  /** انتظرِ اكتمالَ تحميل الصور قبل الطباعة — لصفحات المستندات. */
  waitForImages?: boolean;
  /** تجاوزٌ صريح لاتّجاه الورقة؛ والافتراضُ أن يُقرأ من `@page` في المستند. */
  landscape?: boolean;
};

/** ينتظر كلَّ صورةٍ حتى تكتمل أو تفشل، بسقفٍ زمنيّ لا يُتجاوز. */
function imagesSettled(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images);
  if (imgs.length === 0) return Promise.resolve();
  const each = imgs.map(img => img.complete
    ? Promise.resolve()
    : new Promise<void>(resolve => {
        /* الفشلُ كالنجاح هنا: صورةٌ لا تصل لا تمنع طباعةَ البقيّة */
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      }));
  return Promise.race([
    Promise.all(each).then(() => undefined),
    new Promise<void>(resolve => setTimeout(resolve, IMAGE_WAIT_CAP_MS)),
  ]);
}

/* ⚠️ عطبٌ أظهرته الـPDF الحقيقيّة: الإطارُ كان بمقاس A4 **طوليّ دائماً**
   (٢١٠مم عرضاً)، فمستندُ العرض يُخطَّط على ٢١٠مم ثم يُطبَع على ورقةٍ
   عرضُها ٢٩٧مم — فيقع المحتوى في نحو سبعين بالمئة من الورقة ويبدو
   كأنّه دُوِّر. وقياساً: أعمدةُ شبكة الفندق ١٥١بك بدل ٢١٧بك، أي أضيق
   حتى من الطباعة الطوليّة — فيضيع فضلُ العرض كلُّه.

   والاتّجاهُ يُقرأ من المستند نفسه لا من وسيطٍ يمرّره كلُّ منادٍ:
   قاعدةُ `@page` مكتوبةٌ في الـHTML، فهي الحَكَم. فلا يسهو نداءٌ عن
   تمريره، ولا يفترق ما يُخطَّط عمّا يُطبَع. */
const LANDSCAPE_PAGE = /@page[^}]*size:\s*A4\s+landscape/i;

export function printInPage(html: string, options: PrintOptions = {}) {
  const existing = document.getElementById("__print_frame__");
  if (existing) existing.remove();
  const landscape = options.landscape ?? LANDSCAPE_PAGE.test(html);
  const [w, h] = landscape ? ["297mm", "210mm"] : ["210mm", "297mm"];
  const iframe = document.createElement("iframe");
  iframe.id = "__print_frame__";
  iframe.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${w};height:${h};border:none;`;
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open(); doc.write(html); doc.close();

  const fire = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); };
  if (options.waitForImages) {
    void imagesSettled(doc).then(() => setTimeout(fire, 120));
    return;
  }
  setTimeout(fire, LAYOUT_SETTLE_MS);
}

export function downloadPDF(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
