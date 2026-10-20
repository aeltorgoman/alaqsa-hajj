// ════════════════════════════════════════════════════════════
// بوابة الحاجّ — M5: المسارُ كلُّه على قاعدةٍ محلّيّة — التيكُ الحقيقيّ ← طلبُه كما سجّله
// pg_net ← handler.ts برمز push-dispatch ← deliver.ts ← حلقةُ M6 الحقيقيّة ← خدمةُ دفعٍ وهميّة.
// لا شبكةَ ولا إرسالَ حقيقيّ ولا بياناتَ حقيقيّة.
//
//   node --experimental-strip-types supabase/verification/portal/m5_push_dispatch_e2e.mjs
//   LOCAL='postgresql:///db?host=/path/to/socket&port=…&user=postgres' …
//
//   مجدوَلٌ حان يُسلَّم مرّةً، بـtopic ann-<id>، ولجمهوره المخصّص وحده · لم يحن/منتهٍ لا يُمسّ
//   · تيكٌ بعد الاكتمال idle ولا يعيد · إعادةُ الطلب نفسه 409 · طلبٌ بلا عقد 409
//   · مفتاحُ Supabase بدل الرمز 401 قبل أيّ نداءٍ للقاعدة · مُجدوِلٌ تعطّل ساعاتٍ ثم عاد: الساري يُسلَّم
//   والمنتهي لا · M6: عابرٌ يُعاد ثم يصل · عاملٌ سقط يُستردّ بالتيك التالي
//   · يدويٌّ (send-pilgrim-push) ومجدوَلٌ متزامنان: كلُّ جهازٍ مرّةً · فوريٌّ أُرسل لا يُعاد
//   · الاستردادُ اليدويّ لتنبيهٍ تحت الحدّ التاريخيّ
// ⚠️ يرفض أيَّ قاعدةٍ غيرِ محلّيّة أو فيها pg_net/Vault حقيقيّ، ويحذف ما يكتبه.
// ════════════════════════════════════════════════════════════
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const { handle } = await import(path.join(here, "../../functions/push-dispatch/handler.ts"));
const { deliverAnnouncement } = await import(path.join(here, "../../functions/push-dispatch/deliver.ts"));
const { runDelivery } = await import(path.join(here, "../../functions/send-pilgrim-push/delivery.ts"));

const LOCAL = process.env.LOCAL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@127\.0\.0\.1:|@localhost:|^postgresql:\/\/\//.test(LOCAL)) { console.log(`يرفض: ${LOCAL} ليست قاعدةً محلّيّة`); process.exit(2); }

const run = promisify(execFile);
const sqlSync = (q) => execFileSync("psql", [LOCAL, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
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

if (sqlSync("select count(*) from pg_extension where extname in ('pg_net','supabase_vault')") !== "0") { console.log("يرفض: pg_net أو Vault حقيقيّ"); process.exit(2); }
if (sqlSync("select count(*) from pg_namespace where nspname in ('net','vault')") !== "0") { console.log("يرفض: مخطّط net أو vault موجود"); process.exit(2); }
if (sqlSync("select count(*) from public.seasons where id = 9791") !== "0") { console.log("يرفض: موسمُ التهيئة موجود"); process.exit(2); }
if (sqlSync("select count(*) from public.seasons where closed_at is null") !== "0") { console.log("يرفض: في القاعدة موسمٌ مفتوح"); process.exit(2); }

/* رمزٌ عشوائيّ لكلّ تشغيل (٢٥٦ بتّاً، base64url) — لا قيمةَ ثابتةً في المستودع */
const KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
const SB_KEY = "sb_" + "secret_" + Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
const URL = "https://m5-e2e.invalid/functions/v1/push-dispatch";
const CUT0 = sqlSync("select cutoff_id from public.push_dispatch_state");

function cleanup() {
  sqlSync(`set session_replication_role = replica;
    update public.push_dispatch_state set cutoff_id = ${CUT0}, lease_run_id = null, lease_expires_at = null, lease_started = false,
           last_tick_at = null, last_tick_result = null, last_run_at = null, last_run_result = null;
    set session_replication_role = origin;
    set app.season_maintenance = 'on';
    delete from public.announcements where id between 4840 and 4879;
    delete from public.pilgrim_push_subscriptions where passenger_id between 5820 and 5839;
    delete from public.passengers where id between 5820 and 5839;
    delete from public.seasons where id = 9791;
    drop schema if exists net cascade; drop schema if exists vault cascade;`);
}

/* pg_net وVault بديلان محلّيّان: الطلبُ يُسجَّل، فيُقرأ ويُمرَّر إلى handler كما كان سيصل */
sqlSync(`create schema net; create table net.calls (id bigserial, url text, body jsonb, headers jsonb, timeout_ms int);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 2000)
  returns bigint language sql as $f$ insert into net.calls (url, body, headers, timeout_ms) values (url, body, headers, timeout_milliseconds) returning id $f$;
  create schema vault; create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  insert into vault.decrypted_secrets values ('push_dispatch_url', '${URL}'), ('push_dispatch_token', '${KEY}');`);

/* 5821 جهازان (ok + flaky) · 5822 جهاز · 5823 بلا جهاز · 5824 خارج الجمهور بجهاز */
sqlSync(`set app.season_maintenance = 'on';
  insert into public.seasons (id,name,hijri_year,closed_at) overriding system value values (9791,'موسم M5e',1481,null);
  insert into public.passengers (id,season_id,name_ar,gender,passenger_type) overriding system value
    select g, 9791, 'حاج ' || g, 'ذكر', 'حاج' from generate_series(5821, 5824) g;`);
function devices(tag) {
  sqlSync(`delete from public.pilgrim_push_subscriptions where passenger_id between 5820 and 5839;
    insert into public.pilgrim_push_subscriptions (passenger_id,endpoint,p256dh,auth) values
      (5821,'https://push.example/${tag}/ok','k','a'), (5821,'https://push.example/${tag}/flaky','k','a'),
      (5822,'https://push.example/${tag}/ok2','k','a'), (5824,'https://push.example/${tag}/outsider','k','a');`);
}
function announcement(id, show = "now() - interval '1 minute'", expires = "null") {
  sqlSync(`set app.season_maintenance = 'on';
    insert into public.announcements (id,season_id,body,target_type,target_ids,show_at,expires_at)
    overriding system value values (${id}, 9791, 'M5 e2e', 'custom', '{5821,5822,5823}', ${show}, ${expires});`);
}

/* خدمةُ دفعٍ وهميّة: كلُّ نداءٍ بعنوانه وخياراته */
function pushService({ flakyFails = 1 } = {}) {
  const sends = [];
  const seen = new Map();
  return {
    sends,
    count: (kind) => sends.filter((s) => s.kind === kind && s.ok).length,
    async send(t, payload, options) {
      const kind = t.endpoint.split("/").pop();
      const n = (seen.get(t.endpoint) ?? 0) + 1;
      seen.set(t.endpoint, n);
      await new Promise((r) => setTimeout(r, 5));
      if (kind === "flaky" && n <= flakyFails) { sends.push({ kind, ok: false, options, payload }); throw Object.assign(new Error("push"), { statusCode: 503 }); }
      sends.push({ kind, ok: true, options, payload, endpoint: t.endpoint });
    },
  };
}

/* deps الدالّة الحقيقيّة — نداءاتُ القاعدة بدور service_role كما بمفتاح الخدمة */
async function rpc(fn, args) {
  const a = Object.entries(args).map(([k, v]) => `${k} => ${v !== null && typeof v === "object" ? `${lit(JSON.stringify(v))}::jsonb` : lit(v)}`).join(", ");
  if (fn === "push_claim_targets") return JSON.parse((await svc(`select coalesce(json_agg(x), '[]') from public.${fn}(${a}) x`)) || "[]");
  const out = await svc(`select to_jsonb(public.${fn}(${a}))`);
  return out === "" ? null : JSON.parse(out);
}
function deps(push, over = {}) {
  let dbCalls = 0;
  const counted = async (fn, args) => { dbCalls++; return rpc(fn, args); };
  return {
    get dbCalls() { return dbCalls; },
    tokenEnv: KEY,
    configured: () => true,
    dueIds: (n) => counted("push_due_announcements", { p_limit: n }).then((x) => x ?? []),
    begin: (r) => counted("push_dispatch_begin", { p_run_id: r }).then((x) => x === true),
    end: (r, res) => counted("push_dispatch_end", { p_run_id: r, p_result: res }).then(() => {}),
    deliver: (id, budget) => deliverAnnouncement(id, budget, {
      rpc: counted,
      readAnnouncement: async (annId) => JSON.parse(await svc(`select to_jsonb(x) from (select id, title, body, priority, expires_at from public.announcements where id = ${annId}) x`) || "null"),
      send: push.send,
      worker: crypto.randomUUID(),
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    }),
    now: () => Date.now(),
    log: () => {},
    ...over,
  };
}
const tick = () => sqlSync("select public.push_dispatch_tick()");
const lastCall = () => JSON.parse(sqlSync("select to_jsonb(c) from net.calls c order by id desc limit 1"));
/* الطلبُ كما سجّله pg_net: ترويساتُه كلُّها كما هي، أو ترويساتٌ بديلة */
const asRequest = (call, headers = call.headers) =>
  new Request(call.url, { method: "POST", headers, body: JSON.stringify(call.body) });
/* «ما سيُرسله pg_net»: التيك ثم طلبُه المسجَّل إلى الدالّة */
async function scheduled(push, over) {
  const t = tick();
  if (t !== "dispatched") return { tick: t };
  const call = lastCall();
  const d = deps(push, over);
  const res = await handle(asRequest(call), d);
  return { tick: t, call, status: res.status, body: await res.json(), d };
}
const dstat = (a) => sqlSync(`select string_agg(passenger_id || '=' || status, ',' order by passenger_id) from public.notification_deliveries where announcement_id = ${a}`);
const lease = () => sqlSync("select coalesce(lease_run_id::text, '-') from public.push_dispatch_state");

try {
  console.log("═══ مجدوَلٌ حان: من التيك إلى الجهاز ═══");
  devices("s1"); announcement(4841); announcement(4842, "now() + interval '1 hour'"); announcement(4843, "now() - interval '2 hours'", "now() - interval '1 minute'");
  const p1 = pushService();
  const r1 = await scheduled(p1);
  check("tick → dispatched → 200", r1.tick === "dispatched" && r1.status === 200, JSON.stringify(r1.body));
  check("one announcement delivered (not the future one, not the expired one)", r1.body.due === 1 && r1.body.delivered === 1, JSON.stringify(r1.body));
  check("each in-audience device delivered once; 503 retried once then delivered",
    p1.count("ok") === 1 && p1.count("ok2") === 1 && p1.count("flaky") === 1 && p1.sends.filter((s) => s.kind === "flaky").length === 2,
    JSON.stringify(p1.sends.map((s) => `${s.kind}:${s.ok}`)));
  check("custom audience isolation: the outsider's device is never sent to", p1.sends.every((s) => s.kind !== "outsider"));
  check("every send carries topic ann-4841 and the send-pilgrim-push payload",
    p1.sends.every((s) => s.options.topic === "ann-4841" && JSON.parse(s.payload).url === "/hajj/alerts" && JSON.parse(s.payload).id === 4841));
  check("deliveries: two pilgrims sent, the deviceless one disabled", dstat(4841) === "5821=sent,5822=sent,5823=disabled", dstat(4841));
  check("push_sent_at stamped; lease released",
    sqlSync("select (push_sent_at is not null)::text from public.announcements where id = 4841") === "true" && lease() === "-");
  check("future and expired announcements untouched",
    sqlSync("select count(*) from public.announcement_push_targets where announcement_id in (4842, 4843)") === "0");

  console.log("═══ لا إعادةَ تلقائيّة ═══");
  const before = p1.sends.length;
  check("next tick after completion → idle (no request)", tick() === "idle");
  const replay = await handle(asRequest(r1.call), deps(p1));
  check("the same request replayed → 409, nothing sent", replay.status === 409 && p1.sends.length === before);
  const forged = { ...r1.call, body: { mode: "dispatch", run_id: crypto.randomUUID() } };
  const fr = await handle(asRequest(forged), deps(p1));
  check("a dispatch with a run id no tick issued → 409, nothing sent", fr.status === 409 && p1.sends.length === before);
  const wd = deps(p1);
  const wrong = await handle(asRequest(r1.call, { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }), wd);
  check("a Supabase secret key (apikey / Bearer) instead of the token → 401 before any database call", wrong.status === 401 && wd.dbCalls === 0);
  check("the scheduler's request carries the scoped token and no Supabase API key",
    r1.call.headers["x-push-dispatch-token"] === KEY && !("apikey" in r1.call.headers) && !("Authorization" in r1.call.headers));

  console.log("═══ مُجدوِلٌ تعطّل ساعاتٍ ثم عاد ═══");
  devices("late"); announcement(4848, "now() - interval '5 hours'"); announcement(4849, "now() - interval '5 hours'", "now() - interval '10 minutes'");
  const pl = pushService({ flakyFails: 0 });
  const rl = await scheduled(pl);
  check("5 hours late and still active → delivered automatically once",
    rl.tick === "dispatched" && rl.body.delivered === 1 && pl.sends.length === 3 && pl.sends.every((x) => x.options.topic === "ann-4848"),
    JSON.stringify(rl.body));
  check("no expiry → TTL 24 h", pl.sends.every((x) => x.options.TTL === 86400));
  check("5 hours late but expired → never prepared, never sent",
    sqlSync("select count(*) from public.announcement_push_targets where announcement_id = 4849") === "0" && pl.sends.every((x) => x.options.topic !== "ann-4849"));
  check("after recovery nothing is left due → idle", tick() === "idle");

  console.log("═══ TTL لا يتجاوز عمرَ التنبيه ═══");
  devices("ttl"); announcement(4850, "now() - interval '1 minute'", "now() + interval '20 minutes'");
  const pt = pushService({ flakyFails: 0 });
  const rt = await scheduled(pt);
  check("expires in 20 min → every send's TTL ≤ 1200 s (not 24 h)",
    rt.tick === "dispatched" && pt.sends.length === 3 && pt.sends.every((x) => x.options.TTL > 1100 && x.options.TTL <= 1200),
    JSON.stringify(pt.sends.map((x) => x.options.TTL)));

  console.log("═══ M6: عاملٌ سقط يستردّه التيكُ التالي ═══");
  devices("s2"); announcement(4844);
  await svc("select push_prepare_announcement(4844)");
  const grabbed = JSON.parse(await svc(`select coalesce(json_agg(x), '[]') from push_claim_targets(4844, '${crypto.randomUUID()}', 20, 60) x`));
  check("a crashed worker holds every device", grabbed.length === 3, String(grabbed.length));
  check("while its lease lives the tick finds nothing due → idle", tick() === "idle");
  sqlSync("update public.announcement_push_targets set lease_expires_at = now() - interval '1 second' where announcement_id = 4844 and status = 'processing'");
  const p2 = pushService({ flakyFails: 0 });
  const r2 = await scheduled(p2);
  check("lease expired → due → dispatched; recovered devices delivered once",
    r2.tick === "dispatched" && p2.count("ok") === 1 && p2.count("ok2") === 1 && p2.count("flaky") === 1 && p2.sends.length === 3, JSON.stringify(r2.body));
  check("the crashed claim counted as attempt 1, the recovery is attempt 2",
    sqlSync("select string_agg(distinct attempts::text, ',') from public.announcement_push_targets where announcement_id = 4844") === "2");
  check("complete and stamped", sqlSync("select (push_sent_at is not null)::text from public.announcements where id = 4844") === "true");

  console.log("═══ يدويٌّ (send-pilgrim-push) ومجدوَلٌ متزامنان ═══");
  devices("s3"); announcement(4845);
  const p3 = pushService({ flakyFails: 0 });
  const manual = async () => {
    const worker = crypto.randomUUID();
    const prep = JSON.parse(await svc("select push_prepare_announcement(4845)"));
    if (!prep.eligible) return;
    const payload = JSON.stringify({ id: 4845 });
    await runDelivery({
      claim: async (limit, l) => JSON.parse((await svc(`select coalesce(json_agg(x), '[]') from push_claim_targets(4845, '${worker}', ${limit}, ${l}) x`)) || "[]"),
      send: (t) => p3.send(t, payload, { topic: "manual" }),
      complete: async (t, r) => svc(`select push_complete_target(${t.target_id}, '${worker}', ${t.attempt}, ${lit(r.outcome)}, ${r.http ?? "null"}, ${lit(r.errorClass)})`),
      summary: async () => JSON.parse(await svc("select push_delivery_summary(4845)")),
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    }, 20000);
  };
  const [, r3] = await Promise.all([manual(), scheduled(p3)]);
  check("both paths ran", r3.tick === "dispatched", JSON.stringify(r3));
  check("every device sent exactly once across both workers",
    p3.count("ok") === 1 && p3.count("ok2") === 1 && p3.count("flaky") === 1 && p3.sends.length === 3,
    JSON.stringify(p3.sends.map((s) => s.kind)));
  check("complete and stamped once", sqlSync("select (push_sent_at is not null)::text from public.announcements where id = 4845") === "true");

  console.log("═══ فوريٌّ أُرسل يدويّاً لا يعيده المُجدوِل ═══");
  devices("s4"); announcement(4846, "now()");
  const p4 = pushService({ flakyFails: 0 });
  await (async () => {
    const worker = crypto.randomUUID();
    await svc("select push_prepare_announcement(4846)");
    await runDelivery({
      claim: async (limit, l) => JSON.parse((await svc(`select coalesce(json_agg(x), '[]') from push_claim_targets(4846, '${worker}', ${limit}, ${l}) x`)) || "[]"),
      send: (t) => p4.send(t, "{}", {}),
      complete: async (t, r) => svc(`select push_complete_target(${t.target_id}, '${worker}', ${t.attempt}, ${lit(r.outcome)}, ${r.http ?? "null"}, ${lit(r.errorClass)})`),
      summary: async () => JSON.parse(await svc("select push_delivery_summary(4846)")),
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    }, 20000);
  })();
  const sent4 = p4.sends.length;
  check("immediate push delivered by the manual path", sent4 === 3, String(sent4));
  check("the scheduler then finds nothing → idle, nothing resent", tick() === "idle" && p4.sends.length === sent4);

  console.log("═══ تحت الحدّ التاريخيّ: لا آليّ، والاستردادُ يدويّ ═══");
  devices("s5"); announcement(4847);
  sqlSync("set session_replication_role = replica; update public.push_dispatch_state set cutoff_id = 4847; set session_replication_role = origin;");
  check("historical announcement (id ≤ cutoff) → idle", tick() === "idle");
  const p5 = pushService({ flakyFails: 0 });
  const prep5 = JSON.parse(await svc("select push_prepare_announcement(4847)"));
  const w5 = crypto.randomUUID();
  await runDelivery({
    claim: async (limit, l) => JSON.parse((await svc(`select coalesce(json_agg(x), '[]') from push_claim_targets(4847, '${w5}', ${limit}, ${l}) x`)) || "[]"),
    send: (t) => p5.send(t, "{}", {}),
    complete: async (t, r) => svc(`select push_complete_target(${t.target_id}, '${w5}', ${t.attempt}, ${lit(r.outcome)}, ${r.http ?? "null"}, ${lit(r.errorClass)})`),
    summary: async () => JSON.parse(await svc("select push_delivery_summary(4847)")),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }, 20000);
  check("manual recovery (the «إرسال إلى الأجهزة» path) delivers it once",
    prep5.prepared === true && p5.sends.length === 3 && sqlSync("select (push_sent_at is not null)::text from public.announcements where id = 4847") === "true");
} catch (e) {
  fail++;
  console.log(`FAIL — unexpected: ${e?.message ?? e}`);
} finally {
  cleanup();
}

console.log(`\nالنتيجة: ${pass} نجح · ${fail} أخفق`);
process.exit(fail ? 1 : 0);
