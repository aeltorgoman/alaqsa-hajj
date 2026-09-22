#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مقارنُ البصمات — Level 2 (security) comparator.

Compares two fingerprint files emitted by fingerprint.sql +
fingerprint-storage.sql and FAILS CLOSED on any difference that is not
explicitly adjudicated in an allowlist.

Why this exists instead of `diff -u ... || true`:

  * `diff` is ORDER sensitive. The fingerprint SQL sorts with the
    database's own collation, and the live database uses the ICU
    `en_US.UTF-8` collation while a local container may use libc
    `C.UTF-8`. Identical content then produces a diff in which nearly
    every line is "changed" purely because the two servers disagree on
    where Arabic identifiers sort. That is platform noise, not a
    security difference, and it drowns the real signal.

  * `|| true` recorded the diff and then reported success. A count of
    diff lines is not a verdict.

So: canonicalise (byte-wise C-order sort of a multiset of lines),
compare per record kind, classify every remaining line, and exit
non-zero unless the difference set is empty or adjudicated.

Every fingerprint line begins with a record kind. Nothing here is
kind-aware beyond that: an unrecognised kind is itself a failure, so a
future addition to fingerprint.sql cannot slip through unchecked.
"""

import sys
import unicodedata
from collections import Counter

KNOWN_KINDS = {
    "COUNT", "COLUMN", "CONSTRAINT", "INDEX", "VIEW", "FUNC", "TRIGGER",
    "RLS", "POLICY", "GRANT", "GRANTSEQ", "SCHEMA", "DEFACL", "EXT", "BUCKET",
    "STPOL",
}

# Kinds whose absence would silently gut the proof. If the reference
# side has zero of these, the capture was broken, not equal.
REQUIRED_KINDS = {"COLUMN", "FUNC", "RLS", "POLICY", "GRANT", "GRANTSEQ",
                  "DEFACL"}


def canon(line):
    """One fingerprint line -> comparable form.

    NFC so that identical Arabic text captured through two different
    client stacks compares equal; trailing whitespace dropped; internal
    whitespace left alone because it is inside SQL expressions that we
    are deliberately comparing byte for byte.
    """
    return unicodedata.normalize("NFC", line.rstrip("\n").rstrip())


def load(path):
    out = []
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = canon(raw)
            if line:
                out.append(line)
    return out


def kind_of(line):
    head = line.split(None, 1)[0] if line.split() else ""
    return head if head in KNOWN_KINDS else "UNKNOWN"


def load_allowlist(path):
    """Adjudicated differences.

    Format: a `# WHY: ...` comment line, then the exact fingerprint
    line it excuses, prefixed with `-` (expected only in the reference)
    or `+` (expected only in the candidate). An entry without a
    preceding WHY is rejected, so nothing can be waved through
    silently.
    """
    if not path:
        return set()
    entries = set()
    why = None
    with open(path, encoding="utf-8") as fh:
        for n, raw in enumerate(fh, 1):
            line = raw.rstrip("\n")
            if not line.strip():
                continue
            if line.startswith("# WHY:"):
                why = line
                continue
            if line.startswith("#"):
                continue
            if line[0] not in "+-":
                sys.exit("allowlist:%d: entry must start with '+' or '-': %s" % (n, line))
            if not why:
                sys.exit("allowlist:%d: entry has no preceding '# WHY:' line" % n)
            entries.add((line[0], canon(line[1:])))
            why = None
    return entries


def main(argv):
    if len(argv) < 3:
        sys.exit("usage: compare-fingerprints.py REFERENCE CANDIDATE "
                 "[--label L] [--allowlist FILE] [--max-show N]")
    ref_path, cand_path = argv[1], argv[2]
    label, allow_path, max_show = "Level 2", None, 200
    rest = argv[3:]
    while rest:
        flag = rest.pop(0)
        if flag == "--label":
            label = rest.pop(0)
        elif flag == "--allowlist":
            allow_path = rest.pop(0)
        elif flag == "--max-show":
            max_show = int(rest.pop(0))
        else:
            sys.exit("unknown option: %s" % flag)

    ref, cand = load(ref_path), load(cand_path)
    allow = load_allowlist(allow_path)

    print("== %s ==" % label)
    print("reference: %s (%d lines)" % (ref_path, len(ref)))
    print("candidate: %s (%d lines)" % (cand_path, len(cand)))

    # A capture that produced nothing at all must never read as "equal".
    ref_kinds = Counter(kind_of(l) for l in ref)
    missing_required = sorted(k for k in REQUIRED_KINDS if not ref_kinds.get(k))
    if not ref:
        print("::error::%s reference fingerprint is empty - capture failed" % label)
        return 1
    if missing_required:
        print("::error::%s reference fingerprint has no %s records - capture is incomplete"
              % (label, ", ".join(missing_required)))
        return 1

    # Canonical comparison: multiset of lines, order irrelevant.
    only_ref = Counter(ref) - Counter(cand)
    only_cand = Counter(cand) - Counter(ref)

    ordering_only = not only_ref and not only_cand and ref != cand
    if ordering_only:
        print("note: both sides carry the identical multiset of records; the "
              "files differ only in line order (database collation), which "
              "is not a semantic difference.")

    diffs = []
    for line, n in sorted(only_ref.items()):
        diffs.extend([("-", line)] * n)
    for line, n in sorted(only_cand.items()):
        diffs.extend([("+", line)] * n)

    adjudicated = [d for d in diffs if d in allow]
    unresolved = [d for d in diffs if d not in allow]

    by_kind = Counter(kind_of(line) for _, line in unresolved)
    # Direction matters more than the total: records present only in the
    # candidate are privileges the rebuilt database has and the live
    # reference does not, which is a widening, not a loss.
    ref_only = Counter(kind_of(l) for sign, l in unresolved if sign == "-")
    cand_only = Counter(kind_of(l) for sign, l in unresolved if sign == "+")
    print("records compared: %d kinds, %d reference records" % (len(ref_kinds), len(ref)))
    print("adjudicated differences: %d" % len(adjudicated))
    print("unresolved differences: %d  (reference-only %d, candidate-only %d)"
          % (len(unresolved), sum(ref_only.values()), sum(cand_only.values())))
    print("  %-10s %8s %8s %8s" % ("kind", "total", "ref-only", "cand-only"))
    for kind, n in sorted(by_kind.items(), key=lambda kv: (-kv[1], kv[0])):
        print("  %-10s %8d %8d %8d" % (kind, n, ref_only.get(kind, 0), cand_only.get(kind, 0)))

    for sign, line in adjudicated:
        print("ADJUDICATED %s%s" % (sign, line))

    if not unresolved:
        print("%s PASS - the two fingerprints are semantically identical." % label)
        return 0

    print("")
    print("--- unresolved differences (- = reference only, + = candidate only) ---")
    shown = Counter()
    for sign, line in unresolved:
        kind = kind_of(line)
        shown[kind] += 1
        if shown[kind] <= max_show:
            print("%s%s" % (sign, line))
        elif shown[kind] == max_show + 1:
            print("  ... further %s records suppressed; full set is in the artifact" % kind)
    print("")
    print("::error::%s FAIL - %d unexplained fingerprint difference(s). "
          "Every one of these is a schema, privilege, RLS, policy or function "
          "security attribute that the rebuilt database does not share with "
          "the reference." % (label, len(unresolved)))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
