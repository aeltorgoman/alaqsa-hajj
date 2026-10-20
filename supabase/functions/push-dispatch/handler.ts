/* ══════════════════════════════════════════════════════════════
   M5 — push-dispatch: يوقظه المُجدوِل (pg_cron → pg_net) فيسلّم ما حان.

   ⚠️ verify_jwt = false لأن المفتاح المسمّى (`sb_secret_…`) ليس JWT،
   فالبوابةُ لا تفهمه ولا تتحقّق من ترويسة apikey له. فالمصادقةُ هنا،
   **قبل أيّ شيءٍ آخر** — قبل قراءة الجسم وقبل أيّ نداءٍ للقاعدة:
     · المتوقَّع: `SUPABASE_SECRET_KEYS["push_dispatch"]` وحده. لا `default`
       ولا مفتاحَ آخر ولا service_role ولا anon: مفتاحٌ صالحٌ باسمٍ آخر يُرفض.
     · غيابُ المتغيّر أو فسادُه أو غيابُ الاسم ← 503 (إغلاقٌ معلَن).
     · ترويسةٌ غائبة أو مفتاحٌ آخر ← 401. والمقارنةُ بزمنٍ ثابت على بصمتين.
     · لا مفتاحَ في سجلٍّ ولا في ردّ، ولا CORS (لا يُستدعى من متصفّح).

   ثم: `probe` يعدّ المستحقّ ولا يسلّم شيئاً. و`dispatch` لا يسلّم إلا بعقدِ
   تشغيلٍ حيٍّ كتبه `push_dispatch_tick()` (begin مرّةً واحدة)، فحاملُ المفتاح
   وحده لا يبدأ تسليماً لم يطلبه المُجدوِل — وبلا مُجدوِلٍ مفعَّل لا عقد، فلا تسليم.

   لا يعرف Deno ولا supabase-js ولا web-push: يأخذها دوالَّ فيُختبر وحده.
   ══════════════════════════════════════════════════════════════ */

import type { DeliverOutcome } from "./deliver.ts";

export const KEY_NAME = "push_dispatch";
const KEY_RE = /^sb_secret_[A-Za-z0-9_-]{20,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 1024;

/* ميزانيةُ الاستدعاء كلِّه: أقلُّ من مهلة طلب pg_net (١٥٠ث) ومن عقد التشغيل (١٨٠ث) */
export const TOTAL_BUDGET_MS = 100_000;
/* ميزانيةُ التنبيه الواحد كما في send-pilgrim-push، وهامشُ دفعةٍ أخيرة وملخّص */
export const PER_ANNOUNCEMENT_MS = 85_000;
export const RESERVE_MS = 15_000;
export const MAX_PER_RUN = 5;

export type DispatchDeps = {
  /* SUPABASE_SECRET_KEYS كما هو (نصّ JSON) أو undefined */
  secretKeysEnv: string | undefined;
  /* VAPID وعنوانُ القاعدة ومفتاحُ الخدمة مضبوطة */
  configured: () => boolean;
  dueIds: (limit: number) => Promise<number[]>;
  begin: (runId: string) => Promise<boolean>;
  end: (runId: string, result: Record<string, unknown>) => Promise<void>;
  deliver: (id: number, budgetMs: number) => Promise<DeliverOutcome>;
  now: () => number;
  log: (event: string, data: Record<string, unknown>) => void;
};

/* المفتاحُ المتوقَّع، أو null إن لم يكن مضبوطاً كما يجب — لا افتراضَ ولا بديل */
export function expectedKey(raw: string | undefined): string | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const v = (parsed as Record<string, unknown>)[KEY_NAME];
  return typeof v === "string" && KEY_RE.test(v) ? v : null;
}

/* زمنٌ ثابت: تُقارن بصمتا SHA-256 (طولٌ ثابت) بايتاً بايتاً بلا خروجٍ مبكّر */
export async function sameKey(presented: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(presented)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handle(req: Request, deps: DispatchDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  /* ── (١) المصادقة: قبل كلّ شيء ── */
  const expected = expectedKey(deps.secretKeysEnv);
  if (!expected) {
    deps.log("push-dispatch auth", { result: "not_configured" });
    return json({ error: "not_configured" }, 503);
  }
  const presented = req.headers.get("apikey") ?? "";
  if (!presented) {
    deps.log("push-dispatch auth", { result: "missing" });
    return json({ error: "unauthorized" }, 401);
  }
  if (!(await sameKey(presented, expected))) {
    deps.log("push-dispatch auth", { result: "rejected" });
    return json({ error: "unauthorized" }, 401);
  }

  /* ── (٢) الطلب ── */
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return json({ error: "bad_request" }, 400);
  let body: { mode?: unknown; run_id?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "bad_request" }, 400);

  if (body.mode === "probe") {
    /* فحصُ الطريق: يعدّ ولا يسلّم ولا يحجز ولا يكتب */
    let due: number[];
    try {
      due = await deps.dueIds(MAX_PER_RUN);
    } catch {
      deps.log("push-dispatch probe", { result: "error" });
      return json({ error: "internal" }, 500);
    }
    deps.log("push-dispatch probe", { due: due.length });
    return json({ ok: true, mode: "probe", due: due.length });
  }
  if (body.mode !== "dispatch") return json({ error: "bad_request" }, 400);

  const runId = typeof body.run_id === "string" ? body.run_id : "";
  if (!UUID_RE.test(runId)) return json({ error: "bad_request" }, 400);

  if (!deps.configured()) {
    await deps.end(runId, { error: "not_configured" });
    deps.log("push-dispatch run", { result: "not_configured" });
    return json({ error: "not_configured" }, 503);
  }

  /* ── (٣) العقد: حيٌّ، ولهذا التشغيل، ولم يبدأ من قبل ── */
  let begun: boolean;
  try {
    begun = await deps.begin(runId);
  } catch {
    deps.log("push-dispatch run", { result: "error" });
    return json({ error: "internal" }, 500);
  }
  if (!begun) {
    deps.log("push-dispatch run", { result: "no_lease" });
    return json({ error: "no_lease" }, 409);
  }

  /* ── (٤) التسليم: تنبيهٌ بعد تنبيه داخل الميزانية، والعقدُ يُنهى أيّاً كان ── */
  const started = deps.now();
  const result = { due: 0, delivered: 0, ineligible: 0, errors: 0, claimed: 0, stale: 0, pending: 0, skipped: 0 };
  try {
    let ids: number[] = [];
    try {
      ids = await deps.dueIds(MAX_PER_RUN);
    } catch {
      result.errors++;
    }
    result.due = ids.length;
    for (const id of ids) {
      const remaining = TOTAL_BUDGET_MS - (deps.now() - started);
      if (remaining < RESERVE_MS * 2) {
        result.skipped++;
        continue;
      }
      try {
        const out = await deps.deliver(id, Math.min(PER_ANNOUNCEMENT_MS, remaining - RESERVE_MS));
        if (out.status === "ineligible") {
          result.ineligible++;
        } else {
          result.delivered++;
          result.claimed += out.claimed;
          result.stale += out.stale;
          result.pending += out.pending;
        }
      } catch {
        /* لا تفصيل: قد يحمل ردَّ خدمةٍ أو عنوانَ جهاز */
        result.errors++;
      }
    }
  } finally {
    await deps.end(runId, result).catch(() => {
      /* العقدُ ينقضي وحده بعد مهلته */
    });
  }
  /* أعدادٌ وحدها: لا عنوانَ جهاز ولا هويّةَ حاجّ ولا مفتاح */
  deps.log("push-dispatch run", result);
  return json({ ok: true, mode: "dispatch", ...result });
}
