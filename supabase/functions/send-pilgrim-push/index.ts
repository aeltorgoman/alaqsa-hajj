/* ══════════════════════════════════════════════════════════════
   دالة إرسال تنبيهات بوابة الحاج

   المتغيرات السرّية المطلوبة:
     VAPID_PUBLIC_KEY   المفتاح العام
     VAPID_PRIVATE_KEY  المفتاح الخاص
     VAPID_SUBJECT      بريد أو رابط التواصل (mailto:...)
   ══════════════════════════════════════════════════════════════ */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

type Subscription = {
  id: number;
  passenger_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@alaqsa-hajj.app";

    if (!publicKey || !privateKey) {
      return json({ error: "مفاتيح التنبيهات غير مضبوطة في إعدادات الدالة." }, 500);
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

    /* ─── (١) قراءة التنبيه ─── */
    const { data: ann, error: annErr } = await admin
      .from("announcements")
      .select("id, title, body, priority, target_type, target_ids")
      .eq("id", announcementId)
      .single();

    if (annErr || !ann) return json({ error: "التنبيه غير موجود." }, 404);

    /* ─── (٢) تحديد جمهور التنبيه ─── */
    const { data: audience, error: audErr } = await admin.rpc("announcement_audience", {
      p_target_type: ann.target_type ?? "all",
      p_target_ids: ann.target_ids ?? [],
    });

    if (audErr) return json({ error: "تعذّر تحديد المستهدفين." }, 500);

    const passengerIds: number[] = (audience ?? []).map(
      (r: { passenger_id: number }) => r.passenger_id
    );

    if (passengerIds.length === 0) {
      return json({ total: 0, sent: 0, failed: 0, expired: 0, disabled: 0 });
    }

    /* ─── (٣) جلب أجهزة هؤلاء الحجاج ─── */
    let query = admin
      .from("pilgrim_push_subscriptions")
      .select("id, passenger_id, endpoint, p256dh, auth")
      .in("passenger_id", passengerIds);

    if (testEndpoint) query = query.eq("endpoint", testEndpoint);

    const { data: subsData, error: subsErr } = await query;
    if (subsErr) return json({ error: "تعذّر قراءة أجهزة الحجاج." }, 500);

    const subs: Subscription[] = subsData ?? [];

    /* ─── (٤) الحجاج غير المفعّلين ─── */
    const enabledIds = new Set(subs.map((s) => s.passenger_id));
    const disabledIds = passengerIds.filter((id) => !enabledIds.has(id));

    /* ─── (٥) الإرسال ─── */
    const payload = JSON.stringify({
      id: ann.id,
      title: ann.title || "حملة الأقصى",
      body: ann.body,
      priority: ann.priority,
      url: "/hajj",
    });

    const results = new Map<number, { status: string; error: string | null }>();
    const deadEndpoints: string[] = [];

    /* دفعات من عشرين جهازاً لتفادي إرهاق الدالة */
    for (let i = 0; i < subs.length; i += 20) {
      const batch = subs.slice(i, i + 20);
      await Promise.all(
        batch.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
              { TTL: 86400, urgency: ann.priority === "عاجل" ? "high" : "normal" }
            );
            /* نجاح جهاز واحد يكفي لاعتبار الحاج قد استلم */
            results.set(s.passenger_id, { status: "sent", error: null });
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode ?? 0;
            const message = (err as Error).message ?? "خطأ غير معروف";

            /* 404 و 410 تعني أن الجهاز لم يعد مشتركاً */
            if (code === 404 || code === 410) {
              deadEndpoints.push(s.endpoint);
              if (results.get(s.passenger_id)?.status !== "sent") {
                results.set(s.passenger_id, { status: "expired", error: message });
              }
            } else if (results.get(s.passenger_id)?.status !== "sent") {
              results.set(s.passenger_id, { status: "failed", error: message.slice(0, 300) });
            }
          }
        })
      );
    }

    /* ─── (٦) حذف الاشتراكات المنتهية ─── */
    if (deadEndpoints.length > 0) {
      await admin.from("pilgrim_push_subscriptions").delete().in("endpoint", deadEndpoints);
    }

    /* ─── (٧) تسجيل نتيجة كل حاج ─── */
    if (!testEndpoint) {
      const rows = [
        ...Array.from(results.entries()).map(([passenger_id, r]) => ({
          announcement_id: ann.id,
          passenger_id,
          status: r.status,
          error: r.error,
        })),
        ...disabledIds.map((passenger_id) => ({
          announcement_id: ann.id,
          passenger_id,
          status: "disabled",
          error: null,
        })),
      ];

      for (let i = 0; i < rows.length; i += 200) {
        await admin
          .from("notification_deliveries")
          .upsert(rows.slice(i, i + 200), { onConflict: "announcement_id,passenger_id" });
      }

      await admin
        .from("announcements")
        .update({ push_sent_at: new Date().toISOString() })
        .eq("id", ann.id);
    }

    /* ─── (٨) التقرير ─── */
    const count = (status: string) =>
      Array.from(results.values()).filter((r) => r.status === status).length;

    return json({
      total: passengerIds.length,
      sent: count("sent"),
      failed: count("failed"),
      expired: count("expired"),
      disabled: disabledIds.length,
    });
  } catch (err) {
    return json({ error: (err as Error).message ?? "خطأ غير متوقع." }, 500);
  }
});
