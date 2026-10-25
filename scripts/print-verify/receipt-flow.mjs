#!/usr/bin/env node
// ============================================================
// تحقّقُ مسار الإيصال من واجهة التطبيق الحقيقيّة — Chromium يقود التطبيق نفسه
// ============================================================
/* يشغّل التطبيقَ (Vite) بعنوان Supabase وهميّ، ويعترض كلَّ طلبٍ إليه ببياناتٍ
   اصطناعيّة (حاجّان ودفعاتٌ بإيصالات، وختمٌ وتوقيعٌ بحشوٍ شفّاف) — لا قاعدةَ ولا
   شبكةَ ولا بياناتٍ حقيقيّة. ثمّ يسلك مدخلَي الإيصال كما يسلكهما الموظّف:
     أ) الحسابات ← كشف حساب الحاجّ ← دفعة  (مودال «تفاصيل الدفعة»)
     ب) الحسابات ← التقارير ← سجلّ الدفعات ← دفعة (مودال الإيصال)
   ويتحقّق: المودالُ يظهر فوراً فوق الصفحة والمستخدمُ باقٍ مكانه، وخياراتُ الطباعة
   فيه، وكلُّ تركيبةٍ من الختم والتوقيع تُطبع كما اختيرت (المطبوعُ الفعليّ من إطار
   الطباعة، ثمّ PDF)، والإغلاقُ يعيد إلى المكان نفسه بلا مودالٍ متأخّر.

   node scripts/print-verify/receipt-flow.mjs [--out DIR] [--port 5179] */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg("--out", join(ROOT, ".print-verify-flow")));
const PORT = +arg("--port", "5179");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

/* ── التطبيق بعنوان Supabase وهميّ ── */
const MOCK = "https://mock.supabase.test";
const vite = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: "mock-anon-key" }, stdio: "ignore" });
const APP = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 500)); }

/* ── بياناتٌ اصطناعيّة ── */
const UID = "00000000-0000-4000-8000-000000000001";
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "staff@test.local", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "mock.jwt.token", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "mock-refresh", user };
const season = { id: 1, name: "موسم ١٤٤٧", hijri_year: 1447, created_at: "2026-01-01", closed_at: null, closed_by: null, hotel_name: null, is_active: true };
const pax = [1, 2].map(i => ({ id: i, season_id: 1, name_ar: `حاج تجريبي رقم ${i} بن عبد الله`, short_ar: `حاج تجريبي ${i}`, passenger_type: "حاج",
  gender: "ذكر", nat: "قطر", passport: `P90000${i}`, sort_order: i, services: { hotel_type: "عادي" } }));
const receipt = (id, n, pid, amount) => ({ id, season_id: 1, season_name: "موسم ١٤٤٧", receipt_number: n, issued_at: "2026-04-01T10:00:00Z", issued_by: "موظف المالية",
  group_name: null, total_amount: amount, payer_name: pax[pid - 1].short_ar, method: "نقدي", payment_date: "2026-04-01", notes: null, status: "active",
  cancel_reason: null, cancelled_at: null, cancelled_by: null });
const receipts = [receipt(11, 1001, 1, 1500), receipt(12, 1002, 2, 2500)];
const payments = [{ id: 21, passenger_id: 1, amount: 1500, payment_date: "2026-04-01", method: "نقدي", notes: "", created_by: "موظف", created_at: "2026-04-01T10:00:00Z", receipt_id: 11, receipt: receipts[0] },
  { id: 22, passenger_id: 2, amount: 2500, payment_date: "2026-04-01", method: "نقدي", notes: "", created_by: "موظف", created_at: "2026-04-01T10:00:00Z", receipt_id: 12, receipt: receipts[1] }];
const TABLES = {
  user_profiles: [{ id: UID, email: user.email, name: "موظف المالية", permissions: { manage_payments: true, manage_users: true, cancel_receipts: true }, is_active: true }],
  seasons: [season], passengers: pax, payments, payment_receipts: receipts,
  company_config: [{ id: 1, company_name: "حملة الاختبار للحج", tagline: "معاينة", primary_color: "#6B1F3A", accent_color: "#085041", active_season_id: 1 }],
  company_assets: [{ asset_key: "company_stamp", asset_url: "company_stamp_1.png", alt_text: null, metadata: {}, updated_at: null },
    { asset_key: "manager_signature", asset_url: "manager_signature_1.png", alt_text: null, metadata: {}, updated_at: null }],
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
/* الصورتان: حبرٌ في وسط لوحةٍ شفّافةٍ واسعة — كما تُرفع */
const helper = await ctx.newPage();
const PNG = await helper.evaluate(() => {
  const draw = (w, h, f) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); return c.toDataURL("image/png"); };
  return {
    stamp: draw(1503, 1600, (g, w, h) => { g.strokeStyle = "rgba(28,58,160,.86)"; g.lineWidth = 34; g.beginPath(); g.arc(w / 2, h / 2, 520, 0, 7); g.stroke(); }),
    signature: draw(1600, 1376, g => { g.strokeStyle = "rgba(10,20,90,.92)"; g.lineWidth = 22; g.beginPath(); g.moveTo(260, 690); g.bezierCurveTo(600, 300, 1000, 1000, 1360, 600); g.stroke(); }),
  };
});
await helper.close();
const png = u => Buffer.from(u.split(",")[1], "base64");
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
await ctx.route(`${MOCK}/**`, async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname;
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  if (path.startsWith("/auth/v1/user")) return json(route, user);
  if (path.startsWith("/auth/v1/token")) return json(route, session);
  if (path.startsWith("/auth/v1/")) return json(route, {});
  if (path.startsWith("/storage/v1/object/sign/")) {
    const key = path.split("/").pop();
    if (req.method() === "POST") return json(route, { signedURL: `/object/sign/company-private/${key}?token=t` });
    const body = key.startsWith("company_stamp") ? png(PNG.stamp) : key.startsWith("manager_signature") ? png(PNG.signature) : null;
    return body ? route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body }) : route.fulfill({ status: 404, body: "" });
  }
  if (path.startsWith("/rest/v1/rpc/")) return json(route, null);
  if (path.startsWith("/rest/v1/")) {
    const table = path.split("/")[3], rows = TABLES[table] ?? [];
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

/* بطاقةُ المودال: العنصرُ الأبُ لعنوانه */
const card = title => page.locator(`xpath=//div[normalize-space()="${title}"]/..`).first();
/* مودالٌ ظاهرٌ فوق كلّ شيء: نقطةُ عنوانه تعود إلى بطاقته هو (لا إلى غطاءٍ أو صفحةٍ فوقه) */
async function modalOnTop(title) {
  const c = card(title);
  if (!(await c.count())) return { found: false };
  return c.evaluate(box => {
    const r = box.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
    return { found: true, visible: r.width > 0 && r.height > 0, onTop: !!hit && (box === hit || box.contains(hit)) };
  });
}
async function setSeals(title, stamp, signature) {
  const c = card(title);
  await c.getByRole("button", { name: /خيارات الطباعة/ }).click();
  for (const [label, want] of [["إظهار ختم الشركة", stamp], ["إظهار التوقيع المعتمد", signature]]) {
    const box = c.getByRole("checkbox", { name: label });
    if ((await box.isChecked()) !== want) await box.click();
  }
  await c.getByRole("button", { name: /خيارات الطباعة/ }).click();
}
/* المطبوعُ الفعليّ: إطارُ الطباعة بعد قرار المخطِّط، ثمّ PDF منه وعدُّ صوره */
async function printed(tag) {
  await page.waitForFunction(() => { const f = document.getElementById("__print_frame__"); return f && f.contentDocument && f.contentDocument.documentElement.hasAttribute("data-seal-plan"); }, null, { timeout: 15000 }).catch(() => {});
  const html = await page.evaluate(() => document.getElementById("__print_frame__")?.contentDocument?.documentElement.outerHTML ?? "");
  const p2 = await ctx.newPage(); await p2.setContent(html, { waitUntil: "networkidle" });
  const pdf = join(OUT, `${tag}.pdf`); await p2.pdf({ path: pdf, preferCSSPageSize: true, printBackground: false }); await p2.close();
  const imgs = execFileSync("pdfimages", ["-list", pdf], { encoding: "utf8" }).split("\n").slice(2).filter(l => l.trim().split(/\s+/)[2] === "image").length;
  const pages = +execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1];
  await page.evaluate(() => document.getElementById("__print_frame__")?.remove());
  return { imgs, pages, size: /size:\s*A5/.test(html) };
}
async function combos(title, printLabel, tag) {
  for (const [stamp, signature, want] of [[false, false, 0], [true, false, 1], [false, true, 1], [true, true, 2]]) {
    await setSeals(title, stamp, signature);
    await card(title).getByRole("button", { name: printLabel }).click();
    const r = await printed(`${tag}-stamp${+stamp}-sig${+signature}`);
    check(`${tag}: stamp ${stamp ? "ON" : "OFF"} / signature ${signature ? "ON" : "OFF"} → ${want} image(s) on the A5 receipt`, r.imgs === want && r.pages === 1 && r.size, `images ${r.imgs}, pages ${r.pages}`);
  }
}

await page.goto(`${APP}/finance`, { waitUntil: "networkidle" });
await page.getByText("حاج تجريبي 1").first().waitFor({ timeout: 20000 });

/* ── ب) التقارير ← سجلّ الدفعات ← دفعة ── */
await page.getByRole("button", { name: "التقارير" }).click();
await page.getByRole("button", { name: "سجل الدفعات" }).click();
await page.getByRole("cell", { name: "1001" }).first().click();
await page.waitForTimeout(400);
const B = "إيصال رقم 1001";
const b = await modalOnTop(B);
check("B: report → payment opens the receipt modal immediately, above the report", b.found && b.visible && b.onTop, JSON.stringify(b));
check("B: user is still on the report page", await page.getByText("التقارير المالية").first().isVisible());
const bOpts = b.found && await card(B).getByRole("button", { name: /خيارات الطباعة/ }).isVisible().catch(() => false);
check("B: print options available inside the receipt modal", bOpts);
if (bOpts) {
  /* الافتراضُ كما كان: الختمُ والتوقيعُ مشعَلان حين يتوفّر الأصلان — اختياريّان لا إلزاميّان */
  await card(B).getByRole("button", { name: /خيارات الطباعة/ }).click();
  const defaults = [await card(B).getByRole("checkbox", { name: "إظهار ختم الشركة" }).isChecked(), await card(B).getByRole("checkbox", { name: "إظهار التوقيع المعتمد" }).isChecked()];
  await card(B).getByRole("button", { name: /خيارات الطباعة/ }).click();
  check("receipt defaults unchanged: stamp and signature ON when the assets exist (still optional)", defaults[0] && defaults[1], JSON.stringify(defaults));
  await combos(B, /^🖨️ طباعة$/, "B-report");
  await card(B).getByRole("button", { name: "إغلاق" }).click();
  check("B: closing returns to the same report", await page.getByText("التقارير المالية").first().isVisible() && await page.getByRole("cell", { name: "1001" }).first().isVisible()
    && !(await card(B).isVisible().catch(() => false)));
}
/* لا مودالَ متأخّراً بعد مغادرة التقرير */
await page.locator("button", { hasText: "←" }).first().click();
await page.waitForTimeout(500);
const late = await card(B).isVisible().catch(() => false);
check("no delayed receipt modal appears after leaving the report", !late);
if (late) await card(B).getByRole("button", { name: "إغلاق" }).click();

/* ── أ) كشف حساب الحاجّ ← دفعة ── */
await page.getByText("حاج تجريبي 1").first().click();
await page.getByTitle("اضغط لعرض التفاصيل").first().click();
await page.waitForTimeout(300);
const A = "تفاصيل الدفعة";
const a = await modalOnTop(A);
check("A: statement → payment opens «تفاصيل الدفعة» immediately, above the page", a.found && a.visible && a.onTop, JSON.stringify(a));
const aOpts = a.found && await card(A).getByRole("button", { name: /خيارات الطباعة/ }).isVisible().catch(() => false);
check("A: print options available inside «تفاصيل الدفعة»", aOpts);
if (aOpts) {
  await combos(A, /طباعة إيصال/, "A-statement");
  await card(A).getByRole("button", { name: "إغلاق" }).click();
  check("A: closing returns to the pilgrim statement", !(await card(A).isVisible().catch(() => false)) && await page.getByTitle("اضغط لعرض التفاصيل").first().isVisible());
}

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
writeFileSync(join(OUT, "report.json"), JSON.stringify(results, null, 2));
await browser.close(); vite.kill();
const bad = results.filter(r => !r.ok);
console.log(bad.length ? `FAIL — ${bad.length} check(s)` : `PASS — ${results.length} checks; evidence in ${OUT}`);
process.exit(bad.length ? 1 : 0);
