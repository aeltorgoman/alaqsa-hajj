#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Edge Function deployment preflight — fail closed on missing
   per-environment configuration.

   ── The problem it solves ───────────────────────────────────────
   `ALLOWED_ORIGINS`, `VERCEL_PROJECT_SLUG`, `VERCEL_OWNER_SLUG` and
   `VAPID_SUBJECT` no longer carry vendor fallbacks, so they are
   required in every environment. A correct code change must not
   depend on an operator remembering that. This runs as a GATE in the
   existing per-function redeploy workflows, BEFORE
   `supabase functions deploy`, and refuses the deployment when the
   target project does not already hold the configuration the
   function's own source reads.

   ── What it checks, and what it cannot ──────────────────────────
   It reads **names only** via `supabase secrets list` — the same
   names-only pattern already reviewed in
   `.github/workflows/whatsapp-credential-free-verification.yml`.
   Secret VALUES are never read, printed or compared: the Management
   API does not expose them, and this script must not want them.

   So the guarantee is exact and limited: *a required name is
   configured on the target project*. It cannot confirm that a value
   is correct, current, or points at the right customer domain — that
   remains a human check in the handover manual §13 checklist. It
   does not pretend otherwise, and it never passes on an
   unverifiable result: if the inventory cannot be read, the gate
   FAILS rather than assuming.

   ── Scope boundary ──────────────────────────────────────────────
   This is **environment deployment readiness**, which is a different
   question from **Customer Release generation**. Snapshot generation
   and validation never run this and never need a real secret value;
   a release is generated and validated with no environment at all.

   ── Usage ───────────────────────────────────────────────────────
     node scripts/release/preflight-edge-config.mjs \
       --function send-pilgrim-push --project-ref <ref>

     --function <slug>    repeatable; or --all for every function
     --project-ref <ref>  the target Supabase project
     --names-file <path>  read the configured names from a file
                          instead of the CLI (for testing the gate
                          itself; never a production substitute)

     --assert-coverage    a different question, asked without any
                          project: does EVERY function have a
                          production redeploy workflow that pins its
                          reviewed source AND runs this gate? It
                          exists so the gap this closed cannot
                          silently reopen when a function is added.
   ═══════════════════════════════════════════════════════════════ */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "release", "customer-release.manifest.json");
const FUNCTIONS_DIR = path.join(REPO_ROOT, "supabase", "functions");

function die(msg) {
  process.stderr.write(`\n✖ preflight aborted: ${msg}\n\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { functions: [], all: false, assertCoverage: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--function") out.functions.push(argv[++i]);
    else if (a === "--all") out.all = true;
    else if (a === "--project-ref") out.projectRef = argv[++i];
    else if (a === "--names-file") out.namesFile = argv[++i];
    else if (a === "--assert-coverage") out.assertCoverage = true;
    else die(`unknown argument: ${a}`);
  }
  if (out.assertCoverage) return out;
  if (!out.all && out.functions.length === 0) die("--function <slug> (repeatable) or --all is required");
  if (!out.namesFile && !out.projectRef) die("--project-ref <ref> is required");
  return out;
}

const args = parseArgs(process.argv.slice(2));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const groups = manifest.envExampleVariables;

const log = (s) => process.stdout.write(`${s}\n`);
const failures = [];

/* ── 1. which functions ───────────────────────────────────────── */

const allSlugs = fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_shared").map((d) => d.name).sort();

/* ── coverage mode: every function must have a protected path ─── */

if (args.assertCoverage) {
  const WORKFLOWS = path.join(REPO_ROOT, ".github", "workflows");
  const files = fs.existsSync(WORKFLOWS)
    ? fs.readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    : [];
  /* The production deployment path for one function is its dedicated
     redeploy workflow: a hard-coded SLUG, a pinned reviewed source, and
     this gate. recovery-rehearsal.yml is deliberately NOT one of these:
     it deploys to a disposable restored project to prove recovery
     (S-59), which is not a serving environment, so Production origin
     and VAPID requirements do not belong to it. */
  const paths = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(WORKFLOWS, file), "utf8");
    const slug = /^\s{6}SLUG:\s*(\S+)\s*$/m.exec(text)?.[1];
    if (!slug || !/functions deploy/.test(text)) continue;
    paths.push({
      file,
      slug,
      pinsSource: /SRC_SHA256:/.test(text) && /sha256sum/.test(text),
      runsPreflight: /preflight-edge-config\.mjs/.test(text),
    });
  }

  log(`\n── Production deployment path coverage ───────────────────────\n`);
  for (const slug of allSlugs) {
    const own = paths.filter((p) => p.slug === slug);
    if (own.length === 0) {
      failures.push(`${slug} has no production redeploy workflow, so its deployment path is unprotected`);
      log(`${slug.padEnd(20)} ✖ no redeploy workflow`);
      continue;
    }
    for (const p of own) {
      const bad = [];
      if (!p.pinsSource) bad.push("no pinned reviewed-source sha256 gate");
      if (!p.runsPreflight) bad.push("does not run the configuration preflight");
      for (const b of bad) failures.push(`${p.file} deploys ${slug} but ${b}`);
      log(`${slug.padEnd(20)} ${bad.length ? "✖" : "✔"} ${p.file}${bad.length ? ` — ${bad.join("; ")}` : " (reviewed source + preflight)"}`);
    }
  }

  if (failures.length) {
    process.stderr.write(`\n✖ ${failures.length} coverage failure(s):\n`);
    for (const f of failures) process.stderr.write(`   · ${f}\n`);
    process.stderr.write("\nEvery Edge Function needs a production path that deploys reviewed source\nonly and runs the configuration preflight before deploying.\n\n");
    process.exit(1);
  }
  log(`\n✔ all ${allSlugs.length} Edge Functions have a protected production deployment path\n`);
  process.exit(0);
}

const slugs = args.all ? allSlugs : args.functions;
for (const s of slugs) {
  if (!allSlugs.includes(s)) die(`no such Edge Function in this repository: ${s}`);
}

/* ── 2. what each function's own source actually reads ────────── */

/** Every `Deno.env.get("NAME")` in a function and the _shared files it imports. */
function requiredNamesFor(slug) {
  const seen = new Set();
  const names = new Set();
  const visit = (absFile) => {
    if (seen.has(absFile) || !fs.existsSync(absFile)) return;
    seen.add(absFile);
    const src = fs.readFileSync(absFile, "utf8");
    for (const m of src.matchAll(/Deno\.env\.get\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g)) names.add(m[1]);
    for (const m of src.matchAll(/from\s+["'](\.\.?\/[^"']+\.ts)["']/g)) {
      visit(path.resolve(path.dirname(absFile), m[1]));
    }
  };
  visit(path.join(FUNCTIONS_DIR, slug, "index.ts"));
  if (seen.size === 0) die(`could not read source for function: ${slug}`);
  return [...names].sort();
}

/* ── 3. the configured names on the target project — names only ── */

function configuredNames() {
  if (args.namesFile) {
    const text = fs.readFileSync(path.resolve(args.namesFile), "utf8");
    return parseNames(text, `--names-file ${args.namesFile}`);
  }
  let raw;
  try {
    raw = execFileSync("npm", ["run", "--silent", "supabase", "--", "secrets", "list",
      "--project-ref", args.projectRef], { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    /* An unreadable inventory is a FAILED gate, never an assumed pass. */
    const detail = `${e.stderr ?? e.stdout ?? e.message}`.replace(/sbp_[A-Za-z0-9]+/g, "sbp_***").trim();
    die(`could not read the project's secret inventory, so required configuration cannot be verified.\n  ${detail.split("\n").slice(-3).join("\n  ")}`);
  }
  return parseNames(raw, `project ${args.projectRef}`);
}

function parseNames(text, source) {
  const names = text.split("\n")
    .map((line) => (line.trim().replace(/^\|\s*/, "").split(/[\s|]+/)[0] ?? "").trim())
    .filter((t) => /^[A-Z][A-Z0-9_]*$/.test(t) && t !== "NAME");
  if (names.length === 0) die(`the secret inventory from ${source} held no recognizable names — refusing to treat an unreadable inventory as empty`);
  return new Set(names);
}

/* ── 4. the gate ──────────────────────────────────────────────── */

log(`\n── Edge Function deployment preflight ────────────────────────`);
log(`target : ${args.namesFile ? `(names file) ${args.namesFile}` : `project ${args.projectRef}`}`);
log(`scope  : ${slugs.join(", ")}\n`);

const present = configuredNames();
log(`configured names read from the target: ${present.size} (names only — no value is read)\n`);

const platform = new Set(groups.platformProvided);
const required = new Set(groups.edgeRequired);
const optional = new Set(groups.edgeFeature);

for (const slug of slugs) {
  const reads = requiredNamesFor(slug);
  const must = [];
  const may = [];
  for (const name of reads) {
    if (platform.has(name)) continue;            // injected by the platform
    else if (required.has(name)) must.push(name);
    else if (optional.has(name)) may.push(name);
    else {
      /* A new env var nobody classified is a gate failure: it is
         either required configuration or a feature value, and the
         inventory in the manifest must say which before it deploys. */
      failures.push(`${slug} reads unclassified configuration "${name}" — classify it in release/customer-release.manifest.json (envExampleVariables)`);
    }
  }
  const missing = must.filter((n) => !present.has(n));
  const absentOptional = may.filter((n) => !present.has(n));

  log(`${slug}`);
  log(`  required : ${must.length ? must.map((n) => `${n}${present.has(n) ? " ✔" : " ✖ MISSING"}`).join(", ") : "(none)"}`);
  if (may.length) log(`  optional : ${may.map((n) => `${n}${present.has(n) ? " ✔" : " — not configured"}`).join(", ")}`);
  for (const n of missing) failures.push(`${slug} requires ${n}, which is not configured on the target`);
  if (absentOptional.length) {
    log(`  note     : the feature(s) behind ${absentOptional.join(", ")} will be unavailable; this is not a gate failure`);
  }
  log("");
}

if (failures.length) {
  process.stderr.write(`✖ ${failures.length} deployment-readiness failure(s):\n`);
  for (const f of failures) process.stderr.write(`   · ${f}\n`);
  process.stderr.write(`
These values have no fallback. Deploying now would produce functions no
browser can reach, or push sent with no sender identity. Configure them as
Supabase Edge Function secrets on the target project and re-run.

Reference: docs/CUSTOMER_TECHNICAL_HANDOVER_MANUAL.md section 3.7.
⚠️ Set the values on the platform. Never commit a value to git.\n\n`);
  process.exit(1);
}

log(`✔ every required configuration name is present on the target`);
log(`  Names only were verified. That a value is correct and points at this`);
log(`  environment's own domain, project and contact remains a human check`);
log(`  (handover manual section 13).\n`);
