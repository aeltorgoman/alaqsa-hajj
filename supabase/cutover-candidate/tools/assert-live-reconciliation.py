#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مُلزِمُ المصالحةِ الحيّة — fail-closed assertions over the CLI's JSON.

Three modes, one per stage of the single authorized production write.
Every mode asserts EXACT equality, never a substring: a pending list
that merely contains the baseline is a failure, not a pass.

  plan-before <file>   the baseline must be the SINGLE pending migration
  repair      <file>   exactly one version, applied, and NOT repair-all
  plan-after  <file>   nothing pending

A missing, empty or unparseable file is a failure. The CLI is invoked
with --output-format json so stdout is deterministic regardless of
agent detection; anything else means something went wrong upstream and
this must not read as success.
"""
import json
import sys

BASELINE_FILE = "20260922120000_v1_baseline.sql"
BASELINE_VERSION = "20260922120000"


def load(path):
    with open(path, encoding="utf-8") as fh:
        lines = [l for l in fh.read().splitlines() if l.strip()]
    if not lines:
        raise ValueError("%s is empty - the CLI produced no JSON on stdout" % path)
    return json.loads(lines[-1])


def main(argv):
    if len(argv) < 3:
        sys.exit("usage: assert-live-reconciliation.py "
                 "<plan-before|repair|plan-after> <json-file>")
    mode, path = argv[1], argv[2]
    bad = 0

    def check(cond, msg):
        nonlocal bad
        print(("  ok   " if cond else "  FAIL ") + msg)
        if not cond:
            print("::error::" + msg)
            bad = 1

    try:
        d = load(path)
    except Exception as exc:                        # noqa: BLE001 - any failure is a failure
        print("::error::could not read %s: %s" % (path, exc))
        return 1

    if mode == "plan-before":
        check(d.get("dryRun") is True, "the pre-write plan was a dry run")
        check(d.get("migrations") == [BASELINE_FILE],
              "the baseline is the SINGLE pending migration (got %r)" % (d.get("migrations"),))
        check(d.get("upToDate") is False,
              "the project is not already up to date before the reconciliation")
    elif mode == "repair":
        check(d.get("versions") == [BASELINE_VERSION],
              "exactly the baseline version was repaired (got %r)" % (d.get("versions"),))
        check(d.get("status") == "applied",
              "the repair status was 'applied' (got %r)" % (d.get("status"),))
        check(d.get("repairAll") is False,
              "this was NOT a repair-all, which would have truncated the ledger")
    elif mode == "plan-after":
        check(d.get("dryRun") is True, "the post-write plan was a dry run")
        check(d.get("upToDate") is True, "the project is up to date after the reconciliation")
        check(d.get("migrations") == [],
              "no migration is pending (got %r)" % (d.get("migrations"),))
    else:
        sys.exit("unknown mode: %s" % mode)

    if bad:
        print("::error::%s assertions FAILED" % mode)
        return 1
    print("%s assertions PASSED." % mode)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
