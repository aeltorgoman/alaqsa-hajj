// ════════════════════════════════════════════════════════════
// Customer Function Update — mechanism checks (Master only; not shipped)
//
//   node supabase/verification/release/customer_function_update_unit.mjs
//
// No network, no secrets. It:
//   · runs the shipped script's selftest,
//   · proves the vendor's own project refs are refused,
//   · cross-checks the bundle resolver against the Master parity script,
//   · audits the workflow text for what it must and must never do,
//   · generates a real Customer Release snapshot and runs the shipped script
//     inside it (release pin, tamper detection, JWT setting, configuration).
// ════════════════════════════════════════════════════════════
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const script = path.join(repo, "supabase/scripts/function-bundle.mjs");
const B = await import(script);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS — ${name}`); } else { fail++; console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`); }
};
const fnListAll = () => JSON.parse(fs.readFileSync(path.join(repo, "release/customer-release.manifest.json"), "utf8")).requiredFunctions;
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const run = (cwd, args) => spawnSync(process.execPath, [path.join(cwd, "supabase/scripts/function-bundle.mjs"), ...args], { cwd, encoding: "utf8" });

console.log("═══ shipped script ═══");
check("function-bundle.mjs --selftest passes", spawnSync(process.execPath, [script, "--selftest"], { encoding: "utf8" }).status === 0);
check("vendor Production project ref is refused", throws(() => B.checkTarget("zkucwcnclbfvukhdqhgc")));
check("vendor Load Test project ref is refused", throws(() => B.checkTarget("vgqowazlzzcovcrigcjz")));
check("a customer-shaped ref is allowed", B.checkTarget("jzksjevaeriypstvmibd") === true);

const py = execFileSync("python3", ["-I", "-B", "-c", `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("p", "supabase/verification/assert-edge-function-parity.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(json.dumps({s: sorted(m.expected_files("supabase/functions", s)) for s in sys.argv[1:]}))
`, ...JSON.parse(fs.readFileSync(path.join(repo, "release/customer-release.manifest.json"), "utf8")).requiredFunctions], { cwd: repo, encoding: "utf8" });
const parity = JSON.parse(py);
const same = Object.entries(parity).every(([s, files]) =>
  JSON.stringify(B.bundleFiles(repo, s).map((f) => f.replace(/^supabase\/functions\//, ""))) === JSON.stringify(files));
check("bundle resolver agrees with the Master parity script for every function", same);
check("strict dependency scan accepts every real function (no unsupported import pattern in Master)",
  fnListAll().every((f) => { try { B.dependencies(repo, f); B.verifyJwt(repo, f); return true; } catch (e) { console.log("   ", f, e.message); return false; } }));
check("send-pilgrim-push bundle includes push-dispatch/deliver.ts (the #271 fix)",
  B.bundleFiles(repo, "send-pilgrim-push").includes("supabase/functions/push-dispatch/deliver.ts"));

console.log("═══ workflow text ═══");
const wfPath = path.join(repo, ".github/workflows/customer-function-update.yml");
const wf = fs.readFileSync(wfPath, "utf8");
const code = wf.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
check("never runs migrations or writes secrets/config/data",
  !/db push|db reset|migration|secrets set|secrets unset|config push|\/database\/query|psql|--method (POST|PATCH|DELETE)|-X (POST|PATCH|DELETE)/i.test(code));
check("exactly one `functions deploy`, by name, on PROJECT_REF",
  (code.match(/functions deploy/g) ?? []).length === 1 && code.includes('functions deploy "$SLUG" --project-ref "$PROJECT_REF" --use-api'));
check("deploy and verify steps run only in deploy mode",
  /DEPLOY: exactly one function"\n\s+if: inputs\.mode == 'deploy'/.test(wf) && /VERIFY: [^\n]+"\n\s+if: inputs\.mode == 'deploy'/.test(wf));
const runs = JSON.parse(execFileSync("python3", ["-I", "-B", "-c",
  "import json,sys,yaml; w=yaml.safe_load(open(sys.argv[1])); print(json.dumps([s['run'] for j in w['jobs'].values() for s in j['steps'] if 'run' in s]))",
  wfPath], { encoding: "utf8" }));
check("inputs reach shell only through env (no ${{ … }} expression inside any run script)",
  runs.length >= 7 && runs.every((r) => !/\$\{\{/.test(r)), `${runs.length} run scripts`);
check("project_ref must equal the repository's SUPABASE_PROJECT_REF secret",
  wf.includes("PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}") && wf.includes('[ "$INPUT_REF" = "$PROJECT_REF" ]'));
check("deploy requires confirm = DEPLOY <function> and the planned SOURCE commit",
  wf.includes('[ "$CONFIRM" = "DEPLOY $SLUG" ]') && wf.includes('[ "$MODE" = "deploy" ] && [ "$EXPECTED_COMMIT" != "$commit" ]'));
check("release pin and expected_release are enforced before any API call",
  wf.indexOf("verify-release") > 0 && wf.indexOf("verify-release") < wf.indexOf("$API/projects") && wf.includes('[ "$release" = "$EXPECTED_RELEASE" ]'));
check("vendor targets refused before any API call",
  wf.indexOf("check-target") > 0 && wf.indexOf("check-target") < wf.indexOf("$API/projects"));
check("deployed verify_jwt must equal config.toml (preserved, never written)",
  wf.includes('[ "$have_jwt" = "$want_jwt" ]') && wf.includes('[ "$jwt" = "$WANT_JWT" ]') && !/verify_jwt\s*=/.test(code.replace(/\[functions[^\n]*/g, "")));
check("rollback baseline recorded as metadata + hashes (function-before.json, deployed-before.sha256)",
  wf.includes('"$OUT/function-before.json"') && wf.includes('> "$OUT/deployed-before.sha256"'));
check("rollback: source = release-tag deploys tag v<expected_release> from a separate worktree",
  wf.includes('git rev-parse -q --verify "refs/tags/$tag^{commit}"') && wf.includes('git worktree add -q --detach "$src" "$commit"')
  && /options: \[checkout, release-tag\]/.test(wf));
check("every check after source resolution runs on the resolved source (--root \"$SRC\")",
  (code.match(/(?:function-bundle\.mjs|"\$B") --root "\$(?:src|SRC)"/g) ?? []).length >= 6
  && !/(?:function-bundle\.mjs|"\$B") (?:verify-release|verify-jwt|required-env|compare|deps)/.test(code));
check("deploy and download run inside the resolved source",
  code.includes('(cd "$SRC" && npm run --silent supabase -- functions deploy') && (code.match(/\(cd "\$SRC" && npm run --silent supabase -- functions download/g) ?? []).length === 2);
check("post-deploy: version advances, ACTIVE, byte parity",
  wf.includes('[ "$version" -gt "$PRE_VERSION" ]') && wf.includes('[ "$status" = "ACTIVE" ]') && wf.includes('--root "$SRC" compare "$SLUG" "$dl" | tee "$OUT/parity-after.txt"'));
check("evidence: downloaded source never enters the artifact (kept in RUNNER_TEMP, deleted)",
  !/OUT\/[a-z-]*source/.test(code) && (code.match(/dl="\$RUNNER_TEMP\/deployed-(?:before|after)"/g) ?? []).length === 2 && (code.match(/rm -rf "\$dl"/g) ?? []).length === 2);
check("evidence: explicit file allowlist blocks anything else; metadata filtered to named fields; 30-day retention",
  wf.includes("allowed='^(release-bundle\\.sha256|function-before\\.json|function-after\\.json|configuration\\.txt|deployed-before\\.sha256|deployed-after\\.sha256|parity-before\\.txt|parity-after\\.txt)$'")
  && (code.match(/jq '\{slug, version, status, verify_jwt, ezbr_sha256, updated_at\}'/g) ?? []).length === 2
  && /retention-days: 30/.test(wf));
check("secret names file and raw API responses never reach the evidence directory",
  !/OUT\/(?:secrets|secret-names|fn-before|fn-after)/.test(code) && code.includes('rm -f "$RUNNER_TEMP/secret-names.txt"'));
check("a non-private repository is warned about", wf.includes("REPO_PRIVATE: ${{ github.event.repository.private }}") && wf.includes('[ "$REPO_PRIVATE" = "true" ] || echo "::warning::'));
check("permissions are read-only for the repository", /permissions:\n\s+contents: read\n/.test(wf));
const opts = (wf.match(/options: \[([^\]]+)\]\n\s+project_ref/) ?? [])[1]?.split(",").map((s) => s.trim()).sort();
const fnList = JSON.parse(fs.readFileSync(path.join(repo, "release/customer-release.manifest.json"), "utf8")).requiredFunctions.slice().sort();
check("function choice list = the release's required functions", JSON.stringify(opts) === JSON.stringify(fnList), JSON.stringify(opts));
check("no vendor identifier in the shipped files",
  ![wf, fs.readFileSync(script, "utf8")].some((s) => /al[-_ ]?aqsa|aeltorgoman|zkucwcnclbfvukhdqhgc|vgqowazlzzcovcrigcjz/i.test(s)));

console.log("═══ inside a generated Customer Release snapshot ═══");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cfu-"));
const snap = path.join(tmp, "snapshot");
const gen = spawnSync(process.execPath, [path.join(repo, "scripts/release/generate-customer-release.mjs"), "--out", snap, "--version", "9.9.9"],
  { cwd: repo, encoding: "utf8" });
check("the generator accepts the new files (allowlist, boundary, secrets, identity)", gen.status === 0, (gen.stderr || gen.stdout).slice(-400));
if (gen.status === 0) {
  check("snapshot ships the workflow and the script",
    fs.existsSync(path.join(snap, ".github/workflows/customer-function-update.yml")) && fs.existsSync(path.join(snap, "supabase/scripts/function-bundle.mjs")));
  const rel = run(snap, ["verify-release", "send-pilgrim-push"]);
  check("release pin passes for send-pilgrim-push and reports the version", rel.status === 0 && rel.stdout.startsWith("release 9.9.9"), rel.stderr);
  check("the pinned bundle carries the fix (no hardcoded campaign title)",
    !fs.readFileSync(path.join(snap, "supabase/functions/send-pilgrim-push/index.ts"), "utf8").includes("حملة الأقصى"));
  check("JWT setting read from the snapshot: send-pilgrim-push true, push-dispatch false",
    run(snap, ["verify-jwt", "send-pilgrim-push"]).stdout.trim() === "true" && run(snap, ["verify-jwt", "push-dispatch"]).stdout.trim() === "false");
  const names = path.join(tmp, "names.txt");
  fs.writeFileSync(names, "ALLOWED_ORIGINS\nVERCEL_PROJECT_SLUG\nVERCEL_OWNER_SLUG\nVAPID_SUBJECT\nVAPID_PUBLIC_KEY\nVAPID_PRIVATE_KEY\n");
  const env = run(snap, ["required-env", "send-pilgrim-push", names]);
  check("configuration check passes with the REQUIRED names set", env.status === 0, env.stderr);
  fs.writeFileSync(names, "ALLOWED_ORIGINS\nVERCEL_PROJECT_SLUG\nVERCEL_OWNER_SLUG\nVAPID_PUBLIC_KEY\nVAPID_PRIVATE_KEY\n");
  check("configuration check fails when a REQUIRED name is missing", run(snap, ["required-env", "send-pilgrim-push", names]).status === 1);
  check("every required function resolves and passes the release pin in the snapshot",
    fnList.every((s) => run(snap, ["verify-release", s]).status === 0));
  fs.appendFileSync(path.join(snap, "supabase/functions/push-dispatch/deliver.ts"), "\n// tampered\n");
  const tam = run(snap, ["verify-release", "send-pilgrim-push"]);
  check("a tampered imported file (push-dispatch/deliver.ts) refuses send-pilgrim-push", tam.status === 1 && /deliver\.ts/.test(tam.stderr));
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\nresult: ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
