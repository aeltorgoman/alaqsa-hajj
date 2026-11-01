#!/usr/bin/env node
// قواعدُ مطابقة الحاجّ: يُحزَم `cases.ts` بـrolldown (كما في print-verify) ويُنفَّذ في Node.
//   node scripts/pilgrim-match/run.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const require = createRequire(import.meta.url);
const { build } = require(join(ROOT, "node_modules/rolldown"));
const dir = mkdtempSync(join(tmpdir(), "pilgrim-match-"));
try {
  const file = join(dir, "cases.mjs");
  await build({ input: join(HERE, "cases.ts"), platform: "node", output: { file, format: "esm", codeSplitting: false }, logLevel: "silent" });
  const cases = JSON.parse(execFileSync(process.execPath, [file], { encoding: "utf8" }).trim().split("\n").pop());
  for (const c of cases) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${!c.ok && c.detail ? `  ${c.detail}` : ""}`);
  const failed = cases.filter(c => !c.ok).length;
  console.log(`\n${cases.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
} finally { rmSync(dir, { recursive: true, force: true }); }
