#!/usr/bin/env node
// ============================================================
// الإيصالُ نصفَ A4 بالعرض — Chromium print-to-PDF من بانيه الحقيقيّ
// ============================================================
/* يبني الإيصالَ لكلّ سيناريو (`receipt-layout.ts`)، ويطبعه في Chromium إلى PDF، ويتحقّق:
     · ورقةٌ واحدة A4، والإيصالُ ٢١٠ × ١٤٨٫٥مم في نصفها الأعلى (دفعةُ مجموعةٍ طويلةٌ تطول وحدها)
     · لا تراكبَ بين الأقسام، ولا نصَّ مقصوصاً أو فائضاً عن صندوقه
     · المبلغُ رقماً وكتابةً كما يُخرجه `amountInArabicWords`، وطريقةُ الدفع والتفاصيلُ كما هي
     · المحصِّلُ لا يُطبع
     · الختمُ والتوقيعُ بمقاسهما في الإيصال السابق (`--before-ref`) بالمليمتر، وفي موضعهما
       (الختمُ يمين التوقيع)، وكاملان داخل الورقة
   node scripts/print-verify/receipt-layout.mjs [--out DIR] [--before-ref origin/main] */
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg("--out", join(ROOT, ".print-verify-receipt")));
const BEFORE = arg("--before-ref", "origin/main");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(join(OUT, "after"), { recursive: true }); mkdirSync(join(OUT, "before"), { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { build } = require(join(ROOT, "node_modules/rolldown"));

async function bundle(entry, root, file) {
  const stubs = { name: "stubs", resolveId(id, importer) {
    if (!importer) return null;
    if (/(^|\/)supabase$|(^|\/)portalSupabase$/.test(id) && importer.startsWith(join(root, "src"))) return join(HERE, "supabase-stub.ts");
    if (/(^|\/)print\.output$/.test(id) && importer.startsWith(join(root, "src/print"))) return join(HERE, "output-stub.ts");
    return null; } };
  await build({ input: entry, platform: "node", plugins: [stubs], external: [/^pdfjs-dist/, /^react/, /^xlsx/], output: { file, format: "esm", codeSplitting: false }, logLevel: "silent" });
  return file;
}
/* صورتا ختمٍ وتوقيعٍ اصطناعيّتان بأبعاد الأصلين المقصوصين نسبةً */
const SEALS = { stamp: { w: 1000, h: 1000 }, signature: { w: 1600, h: 700 } };
const run = (file, dir) => execFileSync(process.execPath, [file, dir, JSON.stringify(SEALS)], { encoding: "utf8" });
run(await bundle(join(HERE, "receipt-layout.ts"), ROOT, join(OUT, "scn-after.mjs")), join(OUT, "after"));
/* قبل: الإيصالُ نفسُه من `--before-ref` بالصور نفسها — مقارنةُ مقاس الختم والتوقيع */
const wt = join(OUT, "before-wt");
execSync(`git -C "${ROOT}" worktree add -q --detach "${wt}" ${BEFORE}`);
try {
  symlinkSync(join(ROOT, "node_modules"), join(wt, "node_modules"));
  mkdirSync(join(wt, "scripts/print-verify"), { recursive: true });
  for (const f of ["receipt-layout.ts", "supabase-stub.ts", "output-stub.ts"]) writeFileSync(join(wt, "scripts/print-verify", f), readFileSync(join(HERE, f)));
  run(await bundle(join(wt, "scripts/print-verify/receipt-layout.ts"), wt, join(OUT, "scn-before.mjs")), join(OUT, "before"));
} finally { execSync(`git -C "${ROOT}" worktree remove --force "${wt}"`); }

const meta = JSON.parse(readFileSync(join(OUT, "after", "meta.json"), "utf8"));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
const IMG = await page.evaluate(s => {
  const draw = (w, h, f) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); return c.toDataURL("image/png"); };
  return {
    stamp: draw(s.stamp.w, s.stamp.h, (g, w, h) => { g.strokeStyle = "rgba(28,58,160,.9)"; g.lineWidth = 30; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 20, 0, 7); g.stroke(); g.lineWidth = 12; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 110, 0, 7); g.stroke(); }),
    signature: draw(s.signature.w, s.signature.h, (g, w, h) => { g.strokeStyle = "rgba(10,20,90,.92)"; g.lineWidth = 18; g.beginPath(); g.moveTo(40, h * .6); g.bezierCurveTo(w * .3, 0, w * .6, h, w - 40, h * .3); g.stroke(); }),
    logo: draw(300, 300, (g, w, h) => { g.fillStyle = "#5d2222"; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 6, 0, 7); g.fill(); g.fillStyle = "#B08D3C"; g.font = "bold 120px serif"; g.textAlign = "center"; g.fillText("ق", w / 2, h / 2 + 40); }),
  };
}, SEALS);
const files = Object.fromEntries(Object.entries(IMG).map(([k, v]) => [k, Buffer.from(v.split(",")[1], "base64")]));
await page.route("https://seal.test/*", r => { const n = r.request().url().split("/").pop().replace(".png", ""); return files[n] ? r.fulfill({ contentType: "image/png", body: files[n] }) : r.fulfill({ status: 404, body: "" }); });

const MM = 96 / 25.4;
async function render(dir, name) {
  const html = readFileSync(join(OUT, dir, `${name}.html`), "utf8");
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.complete ? i.decode?.().catch(() => {}) : new Promise(r => { i.onload = i.onerror = r; }))); });
  if (html.includes("data-seal-plan")) await page.waitForFunction(() => document.documentElement.hasAttribute("data-seal-plan"), null, { timeout: 9000 }).catch(() => {});
  await page.emulateMedia({ media: "print" });
  const m = await page.evaluate(() => {
    const MM = 96 / 25.4, R = e => e && e.getBoundingClientRect();
    const mm = v => Math.round(v / MM * 10) / 10;
    const imgs = [...document.querySelectorAll(".stamp-box img")].map(i => { const r = i.getBoundingClientRect(); return { alt: i.alt, w: mm(r.width), h: mm(r.height), left: r.left, top: r.top, bottom: mm(r.bottom), nat: i.naturalWidth > 0 }; });
    const sheet = R(document.querySelector(".sheet") || document.querySelector(".receipt"));
    /* أقسامٌ لا يجوز أن تتراكب */
    const secs = [".head", ".payer", ".amount", ".side", ".alloc", ".receipt-footer"].map(s => [s, R(document.querySelector(s))]).filter(([, r]) => r && r.height > 0);
    const overlaps = [];
    for (let i = 0; i < secs.length; i++) for (let j = i + 1; j < secs.length; j++) {
      const [a, ra] = secs[i], [b, rb] = secs[j];
      if (ra.left < rb.right - 0.5 && rb.left < ra.right - 0.5 && ra.top < rb.bottom - 0.5 && rb.top < ra.bottom - 0.5) overlaps.push(`${a}×${b}`);
    }
    /* نصٌّ مقصوصٌ أو فائضٌ عن صندوقه */
    const clipped = [".words", ".details .v", ".payer .v", ".meta", ".company", ".title h1", ".method"].flatMap(s => [...document.querySelectorAll(s)])
      .filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map(e => e.className || e.tagName);
    const frame = R(document.querySelector(".frame"));
    const outside = [...document.querySelectorAll(".frame *")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > frame.right + 1 || r.left < frame.left - 1 || r.bottom > frame.bottom + 1); }).length;
    const wordsEl = document.querySelector(".words") || document.querySelector(".amount-words");
    const lines = wordsEl ? Math.round(wordsEl.getBoundingClientRect().height / parseFloat(getComputedStyle(wordsEl).lineHeight)) : 0;
    const detailsEl = document.querySelector(".details .v");
    const dLines = detailsEl ? Math.round(detailsEl.getBoundingClientRect().height / parseFloat(getComputedStyle(detailsEl).lineHeight)) : 0;
    const stamp = imgs.find(i => i.alt === "الختم"), sig = imgs.find(i => i.alt === "التوقيع");
    const footer = R(document.querySelector(".receipt-footer"));
    return { sheetW: sheet ? mm(sheet.width) : null, sheetH: sheet ? mm(sheet.height) : null, imgs, overlaps, clipped, outside,
      words: (wordsEl?.textContent ?? "").trim(), wordsLines: lines, detailsLines: dLines,
      method: (document.querySelector(".method .v")?.textContent ?? "").trim(), details: (document.querySelector(".details .v")?.textContent ?? "").trim(),
      payer: (document.querySelector(".payer .v")?.textContent ?? "").trim(),
      amount: (document.querySelector(".amount .num b")?.textContent ?? "").trim(),
      collector: document.body.innerText.includes("collector@test.local") || document.body.innerText.includes("المُحصِّل"),
      stampRightOfSig: stamp && sig ? stamp.left > sig.left : null, footerH: footer ? mm(footer.height) : null,
      manualBoxes: document.querySelectorAll(".stamp-box:not(.has-img)").length, plan: document.documentElement.getAttribute("data-seal-plan") };
  });
  await page.emulateMedia({ media: "screen" });
  const pdf = join(OUT, dir, `${name}.pdf`);
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
  const [pw, ph] = info.match(/Page size:\s+([\d.]+) x ([\d.]+)/).slice(1).map(v => Math.round(+v / 72 * 25.4));
  return { ...m, pages: +info.match(/Pages:\s+(\d+)/)[1], paper: `${pw}x${ph}` };
}
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const before = {}, after = {};
for (const name of Object.keys(meta)) { after[name] = await render("after", name); before[name] = await render("before", name); }
for (const [name, a] of Object.entries(after)) {
  const s = meta[name], b = before[name];
  const big = name === "group-24";
  check(`${name}: one A4 page, receipt box 210 × 148.5 mm${big ? " (long group: grows, still one page)" : ""}`,
    a.pages === 1 && a.paper === "210x297" && Math.abs(a.sheetW - 210) < 0.3 && (big ? a.sheetH >= 148.4 : Math.abs(a.sheetH - 148.5) < 0.3), `pages ${a.pages}, paper ${a.paper}, box ${a.sheetW}×${a.sheetH}mm`);
  check(`${name}: no overlapping sections, no clipped/overflowing text, nothing outside the frame`, !a.overlaps.length && !a.clipped.length && !a.outside,
    JSON.stringify({ overlaps: a.overlaps, clipped: a.clipped, outside: a.outside }));
  check(`${name}: amount in words = amountInArabicWords (≤ 2 lines)`, a.words === s.expectWords && a.wordsLines <= 2, `${a.amount} · "${a.words}" (${a.wordsLines} line(s))`);
  check(`${name}: payer, method and payment details printed as entered`, a.payer === s.payer && a.method === s.method && a.details === (s.notes ?? "—"),
    `method ${a.method}; details ${a.detailsLines} line(s)`);
  check(`${name}: collector not printed`, !a.collector);
  /* الختمُ والتوقيع: بالمقاس نفسه في الإيصال السابق بالمليمتر، وفي موضعهما */
  const pick = (m, alt) => m.imgs.find(i => i.alt === alt);
  for (const alt of ["الختم", "التوقيع"]) {
    /* السابقُ امتدّ ورقتين A5 (مجموعةٌ طويلة) فأُخفيت خانتاه ورُسمتا في الهامش — يُقارَن بمقاسه في إيصالٍ من ورقة */
    const ia = pick(a, alt), ib0 = pick(b, alt), ib = ib0 && ib0.w > 0 ? ib0 : pick(before["amount-1000"], alt);
    if (!ia && !ib0) continue;
    check(`${name}: ${alt === "الختم" ? "stamp" : "signature"} same size as before (mm), fully on the page`,
      ia && ib && Math.abs(ia.w - ib.w) < 0.15 && Math.abs(ia.h - ib.h) < 0.15 && ia.nat && ia.bottom <= 148.5 + (big ? 150 : 0),
      `after ${ia?.w}×${ia?.h} · before ${ib?.w}×${ib?.h}`);
  }
  if (a.stampRightOfSig !== null) check(`${name}: stamp stays right of the signature (as before)`, a.stampRightOfSig && before["amount-1000"].stampRightOfSig);
  if (s.seals !== "both") check(`${name}: the missing seal keeps its manual box`, a.manualBoxes === (s.seals === "none" ? 2 : 1), `${a.manualBoxes} manual box(es)`);
}
await browser.close();
writeFileSync(join(OUT, "report.json"), JSON.stringify({ after, before }, null, 1));
for (const name of Object.keys(meta)) execFileSync("pdftoppm", ["-r", "110", "-png", "-singlefile", join(OUT, "after", `${name}.pdf`), join(OUT, "after", name)]);
const bad = results.filter(r => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed — evidence in ${OUT}`);
process.exit(bad.length ? 1 : 0);
