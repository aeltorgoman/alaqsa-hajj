#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Customer Function Update — run the workflow's real shell steps (Master only).

    python3 -I -B supabase/verification/release/customer_function_update_sim.py

No network, no secrets, no Supabase project. It generates a Customer Release
snapshot, commits it in a temporary git repository, and executes every `run:`
step of .github/workflows/customer-function-update.yml exactly as written, in
order, with the job and step `env:` resolved the way Actions would. Only two
binaries are stubbed on PATH:

  curl  -> the Management API: GET functions/<slug> and GET secrets, from a
           per-scenario state directory
  npm   -> `npm run supabase -- functions download|deploy <slug> ...`:
           download copies the "deployed" bundle; deploy installs the
           checkout's bundle and bumps the version

The "deployed" source starts as the release bundle with the pre-#271 fallback
reintroduced, so a deploy must replace it and post-deploy parity must hold.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import yaml

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
WF = ".github/workflows/customer-function-update.yml"
REF = "abcdefghijklmnopqrst"          # a customer-shaped ref
OLD_LITERAL = 'ann.title || "حملة الأقصى"'

CURL = r'''#!/usr/bin/env bash
out=""; wfmt=""; url=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift;; -w) wfmt="$2"; shift;; -H) shift;; -*) ;; *) url="$1";; esac; shift; done
case "$url" in
  */secrets) body="$(cat "$SIM_STATE/secrets.json")"; code=200;;
  */functions/*) slug="${url##*/}"
    if [ -f "$SIM_STATE/fn-$slug.json" ]; then body="$(cat "$SIM_STATE/fn-$slug.json")"; code=200; else body='{}'; code=404; fi;;
  *) body='{}'; code=500;;
esac
if [ -n "$out" ]; then printf '%s' "$body" > "$out"; else printf '%s' "$body"; fi
[ -n "$wfmt" ] && printf '%s' "$code"
exit 0
'''
NPM = r'''#!/usr/bin/env bash
args=("$@"); i=0; while [ "${args[$i]}" != "functions" ]; do i=$((i+1)); done
cmd="${args[$((i+1))]}"; slug="${args[$((i+2))]}"
case "$cmd" in
  download) [ -d "$SIM_STATE/deployed" ] || exit 1; cp -r "$SIM_STATE/deployed"/. supabase/functions/;;
  deploy) rm -rf "$SIM_STATE/deployed"; mkdir -p "$SIM_STATE/deployed"
    for f in $(node supabase/scripts/function-bundle.mjs files "$slug"); do
      d="$SIM_STATE/deployed/${f#supabase/functions/}"; mkdir -p "$(dirname "$d")"; cp "$f" "$d"; done
    v=$(( $(jq .version "$SIM_STATE/fn-$slug.json") + 1 ))
    jq --argjson v "$v" '.version=$v' "$SIM_STATE/fn-$slug.json" > "$SIM_STATE/t" && mv "$SIM_STATE/t" "$SIM_STATE/fn-$slug.json";;
  *) exit 2;;
esac
'''
REQUIRED = ["ALLOWED_ORIGINS", "VERCEL_PROJECT_SLUG", "VERCEL_OWNER_SLUG", "VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]


def sh(args, cwd, **kw):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, **kw)


def main():
    t = tempfile.mkdtemp(prefix="cfu-sim-")
    try:
        bindir = os.path.join(t, "bin")
        os.makedirs(bindir)
        for name, body in (("curl", CURL), ("npm", NPM)):
            p = os.path.join(bindir, name)
            open(p, "w").write(body)
            os.chmod(p, 0o755)
        snap = os.path.join(t, "snap")
        g = sh(["node", "scripts/release/generate-customer-release.mjs", "--out", snap, "--version", "7.7.7"], REPO)
        if g.returncode:
            print(g.stdout[-500:], g.stderr[-500:])
            raise SystemExit("generator failed")
        sh(["git", "init", "-q"], snap)
        sh(["git", "add", "-A"], snap)
        sh(["git", "-c", "user.email=sim@local", "-c", "user.name=sim", "commit", "-qm", "release"], snap)
        sha = sh(["git", "rev-parse", "HEAD"], snap).stdout.strip()
        job = yaml.safe_load(open(os.path.join(snap, WF)))["jobs"]["update"]

        def state(slug="send-pilgrim-push", jwt=True, present=True, secrets=REQUIRED, old=True):
            st = tempfile.mkdtemp(dir=t)
            if present:
                json.dump({"slug": slug, "version": 13, "status": "ACTIVE", "verify_jwt": jwt}, open(f"{st}/fn-{slug}.json", "w"))
            json.dump([{"name": n} for n in secrets], open(f"{st}/secrets.json", "w"))
            for f in sh(["node", "supabase/scripts/function-bundle.mjs", "files", slug], snap).stdout.split():
                d = os.path.join(st, "deployed", f[len("supabase/functions/"):])
                os.makedirs(os.path.dirname(d), exist_ok=True)
                shutil.copy(os.path.join(snap, f), d)
            idx = os.path.join(st, "deployed", "send-pilgrim-push/index.ts")
            if old and slug == "send-pilgrim-push":
                s = open(idx, encoding="utf-8").read()
                s = s.replace("buildPayload(ann, companyName)", "JSON.stringify({ id: ann.id, title: " + OLD_LITERAL + " })")
                open(idx, "w", encoding="utf-8").write(s)
            # an old bundle did not import push-dispatch/deliver.ts
            if old and slug == "send-pilgrim-push":
                os.remove(os.path.join(st, "deployed", "push-dispatch/deliver.ts"))
                os.rmdir(os.path.join(st, "deployed", "push-dispatch"))
            return st

        def run(inputs, st, ref=REF):
            out = tempfile.mkdtemp(dir=t)
            go, summ = os.path.join(out, "o"), os.path.join(out, "s")
            env = {**os.environ, "PATH": bindir + os.pathsep + os.environ["PATH"], "SIM_STATE": st,
                   "GITHUB_SHA": sha, "GITHUB_STEP_SUMMARY": summ, "RUNNER_TEMP": out}
            for k, v in job["env"].items():
                v = str(v).replace("${{ secrets.SUPABASE_PROJECT_REF }}", ref).replace("${{ secrets.SUPABASE_ACCESS_TOKEN }}", "sim-token")
                env[k] = re.sub(r"\$\{\{ inputs\.(\w+) \}\}", lambda m: inputs.get(m.group(1), ""), v)
            outputs = {}
            stopped = None
            for s in job["steps"]:
                if "run" not in s or s.get("if") == "always()":
                    continue
                if s.get("if") == "inputs.mode == 'deploy'" and inputs["mode"] != "deploy":
                    continue
                e = dict(env, GITHUB_OUTPUT=go)
                for k, v in (s.get("env") or {}).items():
                    e[k] = re.sub(r"\$\{\{ steps\.(\w+)\.outputs\.(\w+) \}\}", lambda m: outputs.get(m.group(1), {}).get(m.group(2), ""), str(v))
                open(go, "w").close()
                r = sh(["bash", "-e", "-c", s["run"]], snap, env=e)
                if "id" in s:
                    outputs[s["id"]] = dict(l.split("=", 1) for l in open(go).read().splitlines() if "=" in l)
                if r.returncode:
                    stopped = (s["name"], [l for l in (r.stdout + r.stderr).splitlines() if "::error::" in l])
                    break
            ev = os.path.join(snap, "function-update-evidence")
            files = {}
            if os.path.isdir(ev):
                for root, _, fs in os.walk(ev):
                    for f in fs:
                        files[os.path.relpath(os.path.join(root, f), ev)] = open(os.path.join(root, f), encoding="utf-8", errors="replace").read()
            tracked_clean = sh(["git", "status", "--porcelain", "--", ".", ":(exclude)function-update-evidence"], snap).stdout.strip() == ""
            shutil.rmtree(ev, ignore_errors=True)
            sh(["git", "checkout", "-q", "--", "."], snap)
            return stopped, files, (open(summ).read() if os.path.exists(summ) else ""), tracked_clean

        base = {"function": "send-pilgrim-push", "project_ref": REF, "expected_release": "7.7.7"}
        dep = {**base, "mode": "deploy", "expected_commit": sha, "confirm": "DEPLOY send-pilgrim-push"}
        npass = nfail = 0

        def check(name, cond, detail=""):
            nonlocal npass, nfail
            print(("PASS — " if cond else "FAIL — ") + name + (f" ({detail})" if detail and not cond else ""))
            npass, nfail = npass + bool(cond), nfail + (not cond)

        st = state()
        stop, ev, summ, clean = run({**base, "mode": "plan"}, st)
        check("plan completes read-only and offers the exact deploy inputs",
              stop is None and f"expected_commit = `{sha}`" in summ and "confirm = `DEPLOY send-pilgrim-push`" in summ, stop)
        check("plan: deployed old source detected as different; nothing deployed",
              "differs from this release" in summ and json.load(open(f"{st}/fn-send-pilgrim-push.json"))["version"] == 13)
        check("plan: repository files untouched", clean)

        stop, ev, summ, clean = run(dep, st)
        check("deploy completes", stop is None, stop)
        check("deploy: rollback baseline recorded (version 13) with the old source kept",
              json.loads(ev.get("pre-deploy.json", "{}")).get("version") == 13
              and OLD_LITERAL in ev.get("pre-deploy-source/send-pilgrim-push/index.ts", ""))
        check("deploy: new version 14, ACTIVE, verify_jwt true",
              json.loads(ev.get("post-deploy.json", "{}")) == {"slug": "send-pilgrim-push", "version": 14, "status": "ACTIVE", "verify_jwt": True})
        check("deploy: post-deploy source byte-identical to the release (6 files, incl. push-dispatch/deliver.ts)",
              ev.get("parity-after.txt", "").count("identical ") == 6 and "push-dispatch/deliver.ts" in ev.get("parity-after.txt", ""))
        check("deploy: fixed source has no hardcoded campaign title",
              "حملة الأقصى" not in ev.get("post-deploy-source/send-pilgrim-push/index.ts", "x حملة الأقصى"))
        check("deploy: repository files untouched", clean)
        stop, ev, summ, clean = run({**base, "mode": "plan"}, st)
        check("plan after deploy: already identical", stop is None and "already identical" in summ)

        neg = [
            ("wrong project_ref", {**base, "mode": "plan", "project_ref": "zzzzzzzzzzzzzzzzzzzz"}, {}, REF, "secrets, target"),
            ("vendor project refused", {**base, "mode": "plan", "project_ref": "zkucwcnclbfvukhdqhgc"}, {}, "zkucwcnclbfvukhdqhgc", "reviewed source"),
            ("wrong expected_release", {**base, "mode": "plan", "expected_release": "7.7.6"}, {}, REF, "reviewed source"),
            ("deploy without the exact confirm", {**dep, "confirm": "DEPLOY"}, {}, REF, "secrets, target"),
            ("deploy on another commit", {**dep, "expected_commit": "0" * 40}, {}, REF, "secrets, target"),
            ("deployed verify_jwt differs", dep, {"jwt": False}, REF, "JWT setting"),
            ("a REQUIRED secret missing", dep, {"secrets": REQUIRED[:-1]}, REF, "configuration"),
            ("function not deployed", dep, {"present": False}, REF, "JWT setting"),
        ]
        for name, inp, opt, ref, at in neg:
            s0 = state(**opt)
            before = open(f"{s0}/fn-send-pilgrim-push.json").read() if opt.get("present", True) else None
            stop, _, _, clean = run(inp, s0, ref=ref)
            unchanged = (before is None) or open(f"{s0}/fn-send-pilgrim-push.json").read() == before
            check(f"refused: {name} (at '{at}', nothing deployed)", stop is not None and at in stop[0] and unchanged and clean, stop)

        s1 = state(slug="push-dispatch", jwt=False, secrets=REQUIRED + ["PUSH_DISPATCH_TOKEN"], old=False)
        stop, _, summ, _ = run({**base, "function": "push-dispatch", "mode": "plan"}, s1)
        check("push-dispatch (verify_jwt false) plans cleanly", stop is None and "verify_jwt false" in summ, stop)

        print(f"\nresult: {npass} passed · {nfail} failed")
        return 1 if nfail else 0
    finally:
        shutil.rmtree(t, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
