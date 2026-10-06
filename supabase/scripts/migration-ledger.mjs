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

   Fail closed — لا يتجاهل عدم تطابقٍ حقيقيّ:
     · مدخلٌ في السجلّ لا يقابله ملفّ  → فشل (هجرة لا يعرفها الإصدار)
     · ملفٌّ غير مطبَّق يسبق ملفّاً مطبَّقاً → فشل (ثغرة في الترتيب)

   CLI:
     node supabase/scripts/migration-ledger.mjs plan   <history.json>
       يطبع الملفّات المعلّقة بالترتيب، سطراً لكلّ ملف (بلا `.sql`)
     node supabase/scripts/migration-ledger.mjs verify <history.json>
       ينجح فقط إن كان كل ملفّ مسجَّلاً
   ═══════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "..", "migrations",
);
const FILE_RE = /^(\d{14})_([a-z0-9_]+)$/;

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

export function reconcile(history, files) {
  if (!Array.isArray(history)) throw new Error("migration history is not a JSON array");
  const byFull = new Map(files.map((f) => [f, f]));
  const byVersion = new Map(files.map((f) => [f.match(FILE_RE)[1], f]));
  const byPlain = new Map(files.map((f) => [f.match(FILE_RE)[2], f]));

  const applied = new Set();
  const unknown = [];
  for (const e of history) {
    const name = String(e?.name ?? "");
    const version = String(e?.version ?? "");
    const file = byFull.get(name) ?? byVersion.get(version) ?? byPlain.get(name);
    if (file) applied.add(file);
    else unknown.push(`${version} ${name}`.trim());
  }
  if (unknown.length) {
    throw new Error(
      `the database has ${unknown.length} migration(s) that this release does not contain: ${unknown.join(", ")}. ` +
      "Refusing to continue: the database is ahead of, or different from, this release.",
    );
  }

  const pending = files.filter((f) => !applied.has(f));
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, historyFile] = process.argv.slice(2);
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
