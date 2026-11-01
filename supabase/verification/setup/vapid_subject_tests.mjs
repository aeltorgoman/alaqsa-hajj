#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   vapid_subject — اختبارات التحقّق في Customer Backend Setup
   ═══════════════════════════════════════════════════════════════
     node supabase/verification/setup/vapid_subject_tests.mjs
     WEB_PUSH_MODULE=/path/to/node_modules/web-push node …   ← يضيف مطابقةً مع web-push@3.6.7 نفسها

   ١) المقبولُ والمرفوض، ونصُّ الرسالة للبريد المجرّد (mailto:<البريد>).
   ٢) الـCLI كما يستدعيه سيرُ العمل: stdout للقيمة، و`::error::` وخروج ١.
   ٣) سيرُ العمل نفسه: التحقّقُ في أوّل خطوة، قبل كلّ خطوةٍ تُغيّر شيئاً،
      وخطوةُ الأسرار تأخذ القيمةَ المعتمدة لا المُدخلَ الخام.
   ٤) (اختياري) كلُّ ما نقبله تقبله web-push — فلا نُجيز ما يُسقط الدفع.
   ═══════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const script = path.join(root, "supabase", "scripts", "vapid-subject.mjs");
const { validateVapidSubject } = await import(script);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS — ${name}`); }
  else { fail++; console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`); }
};

/* ── ١: المقبول ─────────────────────────────────────────────── */
const accepted = [
  ["mailto:it@customer.com", "mailto:it@customer.com"],
  ["mailto:first.last+push@sub.customer.qa", "mailto:first.last+push@sub.customer.qa"],
  ["MAILTO:IT@Customer.COM", "MAILTO:IT@Customer.COM"],
  ["https://customer.com", "https://customer.com"],
  ["https://hajj.customer.qa/contact", "https://hajj.customer.qa/contact"],
  ["  mailto:it@customer.com \n", "mailto:it@customer.com"],          // surrounding whitespace only
];
for (const [input, want] of accepted) {
  const r = validateVapidSubject(input);
  check(`accepted: ${JSON.stringify(input)}`, r.ok && r.value === want, JSON.stringify(r));
}

/* ── ١: المرفوض ─────────────────────────────────────────────── */
const rejected = [
  ["it@customer.com", /email address without a scheme\. Enter it as mailto:it@customer\.com/],
  ["qtortech@gmail.com", /Enter it as mailto:qtortech@gmail\.com/],
  ["", /required/],
  ["   ", /required/],
  [undefined, /required/],
  ["customer.com", /must start with mailto: or https:\/\//],
  ["http://customer.com", /must start with mailto: or https:\/\/ \(got http:\)/],
  ["https://localhost", /not a public host name/],
  ["https://intranet", /not a public host name/],
  ["https://user:pass@customer.com", /user name or password/],
  ["https:customer.com", /must be written https:\/\/host/],
  ["mailto:", /one valid email address/],
  ["mailto:not-an-email", /one valid email address/],
  ["mailto:a@b.com,c@d.com", /one valid email address/],
  ["mailto:it@customer.com?subject=push", /single address/],
  ["mailto:it @customer.com", /spaces/],
  ["mailto:it@customer.com\nmailto:x@y.com", /spaces, line breaks/],
  ["ftp://customer.com", /must start with mailto: or https:\/\/ \(got ftp:\)/],
  ["mailto:" + "a".repeat(250) + "@x.com", /at most 255/],
];
for (const [input, want] of rejected) {
  const r = validateVapidSubject(input);
  check(`rejected: ${JSON.stringify(input)?.slice(0, 50)}`, !r.ok && want.test(r.error), JSON.stringify(r).slice(0, 160));
}

/* ── ٢: الـCLI كما في سير العمل ─────────────────────────────── */
const cli = (value) => spawnSync(process.execPath, [script], {
  env: { ...process.env, VAPID_SUBJECT_INPUT: value }, encoding: "utf8",
});
let r = cli("mailto:it@customer.com");
check("CLI accepts: exit 0, value on stdout, nothing on stderr", r.status === 0 && r.stdout === "mailto:it@customer.com" && r.stderr === "");
r = cli("it@customer.com");
check("CLI rejects a bare email: exit 1, ::error:: names mailto:it@customer.com, stdout empty",
  r.status === 1 && r.stdout === "" && /^::error::vapid_subject: .*mailto:it@customer\.com/.test(r.stderr));
r = cli("mailto:it@customer.com\nfake=output");
check("CLI rejects a line break (no GITHUB_OUTPUT injection)", r.status === 1 && r.stdout === "");

/* ── ٣: موضعُ التحقّق في سير العمل ──────────────────────────── */
const wf = fs.readFileSync(path.join(root, ".github", "workflows", "customer-backend-setup.yml"), "utf8");
const steps = [...wf.matchAll(/^      - name: "([^"]+)"/gm)].map((m) => ({ name: m[1], at: m.index }));
const body = (name) => {
  const i = steps.findIndex((s) => s.name === name);
  return i < 0 ? "" : wf.slice(steps[i].at, i + 1 < steps.length ? steps[i + 1].at : undefined);
};
const order = (name) => steps.findIndex((s) => s.name === name);
const validate = "Validate First Administrator inputs";
check("the first setup step validates vapid_subject",
  /VAPID_SUBJECT_INPUT: \$\{\{ inputs\.vapid_subject \}\}/.test(body(validate))
  && /vapid_subject="\$\(node supabase\/scripts\/vapid-subject\.mjs\)"/.test(body(validate))
  && /echo "vapid_subject=\$vapid_subject"/.test(body(validate)));
for (const later of ["Verify Supabase Auth settings (read-only)", "Apply repository migrations",
  "Prepare VAPID key pair", "Prepare scheduled push dispatch", "Set required Edge Function secrets",
  "Deploy the seven Edge Functions"]) {
  check(`validation runs before "${later}"`, order(validate) >= 0 && order(later) > order(validate), `${order(validate)} vs ${order(later)}`);
}
check("the secrets step stores the validated value, not the raw input",
  /VAPID_SUBJECT: \$\{\{ steps\.admin\.outputs\.vapid_subject \}\}/.test(body("Set required Edge Function secrets")));
check("the raw input is read nowhere else",
  (wf.match(/inputs\.vapid_subject/g) ?? []).length === 1);

/* ── ٤: مطابقةٌ مع web-push نفسها (اختياري) ─────────────────── */
if (process.env.WEB_PUSH_MODULE) {
  const webpush = createRequire(import.meta.url)(process.env.WEB_PUSH_MODULE);
  const keys = webpush.generateVAPIDKeys();
  const webPushAccepts = (s) => { try { webpush.setVapidDetails(s, keys.publicKey, keys.privateKey); return true; } catch { return false; } };
  for (const [, value] of accepted) {
    check(`web-push accepts what we accept: ${JSON.stringify(value)}`, webPushAccepts(value));
  }
  check("web-push rejects the bare email we reject (the production failure)", !webPushAccepts("it@customer.com"));
} else {
  console.log("SKIP — web-push cross-check (set WEB_PUSH_MODULE to run it)");
}

console.log(`\nResult: ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
