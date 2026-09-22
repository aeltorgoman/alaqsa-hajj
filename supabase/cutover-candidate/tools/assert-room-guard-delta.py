#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مُلزِمُ الفارقِ المتوقَّع — bounded-delta assertions for the room guard push.

A migration that installs two functions and two triggers MUST change the
database - so "unchanged" is the wrong gate here. This asserts the
stronger thing: the database changed by EXACTLY the four approved
objects and by nothing else.

Anything the migration was not approved to do - a dropped policy, a
widened grant, a changed column, an altered RLS flag, an extra object -
appears as an unexpected difference and fails the run.

  fingerprint <before.txt> <after.txt>
      Multiset-diffs the security/structure fingerprint. Permits only:
        * the two FUNC lines and two TRIGGER lines below, added
        * COUNT functions / COUNT triggers rising by exactly 2
      and requires all four object lines to be present. Every other
      addition or removal fails.

  structural <before.sql> <after.sql>
      Multiset-diffs two pg_dump scripts using the Level 1 comparator's
      own splitter and canonicalisation. Permits only added statements
      that name one of the four approved objects; permits NO removals.
"""
import importlib.util
import os
import re
import sys
from collections import Counter

# The Level 1 comparator's filename is hyphenated, so it is loaded by
# path rather than imported. Its splitter and canonicalisation are
# reused verbatim - this tool must not have a second opinion about what
# a statement is.
_L1 = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "..", "..", "baseline-candidate", "tools",
                   "compare-structural.py")
_spec = importlib.util.spec_from_file_location("compare_structural", _L1)
_mod = importlib.util.module_from_spec(_spec)
# Load without leaving a __pycache__ beside the comparator: this
# tool is read-only with respect to the repository it inspects.
_prev = sys.dont_write_bytecode
sys.dont_write_bytecode = True
try:
    _spec.loader.exec_module(_mod)
finally:
    sys.dont_write_bytecode = _prev
load = _mod.load

FUNCS = ("reject_cross_season_room",
         "rooms_reject_season_change_with_occupants")
TRIGS = ("trg_reject_cross_season_room",
         "trg_rooms_reject_season_change")
NAMES = FUNCS + TRIGS

FUNC_RES = [re.compile(r"^FUNC\s+%s\(" % re.escape(f)) for f in FUNCS]
TRIG_RES = [re.compile(r"^TRIGGER\s+\S+\s+%s\s" % re.escape(t)) for t in TRIGS]
COUNT_RE = re.compile(r"^COUNT\s+(functions|triggers)\s+=\s+(\d+)$")
NAME_RE = re.compile("|".join(re.escape(n) for n in NAMES))


def report(bad, msg):
    print(("  ok   " if not bad else "  FAIL ") + msg)
    if bad:
        print("::error::" + msg)
    return 1 if bad else 0


def lines(path):
    with open(path, encoding="utf-8") as fh:
        return [l.rstrip("\n").strip() for l in fh if l.strip()]


def do_fingerprint(before, after):
    b, a = lines(before), lines(after)
    if not b or not a:
        print("::error::a fingerprint file is empty - capture failed")
        return 1
    removed = Counter(b) - Counter(a)
    added = Counter(a) - Counter(b)
    bad = 0

    counts = {}
    for side, bag in (("before", removed), ("after", added)):
        for line in bag:
            m = COUNT_RE.match(line)
            if m:
                counts.setdefault(m.group(1), {})[side] = int(m.group(2))

    unexpected_removed = [l for l in removed.elements() if not COUNT_RE.match(l)]
    bad |= report(bool(unexpected_removed),
                  "nothing was removed from the fingerprint (got %d: %r)"
                  % (len(unexpected_removed), unexpected_removed[:10]))

    leftover = []
    for line in added.elements():
        if COUNT_RE.match(line):
            continue
        if any(rx.match(line) for rx in FUNC_RES + TRIG_RES):
            continue
        leftover.append(line)
    bad |= report(bool(leftover),
                  "every added fingerprint line is one of the four approved "
                  "objects (got %d other: %r)" % (len(leftover), leftover[:10]))

    for kind in ("functions", "triggers"):
        pair = counts.get(kind, {})
        ok = ("before" in pair and "after" in pair
              and pair["after"] - pair["before"] == 2)
        bad |= report(not ok, "COUNT %s rose by exactly 2 (got %r)" % (kind, pair))

    for rx, name in zip(FUNC_RES + TRIG_RES, NAMES):
        bad |= report(not any(rx.match(l) for l in added.elements()),
                      "%s is present in the AFTER fingerprint" % name)

    for kind in counts:
        if kind not in ("functions", "triggers"):
            bad |= report(True, "an unapproved COUNT changed: %s" % kind)
    return bad


def do_structural(before, after):
    b = load(before)[0]
    a = load(after)[0]
    if not b or not a:
        print("::error::a structural dump contains no statements - capture failed")
        return 1
    removed = list((Counter(b) - Counter(a)).elements())
    added = list((Counter(a) - Counter(b)).elements())
    bad = 0
    bad |= report(bool(removed),
                  "no statement disappeared from the dump (got %d: %r)"
                  % (len(removed), [s[:160] for s in removed[:6]]))
    foreign = [s for s in added if not NAME_RE.search(s)]
    bad |= report(bool(foreign),
                  "every added statement names an approved object "
                  "(got %d that do not: %r)"
                  % (len(foreign), [s[:160] for s in foreign[:6]]))
    print("  info  added statements naming approved objects: %d"
          % (len(added) - len(foreign)))
    return bad


def main(argv):
    if len(argv) != 4 or argv[1] not in ("fingerprint", "structural"):
        sys.exit("usage: assert-room-guard-delta.py fingerprint|structural "
                 "<before> <after>")
    bad = (do_fingerprint if argv[1] == "fingerprint" else do_structural)(argv[2], argv[3])
    if bad:
        print("::error::%s bounded-delta assertions FAILED" % argv[1])
        return 1
    print("%s bounded-delta assertions PASSED." % argv[1])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
