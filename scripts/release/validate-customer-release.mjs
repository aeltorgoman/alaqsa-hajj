#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Customer Release validator — runs against a generated snapshot.

   Proves the snapshot is independently installable and buildable,
   with no reference back to the Master working tree:
     1. clean dependency install from the shipped lockfile (`npm ci`)
     2. production build (`npm run build`)
     3. lint, reported as a DELTA against the known baseline (M-105)

   The baseline is NOT a number the operator types. It is read from
   `release/lint-baseline.json`, the authoritative committed baseline,
   which is lowered as a reviewed repository change alongside the lint
   debt it retires. `--lint-baseline <n>` remains available to override
   it for a one-off investigation, and is not the normal path.

   Boundary/secret checks are the generator's job and already ran.
   This step is the build proof.

   Usage:
     node scripts/release/validate-customer-release.mjs --dir <snapshot-dir>

     --lint-baseline <n>  override the committed baseline (rare)
     --skip-install       skip `npm ci` (rare)
   ═══════════════════════════════════════════════════════════════ */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LINT_BASELINE_PATH = path.join(REPO_ROOT, "release", "lint-baseline.json");

function parseArgs(argv) {
  const out = { skipInstall: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dir") out.dir = argv[++i];
    else if (a === "--lint-baseline") out.lintBaseline = Number(argv[++i]);
    else if (a === "--skip-install") out.skipInstall = true;
    else die(`unknown argument: ${a}`);
  }
  if (!out.dir) die("--dir <snapshot-dir> is required");
  return out;
}

function die(msg) {
  process.stderr.write(`\n✖ validation aborted: ${msg}\n\n`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const dir = path.resolve(args.dir);

/* The baseline is authoritative and committed, not operator knowledge.
   An unreadable or malformed baseline is a failure, not a skipped check. */
let lintBaseline;
let lintBaselineSource;
if (Number.isFinite(args.lintBaseline)) {
  lintBaseline = args.lintBaseline;
  lintBaselineSource = "--lint-baseline override";
} else {
  if (!fs.existsSync(LINT_BASELINE_PATH)) die(`lint baseline not found: ${LINT_BASELINE_PATH}`);
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(LINT_BASELINE_PATH, "utf8"));
  } catch (e) {
    die(`lint baseline is not valid JSON: ${LINT_BASELINE_PATH}`);
  }
  if (!Number.isInteger(baseline.problems) || baseline.problems < 0) {
    die(`lint baseline has no integer "problems" field: ${LINT_BASELINE_PATH}`);
  }
  lintBaseline = baseline.problems;
  lintBaselineSource = `release/lint-baseline.json (measured ${baseline.measuredOn ?? "unknown"})`;
}
if (!fs.existsSync(path.join(dir, "package.json"))) die(`not a release snapshot: ${dir}`);

const log = (s) => process.stdout.write(`${s}\n`);
const failures = [];

function run(cmd, cmdArgs) {
  log(`\n$ ${cmd} ${cmdArgs.join(" ")}`);
  try {
    return { ok: true, out: execFileSync(cmd, cmdArgs, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

log(`\n── Validating Customer Release snapshot ──────────────────────`);
log(`dir: ${dir}`);

/* 1. clean install */
if (args.skipInstall) log("\n(skipping install at operator request)");
else {
  const install = run("npm", ["ci", "--no-audit", "--no-fund"]);
  if (!install.ok) {
    failures.push("clean dependency install (npm ci) failed");
    process.stderr.write(install.out.slice(-2000));
  } else log("✔ clean dependency install");
}

/* 2. production build */
const build = run("npm", ["run", "build"]);
if (!build.ok) {
  failures.push("production build failed");
  process.stderr.write(build.out.slice(-4000));
} else {
  log("✔ production build");
  const dist = path.join(dir, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) failures.push("build produced no dist/index.html");
  else log(`  dist/ → ${fs.readdirSync(dist).join(", ")}`);
}

/* 3. lint delta */
const lint = run("npm", ["run", "lint"]);
const m = /✖\s+(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/.exec(lint.out);
if (!m && lint.ok) log(`✔ lint: 0 problems (baseline ${lintBaseline} from ${lintBaselineSource} → delta -${lintBaseline})`);
else if (!m) {
  failures.push("lint did not run to completion");
  process.stderr.write(lint.out.slice(-2000));
} else {
  const total = Number(m[1]);
  log(`✔ lint ran: ${total} problems (${m[2]} errors, ${m[3]} warnings)`);
  const delta = total - lintBaseline;
  log(`  baseline ${lintBaseline} from ${lintBaselineSource} → delta ${delta >= 0 ? "+" : ""}${delta}`);
  if (delta > 0) failures.push(`lint regressed by ${delta} against the baseline of ${lintBaseline}`);
  else if (delta < 0) {
    log(`  lint debt is ${-delta} below the baseline — lower "problems" in`);
    log(`  release/lint-baseline.json in the pull request that retired it.`);
  }
}

/* 4. the snapshot must not have acquired a git history during validation */
if (fs.existsSync(path.join(dir, ".git"))) failures.push("snapshot contains a .git directory");

if (failures.length) {
  process.stderr.write(`\n✖ ${failures.length} validation failure(s):\n`);
  for (const f of failures) process.stderr.write(`   · ${f}\n`);
  process.stderr.write("\nThis snapshot MUST NOT be published.\n\n");
  process.exit(1);
}
log("\n✔ snapshot validated — installable, buildable, lint within baseline\n");
