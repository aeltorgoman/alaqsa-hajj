// ============================================================
// _shared/http — ترويسات وردود موحّدة لكل Edge Function
// ============================================================
// ملف واحد بدل نسخة في كل دالة، فلا تتفارق الترويسات ولا شكل
// رسالة الخطأ بين دالة وأخرى.
//
// س٩ — حصر CORS. كانت الترويسة `*` في الدوال الثلاث، أي أن أي صفحة
// على الشبكة تستطيع أن تطلب الدالة من متصفّح موظّف مسجَّل الدخول.
// وهي طبقة دفاع متواضعة (المتصفّح وحده يحترمها، وطلب curl يتجاهلها،
// والرمز لا يُقرأ من أصل آخر أصلاً) لكنها تُغلق ما لا سبب لبقائه
// مفتوحاً.
//
// الأصول المسموح بها تأتي من سرّ البنية `ALLOWED_ORIGINS` (قائمة
// مفصولة بفواصل) لا من ثابت في الشيفرة: النطاق قرار نشر يتغيّر بين
// بيئة وأخرى، ولا يجوز أن يوجب تعديل شيفرة.
//
// ⚠️ ما دام السرّ غير مضبوط تبقى الترويسة `*` — أي سلوك اليوم بلا
// تغيير. فضبطه **مهمّة نشر** على صاحب المشروع، لا شرط لدمج الشيفرة.

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((o) => o.trim()).filter(Boolean);

/** ترويسات CORS محسوبة على أصل الطلب. */
export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  /* أصل غير مسموح: تُردّ ترويسة أصلٍ آخر فيرفض المتصفّح القراءة */
  const allow = ALLOWED_ORIGINS.length === 0
    ? "*"
    : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    /* الاستجابة تتغيّر بتغيّر الأصل، فلا تُخلَط في مخزن وسيط */
    "Vary": "Origin",
  };
}

export function json(req: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

export const fail = (req: Request, status: number, message: string) =>
  json(req, status, { error: message });
