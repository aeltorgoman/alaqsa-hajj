#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مُلزِمُ تطابُقِ السجلّ — fail-closed correspondence between the active
migration directory and `supabase_migrations.schema_migrations`.

This replaces `supabase db push --dry-run --linked` as the zero-pending
gate. `supabase link` is unusable from CI: it resolves the project's
**secret** service-role key through
`GET /v1/projects/{ref}/api-keys?reveal=true`, and the scoped
personal-access-token model has no grantable scope for revealing secret
key material, so the call is refused however the token is scoped.

The replacement is not a weakening. `db push --dry-run` answers exactly
one question — which repository migrations are absent from the ledger —
and this answers that question plus its converse:

  pending      repo − ledger   a repository migration production lacks
                               (this is precisely the CLI's plan)
  unexpected   ledger − repo   a production migration the canonical
                               active set does not account for. The CLI
                               never fails on this; here it is fatal.
  rows         |ledger|        the canonical 49-row ledger architecture
  latest       max(ledger)     the approved head version

The project's architecture is exact bidirectional correspondence: after
the Checkpoint 5 cutover the 49 files in `supabase/migrations` and the
49 ledger rows are the same 49 versions. So set equality is the correct
assertion, not an approximation of one.

Every failure mode is closed: a missing, empty or unreadable ledger
dump, a malformed or duplicated version on either side, an empty
migration directory, and any mismatch. There is no path on which this
prints a verdict it did not compute.

`--selftest` runs the built-in fixtures and exits non-zero on the first
disagreement, so the asserter is checked before it is trusted — the same
discipline as the probe asserter.
"""
import io
import os
import re
import sys

VERSION = re.compile(r"^\d{14}$")


def _dedupe(label, versions):
    """Returns a sorted list. Raises on a malformed or repeated version."""
    seen, out = set(), []
    for v in versions:
        if not VERSION.match(v):
            raise ValueError("%s holds a malformed version: %r" % (label, v))
        if v in seen:
            raise ValueError("%s holds version %s twice" % (label, v))
        seen.add(v)
        out.append(v)
    if not out:
        raise ValueError("%s is empty" % label)
    return sorted(out)


def read_repo(directory):
    """Versions of the active migration set, from the filename prefix."""
    try:
        names = sorted(n for n in os.listdir(directory) if n.endswith(".sql"))
    except OSError as exc:
        raise ValueError("cannot read %s: %s" % (directory, exc))
    return _dedupe("the migration directory", [n.split("_", 1)[0] for n in names])


def read_ledger(path):
    """Versions dumped one per line by psql -At. Blank lines are ignored."""
    with io.open(path, encoding="utf-8") as fh:
        lines = [l.strip() for l in fh if l.strip()]
    return _dedupe("the production ledger", lines)


def evaluate(repo, ledger, expect_rows, expect_latest):
    """Returns (ok, lines). Pure, so the selftest can exercise it."""
    out, bad = [], False

    def check(cond, msg):
        nonlocal bad
        out.append(("  ok   " if cond else "  FAIL ") + msg)
        if not cond:
            out.append("::error::" + msg)
            bad = True

    pending = [v for v in repo if v not in set(ledger)]
    unexpected = [v for v in ledger if v not in set(repo)]

    check(not pending,
          "zero pending migrations (repository versions absent from "
          "production: %s)" % (pending or "none",))
    check(not unexpected,
          "no unexpected production migration (ledger versions absent from "
          "the active migration set: %s)" % (unexpected or "none",))
    check(len(ledger) == expect_rows,
          "ledger holds %d rows, expected %d" % (len(ledger), expect_rows))
    check(len(repo) == expect_rows,
          "the active migration set holds %d files, expected %d"
          % (len(repo), expect_rows))
    check(ledger[-1] == expect_latest,
          "latest production version is %s, expected %s"
          % (ledger[-1], expect_latest))
    check(repo[-1] == expect_latest,
          "latest repository version is %s, expected %s"
          % (repo[-1], expect_latest))

    return (not bad), out


_R = ["20260101000000", "20260922192049", "20260922195044"]

SELFTESTS = [
    ("exact correspondence", _R, _R, 3, "20260922195044", True),
    ("a repository migration is pending",
     _R + ["20260923000000"], _R, 3, "20260922195044", False),
    ("an unexpected production migration",
     _R, _R + ["20260923000000"], 3, "20260922195044", False),
    ("wrong ledger count", _R, _R, 4, "20260922195044", False),
    ("wrong latest version", _R, _R, 3, "20260922120000", False),
    ("correspondence holds but both drifted off the approved head",
     _R[:-1] + ["20260923000000"], _R[:-1] + ["20260923000000"], 3,
     "20260922195044", False),
]


def selftest():
    bad = 0
    for label, repo, ledger, rows, latest, want_ok in SELFTESTS:
        got_ok, _ = evaluate(sorted(repo), sorted(ledger), rows, latest)
        mark = "ok  " if got_ok == want_ok else "FAIL"
        print("  %s selftest: %s (expected %s)"
              % (mark, label, "PASS" if want_ok else "FAIL"))
        if got_ok != want_ok:
            bad = 1
    # ولا يكفي الحكمُ على المخرجات: المُحلِّلُ نفسُه يجب أن يُغلق.
    for label, bad_input in (("malformed version", ["2026"]),
                             ("duplicate version", _R + [_R[0]]),
                             ("empty input", [])):
        try:
            _dedupe("fixture", bad_input)
        except ValueError:
            print("  ok   selftest: %s is refused" % label)
        else:
            print("  FAIL selftest: %s was accepted" % label)
            bad = 1
    print("selftest %s" % ("PASSED" if not bad else "FAILED"))
    return bad


def main(argv):
    if len(argv) == 2 and argv[1] == "--selftest":
        return selftest()
    if len(argv) != 5:
        sys.exit("usage: assert-ledger-correspondence.py "
                 "<migrations-dir> <ledger-versions.txt> <expect-rows> "
                 "<expect-latest>\n"
                 "       assert-ledger-correspondence.py --selftest")
    try:
        repo = read_repo(argv[1])
        ledger = read_ledger(argv[2])
        expect_rows = int(argv[3])
    except Exception as exc:                  # noqa: BLE001 — أيُّ فشلٍ فشل
        print("::error::correspondence input is unusable: %s" % exc)
        return 1
    ok, lines = evaluate(repo, ledger, expect_rows, argv[4])
    for line in lines:
        print(line)
    if not ok:
        print("::error::migration correspondence assertions FAILED")
        return 1
    print("Repository and production hold the same %d migrations; "
          "nothing is pending and nothing is unaccounted for." % expect_rows)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
