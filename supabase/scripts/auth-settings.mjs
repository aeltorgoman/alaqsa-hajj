#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   فحص إعدادات Supabase Auth للمشروع — قراءة فقط.

   لماذا قراءة فقط: تعديل الإعدادات عبر Management API
   (`PATCH /v1/projects/{ref}/config/auth`) يتطلّب صلاحية
   `project_admin_write` مع `auth_config_write`، وهي تسمح بحذف
   المشروع وإيقافه. لا نخزّن صلاحيةً كهذه في GitHub. فالمشغّل يضبط
   الإعدادات الثلاثة من لوحة Supabase، ويتحقّق سير العمل منها بـ
   `GET /config/auth` (صلاحية `auth_config_read` وحدها) قبل أيّ تغيير،
   ثم مرّةً أخرى في التحقّق الأخير.

   المطلوب:
     · disable_signup                   = true   (المستخدمون يُنشئهم المدير فقط)
     · external_anonymous_users_enabled = false
     · site_url                         = أول عنوان Production بعد التطبيع

   Fail closed: يُذكر كل إعدادٍ خاطئ باسمه ومكان إصلاحه، ولا يُطبع من
   الإعدادات غير هذه الثلاثة — فبقيّتها قد تحوي أسراراً (SMTP، مزوّدون).

   CLI:
     node supabase/scripts/auth-settings.mjs check <response.json> <http-code> <site-url>
       الاستجابة كما جاءت من `GET /config/auth` ورمز HTTP الخاص بها؛
       عند الفشل تُنقل رسالة Supabase نفسها، لا تفسيرٌ مفترض.
   ═══════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The Dashboard may keep a trailing slash or upper-case host; the origin is what matters.
const sameOrigin = (a, b) => {
  const norm = (v) => String(v ?? "").trim().replace(/\/$/, "").toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
};

export function checkAuthSettings(config, siteUrl) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("the Auth configuration returned by Supabase is not a JSON object");
  }
  const problems = [];
  if (config.disable_signup !== true) {
    problems.push(
      `Public sign-up is ON (disable_signup = ${JSON.stringify(config.disable_signup ?? null)}). ` +
      "Fix: Supabase Dashboard → Authentication → Sign In / Providers → " +
      "Allow new users to sign up → Off → Save changes.",
    );
  }
  if (config.external_anonymous_users_enabled !== false) {
    problems.push(
      `Anonymous sign-in is ON (external_anonymous_users_enabled = ${JSON.stringify(config.external_anonymous_users_enabled ?? null)}). ` +
      "Fix: Supabase Dashboard → Authentication → Sign In / Providers → " +
      "Allow anonymous sign-ins → Off → Save changes.",
    );
  }
  if (!sameOrigin(config.site_url, siteUrl)) {
    problems.push(
      `Site URL is ${JSON.stringify(config.site_url ?? "")}, expected ${JSON.stringify(siteUrl)}. ` +
      `Fix: Supabase Dashboard → Authentication → URL Configuration → Site URL → ${siteUrl} → Save.`,
    );
  }
  return problems;
}

// Supabase's own words for a failed request: its message, else a short excerpt of the body.
// Error bodies carry no credentials; the token is only ever sent, never echoed.
export function apiErrorMessage(body) {
  let msg = "";
  try {
    const j = JSON.parse(body);
    const m = j?.message ?? j?.error ?? j?.msg;
    if (m !== undefined && m !== null) msg = typeof m === "string" ? m : JSON.stringify(m);
  } catch { /* not JSON */ }
  if (!msg) msg = String(body ?? "").slice(0, 500);
  return msg.replace(/\s+/g, " ").trim() || "(empty response)";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, responseFile, httpCode, siteUrl] = process.argv.slice(2);
  try {
    if (mode !== "check" || !responseFile || !httpCode || !siteUrl) {
      throw new Error("usage: auth-settings.mjs check <response.json> <http-code> <site-url>");
    }
    const body = fs.readFileSync(responseFile, "utf8");
    if (httpCode !== "200") {
      const lines = [
        `Reading the Supabase Auth settings (GET /v1/projects/{ref}/config/auth) returned HTTP ${httpCode}. ` +
        `Supabase said: ${apiErrorMessage(body)}`,
      ];
      if (["401", "403", "404"].includes(httpCode)) {
        lines.push(
          "This request needs only SUPABASE_ACCESS_TOKEN with Auth Config — Read on the project named by " +
          "SUPABASE_PROJECT_REF. Check both GitHub secrets against the message above.",
        );
      }
      for (const l of lines) process.stderr.write(`::error::${l}\n`);
      process.exit(1);
    }
    let config;
    try {
      config = JSON.parse(body);
    } catch {
      throw new Error("the Auth configuration returned by Supabase is not valid JSON");
    }
    const problems = checkAuthSettings(config, siteUrl);
    if (problems.length) {
      for (const p of problems) process.stderr.write(`::error::${p}\n`);
      process.stderr.write(
        `::error::${problems.length} Supabase Auth setting(s) must be corrected in the Supabase Dashboard.\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`Supabase Auth: public sign-up off, anonymous sign-in off, Site URL ${siteUrl}.\n`);
  } catch (e) {
    process.stderr.write(`::error::${e.message}\n`);
    process.exit(1);
  }
}
