#!/usr/bin/env node
// ============================================================
// تحقّقُ الواجهة — Polls Phase 3: تصويتُ الحاجّ داخل تبويب التنبيهات (جوّال، RTL)
// ============================================================
/* يشغّل التطبيقَ (Vite) بعنوان Supabase وهميّ وخادمٍ اصطناعيّ يحاكي `get_pilgrim_polls` و
   `submit_pilgrim_poll_response` بعقد Phase 2: رقمُ المراجعة، والإجابةُ النهائيّة، والإغلاق، وخارجُ
   الجمهور، وحدُّ المحاولات، والجلسةُ المرفوضة (null). لا قاعدةَ ولا شبكةَ ولا بياناتٍ حقيقيّة.
   node scripts/ui-verify/polls-portal.mjs [--out DIR] [--port 5184] */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg("--out", join(ROOT, ".print-verify-flow/polls-portal")));
const PORT = +arg("--port", "5184");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const MOCK = "https://mock.supabase.test";
const APP = `http://localhost:${PORT}`;
const vite = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: "mock-anon-key" }, stdio: "ignore" });

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) { pass++; console.log(`PASS — ${name}`); } else { fail++; console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`); } };

const ann = (id, extra = {}) => ({ id, title: `تنبيه ${id}`, body: `نص التنبيه ${id}`, priority: "عام", show_at: new Date(Date.now() - id * 60000).toISOString(), pinned: false, revision: 1, state: "read", edited_at: null, ...extra });
const portal = {
  pilgrim: { name_ar: "حاج تجريبي", name_en: "Test", short_ar: "حاج", gender: "ذكر", has_photo: false, has_hajj_permit: false, has_flight_ticket: false, hotel_type: null, hotel_view: null, camp_mina: null, camp_arafa: null, phone: null },
  bus: null, room: null, accommodation: { status: "none", hotel: null, room: null, requested_hotel: null }, roommates: [], family: [], flight_go: null, flight_back: null,
  config: { name_ar: "حملة تجريبية", tagline: null, color_primary: "#5d2222", color_accent: "#B08D3C", admin_name: null, admin_phone: null, admin_whatsapp: null, portal_settings: {}, settings_stamp: "s1", country: null, city: null, assets: {} },
  season: { name: "موسم تجريبي", hijri_year: 1448, hotel_name: null, hotel_address: null, hotel_url: null, mina_address: null, mina_url: null, arafa_address: null, arafa_url: null },
  announcements: [ann(1), ann(2)], announcements_meta: { total: 2, unread: 0, has_more: false, page_size: 10 },
};
const opts = (pid, labels) => labels.map((label, i) => ({ id: pid * 10 + i + 1, label }));

/* الخادمُ الاصطناعيّ: الاستطلاعاتُ وجمهورُها وإجاباتُها كما تحفظها القاعدة */
function backend() {
  const polls = {
    1: { id: 1, title: "ما الوقت المناسب لزيارة المدينة؟", body: "اختر الوقت الأنسب لك.", kind: "single", max_choices: null, allow_answer_changes: true, open: true, closes_at: new Date(Date.now() + 3 * 86400000).toISOString(), options: opts(1, ["صباحاً", "ظهراً", "مساءً"]) },
    2: { id: 2, title: "ما الأنشطة التي تفضّلها؟", body: null, kind: "multiple", max_choices: 2, allow_answer_changes: true, open: true, closes_at: null, options: opts(2, ["زيارة المساجد", "محاضرة", "تسوق", "جولة تاريخية"]) },
    3: { id: 3, title: "هل تحتاج كرسياً متحركاً؟", body: null, kind: "single", max_choices: null, allow_answer_changes: false, open: true, closes_at: null, options: opts(3, ["نعم", "لا"]) },
    4: { id: 4, title: "تقييم خدمة الحافلات", body: null, kind: "single", max_choices: null, allow_answer_changes: true, open: false, closes_at: null, options: opts(4, ["ممتاز", "جيد"]) },
    5: { id: 5, title: "وجبة العشاء المفضّلة", body: null, kind: "single", max_choices: null, allow_answer_changes: true, open: true, closes_at: null, options: opts(5, ["لحم", "دجاج"]) },
    6: { id: 6, title: "مقاس الإحرام", body: null, kind: "single", max_choices: null, allow_answer_changes: false, open: true, closes_at: null, options: opts(6, ["متوسط", "كبير"]) },
    7: { id: 7, title: "موعد الاجتماع", body: null, kind: "single", max_choices: null, allow_answer_changes: true, open: true, closes_at: null, options: opts(7, ["الأحد", "الإثنين"]) },
    9: { id: 9, title: "استطلاعٌ لجمهورٍ آخر", body: null, kind: "single", max_choices: null, allow_answer_changes: true, open: true, closes_at: null, options: opts(9, ["أ", "ب"]) },
  };
  const audience = { tokA: [1, 2, 3, 4, 5, 6, 7], tokB: [9] };
  const responses = { 4: { revision: 1, ids: [41] } };
  const state = { delay: 0, rateLimited: false, invalid: new Set(), submits: [], bodies: [] };
  const list = (tok) => {
    const items = audience[tok].map(id => polls[id]).map(p => ({
      id: p.id, title: p.title, body: p.body, kind: p.kind, max_choices: p.max_choices, allow_answer_changes: p.allow_answer_changes,
      state: p.open ? "open" : "closed", published_at: new Date(Date.now() - 86400000).toISOString(), closes_at: p.closes_at, options: p.options,
      my_response: responses[p.id] ? { revision: responses[p.id].revision, option_ids: responses[p.id].ids } : null }));
    return { items, pending: items.filter(i => i.state === "open" && !i.my_response).length };
  };
  const submit = (b) => {
    const tok = b.p_token;
    if (state.invalid.has(tok) || !audience[tok]) return null;
    if (state.rateLimited) return { status: "rate_limited" };
    const p = polls[b.p_poll_id];
    if (!p || !audience[tok].includes(p.id)) return { status: "not_found" };
    if (!p.open) return { status: "closed" };
    const ids = [...new Set(b.p_option_ids)].sort((x, y) => x - y);
    const cur = responses[p.id];
    if (!cur) {
      if (b.p_expected_revision !== 0) return { status: "stale", revision: 0, option_ids: [] };
      responses[p.id] = { revision: 1, ids }; return { status: "ok", revision: 1, option_ids: ids };
    }
    const same = cur.ids.join() === ids.join();
    if (!p.allow_answer_changes) return { status: same ? "unchanged" : "final", revision: cur.revision, option_ids: cur.ids };
    if (b.p_expected_revision !== cur.revision) return { status: "stale", revision: cur.revision, option_ids: cur.ids };
    if (same) return { status: "unchanged", revision: cur.revision, option_ids: cur.ids };
    responses[p.id] = { revision: cur.revision + 1, ids }; return { status: "ok", revision: cur.revision + 1, option_ids: ids };
  };
  return { polls, responses, state, list, submit };
}

async function boot(browser, be, tok, { viewport = { width: 390, height: 844 } } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "ar" });
  await ctx.route(`${MOCK}/**`, async route => {
    const url = route.request().url();
    const body = (() => { try { return JSON.parse(route.request().postData() || "{}"); } catch { return {}; } })();
    const json = (d) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (url.includes("/rpc/")) be.state.bodies.push({ fn: url.split("/rpc/")[1], body });
    if (url.includes("/rpc/get_pilgrim_portal_by_session")) return json(be.state.invalid.has(body.p_token) ? null : portal);
    if (url.includes("/rpc/portal_settings_stamp")) return json("s1");
    if (url.includes("/rpc/get_pilgrim_polls")) return json(be.state.invalid.has(body.p_token) ? null : be.list(body.p_token));
    if (url.includes("/rpc/submit_pilgrim_poll_response")) {
      be.state.submits.push(body);
      if (be.state.delay) await new Promise(r => setTimeout(r, be.state.delay));
      return json(be.submit(body));
    }
    return json([]);
  });
  await ctx.addInitScript(([data, token]) => {
    if (sessionStorage.getItem("booted")) return;          // التحديثُ لا يعيد زرعَ الجلسة: يقرأ ما بقي
    sessionStorage.setItem("booted", "1");
    localStorage.setItem("portal_session", JSON.stringify({ token, idle_expires_at: "2099-01-01", absolute_expires_at: "2099-01-01" }));
    localStorage.setItem("portal_data", JSON.stringify(data));
    localStorage.setItem("portal_push_dismissed", "1");
  }, [portal, tok]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${APP}/hajj/alerts`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ann-1", { timeout: 15000 });
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const poll = (page, id) => page.locator(`#poll-${id}`);
const phase = (page, id) => poll(page, id).getAttribute("data-phase");
const msg = (page, id) => poll(page, id).locator("[data-poll-msg]").innerText().catch(() => "");
const pick = (page, id, label) => poll(page, id).locator("label", { hasText: label }).click();
const send = (page, id) => poll(page, id).getByRole("button", { name: /^(إرسال الإجابة|إرسال الإجابة النهائية|حفظ التعديل)$/ }).click();
const submitsFor = (be, id) => be.state.submits.filter(s => s.p_poll_id === id);

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 500)); }
  const browser = await chromium.launch();

  /* ══ الحاجّ أ ══ */
  {
    const be = backend();
    const { ctx, page, errors } = await boot(browser, be, "tokA");
    /* ١ — يرى استطلاعاتِه داخل التنبيهات */
    check("eligible pilgrim sees the polls inside the Alerts tab", (await page.locator("[data-portal-polls]").count()) === 1 && (await page.locator("[id^=poll-]").count()) === 7);
    check("…with three distinct states: awaiting · closed", (await phase(page, 1)) === "open-unanswered" && (await phase(page, 4)) === "closed"
      && (await poll(page, 1).locator("[data-poll-status]").innerText()) === "بانتظار إجابتك" && (await poll(page, 4).locator("[data-poll-status]").innerText()) === "مغلق");
    check("card shows closing date and whether changes are allowed", (await poll(page, 1).innerText()).includes("يُغلق في") && (await poll(page, 1).innerText()).includes("يمكنك تغيير إجابتك")
      && (await poll(page, 3).innerText()).includes("إجابتك الأولى نهائية"));
    check("Phase 4: pilgrims are told that campaign management can see their answers", (await page.locator("[data-polls-disclosure]").innerText()).includes("تطّلع إدارة الحملة على اسمك وإجابتك"));
    check("pending count in the section header", (await page.locator("[data-portal-polls] h2 + span").innerText()).includes("(6)"));
    const hc = await page.evaluate(() => { const h = document.getElementById("pp-polls-h"); let e = h; while (e && getComputedStyle(e).backgroundColor === "rgba(0, 0, 0, 0)") e = e.parentElement; return [getComputedStyle(h).color, e ? getComputedStyle(e).backgroundColor : ""]; });
    check("section heading sits on a white card (readable over the dark header edge)", hc[1] === "rgb(255, 255, 255)", hc.join(" on "));
    check("announcements still listed below the polls", (await page.locator("#ann-1").isVisible()) && (await page.locator("#ann-2").isVisible()));
    const navBtns = await page.$$eval("div[style*='position: fixed'][style*='bottom: 0'] > button", els => els.map(e => e.innerText.trim()));
    check("bottom navigation unchanged: exactly three tabs", JSON.stringify(navBtns) === JSON.stringify(["رحلتي", "سكني", "التنبيهات"]), JSON.stringify(navBtns));
    const dot = await page.$$eval("button span", els => els.filter(e => getComputedStyle(e).backgroundColor === "rgb(193, 18, 31)" && e.offsetWidth === 12).length);
    check("«new» dot on the Alerts tab while polls await an answer", dot === 1);
    check("RTL", (await page.evaluate(() => getComputedStyle(document.querySelector("[dir=rtl]")).direction)) === "rtl");
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal overflow at 390px", ov <= 0, String(ov));
    await page.screenshot({ path: join(OUT, "portal-390-unanswered.png"), fullPage: true });

    /* ٣ + ١١ — اختيارٌ واحد، وضغطتان لا ترسلان مرّتين */
    be.state.delay = 700;
    await pick(page, 1, "مساءً");
    /* ضغطتان في الإطار نفسه — قبل أن تُعرض حالةُ الانشغال، وهي الحالةُ التي يحرسها المرجع */
    await page.evaluate(() => { const b = [...document.querySelectorAll("#poll-1 button")].find(x => x.innerText.trim() === "إرسال الإجابة"); b.click(); b.click(); });
    await page.waitForTimeout(150);
    check("submitting: loading state shown and the button disabled", (await poll(page, 1).innerText()).includes("جارٍ الإرسال")
      && await poll(page, 1).getByRole("button", { name: "جارٍ الإرسال..." }).isDisabled());
    await page.waitForTimeout(1200);
    be.state.delay = 0;
    const s1 = submitsFor(be, 1);
    check("no duplicate submission on a double click", s1.length === 1, String(s1.length));
    check("single-choice: session token, poll id, one option, expected revision 0 — no pilgrim id", JSON.stringify(Object.keys(s1[0]).sort()) === JSON.stringify(["p_expected_revision", "p_option_ids", "p_poll_id", "p_token"])
      && s1[0].p_token === "tokA" && JSON.stringify(s1[0].p_option_ids) === "[13]" && s1[0].p_expected_revision === 0, JSON.stringify(s1[0]));
    check("success confirmed only after the server's ok, answer recorded", (await msg(page, 1)).includes("تم تسجيل إجابتك") && (await phase(page, 1)) === "open-answered"
      && (await poll(page, 1).locator("[data-option='13']").innerText()).includes("إجابتك"));
    await page.screenshot({ path: join(OUT, "portal-390-answered.png"), fullPage: false });

    /* ٥ — تغييرُ الإجابة مسموح: يُرسل رقمَ المراجعة المرئيّ */
    await poll(page, 1).getByRole("button", { name: "تعديل الإجابة" }).click();
    await pick(page, 1, "صباحاً");
    await send(page, 1);
    await page.waitForTimeout(500);
    check("changing an answer sends the visible revision (1) and the server's new revision is adopted", submitsFor(be, 1).at(-1).p_expected_revision === 1 && be.responses[1].revision === 2
      && (await poll(page, 1).locator("[data-option='11']").innerText()).includes("إجابتك"));

    /* ٤ — متعدّد بحدّ ٢: الثالثُ معطَّل */
    await pick(page, 2, "زيارة المساجد"); await pick(page, 2, "تسوق");
    check("multiple-choice: options beyond max_choices are disabled", await poll(page, 2).locator("[data-option='22'] input").isDisabled());
    await send(page, 2);
    await page.waitForTimeout(500);
    check("multiple-choice: two options sent and recorded", JSON.stringify(submitsFor(be, 2).at(-1).p_option_ids) === "[21,23]" && (await phase(page, 2)) === "open-answered");

    /* ٦ — التغييرُ ممنوع: الأولى نهائيّة */
    check("final poll: submit button says the answer is final", (await poll(page, 3).getByRole("button").allInnerTexts()).includes("إرسال الإجابة النهائية"));
    await pick(page, 3, "لا"); await send(page, 3);
    await page.waitForTimeout(500);
    check("final poll: recorded, shown as final, no edit button", (await phase(page, 3)) === "open-final" && (await poll(page, 3).getByRole("button").count()) === 0
      && (await poll(page, 3).locator("[data-poll-status]").innerText()).includes("إجابة نهائية"));
    /* ردُّ final من جهازٍ آخر سبق: تُعرض المسجَّلة */
    be.responses[6] = { revision: 1, ids: [62] };
    await pick(page, 6, "متوسط"); await send(page, 6);
    await page.waitForTimeout(500);
    check("«final» response: the already-recorded answer is shown, not the attempted one", (await msg(page, 6)).includes("نهائية") && (await poll(page, 6).locator("[data-option='62'] input").isChecked())
      && !(await poll(page, 6).locator("[data-option='61'] input").isChecked()) && (await phase(page, 6)) === "open-final");

    /* ٧ — مراجعةٌ قديمة من جهازٍ آخر */
    be.responses[5] = { revision: 1, ids: [52] };
    await pick(page, 5, "لحم"); await send(page, 5);
    await page.waitForTimeout(500);
    check("stale: the newer answer from the other device is shown and explained (not overwritten)", (await msg(page, 5)).includes("جهاز آخر") && be.responses[5].ids.join() === "52"
      && (await poll(page, 5).locator("[data-option='52'] input").isChecked()));
    await pick(page, 5, "لحم"); await send(page, 5);
    await page.waitForTimeout(500);
    check("stale: re-submitting uses the refreshed revision and succeeds", submitsFor(be, 5).at(-1).p_expected_revision === 1 && be.responses[5].ids.join() === "51" && (await msg(page, 5)).includes("تم تسجيل"));
    await page.screenshot({ path: join(OUT, "portal-390-stale-final.png"), fullPage: true });

    /* ٨ — مغلق: البطاقةُ المغلقة معطَّلة، وإغلاقٌ أثناء الفتح */
    check("closed poll: inputs disabled, recorded answer shown", await poll(page, 4).locator("input").first().isDisabled() && (await poll(page, 4).innerText()).includes("إجابتك"));
    be.polls[7].open = false;
    await pick(page, 7, "الأحد"); await send(page, 7);
    await page.waitForTimeout(800);
    check("closed while open on screen: «closed» explained, card refreshed to closed, nothing recorded", (await msg(page, 7)).includes("أُغلق") && (await phase(page, 7)) === "closed" && !be.responses[7]);

    /* ١٠ — حدُّ المحاولات */
    be.state.rateLimited = true;
    await poll(page, 2).getByRole("button", { name: "تعديل الإجابة" }).click();
    await pick(page, 2, "تسوق"); await pick(page, 2, "محاضرة"); await send(page, 2);
    await page.waitForTimeout(500);
    check("rate-limited: explained, previous answer kept", (await msg(page, 2)).includes("محاولات كثيرة") && be.responses[2].ids.join() === "21,23");
    be.state.rateLimited = false;

    /* ١٢ — بعد التحديث: الحالُ من القاعدة */
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#poll-1", { timeout: 15000 }); await page.waitForTimeout(600);
    check("after reload: recorded answers restored from the server", (await phase(page, 1)) === "open-answered" && (await poll(page, 1).locator("[data-option='11']").innerText()).includes("إجابتك")
      && (await phase(page, 3)) === "open-final" && (await phase(page, 7)) === "closed");
    check("no RPC call ever carried a pilgrim/passenger id", !be.state.bodies.some(b => Object.keys(b.body).some(k => /passenger|pilgrim_id/.test(k))));
    check("no page errors", errors.length === 0, errors.join(" | "));

    /* ٩ — جلسةٌ أُبطلت: سلوكُ الانتهاء القائم */
    be.state.invalid.add("tokA");
    await poll(page, 2).getByRole("button", { name: "تعديل الإجابة" }).click();
    await pick(page, 2, "تسوق"); await pick(page, 2, "محاضرة"); await send(page, 2);
    await page.waitForTimeout(900);
    check("revoked session on submit: back to the login screen, session removed from the device", (await page.locator("input[placeholder='A12345678']").count()) === 1
      && (await page.evaluate(() => localStorage.getItem("portal_session"))) === null);
    await ctx.close();
  }

  /* ══ ٩ب — الجلسةُ منتهيةٌ عند جلب الاستطلاعات ══ */
  {
    const be = backend(); be.state.invalid.add("tokX");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar" });
    await ctx.route(`${MOCK}/**`, async route => {
      const url = route.request().url(); const json = (d) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
      if (url.includes("/rpc/get_pilgrim_polls")) return json(null);
      if (url.includes("/rpc/portal_settings_stamp")) return json("s1");
      if (url.includes("/rpc/get_pilgrim_portal_by_session")) return route.fulfill({ status: 503, body: "{}" });   // عطلٌ عابر يُبقي الملف
      return json([]);
    });
    await ctx.addInitScript((data) => { localStorage.setItem("portal_session", JSON.stringify({ token: "tokX" })); localStorage.setItem("portal_data", JSON.stringify(data)); localStorage.setItem("portal_push_dismissed", "1"); }, portal);
    const page = await ctx.newPage();
    await page.goto(`${APP}/hajj/alerts`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    check("expired session reported by get_pilgrim_polls (null): login screen, no stale portal", (await page.locator("input[placeholder='A12345678']").count()) === 1);
    await ctx.close();
  }

  /* ══ ٢ — حاجٌّ خارج الجمهور ══ */
  {
    const be = backend();
    const { ctx, page, errors } = await boot(browser, be, "tokB", { viewport: { width: 360, height: 780 } });
    check("non-targeted pilgrim: other audiences' polls are not shown", (await page.locator("#poll-1").count()) === 0 && (await page.locator("#poll-9").count()) === 1);
    const r = be.submit({ p_token: "tokB", p_poll_id: 1, p_option_ids: [11], p_expected_revision: 0 });
    check("…and the contract answers not_found for a poll outside the frozen audience (mock = Phase 2 semantics)", r.status === "not_found");
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("360px: no horizontal overflow", ov <= 0, String(ov));
    check("no page errors", errors.length === 0, errors.join(" | "));
    await page.screenshot({ path: join(OUT, "portal-360-other-pilgrim.png"), fullPage: true });
    await ctx.close();
  }

  /* ══ لوحُ المفاتيح والجهازُ اللوحيّ ══ */
  {
    const be = backend();
    const { ctx, page } = await boot(browser, be, "tokA", { viewport: { width: 820, height: 1100 } });
    await poll(page, 1).locator("input").first().focus();
    await page.keyboard.press("ArrowDown");
    const ring = await page.evaluate(() => { const l = document.activeElement.closest("label"); const s = getComputedStyle(l); return `${s.outlineStyle} ${s.outlineWidth}`; });
    check("keyboard: arrow keys move between radio options, focus ring visible on the option", ring.startsWith("solid") && !ring.endsWith(" 0px"), ring);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    check("keyboard: Tab to «إرسال الإجابة» + Enter submits", submitsFor(be, 1).length === 1);
    await page.screenshot({ path: join(OUT, "portal-820-tablet.png"), fullPage: false });
    await ctx.close();
  }
  await browser.close();
} finally {
  vite.kill();
}
console.log(`\nresult: ${pass} passed · ${fail} failed — screenshots in ${OUT}`);
process.exit(fail ? 1 : 0);
