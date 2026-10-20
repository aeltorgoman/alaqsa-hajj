// ════════════════════════════════════════════════════════════
// بوابة الحاجّ — M6: حلقةُ التسليم الحقيقيّة (delivery.ts) على قاعدةٍ محلّيّة
// وخدمةُ دفعٍ وهميّة. لا إرسالَ حقيقيّ ولا بياناتَ حقيقيّة.
//
//   node --experimental-strip-types supabase/verification/portal/m6_push_delivery_e2e.mjs
//   LOCAL='postgresql:///db?host=/path/to/socket&port=…&user=postgres' …
//
// يحاكي ما يفعله `send-pilgrim-push`: تهيئة ← runDelivery ← ملخّص، مع:
//   نجاح · 503 ثم نجاح · 503 دائماً (ثلاثُ محاولات) · مهلةٌ دائماً · ECONNRESET ثم نجاح
//   403 (لا إعادة) · 410 (يُحذف الجهاز) · جهازان لحاجٍّ واحد (وصل أحدهما)
//   عاملان متزامنان (يدويٌّ ومجدوَل M5) · طلبٌ مكرَّر · عاملٌ يسقط · عاملٌ بطيء
//   مجدوَلٌ لم يحن · منتهٍ · موسمٌ آخر
// ⚠️ يرفض أيَّ قاعدةٍ غيرِ محلّيّة، ويحذف ما يكتبه.
// ════════════════════════════════════════════════════════════
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const { runDelivery, classify } = await import(path.join(here, "../../functions/send-pilgrim-push/delivery.ts"));

const LOCAL = process.env.LOCAL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@127\.0\.0\.1:|@localhost:|^postgresql:\/\/\//.test(LOCAL)) { console.log(`يرفض: ${LOCAL} ليست قاعدةً محلّيّة`); process.exit(2); }

const run = promisify(execFile);
const sqlSync = (q) => execFileSync("psql", [LOCAL, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
/* نداءٌ بدور service_role كما تفعل الدالةُ الطرفيّة بمفتاح الخدمة */
async function svc(q) {
  const { stdout } = await run("psql", [LOCAL, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c",
    `begin; set local role service_role; ${q}; commit;`], { encoding: "utf8" });
  return stdout.trim();
}
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS — ${name}`); } else { fail++; console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`); }
};

if (sqlSync("select count(*) from public.seasons where id in (9771, 9772)") !== "0") { console.log("يرفض: موسمُ التهيئة موجود"); process.exit(2); }
if (sqlSync("select count(*) from public.seasons where closed_at is null") !== "0") { console.log("يرفض: في القاعدة موسمٌ مفتوح"); process.exit(2); }

function cleanup() {
  sqlSync(`set app.season_maintenance = 'on';
    delete from public.announcements where id between 4770 and 4799;
    delete from public.pilgrim_push_subscriptions where passenger_id between 5770 and 5799;
    delete from public.passengers where id between 5770 and 5799;
    delete from public.seasons where id in (9771, 9772);`);
}

/* حجّاجٌ: 5771 جهازان (ok + 410) · 5772 (503 ثم نجاح) · 5773 (503 دائماً) · 5774 (مهلةٌ دائماً)
   5775 (ECONNRESET ثم نجاح) · 5776 (403) · 5777 بلا جهاز */
sqlSync(`set app.season_maintenance = 'on';
  insert into public.seasons (id,name,hijri_year,closed_at) overriding system value values
    (9772,'موسم M6e مقفل',1477,now() - interval '1 day'), (9771,'موسم M6e',1478,null);
  insert into public.passengers (id,season_id,name_ar,gender,passenger_type) overriding system value
    select g, 9771, 'حاج ' || g, 'ذكر', 'حاج' from generate_series(5771, 5777) g;`);

const PIDS = "{5771,5772,5773,5774,5775,5776,5777}";
function devices(tag) {
  sqlSync(`delete from public.pilgrim_push_subscriptions where passenger_id between 5770 and 5799;
    insert into public.pilgrim_push_subscriptions (passenger_id,endpoint,p256dh,auth) values
      (5771,'https://push.example/${tag}/ok','k','a'), (5771,'https://push.example/${tag}/gone','k','a'),
      (5772,'https://push.example/${tag}/flaky503','k','a'), (5773,'https://push.example/${tag}/down503','k','a'),
      (5774,'https://push.example/${tag}/timeout','k','a'), (5775,'https://push.example/${tag}/reset','k','a'),
      (5776,'https://push.example/${tag}/forbidden','k','a');`);
}
function announcement(id, cols = "now() - interval '1 minute', null", season = 9771) {
  sqlSync(`set app.season_maintenance = 'on';
    insert into public.announcements (id,season_id,body,target_type,target_ids,show_at,expires_at)
    overriding system value values (${id}, ${season}, 'M6 e2e', 'custom', '${PIDS}', ${cols});`);
}

/* خدمةُ دفعٍ وهميّة: تسجّل كلَّ نداءٍ وكلَّ وصول */
function pushService() {
  const calls = new Map(), delivered = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  const err = (props, msg = "push error") => Object.assign(new Error(msg), props);
  return {
    calls, delivered,
    async send(t) {
      const kind = t.endpoint.split("/").pop();
      bump(calls, kind);
      const n = calls.get(kind);
      await new Promise((r) => setTimeout(r, 5));
      if (kind === "gone") throw err({ statusCode: 410 });
      if (kind === "forbidden") throw err({ statusCode: 403 });
      if (kind === "down503") throw err({ statusCode: 503 });
      if (kind === "flaky503" && n === 1) throw err({ statusCode: 503 });
      if (kind === "timeout") throw new Error("Socket timeout");
      if (kind === "reset" && n === 1) throw err({ code: "ECONNRESET" }, "read ECONNRESET");
      bump(delivered, kind);
    },
  };
}

/* ساعةٌ مزيّفة: «النوم» يقدّم الساعة ويقدّم مواعيدَ الإعادة في القاعدة بالقدر نفسه */
function clock(annId) {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
      sqlSync(`update public.announcement_push_targets set next_attempt_at = next_attempt_at - make_interval(secs => ${ms / 1000})
               where announcement_id = ${annId} and status in ('pending','retryable')`);
    },
  };
}

/* ما يفعله `send-pilgrim-push` بعد الحارس: تهيئة ← حلقة ← ملخّص */
async function invoke(annId, worker, push, clk = clock(annId), budget) {
  const prep = JSON.parse(await svc(`select push_prepare_announcement(${annId})`));
  if (!prep.eligible) return { prep };
  const summary = async () => JSON.parse(await svc(`select push_delivery_summary(${annId})`));
  const res = await runDelivery({
    claim: async (limit, lease) =>
      JSON.parse((await svc(`select coalesce(json_agg(x), '[]') from push_claim_targets(${annId}, '${worker}', ${limit}, ${lease}) x`)) || "[]"),
    send: push.send,
    complete: async (t, r) =>
      svc(`select push_complete_target(${t.target_id}, '${worker}', ${t.attempt}, ${lit(r.outcome)}, ${r.http ?? "null"}, ${lit(r.errorClass)})`),
    summary,
    now: clk.now,
    sleep: clk.sleep,
  }, budget);
  return { prep, res, summary: await summary() };
}
const deliveries = (a) => sqlSync(`select string_agg(passenger_id || '=' || status, ',' order by passenger_id) from public.notification_deliveries where announcement_id = ${a}`);
const W = (n) => `00000000-0000-0000-0000-0000000000b${n}`;

try {
  console.log("═══ تصنيف الأخطاء ═══");
  const c = (e) => { const r = classify(e); return `${r.outcome}/${r.errorClass}`; };
  check("429 → retryable", c({ statusCode: 429 }) === "retryable/rate_limited");
  check("500/502/503 → retryable", [500, 502, 503].every((s) => c({ statusCode: s }) === "retryable/server_error"));
  check("socket timeout → retryable", c(new Error("Socket timeout")) === "retryable/timeout");
  check("ECONNRESET / EAI_AGAIN / socket hang up → retryable", [{ code: "ECONNRESET" }, { code: "EAI_AGAIN" }, new Error("socket hang up")].every((e) => c(e).startsWith("retryable/")));
  check("400/401/403/413 → failed, no retry", c({ statusCode: 400 }) === "failed/bad_request" && c({ statusCode: 401 }) === "failed/unauthorized"
    && c({ statusCode: 403 }) === "failed/unauthorized" && c({ statusCode: 413 }) === "failed/payload");
  check("404/410 → gone (subscription cleanup)", c({ statusCode: 404 }) === "gone/gone" && c({ statusCode: 410 }) === "gone/gone");
  check("invalid subscription keys (web-push throws before any request) → failed", c(new Error("The subscription p256dh value should be 65 bytes long.")) === "failed/invalid");

  console.log("═══ يدويٌّ ومجدوَلٌ متزامنان على تنبيهٍ واحد ═══");
  devices("overlap"); announcement(4771);
  const push = pushService();
  const [a, b] = await Promise.all([invoke(4771, W(1), push), invoke(4771, W(2), push)]);
  const del = Object.fromEntries(push.delivered), calls = Object.fromEntries(push.calls);
  check("every reachable device delivered exactly once across both workers",
    del.ok === 1 && del.flaky503 === 1 && del.reset === 1, JSON.stringify(del));
  check("transient 503 / ECONNRESET retried once, then delivered", calls.flaky503 === 2 && calls.reset === 2, JSON.stringify(calls));
  check("always-503 and always-timeout: exactly 3 attempts each, then stop", calls.down503 === 3 && calls.timeout === 3, JSON.stringify(calls));
  check("403 and 410: exactly one attempt each", calls.forbidden === 1 && calls.gone === 1, JSON.stringify(calls));
  /* عاملٌ لا يجد إلا أجهزةً يحجزها الآخر ينصرف ويتركها له — فلقطتاهما تختلفان،
     والحالُ النهائيّ يُقرأ بعد انتهائهما كليهما */
  const s = JSON.parse(await svc("select push_delivery_summary(4771)"));
  check("at least one worker saw delivery complete; none left work behind",
    (a.summary.complete || b.summary.complete) && s.complete === true, `${JSON.stringify(a.summary)} ${JSON.stringify(b.summary)}`);
  check("summary: total 7 · sent 3 · failed 3 · disabled 1 · pending 0 · complete",
    s.total === 7 && s.sent === 3 && s.failed === 3 && s.expired === 0 && s.disabled === 1 && s.pending === 0 && s.complete === true, JSON.stringify(s));
  check("per-pilgrim: two-device pilgrim with one 410 → sent; 503/timeout/403 → failed; no device → disabled",
    deliveries(4771) === "5771=sent,5772=sent,5773=failed,5774=failed,5775=sent,5776=failed,5777=disabled", deliveries(4771));
  check("410 subscription deleted, others kept",
    sqlSync("select count(*) from public.pilgrim_push_subscriptions where endpoint like '%/overlap/gone'") === "0"
    && sqlSync("select count(*) from public.pilgrim_push_subscriptions where endpoint like '%/overlap/%'") === "6");
  check("push_sent_at stamped once delivery is complete", sqlSync("select push_sent_at is not null from public.announcements where id = 4771") === "t");
  check("diagnostics carry class + status only",
    sqlSync("select string_agg(distinct error, ' | ' order by error) from public.notification_deliveries where announcement_id = 4771 and status = 'failed'")
      === "server_error · HTTP 503 | timeout | unauthorized · HTTP 403",
    sqlSync("select string_agg(distinct error, ' | ' order by error) from public.notification_deliveries where announcement_id = 4771 and status = 'failed'"));

  console.log("═══ طلبٌ مكرَّر بعد الاكتمال ═══");
  const before = [...push.calls.values()].reduce((x, y) => x + y, 0);
  const again = await invoke(4771, W(3), push);
  check("repeated request sends nothing and returns the same counts",
    [...push.calls.values()].reduce((x, y) => x + y, 0) === before && JSON.stringify(again.summary) === JSON.stringify(s));

  console.log("═══ عاملٌ يسقط بعد الحجز ═══");
  devices("crash"); announcement(4772);
  const p2 = pushService();
  await svc("select push_prepare_announcement(4772)");
  const grabbed = JSON.parse(await svc(`select coalesce(json_agg(x), '[]') from push_claim_targets(4772, '${W(4)}', 20, 60) x`));
  check("crashed worker held every device", grabbed.length === 7, String(grabbed.length));
  const early = await invoke(4772, W(5), p2);
  check("while its lease lives, another worker sends nothing and reports pending",
    [...p2.calls.values()].length === 0 && early.summary.pending === 6 && early.summary.complete === false, JSON.stringify(early.summary));
  sqlSync("update public.announcement_push_targets set lease_expires_at = now() - interval '1 second' where announcement_id = 4772 and status = 'processing'");
  const recovered = await invoke(4772, W(5), p2);
  check("after the lease expires the devices are recovered and delivered once",
    p2.delivered.get("ok") === 1 && p2.delivered.get("flaky503") === 1 && recovered.summary.complete === true, JSON.stringify(recovered.summary));
  check("the crashed claim counted as an attempt: always-503 gets only 2 more",
    p2.calls.get("down503") === 2, String(p2.calls.get("down503")));

  console.log("═══ عاملٌ بطيءٌ تجاوز مهلته (حدُّ «مرّةً على الأقلّ») ═══");
  devices("slow"); announcement(4773, "now() - interval '1 minute', null");
  sqlSync("delete from public.pilgrim_push_subscriptions where endpoint like '%/slow/%' and endpoint not like '%/slow/ok'");
  const p3 = pushService();
  await svc("select push_prepare_announcement(4773)");
  const [slowT] = JSON.parse(await svc(`select coalesce(json_agg(x), '[]') from push_claim_targets(4773, '${W(6)}', 20, 60) x`));
  await p3.send(slowT);                                  // وصل إلى الجهاز…
  sqlSync("update public.announcement_push_targets set lease_expires_at = now() - interval '1 second' where announcement_id = 4773");
  const fast = await invoke(4773, W(7), p3);              // …وعاملٌ آخر أعاد حجزه
  const late = await svc(`select push_complete_target(${slowT.target_id}, '${W(6)}', ${slowT.attempt}, 'sent', 201, null)`);
  check("slow worker's late result is rejected as stale", late === "stale", late);
  check("documented limitation: the device received it twice (at-least-once)", p3.delivered.get("ok") === 2, String(p3.delivered.get("ok")));
  check("…but the record is single and correct (sent, attempt 2)",
    sqlSync("select status || ':' || attempts from public.announcement_push_targets where announcement_id = 4773") === "sent:2" && fast.summary.sent === 1);

  console.log("═══ إعادةٌ مؤجَّلة تتجاوز ميزانية الاستدعاء ═══");
  devices("budget"); announcement(4774);
  const p4 = pushService();
  const first = await invoke(4774, W(8), p4, clock(4774), 1000);   // ميزانيةٌ أقصرُ من أول انتظار (٥ث)
  check("retries beyond the budget stay pending — delivery not marked complete",
    first.summary.pending > 0 && first.summary.complete === false
      && sqlSync("select push_sent_at is null from public.announcements where id = 4774") === "t", JSON.stringify(first.summary));
  check("report distinguishes pending pilgrims from failed ones",
    deliveries(4774).includes("5772=pending") && deliveries(4774).includes("5776=failed"), deliveries(4774));
  const resumed = await invoke(4774, W(9), p4);                    // «استكمال الإرسال» (أو M5)
  check("a later invocation resumes the deferred retries and completes",
    resumed.summary.pending === 0 && resumed.summary.complete === true && p4.delivered.get("flaky503") === 1 && p4.calls.get("down503") === 3,
    JSON.stringify(resumed.summary));

  console.log("═══ تنبيهاتٌ لا تُرسَل ═══");
  devices("inel");
  announcement(4775, "now() + interval '1 hour', null");
  announcement(4776, "now() - interval '2 hours', now() - interval '1 minute'");
  announcement(4777, "now() - interval '1 minute', null", 9772);
  const p5 = pushService();
  const r5 = await Promise.all([4775, 4776, 4777, 4799].map((id) => invoke(id, W(1), p5)));
  check("future / expired / wrong season / missing → not eligible, nothing sent",
    r5.map((r) => r.prep.reason).join(",") === "not_due,expired,wrong_season,not_found" && p5.calls.size === 0,
    r5.map((r) => r.prep.reason).join(","));
} finally {
  cleanup();
}

console.log(`\npass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
