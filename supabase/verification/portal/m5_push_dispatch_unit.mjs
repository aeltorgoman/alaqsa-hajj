// ════════════════════════════════════════════════════════════
// بوابة الحاجّ — M5: push-dispatch بلا قاعدةٍ ولا شبكة (handler.ts · deliver.ts)
//
//   node --experimental-strip-types supabase/verification/portal/m5_push_dispatch_unit.mjs
//   WEB_PUSH_MODULE=/path/to/node_modules/web-push …   ← يُضيف فحصَ topic بمكتبة web-push@3.6.7 نفسها
//
//   المصادقة قبل كلّ شيء: غيابُ الضبط أو فسادُه ← 503 · غيابُ المفتاح، أو مفتاحٌ آخر، أو مفتاحُ
//   default، أو JWT، أو المفتاحُ في Authorization، أو بادئته، أو بفراغ ← 401 — ولا نداءَ لأيّ dep
//   ولا مفتاحَ في ردٍّ ولا سجلّ · الجسم · probe لا يسلّم · dispatch بلا عقدٍ ← 409 بلا تسليم
//   · الميزانية · فشلُ تنبيهٍ لا يوقف الباقي ولا يبقي العقد · الحمولة كما في send-pilgrim-push
//   · topic ann-<id> صالحٌ لـweb-push · التسليمُ لا يرسل غيرَ المستحقّ
// ════════════════════════════════════════════════════════════
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.join(here, "../../functions/push-dispatch");
const H = await import(path.join(fnDir, "handler.ts"));
const D = await import(path.join(fnDir, "deliver.ts"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS — ${name}`); } else { fail++; console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`); }
};

/* مفاتيحُ مُصطنَعة تُبنى بالوصل، فلا يبدو سطرٌ في المستودع مفتاحاً حقيقيّاً */
const SB = "sb_" + "secret_";
const KEY = SB + "unitTEST_push_dispatch_0123456789abcdef";
const OTHER = SB + "unitTEST_default_key_0123456789abcdef";
const ENV = JSON.stringify({ default: OTHER, push_dispatch: KEY });
const RUN = "4b0b6a7e-2f7e-4a43-9a51-6f2b0d1e9c11";

/* deps تسجّل كلَّ نداء — المصادقةُ الفاشلة يجب ألّا تبلغ أيّاً منها */
function spyDeps(over = {}) {
  const calls = [];
  const logs = [];
  let t = 0;
  const deps = {
    secretKeysEnv: ENV,
    configured: () => { calls.push("configured"); return true; },
    dueIds: async (n) => { calls.push(`due:${n}`); return [11, 12]; },
    begin: async (r) => { calls.push(`begin:${r}`); return true; },
    end: async (r, res) => { calls.push(`end:${r}:${JSON.stringify(res)}`); },
    deliver: async (id, budget) => { calls.push(`deliver:${id}:${budget}`); return { status: "delivered", claimed: 2, stale: 0, pending: 0, complete: true }; },
    now: () => t,
    log: (e, d) => logs.push(`${e} ${JSON.stringify(d)}`),
    ...over,
  };
  return { deps, calls, logs, advance: (ms) => { t += ms; } };
}
const req = (body, headers = {}, method = "POST") =>
  new Request("https://x.invalid/functions/v1/push-dispatch", {
    method, headers: { "Content-Type": "application/json", ...headers },
    body: method === "GET" ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
  });
const probe = { mode: "probe" };
const dispatch = { mode: "dispatch", run_id: RUN };

async function rejected(name, request, env, wantStatus) {
  const s = spyDeps(env === undefined ? {} : { secretKeysEnv: env });
  const res = await H.handle(request, s.deps);
  const text = await res.text();
  const leaked = [KEY, OTHER].some((k) => text.includes(k) || s.logs.some((l) => l.includes(k)));
  check(`${name} → ${wantStatus}, no dependency reached, no key echoed`,
    res.status === wantStatus && s.calls.length === 0 && !leaked,
    `status ${res.status} calls ${JSON.stringify(s.calls)} leaked ${leaked}`);
}

console.log("═══ المصادقة: قبل أيّ عمل ═══");
await rejected("GET", req(null, { apikey: KEY }, "GET"), undefined, 405);
await rejected("SUPABASE_SECRET_KEYS absent", req(probe, { apikey: KEY }), "", 503);
await rejected("SUPABASE_SECRET_KEYS not JSON", req(probe, { apikey: KEY }), "{not json", 503);
await rejected("SUPABASE_SECRET_KEYS an array", req(probe, { apikey: KEY }), JSON.stringify([KEY]), 503);
await rejected("named key push_dispatch absent (only default)", req(probe, { apikey: OTHER }), JSON.stringify({ default: OTHER }), 503);
await rejected("named key not sb_secret_", req(probe, { apikey: "eyJhbGciOi.legacy.jwt" }), JSON.stringify({ push_dispatch: "eyJhbGciOi.legacy.jwt" }), 503);
await rejected("named key too short", req(probe, { apikey: SB + "x" }), JSON.stringify({ push_dispatch: SB + "x" }), 503);
await rejected("no apikey header", req(probe), undefined, 401);
await rejected("empty apikey header", req(probe, { apikey: "" }), undefined, 401);
await rejected("wrong key", req(probe, { apikey: SB + "wrong_0123456789abcdef0123456789" }), undefined, 401);
await rejected("the project's default secret key (wrong scope)", req(probe, { apikey: OTHER }), undefined, 401);
await rejected("a legacy service_role-style JWT", req(probe, { apikey: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig" }), undefined, 401);
await rejected("the right key on Authorization: Bearer only", req(probe, { Authorization: `Bearer ${KEY}` }), undefined, 401);
await rejected("a prefix of the right key", req(probe, { apikey: KEY.slice(0, -1) }), undefined, 401);
await rejected("the right key plus a suffix", req(probe, { apikey: KEY + "x" }), undefined, 401);
await rejected("dispatch without a key", req(dispatch), undefined, 401);
check("expectedKey reads push_dispatch by name only",
  H.expectedKey(ENV) === KEY && H.expectedKey(JSON.stringify({ default: KEY })) === null && H.expectedKey(undefined) === null);
check("sameKey: equal → true; any difference → false",
  (await H.sameKey(KEY, KEY)) && !(await H.sameKey(KEY, OTHER)) && !(await H.sameKey("", KEY)));

console.log("═══ الطلب بعد المصادقة ═══");
for (const [name, body] of [["not JSON", "{"], ["unknown mode", { mode: "send" }], ["dispatch without run_id", { mode: "dispatch" }],
  ["dispatch with a non-uuid run_id", { mode: "dispatch", run_id: "1; drop" }], ["body over 1 KiB", { mode: "probe", pad: "x".repeat(2000) }]]) {
  const s = spyDeps();
  const res = await H.handle(req(body, { apikey: KEY }), s.deps);
  check(`${name} → 400, nothing called`, res.status === 400 && s.calls.length === 0, `${res.status} ${JSON.stringify(s.calls)}`);
}

{
  const s = spyDeps();
  const res = await H.handle(req(probe, { apikey: KEY }), s.deps);
  const body = await res.json();
  check("probe → 200 with a count only", res.status === 200 && body.mode === "probe" && body.due === 2 && Object.keys(body).length === 3, JSON.stringify(body));
  check("probe never begins, delivers or ends a run", s.calls.length === 1 && s.calls[0] === "due:5", JSON.stringify(s.calls));
}
{
  const s = spyDeps({ dueIds: async () => { throw new Error("push_due_announcements: 42501"); } });
  const res = await H.handle(req(probe, { apikey: KEY }), s.deps);
  const text = await res.text();
  check("probe on a database error → 500 without detail", res.status === 500 && !text.includes("42501"), text);
}
{
  const s = spyDeps({ begin: async (r) => { s.calls.push(`begin:${r}`); return false; } });
  const res = await H.handle(req(dispatch, { apikey: KEY }), s.deps);
  check("dispatch without a live lease → 409, nothing delivered, lease not touched",
    res.status === 409 && !s.calls.some((c) => c.startsWith("deliver") || c.startsWith("end") || c.startsWith("due")), JSON.stringify(s.calls));
}
{
  const s = spyDeps({ configured: () => false });
  const res = await H.handle(req(dispatch, { apikey: KEY }), s.deps);
  check("dispatch with VAPID/DB unconfigured → 503; releases its own lease; no begin, no delivery",
    res.status === 503 && s.calls.length === 1 && s.calls[0].startsWith(`end:${RUN}:`), JSON.stringify(s.calls));
}

console.log("═══ التسليم: ميزانيةٌ وعقد ═══");
{
  const s = spyDeps();
  const res = await H.handle(req(dispatch, { apikey: KEY }), s.deps);
  const body = await res.json();
  const delivers = s.calls.filter((c) => c.startsWith("deliver:"));
  check("dispatch → begin once, then every due id, then end once",
    res.status === 200 && s.calls[1] === `begin:${RUN}` && delivers.length === 2
    && s.calls.filter((c) => c.startsWith("end:")).length === 1 && s.calls.at(-1).startsWith(`end:${RUN}:`), JSON.stringify(s.calls));
  check("per-announcement budget ≤ 85 s", delivers.every((c) => Number(c.split(":")[2]) <= 85000), JSON.stringify(delivers));
  check("response and run record are counts only",
    body.delivered === 2 && body.claimed === 4 && body.errors === 0 && !JSON.stringify(body).includes("sb_secret"), JSON.stringify(body));
}
{
  const s = spyDeps({
    dueIds: async () => [1, 2, 3, 4, 5],
    deliver: async (id, budget) => { s.calls.push(`deliver:${id}:${budget}`); s.advance(budget); return { status: "delivered", claimed: 1, stale: 0, pending: 0, complete: true }; },
  });
  const res = await H.handle(req(dispatch, { apikey: KEY }), s.deps);
  const body = await res.json();
  const used = s.calls.filter((c) => c.startsWith("deliver:")).reduce((n, c) => n + Number(c.split(":")[2]), 0);
  check("the whole run stays inside 100 s (less than the 150 s request and 180 s lease)",
    used <= H.TOTAL_BUDGET_MS - H.RESERVE_MS, String(used));
  check("ids that no longer fit are skipped, not started, and the lease is still released",
    body.skipped >= 1 && body.delivered + body.skipped === 5 && s.calls.at(-1).startsWith(`end:${RUN}:`), JSON.stringify(body));
}
{
  const s = spyDeps({
    dueIds: async () => [1, 2, 3],
    deliver: async (id) => { s.calls.push(`deliver:${id}`); if (id === 2) throw new Error("push_claim_targets: https://fcm.example/secret-endpoint"); return { status: id === 3 ? "ineligible" : "delivered", reason: "expired", claimed: 1, stale: 0, pending: 0, complete: true }; },
  });
  const res = await H.handle(req(dispatch, { apikey: KEY }), s.deps);
  const text = await res.text();
  const body = JSON.parse(text);
  check("one failing announcement does not stop the others", body.delivered === 1 && body.errors === 1 && body.ineligible === 1, text);
  check("the failure's message reaches neither the response nor the log",
    !text.includes("fcm.example") && !s.logs.some((l) => l.includes("fcm.example")), text);
  check("lease released after a failure", s.calls.at(-1).startsWith(`end:${RUN}:`));
}
{
  const s = spyDeps({ end: async () => { throw new Error("end failed"); } });
  const res = await H.handle(req(dispatch, { apikey: KEY }), s.deps);
  check("an end() failure still answers 200 (the lease expires on its own)", res.status === 200);
}
{
  const s = spyDeps({ dueIds: async () => { throw new Error("db down"); } });
  const res = await H.handle(req(dispatch, { apikey: KEY }), s.deps);
  const body = await res.json();
  check("dueIds failure during dispatch → counted, lease released", body.errors === 1 && s.calls.at(-1).startsWith(`end:${RUN}:`), JSON.stringify(body));
}

console.log("═══ الحمولةُ وtopic ═══");
const ann = { id: 4242, title: null, body: "نصّ", priority: "عاجل" };
check("payload is the one send-pilgrim-push sends",
  D.buildPayload(ann) === JSON.stringify({ id: 4242, title: "حملة الأقصى", body: "نصّ", priority: "عاجل", url: "/hajj/alerts" }));
const spp = fs.readFileSync(path.join(here, "../../functions/send-pilgrim-push/index.ts"), "utf8");
check("send-pilgrim-push builds the same payload fields and options",
  spp.includes('title: ann.title || "حملة الأقصى"') && spp.includes('url: "/hajj/alerts"')
  && spp.includes("TTL: 86400") && spp.includes('ann.priority === "عاجل" ? "high" : "normal"') && spp.includes("SEND_TIMEOUT_MS = 3000"));
const o = D.buildSendOptions(ann);
check("options: TTL 86400 · urgency high for عاجل · timeout 3000 · topic ann-<id>",
  o.TTL === 86400 && o.urgency === "high" && o.timeout === 3000 && o.topic === "ann-4242" && D.buildSendOptions({ ...ann, priority: "عام" }).urgency === "normal");
check("topic within RFC 8030: ≤ 32 URL-safe base64 characters, even for the largest id",
  [1, 4242, Number.MAX_SAFE_INTEGER].every((n) => /^[A-Za-z0-9_-]{1,32}$/.test(D.topicFor(n))));
let threw = 0;
for (const bad of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 2]) { try { D.topicFor(bad); } catch { threw++; } }
check("invalid ids never produce a topic", threw === 5);

if (process.env.WEB_PUSH_MODULE) {
  const webpush = createRequire(import.meta.url)(process.env.WEB_PUSH_MODULE);
  const v = webpush.generateVAPIDKeys();
  const ok = [1, 4242, Number.MAX_SAFE_INTEGER].every((n) => {
    const d = webpush.generateRequestDetails({ endpoint: "https://push.example/x", keys: { p256dh: "", auth: "" } }, null,
      { ...D.buildSendOptions({ ...ann, id: n }), vapidDetails: { subject: "mailto:test@example.invalid", publicKey: v.publicKey, privateKey: v.privateKey } });
    return d.headers.Topic === `ann-${n}` && d.headers.Urgency === "high" && d.headers.TTL === 86400;
  });
  check("web-push@3.6.7 accepts the options and sends header Topic: ann-<id>", ok);
} else {
  console.log("SKIP — WEB_PUSH_MODULE not set (web-push topic acceptance)");
}

console.log("═══ deliverAnnouncement ═══");
function fakeDeliver(prep, claims) {
  const log = [];
  let batches = [...claims];
  return {
    log,
    deps: {
      rpc: async (fn, args) => {
        log.push(fn);
        if (fn === "push_prepare_announcement") return prep;
        if (fn === "push_claim_targets") return batches.shift() ?? [];
        if (fn === "push_complete_target") return "sent";
        if (fn === "push_delivery_summary") return { total: 1, sent: 1, failed: 0, expired: 0, disabled: 0, pending: 0, complete: true, next_attempt_in_ms: null };
        throw new Error(fn);
      },
      readAnnouncement: async (id) => ({ id, title: "t", body: "b", priority: "عام" }),
      send: async (t, payload, options) => { log.push(`send:${t.target_id}:${options.topic}:${JSON.parse(payload).id}`); },
      worker: "00000000-0000-4000-8000-000000000001",
      now: () => 0,
      sleep: async () => {},
    },
  };
}
for (const reason of ["not_due", "expired", "wrong_season", "not_found"]) {
  const f = fakeDeliver({ eligible: false, reason }, [[{ target_id: 1, attempt: 1, endpoint: "e", p256dh: "k", auth: "a" }]]);
  const out = await D.deliverAnnouncement(77, 10000, f.deps);
  check(`ineligible (${reason}) → nothing claimed, nothing sent`,
    out.status === "ineligible" && out.reason === reason && f.log.join() === "push_prepare_announcement", f.log.join());
}
{
  const f = fakeDeliver({ eligible: true, prepared: true }, [[{ target_id: 1, attempt: 1, endpoint: "e", p256dh: "k", auth: "a" }]]);
  const out = await D.deliverAnnouncement(77, 10000, f.deps);
  check("eligible → M6 loop: prepare, claim, send with topic ann-77, complete, summary",
    out.status === "delivered" && out.claimed === 1 && f.log.includes("send:1:ann-77:77") && f.log.includes("push_complete_target"), f.log.join());
}
{
  const f = fakeDeliver({ eligible: true, prepared: false }, [[{ target_id: 5, attempt: 2, endpoint: "e", p256dh: "k", auth: "a" }]]);
  const out = await D.deliverAnnouncement(78, 10000, f.deps);
  check("already prepared (resume) → claims what M6 hands out, prepares nothing new",
    out.status === "delivered" && f.log.filter((x) => x === "push_prepare_announcement").length === 1 && f.log.includes("send:5:ann-78:78"), f.log.join());
}

console.log(`\nالنتيجة: ${pass} نجح · ${fail} أخفق`);
process.exit(fail ? 1 : 0);
