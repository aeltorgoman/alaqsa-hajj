#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   حارسُ هدف `seed_first_admin.mjs` — أيُّ مشروعٍ سيُكتب فيه؟

   مفتاحُ الخدمة يكتب في المشروع الذي يدلّ عليه `SUPABASE_URL`، ومتغيّرُ
   بيئةٍ منسيٌّ يكفي لتوجيه الأداة إلى غير ما قُصد. فلا كتابةَ إلا إذا:
     · كان `SUPABASE_URL` رابطَ مشروعٍ صريحاً: https://<ref>.supabase.co
     · وطابق مرجعُه `EXPECTED_PROJECT_REF` المُعطى صراحةً؛
     · ولم يكن أيٌّ منهما مشروعَ الإنتاج.
   أو `EXPECTED_PROJECT_REF=local` لمكدّسٍ محليّ: رابطُ حلقةٍ راجعة وحده.

   الإنتاجُ مرفوضٌ بلا استثناء. وطريقُ الطوارئ فيه لوحةُ Supabase
   (إعادةُ ضبط كلمة المرور من Auth) — docs/architecture/BREAK_GLASS.md.

   فحصٌ ذاتيّ بلا شبكة:
     node supabase/scripts/seed-target.mjs --selftest
   ═══════════════════════════════════════════════════════════════ */

import { fileURLToPath } from "node:url";
import path from "node:path";

export const PRODUCTION_REF = "zkucwcnclbfvukhdqhgc";
const REF_RE = /^[a-z]{20}$/;
const URL_RE = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/;
/* `local` — مكدّسُ تمرينٍ محليّ على الحلقة الراجعة وحدها (نمطُ
   assert-demo-target.sh نفسُه). لا يطابق مشروعاً مستضافاً، ولا يقبله مشروعٌ مستضاف. */
const LOCAL_REF = "local";
const LOCAL_URL_RE = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):[0-9]{2,5}\/?$/;

/* يُعيد المرجعَ المتحقَّق منه، أو يرمي بسبب الرفض. لا شبكة. */
export function checkTarget(url, expectedRef) {
  const expected = String(expectedRef ?? "").trim();
  const u = String(url ?? "").trim();
  if (expected === LOCAL_REF) {
    if (!LOCAL_URL_RE.test(u)) {
      throw new Error("EXPECTED_PROJECT_REF=local يقبل رابطَ حلقةٍ راجعة وحده: http://127.0.0.1:<port> أو http://localhost:<port>");
    }
    return LOCAL_REF;
  }
  if (!REF_RE.test(expected)) {
    throw new Error("EXPECTED_PROJECT_REF مفقودٌ أو بصيغةٍ غير صحيحة (٢٠ حرفاً لاتينياً صغيراً).");
  }
  if (expected === PRODUCTION_REF) {
    throw new Error(`EXPECTED_PROJECT_REF هو مشروعُ الإنتاج (${PRODUCTION_REF}) — هذه الأداةُ لا تكتب فيه.`);
  }
  const m = URL_RE.exec(u);
  if (!m) {
    throw new Error("SUPABASE_URL ليس رابطَ مشروعٍ صريحاً بالصيغة https://<ref>.supabase.co");
  }
  const ref = m[1];
  if (ref === PRODUCTION_REF) {
    throw new Error(`SUPABASE_URL يشير إلى مشروع الإنتاج (${PRODUCTION_REF}) — هذه الأداةُ لا تكتب فيه.`);
  }
  if (ref !== expected) {
    throw new Error(`SUPABASE_URL يشير إلى ${ref}، والمتوقَّع ${expected}. لا كتابة.`);
  }
  return ref;
}

function selftest() {
  const LT = "vgqowazlzzcovcrigcjz";
  const cases = [
    ["Load Test, matching",            `https://${LT}.supabase.co`,  LT, true],
    ["Load Test, trailing slash",      `https://${LT}.supabase.co/`, LT, true],
    ["Production URL",                 `https://${PRODUCTION_REF}.supabase.co`, LT, false],
    ["Production expected and URL",    `https://${PRODUCTION_REF}.supabase.co`, PRODUCTION_REF, false],
    ["Production expected only",       `https://${LT}.supabase.co`, PRODUCTION_REF, false],
    ["mismatched ref",                 "https://abcdefghijabcdefghij.supabase.co", LT, false],
    ["expected ref missing",           `https://${LT}.supabase.co`, "", false],
    ["expected ref malformed",         `https://${LT}.supabase.co`, "VGQOWAZLZZCOVCRIGCJZ", false],
    ["http, not https",                `http://${LT}.supabase.co`, LT, false],
    ["path after the host",            `https://${LT}.supabase.co/rest/v1`, LT, false],
    ["look-alike host",                `https://${LT}.supabase.co.evil.example`, LT, false],
    ["custom domain",                  "https://api.example.com", LT, false],
    ["local stack, hosted expected ref", "http://127.0.0.1:54321", LT, false],
    ["empty URL",                      "", LT, false],
    ["local: 127.0.0.1",               "http://127.0.0.1:54321", "local", true],
    ["local: localhost",               "http://localhost:54321/", "local", true],
    ["local: [::1]",                   "http://[::1]:54321", "local", true],
    ["local: Production URL",          `https://${PRODUCTION_REF}.supabase.co`, "local", false],
    ["local: hosted URL",              `https://${LT}.supabase.co`, "local", false],
    ["local: non-loopback host",       "http://10.0.0.5:54321", "local", false],
    ["local: look-alike host",         "http://127.0.0.1.evil.example:54321", "local", false],
    ["local: no port",                 "http://127.0.0.1", "local", false],
    ["local: https loopback",          "https://127.0.0.1:54321", "local", false],
    ["local: path after the host",     "http://127.0.0.1:54321/rest/v1", "local", false],
    ["LOCAL in capitals",              "http://127.0.0.1:54321", "LOCAL", false],
  ];
  let bad = 0;
  for (const [name, url, exp, ok] of cases) {
    let got;
    try { checkTarget(url, exp); got = true; } catch { got = false; }
    const pass = got === ok;
    if (!pass) bad++;
    console.log(`  ${pass ? "ok  " : "FAIL"} ${name} (expected ${ok ? "PASS" : "REFUSE"})`);
  }
  if (bad) { console.error(`selftest FAILED: ${bad}`); process.exit(1); }
  console.log("selftest PASSED");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  else { console.error("usage: node supabase/scripts/seed-target.mjs --selftest"); process.exit(2); }
}
