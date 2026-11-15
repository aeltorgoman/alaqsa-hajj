#!/usr/bin/env node
// ============================================================
// تحقّقُ الواجهة — مراجعة v1.3.0: عزلُ جلسة الحاجّ · حداثةُ الصفحات التالية · مراجعةُ إجابة الاستطلاع
// ============================================================
/* يشغّل التطبيقَ (Vite) بعنوان Supabase وهميّ وخادمٍ اصطناعيّ بعقد البوابة (الجلسة · الملفّ · الصفحات
   التالية · الاستطلاعات). حاجّان على جهازٍ واحد: «أ» بتنبيهاتٍ موجَّهةٍ له في الصفحة الثانية، و«ب».
   لا قاعدةَ ولا شبكةَ ولا بياناتٍ حقيقيّة.
   node scripts/ui-verify/portal-session-isolation.mjs [--port 5186] */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg("--port", "5186");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const MOCK = "https://mock.supabase.test";
const APP = `http://localhost:${PORT}`;
const vite = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: "mock-anon-key" }, stdio: "ignore" });

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) { pass++; console.log(`PASS — ${name}`); } else { fail++; console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ann = (id, who, o = {}) => ({ id, title: `تنبيه ${id}`, body: `${who} — نص ${id}`, priority: "عام", show_at: new Date(Date.now() - id * 60000).toISOString(), pinned: false, revision: 1, state: "unread", edited_at: null, ...o });
const portalOf = (name, first, meta) => ({
  pilgrim: { name_ar: name, name_en: "Test", short_ar: name, gender: "ذكر", has_photo: false, has_hajj_permit: false, has_flight_ticket: false, hotel_type: null, hotel_view: null, camp_mina: null, camp_arafa: null, phone: null },
  bus: null, room: null, accommodation: { status: "none", hotel: null, room: null, requested_hotel: null }, roommates: [], family: [], flight_go: null, flight_back: null,
  config: { name_ar: "حملة تجريبية", tagline: null, color_primary: "#5d2222", color_accent: "#B08D3C", admin_name: null, admin_phone: null, admin_whatsapp: null, portal_settings: {}, settings_stamp: "s1", country: null, city: null, assets: {} },
  season: { name: "موسم تجريبي", hijri_year: 1448, hotel_name: null, hotel_address: null, hotel_url: null, mina_address: null, mina_url: null, arafa_address: null, arafa_url: null },
  announcements: first, announcements_meta: meta,
});
const TOK = { A: "tokA-0123456789abcdefghijklmnopqrstuvwxyz", B: "tokB-0123456789abcdefghijklmnopqrstuvwxyz" };

/* الخادمُ الاصطناعيّ: تنبيهاتُ كلِّ حاجٍّ بجمهوره، وصفحاتٌ بحجم 10 */
function backend() {
  const st = {
    anns: { [TOK.A]: Array.from({ length: 15 }, (_, i) => ann(i + 1, "خاص بالحاج أ")), [TOK.B]: [ann(101, "للحاج ب"), ann(102, "للحاج ب")] },
    name: { [TOK.A]: "الحاج أ", [TOK.B]: "الحاج ب" },
    invalid: new Set(), stamp: "s1", delay: { portal: 0, page: 0 }, calls: [],
    poll: { revision: 1, ids: [11] }, submits: [],
  };
  const portal = (tok) => {
    const all = st.anns[tok]; const first = all.slice(0, 10);
    return portalOf(st.name[tok], first, { total: all.length, unread: all.length, has_more: all.length > 10, page_size: 10 });
  };
  const page = (tok, off) => { const all = st.anns[tok]; return { items: all.slice(off, off + 10), total: all.length, unread: all.length, has_more: all.length > off + 10 }; };
  const polls = () => ({ items: [{ id: 1, title: "موعد الاجتماع", body: null, kind: "single", max_choices: null, allow_answer_changes: true, state: "open",
    published_at: new Date(Date.now() - 86400000).toISOString(), closes_at: null, options: [{ id: 11, label: "الأحد" }, { id: 12, label: "الإثنين" }, { id: 13, label: "الثلاثاء" }],
    my_response: { revision: st.poll.revision, option_ids: st.poll.ids } }], pending: 0 });
  const submit = (b) => {
    st.submits.push(b);
    if (b.p_expected_revision !== st.poll.revision) return { status: "stale", revision: st.poll.revision, option_ids: st.poll.ids };
    st.poll = { revision: st.poll.revision + 1, ids: b.p_option_ids }; return { status: "ok", revision: st.poll.revision, option_ids: st.poll.ids };
  };
  return { st, portal, page, polls, submit };
}

async function boot(browser, be, tok, { clock = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: "ar" });
  if (clock) await ctx.clock.install();
  await ctx.route(`${MOCK}/**`, async route => {
    const url = route.request().url();
    const body = (() => { try { return JSON.parse(route.request().postData() || "{}"); } catch { return {}; } })();
    const json = (d) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    const fn = url.includes("/rpc/") ? url.split("/rpc/")[1].split("?")[0] : "";
    if (fn) be.st.calls.push({ fn, tok: body.p_token, offset: body.p_offset });
    const bad = (t) => be.st.invalid.has(t) || !be.st.anns[t];
    if (fn === "create_pilgrim_session") return json({ token: TOK.B, idle_expires_at: "2099-01-01", absolute_expires_at: "2099-01-01" });
    if (fn === "get_pilgrim_portal_by_session") {
      const t = body.p_token; const d = be.st.delay.portal;
      const res = bad(t) ? null : be.portal(t);
      if (d && t === TOK.A) await sleep(d);
      return json(res);
    }
    if (fn === "portal_settings_stamp") return json(be.st.stamp);
    if (fn === "get_pilgrim_announcements") {
      const t = body.p_token; const d = be.st.delay.page;
      const res = bad(t) ? null : be.page(t, body.p_offset);
      if (d && t === TOK.A) await sleep(d);
      return json(res);
    }
    if (fn === "get_pilgrim_polls") return json(bad(body.p_token) ? null : be.polls());
    if (fn === "submit_pilgrim_poll_response") return json(be.submit(body));
    return json(null);
  });
  await ctx.addInitScript(([data, token]) => {
    if (sessionStorage.getItem("booted")) return;
    sessionStorage.setItem("booted", "1");
    localStorage.setItem("portal_session", JSON.stringify({ token, idle_expires_at: "2099-01-01", absolute_expires_at: "2099-01-01" }));
    localStorage.setItem("portal_data", JSON.stringify(data));
    localStorage.setItem("portal_push_dismissed", "1");
  }, [be.portal(tok), tok]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${APP}/hajj/alerts`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ann-1", { timeout: 15000 });
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}
/* فحصُ البصمة فوراً (ظهورُ الصفحة) بدل انتظار دورة العشرين ثانية */
const poke = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
const ids = (page) => page.$$eval("[id^=ann-]", els => els.map(e => Number(e.id.slice(4))));
const loadMore = async (page) => { await page.click("text=عرض المزيد"); };
async function loginAsB(page) {
  await page.waitForSelector("input[placeholder=A12345678]", { timeout: 8000 });
  await page.fill("input[placeholder=A12345678]", "B1234567");
  const sel = page.locator("select");
  await sel.nth(0).selectOption("5"); await sel.nth(1).selectOption("6"); await sel.nth(2).selectOption({ index: 10 });
  await page.click("text=دخول إلى رحلتي");
}
const leaked = async (page) => (await page.locator("body").innerText()).includes("خاص بالحاج أ");

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch { /* starting */ } await sleep(500); }
  const browser = await chromium.launch();

  /* ══ P1-أ — انتهاءُ الجلسة ثم دخولُ حاجٍّ آخر على الجهاز نفسِه ══ */
  {
    const be = backend();
    const { ctx, page, errors } = await boot(browser, be, TOK.A);
    await loadMore(page); await page.waitForSelector("#ann-15", { timeout: 5000 });
    check("P1 setup: pilgrim A loaded the second page (targeted announcements 11–15)", (await ids(page)).length === 15);
    be.st.invalid.add(TOK.A); be.st.stamp = "s2"; await poke(page);
    await page.waitForSelector("input[placeholder=A12345678]", { timeout: 8000 });
    check("P1 expiry: the portal returns to the login screen", (await page.locator("[id^=ann-]").count()) === 0);
    check("P1 expiry: nothing of pilgrim A stays in storage", await page.evaluate(() => !localStorage.getItem("portal_session") && !localStorage.getItem("portal_data")));
    await loginAsB(page);
    await page.waitForSelector("text=الحاج ب", { timeout: 8000 });
    // بعد إعادة التحميل: ما خُزّن على الجهاز لـ«ب» وحده
    await page.goto(`${APP}/hajj/alerts`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ann-101", { timeout: 8000 });
    await page.waitForTimeout(400);
    check("P1 account switch: pilgrim B sees only B's announcements", JSON.stringify(await ids(page)) === "[101,102]", JSON.stringify(await ids(page)));
    check("P1 account switch: no text of A's targeted announcements is on screen", !(await leaked(page)));
    check("no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ══ P1-أ′ — التبديلُ نفسُه بلا أيّ تحميلٍ للصفحة (الحالةُ في الذاكرة وحدها) ══ */
  {
    const be = backend();
    const { ctx, page, errors } = await boot(browser, be, TOK.A);
    await loadMore(page); await page.waitForSelector("#ann-15", { timeout: 5000 });
    be.st.invalid.add(TOK.A); be.st.stamp = "s2"; await poke(page);
    await loginAsB(page);
    await page.waitForSelector("text=الحاج ب", { timeout: 8000 });
    await page.getByRole("button", { name: "التنبيهات" }).click();
    await page.waitForSelector("#ann-101", { timeout: 8000 });
    await page.waitForTimeout(400);
    check("P1 in-memory switch (no reload): B's list has no A items", JSON.stringify(await ids(page)) === "[101,102]", JSON.stringify(await ids(page)));
    check("P1 in-memory switch: no A text anywhere", !(await leaked(page)));
    check("no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ══ P1-ب — ردٌّ متأخّرٌ لجلسةٍ سابقة لا يعيد ملءَ شاشة الحاجّ التالي ══ */
  {
    const be = backend();
    const { ctx, page, errors } = await boot(browser, be, TOK.A);
    be.st.delay.page = 2500;
    await loadMore(page);                                  // صفحةُ «أ» في الطريق…
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "تسجيل الخروج" }).click();   // …والحاجُّ «أ» يخرج
    await loginAsB(page);
    await page.waitForSelector("text=الحاج ب", { timeout: 8000 });
    await page.getByRole("button", { name: "التنبيهات" }).click();
    await page.waitForSelector("#ann-101", { timeout: 8000 });
    await page.waitForTimeout(3000);                        // ردُّ «أ» المتأخّر وصل الآن
    check("P1 stale page response (A, after logout + B login) is discarded", JSON.stringify(await ids(page)) === "[101,102]", JSON.stringify(await ids(page)));
    check("P1 stale page response: no A text", !(await leaked(page)));

    // ملفُّ «أ» متأخّرٌ يعود بعد دخول «ب»: لا يحلّ محلّ ملفّ «ب» ولا يُنهي جلسته
    be.st.delay.page = 0; be.st.delay.portal = 2500;
    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await page.waitForSelector("input[placeholder=A12345678]", { timeout: 8000 });
    check("logout clears storage", await page.evaluate(() => !localStorage.getItem("portal_session")));
    await ctx.close();
  }
  {
    const be = backend();
    const { ctx, page, errors } = await boot(browser, be, TOK.A);
    be.st.delay.portal = 2500; be.st.stamp = "s2";
    await poke(page);                                       // تحديثُ ملفّ «أ» في الطريق
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await loginAsB(page);
    await page.waitForSelector("text=الحاج ب", { timeout: 8000 });
    await page.waitForTimeout(3000);                        // وصل ملفُّ «أ» المتأخّر
    const txt = await page.locator("body").innerText();
    check("P1 stale profile response (A) does not replace B's screen", txt.includes("الحاج ب") && !txt.includes("الحاج أ"));
    check("P1 stale profile response: B's session is still stored", await page.evaluate((t) => JSON.parse(localStorage.getItem("portal_session") || "{}").token === t, TOK.B));
    check("no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ══ P2 — حداثةُ الصفحات التالية ══ */
  {
    const be = backend();
    const { ctx, page, errors } = await boot(browser, be, TOK.A);
    const pagesCalls = () => be.st.calls.filter(c => c.fn === "get_pilgrim_announcements").length;
    be.st.stamp = "s2"; await poke(page); await page.waitForTimeout(600);
    check("P2 no extra pages loaded → a refresh sends no page request", pagesCalls() === 0, String(pagesCalls()));
    await loadMore(page); await page.waitForSelector("#ann-15", { timeout: 5000 });
    check("P2 normal pagination: offset 10, appended", (await ids(page)).length === 15 && be.st.calls.filter(c => c.fn === "get_pilgrim_announcements").map(c => c.offset).join() === "10");
    // في الخادم: حُذف 12، وانتهى 14، وعُدّل 13
    be.st.anns[TOK.A] = be.st.anns[TOK.A].filter(a => a.id !== 12 && a.id !== 14).map(a => a.id === 13 ? { ...a, body: "خاص بالحاج أ — نصٌّ مصحَّح", revision: 2, edited_at: new Date().toISOString() } : a);
    const before = pagesCalls();
    be.st.stamp = "s3"; await poke(page);
    await page.waitForTimeout(900);
    const now = await ids(page);
    check("P2 deleted announcement (12) disappears after the refresh", !now.includes(12), JSON.stringify(now));
    check("P2 expired announcement (14) disappears after the refresh", !now.includes(14), JSON.stringify(now));
    check("P2 edited announcement (13) shows its corrected text", (await page.locator("#ann-13").innerText()).includes("نصٌّ مصحَّح"));
    check("P2 the loaded pages are refetched once (one page → one request)", pagesCalls() - before === 1, String(pagesCalls() - before));
    check("P2 remaining items still shown, no duplicates", JSON.stringify(now) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15]), JSON.stringify(now));
    // ردٌّ مرفوضٌ أثناء إعادة الجلب: تُسقط الصفحاتُ التالية ويعود «عرض المزيد»
    be.st.delay.page = 0;
    const realPage = be.page; be.page = () => null;
    be.st.stamp = "s4"; await poke(page); await page.waitForTimeout(900);
    check("P2 failed refetch drops the extra pages (no stale list kept)", JSON.stringify(await ids(page)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    check("P2 …and «عرض المزيد» is offered again", (await page.locator("text=عرض المزيد").count()) === 1);
    be.page = realPage;
    check("no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ══ P2 — مراجعةُ إجابة الاستطلاع أثناء التعديل ══ */
  {
    const be = backend();
    const { ctx, page, errors } = await boot(browser, be, TOK.A, { clock: true });
    await page.waitForSelector("#poll-1", { timeout: 8000 });
    const card = page.locator("#poll-1");
    await card.getByRole("button", { name: "تعديل الإجابة" }).click();
    await card.locator("label", { hasText: "الثلاثاء" }).click();
    // جهازٌ آخر يغيّر الإجابة (مراجعة 2)، ثمّ تحديثٌ في الخلفية أثناء التعديل
    be.st.poll = { revision: 2, ids: [12] };
    // التحديثُ الدوريّ نفسُه (كلَّ ٣ دقائق) والبطاقةُ مفتوحةٌ على التعديل — بلا مغادرة التبويب
    const before = be.st.calls.filter(c => c.fn === "get_pilgrim_polls").length;
    await page.clock.runFor(181000);
    await page.waitForTimeout(700);
    check("P2 setup: a background poll refresh happened during editing", be.st.calls.filter(c => c.fn === "get_pilgrim_polls").length > before);
    check("P2 refresh during editing keeps the local selection", await card.locator("label", { hasText: "الثلاثاء" }).locator("input").isChecked());
    check("P2 refresh during editing shows a conflict notice", (await card.locator("[data-poll-conflict]").count()) === 1);
    await card.getByRole("button", { name: "حفظ التعديل" }).click();
    await page.waitForTimeout(600);
    const s1 = be.st.submits.at(-1);
    check("P2 the edit is sent with the revision it began from (1), not the refreshed one (2)", s1?.p_expected_revision === 1, JSON.stringify(s1));
    check("P2 the newer answer is NOT overwritten", be.st.poll.revision === 2 && be.st.poll.ids.join() === "12");
    check("P2 stale → the recorded answer is shown and editing stays open", (await card.locator("[data-poll-msg]").innerText()).includes("جهاز آخر")
      && await card.locator("label", { hasText: "الإثنين" }).locator("input").isChecked() && (await card.getByRole("button", { name: "حفظ التعديل" }).count()) === 1);
    check("P2 conflict notice clears once the newer answer is adopted", (await card.locator("[data-poll-conflict]").count()) === 0);
    await card.locator("label", { hasText: "الثلاثاء" }).click();
    await card.getByRole("button", { name: "حفظ التعديل" }).click();
    await page.waitForTimeout(600);
    check("P2 a deliberate re-submit is based on the adopted revision (2) and succeeds", be.st.submits.at(-1)?.p_expected_revision === 2 && be.st.poll.revision === 3 && be.st.poll.ids.join() === "13");
    check("no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await browser.close();
} finally {
  vite.kill();
}
console.log(`\nresult: ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
