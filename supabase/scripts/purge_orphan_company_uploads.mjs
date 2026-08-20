#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   س٦ / الخطوة ٥ — حذف رفوع أصول الشركة اليتيمة تحت `passengers-docs/0/`

   الأصول انتقلت إلى حاويتها `company-assets` في الخطوة ٣، وبقيت
   تحت `0/` نسخٌ قديمة من كل مرّة رُفع فيها شعار أو خلفية. لا يشير
   إليها شيء، وهي في حاوية صارت خاصّة — فبقاؤها تخزينٌ لا خطر.

   ⚠️ **لا يحذف هذا السكربت شيئاً يثبت أنه مرجوع.** يعيد إثبات
   اليُتم بنفسه من القاعدة قبل كل حذف، ويرفض أي كائن:
     • يشير إليه عمود مستند لحاجّ
     • أو يشير إليه `company_assets` أو `company_config`
     • أو لا يطابق تسمية أصول الشركة `company_(logo|banner)_…`
     • أو يقع خارج `0/`

   فلو تغيّرت القاعدة بين التدقيق والتشغيل، يقف السكربت عند الكائن
   المشكوك فيه ولا يخمّن.

   🔴 مفتاح الخدمة من مدخل مخفيّ — لا يُكتب في ملفّ ولا سجلّ.

   التشغيل:  node supabase/scripts/purge_orphan_company_uploads.mjs
             ويطلب تأكيداً صريحاً بكتابة عدد الكائنات قبل الحذف.
   ═══════════════════════════════════════════════════════════════ */

import { createClient } from "@supabase/supabase-js";
import readline from "node:readline";
import { Writable } from "node:stream";

const BUCKET = "passengers-docs";
const PREFIX = "0";
/* تسمية أصول الشركة وحدها — أي اسم آخر تحت `0/` يوقف الحذف */
const ASSET_NAME = /^company_(logo|banner)_\d+\.(jpg|jpeg|png|webp)$/i;

const muted = new Writable({
  write(chunk, enc, cb) { if (!muted.muted) process.stdout.write(chunk, enc); cb(); },
});
function ask(question, { secret = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
  return new Promise(resolve => {
    muted.muted = false;
    rl.question(question, a => { rl.close(); if (secret) process.stdout.write("\n"); resolve(a.trim()); });
    muted.muted = secret;
  });
}

const url = await ask("رابط المشروع (https://xxx.supabase.co): ");
const serviceKey = await ask("مفتاح الخدمة (لن يُعرض ولن يُحفظ): ", { secret: true });
if (!url.startsWith("https://") || !serviceKey) { console.error("❌ مدخلات ناقصة."); process.exit(1); }

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

/* ── ١) كل مرجع قائم في القاعدة ── */
const [passengers, assets, config] = await Promise.all([
  db.from("passengers").select("photo_url,passport_url,national_id_url,contract_url,hajj_permit_url,flight_ticket_url"),
  db.from("company_assets").select("asset_url"),
  db.from("company_config").select("logo_url,banner_image_url"),
]);
for (const r of [passengers, assets, config]) {
  if (r.error) { console.error("❌ تعذّرت قراءة المراجع:", r.error.message); process.exit(1); }
}

const referenced = new Set();
const add = v => { if (typeof v === "string" && v.trim()) referenced.add(v.trim()); };
for (const row of passengers.data ?? []) Object.values(row).forEach(add);
for (const row of assets.data ?? []) add(row.asset_url);
for (const row of config.data ?? []) { add(row.logo_url); add(row.banner_image_url); }

const isReferenced = key => {
  const bare = key.replace(/^0\//, "");
  for (const v of referenced) {
    if (v === key || v === bare) return true;
    if (v.endsWith("/" + key) || v.endsWith("/" + bare)) return true;
  }
  return false;
};

/* ── ٢) ما تحت `0/` فعلاً ── */
const { data: listed, error: listErr } = await db.storage.from(BUCKET).list(PREFIX, { limit: 1000 });
if (listErr) { console.error("❌ تعذّر سرد الحاوية:", listErr.message); process.exit(1); }

const candidates = [];
const refused = [];
for (const obj of listed ?? []) {
  const key = `${PREFIX}/${obj.name}`;
  if (!ASSET_NAME.test(obj.name)) { refused.push([key, "تسمية غير معروفة"]); continue; }
  if (isReferenced(key)) { refused.push([key, "**مرجوع في القاعدة**"]); continue; }
  candidates.push(key);
}

console.log(`\nتحت ${PREFIX}/ : ${(listed ?? []).length} كائناً`);
console.log(`يتيم ومؤهَّل للحذف: ${candidates.length}`);
console.log(`مرفوض (لا يُحذف)  : ${refused.length}`);
for (const [k, why] of refused) console.log(`  ✗ ${k} — ${why}`);

if (refused.length > 0) {
  console.error("\n🔴 وُجد كائن لا يثبت يُتمه. لا حذف — راجع القائمة أعلاه أولاً.");
  process.exit(1);
}
if (candidates.length === 0) { console.log("\nلا شيء يُحذف."); process.exit(0); }

/* ── ٣) تأكيد صريح بالعدد ── */
const answer = await ask(`\nاكتب العدد ${candidates.length} للتأكيد (أو أي شيء آخر للإلغاء): `);
if (answer !== String(candidates.length)) { console.log("أُلغي. لم يُحذف شيء."); process.exit(0); }

const { data: removed, error: rmErr } = await db.storage.from(BUCKET).remove(candidates);
if (rmErr) { console.error("❌ فشل الحذف:", rmErr.message); process.exit(1); }

const removedNames = new Set((removed ?? []).map(f => f.name));
const missed = candidates.filter(k => !removedNames.has(k));

const { data: after } = await db.storage.from(BUCKET).list(PREFIX, { limit: 1000 });

console.log(`\n✓ حُذف: ${removedNames.size}`);
if (missed.length) { console.log(`✗ لم يُحذف: ${missed.length}`); missed.forEach(k => console.log(`   ${k}`)); }
console.log(`المتبقّي تحت ${PREFIX}/ : ${(after ?? []).length}`);
process.exit(missed.length === 0 ? 0 : 1);
