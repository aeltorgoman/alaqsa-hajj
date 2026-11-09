#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Customer Function Update — release-side checks for ONE Edge Function.

   Used by .github/workflows/customer-function-update.yml. Plain Node,
   no dependencies, no network, no secrets: it reads files only.

   What the workflow asks of it:
     files <slug>
         The bundle `supabase functions deploy <slug>` uploads: every repo
         file reachable from supabase/functions/<slug>/index.ts through
         relative imports (`from "./x.ts"`, `from "../_shared/y.ts"`,
         `from "../other-fn/z.ts"`). One path per line, sorted.
     verify-release <slug>
         Every bundle file is listed in release-manifest.json and its sha256
         matches. This is the approval pin: release-manifest.json is generated
         with the reviewed release and records the hash of every shipped file.
     verify-jwt <slug>
         Prints `true` or `false` from supabase/config.toml
         ([functions.<slug>] verify_jwt = …). Fails when it is not declared.
     required-env <slug> <secret-names.txt>
         Every Deno.env.get("NAME") in the bundle, classified with the
         release's .env.example groups (REQUIRED / optional / injected by the
         platform). Fails when a REQUIRED name is missing from the secret-name
         list, or when a name is in no group at all. Names only, never values.
     compare <slug> <deployed-dir>
         Byte-for-byte parity between the repo bundle and what
         `supabase functions download <slug>` wrote under <deployed-dir>
         (missing, extra and modified files are named).
     check-target <project-ref>
         Fails for a project ref that must never receive a customer update
         (the vendor's own projects), compared by sha256 so no vendor
         identifier ships in a customer release.
     --selftest

   Exit status: 0 = pass, 1 = check failed, 2 = usage error.
   ═══════════════════════════════════════════════════════════════ */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FUNCTIONS = "supabase/functions";

/* sha256 of project refs that are never a customer installation. */
const DENIED_TARGET_SHA256 = new Set([
  "0ce57ffdf9474f9a2f85bc8733ed02947a391a11a1c3824d7e9eed84de9bf47a",
  "9f9a98d9987573727443a8dd305c1fd3b8d2f48f708c621a65d338dd02f5ffac",
]);

const IMPORT_RE = /from\s+["'](\.\.?\/[^"']+\.ts)["']/g;
const ENV_RE = /Deno\.env\.get\(\s*["']([A-Z0-9_]+)["']\s*\)/g;
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

class CheckFailed extends Error {}
const fail = (msg) => { throw new CheckFailed(msg); };
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const rel = (root, abs) => path.relative(root, abs).split(path.sep).join("/");

function assertSlug(slug) {
  if (!SLUG_RE.test(slug ?? "")) fail(`invalid function slug: ${JSON.stringify(slug)}`);
}

export function bundleFiles(root, slug) {
  assertSlug(slug);
  const fnRoot = path.resolve(root, FUNCTIONS);
  const entry = path.join(fnRoot, slug, "index.ts");
  if (!fs.existsSync(entry)) fail(`entry point missing: ${FUNCTIONS}/${slug}/index.ts`);
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = path.resolve(stack.pop());
    if (seen.has(f)) continue;
    if (!f.startsWith(fnRoot + path.sep)) fail(`${slug} imports outside ${FUNCTIONS}: ${rel(root, f)}`);
    if (!fs.existsSync(f)) fail(`${slug} imports a missing file: ${rel(root, f)}`);
    seen.add(f);
    for (const m of fs.readFileSync(f, "utf8").matchAll(IMPORT_RE)) stack.push(path.join(path.dirname(f), m[1]));
  }
  return [...seen].map((f) => rel(root, f)).sort();
}

export function verifyRelease(root, slug) {
  const mPath = path.join(root, "release-manifest.json");
  if (!fs.existsSync(mPath)) fail("release-manifest.json is missing: this is not a customer release snapshot");
  const manifest = JSON.parse(fs.readFileSync(mPath, "utf8"));
  if (!manifest.files || typeof manifest.files !== "object") fail("release-manifest.json has no file list");
  const problems = [];
  const rows = [];
  for (const f of bundleFiles(root, slug)) {
    const want = manifest.files[f];
    const got = sha256(fs.readFileSync(path.join(root, f)));
    if (!want) problems.push(`not in release-manifest.json: ${f}`);
    else if (want !== got) problems.push(`sha256 differs from release-manifest.json: ${f}`);
    rows.push(`${got}  ${f}`);
  }
  if (problems.length) fail(problems.join("\n"));
  return { version: manifest.releaseVersion ?? null, rows };
}

export function verifyJwt(root, slug) {
  assertSlug(slug);
  const lines = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8").split(/\r?\n/);
  let inSection = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (/^\[.*\]$/.test(line)) { inSection = line === `[functions.${slug}]`; continue; }
    const m = inSection && line.match(/^verify_jwt\s*=\s*(true|false)$/);
    if (m) return m[1] === "true";
  }
  fail(`supabase/config.toml declares no verify_jwt for [functions.${slug}]`);
}

/* The .env.example groups: "REQUIRED" and "optional" headings list names to
   set; the "Injected by the Supabase platform" heading lists commented names. */
export function envGroups(root) {
  const groups = { required: new Set(), optional: new Set(), platform: new Set() };
  let current = null;
  for (const raw of fs.readFileSync(path.join(root, ".env.example"), "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#\s*──/.test(line)) {
      current = /Injected by the Supabase platform/i.test(line) ? "platform"
        : /Edge Functions\s*—\s*REQUIRED/i.test(line) ? "required"
        : /Edge Functions\s*—\s*optional/i.test(line) ? "optional"
        : null;
      continue;
    }
    if (!current) continue;
    const m = current === "platform" ? line.match(/^#\s*([A-Z0-9_]+)\s*$/) : line.match(/^([A-Z0-9_]+)=\s*$/);
    if (m) groups[current].add(m[1]);
  }
  if (!groups.required.size || !groups.platform.size) fail(".env.example has no REQUIRED or platform group");
  return groups;
}

export function requiredEnv(root, slug, secretNames) {
  const groups = envGroups(root);
  const used = new Set();
  for (const f of bundleFiles(root, slug)) {
    for (const m of fs.readFileSync(path.join(root, f), "utf8").matchAll(ENV_RE)) used.add(m[1]);
  }
  const have = new Set(secretNames);
  const report = [];
  const problems = [];
  for (const name of [...used].sort()) {
    if (groups.platform.has(name)) { report.push(`platform  ${name}`); continue; }
    if (groups.required.has(name)) {
      if (have.has(name)) report.push(`required  ${name}  present`);
      else problems.push(`required secret is not set on the project: ${name}`);
      continue;
    }
    if (groups.optional.has(name)) { report.push(`optional  ${name}  ${have.has(name) ? "present" : "not set (feature unavailable)"}`); continue; }
    problems.push(`unclassified configuration name (not in .env.example): ${name}`);
  }
  if (problems.length) fail(problems.join("\n"));
  return report;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

/* `functions download` writes `<deployed-dir>/<slug>/…` and `<deployed-dir>/_shared/…`
   (paths relative to supabase/functions). */
export function compareDeployed(root, slug, deployedDir) {
  if (!fs.existsSync(deployedDir) || !walk(deployedDir).length) fail(`no deployed files under ${deployedDir}`);
  const want = new Map(bundleFiles(root, slug).map((f) => [f.slice(FUNCTIONS.length + 1), path.join(root, f)]));
  const have = new Map(walk(deployedDir).map((f) => [rel(deployedDir, f), f]));
  const problems = [];
  for (const [p, f] of want) {
    if (!have.has(p)) problems.push(`missing   ${p}`);
    else if (sha256(fs.readFileSync(f)) !== sha256(fs.readFileSync(have.get(p)))) problems.push(`modified  ${p}`);
  }
  for (const p of have.keys()) if (!want.has(p)) problems.push(`extra     ${p}`);
  if (problems.length) fail(problems.join("\n"));
  return [...want.keys()].sort();
}

export function checkTarget(ref) {
  if (!/^[a-z]{20}$/.test(ref ?? "")) fail("project ref must be 20 lowercase letters");
  if (DENIED_TARGET_SHA256.has(sha256(ref))) fail("this project ref is not a customer installation: refused");
  return true;
}

function selftest() {
  let failures = 0;
  const check = (name, cond) => { console.log(`${cond ? "  ok  " : "  FAIL"} ${name}`); if (!cond) failures++; };
  const throws = (fn) => { try { fn(); return false; } catch (e) { return e instanceof CheckFailed; } };
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "function-bundle-"));
  const w = (p, s) => { fs.mkdirSync(path.dirname(path.join(t, p)), { recursive: true }); fs.writeFileSync(path.join(t, p), s); };
  w(`${FUNCTIONS}/fn-a/index.ts`, 'import { x } from "./local.ts";\nimport { h } from "../_shared/http.ts";\nimport { b } from "../fn-b/lib.ts";\nconst k = Deno.env.get("NEED_ME"); Deno.env.get("SUPABASE_URL"); Deno.env.get("NICE_TO_HAVE");\n');
  w(`${FUNCTIONS}/fn-a/local.ts`, "export const x = 1;\n");
  w(`${FUNCTIONS}/fn-b/lib.ts`, "export const b = 1;\n");
  w(`${FUNCTIONS}/fn-b/index.ts`, "unused by fn-a\n");
  w(`${FUNCTIONS}/_shared/http.ts`, "export const h = 1;\n");
  w(`${FUNCTIONS}/_shared/unused.ts`, "export const u = 1;\n");
  w("supabase/config.toml", '[functions.fn-a]\nverify_jwt = true\n\n[functions.fn-b]\nverify_jwt = false # comment\n');
  w(".env.example", "# ── Edge Functions — REQUIRED, per customer\nNEED_ME=\n\n# ── Edge Functions — optional features\nNICE_TO_HAVE=\n\n# ── Injected by the Supabase platform at function runtime — do not set\n# SUPABASE_URL\n");
  const A = [`${FUNCTIONS}/_shared/http.ts`, `${FUNCTIONS}/fn-a/index.ts`, `${FUNCTIONS}/fn-a/local.ts`, `${FUNCTIONS}/fn-b/lib.ts`];
  const manifest = () => ({ releaseVersion: "9.9.9", files: Object.fromEntries(A.map((f) => [f, sha256(fs.readFileSync(path.join(t, f)))])) });
  w("release-manifest.json", JSON.stringify(manifest()));

  check("bundle = index + local + cross-function import + imported _shared only", JSON.stringify(bundleFiles(t, "fn-a")) === JSON.stringify(A));
  check("invalid slug refused", throws(() => bundleFiles(t, "../x")) && throws(() => bundleFiles(t, "")));
  check("missing entry point refused", throws(() => bundleFiles(t, "nope")));
  w(`${FUNCTIONS}/fn-c/index.ts`, 'import { y } from "./gone.ts";\n');
  check("missing import refused", throws(() => bundleFiles(t, "fn-c")));
  w(`${FUNCTIONS}/fn-c/index.ts`, 'import { y } from "../../config.toml.ts";\n');
  check("import outside supabase/functions refused", throws(() => bundleFiles(t, "fn-c")));

  check("release pin: matching hashes pass and report the version", verifyRelease(t, "fn-a").version === "9.9.9");
  w(`${FUNCTIONS}/fn-a/local.ts`, "export const x = 2;\n");
  check("release pin: a modified bundle file fails", throws(() => verifyRelease(t, "fn-a")));
  w(`${FUNCTIONS}/fn-a/local.ts`, "export const x = 1;\n");
  const m = manifest(); delete m.files[`${FUNCTIONS}/_shared/http.ts`]; w("release-manifest.json", JSON.stringify(m));
  check("release pin: a bundle file absent from the manifest fails", throws(() => verifyRelease(t, "fn-a")));
  w("release-manifest.json", JSON.stringify(manifest()));

  check("verify_jwt read per function (true / false with comment)", verifyJwt(t, "fn-a") === true && verifyJwt(t, "fn-b") === false);
  check("undeclared verify_jwt fails", throws(() => verifyJwt(t, "fn-c")));

  const r = requiredEnv(t, "fn-a", ["NEED_ME"]);
  check("env: required present passes; optional absent reported; platform skipped",
    r.includes("required  NEED_ME  present") && r.some((l) => l.startsWith("optional  NICE_TO_HAVE  not set")) && r.includes("platform  SUPABASE_URL"));
  check("env: required secret missing fails", throws(() => requiredEnv(t, "fn-a", [])));
  w(`${FUNCTIONS}/fn-a/local.ts`, 'export const x = Deno.env.get("SURPRISE");\n');
  check("env: unclassified name fails", throws(() => requiredEnv(t, "fn-a", ["NEED_ME"])));
  w(`${FUNCTIONS}/fn-a/local.ts`, "export const x = 1;\n");

  const d = path.join(t, "deployed");
  const copy = () => { fs.rmSync(d, { recursive: true, force: true }); for (const f of A) { const o = path.join(d, f.slice(FUNCTIONS.length + 1)); fs.mkdirSync(path.dirname(o), { recursive: true }); fs.copyFileSync(path.join(t, f), o); } };
  copy();
  check("parity: identical deployed bundle passes", compareDeployed(t, "fn-a", d).length === 4);
  fs.writeFileSync(path.join(d, "_shared/http.ts"), "old\n");
  check("parity: modified deployed file fails", throws(() => compareDeployed(t, "fn-a", d)));
  copy(); fs.rmSync(path.join(d, "fn-a/local.ts"));
  check("parity: missing deployed file fails", throws(() => compareDeployed(t, "fn-a", d)));
  copy(); fs.writeFileSync(path.join(d, "_shared/unused.ts"), "x\n");
  check("parity: extra deployed file fails", throws(() => compareDeployed(t, "fn-a", d)));
  check("parity: empty download fails", throws(() => compareDeployed(t, "fn-a", path.join(t, "empty"))));

  check("target: a well-formed customer ref passes", checkTarget("abcdefghijklmnopqrst") === true);
  check("target: malformed ref refused", throws(() => checkTarget("ABC")) && throws(() => checkTarget("")));
  check("target: denied refs refused (by hash)", [...DENIED_TARGET_SHA256].length === 2
    && [...DENIED_TARGET_SHA256].every((h) => /^[0-9a-f]{64}$/.test(h)));

  fs.rmSync(t, { recursive: true, force: true });
  console.log(failures ? `selftest FAILED (${failures})` : "selftest PASSED");
  return failures ? 1 : 0;
}

function main(argv) {
  const [cmd, a, b] = argv;
  switch (cmd) {
    case "--selftest": return selftest();
    case "files": console.log(bundleFiles(ROOT, a).join("\n")); return 0;
    case "verify-release": { const r = verifyRelease(ROOT, a); console.log(`release ${r.version}`); console.log(r.rows.join("\n")); return 0; }
    case "verify-jwt": console.log(String(verifyJwt(ROOT, a))); return 0;
    case "required-env": {
      if (!b) fail("usage: required-env <slug> <secret-names.txt>");
      const names = fs.readFileSync(b, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      console.log(requiredEnv(ROOT, a, names).join("\n")); return 0;
    }
    case "compare": { if (!b) fail("usage: compare <slug> <deployed-dir>"); console.log(compareDeployed(ROOT, a, b).map((p) => `identical ${p}`).join("\n")); return 0; }
    case "check-target": checkTarget(a); console.log("target allowed"); return 0;
    default:
      console.error("usage: function-bundle.mjs files|verify-release|verify-jwt|required-env|compare|check-target … | --selftest");
      return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) {
    if (e instanceof CheckFailed) { for (const l of e.message.split("\n")) console.error(`::error::${l}`); process.exitCode = 1; }
    else throw e;
  }
}
