#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   مفاتيح الصلاحيات من مصدرها الوحيد: `ALL_PERMISSIONS` في
   `src/utils/index.ts`.

   أول مدير يُمنح **كل** صلاحيات النظام. فبدل نسخةٍ ثانية وثالثة من
   القائمة تنحرف عن الواجهة بصمت، يقرأها كلٌّ من:
     · `seed_first_admin.mjs` (أداة الطوارئ)
     · سير عمل `Customer Backend Setup` (الإقلاع في نشر العميل)
   من الملف نفسه الذي تقرأ منه الواجهة.

   Fail closed: إن تغيّر شكل الكتلة فلم تُقرأ مفاتيح صالحة، أو تكرّر
   مفتاح، يتوقّف القارئ — ولا يمنح قائمةً ناقصة.

   CLI: يطبع المفاتيح مصفوفة JSON على سطر واحد.
     node supabase/scripts/permission-keys.mjs
   ═══════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "utils", "index.ts",
);

export function readPermissionKeys(source = SOURCE) {
  const text = fs.readFileSync(source, "utf8");
  const start = text.indexOf("export const ALL_PERMISSIONS = [");
  const end = start < 0 ? -1 : text.indexOf("\n];", start);
  if (start < 0 || end < 0) throw new Error(`ALL_PERMISSIONS block not found in ${source}`);

  const keys = [...text.slice(start, end).matchAll(/\bkey:\s*"([^"]*)"/g)].map((m) => m[1]);
  if (keys.length === 0) throw new Error("ALL_PERMISSIONS has no keys");
  for (const k of keys) {
    if (!/^[a-z][a-z_]*$/.test(k)) throw new Error(`invalid permission key: ${JSON.stringify(k)}`);
  }
  if (new Set(keys).size !== keys.length) throw new Error("duplicate permission key in ALL_PERMISSIONS");
  return keys;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(readPermissionKeys())}\n`);
  } catch (e) {
    process.stderr.write(`✗ ${e.message}\n`);
    process.exit(1);
  }
}
