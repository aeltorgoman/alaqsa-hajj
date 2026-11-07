#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   مطابقة سجلّ الهجرات البعيد مع ملفّات `supabase/migrations/`.

   لماذا: نقطة `POST /v1/projects/{ref}/database/migrations` في
   Management API **لا تقبل رقم إصدار** — تُسجّل الهجرة بطابعٍ زمنيّ
   تولّده هي لحظة التطبيق، ولا يبقى منّا إلا `name`. فالمطابقة برقم
   الملف وحده لا تجد شيئاً، وإعادة التشغيل تُعيد تطبيق كل شيء.

   لذلك يُرسل سير العمل اسم الملف كاملاً (`<version>_<name>`) اسماً
   للهجرة، ويُطابَق السجلّ هنا بأيٍّ من:
     · الاسم الكامل `<version>_<name>`           (من هذا الإصدار فصاعداً)
     · رقم الإصدار نفسه                           (ما طبّقه Supabase CLI)
     · الاسم وحده `<name>`                         (سجلّات الإصدارات ≤ 1.0.2؛
                                                    الأسماء فريدة، ويُفحص ذلك)

   الهجرةُ المعادُ ترقيمُها (`RENAMED`): ملفٌّ طُبِّق في تثبيتٍ قائم باسمٍ كاملٍ قديم
   ثم أُعيد ترقيمه ليطابق سجلّ Master. يُعدّ مطبَّقاً **فقط** إن ثبتت الهويّة
   (الاسمُ الكامل القديم بعينه في السجلّ، والاسمُ بلا رقمٍ هو نفسه) والمحتوى
   (sha256 الملفّ الحاليّ = sha256 البايتات التي طُبِّقت باسمها القديم). وإلا فهو
   مدخلٌ مجهول كما كان.

   Fail closed — لا يتجاهل عدم تطابقٍ حقيقيّ:
     · مدخلٌ في السجلّ لا يقابله ملفّ  → فشل (هجرة لا يعرفها الإصدار)
     · ملفٌّ غير مطبَّق يسبق ملفّاً مطبَّقاً → فشل (ثغرة في الترتيب)

   CLI:
     node supabase/scripts/migration-ledger.mjs plan   <history.json>
       يطبع الملفّات المعلّقة بالترتيب، سطراً لكلّ ملف (بلا `.sql`)
     node supabase/scripts/migration-ledger.mjs verify <history.json>
       ينجح فقط إن كان كل ملفّ مسجَّلاً
     node supabase/scripts/migration-ledger.mjs --selftest
   ═══════════════════════════════════════════════════════════════ */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "..", "migrations",
);
const FILE_RE = /^(\d{14})_([a-z0-9_]+)$/;

/* إعادةُ ترقيمٍ مثبَتة: الاسمُ الكامل القديم كما يسجّله التثبيت → الملفّ الحاليّ وsha256
   البايتات المطبَّقة باسمه القديم. لا يُضاف مدخلٌ إلا بمحتوى متطابق بايتاً ببايت. */
export const RENAMED = Object.freeze({
  // #262 طُبِّق في التثبيتات باسم 20261101120000؛ أُعيد ترقيمه في #268 ليطابق سجلّ Master.
  "20261101120000_passengers_document_uniqueness_per_season": Object.freeze({
    file: "20261101155834_passengers_document_uniqueness_per_season",
    sha256: "a13a3eb3783a3d3cca5d9ec0577c2487cb77f66209310e5851f55e5dd4f3a176",
  }),
});

export const fileSha256 = (base, dir = MIGRATIONS_DIR) =>
  crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, `${base}.sql`))).digest("hex");

export function listMigrations(dir = MIGRATIONS_DIR) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => f.slice(0, -4)).sort();
  for (const f of files) {
    if (!FILE_RE.test(f)) throw new Error(`migration file name is not <14-digit version>_<name>.sql: ${f}.sql`);
  }
  const plain = files.map((f) => f.match(FILE_RE)[2]);
  const dup = plain.find((n, i) => plain.indexOf(n) !== i);
  if (dup) throw new Error(`two migration files share the name "${dup}"; history cannot be matched safely`);
  return files;
}

export function reconcile(history, files, { renamed = RENAMED, sha256 = fileSha256 } = {}) {
  if (!Array.isArray(history)) throw new Error("migration history is not a JSON array");
  const byFull = new Map(files.map((f) => [f, f]));
  const byVersion = new Map(files.map((f) => [f.match(FILE_RE)[1], f]));
  const byPlain = new Map(files.map((f) => [f.match(FILE_RE)[2], f]));

  const applied = new Set();
  const unknown = [];
  const viaRename = new Set();
  const direct = new Set();
  for (const e of history) {
    const name = String(e?.name ?? "");
    const version = String(e?.version ?? "");
    let file = byFull.get(name) ?? byVersion.get(version) ?? byPlain.get(name);
    if (file) direct.add(file);
    else if (Object.hasOwn(renamed, name)) {
      file = provenRename(name, renamed[name], files, sha256);
      if (file) viaRename.add(file);
    }
    if (file) applied.add(file);
    else unknown.push(`${version} ${name}`.trim());
  }
  /* الاسمان القديم والجديد معاً: لا يُعرف أيُّهما الحقّ */
  const both = [...viaRename].filter((f) => direct.has(f));
  if (both.length) {
    throw new Error(`migration ${both.join(", ")} is recorded under both its old and its new name; refusing to guess.`);
  }
  if (unknown.length) {
    throw new Error(
      `the database has ${unknown.length} migration(s) that this release does not contain: ${unknown.join(", ")}. ` +
      "Refusing to continue: the database is ahead of, or different from, this release.",
    );
  }

  const pending = files.filter((f) => !applied.has(f));
  return finish(files, applied, pending, history);
}

/* الهويّة: الملفّ الهدف في الإصدار، والاسمُ بلا رقمٍ هو نفسه. المحتوى: sha256 مطابق. */
function provenRename(oldName, { file, sha256: want }, files, sha256) {
  const m = oldName.match(FILE_RE);
  if (!m || !files.includes(file) || file.match(FILE_RE)[2] !== m[2]) return undefined;
  const got = sha256(file);
  if (got !== want) {
    throw new Error(
      `the database records ${oldName}, renamed to ${file}, but that file's content (sha256 ${got}) ` +
      `is not the content applied under the old name (sha256 ${want}). Refusing to treat it as applied.`,
    );
  }
  return file;
}

function finish(files, applied, pending, history) {
  const lastApplied = files.findLastIndex((f) => applied.has(f));
  const gap = pending.find((f) => files.indexOf(f) < lastApplied);
  if (gap) {
    throw new Error(
      `migration ${gap} is not applied, but a later migration (${files[lastApplied]}) is. ` +
      "Refusing to apply out of order.",
    );
  }
  return { pending, applied: files.length - pending.length, total: files.length, entries: history.length };
}

/* ═══ اختبارٌ ذاتيّ — تثبيتاتٌ قائمة وإعادةُ الترقيم المثبتة ═══
   ملفّاتٌ وهميّة وsha256 مُمرَّر: لا يقرأ القرص ولا قاعدة. ينجح فقط إن طابقت كلُّ
   حالةٍ توقّعها. */
export function selftest() {
  const OLD = "20261101120000_passengers_document_uniqueness_per_season";
  const NEW = "20261101155834_passengers_document_uniqueness_per_season";
  const files = ["20261022090000_company_bank_settings_rpc", NEW,
    "20261107104607_private_camps_mixed_gender", "20261107160000_private_camps_gender_independent"];
  const renamed = { [OLD]: { file: NEW, sha256: "good" } };
  const sha = (h) => () => h;
  // كما يسجّلها Customer Backend Setup: رقمٌ يولّده الـAPI واسمُ الملفّ كاملاً
  const api = (...names) => names.map((name, i) => ({ version: String(20261003000000 + i), name }));
  const cases = [
    ["v1.1.0 install + #262 applied under its old name -> rename proven, 2 pending",
      () => reconcile(api(files[0], OLD), files, { renamed, sha256: sha("good") }).pending,
      [files[2], files[3]]],
    ["v1.1.0 install without #262 -> 3 pending in order",
      () => reconcile(api(files[0]), files, { renamed, sha256: sha("good") }).pending,
      [NEW, files[2], files[3]]],
    ["already on the new name -> 2 pending",
      () => reconcile(api(files[0], NEW), files, { renamed, sha256: sha("good") }).pending,
      [files[2], files[3]]],
    ["fully updated -> nothing pending",
      () => reconcile(api(...files), files, { renamed, sha256: sha("good") }).pending, []],
    ["CLI-recorded (version only) history still matches",
      () => reconcile([{ version: "20261022090000", name: "" }], files, { renamed, sha256: sha("good") }).pending,
      [NEW, files[2], files[3]]],
    ["renamed file content differs -> refuse",
      () => reconcile(api(files[0], OLD), files, { renamed, sha256: sha("tampered") }), /is not the content applied/],
    ["old and new name both recorded -> refuse",
      () => reconcile(api(files[0], OLD, NEW), files, { renamed, sha256: sha("good") }), /both its old and its new name/],
    ["old name without a proven rename -> unknown, refuse",
      () => reconcile(api(files[0], OLD), files, { renamed: {}, sha256: sha("good") }), /does not contain/],
    ["rename target missing from the release -> unknown, refuse",
      () => reconcile(api(files[0], OLD), files.filter((f) => f !== NEW), { renamed, sha256: sha("good") }), /does not contain/],
    ["unknown migration in the database -> refuse",
      () => reconcile(api(files[0], "20261201000000_not_in_this_release"), files, { renamed, sha256: sha("good") }), /does not contain/],
    ["applied later migration with a gap -> refuse",
      () => reconcile(api(files[0], files[3]), files, { renamed, sha256: sha("good") }), /out of order/],
    ["the shipped RENAMED entry is proven on this repository's files",
      () => { const f = listMigrations(); const e = RENAMED[OLD];
        return [f.includes(e.file), fileSha256(e.file) === e.sha256]; }, [true, true]],
  ];
  let bad = 0;
  for (const [name, run, want] of cases) {
    let ok;
    try { const got = run(); ok = !(want instanceof RegExp) && JSON.stringify(got) === JSON.stringify(want); }
    catch (e) { ok = want instanceof RegExp && want.test(e.message); }
    process.stdout.write(`  ${ok ? "ok  " : "FAIL"} ${name}\n`);
    if (!ok) bad++;
  }
  process.stdout.write(`selftest ${bad ? "FAILED" : "PASSED"} (${cases.length - bad}/${cases.length})\n`);
  return bad;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, historyFile] = process.argv.slice(2);
  if (mode === "--selftest") process.exit(selftest() ? 1 : 0);
  try {
    if (!["plan", "verify"].includes(mode) || !historyFile) throw new Error("usage: migration-ledger.mjs plan|verify <history.json>");
    const r = reconcile(JSON.parse(fs.readFileSync(historyFile, "utf8")), listMigrations());
    if (mode === "plan") {
      process.stderr.write(`migrations: ${r.applied} of ${r.total} already applied, ${r.pending.length} to apply\n`);
      for (const f of r.pending) process.stdout.write(`${f}\n`);
    } else if (r.pending.length) {
      throw new Error(`${r.pending.length} migration(s) not recorded in the database: ${r.pending.join(", ")}`);
    } else {
      process.stdout.write(`all ${r.total} migrations are recorded in the database\n`);
    }
  } catch (e) {
    process.stderr.write(`::error::${e.message}\n`);
    process.exit(1);
  }
}
