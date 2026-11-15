#!/usr/bin/env node
// ============================================================
// تحقّقُ الواجهة — مراجعة #278: دخولان متزامنان في تبويبين، وحكمُ جهاز التنبيهات
// ============================================================
/* تبويبان في سياق متصفّحٍ واحد (localStorage مشترك)، وخادمٌ اصطناعيّ بعقد البوابة:
   `create_pilgrim_session` · `get_pilgrim_portal_by_session` · `claim_pilgrim_push_device` بدلالته في القاعدة
   (own ← يبقى · released ← يُحذف صفُّ مالكٍ آخر ولا يُربط بالطالب · none ← لا صفّ). واشتراكُ المتصفّح
   اصطناعيٌّ ومشتركٌ بين التبويبين كما في المتصفّح الحقيقيّ. لا قاعدةَ ولا شبكةَ ولا بياناتٍ حقيقيّة.
   node scripts/ui-verify/portal-concurrent-login.mjs [--port 5188] */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg("--port", "5188");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const MOCK = "https://mock.supabase.test";
const APP = `http://localhost:${PORT}`;
const vite = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: "mock-anon-key" }, stdio: "ignore" });

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) { pass++; console.log(`PASS — ${name}`); } else { fail++; console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TOK = { B: "tokB-0123456789abcdefghijklmnopqrstuvwxyz", C: "tokC-0123456789abcdefghijklmnopqrstuvwxyz" };
const DOC = { B: "B1234567", C: "C1234567" };
const NAME = { [TOK.B]: "الحاج ب", [TOK.C]: "الحاج ج" };
const ENDPOINT = "https://push.test/device-1";
const portalOf = (tok) => ({
  pilgrim: { name_ar: NAME[tok], name_en: "T", short_ar: NAME[tok], gender: "ذكر", has_photo: false, has_hajj_permit: false, has_flight_ticket: false, hotel_type: null, hotel_view: null, camp_mina: null, camp_arafa: null, phone: null },
  bus: null, room: null, accommodation: { status: "none", hotel: null, room: null, requested_hotel: null }, roommates: [], family: [], flight_go: null, flight_back: null,
  config: { name_ar: "حملة", tagline: null, color_primary: "#5d2222", color_accent: "#B08D3C", admin_name: null, admin_phone: null, admin_whatsapp: null, portal_settings: {}, settings_stamp: "s1", country: null, city: null, assets: {} },
  season: { name: "موسم", hijri_year: 1448, hotel_name: null, hotel_address: null, hotel_url: null, mina_address: null, mina_url: null, arafa_address: null, arafa_url: null },
  announcements: [{ id: tok === TOK.B ? 201 : 301, title: "تنبيه", body: `خاص بـ${NAME[tok]}`, priority: "عام", show_at: "2026-11-01T00:00:00Z", pinned: false, revision: 1, state: "read", edited_at: null }],
  announcements_meta: { total: 1, unread: 0, has_more: false, page_size: 10 },
});

/* الخادم: الجلساتُ والملفّات، وصفُّ اشتراك الجهاز (endpoint ← مالكُه) كما في `pilgrim_push_subscriptions` */
function backend({ owner = null } = {}) {
  const st = { owner, failPortal: new Set(), delayPortal: {}, delayClaim: {}, calls: [], events: [] };
  const claim = (tok, endpoint) => {
    if (endpoint !== ENDPOINT || !st.owner) return "none";
    if (st.owner === tok) return "own";
    st.owner = null; return "released";       // يُحذف صفُّ المالك الآخر — ولا يُربط بالطالب أبداً
  };
  return { st, claim };
}

async function context(browser, be, { subscribed }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: "ar" });
  await ctx.route(`${MOCK}/**`, async route => {
    const url = route.request().url();
    const body = (() => { try { return JSON.parse(route.request().postData() || "{}"); } catch { return {}; } })();
    const json = (d) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    const fn = url.includes("/rpc/") ? url.split("/rpc/")[1].split("?")[0] : "";
    if (fn) be.st.calls.push({ fn, tok: body.p_token, at: Date.now() });
    if (fn === "create_pilgrim_session") {
      const tok = body.p_doc === DOC.B ? TOK.B : body.p_doc === DOC.C ? TOK.C : null;
      return json(tok ? { token: tok, idle_expires_at: "2099-01-01", absolute_expires_at: "2099-01-01" } : null);
    }
    if (fn === "get_pilgrim_portal_by_session") {
      const t = body.p_token; const d = be.st.delayPortal[t] || 0; if (d) await sleep(d);
      return json(NAME[t] && !be.st.failPortal.has(t) ? portalOf(t) : null);
    }
    if (fn === "claim_pilgrim_push_device") {
      const t = body.p_token; const d = be.st.delayClaim[t] || 0; if (d) await sleep(d);
      const v = be.claim(t, body.p_endpoint);                       // يُطبَّق لحظةَ يكتمل على الخادم
      be.st.events.push({ at: Date.now(), e: `claim:${t.slice(3, 4)}:${v}` });
      return json(v);
    }
    if (fn === "release_pilgrim_session") {                         // الخروج: إبطالُ الجلسة وفكُّ هذا الجهاز وحده
      if (body.p_endpoint === ENDPOINT) be.st.owner = null;
      be.st.events.push({ at: Date.now(), e: "release" });
      return json(true);
    }
    if (fn === "portal_settings_stamp") return json("s1");
    if (fn === "get_pilgrim_polls") return json({ items: [], pending: 0 });
    return json(null);
  });
  /* اشتراكُ المتصفّح الاصطناعيّ: واحدٌ للجهاز، مشتركٌ بين التبويبات (كما pushManager الحقيقيّ) */
  await ctx.addInitScript(([endpoint, sub]) => {
    if (!sessionStorage.getItem("booted")) {
      sessionStorage.setItem("booted", "1");
      if (localStorage.getItem("__fake_sub") === null) localStorage.setItem("__fake_sub", sub ? "1" : "0");
      localStorage.setItem("portal_push_dismissed", "1");
    }
    const subscription = {
      endpoint,
      unsubscribe: async () => {
        localStorage.setItem("__fake_sub", "0");
        const ev = JSON.parse(localStorage.getItem("__events") || "[]"); ev.push({ at: Date.now(), e: "unsubscribe" });
        localStorage.setItem("__events", JSON.stringify(ev));
        return true;
      },
      toJSON: () => ({ endpoint, keys: {} }),
    };
    const reg = { pushManager: { getSubscription: async () => (localStorage.getItem("__fake_sub") === "1" ? subscription : null), subscribe: async () => subscription } };
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration = async () => reg;
      navigator.serviceWorker.register = async () => reg;
    }
  }, [ENDPOINT, subscribed]);
  return ctx;
}
async function openTab(ctx) {
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${APP}/hajj`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[placeholder=A12345678]", { timeout: 15000 });
  return { page, errors };
}
async function submitLogin(page, doc) {
  await page.fill("input[placeholder=A12345678]", doc);
  const sel = page.locator("select");
  await sel.nth(0).selectOption("5"); await sel.nth(1).selectOption("6"); await sel.nth(2).selectOption({ index: 10 });
  await page.click("text=دخول إلى رحلتي");
}
const stored = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("portal_session") || "null")?.token ?? null; } catch { return null; } });
const shows = async (page, tok) => (await page.locator("body").innerText()).includes(NAME[tok]);
const onLogin = async (page) => (await page.locator("input[placeholder=A12345678]").count()) === 1;
const events = async (page, be) => [...(await page.evaluate(() => JSON.parse(localStorage.getItem("__events") || "[]"))), ...be.st.events].sort((a, b) => a.at - b.at).map(x => x.e);

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch { /* starting */ } await sleep(500); }
  const browser = await chromium.launch();

  /* ══ L1 — دخولان متزامنان، يفشل أحدهما: فشلُ «ب» لا يمسح جلسةَ «ج» ══ */
  {
    const be = backend();
    be.st.failPortal.add(TOK.B); be.st.delayPortal[TOK.B] = 2500;      // جلسةُ «ب» صدرت، وملفُّه يفشل متأخّراً
    const ctx = await context(browser, be, { subscribed: false });
    const t1 = await openTab(ctx), t2 = await openTab(ctx);
    await submitLogin(t1.page, DOC.B);                                    // تبويب ١: «ب» (بطيء، سيفشل)
    await t1.page.waitForTimeout(300);
    await submitLogin(t2.page, DOC.C);                                    // تبويب ٢: «ج» (ينجح فوراً)
    await t2.page.waitForSelector(`text=${NAME[TOK.C]}`, { timeout: 8000 });
    await sleep(3500);                                                    // فشل «ب» الآن
    check("L1 the stored session is still C after B's login failed", (await stored(t2.page)) === TOK.C, String(await stored(t2.page))?.slice(0, 4));
    check("L1 tab 2 (C) is still signed in", (await shows(t2.page, TOK.C)) && !(await onLogin(t2.page)));
    check("L1 tab 1 never shows B", !(await shows(t1.page, TOK.B)));
    check("L1 tab 1 does not wipe C (it follows C or stays on login)", (await shows(t1.page, TOK.C)) || (await onLogin(t1.page)));
    check("L1 no page errors", t1.errors.length + t2.errors.length === 0, [...t1.errors, ...t2.errors].join(" | "));
    await ctx.close();
  }

  /* ══ L2 — دخولان ناجحان متزامنان: «ب» البطيء لا يحكم على الجهاز بعد أن صار لـ«ج» ══ */
  {
    const be = backend({ owner: TOK.C });                                 // الجهازُ مشتركٌ سابقاً لـ«ج»
    be.st.delayPortal[TOK.B] = 2500;
    const ctx = await context(browser, be, { subscribed: true });
    const t1 = await openTab(ctx), t2 = await openTab(ctx);
    await submitLogin(t1.page, DOC.B);
    await t1.page.waitForTimeout(300);
    await submitLogin(t2.page, DOC.C);
    await t2.page.waitForSelector(`text=${NAME[TOK.C]}`, { timeout: 8000 });
    const cDone = Date.now();
    await sleep(3500);
    const lateB = be.st.calls.filter(c => c.tok === TOK.B && c.at > cDone);
    check("L2 the stored session is the newer one (C)", (await stored(t1.page)) === TOK.C);
    check("L2 tab 1 does not show B over C's stored session", !(await shows(t1.page, TOK.B)));
    check("L2 both tabs show C (no mixed state)", (await shows(t1.page, TOK.C)) && (await shows(t2.page, TOK.C)));
    check("L2 B's delayed login sends no device claim", !be.st.calls.some(c => c.fn === "claim_pilgrim_push_device" && c.tok === TOK.B));
    check("L2 C's device binding is kept on the server", be.st.owner === TOK.C, String(be.st.owner).slice(0, 4));
    check("L2 the browser subscription (now C's) is not cancelled", await t1.page.evaluate(() => localStorage.getItem("__fake_sub") === "1"));
    check("L2 no request with B's token after C's login completed", lateB.length === 0, JSON.stringify(lateB.map(c => c.fn)));
    check("L2 no page errors", t1.errors.length + t2.errors.length === 0, [...t1.errors, ...t2.errors].join(" | "));
    await ctx.close();
  }

  /* ══ L3 — حكمُ «ب» أُرسل ثمّ تبدّلت الجلسة قبل عودته ══ */
  {
    const be = backend({ owner: TOK.C });
    be.st.delayClaim[TOK.B] = 2500;                                       // حكمُ «ب» يكتمل على الخادم متأخّراً
    const ctx = await context(browser, be, { subscribed: true });
    const t1 = await openTab(ctx), t2 = await openTab(ctx);
    await submitLogin(t1.page, DOC.B);
    for (let i = 0; i < 40 && !be.st.calls.some(c => c.fn === "claim_pilgrim_push_device" && c.tok === TOK.B); i++) await sleep(100);
    check("L3 setup: B's claim was sent before the session changed", be.st.calls.some(c => c.fn === "claim_pilgrim_push_device" && c.tok === TOK.B));
    /* «ج» يدخل أثناء حكم «ب» من تبويبٍ ثالث: كتابتُه جلسةَ «ج» في التخزين المشترك هي ما يراه التبويبان
       (التبويبُ ٢ تبنّى «ب» من التخزين قبلها، فيُكتب منه هنا مباشرةً) */
    await t2.page.evaluate((t) => localStorage.setItem("portal_session", JSON.stringify({ token: t, idle_expires_at: "2099-01-01", absolute_expires_at: "2099-01-01" })), TOK.C);
    await sleep(4500);
    await t2.page.reload({ waitUntil: "domcontentloaded" }); await t2.page.waitForTimeout(1500);
    const ev = await events(t1.page, be);
    check("L3 the device is never associated with B on the server", be.st.owner !== TOK.B);
    const bVerdictAt = ev.indexOf("claim:B:released");
    const unsubAfterB = ev.slice(bVerdictAt + 1);
    const firstUnsub = unsubAfterB.indexOf("unsubscribe");
    check("L3 the obsolete B flow does not act on its verdict (no unsubscribe before C re-verifies)",
      firstUnsub === -1 || unsubAfterB.slice(0, firstUnsub).some(e => e.startsWith("claim:C:")), JSON.stringify(ev));
    check("L3 the current session (C) re-verifies the device with its own token", ev.slice(bVerdictAt + 1).some(e => e.startsWith("claim:C:")), JSON.stringify(ev));
    check("L3 client state is consistent: no server row ⇒ no local endpoint and no pending claim",
      await t1.page.evaluate(() => !localStorage.getItem("portal_push_endpoint") && !localStorage.getItem("portal_pending_claim")) && be.st.owner === null);
    check("L3 tabs show C only, stored session C", (await stored(t1.page)) === TOK.C && !(await shows(t1.page, TOK.B)) && (await shows(t2.page, TOK.C)));
    check("L3 no page errors", t1.errors.length + t2.errors.length === 0, [...t1.errors, ...t2.errors].join(" | "));
    await ctx.close();
  }

  /* ══ L4 — دخولٌ عاديّ في تبويبٍ واحد: السلوكُ القائم كما هو ══ */
  {
    const be = backend({ owner: TOK.C });
    const ctx = await context(browser, be, { subscribed: true });
    const t1 = await openTab(ctx);
    await submitLogin(t1.page, DOC.C);
    await t1.page.waitForSelector(`text=${NAME[TOK.C]}`, { timeout: 8000 });
    await sleep(800);
    check("L4 own device: claim → own, binding and subscription kept", be.st.owner === TOK.C
      && await t1.page.evaluate((e) => localStorage.getItem("__fake_sub") === "1" && localStorage.getItem("portal_push_endpoint") === e, ENDPOINT));
    await t1.page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await t1.page.waitForSelector("input[placeholder=A12345678]", { timeout: 8000 });
    await submitLogin(t1.page, DOC.B);                                    // جهازُ «ج» يدخله «ب»
    await t1.page.waitForSelector(`text=${NAME[TOK.B]}`, { timeout: 8000 });
    await sleep(800);
    check("L4 B then logs in normally on the same tab", (await stored(t1.page)) === TOK.B);
    check("L4 after C's logout: C's device row released and the browser subscription dropped (existing behaviour)", be.st.owner === null
      && await t1.page.evaluate(() => localStorage.getItem("__fake_sub") === "0"));
    // دخولٌ فاشلٌ وحده (بلا تبويبٍ آخر): يُمسح ما كتبه كما كان
    await t1.page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await t1.page.waitForSelector("input[placeholder=A12345678]", { timeout: 8000 });
    be.st.failPortal.add(TOK.C);
    await submitLogin(t1.page, DOC.C);
    await sleep(1200);
    check("L4 a lone failed login still removes the session it wrote", (await stored(t1.page)) === null && (await onLogin(t1.page)));
    check("L4 no page errors", t1.errors.length === 0, t1.errors.join(" | "));
    await ctx.close();
  }

  await browser.close();
} finally {
  vite.kill();
}
console.log(`\nresult: ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
