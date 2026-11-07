#!/usr/bin/env node
// ============================================================
// تحقّقُ الواجهة: المخيّم الخاصّ المختلط · بطاقة رحلة البوّابة · إجراءات الحجاج الثابتة
// ============================================================
/* يشغّل التطبيقَ (Vite) بعنوان Supabase وهميّ ويعترض كلَّ طلبٍ إليه ببياناتٍ اصطناعيّة —
   لا قاعدةَ ولا شبكةَ ولا بياناتٍ حقيقيّة. والقبولُ في القاعدة نفسها يختبره
   `supabase/verification/camps/private_mixed_gender_tests.sh`.

     ١) منى وعرفة: المخيّمُ العاديّ لا يعرض إلا جنسَه، والخاصّ يعرض الجنسين ويُسنَد إليه
        رجلٌ وامرأةٌ معاً (تحديدٌ جماعيّ ثم «إضافة»)، والنقلُ يعرض ما يقبل النازلَ وحده
     ٢) بطاقة رحلة البوّابة: شعارُ الشركة (القطريّة والسعوديّة) أو الطائرةُ العامّة،
        والطائرةُ تتحرّك على المسار وتسكن مع `prefers-reduced-motion`، وبلا فيضٍ على الجوّال
     ٣) صفحة الحجاج: «مسح» و«يدوي» في مكانهما؛ وإذا مُرِّرا خارج الشاشة ظهر شريطٌ واحدٌ ثابت
        بالمعالِجَين نفسيهما، لا يغطّي آخرَ الصفوف، ويختفي مع نافذة الإضافة

   node scripts/ui-verify/run.mjs [--out DIR] [--port 5181] */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg("--out", join(ROOT, ".print-verify-flow/ui")));
const PORT = +arg("--port", "5181");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const MOCK = "https://mock.supabase.test";
const vite = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: "mock-anon-key" }, stdio: "ignore" });
const APP = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 500)); }

const UID = "00000000-0000-4000-8000-000000000001";
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "staff@test.local", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "mock.jwt.token", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "mock-refresh", user };
const perms = Object.fromEntries(["manage_passengers", "manage_camps", "manage_buses", "manage_flights", "manage_hotel", "manage_payments", "manage_users", "view_reports"].map(k => [k, true]));
const season = { id: 1, name: "موسم ١٤٤٧", hijri_year: 1447, created_at: "2026-01-01", closed_at: null, closed_by: null, is_active: true };
const camp = (id, name, gender, type, page_type) => ({ id, name, gender, type, page_type, capacity: 10, sort_order: id, season_id: 1 });
const CAMPS = [camp(1, "عادي رجال", "ذكر", "عادي", "منى"), camp(2, "خاص أول", "ذكر", "خاص", "منى"), camp(3, "عادي نساء", "أنثى", "عادي", "منى"),
  camp(4, "عادي رجال", "ذكر", "عادي", "عرفة"), camp(5, "خاص أول", "ذكر", "خاص", "عرفة"), camp(6, "عادي نساء", "أنثى", "عادي", "عرفة")];
const P = (id, name, gender, extra = {}) => ({ id, season_id: 1, name_ar: name, short_ar: name, passenger_type: "حاج", gender, sort_order: id,
  camp_mina_id: null, camp_arafa_id: null, services: { camp_mina: "خاص", camp_arafa: "خاص" }, ...extra });
const CAMP_PAX = [P(1, "رجل أول", "ذكر"), P(2, "امرأة أولى", "أنثى"), P(3, "رجل ثان", "ذكر", { camp_mina_id: 1, camp_arafa_id: 4 }), P(4, "امرأة ثانية", "أنثى", { camp_mina_id: 3, camp_arafa_id: 6 })];
const MANY_PAX = Array.from({ length: 70 }, (_, i) => P(100 + i, `حاج قائمة ${i + 1}`, i % 2 ? "أنثى" : "ذكر", { nat: "قطر", passport: `P7${String(i).padStart(5, "0")}` }));

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
/* فلترةُ PostgREST البسيطة (`col=eq.v`) — تكفي لاستعلامات هذه الصفحات */
const filtered = (rows, url) => {
  let out = rows;
  for (const [k, v] of url.searchParams) {
    if (!v.startsWith("eq.")) continue;
    const want = decodeURIComponent(v.slice(3));
    out = out.filter(r => !(k in r) || String(r[k]) === want);
  }
  return out;
};

async function appContext(browser, viewport, passengers, { archived = false } = {}) {
  const ctx = await browser.newContext({ viewport });
  /* موسمٌ مؤرشَف معروض = للعرض فقط (`canWrite` خطأ) — كما يختاره الموظّف من مبدّل المواسم */
  const seasons = archived ? [season, { ...season, id: 2, name: "موسم ١٤٤٦", hijri_year: 1446, is_active: false, closed_at: "2025-08-01" }] : [season];
  const tables = { user_profiles: [{ id: UID, email: user.email, name: "موظف", permissions: perms, is_active: true }], seasons,
    passengers, camps: CAMPS, company_config: [{ id: 1, company_name: "حملة الاختبار", primary_color: "#6B1F3A", accent_color: "#085041", active_season_id: 1 }] };
  const patches = [], writes = [];
  await ctx.route(`${MOCK}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method()) && (path.startsWith("/rest/v1/") && !path.startsWith("/rest/v1/rpc/") || path.startsWith("/storage/v1/object/")))
      writes.push(`${req.method()} ${path}`);
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (path.startsWith("/auth/v1/user")) return json(route, user);
    if (path.startsWith("/auth/v1/")) return json(route, session);
    if (path.startsWith("/rest/v1/rpc/")) return json(route, null);
    if (path.startsWith("/rest/v1/")) {
      const t = path.split("/")[3], rows = filtered(tables[t] ?? [], url);
      if (req.method() === "PATCH") {
        const body = JSON.parse(req.postData() || "{}"); patches.push({ table: t, query: url.search, body });
        rows.forEach(r => Object.assign(r, body));
        return json(route, rows);
      }
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      return single ? (rows[0] ? json(route, rows[0]) : json(route, { code: "PGRST116" }, 406)) : json(route, rows);
    }
    return json(route, {});
  });
  await ctx.addInitScript(([s, a]) => { try { localStorage.setItem("sb-mock-auth-token", s); if (a) sessionStorage.setItem("hajj_viewed_season", "2"); } catch { /* */ } }, [JSON.stringify(session), archived]);
  return { ctx, patches, writes };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];

/* ══ ١) المخيّمات ══ */
for (const [path, pageName] of [["/mina", "منى"], ["/arafat", "عرفة"]]) {
  const pax = structuredClone(CAMP_PAX);
  const { ctx, patches } = await appContext(browser, { width: 1366, height: 900 }, pax);
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`${pageName}: ${e}`));
  await page.goto(APP + path, { waitUntil: "domcontentloaded" });
  await page.getByText("مخيم خاص أول").first().waitFor({ timeout: 20000 });
  const dialog = page.locator("[role=dialog]");
  const open = async name => { await page.getByText(`مخيم ${name}`).first().click(); await dialog.waitFor({ timeout: 5000 }); };
  const close = async () => { await dialog.getByRole("button", { name: "إغلاق" }).first().click(); await dialog.waitFor({ state: "detached", timeout: 5000 }).catch(() => {}); };

  await open("عادي رجال");
  const regText = await dialog.innerText();
  check(`${pageName}: regular men's tent lists unassigned men only`, regText.includes("رجل أول") && !regText.includes("امرأة أولى"), "");
  /* النقل من مخيّمٍ عاديّ: النازلُ «رجل ثان» يُعرض عليه ما يقبله — العاديُّ للرجال والخاصّ، لا مخيّمُ النساء */
  const moveOpts = await dialog.locator("select[aria-label^='نقل رجل ثان'] option").allInnerTexts();
  check(`${pageName}: transfer targets for a man = men's regular + private (not the women's tent)`,
    moveOpts.some(o => o.startsWith("خاص أول")) && !moveOpts.some(o => o.startsWith("عادي نساء")), moveOpts.join(" | "));
  await close();

  await open("عادي نساء");
  const womenOpts = await dialog.locator("select[aria-label^='نقل امرأة ثانية'] option").allInnerTexts();
  check(`${pageName}: transfer targets for a woman include the private tent, not the men's regular tent`,
    womenOpts.some(o => o.startsWith("خاص أول")) && !womenOpts.some(o => o.startsWith("عادي رجال")), womenOpts.join(" | "));
  await close();

  await open("خاص أول");
  const prvText = await dialog.innerText();
  /* منذ 20261107160000: الخاصّ تميّزه شارةُ «خاص» لا «رجال ونساء» (الطباعةُ وحدها تقولها صراحةً) */
  check(`${pageName}: private tent lists unassigned men AND women, shown as «خاص» (no «رجال ونساء»)`,
    prvText.includes("رجل أول") && prvText.includes("امرأة أولى") && prvText.includes("خاص") && !prvText.includes("رجال ونساء") && prvText.includes("من الحجاج"), "");
  await page.screenshot({ path: join(OUT, `camps-${pageName === "منى" ? "mina" : "arafa"}-private.png`) });
  /* إسنادٌ جماعيّ: رجلٌ وامرأةٌ معاً */
  for (const n of ["رجل أول", "امرأة أولى"]) await dialog.getByText(n, { exact: true }).first().click();
  await page.screenshot({ path: join(OUT, `camps-${pageName === "منى" ? "mina" : "arafa"}-picked.png`) });
  await dialog.getByRole("button", { name: /^إضافة/ }).last().click();
  /* تأكيدُ «الخدمة المطلوبة تخالف التوزيع» (عادي/خاص) — قاعدةٌ أخرى، باقيةٌ كما هي */
  const anyway = page.locator("[data-confirm-dialog] button", { hasText: "وزّع على أي حال" });
  if (await anyway.last().isVisible({ timeout: 2000 }).catch(() => false)) await anyway.last().click();
  await page.waitForTimeout(800);
  const col = pageName === "منى" ? "camp_mina_id" : "camp_arafa_id";
  const assigned = patches.filter(p => p.table === "passengers" && p.body[col] === 2 + (pageName === "منى" ? 0 : 3));
  check(`${pageName}: bulk add assigns a man and a woman to the private tent (no gender rejection)`,
    assigned.length === 2 && /id=eq\.1\b/.test(assigned.map(a => a.query).join()) && /id=eq\.2\b/.test(assigned.map(a => a.query).join()),
    assigned.map(a => a.query).join(" "));
  const alertShown = await page.getByText("الفصل بالجنس لا يُتجاوز").count();
  check(`${pageName}: no gender-separation alert for the private tent`, alertShown === 0);
  await ctx.close();
}

/* ══ ٢) بطاقة رحلة البوّابة ══ */
for (const [label, viewport, reduced] of [["desktop", { width: 520, height: 1100 }, false], ["mobile-360", { width: 360, height: 1100 }, false], ["reduced-motion", { width: 520, height: 1100 }, true]]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`portal ${label}: ${e}`));
  await page.goto(`${APP}/scripts/ui-verify/portal-card.html`, { waitUntil: "load" });
  await page.locator("[data-portal-flight-card]").nth(2).waitFor({ timeout: 20000 });
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => [...document.querySelectorAll("[data-portal-flight-card]")].map(card => {
    const mark = card.querySelector("[data-airline-mark]"), img = mark?.tagName === "IMG" ? mark : null;
    const plane = card.querySelector("[data-route-plane]"), cs = plane && getComputedStyle(plane);
    return { mark: mark?.getAttribute("data-airline-mark"), logoLoaded: img ? img.naturalWidth > 0 : null,
      anim: cs?.animationName, planeColor: cs?.color,
      /* نصٌّ أو شعارٌ خارج البطاقة (فتحتا التذكرة الزخرفيّتان مقصوصتان عمداً فلا تُعدّان) */
      overflowX: (() => { const c = card.getBoundingClientRect(); return [...card.querySelectorAll("div, span, img, sup")]
        .filter(e => e.childElementCount === 0 && (e.textContent?.trim() || e.tagName === "IMG"))
        .some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < c.left - 0.5 || r.right > c.right + 0.5); }); })(),
      text: card.innerText.replace(/\s+/g, " ") };
  }));
  check(`portal ${label}: airline logos (Qatar, Saudia) load; other airline falls back to the plane glyph`,
    m[0].mark === "qatar" && m[0].logoLoaded && m[1].mark === "saudia" && m[1].logoLoaded && m[2].mark === "generic", JSON.stringify(m.map(x => [x.mark, x.logoLoaded])));
  check(`portal ${label}: plane on the route ${reduced ? "is static (prefers-reduced-motion)" : "is animated (flPlaneFly)"}`,
    m.every(x => reduced ? x.anim === "none" : x.anim === "flPlaneFly"), m.map(x => x.anim).join(","));
  check(`portal ${label}: flight data kept (number, airports, times, class, next-day arrival)`,
    m[0].text.includes("QR 1186") && m[0].text.includes("DOH") && m[0].text.includes("JED") && m[0].text.includes("08:30") && m[0].text.includes("10:45")
    && m[1].text.includes("+1") && m[1].text.includes("الوصول في اليوم التالي") && m[1].text.includes("درجة أولى"), "");
  check(`portal ${label}: no horizontal overflow`, m.every(x => !x.overflowX) && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: join(OUT, `portal-flight-${label}.png`), fullPage: true });
  await ctx.close();
}

/* ══ ٣) صفحة الحجاج — الإجراءات الثابتة ══ */
for (const [label, viewport] of [["desktop", { width: 1366, height: 800 }], ["mobile-390", { width: 390, height: 844 }]]) {
  const { ctx } = await appContext(browser, viewport, structuredClone(MANY_PAX));
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`passengers ${label}: ${e}`));
  await page.goto(APP + "/pilgrims", { waitUntil: "domcontentloaded" });
  await page.getByText("حاج قائمة 70").first().waitFor({ state: "attached", timeout: 20000 });
  await page.waitForTimeout(500);
  const bar = page.locator("[data-sticky-pilgrim-actions]");
  check(`pilgrims ${label}: at the top the original buttons are in place and no extra bar is shown`,
    await page.locator("[title='مسح جواز / بطاقة / تصريح حج']:not([data-sticky-pilgrim-actions] *)").first().isVisible() && await bar.count() === 0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  await page.waitForTimeout(400);
  const vis = await bar.count() === 1 && await bar.isVisible();
  const origInView = await page.locator("[title='مسح جواز / بطاقة / تصريح حج']:not([data-sticky-pilgrim-actions] *)").first().evaluate(e => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  check(`pilgrims ${label}: scrolled down → exactly one compact bar, original buttons off-screen`, vis && !origInView);
  const box = vis ? await bar.boundingBox() : null;
  check(`pilgrims ${label}: bar fully inside the viewport`, box && box.x >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, JSON.stringify(box));
  await page.screenshot({ path: join(OUT, `pilgrims-sticky-${label}.png`) });
  /* المسح: نفسُ مدخل الملفّ */
  const chooser = page.waitForEvent("filechooser", { timeout: 3000 }).then(() => true).catch(() => false);
  await bar.getByRole("button", { name: /مسح مستند/ }).click();
  check(`pilgrims ${label}: bar «مسح مستند» opens the same document picker`, await chooser);
  /* آخر صفّ يُمرَّر فوق الشريط */
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const lastRow = await page.getByText("حاج قائمة 70").last().evaluate(e => (e.closest("tr") || e).getBoundingClientRect().bottom);
  const barTop = (await bar.boundingBox())?.y ?? Infinity;
  check(`pilgrims ${label}: at the bottom the last pilgrim row stays above the bar`, lastRow <= barTop + 0.5, `row bottom ${Math.round(lastRow)} · bar top ${Math.round(barTop)}`);
  /* الإضافة اليدويّة: نفسُ النافذة، والشريط يختفي معها */
  await bar.getByRole("button", { name: /إضافة يدوي/ }).click();
  await page.waitForTimeout(500);
  check(`pilgrims ${label}: bar «إضافة يدوي» opens the manual-add form and the bar hides`,
    await bar.count() === 0 && (await page.getByText(/إضافة حاج|إضافة يدوي|بيانات الحاج/).count()) > 0);
  await page.screenshot({ path: join(OUT, `pilgrims-manual-${label}.png`) });
  await ctx.close();
}

/* ══ ٣ب) للعرض فقط (موسمٌ مؤرشَف): الشريطُ الثابت كالأزرار الأصليّة تماماً ══
   «مسح» الأصليّ غيرُ مقيَّدٍ في هذا الوضع أصلاً (قائمٌ قبل هذا التغيير)، و«يدوي» معطَّل؛
   والشريطُ يطابقهما: لا يتجاوز قيداً ولا يضيف قيداً، ولا كتابةَ تخرج من الصفحة. */
{
  const { ctx, writes } = await appContext(browser, { width: 1366, height: 800 }, structuredClone(MANY_PAX).map(p => ({ ...p, season_id: 2 })), { archived: true });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`passengers read-only: ${e}`));
  await page.goto(APP + "/pilgrims", { waitUntil: "domcontentloaded" });
  await page.getByText("حاج قائمة 70").first().waitFor({ state: "attached", timeout: 20000 });
  await page.waitForTimeout(500);
  const origScan = page.locator("[title='مسح جواز / بطاقة / تصريح حج']:not([data-sticky-pilgrim-actions] *)").first();
  const origManual = page.locator("[title='إضافة يدوي']").first();
  const origState = { scanPE: await origScan.evaluate(e => getComputedStyle(e).pointerEvents), manualPE: await origManual.evaluate(e => getComputedStyle(e).pointerEvents) };
  const opensPicker = async loc => { const c = page.waitForEvent("filechooser", { timeout: 2500 }).then(() => true).catch(() => false); await loc.click({ force: true }); return c; };
  const origScanOpens = await opensPicker(origScan);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  await page.waitForTimeout(400);
  const bar = page.locator("[data-sticky-pilgrim-actions]");
  const barScan = bar.getByRole("button", { name: /مسح مستند/ }), barManual = bar.getByRole("button", { name: /إضافة يدوي/ });
  const barState = { scanDisabled: await barScan.isDisabled(), manualDisabled: await barManual.isDisabled(), manualPE: await barManual.evaluate(e => getComputedStyle(e).pointerEvents) };
  const barScanOpens = await opensPicker(barScan);
  check("read-only season: original «مسح» unrestricted (pre-existing) and the bar's «مسح مستند» is identical — same picker, no extra power",
    origState.scanPE !== "none" && origScanOpens && !barState.scanDisabled && barScanOpens, JSON.stringify({ origState, barState }));
  await barManual.click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  check("read-only season: «يدوي» blocked in both places — the bar's add button is disabled and opens nothing",
    origState.manualPE === "none" && barState.manualDisabled && barState.manualPE === "none" && await bar.count() === 1, JSON.stringify(barState));
  check("read-only season: no write request left the page", writes.length === 0, writes.join(" | "));
  await ctx.close();
}

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close(); vite.kill();
writeFileSync(join(OUT, "report.json"), JSON.stringify(results, null, 2));
const bad = results.filter(r => !r.ok);
console.log(bad.length ? `FAIL — ${bad.length} of ${results.length}` : `PASS — ${results.length} checks; evidence in ${OUT}`);
process.exit(bad.length ? 1 : 0);
