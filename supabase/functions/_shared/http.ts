// ============================================================
// _shared/http — ترويسات وردود موحّدة لكل Edge Function
// ============================================================
// ملف واحد بدل نسخة في كل دالة، فلا تتفارق الترويسات ولا شكل
// رسالة الخطأ بين دالة وأخرى.
//
// ═══ س٩ — حصر CORS ═══
// كانت الترويسة `*`، أي أن أي صفحة على الشبكة تستطيع أن تطلب
// الدالة من متصفّح موظّف مسجَّل الدخول. وهي طبقة دفاع متواضعة
// (المتصفّح وحده يحترمها، وطلب curl يتجاهلها) لكنها تُغلق ما لا
// سبب لبقائه مفتوحاً.
//
// ═══ ⚠️ العيب الذي عالجه هذا الملفّ ═══
// كان السطر الحاسم:
//
//     ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
//
// فالأصلُ غيرُ المعروف كان يتلقّى **أصلاً آخر** — أصلَ الإنتاج —
// في `Access-Control-Allow-Origin`. وهذا خطأ مزدوج:
//
//   ١) **وظيفيّاً**: معاينةُ Vercel أصلُها
//      `alaqsa-hajj-<نشر>-aeltorgoman-s-projects.vercel.app`
//      ورقمُ النشر يتبدّل مع كل بناء، فلا تكون في قائمةٍ ثابتة
//      أبداً. فكانت تتلقّى أصلَ الإنتاج فيرفضها المتصفّح — وهو
//      ما عطّل «الإعدادات ← المستخدمون» في المعاينة بخطأٍ عامّ
//      «Failed to send a request to the Edge Function».
//
//   ٢) **مفهوميّاً**: الردُّ بأصلٍ لم يُطلَب ليس تضييقاً، بل جوابٌ
//      عن سؤالٍ لم يُسأل. والصوابُ ألّا تُرسَل الترويسة أصلاً:
//      غيابُها يعني «لا إذن»، وهو ما يفهمه المتصفّح ويلتزمه.
//
// ═══ ما الذي يُوثَق به الآن ═══
//   ١) قائمةٌ صريحةٌ من `ALLOWED_ORIGINS` (مفصولةٌ بفواصل) —
//      الإنتاجُ وأيُّ نطاقٍ مخصّصٍ يُضاف لاحقاً. قرارُ نشرٍ لا
//      تعديلُ شيفرة، وله قيمةٌ افتراضيةٌ تعمل بلا ضبط.
//   ٢) معايناتُ Vercel **لهذا المشروع وهذا الحساب وحدهما**،
//      بنمطٍ مُرسًى من طرفيه.
//
// ولا `*` بحال: هذه الدوالُّ تُنشئ المستخدمين وتمنح الصلاحيات
// وتُقفل المواسم. وما عدا الموثوق لا يتلقّى إذناً.
//
// ═══ لماذا نمطُ المعاينة آمن ═══
// عنوانُ معاينة Vercel بنيتُه `<مشروع>-<نشر>-<حساب>.vercel.app`،
// والمقطعُ الأخير قبل `.vercel.app` هو **اسمُ الحساب/الفريق**،
// وهو فريدٌ عالميّاً ولا يملكه غيرُ صاحبه. فإرساءُ النمط على
// `-aeltorgoman-s-projects.vercel.app` في آخره هو الحدُّ الأمنيّ:
// لا يستطيع حسابٌ آخر أن يُنتج مضيفاً ينتهي به.
//
// وقُصر مقطعُ النشر على `[a-z0-9]+` بلا شَرطة عمداً، كي لا يبتلع
// النمطُ شرطةً تُدخِل مقاطعَ إضافية. وصيغةُ الفرع `git-…` مستقلّةٌ
// لأنها وحدها تحتاج الشُّرَط.
//
// أمّا مشروعٌ آخرُ **داخل الحساب نفسه** فيُطابق عمداً: هو نفسُ
// نطاقِ الثقة، ولا يملكه إلا صاحبُ المشروع.

/** الأصولُ المسموح بها نصّاً — قرارُ نشر، وله افتراضٌ يعمل. */
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://alaqsa-hajj.vercel.app")
  .split(",").map((o) => o.trim()).filter(Boolean);

/* مشروعُ Vercel وحسابُه — يُضبطان بسرٍّ عند تغيّرهما، ولهما
   افتراضٌ يطابق النشر الحاليّ فلا يحتاج ضبطاً اليوم. */
const VERCEL_PROJECT = (Deno.env.get("VERCEL_PROJECT_SLUG") ?? "alaqsa-hajj").trim();
const VERCEL_OWNER = (Deno.env.get("VERCEL_OWNER_SLUG") ?? "aeltorgoman-s-projects").trim();

/** تهريبُ محارف التعبير النمطيّ — الاسمُ يأتي من الإعداد لا من الشيفرة. */
const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* صيغتان لا ثالثة:
     alaqsa-hajj-<نشر>-aeltorgoman-s-projects.vercel.app
     alaqsa-hajj-git-<فرع>-aeltorgoman-s-projects.vercel.app */
const PREVIEW_ORIGIN_RE = new RegExp(
  `^https://${escapeRe(VERCEL_PROJECT)}-(?:git-[a-z0-9-]+|[a-z0-9]+)-${escapeRe(VERCEL_OWNER)}\\.vercel\\.app$`,
);

/** هل يُوثَق بهذا الأصل؟ — الموضعُ الوحيد الذي يقرّر ذلك. */
export function isTrustedOrigin(origin: string): boolean {
  /* طلبٌ بلا `Origin` ليس طلبَ متصفّحٍ عابرَ الأصل، فلا إذن يُمنح
     ولا يُحتاج. والتفويضُ الحقيقيّ في JWT والصلاحيات لا هنا. */
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return PREVIEW_ORIGIN_RE.test(origin);
}

/** ترويسات CORS محسوبة على أصل الطلب. */
export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    /* الاستجابة تتغيّر بتغيّر الأصل، فلا تُخلَط في مخزن وسيط */
    "Vary": "Origin",
  };

  /* ⚠️ الترويسةُ تُرسَل للموثوق وحده، وبأصله هو بالحرف. وغيابُها
     عن سواه هو الرفض — لا أصلٌ بديلٌ يُربك المتصفّح ويُخفي السبب. */
  if (isTrustedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;

  return headers;
}

export function json(req: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

export const fail = (req: Request, status: number, message: string) =>
  json(req, status, { error: message });
