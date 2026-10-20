#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مُلزِمُ تطابُقِ الدوالّ — fail-closed, per-function parity between each
deployed Edge Function bundle and the repository source.

Why this exists. `edge-function-parity.yml` used to download every
function into one `supabase/functions/` tree. Each bundle carries its own
copy of the `_shared/` files it imports, so every download overwrote the
`_shared/` written by the one before it, and the single `_shared/`
comparison at the end judged only the LAST function downloaded. That is
wrong both ways: a stale `_shared/http.ts` in an early function was
invisible if the last one was current (false PASS), and a stale last
function failed the run for everyone (misleading FAIL).

What it asserts. Each function is downloaded into its own directory, and
for each one this compares exactly the files that function's bundle
should hold: the repository files reachable from
`<slug>/index.ts` through relative imports (`from "./x.ts"`,
`from "../_shared/y.ts"`), which is what `functions deploy` uploads.
For every function, separately for its own source and for its bundled
`_shared/` files, it reports:

  IDENTICAL   every expected file present and byte-identical
  DRIFT       modified / missing / extra files, each named

Fail-closed: a missing or empty deployed directory, an unreadable repo
entry point, or any difference fails the run. There is no path on which
it prints a verdict it did not compute, and no function's result can be
affected by another function's files.

Usage:
  assert-edge-function-parity.py <repo-functions-dir> <deployed-root> <slug>...
      <deployed-root>/<slug>/ holds what `functions download <slug>` wrote
      (i.e. `<slug>/…` and `_shared/…`), isolated per function.
  assert-edge-function-parity.py --selftest
"""
import hashlib
import os
import re
import sys
import tempfile

IMPORT_RE = re.compile(r"""from\s+["'](\.\.?/[^"']+\.ts)["']""")
SHARED = "_shared"


def sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def expected_files(repo, slug):
    """Repo-relative paths reachable from <slug>/index.ts via relative imports."""
    entry = os.path.join(repo, slug, "index.ts")
    if not os.path.isfile(entry):
        raise SystemExit(f"error: repository entry point missing: {slug}/index.ts")
    root = os.path.realpath(repo)
    seen, stack = set(), [os.path.realpath(entry)]
    while stack:
        f = stack.pop()
        if f in seen:
            continue
        seen.add(f)
        if not os.path.isfile(f):
            # an import the repository cannot satisfy is a defect in the repo copy
            raise SystemExit(f"error: {slug} imports a missing file: {os.path.relpath(f, root)}")
        with open(f, encoding="utf-8") as fh:
            src = fh.read()
        for rel in IMPORT_RE.findall(src):
            stack.append(os.path.realpath(os.path.join(os.path.dirname(f), rel)))
    out = set()
    for f in seen:
        rel = os.path.relpath(f, root)
        if rel.startswith(".."):
            raise SystemExit(f"error: {slug} imports outside the functions directory: {rel}")
        out.add(rel.replace(os.sep, "/"))
    return out


def deployed_files(droot):
    out = set()
    for d, _, files in os.walk(droot):
        for n in files:
            out.add(os.path.relpath(os.path.join(d, n), droot).replace(os.sep, "/"))
    return out


def compare(repo, deployed_root, slug):
    """Returns {"function": (status, details), "shared": (status, details)}."""
    droot = os.path.join(deployed_root, slug)
    if not os.path.isdir(droot) or not deployed_files(droot):
        return {"function": ("MISSING_DEPLOYED", []), "shared": ("MISSING_DEPLOYED", [])}
    want = expected_files(repo, slug)
    have = deployed_files(droot)
    result = {}
    for part, pred in (("function", lambda p: p.startswith(slug + "/")),
                       ("shared", lambda p: p.startswith(SHARED + "/"))):
        w = {p for p in want if pred(p)}
        h = {p for p in have if pred(p)}
        details = [f"missing   {p}" for p in sorted(w - h)]
        details += [f"extra     {p}" for p in sorted(h - w)]
        details += [f"modified  {p}" for p in sorted(w & h)
                    if sha256(os.path.join(repo, p)) != sha256(os.path.join(droot, p))]
        result[part] = ("IDENTICAL" if not details else "DRIFT", details)
    # anything outside <slug>/ and _shared/ is unexpected in a bundle
    stray = sorted(p for p in have if not (p.startswith(slug + "/") or p.startswith(SHARED + "/")))
    if stray:
        st, det = result["function"]
        result["function"] = ("DRIFT", det + [f"extra     {p}" for p in stray])
    return result


def run(repo, deployed_root, slugs, out=sys.stdout):
    if not slugs:
        raise SystemExit("error: no slugs given")
    bad = 0
    out.write("function\tsource\tshared\n")
    detail_lines = []
    for s in slugs:
        r = compare(repo, deployed_root, s)
        out.write(f"{s}\t{r['function'][0]}\t{r['shared'][0]}\n")
        for part in ("function", "shared"):
            st, det = r[part]
            if st != "IDENTICAL":
                bad = 1
            for d in det:
                detail_lines.append(f"{s} [{part}] {d}")
    if detail_lines:
        out.write("--- differences ---\n")
        for d in detail_lines:
            out.write(d + "\n")
    out.write(("FAIL" if bad else "PASS") + "\n")
    return bad


# ── self-test ────────────────────────────────────────────────────────────
def _write(base, rel, text):
    p = os.path.join(base, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)


def selftest():
    import io
    failures = 0

    def check(name, cond):
        nonlocal failures
        print(("  ok   " if cond else "  FAIL ") + name)
        failures += 0 if cond else 1

    with tempfile.TemporaryDirectory() as t:
        repo = os.path.join(t, "repo")
        # two functions sharing http.ts; fn-a also imports a local module and authorize.ts
        _write(repo, "fn-a/index.ts", 'import { cors } from "../_shared/http.ts";\nimport { authz } from "../_shared/authorize.ts";\nimport { x } from "./local.ts";\n')
        _write(repo, "fn-a/local.ts", "export const x = 1;\n")
        _write(repo, "fn-b/index.ts", 'import { cors } from "../_shared/http.ts";\n')
        _write(repo, "_shared/http.ts", "export const cors = 'NEW';\n")
        _write(repo, "_shared/authorize.ts", 'import { fail } from "./http.ts";\nexport const authz = 1;\n')
        _write(repo, "_shared/unused.ts", "export const u = 1;\n")  # imported by nobody

        def bundle(root, slug, files):
            for rel in files:
                with open(os.path.join(repo, rel), encoding="utf-8") as f:
                    _write(os.path.join(root, slug), rel, f.read())

        A = ["fn-a/index.ts", "fn-a/local.ts", "_shared/http.ts", "_shared/authorize.ts"]
        B = ["fn-b/index.ts", "_shared/http.ts"]

        def verdict(root, slugs):
            buf = io.StringIO()
            rc = run(repo, root, slugs, buf)
            rows = {l.split("\t")[0]: l.split("\t")[1:] for l in buf.getvalue().splitlines()
                    if "\t" in l and not l.startswith("function\t")}
            return rc, rows, buf.getvalue()

        check("reachable set is index + local + imported _shared only (unused excluded)",
              expected_files(repo, "fn-a") == set(A))

        # 1) identical bundles -> PASS
        d = os.path.join(t, "d1"); bundle(d, "fn-a", A); bundle(d, "fn-b", B)
        rc, rows, _ = verdict(d, ["fn-a", "fn-b"])
        check("identical bundles -> PASS", rc == 0 and rows == {"fn-a": ["IDENTICAL", "IDENTICAL"], "fn-b": ["IDENTICAL", "IDENTICAL"]})

        # 2) modified shared file -> FAIL, reported as modified in that function's shared column
        d = os.path.join(t, "d2"); bundle(d, "fn-a", A); bundle(d, "fn-b", B)
        _write(os.path.join(d, "fn-b"), "_shared/http.ts", "export const cors = 'OLD';\n")
        rc, rows, txt = verdict(d, ["fn-a", "fn-b"])
        check("modified shared file -> FAIL", rc == 1 and rows["fn-b"] == ["IDENTICAL", "DRIFT"])
        check("…named as 'modified _shared/http.ts' under fn-b", "fn-b [shared] modified  _shared/http.ts" in txt)

        # 3) missing shared file -> FAIL
        d = os.path.join(t, "d3"); bundle(d, "fn-a", A); bundle(d, "fn-b", B)
        os.remove(os.path.join(d, "fn-a", "_shared/authorize.ts"))
        rc, rows, txt = verdict(d, ["fn-a", "fn-b"])
        check("missing shared file -> FAIL", rc == 1 and rows["fn-a"] == ["IDENTICAL", "DRIFT"])
        check("…named as 'missing _shared/authorize.ts'", "fn-a [shared] missing   _shared/authorize.ts" in txt)

        # 4) extra files (shared and function) -> FAIL
        d = os.path.join(t, "d4"); bundle(d, "fn-a", A); bundle(d, "fn-b", B)
        _write(os.path.join(d, "fn-b"), "_shared/rogue.ts", "x\n")
        _write(os.path.join(d, "fn-a"), "fn-a/rogue.ts", "x\n")
        rc, rows, txt = verdict(d, ["fn-a", "fn-b"])
        check("extra shared file -> FAIL", rows["fn-b"] == ["IDENTICAL", "DRIFT"] and "extra     _shared/rogue.ts" in txt)
        check("extra function file -> FAIL", rows["fn-a"][0] == "DRIFT" and "extra     fn-a/rogue.ts" in txt and rc == 1)

        # 5) modified function source -> FAIL in the source column only
        d = os.path.join(t, "d5"); bundle(d, "fn-a", A); bundle(d, "fn-b", B)
        _write(os.path.join(d, "fn-a"), "fn-a/local.ts", "export const x = 2;\n")
        rc, rows, _ = verdict(d, ["fn-a", "fn-b"])
        check("modified function source -> FAIL (source column)", rc == 1 and rows["fn-a"] == ["DRIFT", "IDENTICAL"])

        # 6) different shared versions per function -> correct per-function results,
        #    whichever is processed last (the overwrite defect cannot mask or blame)
        d = os.path.join(t, "d6"); bundle(d, "fn-a", A); bundle(d, "fn-b", B)
        _write(os.path.join(d, "fn-a"), "_shared/http.ts", "export const cors = 'OLD';\n")
        for order in (["fn-a", "fn-b"], ["fn-b", "fn-a"]):
            rc, rows, _ = verdict(d, order)
            check(f"stale fn-a + current fn-b, order {order} -> fn-a DRIFT, fn-b IDENTICAL, FAIL",
                  rc == 1 and rows["fn-a"] == ["IDENTICAL", "DRIFT"] and rows["fn-b"] == ["IDENTICAL", "IDENTICAL"])

        # 7) a function that was not downloaded -> FAIL, never skipped
        d = os.path.join(t, "d7"); bundle(d, "fn-a", A)
        rc, rows, _ = verdict(d, ["fn-a", "fn-b"])
        check("missing deployed function -> FAIL", rc == 1 and rows["fn-b"] == ["MISSING_DEPLOYED", "MISSING_DEPLOYED"])

        # 8) control — the old single-tree method on case 6: fn-a (stale) then fn-b
        #    (current) written into ONE tree leaves only fn-b's http.ts, so the old
        #    `_shared` diff saw no difference: a false PASS this script does not give
        old = os.path.join(t, "old"); bundle(old, ".", A)
        _write(old, "_shared/http.ts", "export const cors = 'OLD';\n")
        bundle(old, ".", B)
        check("control: one shared tree keeps only the last writer's _shared (old false PASS)",
              sha256(os.path.join(old, "_shared/http.ts")) == sha256(os.path.join(repo, "_shared/http.ts")))

    print("selftest " + ("PASSED" if failures == 0 else f"FAILED ({failures})"))
    return 1 if failures else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        sys.exit(selftest())
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(run(sys.argv[1], sys.argv[2], sys.argv[3:]))
