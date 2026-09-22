#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مُلزِمُ مطابقةِ السجلّ الحيّ للأدلّة المحفوظة — fail-closed.

Compares a read-only snapshot of the live migration ledger against the
preserved Checkpoint 1 evidence. Nothing is written, nothing is fetched:
the snapshot arrives on stdin or in a file, produced by a plain SELECT.

Snapshot format, one row per ledger row, tab separated:

    version \t name \t sha256(statements[1]) \t octet_length(statements[1])

with the literal string NULL in the last two columns for a row whose
`statements` column is NULL.

Every one of these is a hard failure:

  * a version in the evidence that is absent from the live ledger
  * a version in the live ledger that is absent from the evidence
  * a name that does not match
  * a payload hash or byte length that does not match
  * a NULL-statements row that is not the one the evidence records
  * the expected row count not matching

Usage:  assert-ledger-matches-evidence.py <snapshot.tsv> [--expect-rows N]
        [--expect-latest V] [--expect-absent V] [--evidence DIR]
"""
import io
import json
import os
import sys

DEFAULT_EVIDENCE = os.path.join("docs", "migration-recovery", "2026-09-21", "final")


def main(argv):
    if len(argv) < 2:
        sys.exit("usage: assert-ledger-matches-evidence.py <snapshot.tsv> "
                 "[--expect-rows N] [--expect-latest V] [--expect-absent V] [--evidence DIR]")
    snap_path = argv[1]
    expect_rows = expect_latest = expect_absent = None
    evidence = DEFAULT_EVIDENCE
    rest = argv[2:]
    while rest:
        flag = rest.pop(0)
        if flag == "--expect-rows":
            expect_rows = int(rest.pop(0))
        elif flag == "--expect-latest":
            expect_latest = rest.pop(0)
        elif flag == "--expect-absent":
            expect_absent = rest.pop(0)
        elif flag == "--evidence":
            evidence = rest.pop(0)
        else:
            sys.exit("unknown option: %s" % flag)

    bad = 0

    def check(cond, msg):
        nonlocal bad
        print(("  ok   " if cond else "  FAIL ") + msg)
        if not cond:
            print("::error::" + msg)
            bad = 1

    live = {}
    for line in io.open(snap_path, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) != 4:
            print("::error::malformed snapshot line: %r" % line)
            return 1
        live[parts[0]] = (parts[1], parts[2], parts[3])

    meta_path = os.path.join(evidence, "ledger-metadata.jsonl")
    pay_path = os.path.join(evidence, "statement-payloads.jsonl")
    meta = {}
    for line in io.open(meta_path, encoding="utf-8"):
        if line.strip():
            d = json.loads(line)
            meta[d["version"]] = d
    pay = {}
    for line in io.open(pay_path, encoding="utf-8"):
        if line.strip():
            d = json.loads(line)
            pay[d["version"]] = d

    print("== ledger shape ==")
    if expect_rows is not None:
        check(len(live) == expect_rows,
              "live ledger holds exactly %d rows (got %d)" % (expect_rows, len(live)))
    if expect_latest is not None:
        check(live and max(live) == expect_latest,
              "latest live version is %s (got %s)" % (expect_latest, max(live) if live else "-"))
    if expect_absent is not None:
        check(expect_absent not in live,
              "version %s is absent from the live ledger" % expect_absent)

    print("== live ledger vs preserved Checkpoint 1 evidence ==")
    missing = sorted(set(meta) - set(live))
    extra = sorted(set(live) - set(meta))
    check(not missing, "no evidence version missing from the live ledger (%d: %s)"
          % (len(missing), missing[:5]))
    check(not extra, "no live version absent from the evidence (%d: %s)"
          % (len(extra), extra[:5]))

    names = hashes = nulls = 0
    for version, (name, sha, nbytes) in sorted(live.items()):
        m = meta.get(version)
        if m is None:
            continue
        if m["name"] != name:
            print("::error::name drift at %s: evidence %r, live %r" % (version, m["name"], name))
            names += 1
            continue
        if sha == "NULL":
            if not m.get("statements_is_null"):
                print("::error::%s is NULL on the live ledger but carries a payload in the evidence"
                      % version)
                nulls += 1
            continue
        if m.get("statements_is_null"):
            print("::error::%s carries a payload on the live ledger but is NULL in the evidence"
                  % version)
            nulls += 1
            continue
        p = pay.get(version)
        if p is None:
            print("::error::%s has no preserved payload" % version)
            hashes += 1
        elif p["sha256"] != sha or str(p["byte_length"]) != nbytes:
            print("::error::payload drift at %s: evidence %s/%s, live %s/%s"
                  % (version, p["sha256"][:12], p["byte_length"], sha[:12], nbytes))
            hashes += 1

    check(names == 0, "every name matches the evidence (%d mismatches)" % names)
    check(hashes == 0, "every payload hash and byte length matches the evidence (%d mismatches)"
          % hashes)
    check(nulls == 0, "the NULL-statements row is exactly the one the evidence records "
                      "(%d mismatches)" % nulls)

    if bad:
        print("::error::the live ledger does NOT match the preserved evidence")
        return 1
    print("The live ledger matches the preserved Checkpoint 1 evidence exactly.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
