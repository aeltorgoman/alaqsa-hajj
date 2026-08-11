#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   س٦ / الخطوة ٣ — نسخ أصول الشركة إلى حاويتها

   ينسخ **ما تشير إليه القاعدة فقط** من `passengers-docs/0/` إلى
   `company-assets`، ثم يتحقّق من كل نسخة بمقارنة الحجم.

   ⚠️ **لا يحذف شيئاً.** الأصل يبقى مكانه، والحذف في الخطوة ٥ بعد
   ثبوت النسخة الجديدة. ولا يكتب في القاعدة — تحديث المراجع خطوةٌ
   تالية تُنفَّذ بعد قراءة تقرير هذا السكربت.

   🔴 مفتاح الخدمة يُقرأ من مدخل مخفيّ ولا يُكتب في ملفّ ولا سجلّ.

   التشغيل:  node supabase/scripts/copy_company_assets.mjs
   ═══════════════════════════════════════════════════════════════ */

import { createClient } from "@supabase/supabase-js";
import readline from "node:readline";
import { Writable } from "node:stream";

const SRC_BUCKET = "passengers-docs";
const DST_BUCKET = "company-assets";
const PUBLIC_PREFIX = `/storage/v1/object/public/${SRC_BUCKET}/`;

/* ── مدخلات ─────────────────────────────────────────────────── */

const muted = new Writable({
  write(chunk, enc, cb) { if (!muted.muted) process.stdout.write(chunk, enc); cb(); },
});

function ask(question, { secret = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
  return new Promise(resolve => {
    muted.muted = false;
    rl.question(question, answer => { rl.close(); if (secret) process.stdout.write("\n"); resolve(answer.trim()); });
    muted.muted = secret;
  });
}

/* ── التنفيذ ────────────────────────────────────────────────── */

const url = await ask("رابط المشروع (https://xxx.supabase.co): ");
const serviceKey = await ask("مفتاح الخدمة (لن يُعرض ولن يُحفظ): ", { secret: true });

if (!url.startsWith("https://") || !serviceKey) {
  console.error("❌ مدخلات ناقصة.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

/* ١) ما تشير إليه القاعدة فعلاً — لا كل ما في المجلّد */
const keyOf = value => {
  if (typeof value !== "string") return "";
  const i = value.indexOf(PUBLIC_PREFIX);
  if (i === -1) return "";
  return decodeURIComponent(value.slice(i + PUBLIC_PREFIX.length).split("?")[0]);
};

const [{ data: assets, error: aErr }, { data: config, error: cErr }] = await Promise.all([
  db.from("company_assets").select("asset_key, asset_url"),
  db.from("company_config").select("logo_url, banner_image_url"),
]);
if (aErr || cErr) { console.error("❌ تعذّرت قراءة المراجع:", aErr || cErr); process.exit(1); }

const referenced = new Set();
for (const row of assets ?? []) { const k = keyOf(row.asset_url); if (k) referenced.add(k); }
for (const row of config ?? []) {
  for (const v of [row.logo_url, row.banner_image_url]) { const k = keyOf(v); if (k) referenced.add(k); }
}

const sources = [...referenced].sort();
if (sources.length === 0) { console.log("لا مراجع إلى الحاوية القديمة — لا شيء يُنسخ."); process.exit(0); }

console.log(`\nالمراجع المرصودة: ${sources.length}\n`);

/* ٢) نسخ ثم تحقّق — كائناً كائناً */
let copied = 0, failed = 0;
const report = [];

for (const src of sources) {
  const dst = src.replace(/^0\//, "");            // يسقط بادئة المجلّد وحدها

  const { data: file, error: dlErr } = await db.storage.from(SRC_BUCKET).download(src);
  if (dlErr || !file) { console.error(`✗ تنزيل ${src}:`, dlErr?.message); failed++; continue; }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await db.storage.from(DST_BUCKET)
    .upload(dst, bytes, { contentType: file.type || "image/jpeg", upsert: true });
  if (upErr) { console.error(`✗ رفع ${dst}:`, upErr.message); failed++; continue; }

  /* التحقّق: يُعاد تنزيل النسخة ويُقارَن حجمها بالأصل */
  const { data: check, error: chErr } = await db.storage.from(DST_BUCKET).download(dst);
  const okSize = check && check.size === file.size;
  if (chErr || !okSize) {
    console.error(`✗ تحقّق ${dst}: ${chErr?.message ?? `الحجم ${check?.size} ≠ ${file.size}`}`);
    failed++; continue;
  }

  const { data: pub } = db.storage.from(DST_BUCKET).getPublicUrl(dst);
  report.push({ من: src, إلى: dst, بايت: file.size, الرابط: pub?.publicUrl ?? "" });
  copied++;
  console.log(`✓ ${src}  →  ${dst}  (${file.size} بايت · تُحقّق منه)`);
}

console.log("\n──────── التقرير ────────");
console.table(report);
console.log(`نُسخ بنجاح: ${copied} · فشل: ${failed}`);
console.log("\nلم يُحذف أي كائن. الأصول باقية في passengers-docs/0/.");
console.log("أرسل هذا التقرير لتُحدَّث مراجع القاعدة في الخطوة التالية.");

process.exit(failed === 0 ? 0 : 1);
