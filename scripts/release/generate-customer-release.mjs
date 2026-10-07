#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Customer Release generator — allowlist-driven, fail-closed.

   Builds a clean Customer Release snapshot from the current Master
   working tree into an output directory. It copies ONLY what
   release/customer-release.manifest.json allows. It never copies
   everything and deletes afterwards, and it never copies `.git`,
   so no Master history is transferred.

   Authority:
     docs/CUSTOMER_TECHNICAL_HANDOVER_MANUAL.md §2.2, §3.1, §3.7, §5
     supabase/README.md  (canonical migrations / functions / config)

   Usage:
     node scripts/release/generate-customer-release.mjs \
       --out <dir> --version <x.y.z> [--force]

   Exit code 0 only if every check passed. Any missing required
   file, any unexpected sensitive path, any secret-shaped string,
   or any boundary violation aborts with a non-zero exit.
   ═══════════════════════════════════════════════════════════════ */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "release", "customer-release.manifest.json");

/* ── CLI ──────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const out = { force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--force") out.force = true;
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--version") out.version = argv[++i];
    else die(`unknown argument: ${a}`);
  }
  if (!out.out) die("--out <dir> is required");
  if (!out.version) die("--version <x.y.z> is required");
  if (!/^\d+\.\d+\.\d+$/.test(out.version)) die(`--version must be x.y.z, got: ${out.version}`);
  return out;
}

const failures = [];
const fail = (msg) => failures.push(msg);
function die(msg) {
  process.stderr.write(`\n✖ customer release aborted: ${msg}\n\n`);
  process.exit(1);
}

/* ── small glob matcher (only `**` and `*`, enough for the manifest) ── */

function globToRe(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i += 1;
        if (glob[i + 1] === "/") { i += 1; re += "(?:[^/]+/)*"; } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
const matchesAny = (rel, globs) => globs.some((g) => globToRe(g).test(rel));

/* ── fs helpers ───────────────────────────────────────────────── */

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, base));
    else if (entry.isFile()) out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}

function copyFile(relPath, outRoot) {
  const src = path.join(REPO_ROOT, relPath);
  const dest = path.join(outRoot, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/* ── 1. load manifest ─────────────────────────────────────────── */

if (!fs.existsSync(MANIFEST_PATH)) die(`manifest not found: ${MANIFEST_PATH}`);
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const args = parseArgs(process.argv.slice(2));
const outRoot = path.resolve(args.out);

if (outRoot === REPO_ROOT) die("--out must not be the repository root");
if (REPO_ROOT.startsWith(`${outRoot}${path.sep}`)) die("--out must not contain the repository");
if (fs.existsSync(outRoot)) {
  if (!args.force) die(`output directory already exists: ${outRoot} (pass --force to replace)`);
  fs.rmSync(outRoot, { recursive: true, force: true });
}
fs.mkdirSync(outRoot, { recursive: true });

const log = (s) => process.stdout.write(`${s}\n`);
log(`\n── Customer Release ${args.version} ───────────────────────────`);
log(`source : ${REPO_ROOT}`);
log(`output : ${outRoot}\n`);

/* ── 2. resolve the allowlist against the source tree ─────────── */

const selected = [];

for (const rel of manifest.files) {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    fail(`allowlisted file missing from Master: ${rel}`);
    continue;
  }
  selected.push(rel);
}

for (const tree of manifest.trees) {
  const abs = path.join(REPO_ROOT, tree.path);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    fail(`allowlisted tree missing from Master: ${tree.path}`);
    continue;
  }
  const inside = walk(abs);
  const picked = inside.filter((p) => matchesAny(p, tree.include)
    && !matchesAny(p, tree.exclude ?? []));
  if (picked.length === 0) fail(`allowlisted tree matched no files: ${tree.path}`);
  for (const p of picked) selected.push(`${tree.path}/${p}`);
}

if (failures.length) report();

/* ── 3. copy — allowlist only, `.git` never reached ───────────── */

for (const rel of selected) copyFile(rel, outRoot);
log(`copied ${selected.length} allowlisted files`);

/* ── 4. generated files (names and placeholders only) ─────────── */

const env = manifest.envExampleVariables;
const envSection = (title, names) => [`# ── ${title}`, ...names.map((n) => `${n}=`), ""].join("\n");

fs.writeFileSync(path.join(outRoot, ".env.example"), [
  "# ════════════════════════════════════════════════════════════",
  `# ${manifest.productName} — environment variable template`,
  "# ════════════════════════════════════════════════════════════",
  "# VARIABLE NAMES AND PLACEHOLDERS ONLY. Never commit real values.",
  "# Frontend values belong in the customer's Vercel project; Edge",
  "# Function values belong in the customer's Supabase project secrets",
  "# (handover manual sections 3.1-3.3, 3.7).",
  "",
  envSection(`Frontend — Vercel${""}`, env.frontend),
  envSection("Edge Functions — REQUIRED, per customer (fail closed when unset)", env.edgeRequired),
  envSection("Edge Functions — optional features", env.edgeFeature),
  [
    "# ── Injected by the Supabase platform at function runtime — do not set",
    ...env.platformProvided.map((n) => `# ${n}`),
    "",
  ].join("\n"),
].join("\n"));

const releaseDate = new Date().toISOString().slice(0, 10);

fs.writeFileSync(path.join(outRoot, "RELEASE.md"), `# Customer Release ${args.version}

| | |
|---|---|
| Product | ${manifest.productName} |
| Release version | \`v${args.version}\` |
| Snapshot generated | ${releaseDate} |
| Allowlist manifest | \`customer-release.manifest.json\` v${manifest.manifestVersion} (Master) |

This repository is a **clean release snapshot**, not a fork or mirror of the
vendor's Master repository. It carries no Master development history.

## What this snapshot contains

- The frontend application source and build configuration.
- The canonical Supabase migrations required to build a fresh customer database.
- The Supabase Edge Functions and \`supabase/config.toml\`.
- \`package-lock.json\` and the pinned Supabase CLI version.
- The first-administrator bootstrap script.
- The operational documentation required for this release.

## What it deliberately does not contain

Secrets, real environment values, customer data, Master git history,
internal development/verification/recovery evidence, load-test artifacts,
and vendor-internal GitHub workflows.

## Deployment

Before the first deployment, the repository needs two GitHub secrets:
\`SUPABASE_PROJECT_REF\` and \`SUPABASE_ACCESS_TOKEN\` — a Supabase access
token scoped to this project with **Database**, **Migrations**, **Edge
Functions** and **Edge Function Secrets**, all **Read-Write**, and **Auth
Config: Read**. No other permission, secret or password is stored.

1. **Supabase** — set what the workflow verifies before it changes anything
   (it reads these; it cannot change them):
   - Authentication → Sign In / Providers → **Allow new users to sign up** →
     Off, and **Allow anonymous sign-ins** → Off → **Save changes**.
   - Authentication → URL Configuration → **Site URL** → the Vercel production
     URL (the first URL entered in step 3) → **Save**.
   - Edge Functions → Secrets → add **\`ANTHROPIC_API_KEY\`** with the
     customer's own Anthropic API key (passport scanning). The workflow checks
     only that the name exists; the key never goes to GitHub or Vercel.
2. **Supabase** — Authentication → Users → **Add user**. Enter the
   administrator's Login ID (email form, e.g. \`admin@company.local\`) and
   password, and tick **Auto Confirm User**.
3. **GitHub** — Actions → **Customer Backend Setup** → Run workflow. Enter the
   Vercel production URL, Vercel project name and owner, a contact
   (\`mailto:…\`), the same administrator Login ID with a display name, and
   the Hijri year of the first Hajj season (e.g. \`1448\`). The workflow first
   verifies that public sign-up and anonymous sign-in are off, that the Site
   URL is the first Production URL and that \`ANTHROPIC_API_KEY\` exists, and
   stops without changing anything if not.
   It then applies the database, creates the First Administrator with every system permission,
   creates the first open season (an existing open season is kept unchanged),
   configures the Edge Function secrets, deploys the six Edge Functions and
   verifies the result. If a run fails, fix the reported
   cause and run it again — it continues safely.
4. **Vercel** — set \`VITE_SUPABASE_URL\`, \`VITE_SUPABASE_ANON_KEY\` and the
   \`VITE_VAPID_PUBLIC_KEY\` shown in the workflow's summary, then deploy.
5. **Application** — sign in and scan a test/specimen passport image (never
   real customer or pilgrim data). Confirm the extracted fields are populated,
   then close the form without saving the test pilgrim. The workflow proves
   only that the key exists; this proves passport scanning works.

Full ownership, release, recovery and handover rules:
\`docs/CUSTOMER_TECHNICAL_HANDOVER_MANUAL.md\`.
`);

fs.writeFileSync(path.join(outRoot, "README.md"), `# ${manifest.productName}

Customer Release \`v${args.version}\`. See [\`RELEASE.md\`](./RELEASE.md) for what
this snapshot contains and how it is deployed, and
[\`docs/CUSTOMER_TECHNICAL_HANDOVER_MANUAL.md\`](./docs/CUSTOMER_TECHNICAL_HANDOVER_MANUAL.md)
for the governing ownership, release and recovery rules.

Development is **not** performed in this repository. Every change arrives as a
new approved release snapshot generated from the vendor's Master repository.
`);

/* ── 5. integrity index over everything shipped ───────────────── */

const shipped = walk(outRoot).filter((p) => p !== "release-manifest.json").sort();
const index = {};
for (const rel of shipped) index[rel] = sha256(fs.readFileSync(path.join(outRoot, rel)));
fs.writeFileSync(path.join(outRoot, "release-manifest.json"), `${JSON.stringify({
  productName: manifest.productName,
  releaseVersion: args.version,
  generatedOn: releaseDate,
  manifestVersion: manifest.manifestVersion,
  fileCount: shipped.length,
  files: index,
}, null, 2)}\n`);

log(`generated ${manifest.generated.length} release files`);

/* ── 6. fail-closed validation of the snapshot ────────────────── */

const all = walk(outRoot).sort();

/* 6.1 required files present */
for (const rel of manifest.required) {
  if (!all.includes(rel)) fail(`required release file missing from snapshot: ${rel}`);
}

/* 6.2 nothing outside the allowlist */
const allowed = new Set([...selected, ...manifest.generated]);
for (const rel of all) {
  if (!allowed.has(rel)) fail(`snapshot contains a file outside the allowlist: ${rel}`);
}

/* 6.3 forbidden paths — boundary violation */
for (const rel of all) {
  for (const bad of manifest.forbiddenPaths) {
    if (rel === bad || rel.startsWith(`${bad}/`)) {
      fail(`forbidden path present in snapshot: ${rel} (matches "${bad}")`);
    }
  }
}
if (fs.existsSync(path.join(outRoot, ".git"))) fail("snapshot contains a .git directory");

/* 6.4 forbidden file shapes — unexpected sensitive files */
for (const rel of all) {
  const base = rel.split("/").pop();
  if (manifest.forbiddenFileGlobExceptions.includes(rel)) continue;
  if (matchesAny(rel, manifest.forbiddenFileGlobs) || matchesAny(base, manifest.forbiddenFileGlobs)) {
    fail(`unexpected sensitive file present in snapshot: ${rel}`);
  }
}

/* 6.5 secret-shaped and retired-identifier content */
const secretRes = manifest.secretPatterns.map((p) => ({ name: p.name, re: new RegExp(p.re) }));
const identRes = manifest.forbiddenIdentifiers.map((p) => ({ name: p.name, re: new RegExp(p.re, "i") }));

for (const rel of all) {
  const buf = fs.readFileSync(path.join(outRoot, rel));
  if (buf.includes(0)) continue; // binary
  const text = buf.toString("utf8");
  const lines = text.split("\n");
  for (const { name, re } of [...secretRes, ...identRes]) {
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) fail(`${name} found in ${rel}:${i + 1}`);
    }
  }
}

/* 6.6 .env.example carries names only */
const envText = fs.readFileSync(path.join(outRoot, ".env.example"), "utf8");
for (const [i, line] of envText.split("\n").entries()) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  if (!/^[A-Z][A-Z0-9_]*=$/.test(t)) fail(`.env.example line ${i + 1} is not a bare placeholder: ${t}`);
}

/* 6.7 Supabase completeness */
const srcMigrations = fs.readdirSync(path.join(REPO_ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
const outMigrations = fs.readdirSync(path.join(outRoot, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
if (srcMigrations.join("|") !== outMigrations.join("|")) {
  fail(`migration set differs from Master (${srcMigrations.length} in Master, ${outMigrations.length} shipped)`);
}
for (const f of outMigrations) {
  const a = sha256(fs.readFileSync(path.join(REPO_ROOT, "supabase/migrations", f)));
  const b = sha256(fs.readFileSync(path.join(outRoot, "supabase/migrations", f)));
  if (a !== b) fail(`migration content differs from Master: ${f}`);
}

const outFunctions = fs.readdirSync(path.join(outRoot, "supabase/functions"), { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();
for (const fn of manifest.requiredFunctions) {
  if (!outFunctions.includes(fn)) fail(`required Edge Function missing from snapshot: ${fn}`);
  else if (!fs.existsSync(path.join(outRoot, "supabase/functions", fn, "index.ts"))) {
    fail(`Edge Function has no index.ts in snapshot: ${fn}`);
  }
}
if (!outFunctions.includes("_shared")) fail("Edge Function _shared directory missing from snapshot");

const configText = fs.readFileSync(path.join(outRoot, "supabase/config.toml"), "utf8");
const declared = [...configText.matchAll(/^\[functions\.([^\]]+)\]/gm)].map((m) => m[1]);
for (const fn of manifest.requiredFunctions) {
  if (!declared.includes(fn)) fail(`supabase/config.toml declares no verify_jwt for function: ${fn}`);
}
for (const fn of declared) {
  if (!outFunctions.includes(fn)) fail(`supabase/config.toml declares function "${fn}" that the snapshot does not ship`);
}
if (!/^project_id\s*=/m.test(configText)) fail("supabase/config.toml has no project_id");

/* 6.8 the release must be installable and buildable from its own lockfile */
const pkg = JSON.parse(fs.readFileSync(path.join(outRoot, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(outRoot, "package-lock.json"), "utf8"));
if (lock.name !== pkg.name) fail(`package-lock.json name "${lock.name}" does not match package.json "${pkg.name}"`);
for (const script of ["build", "lint", "supabase"]) {
  if (!pkg.scripts?.[script]) fail(`package.json has no "${script}" script`);
}
if (!/supabase@\d+\.\d+\.\d+/.test(pkg.scripts.supabase)) fail("the Supabase CLI version is not pinned in package.json");

report();

/* ── report ───────────────────────────────────────────────────── */

function report() {
  if (failures.length) {
    process.stderr.write(`\n✖ ${failures.length} release boundary failure(s):\n`);
    for (const f of failures) process.stderr.write(`   · ${f}\n`);
    process.stderr.write(`\nThe snapshot at ${outRoot} MUST NOT be published.\n\n`);
    process.exit(1);
  }
  log(`\n✔ all release boundary checks passed — ${all.length} files`);
  log(`  migrations ${outMigrations.length} · edge functions ${manifest.requiredFunctions.length} · no secrets · no Master git history`);
  log(`\nNext: validate the snapshot (clean install + production build), then publish.\n`);
}
