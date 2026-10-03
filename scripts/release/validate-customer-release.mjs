#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Customer Release validator — runs against a generated snapshot.

   Proves the snapshot is independently installable and buildable,
   with no reference back to the Master working tree:
     1. clean dependency install from the shipped lockfile (`npm ci`)
     2. production build (`npm run build`)
     3. lint, reported as a DELTA against the known baseline (M-105)

   Boundary/secret checks are the generator's job and already ran.
   This step is the build proof.

   Usage:
     node scripts/release/validate-customer-release.mjs \
       --dir <snapshot-dir> [--lint-baseline <n>] [--skip-install]
   ═══════════════════════════════════════════════════════════════ */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
if (!m && lint.ok) log("✔ lint: 0 problems");
else if (!m) {
  failures.push("lint did not run to completion");
  process.stderr.write(lint.out.slice(-2000));
} else {
  const total = Number(m[1]);
  log(`✔ lint ran: ${total} problems (${m[2]} errors, ${m[3]} warnings)`);
  if (Number.isFinite(args.lintBaseline)) {
    const delta = total - args.lintBaseline;
    log(`  baseline ${args.lintBaseline} → delta ${delta >= 0 ? "+" : ""}${delta}`);
    if (delta > 0) failures.push(`lint regressed by ${delta} against the baseline of ${args.lintBaseline}`);
  } else log("  (no --lint-baseline given; delta not asserted)");
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
