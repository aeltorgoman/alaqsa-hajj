#!/usr/bin/env node
// ============================================================
// مسارُ المسح والحفظ والربط من واجهة التطبيق الحقيقيّة — Chromium يقود صفحة الحجّاج
// ============================================================
/* يشغّل التطبيقَ (Vite) بعنوان Supabase وهميّ، ويعترض كلَّ طلب: حجّاجٌ اصطناعيّون في
   الموسم الحالي (وحاجٌّ في موسمٍ سابق لا يُجلب)، وقارئُ المستندات وهميٌّ يُعيد ما يحدّده
   كلُّ سيناريو. ويُسجَّل كلُّ طلب كتابة (إدراج/تحديث/رفع) ليُثبَت أنّ الرفضَ لا يكتب شيئاً.
   لا قاعدةَ ولا شبكةَ ولا بياناتٍ حقيقيّة.

   node scripts/pilgrim-match/scan-flow.mjs [--port 5181] */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg("--port", "5181");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const MOCK = "https://mock.supabase.test";
const vite = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: "mock-anon-key" }, stdio: "ignore" });
const APP = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 500)); }
const stage = (s) => { if (process.env.FLOW_DEBUG) console.log("·", s); };
stage("vite up");

/* ── بياناتٌ اصطناعيّة ── */
const UID = "00000000-0000-4000-8000-000000000001";
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "staff@test.local", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "mock.jwt.token", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "mock-refresh", user };
const season = { id: 1, name: "موسم ١٤٤٧", hijri_year: 1447, created_at: "2026-01-01", closed_at: null, closed_by: null, hotel_name: null };
const pilgrim = (id, season_id, name_ar, extra) => ({ id, season_id, name_ar, short_ar: name_ar.split(" ").slice(0, 2).join(" "), name_en: "", short_en: "",
  passenger_type: "حاج", gender: "ذكر", nat: "قطري", dob: "", passport: "", national_id: "", passport_url: null, national_id_url: null,
  sort_order: id, phone: "", requested_hotel_id: 7, ...extra });
const PILGRIMS = [
  pilgrim(1, 1, "محمد علي سالم الهاجري", { dob: "01/02/1960", passport: "A1234567", national_id: "28763400001", passport_url: "1/passport_doc_1.jpg" }),
  pilgrim(2, 1, "محمد علي حسن المري", { dob: "05/06/1970", passport: "B7654321", national_id: "29000000002" }),
  pilgrim(3, 1, "خالد يوسف عمر الكواري", {}),
  pilgrim(90, 0, "حاج الموسم السابق", { passport: "Z9990001" }),   // موسمٌ سابق — لا يُجلب
];
const TABLES = {
  user_profiles: [{ id: UID, email: user.email, name: "موظف التسجيل", permissions: { manage_passengers: true, manage_users: true }, is_active: true }],
  seasons: [season], hotels: [{ id: 7, season_id: 1, city: "مكة", name: "فندق الاختبار", address: null, map_url: null, notes: null, sort_order: 1 }],
  company_config: [{ id: 1, company_name: "حملة الاختبار", primary_color: "#6B1F3A", accent_color: "#085041" }],
};

/* ── ما يتحكّم به السيناريو ── */
let scan = null;                // ما يُعيده القارئ: كائنُ حقول، أو "fail"
let insertResponse = null;      // ردُّ إدراج حاجّ (null = نجاح)
let failLookup = false;         // تعطّلُ التحقّق من التكرار على الخادم
const writes = [];              // كلُّ طلب كتابة

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.route(`${MOCK}/**`, async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname, m = req.method();
  if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  if (path.startsWith("/auth/v1/user")) return json(route, user);
  if (path.startsWith("/auth/v1/token")) return json(route, session);
  if (path.startsWith("/auth/v1/")) return json(route, {});
  if (path.startsWith("/functions/v1/Scan-passport")) {
    if (scan === "fail") return json(route, { error: "provider down" }, 500);
    return json(route, { content: [{ type: "text", text: JSON.stringify(scan) }] });
  }
  if (path.startsWith("/storage/v1/")) {
    if (m !== "GET") writes.push({ m, path });
    if (path.includes("/object/sign/")) return json(route, { signedURL: "/object/sign/x?token=t" });
    return json(route, { Key: "k" });
  }
  if (path.startsWith("/rest/v1/rpc/")) return json(route, null);
  if (path.startsWith("/rest/v1/")) {
    const table = path.split("/")[3];
    if (m !== "GET") {
      writes.push({ m, table, query: url.search, body: req.postData() });
      if (table === "passengers" && m === "POST" && insertResponse) return json(route, insertResponse.body, insertResponse.status);
      if (table === "passengers" && m === "PATCH") {
        const id = +(url.searchParams.get("id") || "").replace("eq.", "");
        return json(route, [{ id }]);
      }
      return json(route, [{ id: 500 }], 201);
    }
    if (table === "passengers") {
      const q = url.searchParams;
      /* التحقّقُ من التكرار في الموسم عند التعديل: select=id&season_id=eq.&passport=eq.&id=neq. */
      if (q.get("select") === "id" && (q.has("passport") || q.has("national_id"))) {
        if (failLookup) return json(route, { message: "lookup unavailable" }, 500);
        const col = q.has("passport") ? "passport" : "national_id", val = q.get(col).replace(/^eq\./, ""), not = +(q.get("id") || "neq.0").replace("neq.", "");
        return json(route, PILGRIMS.filter(p => p.season_id === 1 && p[col] === val && p.id !== not).map(p => ({ id: p.id })).slice(0, 1));
      }
      const sid = q.get("season_id");
      const rows = sid ? PILGRIMS.filter(p => `eq.${p.season_id}` === sid) : PILGRIMS;
      return json(route, rows);
    }
    const rows = TABLES[table] ?? [];
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    return single ? (rows[0] ? json(route, rows[0]) : json(route, { code: "PGRST116", message: "no rows" }, 406)) : json(route, rows);
  }
  return route.fulfill({ status: 404, body: "" });
});
await ctx.addInitScript(([k, s]) => { try { localStorage.setItem(k, s); } catch { /* */ } }, ["sb-mock-auth-token", JSON.stringify(session)]);

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const IMG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const visible = async (text) => page.getByText(text, { exact: false }).first().isVisible().catch(() => false);
const pause = (ms = 600) => page.waitForTimeout(ms);
/* بين السيناريوهات: صفحةٌ جديدة — لا مودالٌ ولا حالةٌ من سابقه */
async function closeAll() {
  await page.goto(`${APP}/pilgrims`, { waitUntil: "domcontentloaded" });
  await page.getByText("خالد يوسف").first().waitFor({ timeout: 20000 });
}
async function scanAs(fields, docType = "passport") {
  scan = fields === "fail" ? "fail" : { doc_type: docType, name_en: "", name_ar: "", passport: "", national_id: "", nationality: "قطري", dob: "", expiry: "", gender: "ذكر", ...fields };
  writes.length = 0;
  await page.setInputFiles("#scan-input-btn", { name: "doc.png", mimeType: "image/png", buffer: IMG });
  await pause(1500);
}
const NEW_BTN = "لا، هذا حاج جديد";
const SUGGEST = "تشابهٌ في الاسم الكامل";
const EXACT = "تكرارٌ مؤكَّد";
/* نموذجُ الإضافة مفتوحٌ بالرقم المقروء */
const manualOpenWith = async (value) => page.locator(`input[value="${value}"]`).first().isVisible().catch(() => false);

page.setDefaultTimeout(8000);
stage("goto");
await page.goto(`${APP}/pilgrims`, { waitUntil: "domcontentloaded" });
await page.getByText("خالد يوسف").first().waitFor({ timeout: 20000 });
stage("list loaded");

/* ── (ب) تشابهُ الاسم ── */
await scanAs({ name_ar: "محمد يوسف عمر الدوسري", passport: "N1000001", dob: "01/02/1960" });
check("1. same first name only → no warning; new-pilgrim form opens", !(await visible(SUGGEST)) && await manualOpenWith("N1000001"));
await closeAll();
await scanAs({ name_ar: "محمد علي ناصر الكبيسي", passport: "N1000002", dob: "01/02/1960" });
check("2. same first two names (+ same DOB) → no warning", !(await visible(SUGGEST)) && await manualOpenWith("N1000002"));
await closeAll();
await scanAs({ name_ar: "محمد علي سالم الكبيسي", passport: "N1000003", dob: "02/02/1960" });
check("3. same three names, different DOB → no warning", !(await visible(SUGGEST)) && await manualOpenWith("N1000003"));
await closeAll();
await scanAs({ name_ar: "محمد علي سالم الكبيسي", passport: "N1000004", dob: "1/2/1960" });
check("4. same three names + same DOB → possible-match suggestion naming the pilgrim, new pilgrim still allowed",
  await visible(SUGGEST) && await visible("محمد علي") && await page.getByRole("button", { name: NEW_BTN }).isVisible().catch(() => false));
await closeAll();
await scanAs({ name_ar: "محمد علي حسن المري", passport: "N1000005" });
check("5. identical complete four-part name (no DOB) → possible-match suggestion", await visible(SUGGEST));
await closeAll();
await scanAs({ name_ar: "مُحَمَّد عَلِيّ حَسَن المَرِّي", passport: "N1000006" });
check("6. Arabic spelling variation (diacritics) → same suggestion", await visible(SUGGEST));
await closeAll();
await scanAs({ name_ar: "", name_en: "khalid  YOUSEF omar al-kuwari", passport: "N1000007" });
check("7. English case/spacing/hyphen does not create a match against an Arabic-only record (no name_en stored)", !(await visible(SUGGEST)));
await closeAll();
check("1–7: scanning never wrote anything", writes.length === 0, JSON.stringify(writes));

/* ── (أ) تطابقُ المستند ── */
await scanAs({ name_ar: "اسم مختلف تماماً هنا", passport: " a1234567 " });
check("8. exact passport (normalized) whose image is on file → duplicate warning naming the pilgrim, with «open record»",
  await visible("مستندٌ مسجَّل") && await visible("محمد علي سالم الهاجري") && await page.getByRole("button", { name: "فتح ملف الحاجّ" }).isVisible().catch(() => false));
await page.getByRole("button", { name: "فتح ملف الحاجّ" }).click().catch(() => {});
await pause(600);
check("8b. «open record» opens the existing pilgrim's file", await page.getByRole("button", { name: /تعديل/ }).last().isVisible().catch(() => false) && await visible("A1234567"));
check("8c. no write", writes.length === 0, JSON.stringify(writes));
await closeAll();
await scanAs({ name_ar: "اسم مختلف تماماً هنا", national_id: "٢٩٠٠٠٠٠٠٠٠٢" }, "idcard");
check("9. exact national ID (Arabic digits) → confirmed duplicate: only that pilgrim, no «new pilgrim»",
  await visible(EXACT) && await visible("محمد علي") && !(await page.getByRole("button", { name: NEW_BTN }).isVisible().catch(() => false)));
check("9b. no write before the user links", writes.length === 0, JSON.stringify(writes));
await closeAll();

/* ── (ج) موسمٌ سابق ── */
await scanAs({ name_ar: "حاج الموسم السابق", passport: "Z9990001" });
check("10. passport of a previous-season pilgrim → treated as a new registration", !(await visible(EXACT)) && !(await visible("مستندٌ مسجَّل")) && await manualOpenWith("Z9990001"));
await closeAll();

/* ── (١٣) فشلُ القراءة ── */
await scanAs("fail");
check("13. OCR failure → empty new-pilgrim form, nothing written", writes.length === 0 && !(await visible(EXACT)) && !(await visible(SUGGEST)));
await closeAll();

/* ── (١١) حفظٌ متزامن: موظّفٌ آخر سبق بالرقم نفسه — الفهرسُ الفريد يرفض ── */
await scanAs({ name_ar: "سالم ناصر حمد العلي", passport: "N2000001" });
insertResponse = { status: 409, body: { code: "23505", message: 'duplicate key value violates unique constraint "passengers_season_passport_uniq"', details: null, hint: null } };
await page.getByRole("button", { name: /^\s*حفظ\s*$/ }).last().click().catch(() => {});
await pause(1200);
check("11. concurrent registration (DB unique violation) → clear duplicate message, no further writes",
  await visible("مسجَّل بالفعل لحاجٍّ آخر في هذا الموسم") && writes.filter(w => w.table === "passengers").length === 1 && !writes.some(w => w.path),
  JSON.stringify(writes.map(w => w.m + " " + (w.table || w.path))));
insertResponse = null;
await closeAll();

/* ── (١٢) ربطُ مستندٍ لحاجٍّ آخر من ملفّ الحاجّ ── */
await page.getByText("خالد يوسف").first().click();
await pause(600);
await page.getByRole("button", { name: "المستندات", exact: true }).last().click();
await pause(300);
scan = { doc_type: "passport", name_ar: "خالد يوسف عمر الكواري", passport: "A1234567", nationality: "قطري", dob: "", expiry: "", gender: "ذكر", name_en: "", national_id: "" };
writes.length = 0;
await page.setInputFiles("#upload-passport_doc", { name: "p.png", mimeType: "image/png", buffer: IMG }).catch(e => check("12. upload input present", false, String(e)));
await pause(1500);
check("12. linking a passport already assigned to another pilgrim → refused, naming that pilgrim; nothing uploaded or saved",
  await visible("محمد علي سالم الهاجري") && await visible("لا يُحفظ رقمٌ واحد لحاجَّين") && writes.length === 0, JSON.stringify(writes));
await closeAll();

/* ── التعديل ── */
async function editPassport(name, value) {
  writes.length = 0;
  await page.getByText(name).first().click(); await pause(500);
  await page.getByRole("button", { name: /تعديل/ }).last().click(); await pause(800);
  const f = page.getByLabel("رقم الجواز").first();
  await f.fill(value);
  await page.getByRole("button", { name: /حفظ التعديلات/ }).click();
  await pause(1500);
}
await editPassport("خالد يوسف", "A1234567");
check("12b. editing a pilgrim to another pilgrim's passport → refused locally, no write", await visible("لا يُحفظ رقمٌ واحد لحاجَّين") && writes.length === 0, JSON.stringify(writes));
await closeAll();
failLookup = true;
await editPassport("خالد يوسف", "Q1231231");
check("14. duplicate lookup fails → save refused safely, no write", await visible("تعذّر التحقق من عدم تكرار") && writes.length === 0, JSON.stringify(writes));
failLookup = false;
await closeAll();
await editPassport("محمد علي سالم", "a1234567");
check("15. editing a pilgrim with their own (re-typed) passport → not matched against themselves; saved",
  !(await visible("لا يُحفظ رقمٌ واحد لحاجَّين")) && writes.some(w => w.m === "PATCH" && w.table === "passengers" && /id=eq\.1/.test(w.query)), JSON.stringify(writes.map(w => w.m + " " + (w.table || w.path) + (w.query || ""))));

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close(); vite.kill();
const bad = results.filter(r => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
