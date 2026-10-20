/* ══════════════════════════════════════════════════════════════
   دالة إرسال تنبيهات بوابة الحاج

   المتغيرات السرّية المطلوبة:
     VAPID_PUBLIC_KEY   المفتاح العام
     VAPID_PRIVATE_KEY  المفتاح الخاص
     VAPID_SUBJECT      بريد أو رابط التواصل (mailto:...)

   س٣ / Security Architecture v1.3 §٧.٤:
   verify_jwt = true قائم منذ إنشائها، ولا يحمي وحده — مفتاح النشر
   العلني هو JWT صالح يجتاز البوابة. وهذه أخطر دالة في النظام أثراً
   لأن ناتجها **يخرج إلى أجهزة الحجاج**، فحاملُ المفتاح كان يستطيع
   دفع تنبيه إلى كل حاج مشترك.

   الحارس عبر _shared/authorize.ts وحدها، وصلاحية manage_portal هي
   نفسها التي تحرس صفحة بوابة الحاج في NAV.

   M6: التسليمُ حجزٌ بمهلةٍ لكلِّ جهاز (announcement_push_targets) — لا
   تكرارَ بين عاملين، واستئنافٌ بعد سقوط، وإعادةٌ للعابر وحده. انظر
   delivery.ts وترحيلة 20261019135129. الحارسُ والحدُّ الكمّيّ وCORS
   وشكلُ الطلب والردّ كما كانت (و`pending` حقلٌ مضاف).
   ══════════════════════════════════════════════════════════════ */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";
import { authorize } from "../_shared/authorize.ts";
import { cors } from "../_shared/http.ts";
import { enforceRateLimit, LIMITS } from "../_shared/rateLimit.ts";
import { classify, runDelivery, type Claimed, type Summary } from "./delivery.ts";

const REQUIRED_PERMISSION = "manage_portal";

const INELIGIBLE: Record<string, string> = {
  not_due: "لم يحن موعد ظهور هذا التنبيه بعد، فلا يُرسَل إلى الأجهزة.",
  expired: "انتهت مدة هذا التنبيه، فلا يُرسَل إلى الأجهزة.",
  wrong_season: "هذا التنبيه لا يتبع الموسم المفتوح، فلا يُرسَل إلى الأجهزة.",
};

type Subscription = {
  id: number;
  passenger_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

Deno.serve(async (req: Request) => {
  const CORS = cors(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  /* تنبيهٌ لا يُرسَل الآن: لا جهازَ يُمسّ */
  const ineligible = (reason: string) =>
    reason === "not_found"
      ? json({ error: "التنبيه غير موجود." }, 404)
      : json({ error: INELIGIBLE[reason] ?? "لا يمكن إرسال هذا التنبيه الآن." }, 409);

  /* الهوية والصلاحية قبل قراءة الجسم وقبل أي إرسال إلى جهاز */
  const auth = await authorize(req, REQUIRED_PERMISSION);
  if (!auth.ok) return auth.response;

  /* س٩ / M4 — الحدّ الكمّي قبل أي إرسال إلى جهاز حاج */
  const limited = await enforceRateLimit(
    req, auth.admin, LIMITS.push.scope, auth.userId, LIMITS.push.limit, LIMITS.push.windowSeconds,
  );
  if (limited) return limited;

  try {
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    /* ⚠️ لا افتراضَ لهويةِ المُرسل: افتراضُ عنوانِ المورِّد كان
       يُقدّم المورِّدَ مُرسلاً لتنبيهات العميل (§٣.٧ من دليل التسليم).
       وغيابُه إغلاقٌ معلَنٌ لا إرسالٌ بهويةٍ خاطئة. */
    const subject = (Deno.env.get("VAPID_SUBJECT") ?? "").trim();

    if (!publicKey || !privateKey || !subject) {
      return json({ error: "إعدادات التنبيهات غير مكتملة في إعدادات الدالة." }, 500);
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const body = await req.json().catch(() => ({}));
    const announcementId: number | null = body.announcement_id ?? null;
    const testEndpoint: string | null = body.test_endpoint ?? null;

    if (!announcementId) {
      return json({ error: "رقم التنبيه مطلوب." }, 400);
    }

    /* مفتاح الخدمة يتجاوز حماية جدول الاشتراكات */
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    /* ─── (١) الاستحقاق (M6): الموسمُ المفتوح، وحان موعدُه، ولم ينتهِ ───
       التحقّق في القاعدة لا هنا، فلا يُرسَل مجدوَلٌ لم يحن ولا منتهٍ ولا من موسمٍ آخر
       أيّاً كان المستدعي. والتجريبيُّ (test_endpoint) يُفحص بالقاعدة نفسها ولا يُسجَّل. */
    if (testEndpoint) {
      const { data: reason, error: rErr } = await admin.rpc("push_announcement_ineligible_reason", {
        p_announcement_id: announcementId,
      });
      if (rErr) return json({ error: "تعذّر التحقق من التنبيه." }, 500);
      if (reason) return ineligible(reason as string);
    } else {
      const { data: prep, error: prepErr } = await admin.rpc("push_prepare_announcement", {
        p_announcement_id: announcementId,
      });
      if (prepErr || !prep) return json({ error: "تعذّر تجهيز التنبيه للإرسال." }, 500);
      if (!(prep as { eligible: boolean }).eligible) return ineligible((prep as { reason: string }).reason);
    }

    /* ─── (٢) قراءة التنبيه ─── */
    const { data: ann, error: annErr } = await admin
      .from("announcements")
      .select("id, title, body, priority, target_type, target_ids")
      .eq("id", announcementId)
      .single();

    if (annErr || !ann) return json({ error: "التنبيه غير موجود." }, 404);

    const payload = JSON.stringify({
      id: ann.id,
      title: ann.title || "حملة الأقصى",
      body: ann.body,
      priority: ann.priority,
      /* شاشةُ التنبيهات صار لها عنوانٌ قانونيّ، وضغطةُ التنبيه تقصدها
         هي لا «رحلتي». والعاملُ يقرأ هذا الحقل عند الضغط، فبه يطابق
         الفتحُ البارد الفتحَ الدافئ (`OPEN_ALERTS`). */
      url: "/hajj/alerts",
    });

    /* ⚠️ مهلةُ كلِّ نداء — بالمللي ثانية (`socket.setTimeout` في Node).
       بلا مهلةٍ لا سقفَ لنداءٍ واحد: نقطةُ نهايةٍ تقبل الوصلةَ ولا تردّ تُجمّد
       دفعتَها حتى يُقتل الاستدعاء. ومع M6 صار لها شأنٌ ثانٍ: دفعةٌ تتجاوز مهلةَ
       حجزها (`LEASE_SECONDS` = ٦٠ث) يُعاد حجزُ أجهزتها فتُرسَل مرّتين، و٣ث
       للنداء تُبقي الدفعةَ كلَّها بضعَ ثوانٍ. وهي أضعافُ زمنِ خدمات الدفع
       الواقعيّ (١٠٠–٥٠٠ مللي) فلا تُجهض تسليماً ناجحاً. والمهلةُ تُنتج
       `Error("Socket timeout")` بلا `statusCode` فتُصنَّف عابرةً وتُعاد. */
    const SEND_TIMEOUT_MS = 3000;
    const sendOptions = {
      TTL: 86400,
      urgency: (ann.priority === "عاجل" ? "high" : "normal") as "high" | "normal",
      timeout: SEND_TIMEOUT_MS,
    };

    /* ─── (٣ب) المسار التجريبيّ: جهازٌ واحدٌ بعنوانه، بلا سجلّ — كما كان ─── */
    if (testEndpoint) {
      const { data: audience, error: audErr } = await admin.rpc("announcement_audience", {
        p_target_type: ann.target_type ?? "all",
        p_target_ids: ann.target_ids ?? [],
      });
      if (audErr) return json({ error: "تعذّر تحديد المستهدفين." }, 500);
      const passengerIds: number[] = (audience ?? []).map((r: { passenger_id: number }) => r.passenger_id);
      if (passengerIds.length === 0) return json({ total: 0, sent: 0, failed: 0, expired: 0, disabled: 0 });

      const { data: subsData, error: subsErr } = await admin
        .from("pilgrim_push_subscriptions")
        .select("id, passenger_id, endpoint, p256dh, auth")
        .in("passenger_id", passengerIds)
        .eq("endpoint", testEndpoint);
      if (subsErr) return json({ error: "تعذّر قراءة أجهزة الحجاج." }, 500);

      const subs: Subscription[] = subsData ?? [];
      const results = new Map<number, string>();
      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, sendOptions,
          );
          results.set(s.passenger_id, "sent");
        } catch (err) {
          const r = classify(err);
          if (r.outcome === "gone") {
            await admin.from("pilgrim_push_subscriptions").delete().eq("id", s.id);
          }
          if (results.get(s.passenger_id) !== "sent") {
            results.set(s.passenger_id, r.outcome === "gone" ? "expired" : "failed");
          }
        }
      }
      const enabled = new Set(subs.map((s) => s.passenger_id));
      const count = (status: string) => Array.from(results.values()).filter((v) => v === status).length;
      return json({
        total: passengerIds.length,
        sent: count("sent"),
        failed: count("failed"),
        expired: count("expired"),
        disabled: passengerIds.filter((id) => !enabled.has(id)).length,
      });
    }

    /* ─── (٣) التسليم (M6): حجزٌ بمهلة، ثم إرسال، ثم نتيجةٌ لكلِّ جهاز ───
       عاملان متزامنان (استدعاءٌ مكرَّر، أو يدويٌّ مع مجدوَل M5) لا يحجزان جهازاً
       واحداً، وعاملٌ سقط تعود أجهزتُه بعد مهلتها. والعابرُ يُعاد حتى ثلاث محاولات. */
    const worker = crypto.randomUUID();
    const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
      const { data, error } = await admin.rpc(fn, args);
      if (error) throw new Error(`${fn}: ${error.code ?? "rpc"}`);
      return data as T;
    };
    const summary = () => rpc<Summary>("push_delivery_summary", { p_announcement_id: ann.id });

    const run = await runDelivery({
      claim: (limit, leaseSeconds) =>
        rpc<Claimed[]>("push_claim_targets", {
          p_announcement_id: ann.id, p_worker: worker, p_limit: limit, p_lease_seconds: leaseSeconds,
        }).then((rows) => rows ?? []),
      send: async (t) => {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, sendOptions,
        );
      },
      complete: (t, r) =>
        rpc<string>("push_complete_target", {
          p_target_id: t.target_id, p_worker: worker, p_attempt: t.attempt,
          p_outcome: r.outcome, p_http_status: r.http, p_error_class: r.errorClass,
        }),
      summary,
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });

    /* ─── (٤) التقرير: حالُ التنبيه كلِّه بالحجّاج، لا هذا الاستدعاء وحده ───
       فاستدعاءٌ مكرَّرٌ بعد الاكتمال يردّ الأعدادَ نفسها ولا يرسل شيئاً.
       و`pending` حجّاجٌ لم تكتمل أجهزتُهم بعد (محاولةٌ مؤجَّلة) — تُستأنف باستدعاءٍ لاحق. */
    const s = await summary();
    /* أعدادٌ وحدها: لا عنوانَ جهاز ولا هويّةَ حاجّ */
    console.log("send-pilgrim-push", JSON.stringify({
      announcement: ann.id, claimed: run.claimed, stale: run.stale,
      sent: s.sent, failed: s.failed, expired: s.expired, pending: s.pending,
    }));

    return json({
      total: s.total,
      sent: s.sent,
      failed: s.failed,
      expired: s.expired,
      disabled: s.disabled,
      pending: s.pending,
    });
  } catch (err) {
    /* س٩ — التفصيل إلى سجلّ الخادم، والمستدعي يأخذ رسالة عامة */
    console.error("خطأ غير متوقّع في إرسال التنبيهات", err);
    return json({ error: "تعذّر إرسال التنبيهات." }, 500);
  }
});
