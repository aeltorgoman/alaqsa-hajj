#!/usr/bin/env node
// قوائمُ المخيّمات المطبوعة بالبانيات الحقيقيّة → PDF في Chromium → النصّ المطبوع (pdftotext):
//   الخاصّ «رجال ونساء» وفيه الجنسان؛ العاديّ «رجال» أو «نساء» — منى وعرفة، قائمةُ مخيّمٍ وقائمةُ الكلّ.
//   node scripts/ui-verify/camp-print.mjs [--out DIR]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const PV = join(ROOT, "scripts/print-verify");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg("--out", join(ROOT, ".print-verify-flow/camp-print")));
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { build } = require(join(ROOT, "node_modules/rolldown"));
const stubs = { name: "stubs", resolveId(id, importer) {
  if (!importer) return null;
  if (/(^|\/)supabase$|(^|\/)portalSupabase$/.test(id)) return join(PV, "supabase-stub.ts");
  if (/(^|\/)print\.output$/.test(id) && importer.startsWith(join(ROOT, "src/print"))) return join(PV, "output-stub.ts");
  return null; } };
const bundle = join(OUT, "camp-print.mjs");
await build({ input: join(HERE, "camp-print.ts"), platform: "node", plugins: [stubs], external: [/^pdfjs-dist/, /^react/, /^xlsx/], output: { file: bundle, format: "esm", codeSplitting: false }, logLevel: "silent" });
execFileSync(process.execPath, [bundle, OUT]);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const printed = async name => {
  await page.setContent(readFileSync(join(OUT, `${name}.html`), "utf8"), { waitUntil: "load" });
  const pdf = join(OUT, `${name}.pdf`);
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  return execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" });
};
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
/* pdftotext يُخرج العربيّة بترتيب العرض — يُقارَن بعد إزالة الفراغات من الطرفين */
const has = (txt, s) => txt.replace(/\s+/g, " ").includes(s);
for (const tag of ["mina", "arafa"]) {
  const prv = await printed(`${tag}-camp-1`), men = await printed(`${tag}-camp-2`), women = await printed(`${tag}-camp-3`), all = await printed(`${tag}-all`);
  const html = n => readFileSync(join(OUT, `${tag}-${n}.html`), "utf8");
  check(`${tag}: private tent sheet is subtitled «رجال ونساء» and lists both the man and the woman`,
    html("camp-1").includes("رجال ونساء") && has(prv, "رجال ونساء") && has(prv, "رجل في الخاص") && has(prv, "امرأة في الخاص"));
  check(`${tag}: regular men's / women's sheets keep «رجال» / «نساء» (not «رجال ونساء»)`,
    !html("camp-2").includes("رجال ونساء") && !html("camp-3").includes("رجال ونساء")
    && has(men, "رجال") && has(women, "نساء") && has(men, "رجل عادي") && has(women, "امرأة عادية"));
  check(`${tag}: all-camps print labels the private tent «رجال ونساء»`, html("all").includes("رجال ونساء") && has(all, "رجال ونساء"));
}
await browser.close();
const bad = results.filter(r => !r).length;
console.log(bad ? `FAIL — ${bad} of ${results.length}` : `PASS — ${results.length} checks; evidence in ${OUT}`);
process.exit(bad ? 1 : 0);
