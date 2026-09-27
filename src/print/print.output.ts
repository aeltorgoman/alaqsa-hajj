// ============================================================
// إخراجُ الطباعة — نسخةٌ واحدة لا نسختان
// ============================================================
/* كانت `printInPage` مكتوبةً مرّتين: في `utils/index.ts` بمهلة ١٠٠٠مللي
   وفي `finance.print.ts` بمهلة ٦٠٠ — اختلافٌ بلا سببٍ منتجيّ. صارت
   واحدةً بالمهلة الأطول، فتحتمل تحميلَ الخطّ قبل نداء الطباعة.

   ⚠️ والمهلةُ الثابتة لا تكفي صفحةً مبنيّةً على صور: مستنداتُ الحاجّ
   تُجلب من التخزين برابطٍ موقَّع، فقد لا تصل في ثانية. ومن طبع قبل
   وصولها طبع إطاراتٍ فارغة. فصارت الطباعةُ تنتظر **الصورَ نفسها** لا
   الساعةَ — لكلِّ منادٍ لا لمن طلب ذلك وحدَه — وبسقفٍ زمنيّ فلا يُعلَّق
   الأمرُ إلى الأبد. و`waitForImages` تبقى لمن يريد ألّا ينتظر مهلةَ
   التخطيطِ فوق ذلك (صفحاتُ المستندات). */

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

/** ينتظر كلَّ صورةٍ حتى **تُحمَّلَ وتُفَكَّ** أو تفشل، بسقفٍ زمنيّ لا يُتجاوز.

    ⚠️ و«اكتمالُ التحميلِ» وحدَه لا يكفي: `complete` يعني وصولَ البايتات،
    لا أنّ الصورةَ فُكَّت وصارت جاهزةً للرسم. وختمٌ بأبعادِ ١٥٠٣×١٦٠٠ يأخذ
    فكُّه وقتاً على الهاتف — ومن طبع في تلك الفجوةِ طبع إطاراً فارغاً.
    فتُطلَب `decode()` صراحةً لكلِّ صورةٍ وصلت، وهي وعدٌ يُحَلّ حين تصير
    الصورةُ قابلةً للرسمِ فعلاً. والفشلُ هنا كالنجاح: صورةٌ لا تصل
    لا تمنع طباعةَ البقيّة. */
function imagesSettled(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images);
  if (imgs.length === 0) return Promise.resolve();
  const settle = (img: HTMLImageElement) => new Promise<void>(resolve => {
    const decoded = () => {
      /* صورةٌ فشلت (`naturalWidth === 0`) لا تُفَكّ — تُعَدّ مستقرّة */
      if (img.naturalWidth > 0 && typeof img.decode === "function") {
        img.decode().then(() => resolve(), () => resolve());
      } else {
        resolve();
      }
    };
    if (img.complete) { decoded(); return; }
    img.addEventListener("load", decoded, { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
  return Promise.race([
    Promise.all(imgs.map(settle)).then(() => undefined),
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
  /* ⚠️ عطبٌ أظهرته المعاينةُ الحقيقيّة للإيصال #1001: الختمُ والتوقيعُ
     صورتان برابطٍ موقَّعٍ (١٫١ و٠٫٣٥ ميغابايت)، والطباعةُ كانت تُنادى بعد
     مهلةٍ ثابتةٍ قدرُها ثانية — قبل وصولِهما. وعلى الهاتفِ يُلتقَط المستندُ
     لحظةَ النداء، فتخرج الورقةُ بإطارَين فارغَين والشعارُ الصغيرُ وحدَه ظاهر.

     والمهلةُ الثابتةُ لا تُصلَح بمهلةٍ أطول: الشبكةُ لا تعد بزمن. فصار
     الانتظارُ **لحالةٍ** لا لساعة: لا طباعةَ قبل أن تستقرّ صورُ المستند.

     والضمانُ لكلِّ منادٍ قائم: `Promise.all` هنا تعني **الأبطأَ من الاثنين**
       · صفحةٌ بلا صور        → تستقرّ فوراً → تُطبَع عند الثانيةِ كما اليوم
       · صورٌ تصل قبل الثانية → تُطبَع عند الثانيةِ كما اليوم
       · صورٌ أبطأ           → تُطبَع حين تستقرّ (إلى السقف) — وهذا وحدَه تغيّر
     فلا منادٍ يُطبَع **أبكرَ** ممّا كان، والذي يتأخّر هو من كان يُطبَع ناقصاً. */
  const layoutFloor = new Promise<void>(resolve => setTimeout(resolve, LAYOUT_SETTLE_MS));
  void Promise.all([layoutFloor, imagesSettled(doc)]).then(fire);
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
