#!/usr/bin/env node
// ============================================================
// تحقّقُ الواجهة — Polls Phase 3: إدارةُ الاستطلاعات في «بوابة الحاج»
// ============================================================
/* يشغّل التطبيقَ (Vite) بعنوان Supabase وهميّ ويعترض كلَّ طلبٍ إليه بخادمٍ اصطناعيٍّ يحاكي عقدَ
   دوالّ Phase 2 (حالاتٌ وانتقالاتٌ وردود) — لا قاعدةَ ولا شبكةَ ولا بياناتٍ حقيقيّة. والقاعدةُ نفسُها
   يختبرها `supabase/verification/portal/polls_phase2_tests.sh` (158/0).
   الحمولةُ المرسَلة من النموذج المضمَّن الفعليّ هي موضعُ الفحص.
   node scripts/ui-verify/polls-admin.mjs [--out DIR] [--port 5183] */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg("--out", join(ROOT, ".print-verify-flow/polls-admin")));
const PORT = +arg("--port", "5183");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const MOCK = "https://mock.supabase.test";
const APP = `http://localhost:${PORT}`;
const vite = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: "mock-anon-key" }, stdio: "ignore" });

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) { pass++; console.log(`PASS — ${name}`); } else { fail++; console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`); } };

const UID = "00000000-0000-4000-8000-000000000001";
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "staff@test.local", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "mock.jwt.token", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "mock-refresh", user };
const perms = { manage_portal: true, manage_passengers: true, view_reports: true };
const season = { id: 1, name: "موسم ١٤٤٧", hijri_year: 1447, created_at: "2026-01-01", closed_at: null, closed_by: null, is_active: true };
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/* خادمٌ اصطناعيّ بعقد Phase 2: الحالاتُ والانتقالاتُ والردودُ كما في الترحيلة */
function backend({ deny = false } = {}) {
  let next = 10;
  const polls = [], options = [], calls = [], writes = [];
  const poll = (id, status, extra = {}) => ({ id, season_id: 1, title: `استطلاع ${id}`, body: null, kind: "single", max_choices: null, audience: { all: true },
    status, publish_at: null, published_at: null, audience_frozen_at: null, closes_at: null, closed_at: null, close_reason: null,
    allow_answer_changes: true, created_by: null, created_at: iso(-id * 60000), updated_by: null, updated_at: iso(-id * 60000), ...extra });
  const addOpts = (pid, labels) => labels.forEach((l, i) => options.push({ id: pid * 100 + i, poll_id: pid, label: l, sort_order: i + 1 }));
  polls.push(poll(1, "published", { published_at: iso(-3600000), audience_frozen_at: iso(-3600000), publish_at: iso(-3600000), title: "منشور: موعد زيارة المدينة", audience: { hotel: [1] }, allow_answer_changes: false }));
  addOpts(1, ["صباحاً", "مساءً"]);
  polls.push(poll(2, "closed", { published_at: iso(-86400000), audience_frozen_at: iso(-86400000), publish_at: iso(-86400000), closed_at: iso(-3600000), close_reason: "manual", title: "مغلق: تقييم الخدمة" }));
  addOpts(2, ["ممتاز", "جيد"]);
  polls.push(poll(3, "scheduled", { publish_at: iso(86400000), title: "مجدول: اختيار الوجبة" }));
  addOpts(3, ["لحم", "دجاج"]);
  polls.push(poll(4, "draft", { title: "مسودة: وقت الحافلة" }));
  addOpts(4, ["٥ صباحاً", "٦ صباحاً"]);
  const denied = { code: "42501", message: "لا تملك صلاحية إدارة بوابة الحاج.", details: null, hint: null };
  const fns = {
    create_poll: (b) => { const id = next++; polls.unshift(poll(id, "draft", { title: b.p_title, body: b.p_body, kind: b.p_kind, max_choices: b.p_max_choices, audience: b.p_audience, closes_at: b.p_closes_at, allow_answer_changes: b.p_allow_answer_changes, created_at: new Date().toISOString() })); addOpts(id, b.p_options); return id; },
    update_poll: (b) => { const p = polls.find(x => x.id === b.p_poll_id); if (!p || !["draft", "scheduled"].includes(p.status)) return { error: { code: "22023", message: "نُشر الاستطلاع: لا يُعدَّل سؤالُه ولا خياراتُه ولا جمهورُه." } };
      Object.assign(p, { title: b.p_title, body: b.p_body, kind: b.p_kind, max_choices: b.p_max_choices, audience: b.p_audience, closes_at: b.p_closes_at, allow_answer_changes: b.p_allow_answer_changes });
      for (let i = options.length - 1; i >= 0; i--) if (options[i].poll_id === p.id) options.splice(i, 1); addOpts(p.id, b.p_options); return null; },
    publish_poll: (b) => { const p = polls.find(x => x.id === b.p_poll_id); if (!p || !["draft", "scheduled"].includes(p.status)) return { error: { code: "22023", message: "الاستطلاعُ منشورٌ أو مغلقٌ بالفعل." } };
      if (b.p_publish_at && Date.parse(b.p_publish_at) > Date.now()) { Object.assign(p, { status: "scheduled", publish_at: b.p_publish_at }); return { id: p.id, status: "scheduled", publish_at: b.p_publish_at }; }
      Object.assign(p, { status: "published", published_at: new Date().toISOString(), audience_frozen_at: new Date().toISOString(), publish_at: new Date().toISOString() }); return { id: p.id, status: "published", recipients: 7 }; },
    unschedule_poll: (b) => { const p = polls.find(x => x.id === b.p_poll_id); if (p?.status !== "scheduled") return { error: { code: "22023", message: "الاستطلاعُ ليس مجدوَلاً." } }; Object.assign(p, { status: "draft", publish_at: null }); return null; },
    close_poll: (b) => { const p = polls.find(x => x.id === b.p_poll_id); if (p?.status !== "published") return { error: { code: "22023", message: "لا يُغلق إلا استطلاعٌ منشور." } }; Object.assign(p, { status: "closed", closed_at: new Date().toISOString(), close_reason: "manual" }); return { id: p.id, status: "closed", audience: 8, respondents: 5, checksum: "x" }; },
    delete_poll: (b) => { const i = polls.findIndex(x => x.id === b.p_poll_id); if (i < 0 || !["draft", "scheduled"].includes(polls[i].status)) return { error: { code: "22023", message: "لا يُحذف استطلاعٌ نُشر؛ يُغلق." } }; polls.splice(i, 1); return true; },
    poll_results: (b) => ({ poll_id: b.p_poll_id, status: "published", source: "live", totals: { audience: 8, respondents: 6, options: [] } }),
    get_poll_snapshot: (b) => ({ poll_id: b.p_poll_id, totals: { audience: 10, respondents: 9, options: [] }, checksum_valid: true }),
    announcement_audience_preview: (b) => (b.p_audience?.all ? [1, 2, 3, 4, 5] : [1, 2]).map(passenger_id => ({ passenger_id })),
    push_enabled_passengers: () => [],
  };
  const tables = {
    user_profiles: [{ id: UID, email: user.email, name: "موظف", permissions: perms, is_active: true }], seasons: [season],
    company_config: [{ id: 1, company_name: "حملة الاختبار", primary_color: "#6B1F3A", accent_color: "#085041", active_season_id: 1 }],
    buses: [{ id: 1, name: "باص ١", season_id: 1 }, { id: 2, name: "باص ٢", season_id: 1 }],
    camps: [{ id: 1, name: "مخيم أ", page_type: "منى", type: "عادي", gender: "ذكر", season_id: 1 }, { id: 2, name: "مخيم ب", page_type: "عرفة", type: "عادي", gender: "أنثى", season_id: 1 }],
    hotels: [{ id: 1, name: "فندق النور", season_id: 1 }, { id: 2, name: "فندق السلام", season_id: 1 }],
    flights: [{ id: 1, name: "QR100", type: "ذهاب", date: "2027-05-01", season_id: 1 }],
    passengers: [{ id: 11, name_ar: "أحمد محمود", short_ar: "أحمد", passenger_type: "حاج", passport: "P111", national_id: null, season_id: 1 }],
    announcements: [], notification_deliveries: [], polls, poll_options: options,
  };
  return { polls, options, calls, writes, fns, tables, deny, denied };
}

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
const filtered = (rows, url) => {
  let out = rows;
  for (const [k, v] of url.searchParams) {
    if (v.startsWith("eq.")) { const want = decodeURIComponent(v.slice(3)); out = out.filter(r => !(k in r) || String(r[k]) === want); }
    else if (v.startsWith("in.(")) { const want = v.slice(4, -1).split(","); out = out.filter(r => !(k in r) || want.includes(String(r[k]))); }
  }
  return out;
};

async function boot(browser, { viewport = { width: 1366, height: 900 }, theme = "qatar-heritage", deny = false, denyList = false } = {}) {
  const be = backend({ deny });
  const ctx = await browser.newContext({ viewport, locale: "ar" });
  await ctx.route(`${MOCK}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (path.startsWith("/auth/v1/user")) return json(route, user);
    if (path.startsWith("/auth/v1/")) return json(route, session);
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.split("/").pop(); const body = JSON.parse(req.postData() || "{}");
      be.calls.push({ fn, body });
      if (be.deny && fn !== "push_enabled_passengers" && fn !== "announcement_audience_preview") return json(route, be.denied, 403);
      const h = be.fns[fn]; if (!h) return json(route, null);
      const r = h(body);
      if (r && typeof r === "object" && "error" in r && r.error) return json(route, r.error, 400);
      return json(route, r);
    }
    if (path.startsWith("/rest/v1/")) {
      const t = path.split("/")[3];
      if (req.method() !== "GET" && req.method() !== "HEAD") be.writes.push(`${req.method()} ${t}`);
      if (denyList && (t === "polls" || t === "poll_options")) return json(route, { code: "42501", message: "permission denied" }, 403);
      const rows = filtered(be.tables[t] ?? [], url);
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-range": `0-0/${rows.length}` } });
      return single ? (rows[0] ? json(route, rows[0]) : json(route, { code: "PGRST116" }, 406)) : json(route, rows);
    }
    return json(route, {});
  });
  await ctx.addInitScript(([s, th]) => { localStorage.setItem("sb-mock-auth-token", s); localStorage.setItem("hajj_theme", th); }, [JSON.stringify(session), theme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${APP}/portal-settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "الاستطلاعات" }).first().waitFor({ timeout: 25000 });
  await page.getByRole("button", { name: "الاستطلاعات" }).first().click();
  if (!denyList) await page.locator("[data-poll-id]").first().waitFor({ timeout: 10000 });
  else await page.waitForTimeout(1200);
  return { ctx, page, be, errors, form: page.locator("[data-poll-form]") };
}
const card = (page, id) => page.locator(`[data-poll-id="${id}"]`);
const lastCall = (be, fn) => [...be.calls].reverse().find(c => c.fn === fn);
const confirm = async (page, label) => { const d = page.locator("[data-confirm-dialog]"); await d.waitFor({ timeout: 4000 }); await d.getByRole("button", { name: label, exact: true }).click(); };
const alertText = async (page) => { await page.waitForTimeout(500); return page.evaluate(() => document.body.innerText); };
async function fill(form, { title = "ما الوقت المناسب للزيارة؟", options = ["صباحاً", "مساءً"] } = {}) {
  await form.getByLabel("سؤال الاستطلاع").fill(title);
  for (let i = 0; i < options.length; i++) {
    if (i >= 2) await form.getByRole("button", { name: "+ إضافة خيار" }).click();
    await form.getByLabel(`الخيار ${i + 1}`, { exact: true }).fill(options[i]);
  }
}

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 500)); }
  const browser = await chromium.launch();

  /* ══ الإدارة: القائمةُ والدورة ══ */
  {
    const { ctx, page, be, errors, form } = await boot(browser);
    const t = (id) => card(page, id).innerText();
    check("listing: all four statuses, Arabic labels", (await t(1)).includes("منشور") && (await t(2)).includes("مغلق") && (await t(3)).includes("مجدول") && (await t(4)).includes("مسودة"));
    check("listing: published shows publication date, audience, participation (live results)", /نُشر/.test(await t(1)) && (await t(1)).includes("فندق: فندق النور") && (await t(1)).includes("6 من 8 (75٪)"));
    check("listing: closed shows its snapshot participation and close reason", (await t(2)).includes("9 من 10 (90٪)") && (await t(2)).includes("أُغلق يدوياً"));
    check("listing: scheduled shows its publication time", (await t(3)).includes("يُنشر"));
    check("listing: filter counts", (await page.getByRole("tab", { name: /^الكل/ }).innerText()).includes("(4)") && (await page.getByRole("tab", { name: /^مسودات/ }).innerText()).includes("(1)"));
    await page.screenshot({ path: join(OUT, "admin-desktop.png"), fullPage: true });

    /* ١٢ — الثباتُ بعد النشر */
    const b = async (id) => card(page, id).getByRole("button").allInnerTexts();
    check("published: «عرض النتائج» + «إغلاق الاستطلاع» only — no edit, delete or publish", JSON.stringify(await b(1)) === JSON.stringify(["عرض النتائج", "إغلاق الاستطلاع"]), JSON.stringify(await b(1)));
    check("published: question/options/audience/allow-changes shown as immutable", (await t(1)).includes("🔒 ثابت بعد النشر") && (await t(1)).includes("الإجابة الأولى نهائية") && (await t(1)).includes("صباحاً"));
    check("closed: no lifecycle actions — only «عرض النتائج» (Phase 4)", JSON.stringify(await b(2)) === JSON.stringify(["عرض النتائج"]), JSON.stringify(await b(2)));
    check("scheduled: edit · unschedule · delete (no direct publish-now)", JSON.stringify(await b(3)) === JSON.stringify(["تعديل", "إلغاء الجدولة", "حذف"]), JSON.stringify(await b(3)));
    check("draft: edit · publish · delete", JSON.stringify(await b(4)) === JSON.stringify(["تعديل", "نشر الآن", "حذف"]), JSON.stringify(await b(4)));

    /* ٣ — تحقّقُ الاختيار الواحد: لا نداءَ مع خطأ */
    const n0 = be.calls.filter(c => c.fn === "create_poll").length;
    await form.getByLabel("سؤال الاستطلاع").fill("سؤال");
    await form.getByLabel("الخيار 1", { exact: true }).fill("نعم");
    await form.getByRole("radio", { name: "مسودة (بلا نشر)" }).click();
    await form.locator("[data-poll-submit]").click();
    check("single-choice: blank option blocks submission with an Arabic message", (await form.innerText()).includes("لا يُترك خيارٌ فارغاً") && be.calls.filter(c => c.fn === "create_poll").length === n0);
    check("…and the field is marked invalid for assistive tech", (await form.getByLabel("الخيار 2", { exact: true }).getAttribute("aria-invalid")) === "true");
    await form.getByLabel("الخيار 2", { exact: true }).fill(" نعم ");
    await form.locator("[data-poll-submit]").click();
    check("single-choice: duplicate options rejected", (await form.innerText()).includes("خياران متطابقان") && be.calls.filter(c => c.fn === "create_poll").length === n0);

    /* ١ — إنشاءُ مسوّدة */
    await form.getByLabel("الخيار 2", { exact: true }).fill("لا");
    await form.locator("[data-poll-submit]").click();
    await page.waitForTimeout(700);
    const c1 = lastCall(be, "create_poll");
    check("create draft: create_poll payload from the embedded form", JSON.stringify(c1?.body) === JSON.stringify({ p_title: "سؤال", p_body: null, p_kind: "single", p_max_choices: null, p_audience: { all: true }, p_options: ["نعم", "لا"], p_closes_at: null, p_allow_answer_changes: true }), JSON.stringify(c1?.body));
    check("create draft: no publish call, success only after the backend returned the id", !be.calls.some(c => c.fn === "publish_poll") && (await alertText(page)).includes("تم حفظ الاستطلاع كمسودة"));
    const newId = be.polls[0].id;
    await card(page, newId).waitFor({ timeout: 5000 });
    check("…and the new draft appears in the list", (await card(page, newId).innerText()).includes("مسودة"));

    /* ٢ — تعديلُ مسوّدة */
    await card(page, newId).getByRole("button", { name: "تعديل" }).click();
    await page.waitForTimeout(300);
    check("edit: form opens filled with the draft", (await form.getByLabel("سؤال الاستطلاع").inputValue()) === "سؤال" && (await form.getByLabel("الخيار 2", { exact: true }).inputValue()) === "لا" && (await form.innerText()).includes("تعديل مسودة"));
    await form.getByLabel("سؤال الاستطلاع").fill("سؤال معدّل");
    await form.getByRole("switch", { name: "السماح بتغيير الإجابة" }).click();
    await form.locator("[data-poll-submit]").click();
    await page.waitForTimeout(700);
    const u1 = lastCall(be, "update_poll");
    check("edit: update_poll with the poll id, new title and allow_answer_changes=false", u1?.body.p_poll_id === newId && u1?.body.p_title === "سؤال معدّل" && u1?.body.p_allow_answer_changes === false, JSON.stringify(u1?.body));
    check("edit: success message and the form returns to «new»", (await alertText(page)).includes("تم حفظ التعديل") && (await form.innerText()).includes("استطلاع جديد"));

    /* ٤ — تحقّقُ المتعدّد */
    await fill(form, { title: "ما الأنشطة التي تفضّلها؟", options: ["زيارة", "محاضرة", "تسوق"] });
    await form.getByRole("radio", { name: "اختيار متعدد" }).click();
    await form.getByLabel("أقصى عدد للاختيارات (اختياري)").fill("5");
    await form.getByRole("radio", { name: "مسودة (بلا نشر)" }).click();
    const nc = be.calls.filter(c => c.fn === "create_poll").length;
    await form.locator("[data-poll-submit]").click();
    check("multiple-choice: max above option count rejected", (await form.innerText()).includes("الحد الأقصى للاختيارات بين ١ و3") && be.calls.filter(c => c.fn === "create_poll").length === nc);
    await form.getByLabel("أقصى عدد للاختيارات (اختياري)").fill("2");

    /* ٥ — الجمهور: اختيارُ فندقٍ يُلغي «جميع الحجاج» */
    await form.getByRole("button", { name: "الفنادق" }).click();
    await form.getByRole("button", { name: "فندق السلام" }).click();
    check("audience: picking a hotel deselects «جميع الحجاج»", !(await form.getByRole("button", { name: /جميع الحجاج/ }).innerText()).includes("✓"));
    /* ٦ — الجمعُ بين الفئات */
    await form.getByRole("button", { name: "الباصات" }).click();
    await form.getByRole("button", { name: "باص ٢" }).click();
    await form.getByRole("button", { name: "مخيمات منى" }).click();
    await form.getByRole("button", { name: /مخيم أ/ }).click();
    await form.locator("[data-poll-submit]").click();
    await page.waitForTimeout(700);
    const c2 = lastCall(be, "create_poll");
    check("multiple-choice: kind and max_choices sent", c2?.body.p_kind === "multiple" && c2?.body.p_max_choices === 2 && c2?.body.p_options.length === 3, JSON.stringify(c2?.body));
    check("combined audience: hotel + bus + Mina camp, no «all»", JSON.stringify(Object.entries(c2?.body.p_audience || {}).sort()) === JSON.stringify(Object.entries({ hotel: [2], bus: [2], camp_mina: [1] }).sort()), JSON.stringify(c2?.body.p_audience));
    /* «جميع الحجاج» يُفرغ المحدّد */
    await form.getByRole("button", { name: "الفنادق" }).click();
    await form.getByRole("button", { name: "فندق النور" }).click();
    await form.getByRole("button", { name: /جميع الحجاج/ }).click();
    check("audience: turning «جميع الحجاج» on clears specific selections", (await form.getByRole("button", { name: /جميع الحجاج/ }).innerText()).includes("✓") && (await form.getByRole("button", { name: /^الفنادق/ }).innerText()) === "الفنادق");
    check("audience: «جميع الحجاج» = pilgrims only by default (only «الحجاج» type ticked)", await form.getByLabel("الحجاج", { exact: true }).isChecked() && !(await form.getByLabel("مرافق", { exact: true }).isChecked()));

    /* ٧ — النشرُ الفوريّ: تأكيدٌ، ثم create_poll ثم publish_poll(null) */
    await fill(form, { title: "استطلاع فوري" });
    await form.getByRole("radio", { name: "الآن" }).click();
    await form.locator("[data-poll-submit]").click();
    check("publish now: asks for confirmation first, nothing sent yet", await page.locator("[data-confirm-dialog]").isVisible() && lastCall(be, "create_poll").body.p_title !== "استطلاع فوري");
    await confirm(page, "نشر");
    await page.waitForTimeout(800);
    const pub = lastCall(be, "publish_poll");
    check("publish now: create_poll then publish_poll with p_publish_at = null", lastCall(be, "create_poll").body.p_title === "استطلاع فوري" && pub?.body.p_publish_at === null, JSON.stringify(pub?.body));
    check("publish now: success text uses the backend's recipient count", (await alertText(page)).includes("تم نشر الاستطلاع إلى 7 من الحجاج"));

    /* ٨ — الجدولة */
    await fill(form, { title: "استطلاع مجدول" });
    await form.getByRole("radio", { name: "مجدول" }).click();
    const when = new Date(Date.now() + 2 * 86400000); const pad = (n) => String(n).padStart(2, "0");
    await form.getByLabel("موعد النشر").fill(`${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T09:30`);
    await form.locator("[data-poll-submit]").click();
    await page.waitForTimeout(800);
    const sch = lastCall(be, "publish_poll");
    check("schedule: publish_poll with the chosen future time (ISO)", sch?.body.p_publish_at && Date.parse(sch.body.p_publish_at) > Date.now() && lastCall(be, "create_poll").body.p_title === "استطلاع مجدول", JSON.stringify(sch?.body));
    check("schedule: success only as «تمت جدولة»", (await alertText(page)).includes("تمت جدولة الاستطلاع"));

    /* ٩ — إلغاءُ الجدولة */
    await card(page, 3).getByRole("button", { name: "إلغاء الجدولة" }).click();
    await page.waitForTimeout(800);
    check("unschedule: unschedule_poll(3) and the card becomes a draft", lastCall(be, "unschedule_poll")?.body.p_poll_id === 3 && (await card(page, 3).innerText()).includes("مسودة"));

    /* ١٠ — الإغلاق */
    await card(page, 1).getByRole("button", { name: "إغلاق الاستطلاع" }).click();
    check("close: confirmation shown before anything is sent", await page.locator("[data-confirm-dialog]").isVisible() && !be.calls.some(c => c.fn === "close_poll"));
    await confirm(page, "إغلاق");
    await page.waitForTimeout(800);
    check("close: close_poll(1), result counts reported, card shows «مغلق»", lastCall(be, "close_poll")?.body.p_poll_id === 1 && (await alertText(page)).includes("أجاب 5 من 8") && (await card(page, 1).innerText()).includes("مغلق"));

    /* ١١ — حذفُ مسوّدة، والإلغاءُ لا يحذف */
    await card(page, 4).getByRole("button", { name: "حذف" }).click();
    await page.locator("[data-confirm-dialog]").getByRole("button", { name: "إلغاء", exact: true }).click();
    check("delete: cancelling the confirmation sends nothing", !be.calls.some(c => c.fn === "delete_poll"));
    await card(page, 4).getByRole("button", { name: "حذف" }).click();
    await confirm(page, "حذف نهائي");
    await page.waitForTimeout(800);
    check("delete: delete_poll(4) and the card is gone", lastCall(be, "delete_poll")?.body.p_poll_id === 4 && (await card(page, 4).count()) === 0);

    check("no direct writes to Polls tables (RPCs only)", !be.writes.some(w => /poll/.test(w)), be.writes.join(" "));
    /* حلقةُ التركيز للوحة المفاتيح */
    await form.getByLabel("سؤال الاستطلاع").focus();
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle + " " + getComputedStyle(document.activeElement).outlineWidth);
    check("keyboard: visible focus ring on the question field", ring.startsWith("solid") && !ring.endsWith(" 0px"), ring);
    /* الانحدار: تبويبُ التنبيهات كما هو */
    await page.getByRole("button", { name: "التنبيهات", exact: true }).click();
    check("regression: announcements tab still renders its compose box", await page.getByRole("button", { name: "إرسال التنبيه" }).isVisible());
    check("no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ══ ١٢ب — فشلُ النشر بعد الحفظ: لا يُدّعى نجاح ══ */
  {
    const { ctx, page, be, form } = await boot(browser);
    be.fns.publish_poll = () => ({ error: { code: "22023", message: "موعدُ الإغلاق يجب أن يكون بعد موعد النشر." } });
    await fill(form, { title: "نشر يفشل" });
    await form.getByRole("radio", { name: "الآن" }).click();
    await form.locator("[data-poll-submit]").click();
    await confirm(page, "نشر");
    const txt = await alertText(page);
    check("publish failure after create: saved as draft, told it was NOT published, with the DB's reason", txt.includes("لم يُنشر") && txt.includes("موعدُ الإغلاق يجب") && !txt.includes("تم نشر"));
    await ctx.close();
  }

  /* ══ ١٣ — رفضُ الصلاحية ══ */
  {
    const { ctx, page, form } = await boot(browser, { deny: true });
    await fill(form, { title: "بلا صلاحية" });
    await form.getByRole("radio", { name: "مسودة (بلا نشر)" }).click();
    await form.locator("[data-poll-submit]").click();
    const txt = await alertText(page);
    check("permission denied (42501): Arabic permission message, no success shown", txt.includes("لا تملك صلاحية إدارة بوابة الحاج") && !txt.includes("تم حفظ"));
    await card(page, 4).getByRole("button", { name: "حذف" }).click();
    await confirm(page, "حذف نهائي");
    const txt2 = await alertText(page);
    check("permission denied on a lifecycle action: error shown and the item stays", txt2.includes("لا تملك صلاحية") && (await card(page, 4).count()) === 1);
    await ctx.close();
  }
  {
    const { ctx, page } = await boot(browser, { denyList: true });
    check("listing denied: explicit error state, not an empty list", (await page.evaluate(() => document.body.innerText)).includes("تعذر تحميل الاستطلاعات"));
    await ctx.close();
  }

  /* ══ السمات والاستجابة ══ */
  for (const [theme, vp, name] of [["dark-heritage", { width: 1366, height: 900 }, "dark-desktop"], ["modern-green", { width: 820, height: 1100 }, "modern-tablet"], ["royal-emerald", { width: 390, height: 844 }, "emerald-mobile"], ["qatar-heritage", { width: 360, height: 780 }, "heritage-360"]]) {
    const { ctx, page, errors } = await boot(browser, { viewport: vp, theme });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const inner = await page.evaluate(() => { const m = document.querySelector(".polls-admin"); return m ? m.scrollWidth - m.clientWidth : 0; });
    const colors = await page.evaluate(() => { const c = document.querySelector("[data-poll-id]"); const s = getComputedStyle(c); const h = getComputedStyle(c.querySelector("div[style*='font-weight: 800']") || c); return [s.backgroundColor, h.color]; });
    const rtl = await page.evaluate(() => getComputedStyle(document.querySelector(".polls-admin")).direction);
    check(`${name}: RTL, no horizontal overflow (page ${overflow}px, polls ${inner}px)`, rtl === "rtl" && overflow <= 0 && inner <= 0, `${rtl} ${overflow} ${inner}`);
    check(`${name}: card text differs from card background (theme variables applied)`, colors[0] !== colors[1], colors.join(" / "));
    check(`${name}: no page errors`, errors.length === 0, errors.join(" | "));
    await page.screenshot({ path: join(OUT, `admin-${name}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
} finally {
  vite.kill();
}
console.log(`\nresult: ${pass} passed · ${fail} failed — screenshots in ${OUT}`);
process.exit(fail ? 1 : 0);
