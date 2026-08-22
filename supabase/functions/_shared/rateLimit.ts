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

/* ------------------------------------------------------------
   النسخة المغلقة عند العطل — لدوال بلا تفويض سابق
   ------------------------------------------------------------
   س٦ / الخطوة ٤. الدالة أعلاه تمرّر عند عطل العدّاد، وهذا صحيح
   هناك: التفويض تمّ قبلها فالحدّ حارس استهلاك لا حارس باب.
   أمّا `pilgrim-doc` فتعمل بلا JWT، والحدّ فيها **جزء من الحماية**
   نفسها (سقف التخمين وسقف التوقيع)، فلا يجوز أن يفتحها عطلٌ في
   القاعدة. ولهذا تُردّ 429 عند تعذّر الفحص — وهو نفس اختيار
   `get_pilgrim_portal` في س٦ (fail closed).

   والموضوع `uuid` بحكم توقيع `consume_rate_limit`، والمُدخل هنا نصّ
   (عنوان مصدر أو رقم وثيقة)، فيُشتقّ منه UUID ثابت بـ SHA-256:
   بصمة لا تُعاد إلى أصلها، فلا يحمل جدول العدّادات أرقام وثائق. */
export async function subjectUuid(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(value)));
  const hex = Array.from(bytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** ترجع true إذا كان الطلب داخل الحدّ. العطل = خارج الحدّ. */
export async function withinLimitFailClosed(
  admin: SupabaseClient,
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_scope: scope,
      p_subject: await subjectUuid(subject),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("تعذّر فحص حدّ الاستدعاءات — يُمنع الطلب", { scope, error });
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("عطل في فحص حدّ الاستدعاءات — يُمنع الطلب", { scope, e });
    return false;
  }
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
  /* ── بوابة الحاج / `pilgrim-doc` — نفس منطق حدّي س٦ المعتمدين ──
     بالمصدر: سخيّ عمداً، فحجّاج كثيرون يخرجون من عنوان واحد
     (شبكة الحملة أو مشغّل هاتف واحد) */
  portalDocSrc:  { scope: "portal-doc-src",  limit: 120, windowSeconds: 3600 },
  /* س٧: فشل التحقّق من رمز الجلسة، بالمصدر. الرمز ٢٥٦ بت فالتخمين
     مستحيل بالمقدار لا بالحدّ — وهذا السقف يحمي جدول العدّادات من
     الإغراق لا الرمز من التخمين. وسخيّ عمداً كي لا يُحرَم حاجّ
     انتهت جلسته من إعادة المحاولة (الهدف هـ) */
  portalDocSession: { scope: "portal-doc-session", limit: 60, windowSeconds: 3600 },
  /* بالحاجّ بعد نجاح الإثبات: سقف على التوقيع نفسه، فمن عرف بيانات
     حاجّ لا يحوّلها إلى مصنع روابط. ثلاثة مستندات وإعادة فتح
     متكرّرة تبقى دون هذا الرقم بمراحل */
  portalDocSign: { scope: "portal-doc-sign", limit: 60,  windowSeconds: 3600 },
} as const;
