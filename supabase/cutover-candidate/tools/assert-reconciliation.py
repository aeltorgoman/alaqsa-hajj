#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مُلزِمُ بروفةِ المصالحة — fail-closed assertions over the CLI's JSON.

Checkpoint 5 Run #2 asserted on substrings of the CLI's human output and
failed although the CLI had behaved perfectly. Two causes, both
reproduced on a local cluster:

  1. the human lines go to STDERR, and only stdout was captured;
  2. the CLI's agent detection changes the format - in an agent session
     stdout carries JSON, on a bare runner it carries one prose line.

The workflow now passes --output-format json, which is deterministic in
both environments, and this file asserts EXACT equality on the parsed
JSON rather than matching substrings. That is stricter than the greps it
replaces: `migrations == ["...v1_baseline.sql"]` rejects a pending list
that merely contains the baseline alongside something else, which a
substring match would have accepted.

Reads three files from the proof-output directory and exits non-zero on
any failure:

  sim-dryrun-before.json   the baseline must be the SINGLE pending migration
  sim-repair.json          exactly one version repaired, applied, not repair-all
  sim-dryrun-after.json    nothing pending
"""
import json
import os
import sys

BASELINE_FILE = "20260922120000_v1_baseline.sql"
BASELINE_VERSION = "20260922120000"


def load(out, name):
    """Last non-blank stdout line, parsed as JSON.

    The CLI may print progress before the result line; the result is
    always last. A missing or unparseable file is a failure, never a
    silent pass.
    """
    path = os.path.join(out, name)
    with open(path, encoding="utf-8") as fh:
        lines = [l for l in fh.read().splitlines() if l.strip()]
    if not lines:
        raise ValueError("%s is empty - the CLI produced no JSON on stdout" % name)
    return json.loads(lines[-1])


def main(argv):
    out = argv[1] if len(argv) > 1 else "proof-output"
    bad = 0

    def check(cond, msg):
        nonlocal bad
        print(("  ok   " if cond else "  FAIL ") + msg)
        if not cond:
            print("::error::" + msg)
            bad = 1

    try:
        before = load(out, "sim-dryrun-before.json")
        repair = load(out, "sim-repair.json")
        after = load(out, "sim-dryrun-after.json")
    except Exception as exc:                      # noqa: BLE001 - any failure is a failure
        print("::error::could not read the reconciliation rehearsal output: %s" % exc)
        return 1

    print("== before the reconciliation ==")
    check(before.get("dryRun") is True,
          "the pre-reconciliation push was a dry run")
    check(before.get("migrations") == [BASELINE_FILE],
          "the baseline was the SINGLE pending migration (got %r)" % (before.get("migrations"),))
    check(before.get("upToDate") is False,
          "the ledger was not already up to date before the reconciliation")

    print("== the reconciliation ==")
    check(repair.get("versions") == [BASELINE_VERSION],
          "exactly the baseline version was repaired (got %r)" % (repair.get("versions"),))
    check(repair.get("status") == "applied",
          "the repair status was 'applied' (got %r)" % (repair.get("status"),))
    check(repair.get("repairAll") is False,
          "the repair was NOT a repair-all, which would have truncated the ledger")

    print("== after the reconciliation ==")
    check(after.get("upToDate") is True,
          "no migration is pending after the reconciliation")
    check(after.get("migrations") == [],
          "the pending list is empty after the reconciliation (got %r)" % (after.get("migrations"),))

    if bad:
        print("::error::reconciliation rehearsal assertions FAILED")
        return 1
    print("Reconciliation rehearsal assertions PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
