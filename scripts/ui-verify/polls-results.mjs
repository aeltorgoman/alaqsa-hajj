#!/usr/bin/env node
// ============================================================
// تحقّقُ الواجهة — Polls Phase 4: شاشةُ النتائج (نتائج · توزيع · مشاركة) والتصدير
// ============================================================
/* يشغّل التطبيقَ (Vite) بعنوان Supabase وهميّ ويعترض كلَّ طلبٍ بخادمٍ اصطناعيٍّ يحاكي عقدَ
   `poll_details` (ترحيلة 20261112224117) و`get_poll_snapshot` (Phase 2). لا قاعدةَ ولا شبكة.
   والقاعدةُ نفسُها يختبرها `supabase/verification/portal/polls_phase4_tests.sh`.
   node scripts/ui-verify/polls-results.mjs [--out DIR] [--port 5185] */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg("--out", join(ROOT, ".print-verify-flow/polls-results")));
const PORT = +arg("--port", "5185");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const XLSX = require(join(ROOT, "node_modules/xlsx"));
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
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/* جمهورٌ مجمَّد من ستة: أحمد غيّر إجابته (مراجعة ٣)، وداود بلا إسناد، وهشام وداود لم يجيبا */
const OPTS = [{ id: 11, label: "صباحاً", sort_order: 1 }, { id: 12, label: "مساءً", sort_order: 2 }, { id: 13, label: "ليلاً", sort_order: 3 }];
/* الرحلات: 31 QR1 و32 QR3 للذهاب (flight_id)، و41 QR2 للعودة (return_flight_id) */
const R = (id, name, bus, mina, go, back, opts, rev) => ({ passenger_id: id, name_ar: name, passenger_type: "حاج", added_reason: "publish", bus, camp_mina: mina, flight_go: go, flight_back: back,
  responded: opts.length > 0, revision: opts.length ? (rev ?? 1) : null, option_ids: opts });
const ROWS = [R(101, "أحمد سالم", 1, 7, 31, 41, [12], 3), R(102, "بلال حسن", 1, null, 31, null, [11]), R(103, "جابر علي", 2, 7, 32, 41, [12]), R(104, "داود يوسف", null, null, null, null, []),
  R(105, "هشام عمر", 2, 8, 31, 41, []), R(106, "زياد خالد", 1, 8, 32, null, [12])];
const FL = { 31: "QR1", 32: "QR3", 41: "QR2" };
const LABELS = { bus: { 1: "باص ١", 2: "باص ٢" }, camp_mina: { 7: "منى أ", 8: "منى ب" }, flight_go: FL, flight_back: FL };
const FINFO = { 31: { airline: "القطرية", date: "2027-05-01", time: "08:00", from_airport: "DOH", to_airport: "JED", type: "ذهاب" },
  32: { airline: "القطرية", date: "2027-05-02", time: "09:00", from_airport: "DOH", to_airport: "MED", type: "ذهاب" },
  41: { airline: "القطرية", date: "2027-06-10", time: "12:00", from_airport: "JED", to_airport: "DOH", type: "إياب" } };
const poll = (id, status, extra = {}) => ({ id, season_id: 1, title: `استطلاع ${id}`, body: null, kind: "single", max_choices: null, audience: { all: true }, status,
  publish_at: iso(-86400000), published_at: iso(-86400000), audience_frozen_at: iso(-86400000), closes_at: null, closed_at: null, close_reason: null,
  allow_answer_changes: true, created_by: null, created_at: iso(-id * 60000), updated_by: null, updated_at: iso(-id * 60000), ...extra });
const POLLS = [
  poll(1, "published", { title: "متى تفضّل زيارة المدينة؟" }),
  poll(2, "published", { title: "ما الأنشطة المفضّلة؟", kind: "multiple", max_choices: 2 }),
  poll(3, "closed", { title: "تقييم الحافلات (مغلق)", closed_at: iso(-3600000), close_reason: "manual" }),
  poll(4, "draft", { title: "مسودة", published_at: null, audience_frozen_at: null, publish_at: null }),
];
const OPTIONS = POLLS.flatMap(p => OPTS.map(o => ({ ...o, id: p.id * 100 + o.id, poll_id: p.id })));
const optFor = (pid) => OPTS.map(o => ({ ...o, id: pid * 100 + o.id }));
const rowsFor = (pid, multi) => ROWS.map(r => ({ ...r, option_ids: (multi && r.passenger_id === 101 ? [11, 12] : r.option_ids).map(x => pid * 100 + x) }));
const details = (pid) => {
  const p = POLLS.find(x => x.id === pid);
  return { poll_id: pid, status: p.status, kind: p.kind, max_choices: p.max_choices, source: p.status === "closed" ? "snapshot" : "live", as_of: p.closed_at || new Date().toISOString(),
    options: optFor(pid), labels: LABELS, flight_info: p.status === "closed" ? {} : FINFO, rows: rowsFor(pid, p.kind === "multiple") };
};
const PAX = [101, 102, 103, 104, 105, 106].map((id, i) => ({ id, season_id: 1, name_ar: ROWS[i].name_ar, short_ar: ROWS[i].name_ar, name_en: `P${id}`, passenger_type: "حاج", gender: "ذكر",
  sort_order: id, nat: "قطر", passport: `P${id}`, services: {}, bus_id: ROWS[i].bus, camp_mina_id: ROWS[i].camp_mina }));

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
const filtered = (rows, url) => {
  let out = rows;
  for (const [k, v] of url.searchParams) {
    if (v.startsWith("eq.")) { const want = decodeURIComponent(v.slice(3)); out = out.filter(r => !(k in r) || String(r[k]) === want); }
    else if (v.startsWith("in.(")) { const want = v.slice(4, -1).split(","); out = out.filter(r => !(k in r) || want.includes(String(r[k]))); }
  }
  return out;
};

async function boot(browser, { viewport = { width: 1366, height: 900 }, theme = "qatar-heritage", mode = "ok", path = "/portal-settings" } = {}) {
  const calls = [], writes = [];
  const ctx = await browser.newContext({ viewport, locale: "ar", acceptDownloads: true });
  const tables = {
    user_profiles: [{ id: UID, email: user.email, name: "موظف", permissions: perms, is_active: true }],
    seasons: [{ id: 1, name: "موسم ١٤٤٧", hijri_year: 1447, created_at: "2026-01-01", closed_at: null, closed_by: null, is_active: true }],
    company_config: [{ id: 1, company_name: "حملة الاختبار", name_ar: "حملة الاختبار", primary_color: "#6B1F3A", accent_color: "#085041", active_season_id: 1 }],
    buses: [{ id: 1, name: "باص ١", season_id: 1 }, { id: 2, name: "باص ٢", season_id: 1 }],
    camps: [{ id: 7, name: "منى أ", page_type: "منى", type: "عادي", gender: "ذكر", season_id: 1 }, { id: 8, name: "منى ب", page_type: "منى", type: "عادي", gender: "ذكر", season_id: 1 }],
    hotels: [], flights: [], passengers: PAX, announcements: [], notification_deliveries: [], polls: POLLS, poll_options: OPTIONS,
  };
  await ctx.route(`${MOCK}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(route, user);
    if (p.startsWith("/auth/v1/")) return json(route, session);
    if (p.startsWith("/rest/v1/rpc/")) {
      const fn = p.split("/").pop(); const body = JSON.parse(req.postData() || "{}"); calls.push({ fn, body });
      if (fn === "poll_details") {
        if (mode === "denied") return json(route, { code: "42501", message: "لا تملك صلاحية إدارة بوابة الحاج." }, 403);
        if (mode === "premigration") return json(route, { code: "PGRST202", message: "Could not find the function" }, 404);
        return json(route, details(body.p_poll_id));
      }
      if (fn === "get_poll_snapshot") { const dd = details(body.p_poll_id); return json(route, { poll_id: dd.poll_id, closed_at: dd.as_of, options: dd.options, labels: { ...dd.labels, camp_arafa: {} },
        rows: dd.rows.map(r => ({ ...r, camp_arafa: 5, hotel: 9 })), totals: { audience: 6, respondents: 4, options: [] }, checksum_valid: true }); }
      if (fn === "poll_results") return json(route, { totals: { audience: 6, respondents: 4, options: [] } });
      if (fn === "announcement_audience_preview") return json(route, [{ passenger_id: 101 }]);
      return json(route, fn === "push_enabled_passengers" ? [] : null);
    }
    if (p.startsWith("/rest/v1/")) {
      const t = p.split("/")[3];
      if (req.method() !== "GET" && req.method() !== "HEAD") writes.push(`${req.method()} ${t}`);
      const rows = filtered(tables[t] ?? [], url);
      if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-range": `0-0/${rows.length}` } });
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      return single ? (rows[0] ? json(route, rows[0]) : json(route, { code: "PGRST116" }, 406)) : json(route, rows);
    }
    return json(route, {});
  });
  await ctx.addInitScript(([s, th]) => { localStorage.setItem("sb-mock-auth-token", s); localStorage.setItem("hajj_theme", th); }, [JSON.stringify(session), theme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(APP + path, { waitUntil: "domcontentloaded" });
  if (path === "/portal-settings") {
    await page.getByRole("button", { name: "الاستطلاعات" }).first().waitFor({ timeout: 25000 });
    await page.getByRole("button", { name: "الاستطلاعات" }).first().click();
    await page.locator("[data-poll-id]").first().waitFor({ timeout: 10000 });
  }
  return { ctx, page, calls, writes, errors };
}
const openResults = async (page, id) => { await page.locator(`[data-poll-id="${id}"]`).getByRole("button", { name: "عرض النتائج" }).click(); await page.locator(".poll-results [data-kpi]").first().waitFor({ timeout: 8000 }); };
const kpi = (page, k) => page.locator(`[data-kpi="${k}"] div`).nth(1).innerText();
const drawerNames = async (page) => (await page.locator("[data-drawer] li[data-pid] a").allInnerTexts());
const closeDrawer = async (page) => { await page.keyboard.press("Escape"); await page.locator("[data-drawer]").waitFor({ state: "detached", timeout: 3000 }); };

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 500)); }
  const browser = await chromium.launch();

  /* ══ اختيارٌ واحد: النتائج · الأسماء · التوزيع · المشاركة · التصدير ══ */
  {
    const { ctx, page, calls, writes, errors } = await boot(browser);
    const btns = async (id) => page.locator(`[data-poll-id="${id}"]`).getByRole("button").allInnerTexts();
    check("«عرض النتائج» on published and closed polls only", (await btns(1)).includes("عرض النتائج") && (await btns(3)).includes("عرض النتائج") && !(await btns(4)).includes("عرض النتائج"));
    await openResults(page, 1);
    check("three tabs inside the poll management view", JSON.stringify(await page.getByRole("tab").allInnerTexts()) === JSON.stringify(["نتائج التصويت", "تحليل التوزيع", "المشاركة والمتابعة"]));
    check("results come from poll_details(1)", calls.some(c => c.fn === "poll_details" && c.body.p_poll_id === 1));
    check("KPIs: targeted 6, respondents 4, nonrespondents 2, participation 66.7%",
      `${await kpi(page, "audience")}|${await kpi(page, "respondents")}|${await kpi(page, "nonrespondents")}|${await kpi(page, "participation")}` === "6|4|2|66.7٪");
    const rowTxt = async (oid) => page.locator(`[data-option-row="${oid}"] [data-count]`).innerText();
    check("per option: counts and % of respondents (changed answer counted once)", `${await rowTxt(111)}|${await rowTxt(112)}|${await rowTxt(113)}` === "1 صوت · 25٪|3 صوت · 75٪|0 صوت · 0٪",
      `${await rowTxt(111)}|${await rowTxt(112)}|${await rowTxt(113)}`);
    check("progress bars carry their value", (await page.locator(`[data-option-row="112"] [role=progressbar]`).getAttribute("aria-valuenow")) === "75");
    await page.screenshot({ path: join(OUT, "results-desktop.png"), fullPage: true });

    await page.locator(`[data-option-row="112"] button`).click();
    await page.locator("[data-drawer]").waitFor();
    check("option drill-down: drawer lists exactly who chose «مساءً»", JSON.stringify((await drawerNames(page)).sort()) === JSON.stringify(["أحمد سالم", "جابر علي", "زياد خالد"].sort()), (await drawerNames(page)).join("،"));
    check("drawer: accessible dialog with focus inside", (await page.locator("[data-drawer]").getAttribute("role")) === "dialog" && await page.evaluate(() => !!document.activeElement?.closest("[data-drawer]")));
    await page.locator("[data-drawer]").getByLabel("بحث بالاسم").fill("جابر");
    check("drawer search", JSON.stringify(await drawerNames(page)) === JSON.stringify(["جابر علي"]));
    await page.locator("[data-drawer]").getByLabel("بحث بالاسم").fill("");
    await page.locator("[data-drawer]").getByLabel("الترتيب").selectOption("bus");
    check("drawer sort by bus", JSON.stringify(await drawerNames(page)) === JSON.stringify(["أحمد سالم", "زياد خالد", "جابر علي"]), (await drawerNames(page)).join("،"));
    check("pilgrim link uses the pilgrims page profile (/pilgrims?pid=)", (await page.locator("[data-drawer] li[data-pid='103'] a").getAttribute("href")) === "/pilgrims?pid=103");
    await page.screenshot({ path: join(OUT, "results-drawer.png") });
    await closeDrawer(page);

    /* تحليل التوزيع */
    await page.getByRole("tab", { name: "تحليل التوزيع" }).click();
    const grp = (k) => page.locator(`[data-group="${k}"]`);
    check("bus table: one row per bus + explicit «غير مُسنَد» last", JSON.stringify(await page.locator("[data-dist-table] tbody th").allInnerTexts()) === JSON.stringify(["باص ١", "باص ٢", "غير مُسنَد"]));
    const cells = async (k) => (await grp(k).locator("td").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim());
    check("bus 1: targeted 3, respondents 3, nonrespondents 0, 100%, each option with both %", JSON.stringify(await cells(1)) === JSON.stringify(["3", "3", "0", "100٪", "1 33.3٪ 33.3٪ من المجيبين", "2 66.7٪ 66.7٪ من المجيبين", "0 0٪ 0٪ من المجيبين"]), JSON.stringify(await cells(1)));
    check("bus 2 «مساءً»: 1 → 50٪ of targeted (primary) vs 100٪ of respondents (secondary)", (await grp(2).locator("[data-opt-cell='112'] [data-pct-targeted]").innerText()) === "50٪"
      && (await grp(2).locator("[data-opt-cell='112'] [data-pct-respondents]").innerText()) === "100٪ من المجيبين");
    const w = async (sel) => grp(2).locator(`[data-opt-cell='112'] ${sel}`).evaluate(e => [getComputedStyle(e).fontWeight, parseFloat(getComputedStyle(e).fontSize)]);
    const [tw, ts] = await w("[data-pct-targeted]"), [rw, rs] = await w("[data-pct-respondents]");
    check("targeted % is visually emphasised (bolder and larger than respondents %)", +tw >= 700 && +rw < 700 && ts > rs, `${tw}/${ts} vs ${rw}/${rs}`);
    check("unassigned bus: 1 targeted, 0 respondents, 1 nonrespondent (not dropped)", JSON.stringify((await cells("none")).slice(0, 4)) === JSON.stringify(["1", "0", "1", "0٪"]));
    await grp(2).locator("td").nth(2).getByRole("button").click();
    check("nonrespondents count is clickable → names (باص ٢: هشام)", JSON.stringify(await drawerNames(page)) === JSON.stringify(["هشام عمر"]));
    await closeDrawer(page);
    await grp(1).locator("[data-opt-cell='112']").getByRole("button").click();
    await page.locator("[data-drawer]").waitFor();
    check("bus × option count is clickable → names", JSON.stringify((await drawerNames(page)).sort()) === JSON.stringify(["أحمد سالم", "زياد خالد"].sort()));
    check("drill-down header shows the count and both percentages", (await page.locator("[data-drawer-sub]").innerText()) === "2 · 66.7٪ من المستهدفين · 66.7٪ من المجيبين", await page.locator("[data-drawer-sub]").innerText());
    await closeDrawer(page);
    await grp(2).locator("td").nth(0).getByRole("button").click();
    check("bus targeted count → names (incl. nonrespondent)", JSON.stringify((await drawerNames(page)).sort()) === JSON.stringify(["جابر علي", "هشام عمر"].sort()));
    await closeDrawer(page);
    await page.getByRole("radio", { name: "مخيمات منى" }).click();
    check("Mina table: منى أ · منى ب · غير مُسنَد", JSON.stringify(await page.locator("[data-dist-table] tbody th").allInnerTexts()) === JSON.stringify(["منى أ", "منى ب", "غير مُسنَد"]));
    check("Mina unassigned: 2 targeted (بلال, داود)", (await cells("none"))[0] === "2");
    check("dimensions offered: buses · Mina · outbound · return (no Arafat / hotels)", JSON.stringify(await page.getByRole("radiogroup", { name: "التوزيع حسب" }).getByRole("radio").allInnerTexts()) === JSON.stringify(["الباصات", "مخيمات منى", "رحلات الذهاب", "رحلات العودة"])
      && (await page.locator("section[aria-label='تحليل التوزيع']").innerText()).match(/عرفة|الفنادق/) === null);
    /* الرحلات */
    await page.getByRole("radio", { name: "رحلات الذهاب" }).click();
    const names = async () => (await page.locator("[data-dist-table] tbody th").allInnerTexts()).map(t => t.split("\n")[0]);
    check("outbound flights: QR1 · QR3 · غير مُسنَد", JSON.stringify(await names()) === JSON.stringify(["QR1", "QR3", "غير مُسنَد"]), JSON.stringify(await names()));
    check("outbound flight details shown (airline · date time · route)", (await grp(31).locator("[data-flight-detail]").innerText()).replace(/[\u2066\u2069]/g, "") === "القطرية · 2027-05-01 08:00 · من DOH إلى JED");
    check("outbound QR1: 3 targeted, 2 respondents, 1 nonrespondent, 66.7٪", JSON.stringify((await cells(31)).slice(0, 4)) === JSON.stringify(["3", "2", "1", "66.7٪"]), JSON.stringify(await cells(31)));
    check("outbound QR1 «صباحاً»: 33.3٪ of targeted · 50٪ of respondents", (await grp(31).locator("[data-opt-cell='111']").innerText()).replace(/\s+/g, " ").trim() === "1 33.3٪ 50٪ من المجيبين");
    check("outbound unassigned explicit (داود)", JSON.stringify((await cells("none")).slice(0, 3)) === JSON.stringify(["1", "0", "1"]));
    await grp(32).locator("td").nth(0).getByRole("button").click();
    check("outbound QR3 targeted → names", JSON.stringify((await drawerNames(page)).sort()) === JSON.stringify(["جابر علي", "زياد خالد"].sort()));
    await closeDrawer(page);
    await page.getByRole("radio", { name: "رحلات العودة" }).click();
    check("return flights are a separate dimension: QR2 (3) · غير مُسنَد (3)", JSON.stringify(await names()) === JSON.stringify(["QR2", "غير مُسنَد"]) && (await cells(41))[0] === "3" && (await cells("none"))[0] === "3");
    const targetedSum = async () => (await page.locator("[data-dist-table] tbody tr").evaluateAll(trs => trs.map(tr => +tr.querySelector("td").innerText.trim()))).reduce((a, b) => a + b, 0);
    const backSum = await targetedSum();
    await page.getByRole("radio", { name: "رحلات الذهاب" }).click();
    const goSum = await targetedSum();
    check("no double counting: outbound and return groups each add up to the 6 targeted", goSum === 6 && backSum === 6, `${goSum} ${backSum}`);
    await page.getByRole("radio", { name: "مخيمات منى" }).click();
    await page.getByRole("radio", { name: "رسم" }).click();
    check("chart view: one block per group, one bar per option (3 × 3), labelled with both %", (await page.locator("[data-dist-chart] [data-chart-group]").count()) === 3 && (await page.locator("[data-dist-chart] [role=img]").count()) === 9
      && ((await page.locator("[data-chart-group='7'] [role=img]").first().getAttribute("aria-label")) || "").includes("من المستهدفين"));
    await page.locator("[data-chart-group='7'] [role=img]").nth(1).click();
    check("chart bar is clickable → names (منى أ «مساءً»)", JSON.stringify((await drawerNames(page)).sort()) === JSON.stringify(["أحمد سالم", "جابر علي"].sort()));
    await closeDrawer(page);
    await page.screenshot({ path: join(OUT, "distribution-chart.png"), fullPage: true });

    /* المشاركة والمتابعة */
    await page.getByRole("tab", { name: "المشاركة والمتابعة" }).click();
    const pids = async () => page.locator("[data-people] tbody tr[data-pid]").evaluateAll(els => els.map(e => +e.getAttribute("data-pid")));
    check("participation: everyone listed (6)", (await pids()).length === 6);
    await page.getByRole("radio", { name: /^لم يجيبوا/ }).click();
    check("nonrespondents: داود and هشام", JSON.stringify((await pids()).sort()) === JSON.stringify([104, 105]));
    await page.getByLabel("الباص").selectOption("2");
    check("filter by bus 2 → هشام only; KPIs follow the filter (2 targeted)", JSON.stringify(await pids()) === JSON.stringify([105]) && (await kpi(page, "audience")) === "2");
    await page.getByLabel("الباص").selectOption("none");
    check("filter: unassigned bus", JSON.stringify(await pids()) === JSON.stringify([104]));
    await page.getByLabel("الباص").selectOption("all");
    await page.getByRole("radio", { name: /^أجابوا/ }).click();
    await page.getByLabel("مخيم منى").selectOption("7");
    check("filter by Mina أ + answered → أحمد, جابر", JSON.stringify((await pids()).sort()) === JSON.stringify([101, 103]));
    await page.getByLabel("مخيم منى").selectOption("all");
    await page.getByRole("radio", { name: /^الكل/ }).click();
    await page.locator("section[aria-label='المشاركة والمتابعة']").getByLabel("بحث بالاسم").fill("زياد");
    check("search by name", JSON.stringify(await pids()) === JSON.stringify([106]));
    await page.locator("section[aria-label='المشاركة والمتابعة']").getByLabel("بحث بالاسم").fill("");
    await page.locator("section[aria-label='المشاركة والمتابعة']").getByLabel("الترتيب").selectOption("status");
    check("sort by status: answered first", JSON.stringify((await pids()).slice(-2).sort()) === JSON.stringify([104, 105]));

    /* Excel */
    await page.getByRole("button", { name: /تصدير/ }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Excel/ }).click()]);
    const file = join(OUT, "export.xlsx"); await dl.saveAs(file);
    const wb = XLSX.read(readFileSync(file));
    check("Excel: sheets summary · answers · bus · Mina · outbound · return · nonrespondents", JSON.stringify(wb.SheetNames) === JSON.stringify(["الملخص", "الإجابات", "تحليل الباصات", "تحليل منى", "رحلات الذهاب", "رحلات العودة", "لم يجيبوا"]), wb.SheetNames.join(","));
    const aoa = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 });
    const sum = Object.fromEntries(aoa("الملخص").filter(r => r.length === 2).map(r => [r[0], r[1]]));
    check("Excel summary matches the screen (6 / 4 / 2 / 66.7%)", sum["المستهدفون"] === 6 && sum["المجيبون"] === 4 && sum["لم يجيبوا"] === 2 && sum["نسبة المشاركة"] === "66.7٪", JSON.stringify(sum));
    const ans = aoa("الإجابات").slice(1);
    check("Excel answers: 4 named respondents, changed answer once with revision 3", ans.length === 4 && ans.filter(r => r[1] === "أحمد سالم").length === 1 && ans.find(r => r[1] === "أحمد سالم")[7] === "مساءً" && ans.find(r => r[1] === "أحمد سالم")[8] === 3 && ans.find(r => r[1] === "أحمد سالم")[5] === "QR1" && ans.find(r => r[1] === "أحمد سالم")[6] === "QR2");
    check("Excel bus sheet incl. unassigned and nonrespondents", JSON.stringify(aoa("تحليل الباصات").slice(1).map(r => r.slice(0, 4))) === JSON.stringify([["باص ١", 3, 3, 0], ["باص ٢", 2, 1, 1], ["غير مُسنَد", 1, 0, 1]]));
    const b2 = aoa("تحليل الباصات")[2], hdr = aoa("تحليل الباصات")[0], ci = hdr.indexOf("مساءً (عدد)");
    check("Excel bus 2 «مساءً»: same as screen — 1 · 50٪ of targeted · 100٪ of respondents", JSON.stringify(b2.slice(ci, ci + 3)) === JSON.stringify([1, "50٪", "100٪"]) && hdr[ci + 1] === "مساءً (٪ من المستهدفين)", JSON.stringify(b2));
    check("Excel outbound sheet: QR1 with details, 3 / 2 / 1; unassigned row", JSON.stringify(aoa("رحلات الذهاب").slice(1).map(r => [r[0], String(r[1] ?? "").replace(/[\u2066\u2069]/g, ""), r[2], r[3], r[4]]))
      === JSON.stringify([["QR1", "القطرية · 2027-05-01 08:00 · من DOH إلى JED", 3, 2, 1], ["QR3", "القطرية · 2027-05-02 09:00 · من DOH إلى MED", 2, 2, 0], ["غير مُسنَد", "", 1, 0, 1]]), JSON.stringify(aoa("رحلات الذهاب").slice(1)));
    check("Excel return sheet: QR2 3, unassigned 3", JSON.stringify(aoa("رحلات العودة").slice(1).map(r => [r[0], r[2]])) === JSON.stringify([["QR2", 3], ["غير مُسنَد", 3]]));
    check("Excel nonrespondents", JSON.stringify(aoa("لم يجيبوا").slice(1).map(r => r[1]).sort()) === JSON.stringify(["داود يوسف", "هشام عمر"].sort()));

    /* PDF (عبر الطباعة الموحّدة) */
    await page.evaluate(() => { window.__printed = 0; });
    await page.getByRole("button", { name: /تصدير/ }).click();
    await page.getByRole("menuitem", { name: /PDF/ }).click();
    await page.waitForTimeout(600);
    const pdf = await page.evaluate(() => document.getElementById("__print_frame__")?.contentDocument?.documentElement.outerHTML || "");
    (await import("node:fs")).writeFileSync(join(OUT, "report.html"), pdf);
    check("PDF: branded RTL report with poll info, totals, both dimensions and charts", pdf.includes("حملة الاختبار") && pdf.includes("direction: rtl") && pdf.includes("متى تفضّل زيارة المدينة؟")
      && pdf.includes("66.7٪") && pdf.includes("الباصات") && pdf.includes("مخيمات منى") && pdf.includes("رحلات الذهاب") && pdf.includes("رحلات العودة") && pdf.includes("غير مُسنَد")
      && pdf.includes("<b>1</b> · <b>50٪</b>") && pdf.includes("100٪ من المجيبين") && /background:#[0-9A-F]{6}/i.test(pdf));
    check("no writes to any table while viewing/exporting results", writes.length === 0, writes.join(" "));
    check("no page errors", errors.length === 0, errors.join(" | "));
    await page.getByRole("button", { name: /رجوع إلى الاستطلاعات/ }).click();
    check("back returns to the poll list", await page.locator("[data-poll-form]").isVisible());
    await ctx.close();
  }

  /* ══ متعدّد ══ */
  {
    const { ctx, page } = await boot(browser);
    await openResults(page, 2);
    const t = await page.locator("section[aria-label='نتائج التصويت']").innerText();
    check("multiple: explains totals may exceed 100%", t.includes("قد يتجاوز مجموع نسب الخيارات ١٠٠٪"));
    const rowTxt = async (oid) => page.locator(`[data-option-row="${oid}"] [data-count]`).innerText();
    check("multiple: % of respondents (صباحاً 2/4=50%, مساءً 3/4=75%)", `${await rowTxt(211)}|${await rowTxt(212)}` === "2 صوت · 50٪|3 صوت · 75٪", `${await rowTxt(211)}|${await rowTxt(212)}`);
    await ctx.close();
  }

  /* ══ مغلق: لقطة الإغلاق ══ */
  {
    const { ctx, page } = await boot(browser);
    await openResults(page, 3);
    check("closed: labelled as the closing snapshot (assignment at closure)", (await page.locator("[data-source]").innerText()).startsWith("لقطة الإغلاق"));
    await page.getByRole("tab", { name: "تحليل التوزيع" }).click();
    check("closed distribution notes the assignment is as at closure", (await page.locator("section[aria-label='تحليل التوزيع']").innerText()).includes("لحظة إغلاق الاستطلاع"));
    await page.getByRole("radio", { name: "رحلات الذهاب" }).click();
    check("closed: flights from the snapshot by name, limitation stated, no invented flight details",
      (await page.locator("[data-flight-snapshot-note]").count()) === 1 && (await page.locator("[data-flight-detail]").count()) === 0
      && (await page.locator("[data-dist-table] tbody th").first().innerText()).startsWith("QR1"));
    await ctx.close();
  }

  /* ══ قبل تطبيق الترحيلة ══ */
  {
    const { ctx, page, calls } = await boot(browser, { mode: "premigration" });
    await openResults(page, 3);
    check("pre-migration: closed poll falls back to its Phase 2 snapshot (same totals)", calls.some(c => c.fn === "get_poll_snapshot") && (await kpi(page, "respondents")) === "4");
    await page.getByRole("button", { name: /رجوع/ }).click();
    await page.locator(`[data-poll-id="1"]`).getByRole("button", { name: "عرض النتائج" }).click();
    await page.waitForTimeout(800);
    check("pre-migration: published poll explains the pending migration, shows no numbers", (await page.locator(".poll-results").innerText()).includes("ترحيلة Phase 4") && (await page.locator("[data-kpi]").count()) === 0);
    await ctx.close();
  }

  /* ══ الصلاحية ══ */
  {
    const { ctx, page } = await boot(browser, { mode: "denied" });
    await page.locator(`[data-poll-id="1"]`).getByRole("button", { name: "عرض النتائج" }).click();
    await page.waitForTimeout(800);
    check("permission denied (42501): message, no names or numbers", (await page.locator(".poll-results").innerText()).includes("لا تملك صلاحية") && (await page.locator("[data-kpi]").count()) === 0);
    await ctx.close();
  }

  /* ══ الجوّال · RTL · السمات ══ */
  for (const [theme, vp, name] of [["qatar-heritage", { width: 390, height: 844 }, "mobile-390"], ["dark-heritage", { width: 1366, height: 900 }, "dark-desktop"], ["modern-green", { width: 360, height: 780 }, "modern-360"]]) {
    const { ctx, page, errors } = await boot(browser, { viewport: vp, theme });
    await openResults(page, 1);
    for (const tab of ["نتائج التصويت", "تحليل التوزيع", "المشاركة والمتابعة"]) {
      await page.getByRole("tab", { name: tab }).click();
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${name} · ${tab}: RTL and no page-level horizontal overflow`, ov <= 0 && (await page.evaluate(() => getComputedStyle(document.querySelector(".poll-results")).direction)) === "rtl", String(ov));
      await page.screenshot({ path: join(OUT, `${name}-${["results", "distribution", "participation"][["نتائج التصويت", "تحليل التوزيع", "المشاركة والمتابعة"].indexOf(tab)]}.png`), fullPage: true });
    }
    if (name === "mobile-390") {
      await page.getByRole("tab", { name: "نتائج التصويت" }).click();
      await page.locator(`[data-option-row="112"] button`).click();
      const w = await page.locator("[data-drawer]").evaluate(e => e.getBoundingClientRect().width);
      check("mobile: drawer fills the screen width", Math.abs(w - 390) <= 1, String(w));
      await page.screenshot({ path: join(OUT, "mobile-390-drawer.png") });
    }
    check(`${name}: no page errors`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ══ ملفُّ الحاجّ من الرابط ══ */
  {
    const { ctx, page, errors } = await boot(browser, { path: "/pilgrims?pid=103" });
    await page.waitForTimeout(3500);
    const url = page.url();
    const panel = await page.evaluate(() => [...document.querySelectorAll("div")].some(d => d.style.position === "sticky" && d.style.order === "-1" && d.innerText.includes("جابر علي")));
    check("deep link /pilgrims?pid=103 opens that pilgrim's profile panel and clears pid from the URL", panel && !url.includes("pid="), url);
    check("deep link: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  await browser.close();
} finally {
  vite.kill();
}
console.log(`\nresult: ${pass} passed · ${fail} failed — screenshots in ${OUT}`);
process.exit(fail ? 1 : 0);
