#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Rehearsal of .github/workflows/customer-database-update.yml against a LOCAL database.

Runs the workflow's own `run` steps, in order, as the GitHub runner does
(bash -eo pipefail, inputs/secrets as env), from a release snapshot directory, with
`API` pointed at a local stand-in for the Supabase Management API:

  GET  /v1/projects/<ref>/database/migrations  -> rows of mock_api.migrations
  POST /v1/projects/<ref>/database/migrations  -> runs {query} in ONE transaction;
       on success records {name} under a generated version (as the real API does);
       on failure returns HTTP 400 {message} and records nothing.

It refuses any database that is not on localhost. Nothing here talks to Supabase.

  python3 -I scripts/release/rehearse-customer-database-update.py \
      --snapshot <release dir> --db postgresql://postgres:postgres@127.0.0.1:54322/<db> \
      --mode plan|apply [--expected "a,b,c"] [--confirm APPLY]
"""
import argparse, http.server, json, os, re, subprocess, sys, threading, time

ap = argparse.ArgumentParser()
ap.add_argument("--snapshot", required=True)
ap.add_argument("--db", required=True)
ap.add_argument("--mode", required=True, choices=["plan", "apply"])
ap.add_argument("--expected", default="")
ap.add_argument("--confirm", default="")
a = ap.parse_args()
if not re.match(r"^postgres(ql)?://[^@]*@(127\.0\.0\.1|localhost):", a.db):
    sys.exit("refusing: --db is not a local database")

def psql(sql, single=False):
    args = ["psql", a.db, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"] + (["-1"] if single else [])
    return subprocess.run(args, input=sql, capture_output=True, text=True)

r = psql("create schema if not exists mock_api; create table if not exists mock_api.migrations (version text primary key, name text not null);")
if r.returncode: sys.exit(r.stderr)

class Api(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def authorized(self):
        return self.headers.get("Authorization", "") == "Bearer rehearsal-token"
    def do_GET(self):
        if not self.authorized(): return self.reply(401, {"message": "unauthorized"})
        if not re.fullmatch(r"/v1/projects/rehearsal/database/migrations", self.path): return self.reply(404, {"message": "not found"})
        r = psql("select coalesce(json_agg(json_build_object('version', version, 'name', name) order by version), '[]') from mock_api.migrations;")
        if r.returncode: return self.reply(500, {"message": r.stderr})
        self.reply(200, json.loads(r.stdout))
    def do_POST(self):
        if not self.authorized(): return self.reply(401, {"message": "unauthorized"})
        if not re.fullmatch(r"/v1/projects/rehearsal/database/migrations", self.path): return self.reply(404, {"message": "not found"})
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        version = time.strftime("%Y%m%d%H%M%S") + f"{int(time.time()*1000)%1000:03d}"
        name = body["name"].replace("'", "''")
        r = psql(body["query"] + f"\n;insert into mock_api.migrations (version, name) values ('{version}', '{name}');", single=True)
        if r.returncode: return self.reply(400, {"message": r.stderr.strip() or "failed"})
        self.reply(201, {})

srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Api)
threading.Thread(target=srv.serve_forever, daemon=True).start()

import yaml
wf = yaml.safe_load(open(os.path.join(a.snapshot, ".github/workflows/customer-database-update.yml"), encoding="utf-8"))
job = next(iter(wf["jobs"].values()))
inputs = {"mode": a.mode, "expected_pending": a.expected, "confirm": a.confirm}
secrets = {"SUPABASE_PROJECT_REF": "rehearsal", "SUPABASE_ACCESS_TOKEN": "rehearsal-token"}
outputs = {}
def sub(v):
    v = re.sub(r"\$\{\{\s*inputs\.(\w+)\s*\}\}", lambda m: inputs[m.group(1)], str(v))
    v = re.sub(r"\$\{\{\s*steps\.(\w+)\.outputs\.(\w+)\s*\}\}", lambda m: outputs.get(m.group(1), {}).get(m.group(2), ""), v)
    v = re.sub(r"\$\{\{\s*secrets\.(\w+)\s*\}\}", lambda m: secrets[m.group(1)], v)
    if "${{" in v: sys.exit(f"unsupported expression in workflow: {v}")
    return v
def cond_true(c):
    c = re.sub(r"inputs\.(\w+)", lambda m: repr(inputs[m.group(1)]), c)
    c = re.sub(r"steps\.(\w+)\.outputs\.(\w+)", lambda m: repr(outputs.get(m.group(1), {}).get(m.group(2), "")), c)
    return eval(c.replace("&&", " and ").replace("||", " or "), {})
tmp = os.path.join(a.snapshot, ".rehearsal-tmp"); os.makedirs(tmp, exist_ok=True)
env0 = dict(os.environ, RUNNER_TEMP=tmp)
env0.update({k: sub(v) for k, v in job["env"].items()})
env0["API"] = f"http://127.0.0.1:{srv.server_address[1]}/v1"
failed = False
for st in job["steps"]:
    if "run" not in st: continue
    if failed or ("if" in st and not cond_true(st["if"])):
        print(f"--- SKIP {st['name']}"); continue
    env = dict(env0); env.update({k: sub(v) for k, v in st.get("env", {}).items()})
    for f in ("GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY"):
        env[f] = os.path.join(tmp, f.lower()); open(env[f], "w").close()
    print(f"=== {st['name']}", flush=True)
    r = subprocess.run(["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", st["run"]], env=env, cwd=a.snapshot)
    if st.get("id"):
        outputs[st["id"]] = dict(l.split("=", 1) for l in open(env["GITHUB_OUTPUT"]).read().splitlines() if "=" in l)
    print(f"--- {'OK' if r.returncode == 0 else 'FAILED'}", flush=True)
    failed = r.returncode != 0
srv.shutdown()
print("JOB", "FAILED" if failed else "SUCCEEDED")
sys.exit(1 if failed else 0)
