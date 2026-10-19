/* ══════════════════════════════════════════════════════════════
   M6 — حلقةُ التسليم: تحجز دفعةً، ترسلها، تسجّل نتيجةَ كلِّ جهاز، وتعيد.

   لا تعرف قاعدةَ البيانات ولا web-push: تأخذهما دوالَّ (deps) فتُختبر
   وحدها بنُسخٍ وهميّة. والحالةُ كلُّها في القاعدة (`announcement_push_targets`):
   الحجزُ بمهلةٍ يمنع عاملين من جهازٍ واحد، والنتيجةُ لا تُكتب إلا لصاحب الحجز.

   ⚠️ التسليمُ «مرّةً على الأقلّ»: عاملٌ يرسل ثم يسقط (أو يتأخّر حتى تنقضي
   مهلةُ حجزه) قبل أن يسجّل، يُعاد إرسالُ جهازه في استدعاءٍ لاحق. ووسمُ
   `ann-<id>` في عامل الخدمة يجعل الثانيَ يحلّ محلّ الأول.
   ══════════════════════════════════════════════════════════════ */

export type Claimed = {
  target_id: number;
  attempt: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type Outcome = "sent" | "retryable" | "failed" | "gone";

export type Result = {
  outcome: Outcome;
  http: number | null;
  /* صنفٌ ثابتٌ للتشخيص — لا رسالةَ خام (قد تحمل عنوانَ الجهاز أو ردَّ الخدمة) */
  errorClass: string | null;
};

export type Summary = {
  total: number;
  sent: number;
  failed: number;
  expired: number;
  disabled: number;
  pending: number;
  complete: boolean;
  next_attempt_in_ms: number | null;
};

export type Deps = {
  claim: (limit: number, leaseSeconds: number) => Promise<Claimed[]>;
  send: (target: Claimed) => Promise<void>;
  complete: (target: Claimed, result: Result) => Promise<string>;
  summary: () => Promise<Summary>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

/* دفعةُ الأجهزة المتوازية في كلّ حجز */
export const BATCH_SIZE = 20;

/* مهلةُ الحجز: أضعافُ أسوأ زمنٍ لدفعة (مهلةُ النداء ٣ث + تسجيلُ عشرين نتيجة).
   عاملٌ لم يُنهِ دفعته فيها يُعدّ ساقطاً ويُعاد حجزُ أجهزته. */
export const LEASE_SECONDS = 60;

/* ميزانيةُ الاستدعاء الواحد: لا حجزَ جديدٌ بعدها. سقفُ الدالة ١٥٠ث، والهامشُ
   لدفعةٍ أخيرة (≤ مهلة الحجز) وللملخّص. ما يبقى pending يُستأنف لاحقاً. */
export const BUDGET_MS = 85_000;

const TRANSIENT_NETWORK =
  /timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNREFUSED|ECONNABORTED|EPIPE|EAI_AGAIN|ENOTFOUND|ENETUNREACH|EHOSTUNREACH|socket hang up|network|connection (?:reset|refused|closed)/i;

/* العابرُ وحده يُعاد: 429 و5xx والمهلةُ وانقطاعُ الاتصال.
   والدائمُ لا يُعاد: 400/401/403/404/410/413 وأيُّ 4xx آخر، ومفاتيحُ جهازٍ
   غيرُ صالحة (يرميها web-push قبل أي نداء، بلا statusCode). */
export function classify(err: unknown): Result {
  const e = (err ?? {}) as { statusCode?: unknown; code?: unknown; message?: unknown };
  const status = typeof e.statusCode === "number" && e.statusCode > 0 ? e.statusCode : null;

  if (status !== null) {
    if (status === 404 || status === 410) return { outcome: "gone", http: status, errorClass: "gone" };
    if (status === 429) return { outcome: "retryable", http: status, errorClass: "rate_limited" };
    if (status >= 500) return { outcome: "retryable", http: status, errorClass: "server_error" };
    if (status === 401 || status === 403) return { outcome: "failed", http: status, errorClass: "unauthorized" };
    if (status === 400) return { outcome: "failed", http: status, errorClass: "bad_request" };
    if (status === 413) return { outcome: "failed", http: status, errorClass: "payload" };
    return { outcome: "failed", http: status, errorClass: "rejected" };
  }

  const text = `${typeof e.code === "string" ? e.code : ""} ${typeof e.message === "string" ? e.message : ""}`;
  if (/timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(text)) {
    return { outcome: "retryable", http: null, errorClass: "timeout" };
  }
  if (TRANSIENT_NETWORK.test(text)) return { outcome: "retryable", http: null, errorClass: "network" };
  return { outcome: "failed", http: null, errorClass: "invalid" };
}

/* يحجز ويرسل حتى لا يبقى ما يُحجز أو تنفد الميزانية. والمحاولةُ المؤجّلة
   (retryable) يُنتظر موعدُها إن وقع داخل الميزانية، وإلا بقيت للاستدعاء التالي. */
export async function runDelivery(deps: Deps, budgetMs = BUDGET_MS): Promise<{ claimed: number; stale: number }> {
  const deadline = deps.now() + budgetMs;
  let claimed = 0;
  let stale = 0;

  while (deps.now() < deadline) {
    const batch = await deps.claim(BATCH_SIZE, LEASE_SECONDS);

    if (batch.length === 0) {
      const s = await deps.summary();
      const wait = s.next_attempt_in_ms;
      /* لا شيءَ ينتظر (أو ما بقي يحجزه عاملٌ آخر) */
      if (wait === null) break;
      if (deps.now() + wait >= deadline) break;
      await deps.sleep(Math.max(wait, 250));
      continue;
    }

    claimed += batch.length;
    await Promise.all(
      batch.map(async (t) => {
        let result: Result;
        try {
          await deps.send(t);
          result = { outcome: "sent", http: 201, errorClass: null };
        } catch (err) {
          result = classify(err);
        }
        try {
          if ((await deps.complete(t, result)) === "stale") stale++;
        } catch {
          /* تعذّر التسجيل: يبقى الجهاز processing حتى تنقضي مهلته فيُعاد —
             وهذا موضعُ «مرّةً على الأقلّ» إن كان قد وصل */
          stale++;
        }
      }),
    );
  }
  return { claimed, stale };
}
