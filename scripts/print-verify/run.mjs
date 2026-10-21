#!/usr/bin/env node
// ============================================================
// تحقّقُ المطبوعات: Chromium print-to-PDF من بُناة المطبوعات الحقيقيّة
// ============================================================
/* لا قاعدةَ ولا شبكةَ ولا أصلَ خاصّ. الختمُ والتوقيعُ صورتان اصطناعيّتان
   تُرسمان في المتصفّح وقتَ التشغيل، وتُخدَمان من `https://seal.test/`
   داخل جلسة الاختبار وحدها — فلا يُكتب أصلٌ حقيقيٌّ في ملفٍّ ولا مستودع.

   node scripts/print-verify/run.mjs [--out DIR] [--base-ref origin/main]

   المتطلّبات: Playwright (Chromium) — `PLAYWRIGHT_MODULE` مسارُ الحزمة إن لم
   تكن قابلةً للاستيراد، و`CHROMIUM_PATH` إن لزم — وأدواتُ poppler
   (pdfinfo · pdfimages · pdftotext · pdftoppm) وPython 3 مع Pillow.

   يفحص لكلّ مطبوع:
     · الختمُ والتوقيع على **كلّ ورقة** (صورُ كلِّ صفحةٍ في الـPDF)
     · لا تراكبَ: يُطبع المستندُ مرّتين — بالصورتين، وبصورتين شفّافتين
       بالمقاسات نفسها (التخطيطُ نفسُه) — فالفرقُ قناعُ الصورتين، ولا يجوز
       أن يقع فيه حبرٌ من التقرير ولا كلمة
     · لا ورقةَ فارغةً ولا ورقةَ ختمٍ وحده
     · عددُ الأوراق قبل الخيار وبعده
     · بخياراتٍ مطفأة: الـHTML مطابقٌ بايتاً ببايت لما يبنيه `--base-ref`
   ويكتب ملفّاتِ PDF وصورَ معاينةٍ وتقريراً (report.json) في `--out`. */
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg("--out", join(ROOT, ".print-verify")));
const BASE_REF = arg("--base-ref", "origin/main");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { build } = require(join(ROOT, "node_modules/rolldown"));

/* ── الحزم: بُناةُ المطبوعات كما هم، والطباعةُ وSupabase ببديلَين ── */
async function bundle(entry, root, file) {
  const stubs = {
    name: "print-verify-stubs",
    resolveId(id, importer) {
      if (!importer) return null;
      if (/(^|\/)supabase$|(^|\/)portalSupabase$/.test(id) && importer.startsWith(join(root, "src"))) return join(HERE, "supabase-stub.ts");
      if (/(^|\/)print\.output$/.test(id) && importer.startsWith(join(root, "src/print"))) return join(HERE, "output-stub.ts");
      return null;
    },
  };
  await build({ input: entry, platform: "node", plugins: [stubs], external: [/^pdfjs-dist/, /^react/, /^xlsx/],
    output: { file, format: "esm", codeSplitting: false }, logLevel: "silent" });
  return file;
}
const run = (file, ...a) => execFileSync(process.execPath, [file, ...a], { encoding: "utf8", maxBuffer: 64 << 20 });

/* ── ١) بخياراتٍ مطفأة: لا يتغيّر بايتٌ عمّا قبل ── */
const baseDir = join(OUT, "baseline"); mkdirSync(join(baseDir, "branch"), { recursive: true }); mkdirSync(join(baseDir, "base"), { recursive: true });
run(await bundle(join(HERE, "baseline.ts"), ROOT, join(OUT, "baseline-branch.mjs")), join(baseDir, "branch"));
const wt = join(OUT, "base-worktree");
execSync(`git -C "${ROOT}" worktree add -q --detach "${wt}" ${BASE_REF}`);
try {
  symlinkSync(join(ROOT, "node_modules"), join(wt, "node_modules"));
  /* المدخلُ داخل نسخة الأساس، فتُحَلّ مستورداتُه إلى `src` الأساس لا الفرع */
  mkdirSync(join(wt, "scripts/print-verify"), { recursive: true });
  writeFileSync(join(wt, "scripts/print-verify/baseline.ts"), readFileSync(join(HERE, "baseline.ts")));
  run(await bundle(join(wt, "scripts/print-verify/baseline.ts"), wt, join(OUT, "baseline-base.mjs")), join(baseDir, "base"));
} finally { execSync(`git -C "${ROOT}" worktree remove --force "${wt}"`); }
const unchanged = readdirSync(join(baseDir, "base")).map(f => ({
  doc: f.replace(".html", ""),
  identical: readFileSync(join(baseDir, "base", f), "utf8") === readFileSync(join(baseDir, "branch", f), "utf8"),
}));

/* ── ٢) المطبوعاتُ بالأوضاع كلّها ── */
const fixtures = await bundle(join(HERE, "fixtures.ts"), ROOT, join(OUT, "fixtures.mjs"));
const MODES = ["off", "on", "ghost", "stamp", "signature"];
let logic = null;
for (const m of MODES) {
  mkdirSync(join(OUT, m), { recursive: true });
  const r = JSON.parse(run(fixtures, join(OUT, m), m).trim().split("\n").pop());
  if (m === "on") logic = r.checks;
}

/* ── ٣) صورتان اصطناعيّتان، والطباعةُ إلى PDF ── */
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const synth = await page.evaluate(() => {
  const draw = (w, h, f) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); return c.toDataURL("image/png"); };
  const stamp = draw(1503, 1600, (g, w, h) => {
    g.strokeStyle = "rgba(28,58,160,0.86)"; g.fillStyle = "rgba(28,58,160,0.86)"; g.lineWidth = 46;
    g.beginPath(); g.arc(w / 2, h / 2, 680, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 18; g.beginPath(); g.arc(w / 2, h / 2, 520, 0, Math.PI * 2); g.stroke();
    g.font = "bold 150px sans-serif"; g.textAlign = "center"; g.fillText("STAMP", w / 2, h / 2 + 50);
    g.font = "bold 90px sans-serif"; g.fillText("SAMPLE · TEST", w / 2, h / 2 + 200);
  });
  const signature = draw(1600, 1376, (g) => {
    g.strokeStyle = "rgba(10,20,90,0.92)"; g.lineWidth = 26; g.lineCap = "round"; g.beginPath();
    for (let i = 0; i <= 120; i++) { const x = 120 + i * 11.5, y = 760 + Math.sin(i / 7) * 230 - i * 2; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.beginPath(); g.moveTo(200, 1050); g.lineTo(1450, 980); g.stroke();
  });
  const ghost = (w, h) => draw(w, h, () => {});
  return { stamp, signature, "ghost-stamp": ghost(1503, 1600), "ghost-signature": ghost(1600, 1376) };
});
const pngs = Object.fromEntries(Object.entries(synth).map(([k, v]) => [k, Buffer.from(v.split(",")[1], "base64")]));
await page.route("https://seal.test/*", r => {
  const name = r.request().url().split("/").pop().replace(".png", "");
  return pngs[name] ? r.fulfill({ contentType: "image/png", body: pngs[name] }) : r.fulfill({ status: 404, body: "" });
});
/* الخطوطُ الخارجيّة لا تُجلب (لا شبكة) — كما في بيئةٍ معزولة؛ والخطُّ الاحتياطيُّ يكفي للتخطيط */
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
async function toPdf(htmlFile, pdfFile) {
  await page.setContent(readFileSync(htmlFile, "utf8"), { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(i => (i.complete ? (i.decode ? i.decode().catch(() => {}) : 0) : new Promise(r => { i.onload = i.onerror = r; }))));
  });
  await page.waitForFunction(() => !document.querySelector(".auto-fit-name") || document.documentElement.getAttribute("data-fit-done") === "1", null, { timeout: 5000 }).catch(() => {});
  await page.pdf({ path: pdfFile, preferCSSPageSize: true, printBackground: false });
}
const docs = readdirSync(join(OUT, "on")).filter(f => f.endsWith(".html")).map(f => f.replace(".html", "")).sort();
for (const m of MODES) for (const d of docs) await toPdf(join(OUT, m, `${d}.html`), join(OUT, m, `${d}.pdf`));
await browser.close();

/* ── ٤) القياس ── */
const pagesOf = f => +execFileSync("pdfinfo", [f], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1];
const imagePages = f => execFileSync("pdfimages", ["-list", f], { encoding: "utf8" }).split("\n").slice(2)
  .map(l => l.trim().split(/\s+/)).filter(c => c[2] === "image").map(c => +c[0]);
const wordsOn = (f, p) => execFileSync("pdftotext", ["-f", `${p}`, "-l", `${p}`, f, "-"], { encoding: "utf8" }).split(/\s+/).filter(Boolean).length;
const OVERLAP_PY = `
import sys, json, re, subprocess
from PIL import Image, ImageChops
on, ghost, tmp = sys.argv[1], sys.argv[2], sys.argv[3]
DPI = 60
subprocess.run(["pdftoppm", "-r", str(DPI), "-png", on, tmp + "/on"], check=True)
subprocess.run(["pdftoppm", "-r", str(DPI), "-png", ghost, tmp + "/gh"], check=True)
xml = subprocess.run(["pdftotext", "-bbox", ghost, "-"], capture_output=True, text=True).stdout
pages = re.findall(r'<page width="([\\d.]+)" height="([\\d.]+)">(.*?)</page>', xml, re.S)
import glob
ons = sorted(glob.glob(tmp + "/on-*.png")); ghs = sorted(glob.glob(tmp + "/gh-*.png"))
res = []
for i, (a, b) in enumerate(zip(ons, ghs)):
    A = Image.open(a).convert("L"); B = Image.open(b).convert("L")
    diff = ImageChops.difference(A, B).point(lambda v: 255 if v > 40 else 0)
    box = diff.getbbox()
    words, ink = 0, 0
    if box:
        pw, ph, body = pages[i]
        sx, sy = A.width / float(pw), A.height / float(ph)
        for m in re.finditer(r'xMin="([\\d.]+)" yMin="([\\d.]+)" xMax="([\\d.]+)" yMax="([\\d.]+)"', body):
            x0, y0, x1, y1 = [float(v) for v in m.groups()]
            reg = diff.crop((int(x0 * sx), int(y0 * sy), int(x1 * sx) + 1, int(y1 * sy) + 1))
            if reg.getbbox(): words += 1
        Bp = B.load(); Dp = diff.load()
        for y in range(box[1], box[3]):
            for x in range(box[0], box[2]):
                if Dp[x, y] and Bp[x, y] < 200: ink += 1
    res.append({"page": i + 1, "sealPixels": bool(box), "wordsUnderSeal": words, "inkUnderSeal": ink})
print(json.dumps(res))
`;
writeFileSync(join(OUT, "overlap.py"), OVERLAP_PY);
const rows = [];
for (const d of docs) {
  const on = join(OUT, "on", `${d}.pdf`), ghost = join(OUT, "ghost", `${d}.pdf`), off = join(OUT, "off", `${d}.pdf`);
  const tmp = join(OUT, "tmp", d); mkdirSync(tmp, { recursive: true });
  const ov = JSON.parse(execFileSync("python3", [join(OUT, "overlap.py"), on, ghost, tmp], { encoding: "utf8" }));
  const n = pagesOf(on), withImg = new Set(imagePages(on));
  /* ورقةٌ «فارغة» = لا كلمةَ فيها من التقرير سوى سطر التذييل (إن وُجد) */
  const html = readFileSync(join(OUT, "on", `${d}.html`), "utf8");
  const footerWords = new Set([...html.matchAll(/class="(?:footer|hotel-foot)">([^<]*)</g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean));
  const bodyWords = p => execFileSync("pdftotext", ["-f", `${p}`, "-l", `${p}`, on, "-"], { encoding: "utf8" })
    .split(/\s+/).filter(w => w && !footerWords.has(w)).length;
  const sparse = [...Array(n).keys()].map(i => i + 1).filter(p => bodyWords(p) < 4);
  const single = ["stamp", "signature"].map(m => ({ m, pages: pagesOf(join(OUT, m, `${d}.pdf`)), withImg: new Set(imagePages(join(OUT, m, `${d}.pdf`))).size }));
  rows.push({
    doc: d, pagesOff: pagesOf(off), pagesOn: n,
    sealOnEveryPage: [...Array(n).keys()].every(i => withImg.has(i + 1)),
    pagesWithoutSeal: [...Array(n).keys()].map(i => i + 1).filter(p => !withImg.has(p)),
    wordsUnderSeal: ov.reduce((s, p) => s + p.wordsUnderSeal, 0), inkUnderSeal: ov.reduce((s, p) => s + p.inkUnderSeal, 0),
    sparsePages: sparse, stampOnlyOk: single[0].withImg === single[0].pages, signatureOnlyOk: single[1].withImg === single[1].pages,
  });
}
rmSync(join(OUT, "tmp"), { recursive: true, force: true });

/* ── ٥) معاينات ── */
mkdirSync(join(OUT, "preview"), { recursive: true });
for (const d of docs) for (const m of ["on", "off"]) {
  execFileSync("pdftoppm", ["-r", "55", "-png", join(OUT, m, `${d}.pdf`), join(OUT, "preview", `${d}-${m}`)]);
}
execFileSync("python3", ["-c", `
import glob, os
from PIL import Image, ImageDraw
out = "${join(OUT, "preview")}"
docs = sorted({os.path.basename(f).rsplit("-", 2)[0] for f in glob.glob(out + "/*-on-*.png")})
for d in docs:
    for m in ["on", "off"]:
        fs = sorted(glob.glob(f"{out}/{d}-{m}-*.png"), key=lambda p: int(p.rsplit("-", 1)[1].split(".")[0]))
        ims = [Image.open(f).convert("RGB") for f in fs]
        if not ims: continue
        h = max(i.height for i in ims); w = sum(i.width for i in ims) + 12 * (len(ims) + 1)
        sheet = Image.new("RGB", (w, h + 24), (120, 120, 120)); x = 12
        for i in ims: sheet.paste(i, (x, 12)); x += i.width + 12
        sheet.save(f"{out}/{d}--{m}.png")
        for f in fs: os.remove(f)
`]);

/* ── ٦) ملكيّةُ البنك في الواجهة: موضعٌ واحد، وبابٌ ضيّق ── */
const src = f => readFileSync(join(ROOT, f), "utf8");
const ui = [
  { name: "Company Settings no longer renders the bank card", ok: !/CompanyBankCard/.test(src("src/components/UsersPage.tsx")) },
  { name: "Finance → Account Settings renders the bank card", ok: /settingsTab === "bank" && <CompanyBankCard/.test(src("src/components/FinancePage.tsx")) },
  { name: "the bank card saves through update_company_bank_settings only",
    ok: /companyService\.updateBankSettings\(/.test(src("src/components/finance/CompanyBankCard.tsx"))
        && !/companyService\.updateConfig\(/.test(src("src/components/finance/CompanyBankCard.tsx")) },
  { name: "the card is the only bank editor in the app",
    ok: execSync(`git -C "${ROOT}" grep -l "bank_iban" -- src/components`, { encoding: "utf8" }).trim().split("\n").every(f => /CompanyBankCard\.tsx$/.test(f)) },
  { name: "receipts carry no bank details", ok: !/bank/i.test(src("src/components/finance/finance.print.ts").split("export function makeReceiptHTML")[1].split("export function makePassengerStatementHTML")[0]) },
];
const report = { generatedAt: new Date().toISOString(), baseRef: BASE_REF, unchanged, logic, ui, docs: rows };
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
const bad = [
  ...unchanged.filter(u => !u.identical).map(u => `HTML changed with options OFF: ${u.doc}`),
  ...(logic || []).filter(c => !c.ok).map(c => `logic: ${c.name} ${c.detail ?? ""}`),
  ...ui.filter(c => !c.ok).map(c => `ui: ${c.name}`),
  ...rows.filter(r => !r.sealOnEveryPage && !r.doc.startsWith("receipt")).map(r => `${r.doc}: no seal on pages ${r.pagesWithoutSeal}`),
  ...rows.filter(r => r.wordsUnderSeal || r.inkUnderSeal).map(r => `${r.doc}: overlap (${r.wordsUnderSeal} words, ${r.inkUnderSeal} ink px)`),
  ...rows.filter(r => r.sparsePages.length).map(r => `${r.doc}: nearly empty pages ${r.sparsePages}`),
];
console.table(rows.map(r => ({ doc: r.doc, off: r.pagesOff, on: r.pagesOn, everyPage: r.sealOnEveryPage, words: r.wordsUnderSeal, ink: r.inkUnderSeal,
  sparse: r.sparsePages.join(",") || "-", stampOnly: r.stampOnlyOk, sigOnly: r.signatureOnlyOk })));
console.log(`unchanged with options OFF: ${unchanged.filter(u => u.identical).length}/${unchanged.length}`);
console.log(`logic checks: ${(logic || []).filter(c => c.ok).length}/${(logic || []).length}`);
console.log(`ui checks: ${ui.filter(c => c.ok).length}/${ui.length}`);
if (bad.length) { console.log("FAIL:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`PASS — evidence in ${OUT}`);
if (!existsSync(join(OUT, "report.json"))) process.exit(2);
