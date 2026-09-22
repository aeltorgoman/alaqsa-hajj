#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مُلزِمُ خطّةِ الدفع — fail-closed assertions for a canonical db push.

Two modes, both exact-equality and both failing closed on a missing,
empty or unparseable input.

  plan <file.json> [expected.sql ...]
      Asserts the CLI's dry-run plan lists EXACTLY the given migrations,
      in order. With no expected files, asserts nothing is pending and
      the project reports up to date. The CLI is invoked with
      --output-format json so stdout is deterministic regardless of
      agent detection.

  body <file.sql> <expected-normalised-sql>
      Asserts a migration's EXECUTABLE content - comments stripped,
      whitespace collapsed, lower-cased - equals the approved text
      exactly. Comments may say anything; SQL may not.
"""
import io
import json
import re
import sys


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        lines = [l for l in fh.read().splitlines() if l.strip()]
    if not lines:
        raise ValueError("%s is empty - the CLI produced no JSON on stdout" % path)
    return json.loads(lines[-1])


def normalise(sql):
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", "", sql)
    return re.sub(r"\s+", " ", sql).strip().lower()


def main(argv):
    if len(argv) < 3:
        sys.exit("usage: assert-push-plan.py plan <json> [expected.sql ...]\n"
                 "       assert-push-plan.py body <sql> <expected-normalised-sql>")
    mode = argv[1]
    bad = 0

    def check(cond, msg):
        nonlocal bad
        print(("  ok   " if cond else "  FAIL ") + msg)
        if not cond:
            print("::error::" + msg)
            bad = 1

    if mode == "plan":
        try:
            d = load_json(argv[2])
        except Exception as exc:                    # noqa: BLE001 - any failure is a failure
            print("::error::could not read %s: %s" % (argv[2], exc))
            return 1
        expected = argv[3:]
        check(d.get("dryRun") is True, "the plan was a dry run")
        check(d.get("migrations") == expected,
              "pending list is exactly %r (got %r)" % (expected, d.get("migrations")))
        check(d.get("upToDate") is (not expected),
              "upToDate is %s as expected (got %r)" % (not expected, d.get("upToDate")))
    elif mode == "body":
        if len(argv) < 4:
            sys.exit("body mode needs <sql> and <expected-normalised-sql>")
        try:
            got = normalise(io.open(argv[2], encoding="utf-8").read())
        except Exception as exc:                    # noqa: BLE001
            print("::error::could not read %s: %s" % (argv[2], exc))
            return 1
        want = normalise(argv[3])
        check(got == want,
              "executable SQL equals the approved proof body (got %r)" % (got[:120],))
    else:
        sys.exit("unknown mode: %s" % mode)

    if bad:
        print("::error::%s assertions FAILED" % mode)
        return 1
    print("%s assertions PASSED." % mode)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
