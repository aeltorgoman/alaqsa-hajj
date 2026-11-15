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
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const ann = (id, who, o = {}) => ({ id, title: `تنبيه ${id}`, body: `${who} — نص ${id}`, priority: "عام", show_at: new Date(Date.now() - id * 60000).toISOString(), pinned: false, revision: 1, state: "unread", edited_at: null, ...o });
const portalOf = (name, first, meta) => ({
  pilgrim: { name_ar: name, name_en: "Test", short_ar: name, gender: "ذكر", has_photo: false, has_hajj_permit: true, has_flight_ticket: false, hotel_type: null, hotel_view: null, camp_mina: null, camp_arafa: null, phone: null },
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
    invalid: new Set(), stamp: "s1", delay: { portal: 0, page: 0, doc: {} }, calls: [],
    /* «أ» أجاب سابقاً (مراجعة 1)، و«ب» لم يُجب */
    poll: { revision: 1, ids: [11] }, pollB: { revision: 0, ids: [] }, submits: [], acks: [],
  };
  const portal = (tok) => {
    const all = st.anns[tok]; const first = all.slice(0, 10);
    return portalOf(st.name[tok], first, { total: all.length, unread: all.length, has_more: all.length > 10, page_size: 10 });
  };
  const page = (tok, off) => { const all = st.anns[tok]; return { items: all.slice(off, off + 10), total: all.length, unread: all.length, has_more: all.length > off + 10 }; };
  const pollOf = (tok) => (tok === TOK.B ? st.pollB : st.poll);
  const polls = (tok) => ({ items: [{ id: 1, title: "موعد الاجتماع", body: null, kind: "single", max_choices: null, allow_answer_changes: true, state: "open",
    published_at: new Date(Date.now() - 86400000).toISOString(), closes_at: null, options: [{ id: 11, label: "الأحد" }, { id: 12, label: "الإثنين" }, { id: 13, label: "الثلاثاء" }],
    my_response: pollOf(tok).revision ? { revision: pollOf(tok).revision, option_ids: pollOf(tok).ids } : null }], pending: pollOf(tok).revision ? 0 : 1 });
  const submit = (b) => {
    st.submits.push(b);
    const key = b.p_token === TOK.B ? "pollB" : "poll"; const cur = st[key];
    if (b.p_expected_revision !== cur.revision) return { status: "stale", revision: cur.revision, option_ids: cur.ids };
    st[key] = { revision: cur.revision + 1, ids: b.p_option_ids }; return { status: "ok", revision: st[key].revision, option_ids: st[key].ids };
  };
  return { st, portal, page, polls, submit };
}

async function boot(browser, be, tok, { clock = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: "ar" });
  if (clock) await ctx.clock.install();
  await ctx.route("https://docs.test/**", r => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await ctx.route(`${MOCK}/**`, async route => {
    const url = route.request().url();
    const body = (() => { try { return JSON.parse(route.request().postData() || "{}"); } catch { return {}; } })();
    const json = (d) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (url.includes("/functions/v1/pilgrim-doc")) {
      be.st.calls.push({ fn: "pilgrim-doc", tok: body.token });
      const d = be.st.delay.doc[body.token] || 0; if (d) await sleep(d);
      if (be.st.invalid.has(body.token) || !be.st.anns[body.token]) return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
      return json({ url: `https://docs.test/${body.token === TOK.A ? "A" : "B"}-${body.doc_type}.png`, is_pdf: false, expires_in: 900 });
    }
    const fn = url.includes("/rpc/") ? url.split("/rpc/")[1].split("?")[0] : "";
    if (fn) be.st.calls.push({ fn, tok: body.p_token, offset: body.p_offset });
    const bad = (t) => be.st.invalid.has(t) || !be.st.anns[t];
    if (fn === "create_pilgrim_session") return json({ token: TOK.B, idle_expires_at: "2099-01-01", absolute_expires_at: "2099-01-01" });
    if (fn === "get_pilgrim_portal_by_session") {
      const t = body.p_token;
      /* مصفوفة = تأخيرُ كلِّ طلبٍ بترتيبه (لعكس ترتيب العودة عمداً) */
      const d = Array.isArray(be.st.delay.portal) ? (be.st.delay.portal.shift() || 0) : be.st.delay.portal;
      const res = bad(t) ? null : be.portal(t);          // حالةُ الخادم لحظةَ الطلب
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
    if (fn === "get_pilgrim_polls") return json(bad(body.p_token) ? null : be.polls(body.p_token));
    if (fn === "submit_pilgrim_poll_response") return json(bad(body.p_token) ? null : be.submit(body));
    if (fn === "acknowledge_pilgrim_announcement") { be.st.acks.push({ tok: body.p_token, id: body.p_announcement_id }); return json({ id: body.p_announcement_id, revision: body.p_revision, state: "read" }); }
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

  /* ══════════ مراجعة #278 — جولة ثانية ══════════ */
  const ids25 = () => Array.from({ length: 25 }, (_, i) => ann(i + 1, "خاص بالحاج أ"));
  const gotoTrip = async (page) => { await page.getByRole("button", { name: "رحلتي" }).click(); await page.waitForSelector("text=تصريح الحج", { timeout: 8000 }); await page.waitForTimeout(300); };
  const gotoAlerts = async (page) => { await page.getByRole("button", { name: "التنبيهات" }).click(); await page.waitForSelector("[id^=ann-]", { timeout: 8000 }); await page.waitForTimeout(300); };
  const inOrder = (now, server) => JSON.stringify(now) === JSON.stringify(server.slice(0, now.length));

  /* ══ R1 (P1) — وثيقةُ «أ» المتأخّرة لا تُخزَّن ولا تُسلَّم لـ«ب» ══ */
  {
    const be = backend();
    const { ctx, page, errors } = await boot(browser, be, TOK.A);
    await gotoTrip(page);
    be.st.delay.doc[TOK.A] = 2500;
    await page.locator("button", { hasText: "عرض" }).first().click();        // «أ» يطلب تصريحه…
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "تسجيل الخروج" }).click();        // …ويخرج قبل وصوله
    await loginAsB(page);
    await page.waitForSelector("text=الحاج ب", { timeout: 8000 });
    await page.waitForTimeout(3000);                                         // وصل ردُّ «أ» الآن
    check("R1 A's late document is not displayed in B's session", (await page.locator("img[src*='docs.test']").count()) === 0);
    await gotoTrip(page);
    const before = be.st.calls.filter(c => c.fn === "pilgrim-doc" && c.tok === TOK.B).length;
    await page.locator("button", { hasText: "عرض" }).first().click();        // «ب» يفتح تصريحه
    await page.waitForSelector("img[src*='docs.test']", { timeout: 8000 }).catch(() => {});
    const src = await page.locator("img[src*='docs.test']").first().getAttribute("src").catch(() => null);
    check("R1 B opening B's permit gets B's document, never A's cached URL", src === "https://docs.test/B-hajj_permit.png", `src=${src}`);
    check("R1 …through a fresh request in B's session (A's reply was never cached)", be.st.calls.filter(c => c.fn === "pilgrim-doc" && c.tok === TOK.B).length === before + 1);
    check("R1 no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ══ R2 (P1) — تبويبان في السياق نفسه: «ب» يدخل في التبويب الثاني بينما الأوّل يعرض «أ» ══ */
  {
    const be = backend();
    be.st.anns[TOK.A] = ids25(); be.st.poll = { revision: 0, ids: [] };     // «أ» لم يُجب بعد
    const { ctx, page: tabA, errors } = await boot(browser, be, TOK.A);
    await loadMore(tabA); await tabA.waitForSelector("#ann-20", { timeout: 5000 });
    await tabA.waitForSelector("#poll-1", { timeout: 8000 });
    await tabA.locator("#poll-1 label", { hasText: "الإثنين" }).click();      // «أ» يختار ولم يُرسل
    const tabB = await ctx.newPage();
    await tabB.goto(`${APP}/hajj`, { waitUntil: "domcontentloaded" }); await tabB.waitForSelector("text=الحاج أ", { timeout: 15000 });
    await tabB.getByRole("button", { name: "تسجيل الخروج" }).click();
    await loginAsB(tabB);
    await tabB.waitForSelector("text=الحاج ب", { timeout: 8000 });
    await tabA.waitForTimeout(1500);
    const body = await tabA.locator("body").innerText();
    check("R2 tab 1 drops A's screen when another tab switches the pilgrim", !body.includes("الحاج أ") && !body.includes("خاص بالحاج أ"));
    check("R2 tab 1 never mixes B's profile with A's announcements", !(body.includes("الحاج ب") && body.includes("خاص بالحاج أ")));
    check("R2 A's pending selection cannot be sent (its card is gone)", (await tabA.locator("#poll-1 label input:checked").count()) === 0);
    check("R2 tab 1 follows the stored session (B), fetched under B's own token", body.includes("الحاج ب")
      && be.st.calls.some(c => c.fn === "get_pilgrim_portal_by_session" && c.tok === TOK.B));
    await gotoAlerts(tabA);
    check("R2 tab 1 alerts now show only B's announcements", JSON.stringify(await ids(tabA)) === "[101,102]", JSON.stringify(await ids(tabA)));
    check("R2 B's poll on tab 1 is B's own (unanswered)", (await tabA.locator("#poll-1").getAttribute("data-phase")) === "open-unanswered");
    check("R2 no answer was written into B's account", be.st.pollB.revision === 0 && be.st.submits.length === 0, JSON.stringify(be.st.submits));
    check("R2 tab 2 (B) session intact", await tabB.evaluate((t) => JSON.parse(localStorage.getItem("portal_session") || "{}").token === t, TOK.B));
    check("R2 no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ══ R3 (P1) — التخزينُ تبدّل ولم يصل حدثُه بعد: لا يُرسَل شيءٌ برمز «ب» من شاشة «أ» ══ */
  {
    const be = backend();
    be.st.poll = { revision: 0, ids: [] };
    const { ctx, page, errors } = await boot(browser, be, TOK.A);
    await page.waitForSelector("#poll-1", { timeout: 8000 });
    await page.locator("#poll-1 label", { hasText: "الإثنين" }).click();
    /* كتابةٌ في التبويب نفسِه لا تُطلق حدثَ storage فيه: تحاكي تبويباً آخر لم يصل حدثُه بعد */
    await page.evaluate((t) => localStorage.setItem("portal_session", JSON.stringify({ token: t, idle_expires_at: "2099-01-01", absolute_expires_at: "2099-01-01" })), TOK.B);
    await page.locator("#poll-1").getByRole("button", { name: /إرسال الإجابة/ }).click();
    await page.waitForTimeout(1200);
    check("R3 submit from A's screen is never sent under B's token", !be.st.submits.some(s => s.p_token === TOK.B), JSON.stringify(be.st.submits.map(s => s.p_token.slice(0, 4))));
    check("R3 A's answer is not written into B's account", be.st.pollB.revision === 0);
    check("R3 the stored (other tab's) session is not wiped", await page.evaluate((t) => JSON.parse(localStorage.getItem("portal_session") || "{}").token === t, TOK.B));
    check("R3 the stale screen of A is dropped", !(await page.locator("body").innerText()).includes("الحاج أ"));
    // الإقرارُ أيضاً: شاشةُ «أ» بلا حدث، ثمّ «تمّت القراءة»
    const be2 = backend();
    const r2 = await boot(browser, be2, TOK.A);
    await r2.page.evaluate((t) => localStorage.setItem("portal_session", JSON.stringify({ token: t, idle_expires_at: "2099-01-01", absolute_expires_at: "2099-01-01" })), TOK.B);
    await r2.page.locator("#ann-1 >> text=تمّت القراءة").click();
    await r2.page.waitForTimeout(800);
    check("R3 acknowledgment from A's screen is never sent under B's token", !be2.st.acks.some(a => a.tok === TOK.B), JSON.stringify(be2.st.acks));
    check("R3 no page errors", errors.length === 0 && r2.errors.length === 0, [...errors, ...r2.errors].join(" | "));
    await ctx.close(); await r2.ctx.close();
  }

  /* ══ R4 (P2) — تحديثٌ و«عرض المزيد» متزامنان، بالترتيبين ══ */
  for (const order of ["refresh-then-loadmore", "loadmore-then-refresh"]) {
    const be = backend();
    be.st.anns[TOK.A] = ids25();
    const { ctx, page, errors } = await boot(browser, be, TOK.A);
    await loadMore(page); await page.waitForSelector("#ann-20", { timeout: 5000 });
    be.st.anns[TOK.A] = be.st.anns[TOK.A].filter(a => a.id !== 12);          // حُذف 12 في الخادم
    be.st.delay.page = 1500;
    const pagesBefore = be.st.calls.filter(c => c.fn === "get_pilgrim_announcements").length;
    if (order === "refresh-then-loadmore") {
      be.st.stamp = "sE1"; await poke(page); await page.waitForTimeout(300);  // إعادةُ الجلب جارية
      await page.locator("text=عرض المزيد").click({ force: true });           // ضغطةٌ أثناءها
    } else {
      await loadMore(page); await page.waitForTimeout(200);                    // «عرض المزيد» جارٍ
      be.st.stamp = "sE2"; await poke(page);
    }
    await page.waitForTimeout(5000);
    be.st.delay.page = 0;
    const now = await ids(page); const server = be.st.anns[TOK.A].map(a => a.id);
    check(`R4 ${order}: deleted 12 does not reappear`, !now.includes(12), JSON.stringify(now));
    check(`R4 ${order}: no valid item lost inside the shown range (order kept)`, inOrder(now, server), JSON.stringify(now));
    check(`R4 ${order}: no duplicates`, now.length === new Set(now).size);
    check(`R4 ${order}: has_more matches the server`, ((await page.locator("text=عرض المزيد").count()) === 1) === (server.length > now.length), `${now.length}/${server.length}`);
    const used = be.st.calls.filter(c => c.fn === "get_pilgrim_announcements").length - pagesBefore;
    check(`R4 ${order}: bounded requests (≤ 3 page calls for one refresh + one tap)`, used <= 3, String(used));
    check(`R4 ${order}: no page errors`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ══ R5 (P2) — تحديثان يعودان بترتيبٍ معكوس عمداً ══ */
  {
    const be = backend();
    be.st.anns[TOK.A] = ids25();
    const { ctx, page, errors } = await boot(browser, be, TOK.A, { clock: true });
    await loadMore(page); await page.waitForSelector("#ann-20", { timeout: 5000 });
    be.st.delay.portal = [2500, 0];                                          // الأوّلُ بطيء (حالةٌ قديمة)، والثاني سريع
    be.st.stamp = "sF"; await poke(page);                                    // R1: فحصُ البصمة → تحديث
    await page.waitForTimeout(150);
    be.st.stamp = "s1";                                                      // لا تحديثاتٍ أخرى من فحص البصمة
    be.st.anns[TOK.A] = be.st.anns[TOK.A].filter(a => a.id !== 5 && a.id !== 15);
    await page.clock.runFor(180000);                                         // R2: التحديثُ الدوريّ (حالةٌ جديدة)
    await page.waitForTimeout(3500);                                         // R1 القديمُ يعود الآن، بعد R2
    const now = await ids(page); const server = be.st.anns[TOK.A].map(a => a.id);
    const portalCalls = be.st.calls.filter(c => c.fn === "get_pilgrim_portal_by_session").length;
    check("R5 setup: two overlapping portal refreshes were sent", portalCalls >= 2, String(portalCalls));
    check("R5 the older reply does not resurrect deleted 5 (first page)", !now.includes(5), JSON.stringify(now));
    check("R5 …nor deleted 15 (extra page)", !now.includes(15), JSON.stringify(now));
    check("R5 pagination consistent with the accepted refresh (no gap, no duplicates)", inOrder(now, server) && now.length === new Set(now).size, JSON.stringify(now));
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("portal_data") || "{}").announcements?.map(a => a.id) || []);
    check("R5 localStorage keeps the newer profile (5 absent)", !stored.includes(5), JSON.stringify(stored));
    check("R5 no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  /* ══ R5′ — رفضٌ قديمٌ يعود بعد نجاحٍ أحدث لا يُنهي الجلسة؛ ورفضٌ أحدثُ يُنهيها ══ */
  {
    const be = backend();
    const { ctx, page, errors } = await boot(browser, be, TOK.A, { clock: true });
    /* R1 يُلتقط والجلسةُ مرفوضة ويعود متأخّراً؛ R2 بعده والجلسةُ صالحة */
    be.st.invalid.add(TOK.A); be.st.delay.portal = [2500, 0];
    be.st.stamp = "sG"; await poke(page); await page.waitForTimeout(150);
    be.st.stamp = "s1"; be.st.invalid.delete(TOK.A);
    await page.clock.runFor(180000);
    await page.waitForTimeout(3500);
    check("R5′ an older rejection arriving after a newer success does not expire the session", (await page.locator("#ann-1").count()) === 1 && await page.evaluate(() => !!localStorage.getItem("portal_session")));
    be.st.invalid.add(TOK.A); be.st.stamp = "sH"; await poke(page);
    await page.waitForSelector("input[placeholder=A12345678]", { timeout: 8000 }).catch(() => {});
    check("R5′ a current rejection still expires the session", (await page.locator("input[placeholder=A12345678]").count()) === 1 && await page.evaluate(() => !localStorage.getItem("portal_session")));
    check("R5′ no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await browser.close();
} finally {
  vite.kill();
}
console.log(`\nresult: ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
