#!/usr/bin/env node
// ============================================================
// تحقّقُ أمانة كرت الغرفة المطبوع: الأسماءُ وترتيبُها كما في كرت الشاشة، ولا قصّ
// ============================================================
/* node scripts/print-verify/hotel-fidelity.mjs [--out DIR] [--base-ref origin/main]
   يطبع مستندَ الفندق نفسَه من `--base-ref` (قبل) ومن الفرع (بعد، والختمُ مطفأً
   ومشعَلاً) طوليّاً وعرضيّاً إلى PDF في Chromium، ويقرأ من كلّ كرتٍ مرسومٍ أسماءَه
   بترتيبها ويقارنها بما يعرضه كرتُ الشاشة (`roomOccupants` + `occupantName`
   — الدالّتان اللتان تعرض بهما `HotelPage`)، ويفحص أنّ كلَّ اسمٍ ظاهرٌ كاملاً
   داخل كرته. ويكتب report.json ومعايناتٍ في DIR. */
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg("--out", join(ROOT, ".print-verify-hotel")));
const BASE_REF = arg("--base-ref", "origin/main");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { build } = require(join(ROOT, "node_modules/rolldown"));

async function bundle(entry, root, file) {
  const stubs = { name: "stubs", resolveId(id, importer) {
    if (!importer) return null;
    if (/(^|\/)supabase$|(^|\/)portalSupabase$/.test(id) && importer.startsWith(join(root, "src"))) return join(HERE, "supabase-stub.ts");
    if (/(^|\/)print\.output$/.test(id) && importer.startsWith(join(root, "src/print"))) return join(HERE, "output-stub.ts");
    return null;
  } };
  await build({ input: entry, platform: "node", plugins: [stubs], external: [/^pdfjs-dist/, /^react/, /^xlsx/],
    output: { file, format: "esm", codeSplitting: false }, logLevel: "silent" });
  return file;
}
const node = (file, ...a) => execFileSync(process.execPath, [file, ...a], { encoding: "utf8", maxBuffer: 64 << 20 });

/* ── المستندات ── */
const dirs = { before: join(OUT, "before"), after: join(OUT, "after"), "after-seals": join(OUT, "after-seals") };
Object.values(dirs).forEach(d => mkdirSync(d, { recursive: true }));
const fx = await bundle(join(HERE, "hotel-fidelity.ts"), ROOT, join(OUT, "fx.mjs"));
node(fx, dirs.after); node(fx, dirs["after-seals"], "seals");
const wt = join(OUT, "base-worktree");
execSync(`git -C "${ROOT}" worktree add -q --detach "${wt}" ${BASE_REF}`);
try {
  symlinkSync(join(ROOT, "node_modules"), join(wt, "node_modules"));
  mkdirSync(join(wt, "scripts/print-verify"), { recursive: true });
  writeFileSync(join(wt, "scripts/print-verify/hotel-fidelity.ts"), readFileSync(join(HERE, "hotel-fidelity.ts")));
  node(await bundle(join(wt, "scripts/print-verify/hotel-fidelity.ts"), wt, join(OUT, "fx-base.mjs")), dirs.before);
} finally { execSync(`git -C "${ROOT}" worktree remove --force "${wt}"`); }
const expected = JSON.parse(node(await bundle(join(HERE, "hotel-expected.ts"), ROOT, join(OUT, "exp.mjs")), join(dirs.after, "data.json")).trim());

/* ── الطباعة والقراءة من الكروت المرسومة ── */
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const pngs = await page.evaluate(() => {
  const draw = (w, h, f) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); return c.toDataURL("image/png"); };
  return {
    stamp: draw(1182, 1182, (g, w) => { g.strokeStyle = "rgba(28,58,160,.86)"; g.lineWidth = 34; g.beginPath(); g.arc(w / 2, w / 2, 560, 0, 7); g.stroke(); }),
    signature: draw(1180, 515, (g) => { g.strokeStyle = "rgba(10,20,90,.92)"; g.lineWidth = 22; g.beginPath(); g.moveTo(30, 400); g.bezierCurveTo(300, 0, 700, 600, 1150, 100); g.stroke(); }),
  };
});
await page.route("https://seal.test/*", r => {
  const n = r.request().url().split("/").pop().replace(".png", "");
  return pngs[n] ? r.fulfill({ contentType: "image/png", body: Buffer.from(pngs[n].split(",")[1], "base64") }) : r.fulfill({ status: 404, body: "" });
});
const rows = [];
for (const [state, dir] of Object.entries(dirs)) for (const f of readdirSync(dir).filter(x => x.endsWith(".html")).sort()) {
  const html = readFileSync(join(dir, f), "utf8");
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.getAttribute("data-fit-done") === "1", null, { timeout: 8000 }).catch(() => {});
  if (html.includes("data-seal-plan")) await page.waitForFunction(() => document.documentElement.hasAttribute("data-seal-plan"), null, { timeout: 9000 }).catch(() => {});
  const cards = await page.evaluate(() => [...document.querySelectorAll(".hotel-page > div")].filter(c => c.querySelector("table")).map(card => {
    const cr = card.getBoundingClientRect();
    const head = card.firstElementChild.textContent;
    const cells = [...card.querySelectorAll("td.auto-fit-name")];
    return {
      room: (head.match(/غرفة\s+(\S+)/) || [])[1],
      names: cells.map(td => td.textContent.trim()),
      hidden: cells.filter(td => { const r = td.getBoundingClientRect(); return r.bottom > cr.bottom + 0.5 || r.top < cr.top - 0.5; }).map(td => td.textContent.trim()),
      cut: cells.filter(td => getComputedStyle(td).whiteSpace === "nowrap" && td.scrollWidth > td.clientWidth + 1).map(td => td.textContent.trim()),
      minFont: Math.min(...cells.map(td => parseFloat(getComputedStyle(td).fontSize))),
      lines: Math.max(...cells.map(td => Math.round(td.getBoundingClientRect().height / (parseFloat(getComputedStyle(td).fontSize) * 1.2 + 0.01)))),
    };
  }));
  const plan = await page.evaluate(() => document.documentElement.getAttribute("data-seal-plan"));
  const pdf = join(dir, f.replace(".html", ".pdf"));
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: false });
  const pages = +execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1];
  const wrongOrder = cards.filter(c => JSON.stringify(c.names) !== JSON.stringify(expected[c.room])).map(c => ({ room: c.room, screen: expected[c.room], print: c.names }));
  const missing = cards.filter(c => c.hidden.length || c.cut.length).map(c => ({ room: c.room, hidden: c.hidden, cut: c.cut }));
  const byOcc = {};
  for (const c of cards) { const n = expected[c.room].length; (byOcc[n] ??= { cards: 0, ok: 0 }).cards++; if (!wrongOrder.find(w => w.room === c.room) && !missing.find(m => m.room === c.room)) byOcc[n].ok++; }
  rows.push({ state, doc: f.replace(".html", ""), pages, plan, cards: cards.length, wrongOrder, missing, byOcc,
    minNameFontPx: Math.min(...cards.map(c => c.minFont)), roomsSeen: cards.length === Object.keys(expected).length });
  execFileSync("pdftoppm", ["-r", "70", "-png", pdf, join(OUT, `${state}-${f.replace(".html", "")}`)]);
}
await browser.close();
writeFileSync(join(OUT, "report.json"), JSON.stringify({ baseRef: BASE_REF, expected, rows }, null, 2));

/* ── معاينة: قبل · بعد · بعد بالختم ── */
execFileSync("python3", ["-c", `
import glob, os
from PIL import Image, ImageDraw
out = "${OUT}"
for doc in ["hotel-portrait", "hotel-landscape"]:
    strips = []
    for st, lbl in [("before", "BEFORE (main)"), ("after", "AFTER - seals OFF"), ("after-seals", "AFTER - seals ON")]:
        fs = sorted(glob.glob(f"{out}/{st}-{doc}-*.png"))
        ims = [Image.open(f).convert("RGB") for f in fs]
        if not ims: continue
        w = sum(i.width for i in ims) + 12 * (len(ims) + 1); h = max(i.height for i in ims) + 34
        s = Image.new("RGB", (w, h), (120, 120, 120)); ImageDraw.Draw(s).text((12, 8), f"{doc}: {lbl} - {len(ims)} pages", fill=(255, 255, 255))
        x = 12
        for i in ims: s.paste(i, (x, 28)); x += i.width + 12
        strips.append(s)
    W = max(s.width for s in strips); H = sum(s.height for s in strips)
    sheet = Image.new("RGB", (W, H), (120, 120, 120)); y = 0
    for s in strips: sheet.paste(s, (0, y)); y += s.height
    sheet.save(f"{out}/{doc}--compare.png")
`]);

console.table(rows.map(r => ({ state: r.state, doc: r.doc, pages: r.pages, plan: r.plan ?? "-", cards: r.cards, allRooms: r.roomsSeen,
  wrongOrder: r.wrongOrder.length, clipped: r.missing.length, minNamePx: r.minNameFontPx,
  "1p": `${r.byOcc[1]?.ok}/${r.byOcc[1]?.cards}`, "2p": `${r.byOcc[2]?.ok}/${r.byOcc[2]?.cards}`, "3p": `${r.byOcc[3]?.ok}/${r.byOcc[3]?.cards}`, "4p": `${r.byOcc[4]?.ok}/${r.byOcc[4]?.cards}` })));
const bad = rows.filter(r => r.state !== "before" && (r.wrongOrder.length || r.missing.length || !r.roomsSeen));
if (bad.length) { console.log("FAIL", JSON.stringify(bad.map(b => [b.state, b.doc, b.wrongOrder.slice(0, 2), b.missing.slice(0, 2)]))); process.exit(1); }
console.log(`PASS — evidence in ${OUT}`);
