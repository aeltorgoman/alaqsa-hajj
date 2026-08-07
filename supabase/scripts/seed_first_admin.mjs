#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   س١ / PR٢ — إنشاء أول مدير في نظام الهوية الجديد

   Security Architecture v1.2 §٤ · S1 Implementation Design v1.2 §٣.٦

   ينشئ حساباً واحداً في auth.users ويربطه بصفّه في user_profiles.
   لا ترحيل لمستخدمي public.users — قرار معتمد: بياناتهم تجريبية
   ولا تُنقل، ويُبنى النظام الجديد من حساب مدير واحد.

   ── التشغيل ────────────────────────────────────────────────────
     الفحص أولاً — إلزاميّ (S1 Design v1.2 §٧.٥):
       ADMIN_EMAIL=... ADMIN_PASSWORD=... \
       SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
       node supabase/scripts/seed_first_admin.mjs --dry-run

     ثم التنفيذ بعد اعتماد تقرير الفحص:
       … node supabase/scripts/seed_first_admin.mjs

   ⚠️ مفتاح الخدمة يُقرأ من البيئة ولا يُطبع ولا يُكتب في أي ملف.
   ⚠️ لا يُشغَّل تلقائياً ولا ضمن أي بناء.

   Idempotent: إعادة التشغيل تُحدِّث ولا تُكرِّر.
   Self-Healing: يُعيد إنشاء ما نقص ولا يمسّ ما هو سليم.
   ═══════════════════════════════════════════════════════════════ */

import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry-run");

const URL   = process.env.SUPABASE_URL;
const KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const PASS  = process.env.ADMIN_PASSWORD || "";
const NAME  = (process.env.ADMIN_NAME || "المدير العام").trim();

/* كل الصلاحيات الأحد عشر المعرّفة في src/utils/index.ts — أول مدير
   يملكها كاملة، فلا يبقى النظام بلا من يديره */
const ALL_PERMISSIONS = [
  "manage_passengers", "manage_buses", "manage_camps", "manage_hotel",
  "view_reports", "manage_users", "view_archive", "manage_flights",
  "manage_payments", "manage_admins", "manage_portal",
];

const fail = (m) => { console.error(`✗ ${m}`); process.exit(1); };
const log  = (m) => console.log(m);

/* ── حرّاس المدخلات ──────────────────────────────────────────── */
if (!URL || !KEY) fail("SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان في البيئة.");
if (!EMAIL) fail("ADMIN_EMAIL مطلوب — معرّف الدخول.");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) {
  fail(`ADMIN_EMAIL بصيغة غير صحيحة: ${EMAIL}\n  لا يشترط أن يكون بريداً حقيقياً، لكن الصيغة يجب أن تكون صحيحة (admin@company.local مثلاً).`);
}
if (!DRY && !PASS) fail("ADMIN_PASSWORD مطلوب للتنفيذ الفعلي.");
if (PASS && PASS.length < 8) fail("ADMIN_PASSWORD أقصر من ٨ محارف.");

const admin = createClient(URL, KEY, { auth: { persistSession: false } });

/* ── قراءة الحالة الراهنة ────────────────────────────────────── */
const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listErr) fail(`تعذّرت قراءة auth.users: ${listErr.message}`);

const authUsers = listed?.users ?? [];
const existing  = authUsers.find((u) => (u.email || "").toLowerCase() === EMAIL) || null;

const { data: profiles, error: profErr } = await admin
  .from("user_profiles").select("id, email, name, is_active");
if (profErr) fail(`تعذّرت قراءة user_profiles: ${profErr.message}`);

const profileForEmail = (profiles ?? []).find((p) => (p.email || "").toLowerCase() === EMAIL) || null;
const profileForId    = existing ? (profiles ?? []).find((p) => p.id === existing.id) || null : null;

/* ── الخطّة ──────────────────────────────────────────────────── */
const plan = {
  authAccount: existing ? "موجود — يبقى بمعرّفه" : "سيُنشأ",
  profile:     profileForId ? "موجود — سيُحدَّث" : "سيُنشأ",
};

log("═══ الحالة الراهنة ═══");
log(`  حسابات auth.users            : ${authUsers.length}`);
log(`  صفوف user_profiles           : ${(profiles ?? []).length}`);
log(`  حساب بهذا البريد             : ${existing ? `نعم (${existing.id})` : "لا"}`);
log(`  ملفّ مرتبط بالحساب           : ${profileForId ? "نعم" : "لا"}`);

log("\n═══ الخطّة ═══");
log(`  البريد (Login ID)            : ${EMAIL}`);
log(`  الاسم                        : ${NAME}`);
log(`  الصلاحيات                    : ${ALL_PERMISSIONS.length} (كاملة)`);
log(`  حساب المصادقة                : ${plan.authAccount}`);
log(`  ملفّ المستخدم                 : ${plan.profile}`);
log(`  عمليات حذف                   : صفر — لا يحذف هذا السكربت شيئاً إطلاقاً`);

/* تعارض: بريد محجوز في ملفّ يعود لحساب آخر */
if (profileForEmail && (!existing || profileForEmail.id !== existing.id)) {
  fail(`تعارض: البريد ${EMAIL} مسجَّل في user_profiles لحساب آخر (${profileForEmail.id}). لا يُكتب فوقه.`);
}

if (DRY) {
  log("\n✓ فحص فقط — لم تُكتب أي بيانات.");
  process.exit(0);
}

/* ── التنفيذ ─────────────────────────────────────────────────── */
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
if (upErr) fail(`تعذّر حفظ الملفّ: ${upErr.message}`);
log(`✓ الملفّ محفوظ`);

/* ── التحقّق بعد الكتابة ─────────────────────────────────────── */
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

log("\n✓ تمّ. أعد تشغيل --dry-run للتأكّد من أن الخطّة صارت «لا تغيير».");
