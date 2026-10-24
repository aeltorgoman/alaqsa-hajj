#!/usr/bin/env node
// ============================================================
// تحقّقُ المطبوعات: Chromium print-to-PDF من بُناة المطبوعات الحقيقيّة
// ============================================================
/* لا قاعدةَ ولا شبكةَ ولا أصلَ خاصّ. الختمُ والتوقيعُ صورتان اصطناعيّتان
   تُرسمان في المتصفّح وقتَ التشغيل، وتُخدَمان من `https://seal.test/`
   داخل جلسة الاختبار وحدها — فلا يُكتب أصلٌ حقيقيٌّ في ملفٍّ ولا مستودع.

   node scripts/print-verify/run.mjs [--out DIR] [--base-ref origin/main] [--before-ref COMMIT]

   `--before-ref`: نسخةٌ سابقةٌ من هذا التحقّق نفسه (بمطبوعاتها) تُطبع بالصور
   الخام نفسها، فيُقارَن عددُ الأوراق ومقاسُ الختم قبل التصحيح وبعده.
   والخطوط: يُحمَّل ما يطلبه المستند من الويب كما في المتصفّح الحقيقيّ،
   وخطوطُ النظام بـ`FONTCONFIG_FILE` إن أُريد خطٌّ عربيٌّ آخر.

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
const BEFORE_REF = arg("--before-ref", "");
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
/* تغييرٌ مقصودٌ موثَّق: كرتُ الفندق المطبوع صار بترتيب كرت الشاشة وأسمائه، ولا
   يُقصّ منه صفّ — فمستندُ الفندق يختلف عن الأساس ولو أُطفئت الخيارات، ويُتحقَّق
   منه بـ`hotel-fidelity.mjs` */
const INTENDED_CHANGE = new Set(["hotel-p", "hotel-l"]);
const unchanged = readdirSync(join(baseDir, "base")).map(f => ({
  doc: f.replace(".html", ""),
  identical: readFileSync(join(baseDir, "base", f), "utf8") === readFileSync(join(baseDir, "branch", f), "utf8"),
  intended: INTENDED_CHANGE.has(f.replace(".html", "")),
}));

/* ── ٢) صورتان اصطناعيّتان بحشوٍ شفّافٍ واسع كما تُرفع، ثم القصُّ الحقيقيّ ──
   تُرسمان بأبعاد أصلَي الحملة (١٥٠٣×١٦٠٠ و١٦٠٠×١٣٧٦) والحبرُ نحو ٧٠٪ منها
   والباقي شفّاف — فيُختبر `trimSealImage` نفسُه (src/company/sealTrim.ts) في
   المتصفّح، والمطبوعُ «بعد» يأخذ ناتجَه كما في التطبيق. */
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const raw = await page.evaluate(() => {
  const draw = (w, h, f) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); return c.toDataURL("image/png"); };
  const stamp = draw(1503, 1600, (g, w, h) => {
    g.strokeStyle = "rgba(28,58,160,0.86)"; g.fillStyle = "rgba(28,58,160,0.86)"; g.lineWidth = 34;
    g.beginPath(); g.arc(w / 2, h / 2, 520, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 14; g.beginPath(); g.arc(w / 2, h / 2, 400, 0, Math.PI * 2); g.stroke();
    g.font = "bold 120px sans-serif"; g.textAlign = "center"; g.fillText("STAMP", w / 2, h / 2 + 40);
    g.font = "bold 70px sans-serif"; g.fillText("SAMPLE · TEST", w / 2, h / 2 + 160);
  });
  const signature = draw(1600, 1376, (g) => {
    g.strokeStyle = "rgba(10,20,90,0.92)"; g.lineWidth = 22; g.lineCap = "round"; g.beginPath();
    for (let i = 0; i <= 110; i++) { const x = 260 + i * 10, y = 690 + Math.sin(i / 7) * 160 - i * 1.5; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.beginPath(); g.moveTo(320, 900); g.lineTo(1340, 850); g.stroke();
  });
  return { stamp, signature };
});
const trimJs = join(OUT, "sealTrim.js");
await build({ input: join(ROOT, "src/company/sealTrim.ts"), platform: "browser",
  output: { file: trimJs, format: "iife", name: "SealTrim", codeSplitting: false }, logLevel: "silent" });
await page.addScriptTag({ content: readFileSync(trimJs, "utf8") });
const cut = await page.evaluate(async r => ({
  stamp: await window.SealTrim.trimSealImage(r.stamp), signature: await window.SealTrim.trimSealImage(r.signature),
}), raw);
if (!cut.stamp || !cut.signature) throw new Error("trimSealImage returned null for the synthetic seals");
const ghosts = await page.evaluate(c => {
  const blank = (w, h) => { const x = document.createElement("canvas"); x.width = w; x.height = h; return x.toDataURL("image/png"); };
  return { stamp: blank(c.stamp.width, c.stamp.height), signature: blank(c.signature.width, c.signature.height) };
}, cut);
const png = u => Buffer.from(u.split(",")[1], "base64");
const IMAGES = {
  after: { stamp: png(cut.stamp.url), signature: png(cut.signature.url), "ghost-stamp": png(ghosts.stamp), "ghost-signature": png(ghosts.signature) },
  before: { stamp: png(raw.stamp), signature: png(raw.signature) },
};
const SEAL_PX = { stamp: { w: cut.stamp.width, h: cut.stamp.height }, signature: { w: cut.signature.width, h: cut.signature.height },
  rawStamp: { w: 1503, h: 1600 }, rawSignature: { w: 1600, h: 1376 } };
writeFileSync(join(OUT, "seals.json"), JSON.stringify(SEAL_PX));
let served = IMAGES.after;
await page.route("https://seal.test/*", r => {
  const name = r.request().url().split("/").pop().replace(".png", "");
  return served[name] ? r.fulfill({ contentType: "image/png", body: served[name] }) : r.fulfill({ status: 404, body: "" });
});

/* ── ٣) المطبوعاتُ بالأوضاع كلّها ── */
const fixtures = await bundle(join(HERE, "fixtures.ts"), ROOT, join(OUT, "fixtures.mjs"));
const MODES = ["off", "on", "ghost", "stamp", "signature"];
let logic = null;
for (const m of MODES) {
  mkdirSync(join(OUT, m), { recursive: true });
  const r = JSON.parse(execFileSync(process.execPath, [fixtures, join(OUT, m), m], { encoding: "utf8", maxBuffer: 64 << 20,
    env: { ...process.env, SEALS_JSON: join(OUT, "seals.json") } }).trim().split("\n").pop());
  if (m === "on") logic = r.checks;
}
/* «قبل»: المطبوعاتُ كما بناها `--before-ref` بالصور الخام نفسها */
if (BEFORE_REF) {
  const bw = join(OUT, "before-worktree");
  execSync(`git -C "${ROOT}" worktree add -q --detach "${bw}" ${BEFORE_REF}`);
  try {
    symlinkSync(join(ROOT, "node_modules"), join(bw, "node_modules"));
    const bf = await bundle(join(bw, "scripts/print-verify/fixtures.ts"), bw, join(OUT, "fixtures-before.mjs"));
    mkdirSync(join(OUT, "before"), { recursive: true });
    execFileSync(process.execPath, [bf, join(OUT, "before"), "on"], { encoding: "utf8", maxBuffer: 64 << 20,
      env: { ...process.env, SEALS_JSON: join(OUT, "seals.json") } });
  } finally { execSync(`git -C "${ROOT}" worktree remove --force "${bw}"`); }
}

/* خطٌّ بديلٌ لـ«Tajawal» (أوّلِ ما تطلبه المطبوعات) — لتحقّقٍ بمقاييس خطٍّ أخرى:
   PRINT_VERIFY_FONT=ملف.ttf. يُحقن في كلّ وضعٍ (مطفأ/مشعَل/قبل) بالتساوي. */
const FONT_FACE = process.env.PRINT_VERIFY_FONT
  ? `<style>@font-face{font-family:'Tajawal';src:url(data:font/ttf;base64,${readFileSync(process.env.PRINT_VERIFY_FONT).toString("base64")})}</style>` : "";
async function toPdf(htmlFile, pdfFile) {
  const html = FONT_FACE ? readFileSync(htmlFile, "utf8").replace(/<head[^>]*>/i, m => m + FONT_FACE) : readFileSync(htmlFile, "utf8");
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(i => (i.complete ? (i.decode ? i.decode().catch(() => {}) : 0) : new Promise(r => { i.onload = i.onerror = r; }))));
  });
  await page.waitForFunction(() => !document.querySelector(".auto-fit-name") || document.documentElement.getAttribute("data-fit-done") === "1", null, { timeout: 5000 }).catch(() => {});
  /* كما ينتظر `printInPage`: قرارُ موضع الختم يُتَّخذ في المستند بعد تخطيطه */
  if (html.includes("data-seal-plan")) await page.waitForFunction(() => document.documentElement.hasAttribute("data-seal-plan"), null, { timeout: 9000 }).catch(() => {});
  const plan = await page.evaluate(() => ["data-seal-plan", "data-seal-sim", "data-seal-evidence", "data-seal-placements"].map(a => document.documentElement.getAttribute(a)));
  /* هندسةُ المجموعة كما رُسمت: التداخلُ بين الختم والتوقيع بالمليمتر */
  geometry[htmlFile] = await page.evaluate(() => {
    const g = document.querySelector(".seal-group, .print-seals-overlay, .print-seals");
    if (!g || getComputedStyle(g).display === "none") return null;
    const im = [...g.querySelectorAll("img")].map(i => i.getBoundingClientRect());
    const mm = v => Math.round(v * 25.4 / 96 * 10) / 10;
    return { overlapMm: im.length === 2 ? mm(Math.min(im[0].right, im[1].right) - Math.max(im[0].left, im[1].left)) : null };
  });
  await page.pdf({ path: pdfFile, preferCSSPageSize: true, printBackground: false });
  return plan;
}
const docs = readdirSync(join(OUT, "on")).filter(f => f.endsWith(".html")).map(f => f.replace(".html", "")).sort();
const plans = {}, sims = {}, evidence = {}, geometry = {}, placements = {};
for (const m of MODES) for (const d of docs) {
  const plan = await toPdf(join(OUT, m, `${d}.html`), join(OUT, m, `${d}.pdf`));
  if (m === "on") plans[d] = plan[0], sims[d] = plan[1], evidence[d] = plan[2], placements[d] = plan[3] ? JSON.parse(plan[3]) : null;
}
/* «قبل» بالصور المقصوصة نفسها (ما يطبعه التطبيقُ منذ قصّ الحشو) — مقارنةُ تخطيطٍ لا صور */
const beforeDocs = BEFORE_REF ? docs.filter(d => existsSync(join(OUT, "before", `${d}.html`))) : [];
for (const d of beforeDocs) await toPdf(join(OUT, "before", `${d}.html`), join(OUT, "before", `${d}.pdf`));
await browser.close();

/* ── ٤) القياس ── */
const pagesOf = f => +execFileSync("pdfinfo", [f], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1];
const imagePages = f => execFileSync("pdfimages", ["-list", f], { encoding: "utf8" }).split("\n").slice(2)
  .map(l => l.trim().split(/\s+/)).filter(c => c[2] === "image").map(c => +c[0]);
/* مقاسُ الصورتين المرئيّ على الورق بالمليمتر (بكسلاتُ الصورة ÷ دقّتُها في الـPDF).
   والصورةُ بعد القصّ هي الحبرُ وحاشيةٌ ٢٪؛ وقبله الصورةُ الخام بحشوها، فيُضرب
   في نسبة الحبر إليها ليُقارَن الحبرُ بالحبر. */
const INK = { stamp: { w: 1074 / 1503, h: 1074 / 1600 } };
const sealMm = (f) => {
  const before = false;
  const ims = execFileSync("pdfimages", ["-list", f], { encoding: "utf8" }).split("\n").slice(2)
    .map(l => l.trim().split(/\s+/)).filter(c => c[2] === "image")
    .map(c => ({ page: +c[0], w: +c[3], h: +c[4], mmW: +c[3] / +c[12] * 25.4, mmH: +c[4] / +c[13] * 25.4 }));
  const pick = (px) => ims.filter(i => Math.abs(i.w / i.h - px.w / px.h) < 0.03 && i.w === px.w);
  const st = pick(before ? SEAL_PX.rawStamp : SEAL_PX.stamp)[0], sg = pick(before ? SEAL_PX.rawSignature : SEAL_PX.signature)[0];
  const r = v => Math.round(v * 10) / 10;
  return {
    stamp: st ? `${r(st.mmW)}×${r(st.mmH)}` : "-",
    stampInkH: st ? r(before ? st.mmH * INK.stamp.h : st.mmH / 1.04) : 0,
    signature: sg ? `${r(sg.mmW)}×${r(sg.mmH)}` : "-",
  };
};
/* صورُ كلّ ورقةٍ في الـPDF: الختمُ والتوقيعُ مرّةً واحدة لا أكثر (لا فيضَ إلى ورقةٍ أخرى) */
const imagesPerPage = (f, n) => { const c = Array(n).fill(0); for (const p of imagePages(f)) c[p - 1]++; return c; };
const wordsOn = (f, p) => execFileSync("pdftotext", ["-f", `${p}`, "-l", `${p}`, f, "-"], { encoding: "utf8" }).split(/\s+/).filter(Boolean).length;
const OVERLAP_PY = `
import sys, json, re, subprocess
from PIL import Image, ImageChops
on, ghost, tmp = sys.argv[1], sys.argv[2], sys.argv[3]
# كلماتُ سطر التذييل الختاميّ زينةٌ يجوز أن تعلوها المجموعة (كما في المخطِّط)
strip_marks = lambda w: re.sub(r"[\\u064B-\\u0652\\u0640]", "", w)
# بترتيب الحروف لا بتسلسلها: pdftotext يعكس العربيّة ويقلب «لا» المركّبة
canon = lambda w: "".join(sorted(strip_marks(w)))
decorative = {canon(w) for w in (json.loads(sys.argv[4]) if len(sys.argv) > 4 else [])}
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
        for m in re.finditer(r'xMin="([\\d.]+)" yMin="([\\d.]+)" xMax="([\\d.]+)" yMax="([\\d.]+)">([^<]*)<', body):
            x0, y0, x1, y1 = [float(v) for v in m.groups()[:4]]
            if canon(m.group(5).strip()) in decorative: continue
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
  /* ورقةٌ «فارغة» = لا كلمةَ فيها من التقرير سوى سطر التذييل (إن وُجد) */
  const html = readFileSync(join(OUT, "on", `${d}.html`), "utf8");
  const footerWords = new Set([...html.matchAll(/class="(?:footer|hotel-foot)">([^<]*)</g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean));
  const closing = [...html.matchAll(/<div class="footer">([^<]*)</g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean);
  const ov = JSON.parse(execFileSync("python3", [join(OUT, "overlap.py"), on, ghost, tmp, JSON.stringify(closing)], { encoding: "utf8" }));
  const n = pagesOf(on), withImg = new Set(imagePages(on));
  const bodyWords = p => execFileSync("pdftotext", ["-f", `${p}`, "-l", `${p}`, on, "-"], { encoding: "utf8" })
    .split(/\s+/).filter(w => w && !footerWords.has(w)).length;
  const sparse = [...Array(n).keys()].map(i => i + 1).filter(p => bodyWords(p) < 4);
  const single = ["stamp", "signature"].map(m => ({ m, pages: pagesOf(join(OUT, m, `${d}.pdf`)), withImg: new Set(imagePages(join(OUT, m, `${d}.pdf`))).size }));
  const mm = sealMm(on), bmm = beforeDocs.includes(d) ? sealMm(join(OUT, "before", `${d}.pdf`)) : null;
  const sameAsBefore = beforeDocs.includes(d) ? readFileSync(join(OUT, "before", `${d}.html`), "utf8") === readFileSync(join(OUT, "on", `${d}.html`), "utf8") : null;
  rows.push({
    doc: d, placements: placements[d], imagesPerPage: imagesPerPage(on, n), sameHtmlAsBefore: sameAsBefore, overlapMm: geometry[join(OUT, "on", `${d}.html`)]?.overlapMm ?? null, pagesOff: pagesOf(off), simulatedOff: sims[d] == null ? null : +sims[d], evidence: evidence[d], pagesBefore: bmm ? pagesOf(join(OUT, "before", `${d}.pdf`)) : null, pagesOn: n, plan: plans[d],
    stampMm: mm.stamp, signatureMm: mm.signature, stampInkMm: mm.stampInkH, beforeStampInkMm: bmm?.stampInkH ?? null,
    beforeStampMm: bmm?.stamp ?? null, beforeSignatureMm: bmm?.signature ?? null,
    sealOnEveryPage: [...Array(n).keys()].every(i => withImg.has(i + 1)),
    pagesWithoutSeal: [...Array(n).keys()].map(i => i + 1).filter(p => !withImg.has(p)),
    wordsUnderSeal: ov.reduce((s, p) => s + p.wordsUnderSeal, 0), inkUnderSeal: ov.reduce((s, p) => s + p.inkUnderSeal, 0),
    sparsePages: sparse, stampOnlyOk: single[0].withImg === single[0].pages, signatureOnlyOk: single[1].withImg === single[1].pages,
  });
}
rmSync(join(OUT, "tmp"), { recursive: true, force: true });

/* ── ٥) معاينات ── */
mkdirSync(join(OUT, "preview"), { recursive: true });
for (const d of docs) for (const m of ["on", "off", ...(beforeDocs.includes(d) ? ["before"] : [])]) {
  execFileSync("pdftoppm", ["-r", "55", "-png", join(OUT, m, `${d}.pdf`), join(OUT, "preview", `${d}-${m}`)]);
}
execFileSync("python3", ["-c", `
import glob, os
from PIL import Image, ImageDraw
out = "${join(OUT, "preview")}"
docs = sorted({os.path.basename(f).rsplit("-", 2)[0] for f in glob.glob(out + "/*-on-*.png")})
for d in docs:
    for m in ["on", "off", "before"]:
        fs = sorted(glob.glob(f"{out}/{d}-{m}-*.png"), key=lambda p: int(p.rsplit("-", 1)[1].split(".")[0]))
        ims = [Image.open(f).convert("RGB") for f in fs]
        if not ims: continue
        h = max(i.height for i in ims); w = sum(i.width for i in ims) + 12 * (len(ims) + 1)
        sheet = Image.new("RGB", (w, h + 24), (120, 120, 120)); x = 12
        for i in ims: sheet.paste(i, (x, 12)); x += i.width + 12
        sheet.save(f"{out}/{d}--{m}.png")
        for f in fs: os.remove(f)
    # مقارنة: قبل التصحيح (ختمٌ مُشغَّل) · بعده · الخيارُ مطفأ
    rows = [(lbl, f"{out}/{d}--{m}.png") for lbl, m in [("BEFORE fix - seals ON", "before"), ("AFTER fix - seals ON", "on"), ("seals OFF", "off")]
            if os.path.exists(f"{out}/{d}--{m}.png")]
    ims = [(l, Image.open(p)) for l, p in rows]
    W = max(i.width for _, i in ims); H = sum(i.height + 22 for _, i in ims)
    cmp = Image.new("RGB", (W, H), (255, 255, 255)); y = 0; dr = ImageDraw.Draw(cmp)
    for l, i in ims:
        dr.text((8, y + 5), f"{d}: {l}", fill=(0, 0, 0)); cmp.paste(i, (0, y + 22)); y += i.height + 22
    cmp.save(f"{out}/{d}--compare.png")
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
  ...unchanged.filter(u => !u.identical && !u.intended).map(u => `HTML changed with options OFF: ${u.doc}`),
  ...(logic || []).filter(c => !c.ok).map(c => `logic: ${c.name} ${c.detail ?? ""}`),
  ...ui.filter(c => !c.ok).map(c => `ui: ${c.name}`),
  ...rows.filter(r => !r.sealOnEveryPage && !r.doc.startsWith("receipt")).map(r => `${r.doc}: no seal on pages ${r.pagesWithoutSeal}`),
  /* المسموح: حدودُ جدولٍ أو خلفيّةٌ تحت الحبر؛ الممنوع: كلمةٌ تحته */
  ...rows.filter(r => !r.doc.startsWith("receipt") && !r.doc.startsWith("hotel") && r.imagesPerPage.some(c => c !== 2))
    .map(r => `${r.doc}: stamp+signature not exactly once per page (${r.imagesPerPage})`),
  ...rows.filter(r => r.wordsUnderSeal).map(r => `${r.doc}: ${r.wordsUnderSeal} word(s) under the stamp/signature ink`),
  /* الإيصالُ A5 معتمَدٌ كما هو: مطابقٌ بايتاً ببايت لـ --before-ref */
  ...rows.filter(r => r.doc.startsWith("receipt") && r.sameHtmlAsBefore === false).map(r => `${r.doc}: A5 receipt HTML changed`),
  ...rows.filter(r => r.sparsePages.length).map(r => `${r.doc}: nearly empty pages ${r.sparsePages}`),
];
console.table(rows.map(r => ({ doc: r.doc, off: r.pagesOff, sim: r.simulatedOff ?? "-", before: r.pagesBefore ?? "-", on: r.pagesOn, plan: r.plan ?? "-",
  stampMm: r.stampMm, sigMm: r.signatureMm, overlap: r.overlapMm ?? "-",
  where: (r.placements || []).map(p => p ? (p.x === 0 && p.raise === 0 ? "L" : `x${p.x}${p.raise ? "↑" + p.raise : ""}`) : "∅").join(" ") || "-",
  everyPage: r.sealOnEveryPage, words: r.wordsUnderSeal, ink: r.inkUnderSeal, sparse: r.sparsePages.join(",") || "-",
  stampOnly: r.stampOnlyOk, sigOnly: r.signatureOnlyOk })));
const extra = rows.filter(r => r.pagesOn > r.pagesOff);
const exceptions = rows.filter(r => /exception|extra/.test(r.plan || ""));
console.log(exceptions.length ? `UNRESOLVED EXCEPTIONS: ${exceptions.map(r => `${r.doc} (${r.plan})`).join(", ")}` : "unresolved exceptions: none");
console.log(extra.length ? `extra pages with seals ON: ${extra.map(r => `${r.doc} ${r.pagesOff}→${r.pagesOn} (${r.plan}; ${r.evidence ?? "no evidence"})`).join(", ")}` : "extra pages with seals ON: none");
const missim = rows.filter(r => r.simulatedOff != null && r.simulatedOff !== r.pagesOff);
console.log(missim.length ? `simulation ≠ real OFF pages: ${missim.map(r => `${r.doc} sim ${r.simulatedOff} real ${r.pagesOff}`).join(", ")}` : "simulation = real OFF pages for every planned doc");
console.log(`unchanged with options OFF: ${unchanged.filter(u => u.identical).length}/${unchanged.length}` +
  ` (intended hotel-card fix: ${unchanged.filter(u => u.intended).map(u => `${u.doc} ${u.identical ? "same" : "changed"}`).join(", ")})`);
console.log(`logic checks: ${(logic || []).filter(c => c.ok).length}/${(logic || []).length}`);
console.log(`ui checks: ${ui.filter(c => c.ok).length}/${ui.length}`);
if (bad.length) { console.log("FAIL:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`PASS — evidence in ${OUT}`);
if (!existsSync(join(OUT, "report.json"))) process.exit(2);
