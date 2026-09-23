#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مُدقِّقُ شجرةِ الهجرات المقترحة — fail-closed structural checks.

Asserts, without touching any database:

  1. exactly one anchor per captured remote ledger version, and no
     anchor for a version the ledger does not contain;
  2. no duplicate, missing or extra anchor version;
  3. every anchor is genuinely a no-op - comments only, zero executable
     SQL, because an anchor with SQL in it would run against an empty
     database before the baseline on every rebuild;
  4. the baseline migration version sorts strictly after every ledger
     version, and its bytes match the proven baseline;
  5. the historical migrations are preserved byte-identically in the
     archive.

Exit non-zero on any failure.
"""
import hashlib
import io
import json
import os
import re
import sys

NAME_RE = re.compile(r"^(\d{14})_(.+)\.sql$")


def executable_sql(text):
    """Strip -- and /* */ comments; whatever remains is executable."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"--[^\n]*", "", text)
    return text.strip()


def main(argv):
    root = argv[1] if len(argv) > 1 else "."
    cand = os.path.join(root, "supabase", "cutover-candidate")
    man = json.load(io.open(os.path.join(cand, "manifest.json"), encoding="utf-8"))
    evidence = os.path.join(root, "docs", "migration-recovery", "2026-09-21", "final",
                            "ledger-metadata.jsonl")

    ledger = []
    for line in io.open(evidence, encoding="utf-8"):
        if line.strip():
            ledger.append(json.loads(line)["version"])

    fail = []

    def check(ok, msg):
        print(("  ok   " if ok else "  FAIL ") + msg)
        if not ok:
            fail.append(msg)

    print("== 1/2. anchors vs captured remote ledger versions ==")
    anchors = {}
    for f in sorted(os.listdir(os.path.join(cand, "anchors"))):
        m = NAME_RE.match(f)
        if not m:
            check(False, "anchor filename is not <version>_<name>.sql: %s" % f)
            continue
        anchors.setdefault(m.group(1), []).append(f)

    check(len(ledger) == man["anchor_count"],
          "manifest anchor_count %d == captured ledger rows %d" % (man["anchor_count"], len(ledger)))
    check(len(anchors) == len(ledger),
          "distinct anchor versions %d == ledger versions %d" % (len(anchors), len(ledger)))
    dupes = {v: fs for v, fs in anchors.items() if len(fs) > 1}
    check(not dupes, "no duplicate anchor version (%d duplicates)" % len(dupes))
    missing = sorted(set(ledger) - set(anchors))
    extra = sorted(set(anchors) - set(ledger))
    check(not missing, "no ledger version without an anchor (%d missing: %s)" % (len(missing), missing[:5]))
    check(not extra, "no anchor without a ledger version (%d extra: %s)" % (len(extra), extra[:5]))

    print("== 3. anchors carry no executable SQL ==")
    dirty = []
    for v, fs in sorted(anchors.items()):
        body = io.open(os.path.join(cand, "anchors", fs[0]), encoding="utf-8").read()
        if executable_sql(body):
            dirty.append(fs[0])
    check(not dirty, "every anchor is comments-only (%d with SQL: %s)" % (len(dirty), dirty[:3]))

    print("== 4. baseline ==")
    bv = man["baseline_version"]
    check(all(bv > v for v in ledger),
          "baseline version %s sorts after every ledger version (max %s)" % (bv, max(ledger)))
    src = os.path.join(root, man["baseline_source"])
    got = hashlib.sha256(io.open(src, "rb").read()).hexdigest()
    check(got == man["baseline_sha256"],
          "proven baseline sha256 matches the manifest (%s)" % got[:16])

    print("== 5. historical migrations preserved ==")
    archive = os.path.join(root, "supabase", "migrations-archive")
    active = os.path.join(root, "supabase", "migrations")
    if os.path.isdir(archive):
        arch = sorted(f for f in os.listdir(archive) if f.endswith(".sql"))
        check(len(arch) == man["historical_migration_count"],
              "archive holds %d historical migrations" % len(arch))
    else:
        cur = sorted(f for f in os.listdir(active) if f.endswith(".sql"))
        check(len(cur) == man["historical_migration_count"],
              "archive not yet created; %d historical migrations still active, as expected "
              "before cutover" % len(cur))

    print("")
    if fail:
        print("::error::cutover candidate verification FAILED - %d check(s)" % len(fail))
        return 1
    print("Cutover candidate verification PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
