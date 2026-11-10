#!/usr/bin/env node
// ============================================================
// تحقّقُ الواجهة — Phase 1: تنبيهاتُ بوابة الحاجّ على الجوّال (RTL)
// ============================================================
/* يشغّل التطبيقَ (Vite) بعنوان Supabase وهميّ ويعترض كلَّ طلبٍ إليه ببياناتٍ اصطناعيّة —
   لا قاعدةَ ولا شبكةَ ولا دفعَ حقيقيّ. والقاعدةُ نفسها تختبرها
   `supabase/verification/portal/announcements_phase1_tests.sh`.
     · العنوانُ والنصُّ كاملين (بلا اقتطاعٍ ولا طيّ، والأسطرُ كما كُتبت)
     · ١٠ ثم «عرض المزيد» يجلب الصفحةَ التالية ويضيفها
     · شاراتُ جديد/مُحدَّث، والمثبَّتُ أولاً
     · فتحُ التبويب لا يُقرّ بشيء؛ «تمّت القراءة» أو ضغطُ البطاقة يُقرّ بتنبيهٍ واحدٍ بنسخته
     · نقطةُ «جديد» على الشريط تتبع غيرَ المقروء
     · RTL ولا فيضَ أفقيّاً عند ٣٦٠px، ولقطةُ شاشة
   node scripts/ui-verify/announcements.mjs [--out DIR] [--port 5182] */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg("--out", join(ROOT, ".print-verify-flow/announcements")));
const PORT = +arg("--port", "5182");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const MOCK = "https://mock.supabase.test";
const APP = `http://localhost:${PORT}`;
const vite = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: "mock-anon-key" }, stdio: "ignore" });

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) { pass++; console.log(`PASS — ${name}`); } else { fail++; console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`); } };

const LONG = "على جميع الحجاج التوجّه إلى الحافلات عند الساعة الخامسة فجراً، مع إحضار بطاقة الحاج وحقيبة اليد فقط.\nالسطر الثاني: سيمرّ المشرفون على الغرف للتأكد من الجاهزية.\nالسطر الثالث: كلمةٌ طويلةٌ جداً بلا مسافات للتحقق من الالتفاف ابابابابابابابابابابابابابابابابابابابابابابابابابابابابابابابابا.";
const ann = (id, extra = {}) => ({ id, title: `عنوان التنبيه ${id}`, body: `نص التنبيه ${id}`, priority: "عام",
  show_at: new Date(Date.now() - id * 60000).toISOString(), pinned: false, revision: 1, state: "new", edited_at: null, ...extra });
const FIRST = [
  ann(1, { pinned: true, title: "تنبيه مثبّت", body: LONG, state: "read" }),
  ann(2, { priority: "عاجل", title: "موعد التفويج", state: "read" }),
  ann(3, { state: "updated", revision: 2, edited_at: new Date().toISOString(), title: "تعديل موعد الحافلة" }),
  ...[4, 5, 6, 7, 8, 9, 10].map(i => ann(i)),
];
const SECOND = [ann(11), ann(12, { state: "read" })];
const portal = {
  pilgrim: { name_ar: "حاج تجريبي", name_en: "Test", short_ar: "حاج", gender: "ذكر", has_photo: false, has_hajj_permit: false, has_flight_ticket: false,
             hotel_type: null, hotel_view: null, camp_mina: null, camp_arafa: null, phone: null },
  bus: null, room: null, accommodation: { status: "none", hotel: null, room: null, requested_hotel: null }, roommates: [], family: [],
  flight_go: null, flight_back: null,
  config: { name_ar: "حملة تجريبية", tagline: null, color_primary: "#5d2222", color_accent: "#B08D3C", admin_name: null, admin_phone: null,
            admin_whatsapp: null, portal_settings: {}, settings_stamp: "s1", country: null, city: null, assets: {} },
  season: { name: "موسم تجريبي", hijri_year: 1448, hotel_name: null, hotel_address: null, hotel_url: null, mina_address: null, mina_url: null, arafa_address: null, arafa_url: null },
  announcements: FIRST,
  announcements_meta: { total: 12, unread: 9, has_more: true, page_size: 10 },
};

const acks = [];
const pages = [];
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 500)); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 1, locale: "ar" });
  await ctx.route(`${MOCK}/**`, async route => {
    const url = route.request().url();
    const body = (() => { try { return JSON.parse(route.request().postData() || "{}"); } catch { return {}; } })();
    const json = (d) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (url.includes("/rpc/get_pilgrim_portal_by_session")) return json(portal);
    if (url.includes("/rpc/portal_settings_stamp")) return json("s1");
    if (url.includes("/rpc/get_pilgrim_announcements")) { pages.push(body.p_offset); return json({ items: SECOND, total: 12, unread: 9, has_more: false }); }
    if (url.includes("/rpc/acknowledge_pilgrim_announcement")) { acks.push([body.p_announcement_id, body.p_revision]); return json({ id: body.p_announcement_id, revision: body.p_revision, state: "read" }); }
    if (url.includes("/rpc/mark_pilgrim_notification_read")) { acks.push(["legacy", body.p_announcement_id]); return json(true); }
    return json([]);
  });
  await ctx.addInitScript((data) => {
    localStorage.setItem("portal_session", JSON.stringify({ token: "mock-token-0123456789abcdefghijklmnopqrstuvwxyz", idle_expires_at: "2099-01-01", absolute_expires_at: "2099-01-01" }));
    localStorage.setItem("portal_data", JSON.stringify(data));
    localStorage.setItem("portal_push_dismissed", "1");
  }, portal);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${APP}/hajj/alerts`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ann-1", { timeout: 15000 });
  await page.waitForTimeout(800);

  const cards = await page.$$eval("[id^=ann-]", els => els.map(e => e.id));
  check("first page shows 10 announcements", cards.length === 10, String(cards.length));
  check("pinned first, then urgent, in the server's order", cards.slice(0, 3).join(",") === "ann-1,ann-2,ann-3", cards.slice(0, 3).join(","));
  check("entering the alerts tab acknowledges nothing", acks.length === 0, JSON.stringify(acks));
  const full = await page.$eval("#ann-1", el => el.innerText);
  check("title and the full multi-line body are shown (no truncation)", full.includes("تنبيه مثبّت") && full.includes("السطر الثالث") && full.includes("ابابابابابا"));
  const clamp = await page.$$eval("[id^=ann-] *", els => els.some(e => { const s = getComputedStyle(e); return s.webkitLineClamp !== "none" && s.webkitLineClamp !== "" || s.textOverflow === "ellipsis"; }));
  check("no line clamp or ellipsis on announcement text", !clamp);
  const t1 = await page.$eval("#ann-1", el => el.innerText);
  check("pinned badge on the pinned announcement", t1.includes("مثبّت"));
  const t3 = await page.$eval("#ann-3", el => el.innerText);
  check("Updated badge and edit note on the edited one", t3.includes("مُحدَّث") && t3.includes("عُدِّل في"));
  const t4 = await page.$eval("#ann-4", el => el.innerText);
  check("New badge + «تمّت القراءة» on an unread one", t4.includes("جديد") && t4.includes("تمّت القراءة"));
  check("no read action on a read one", !t1.includes("تمّت القراءة"));
  const rtl = await page.evaluate(() => getComputedStyle(document.querySelector("[dir=rtl]") || document.body).direction);
  check("RTL", rtl === "rtl", rtl);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("no horizontal overflow at 360px", overflow <= 0, String(overflow));
  const dot = async () => page.$$eval("button span", els => els.filter(e => getComputedStyle(e).backgroundColor === "rgb(193, 18, 31)" && e.offsetWidth === 12).length);
  check("unread dot on the Alerts tab", (await dot()) === 1);
  await page.screenshot({ path: join(OUT, "alerts-360.png"), fullPage: false });

  await page.click("#ann-4 >> text=تمّت القراءة");
  await page.waitForTimeout(400);
  check("«تمّت القراءة» acknowledges that one, with its revision", JSON.stringify(acks) === JSON.stringify([[4, 1]]), JSON.stringify(acks));
  check("…its badge and button disappear", !(await page.$eval("#ann-4", el => el.innerText)).includes("تمّت القراءة"));
  await page.click("#ann-3");
  await page.waitForTimeout(400);
  check("tapping the Updated card acknowledges its current revision", JSON.stringify(acks.at(-1)) === JSON.stringify([3, 2]), JSON.stringify(acks));
  await page.click("#ann-1");
  await page.waitForTimeout(300);
  check("tapping an already-read card sends nothing", acks.length === 2, JSON.stringify(acks));

  await page.click("text=عرض المزيد");
  await page.waitForSelector("#ann-12", { timeout: 5000 });
  const all = await page.$$eval("[id^=ann-]", els => els.length);
  check("«عرض المزيد» loads the next page from offset 10 and appends it", all === 12 && JSON.stringify(pages) === "[10]", `${all} ${JSON.stringify(pages)}`);
  check("…and disappears when there is no more", (await page.$("text=عرض المزيد")) === null);
  check("no legacy mark-all call from this build", !acks.some(a => a[0] === "legacy"));
  check("no page errors", errors.length === 0, errors.join(" | "));
  await page.screenshot({ path: join(OUT, "alerts-360-more.png"), fullPage: true });
  await browser.close();
} finally {
  vite.kill();
}
console.log(`\nresult: ${pass} passed · ${fail} failed — screenshots in ${OUT}`);
process.exit(fail ? 1 : 0);
