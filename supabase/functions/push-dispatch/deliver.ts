/* ══════════════════════════════════════════════════════════════
   M5 — تسليمُ تنبيهٍ واحدٍ حان موعدُه: حلقةُ M6 نفسُها، لا حلقةٌ ثانية.

   التهيئةُ (`push_prepare_announcement`) ثم `runDelivery` من
   send-pilgrim-push/delivery.ts بلا تعديل — الحجزُ بمهلةٍ والنتيجةُ لصاحب
   الحجز والمحاولاتُ الثلاث كلُّها هناك وفي القاعدة. وما يختلف عن
   send-pilgrim-push شيءٌ واحد: `topic: ann-<id>` في خيارات الدفع، فخدمةُ
   الدفع تستبدل نسخةً لم تُسلَّم بعدُ بالأحدث بدل أن تكدّسهما.

   ⚠️ «مرّةً على الأقلّ» كما في M6، لا «مرّةً بالضبط».

   لا يعرف web-push ولا supabase-js: يأخذهما دوالَّ (deps) فيُختبر وحده.
   ══════════════════════════════════════════════════════════════ */

import { runDelivery, type Claimed, type Summary } from "../send-pilgrim-push/delivery.ts";

export type Announcement = {
  id: number;
  title: string | null;
  body: string;
  priority: string;
};

export type SendOptions = {
  TTL: number;
  urgency: "high" | "normal";
  timeout: number;
  topic: string;
};

export type DeliverDeps = {
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T>;
  readAnnouncement: (id: number) => Promise<Announcement | null>;
  send: (target: Claimed, payload: string, options: SendOptions) => Promise<void>;
  worker: string;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export type DeliverOutcome =
  | { status: "ineligible"; reason: string }
  | { status: "delivered"; claimed: number; stale: number; pending: number; complete: boolean };

/* المهلةُ نفسُها في send-pilgrim-push (٣ث للنداء) — انظر تعليقها هناك */
const SEND_TIMEOUT_MS = 3000;

/* الحمولةُ بالحروف التي يرسلها send-pilgrim-push، فلا يفرّق الحاجُّ بين الطريقين */
export function buildPayload(ann: Announcement): string {
  return JSON.stringify({
    id: ann.id,
    title: ann.title || "حملة الأقصى",
    body: ann.body,
    priority: ann.priority,
    url: "/hajj/alerts",
  });
}

/* RFC 8030 §5.4: topic ≤ ٣٢ حرفاً من أبجديّة base64 الآمنة للروابط.
   `ann-` + معرّفٌ موجبٌ يكفيه ذلك إلى ٢٨ رقماً. */
export function topicFor(id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("invalid announcement id");
  return `ann-${id}`;
}

export function buildSendOptions(ann: Announcement): SendOptions {
  return {
    TTL: 86400,
    urgency: ann.priority === "عاجل" ? "high" : "normal",
    timeout: SEND_TIMEOUT_MS,
    topic: topicFor(ann.id),
  };
}

export async function deliverAnnouncement(id: number, budgetMs: number, deps: DeliverDeps): Promise<DeliverOutcome> {
  /* الاستحقاقُ في القاعدة لا هنا: لم يحن، أو انتهى، أو من موسمٍ آخر ← لا جهازَ يُمسّ */
  const prep = await deps.rpc<{ eligible: boolean; reason?: string }>("push_prepare_announcement", {
    p_announcement_id: id,
  });
  if (!prep || !prep.eligible) return { status: "ineligible", reason: prep?.reason ?? "unknown" };

  const ann = await deps.readAnnouncement(id);
  if (!ann) return { status: "ineligible", reason: "not_found" };

  const payload = buildPayload(ann);
  const options = buildSendOptions(ann);
  const summary = () => deps.rpc<Summary>("push_delivery_summary", { p_announcement_id: id });

  const run = await runDelivery({
    claim: (limit, leaseSeconds) =>
      deps.rpc<Claimed[]>("push_claim_targets", {
        p_announcement_id: id, p_worker: deps.worker, p_limit: limit, p_lease_seconds: leaseSeconds,
      }).then((rows) => rows ?? []),
    send: (t) => deps.send(t, payload, options),
    complete: (t, r) =>
      deps.rpc<string>("push_complete_target", {
        p_target_id: t.target_id, p_worker: deps.worker, p_attempt: t.attempt,
        p_outcome: r.outcome, p_http_status: r.http, p_error_class: r.errorClass,
      }),
    summary,
    now: deps.now,
    sleep: deps.sleep,
  }, budgetMs);

  const s = await summary();
  return { status: "delivered", claimed: run.claimed, stale: run.stale, pending: s.pending, complete: s.complete };
}
