// ============================================================
// _shared/rateLimit — حدّ الاستدعاءات، طبقة واحدة لكل دالة Edge
// ============================================================
// س٩ / M4. الحدّ يقع **خلف** التفويض لا بدلاً منه: لا يصل إلى هنا
// إلا من اجتاز النمط الثلاثي كاملاً في authorize(). وهو يحدّ الكمّ
// لا الحقّ — موظّف مخوَّل واحد، أو جهاز مسروق بجلسة حيّة، يستطيع
// استنزاف مفتاح مدفوع أو إغراق أجهزة الحجاج.
//
// العدّاد في القاعدة لا في الذاكرة: عزلات Deno عابرة ومتعدّدة.
//
// ⚠️ عند تعذّر الفحص نفسه (عطل في القاعدة) يمرّ الطلب ويُسجَّل العطل.
// وهذا اختيار مقصود: الحدّ حماية من الاستنزاف لا بوابة تفويض،
// والتفويض قد تمّ قبله، فلا يجوز أن يوقف عطلٌ في عدّاد عملَ الموسم.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { fail } from "./http.ts";

/** ترجع Response للرفض، أو null إذا كان الطلب داخل الحدّ. */
export async function enforceRateLimit(
  req: Request,
  admin: SupabaseClient,
  scope: string,
  userId: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_scope: scope,
    p_subject: userId,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("تعذّر فحص حدّ الاستدعاءات", { scope, error });
    return null;
  }

  if (data !== true) {
    console.warn("تجاوز حدّ الاستدعاءات", { scope, userId, limit, windowSeconds });
    return fail(req, 429, "تجاوزت الحدّ المسموح من الطلبات، حاول بعد قليل.");
  }

  return null;
}

/** الحدود المعتمدة — مكانٌ واحد يُراجَع فيه الرقم لا ثلاثة ملفات */
export const LIMITS = {
  /* مسح المستندات: مفتاح مدفوع بكل استدعاء. موظّف مجتهد يمسح عشرات
     المستندات في الساعة، فالحدّ فوق الاستعمال الواقعي بمراحل ويقطع
     الاستنزاف الآليّ */
  scan: { scope: "scan-passport", limit: 120, windowSeconds: 3600 },
  /* التنبيهات: ناتجها يخرج إلى أجهزة الحجاج، والإرسال الطبيعي
     حَدَثٌ قليل في اليوم */
  push: { scope: "pilgrim-push", limit: 30, windowSeconds: 3600 },
  /* إدارة المواسم: عمليات لا رجعة فيها، تُنفَّذ مرّات معدودة سنوياً */
  seasonAdmin: { scope: "season-admin", limit: 30, windowSeconds: 3600 },
} as const;
