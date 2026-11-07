#!/usr/bin/env node
// ============================================================
// المخيّمات الخاصّة قسمٌ مستقلّ بلا جنس · بطاقاتٌ فاخرة للخاصّ وللباص VIP
// ============================================================
/* التطبيقُ الحقيقيّ (Vite) بعنوان Supabase وهميّ وبياناتٍ اصطناعيّة — لا قاعدةَ ولا
   بياناتٍ حقيقيّة. والقيودُ نفسُها في القاعدة يختبرها
   `supabase/verification/camps/private_gender_independent_tests.sh`.

   منى وعرفة:
     · ثلاثةُ أقسام: «رجال» للعاديّ، «نساء» للعاديّ، «الخيام الخاصة» للخاصّ كلّه — والخاصّ ذو
       الجنس القديم (رجالاً أو نساءً) فيه وحده، بلا تكرار
     · بطاقةُ الخاصّ فاخرة (إطارٌ ذهبيّ) بشارة «خاص» وبلا «رجال ونساء»؛ والعاديّة كما كانت
     · الإضافة: العاديّ بجنسٍ (رجال / نساء)، والخاصّ بلا حقل جنسٍ أصلاً ويُحفظ gender = null
     · التعديل: خاصٌّ ← عاديّ يطلب الجنس، ويرفض مخيّماً مأهولاً مختلطاً قبل أيّ كتابة؛
       عاديّ ← خاصّ يُسقط الجنس ويُنقل إلى آخر القسم الخاصّ
     · السحب داخل القسم الخاصّ يرتّبه وحده ويُحفظ
     · الإسنادُ المختلط إلى الخاصّ باقٍ، والعاديّ يعرض جنسه وحده
   الباصات: VIP فاخرٌ والعاديّ كما كان، والإسنادُ إلى VIP كما كان.
   السمتان الفاتحة والداكنة.

   node scripts/ui-verify/private-sections.mjs [--out DIR] [--port 5183] [--shots-only]
   (‎--shots-only‎: لقطاتٌ فقط — تُشغَّل على نسخة main للمقارنة «قبل»)  */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = resolve(arg("--root", join(HERE, "../..")));
const OUT = resolve(arg("--out", join(ROOT, ".print-verify-flow/private-sections")));
const PORT = +arg("--port", "5183");
const SHOTS_ONLY = process.argv.includes("--shots-only");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const MOCK = "https://mock.supabase.test";
const vite = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: "mock-anon-key" }, stdio: "ignore" });
/* خادمُ Vite يُوقَف عند أيّ خروج — وإلا بقي يحتلّ المنفذ بعد خطأٍ ويخدم شجرةً قديمة */
process.on("exit", () => { try { vite.kill(); } catch { /* انتهى */ } });
const APP = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 500)); }

const UID = "00000000-0000-4000-8000-000000000001";
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "staff@test.local", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "mock.jwt.token", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "mock-refresh", user };
const perms = Object.fromEntries(["manage_passengers", "manage_camps", "manage_buses", "manage_flights", "manage_hotel", "manage_payments", "manage_users", "view_reports"].map(k => [k, true]));
const season = { id: 1, name: "موسم ١٤٤٧", hijri_year: 1447, created_at: "2026-01-01", closed_at: null, closed_by: null, is_active: true };
const camp = (id, name, gender, type, page_type, sort_order) => ({ id, name, gender, type, page_type, capacity: 10, sort_order, season_id: 1 });
/* كالإنتاج: خاصّان بجنسٍ قديم (رجال ونساء)، وخاصٌّ جديدٌ بلا جنس، وعاديّان */
const campsFor = page => {
  const b = page === "منى" ? 0 : 100;
  return [camp(b + 1, "رجال أ", "ذكر", "عادي", page, 10), camp(b + 2, "خاص قديم رجال", "ذكر", "خاص", page, 20),
    camp(b + 3, "نساء أ", "أنثى", "عادي", page, 10), camp(b + 4, "خاص قديم نساء", "أنثى", "خاص", page, 20),
    /* «قبل» (‎--shots-only‎ على main): كالإنتاج اليوم — لكلّ خاصٍّ جنس، فلا مخيّمَ بلا جنس */
    camp(b + 5, "خاص جديد", SHOTS_ONLY ? "ذكر" : null, "خاص", page, 30)];
};
const P = (id, name, gender, extra = {}) => ({ id, season_id: 1, name_ar: name, short_ar: name, passenger_type: "حاج", gender, sort_order: id,
  camp_mina_id: null, camp_arafa_id: null, bus_id: null, services: { camp_mina: "خاص", camp_arafa: "خاص", bus: "VIP" }, ...extra });
const BUSES = [{ id: 1, name: "١", type: "عادي", capacity: 40, season_id: 1, sort_order: 10 }, { id: 2, name: "٢", type: "VIP", capacity: 20, season_id: 1, sort_order: 20 }];

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
const filtered = (rows, url) => {
  let out = rows;
  for (const [k, v] of url.searchParams) {
    if (v.startsWith("eq.")) { const want = decodeURIComponent(v.slice(3)); out = out.filter(r => !(k in r) || String(r[k]) === want); }
    if (v.startsWith("in.(")) { const set = new Set(decodeURIComponent(v.slice(4, -1)).split(",")); out = out.filter(r => set.has(String(r[k]))); }
  }
  return out;
};

async function appContext(browser, viewport, theme, tables) {
  const ctx = await browser.newContext({ viewport });
  const all = { user_profiles: [{ id: UID, email: user.email, name: "موظف", permissions: perms, is_active: true }], seasons: [season],
    company_config: [{ id: 1, company_name: "حملة الاختبار", primary_color: "#6B1F3A", accent_color: "#085041", active_season_id: 1 }], ...tables };
  const writes = [];
  let nextId = 900;
  await ctx.route(`${MOCK}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (path.startsWith("/auth/v1/user")) return json(route, user);
    if (path.startsWith("/auth/v1/")) return json(route, session);
    if (path.startsWith("/rest/v1/rpc/")) return json(route, null);
    if (path.startsWith("/rest/v1/")) {
      const t = path.split("/")[3];
      all[t] ??= [];
      if (req.method() === "POST") {
        const body = JSON.parse(req.postData() || "[]"); const rows = (Array.isArray(body) ? body : [body]).map(r => ({ id: ++nextId, season_id: 1, sort_order: 999, ...r }));
        writes.push({ method: "POST", table: t, body }); all[t].push(...rows); return json(route, rows, 201);
      }
      const rows = filtered(all[t], url);
      if (req.method() === "PATCH") {
        const body = JSON.parse(req.postData() || "{}"); writes.push({ method: "PATCH", table: t, query: decodeURIComponent(url.search), body });
        rows.forEach(r => Object.assign(r, body)); return json(route, rows);
      }
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      return single ? (rows[0] ? json(route, rows[0]) : json(route, { code: "PGRST116" }, 406)) : json(route, rows);
    }
    return json(route, {});
  });
  await ctx.addInitScript(([s, th]) => { try { localStorage.setItem("sb-mock-auth-token", s); localStorage.setItem("hajj_theme", th); } catch { /* */ } }, [JSON.stringify(session), theme]);
  return { ctx, writes, all };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const cardInfo = page => page.evaluate(() => [...document.querySelectorAll("[role=button][tabindex='0']")]
  .filter(e => /^(مخيم|باص) /.test(e.innerText.trim()))
  .map(e => { const cs = getComputedStyle(e), head = e.firstElementChild, hs = head && getComputedStyle(head);
    const sec = e.closest("div[style*='margin-bottom: 20px']")?.querySelector("[data-camp-section]")?.getAttribute("data-camp-section") ?? null;
    return { title: e.innerText.split("\n")[0].trim(), text: e.innerText, premium: e.hasAttribute("data-premium-card"), border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      headShadow: hs?.boxShadow ?? "", badge: !!e.querySelector("[data-premium-badge]"), section: sec }; }));

for (const theme of ["qatar-heritage", "dark-heritage"]) {
  const tag = theme === "dark-heritage" ? "dark" : "light";
  /* الإطارُ الذهبيّ (`--premium`) — العرضُ 1.5px يُقرّبه Chromium إلى بكسل الجهاز، فيُفحص اللونُ */
  const GOLD = theme === "dark-heritage" ? /solid rgb\(212, 172, 79\)/ : /solid rgb\(184, 145, 58\)/;
  for (const [path, page_type, col] of [["/mina", "منى", "camp_mina_id"], ["/arafat", "عرفة", "camp_arafa_id"]]) {
    const camps = campsFor(page_type), base = page_type === "منى" ? 0 : 100;
    const pax = [P(1, "رجل حر", "ذكر"), P(2, "امرأة حرة", "أنثى"),
      P(3, "رجل في الخاص", "ذكر", { [col]: base + 2 }), P(4, "امرأة في الخاص", "أنثى", { [col]: base + 2 })];
    const { ctx, writes } = await appContext(browser, { width: 1366, height: 1000 }, theme, { camps, passengers: pax, buses: BUSES });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`${tag} ${page_type}: ${e}`));
    await page.goto(APP + path, { waitUntil: "domcontentloaded" });
    await page.getByText("مخيم رجال أ").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(500);
    const shot = `camps-${page_type === "منى" ? "mina" : "arafa"}-${tag}`;
    await page.screenshot({ path: join(OUT, `${shot}.png`), fullPage: true });
    if (SHOTS_ONLY) { await ctx.close(); continue; }
    const P_ = `${tag} ${page_type}`;

    const cards = await cardInfo(page);
    const priv = cards.filter(c => /خاص/.test(c.title)), reg = cards.filter(c => !/خاص/.test(c.title));
    const sections = await page.$$eval("[data-camp-section]", els => els.map(e => e.getAttribute("data-camp-section")));
    check(`${P_}: three sections in order رجال · نساء · الخيام الخاصة`, sections.join() === "ذكر,أنثى,خاص", sections.join());
    check(`${P_}: every private camp (legacy men/women and new) only in «الخيام الخاصة», none duplicated`,
      priv.length === 3 && priv.every(c => c.section === "خاص") && new Set(cards.map(c => c.title)).size === cards.length && cards.length === 5,
      priv.map(c => `${c.title}@${c.section}`).join(" | "));
    check(`${P_}: regular camps stay in رجال / نساء`, reg.find(c => c.title === "مخيم رجال أ")?.section === "ذكر" && reg.find(c => c.title === "مخيم نساء أ")?.section === "أنثى");
    check(`${P_}: private cards premium (gold border, gold top line, «خاص» badge) without «رجال ونساء»`,
      priv.every(c => c.premium && c.badge && GOLD.test(c.border) && /inset/.test(c.headShadow) && !c.text.includes("رجال ونساء") && !/\n(رجال|نساء)\n/.test(c.text)),
      priv.map(c => c.border).join(" | "));
    check(`${P_}: regular cards unchanged (1px line border, no gold, gender label kept)`,
      reg.every(c => !c.premium && !c.badge && /^1px solid/.test(c.border) && c.headShadow === "none") && reg.find(c => c.title === "مخيم رجال أ").text.includes("رجال"),
      reg.map(c => c.border).join(" | "));

    /* الإسناد المختلط إلى الخاصّ — والعاديّ يعرض جنسه */
    const dialog = page.locator("[role=dialog]");
    await page.getByText("مخيم خاص جديد").first().click(); await dialog.waitFor();
    const dlgText = await dialog.innerText();
    check(`${P_}: private camp dialog lists men and women, shows «خاص» and no «رجال ونساء»`,
      dlgText.includes("رجل حر") && dlgText.includes("امرأة حرة") && !dlgText.includes("رجال ونساء"));
    await dialog.getByRole("button", { name: "إغلاق" }).first().click();
    await page.getByText("مخيم رجال أ").first().click(); await dialog.waitFor();
    const regText = await dialog.innerText();
    check(`${P_}: regular men's camp lists men only`, regText.includes("رجل حر") && !regText.includes("امرأة حرة"));
    await dialog.getByRole("button", { name: "إغلاق" }).first().click();

    /* الإضافة */
    const add = async (name, type, gender) => {
      await page.getByRole("button", { name: /مخيم جديد/ }).click();
      await page.getByRole("radio", { name: type }).click();
      const genderShown = await page.locator("[data-camp-gender-field]").count();
      if (gender) await page.getByRole("radio", { name: gender }).click();
      await page.getByText("رقم / اسم المخيم").locator("xpath=following-sibling::input").fill(name);
      await page.getByText("السعة (عدد الأماكن)", { exact: false }).locator("xpath=following-sibling::input").fill("12");
      await page.getByRole("button", { name: /إضافة$/ }).last().click();
      await page.waitForTimeout(500);
      return genderShown;
    };
    const shownReg = await add("رجال ب", "عادي", "رجال");
    const shownWomen = await add("نساء ب", "عادي", "نساء");
    const shownPriv = await add("خاص ب", "خاص", null);
    const posts = writes.filter(w => w.method === "POST" && w.table === "camps").map(w => w.body[0]);
    check(`${P_}: create regular men / women — gender selector shown and saved`,
      shownReg === 1 && shownWomen === 1 && posts[0]?.gender === "ذكر" && posts[0]?.type === "عادي" && posts[1]?.gender === "أنثى", JSON.stringify(posts.slice(0, 2)));
    check(`${P_}: create private — no gender selector, saved with gender = null`,
      shownPriv === 0 && posts[2]?.type === "خاص" && posts[2]?.gender === null && "gender" in (posts[2] ?? {}), JSON.stringify(posts[2]));
    const cardsAfter = await cardInfo(page);
    check(`${P_}: the new private camp appears in «الخيام الخاصة» only`, cardsAfter.filter(c => c.title === "مخيم خاص ب").map(c => c.section).join() === "خاص");

    /* التعديل: خاصٌّ مأهولٌ مختلط ← عاديّ مرفوضٌ قبل الكتابة؛ خاصٌّ ← عاديّ يطلب الجنس؛ عاديّ ← خاصّ */
    const editCamp = async title => { await page.getByText(title).first().click(); await dialog.waitFor(); await dialog.getByRole("button", { name: /تعديل المخيم/ }).click(); await page.waitForTimeout(200); };
    const before = writes.length;
    await editCamp("مخيم خاص قديم رجال");
    const editPrivGender = await page.locator("[data-camp-gender-field]").count();
    await page.getByRole("radio", { name: "عادي" }).click();
    const noGenderSel = await page.getByRole("radio", { name: "رجال" }).getAttribute("aria-checked");
    await page.getByRole("button", { name: /^.*حفظ$/ }).last().click(); await page.waitForTimeout(300);
    const needGender = await page.getByRole("alert").filter({ hasText: "اختر جنس المخيم العادي" }).count();
    await page.getByRole("radio", { name: "رجال" }).click();
    await page.getByRole("button", { name: /^.*حفظ$/ }).last().click(); await page.waitForTimeout(300);
    const mixedBlocked = await page.getByRole("alert").filter({ hasText: "من غير الرجال" }).count();
    check(`${P_}: edit private — gender hidden; switching to regular requires a gender, and a mixed occupied camp is refused before any write`,
      editPrivGender === 0 && noGenderSel === "false" && needGender === 1 && mixedBlocked === 1 && writes.length === before, `writes ${writes.length - before}`);
    await page.getByRole("button", { name: "إلغاء" }).last().click();
    await dialog.getByRole("button", { name: "إغلاق" }).first().click().catch(() => {});

    await editCamp("مخيم خاص جديد");
    await page.getByText("رقم / اسم المخيم").locator("xpath=following-sibling::input").fill("خاص جديد معدّل");
    await page.getByRole("radio", { name: "عادي" }).click(); await page.getByRole("radio", { name: "نساء" }).click();
    await page.getByRole("button", { name: /^.*حفظ$/ }).last().click(); await page.waitForTimeout(500);
    const toReg = writes.filter(w => w.method === "PATCH" && w.table === "camps" && w.query.includes(`id=eq.${base + 5}`)).pop();
    const regNow = (await cardInfo(page)).find(c => c.title === "مخيم خاص جديد معدّل");
    check(`${P_}: edit empty private → regular women (name too) saves type/gender and moves the card to «نساء»`,
      toReg?.body.type === "عادي" && toReg?.body.gender === "أنثى" && toReg?.body.name === "خاص جديد معدّل" && regNow?.section === "أنثى" && !regNow.premium, JSON.stringify(toReg?.body));
    await dialog.getByRole("button", { name: "إغلاق" }).first().click().catch(() => {});

    await editCamp("مخيم رجال أ");
    await page.getByRole("radio", { name: "خاص" }).click();
    const hiddenOnSwitch = await page.locator("[data-camp-gender-field]").count();
    await page.getByRole("button", { name: /^.*حفظ$/ }).last().click(); await page.waitForTimeout(500);
    const toPriv = writes.filter(w => w.method === "PATCH" && w.table === "camps" && w.query.includes(`id=eq.${base + 1}`)).pop();
    const privNow = (await cardInfo(page)).find(c => c.title === "مخيم رجال أ");
    check(`${P_}: edit regular → private hides the gender, saves gender = null, moves the card to the end of «الخيام الخاصة» (premium)`,
      hiddenOnSwitch === 0 && toPriv?.body.type === "خاص" && toPriv?.body.gender === null && toPriv?.body.sort_order > 30 && privNow?.section === "خاص" && privNow.premium,
      JSON.stringify(toPriv?.body));
    await dialog.getByRole("button", { name: "إغلاق" }).first().click().catch(() => {});

    /* السحب داخل القسم الخاصّ */
    const n0 = writes.length;
    const privCards = page.locator("[data-camp-section='خاص']").locator("xpath=..").locator("[draggable=true]");
    await privCards.nth(2).dragTo(privCards.nth(0));
    await page.waitForTimeout(800);
    const orderWrites = writes.slice(n0).filter(w => w.method === "PATCH" && w.table === "camps" && "sort_order" in w.body);
    const touched = orderWrites.map(w => +w.query.match(/id=eq\.(\d+)/)[1]);
    const privateNow = (await cardInfo(page)).filter(c => c.section === "خاص").map(c => c.title);
    /* الخاصّ الآن: القديمان، و«خاص ب» الجديد، و«رجال أ» المحوَّل — وما يُرقَّم منهم وحدهم */
    const privateIds = new Set([base + 1, base + 2, base + 4]);
    check(`${P_}: drag-and-drop inside «الخيام الخاصة» renumbers private camps only and persists`,
      orderWrites.length === 4 && touched.filter(id => !privateIds.has(id)).length === 1 && touched.every(id => privateIds.has(id) || id > 900)
      && orderWrites.every(w => w.body.sort_order % 10 === 0) && privateNow[0] !== "مخيم خاص قديم رجال",
      `${touched.join(",")} → ${privateNow.join(" | ")}`);
    await page.screenshot({ path: join(OUT, `${shot}-after-edits.png`), fullPage: true });
    await ctx.close();
  }

  /* الباصات */
  const pax = [P(1, "راكب أول", "ذكر"), P(2, "راكبة", "أنثى")];
  const { ctx, writes } = await appContext(browser, { width: 1366, height: 900 }, theme, { buses: structuredClone(BUSES), passengers: pax, camps: [] });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`${tag} buses: ${e}`));
  await page.goto(APP + "/buses", { waitUntil: "domcontentloaded" });
  await page.getByText("باص ٢").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `buses-${tag}.png`), fullPage: true });
  if (!SHOTS_ONLY) {
    const bc = await cardInfo(page);
    const vip = bc.find(c => c.title === "باص ٢"), reg = bc.find(c => c.title === "باص ١");
    check(`${tag} buses: VIP bus card premium (gold border, gold top line, gold VIP badge)`, vip?.premium && vip.badge && GOLD.test(vip.border) && /inset/.test(vip.headShadow), vip?.border);
    check(`${tag} buses: regular bus card unchanged`, reg && !reg.premium && !reg.badge && /^1px solid/.test(reg.border) && reg.headShadow === "none", reg?.border);
    const dialog = page.locator("[role=dialog]");
    await page.getByText("باص ٢").first().click(); await dialog.waitFor();
    await dialog.getByText("راكب أول", { exact: true }).first().click();
    await dialog.getByRole("button", { name: /^إضافة/ }).last().click();
    const anyway = page.locator("[data-confirm-dialog] button", { hasText: /على أي حال|تأكيد/ });
    if (await anyway.last().isVisible({ timeout: 1500 }).catch(() => false)) await anyway.last().click();
    await page.waitForTimeout(600);
    const assign = writes.find(w => w.method === "PATCH" && w.table === "passengers" && w.body.bus_id === 2);
    check(`${tag} buses: assigning to the VIP bus works as before`, !!assign && /id=eq\.1\b/.test(assign.query), assign?.query);
  }
  await ctx.close();
}

if (!SHOTS_ONLY) check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close(); vite.kill();
writeFileSync(join(OUT, "report.json"), JSON.stringify(results, null, 2));
const bad = results.filter(r => !r.ok);
console.log(SHOTS_ONLY ? `screenshots in ${OUT}` : bad.length ? `FAIL — ${bad.length} of ${results.length}` : `PASS — ${results.length} checks; evidence in ${OUT}`);
process.exit(bad.length ? 1 : 0);
