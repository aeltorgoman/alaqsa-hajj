/* ══════════════════════════════════════════════════════════════
   push-dispatch — دفعُ التنبيهات المجدوَلة حين يحين موعدُها (M5)

   يستدعيه المُجدوِل وحده: `push_dispatch_tick()` في القاعدة عبر pg_net،
   برمزٍ لهذه الدالّة وحدها في ترويسة x-push-dispatch-token (لا مفتاحَ API
   من Supabase — انظر handler.ts). المصادقةُ والتوجيه في handler.ts،
   والتسليمُ في deliver.ts بحلقة M6 نفسها.

   verify_jwt = false (supabase/config.toml) — والمصادقةُ في handler.ts
   قبل أيّ عمل. وsend-pilgrim-push لا يُمسّ: يبقى طريقَ الإرسال اليدويّ
   بـverify_jwt = true وصلاحية manage_portal.

   المتغيرات: VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT · PUSH_DISPATCH_TOKEN
   ومن المنصّة: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
   ══════════════════════════════════════════════════════════════ */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";
import { handle } from "./handler.ts";
import { deliverAnnouncement, type Announcement } from "./deliver.ts";

Deno.serve((req: Request) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  /* لا افتراضَ لهويّة المُرسل — كما في send-pilgrim-push */
  const subject = (Deno.env.get("VAPID_SUBJECT") ?? "").trim();

  /* العميلُ يُنشأ عند الحاجة، أي بعد المصادقة في handle */
  let admin: ReturnType<typeof createClient> | null = null;
  const db = () => (admin ??= createClient(url, serviceKey, { auth: { persistSession: false } }));
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db().rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.code ?? "rpc"}`);
    return data as T;
  };

  return handle(req, {
    tokenEnv: Deno.env.get("PUSH_DISPATCH_TOKEN"),
    configured: () => Boolean(url && serviceKey && publicKey && privateKey && subject),
    dueIds: (limit) => rpc<number[]>("push_due_announcements", { p_limit: limit }).then((ids) => ids ?? []),
    begin: (runId) => rpc<boolean>("push_dispatch_begin", { p_run_id: runId }).then((ok) => ok === true),
    end: (runId, result) => rpc<boolean>("push_dispatch_end", { p_run_id: runId, p_result: result }).then(() => {}),
    deliver: (id, budgetMs) => {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      return deliverAnnouncement(id, budgetMs, {
        rpc,
        readAnnouncement: async (annId) => {
          const { data, error } = await db()
            .from("announcements").select("id, title, body, priority").eq("id", annId).maybeSingle();
          if (error) throw new Error("announcements: read");
          return (data as Announcement | null) ?? null;
        },
        send: async (t, payload, options) => {
          await webpush.sendNotification(
            { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, options,
          );
        },
        worker: crypto.randomUUID(),
        now: () => Date.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      });
    },
    now: () => Date.now(),
    log: (event, data) => console.log(event, JSON.stringify(data)),
  });
});
