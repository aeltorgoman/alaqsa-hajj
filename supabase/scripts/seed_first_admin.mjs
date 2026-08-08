#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   س١ / PR٢ — إنشاء أول مدير في نظام الهوية الجديد

   Security Architecture v1.2 §٤ · S1 Implementation Design v1.2 §٣.٦

   ينشئ حساباً واحداً في auth.users ويربطه بصفّه في user_profiles.
   لا ترحيل لمستخدمي public.users — قرار معتمد: بياناتهم تجريبية
   ولا تُنقل، ويُبنى النظام الجديد من حساب مدير واحد.

   ── التشغيل ────────────────────────────────────────────────────
     node supabase/scripts/seed_first_admin.mjs

     يقرأ ما يجده في البيئة، ويسأل عمّا ينقص عبر stdin. ثم يعرض
     الخطّة ويتوقّف لطلب تأكيد صريح قبل أي كتابة — بوابة الـ Dry Run
     (S1 Design v1.2 §٧.٥) محفوظة داخل نفس التشغيل.

     للفحص وحده بلا أي كتابة ولا سؤال تأكيد:
       node supabase/scripts/seed_first_admin.mjs --dry-run

   ⚠️ مفتاح الخدمة لا يُطبع ولا يُكتب في أي ملف. وكلمة المرور
      ومفتاح الخدمة يُدخَلان مخفيَّين على الطرفية.
   ⚠️ لا يُشغَّل تلقائياً ولا ضمن أي بناء.

   Idempotent: إعادة التشغيل تُحدِّث ولا تُكرِّر.
   Self-Healing: يُعيد إنشاء ما نقص ولا يمسّ ما هو سليم.
   لا يحذف شيئاً إطلاقاً.
   ═══════════════════════════════════════════════════════════════ */

import { createClient } from "@supabase/supabase-js";
import readline from "node:readline";

const DRY = process.argv.includes("--dry-run");

/* كل الصلاحيات الأحد عشر المعرّفة في src/utils/index.ts — أول مدير
   يملكها كاملة، فلا يبقى النظام بلا من يديره */
const ALL_PERMISSIONS = [
  "manage_passengers", "manage_buses", "manage_camps", "manage_hotel",
  "view_reports", "manage_users", "view_archive", "manage_flights",
  "manage_payments", "manage_admins", "manage_portal",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };
const log  = (m) => console.log(m);

// ── الإدخال التفاعلي ──────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const isTTY = Boolean(process.stdin.isTTY);

const ask = (q) => new Promise((res) => rl.question(q, (v) => res(v.trim())));

/* الإدخال المخفيّ: نبتلع ما تكتبه الطرفية أثناء السؤال فلا يظهر
   المحرف ولا يبقى في المخرجات. خارج الطرفية لا إخفاء ممكن. */
function askHidden(q) {
  if (!isTTY) return ask(q);
  return new Promise((res) => {
    const original = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s) => original(s.includes(q) ? q : "");
    rl.question(q, (v) => {
      rl._writeToOutput = original;
      process.stdout.write("\n");
      res(v.trim());
    });
  });
}

/* القيمة من البيئة إن وُجدت، وإلا تُطلب. لا شيء يُخزَّن في ملف. */
async function need(envKey, prompt, { hidden = false, fallback = "" } = {}) {
  const fromEnv = (process.env[envKey] ?? "").trim();
  if (fromEnv) { log(`  ${envKey.padEnd(26)}: من البيئة`); return fromEnv; }
  /* السؤال يحتاج طرفية. خارجها نفشل بوضوح بدل أن نتعلّق منتظرين
     إدخالاً لن يأتي — والبديل تمريرها في البيئة. */
  if (!isTTY) {
    if (fallback) return fallback;
    fail(`${envKey} مفقود، ولا طرفية للسؤال عنه.\n  شغّل السكربت في طرفية تفاعلية، أو مرّر ${envKey} في البيئة.`);
  }
  const v = hidden ? await askHidden(prompt) : await ask(prompt);
  return v || fallback;
}

log("═══ المدخلات ═══");
const URL   = await need("SUPABASE_URL", "رابط المشروع (SUPABASE_URL): ");
const KEY   = await need("SUPABASE_SERVICE_ROLE_KEY", "مفتاح الخدمة (لن يظهر أثناء الكتابة): ", { hidden: true });
const EMAIL = (await need("ADMIN_EMAIL", "معرّف الدخول (بريد · مثل admin@company.local): ")).toLowerCase();
const NAME  = await need("ADMIN_NAME", "الاسم المعروض [المدير العام]: ", { fallback: "المدير العام" });
const PASS  = DRY ? "" : await need("ADMIN_PASSWORD", "كلمة المرور (٨ محارف فأكثر · لن تظهر): ", { hidden: true });

// ── حرّاس المدخلات ──────────────────────────────────────────
if (!URL) fail("رابط المشروع مطلوب.");
if (!KEY) fail("مفتاح الخدمة مطلوب.");
if (!EMAIL_RE.test(EMAIL)) {
  fail(`معرّف الدخول بصيغة غير صحيحة: ${EMAIL}\n  لا يشترط أن يكون بريداً حقيقياً، لكن الصيغة يجب أن تكون صحيحة.`);
}
if (!DRY && PASS.length < 8) fail("كلمة المرور أقصر من ٨ محارف.");

const admin = createClient(URL, KEY, { auth: { persistSession: false } });

// ── قراءة الحالة الراهنة ────────────────────────────────────
const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listErr) fail(`تعذّرت قراءة auth.users: ${listErr.message}`);

const authUsers = listed?.users ?? [];
const existing  = authUsers.find((u) => (u.email || "").toLowerCase() === EMAIL) || null;

const { data: profiles, error: profErr } = await admin
  .from("user_profiles").select("id, email, name, is_active");
if (profErr) fail(`تعذّرت قراءة user_profiles: ${profErr.message}`);

const profileForEmail = (profiles ?? []).find((p) => (p.email || "").toLowerCase() === EMAIL) || null;
const profileForId    = existing ? (profiles ?? []).find((p) => p.id === existing.id) || null : null;

// ── الخطّة ──────────────────────────────────────────────────
log("\n═══ الحالة الراهنة ═══");
log(`  حسابات auth.users            : ${authUsers.length}`);
log(`  صفوف user_profiles           : ${(profiles ?? []).length}`);
log(`  حساب بهذا البريد             : ${existing ? `نعم (${existing.id})` : "لا"}`);
log(`  ملفّ مرتبط بالحساب           : ${profileForId ? "نعم" : "لا"}`);

log("\n═══ الخطّة ═══");
log(`  البريد (Login ID)            : ${EMAIL}`);
log(`  الاسم                        : ${NAME}`);
log(`  الصلاحيات                    : ${ALL_PERMISSIONS.length} (كاملة)`);
log(`  حساب المصادقة                : ${existing ? "موجود — يبقى بمعرّفه" : "سيُنشأ"}`);
log(`  ملفّ المستخدم                 : ${profileForId ? "موجود — سيُحدَّث" : "سيُنشأ"}`);
log(`  عمليات حذف                   : صفر — لا يحذف هذا السكربت شيئاً إطلاقاً`);

/* تعارض: بريد محجوز في ملفّ يعود لحساب آخر */
if (profileForEmail && (!existing || profileForEmail.id !== existing.id)) {
  fail(`تعارض: البريد ${EMAIL} مسجَّل في user_profiles لحساب آخر (${profileForEmail.id}). لا يُكتب فوقه.`);
}

if (DRY) {
  log("\n✓ فحص فقط — لم تُكتب أي بيانات.");
  rl.close();
  process.exit(0);
}

/* بوابة الاعتماد — §٧.٥. لا كتابة قبل تأكيد صريح. */
const confirm = await ask('\nاكتب "نعم" للتنفيذ، أو أي شيء آخر للإلغاء: ');
if (confirm !== "نعم") {
  log("أُلغي. لم تُكتب أي بيانات.");
  rl.close();
  process.exit(0);
}

// ── التنفيذ ─────────────────────────────────────────────────
let userId = existing?.id ?? null;

if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASS,
    email_confirm: true,   // لا رسائل تأكيد — البريد Login ID لا قناة اتصال
  });
  if (error) fail(`تعذّر إنشاء الحساب: ${error.message}`);
  userId = data.user.id;
  log(`\n✓ أُنشئ حساب المصادقة: ${userId}`);
} else {
  log(`\n• حساب المصادقة موجود: ${userId} — لم يُمسّ`);
}

const permissions = Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, true]));

const { error: upErr } = await admin.from("user_profiles").upsert(
  { id: userId, email: EMAIL, name: NAME, permissions, is_active: true, updated_at: new Date().toISOString() },
  { onConflict: "id" },
);
if (upErr) fail(`تعذّر حفظ الملفّ: ${upErr.message}\n  الحساب أُنشئ. أعد تشغيل السكربت — سيُكمل الملفّ وحده (Self-Healing).`);
log(`✓ الملفّ محفوظ`);

// ── التحقّق بعد الكتابة ─────────────────────────────────────
const { data: check, error: chkErr } = await admin
  .from("user_profiles").select("id, email, name, is_active, permissions").eq("id", userId).single();
if (chkErr || !check) fail(`تعذّر التحقّق: ${chkErr?.message}`);

const granted = Object.entries(check.permissions || {}).filter(([, v]) => v === true).length;
log("\n═══ التحقّق ═══");
log(`  id           : ${check.id}`);
log(`  email        : ${check.email}`);
log(`  name         : ${check.name}`);
log(`  is_active    : ${check.is_active}`);
log(`  permissions  : ${granted} / ${ALL_PERMISSIONS.length}`);

if (check.email !== EMAIL || check.is_active !== true || granted !== ALL_PERMISSIONS.length) {
  fail("التحقّق فشل: الصفّ المحفوظ لا يطابق المتوقّع.");
}

/* إثبات الـ Idempotency داخل نفس التشغيل: إعادة قراءة الحالة
   وعرض ما ستكون عليه خطّة تشغيل تالٍ — وهو ما يقابل Dry Run ثانياً */
const { data: after } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const { data: afterProfiles } = await admin.from("user_profiles").select("id");
log("\n═══ الحالة بعد التنفيذ (تقابل Dry Run ثانياً) ═══");
log(`  حسابات auth.users            : ${(after?.users ?? []).length}`);
log(`  صفوف user_profiles           : ${(afterProfiles ?? []).length}`);
log(`  تشغيل تالٍ سيُنتج             : حساب المصادقة موجود — يبقى بمعرّفه · الملفّ يُحدَّث`);

log("\n✓ تمّ. ادخل على التطبيق بهذا البريد وكلمة المرور.");
rl.close();
