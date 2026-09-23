#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مُلزِمُ مسابير واتساب — fail-closed assertions for probes A–J.

Reads a TSV of `probe<TAB>expected<TAB>actual` and asserts **exact**
equality for every row. A probe that is missing, unparseable, or that
returned `000` (the curl "no response" sentinel) is a failure, so a
network fault can never be mistaken for a passing gate.

Two extra invariants beyond row-by-row equality:

  * every probe A–J must be present — a truncated run does not pass;
  * probe J must be exactly 503. That is the terminal success condition
    of credential-free verification: the request cleared every gate and
    stopped only because no WhatsApp credentials are configured. Any
    2xx there would mean the run reached Meta, which this harness must
    never do.

`--selftest` runs the built-in fixtures and exits non-zero on the first
disagreement, so the asserter is itself checked before it is trusted.
"""
import io
import sys

REQUIRED = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
TERMINAL = ("J", "503")


def parse(path):
    rows = {}
    with io.open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) != 3:
                raise ValueError("malformed row: %r" % (line,))
            probe, expected, actual = (p.strip() for p in parts)
            if probe in rows:
                raise ValueError("probe %s appears twice" % probe)
            rows[probe] = (expected, actual)
    return rows


def evaluate(rows):
    """Returns (ok, lines). Pure, so the selftest can exercise it."""
    out, bad = [], False

    for probe in REQUIRED:
        if probe not in rows:
            out.append("  FAIL %s missing — the run did not complete" % probe)
            bad = True

    for probe in sorted(rows):
        expected, actual = rows[probe]
        if actual == "000":
            out.append("  FAIL %s expected %s, got no response (000)" % (probe, expected))
            bad = True
        elif actual != expected:
            out.append("  FAIL %s expected %s, got %s" % (probe, expected, actual))
            bad = True
        else:
            out.append("  ok   %s %s" % (probe, actual))

    name, want = TERMINAL
    if name in rows and rows[name][1] != want:
        out.append("  FAIL %s is the terminal condition and must be %s, got %s"
                   % (name, want, rows[name][1]))
        bad = True

    return (not bad), out


SELFTESTS = [
    ("all correct",
     {p: ("401", "401") for p in REQUIRED}
     | {"J": ("503", "503")}, True),
    ("one mismatch",
     {p: ("401", "401") for p in REQUIRED}
     | {"J": ("503", "503"), "C": ("403", "200")}, False),
    ("probe J reached Meta",
     {p: ("401", "401") for p in REQUIRED}
     | {"J": ("503", "200")}, False),
    ("no response",
     {p: ("401", "401") for p in REQUIRED}
     | {"J": ("503", "503"), "A": ("401", "000")}, False),
    ("truncated run",
     {p: ("401", "401") for p in REQUIRED if p != "H"}
     | {"J": ("503", "503")}, False),
]


def selftest():
    bad = 0
    for label, rows, want_ok in SELFTESTS:
        got_ok, _ = evaluate(rows)
        mark = "ok  " if got_ok == want_ok else "FAIL"
        print("  %s selftest: %s (expected %s)" % (mark, label, "PASS" if want_ok else "FAIL"))
        if got_ok != want_ok:
            bad = 1
    print("selftest %s" % ("PASSED" if not bad else "FAILED"))
    return bad


def main(argv):
    if len(argv) == 2 and argv[1] == "--selftest":
        return selftest()
    if len(argv) != 2:
        sys.exit("usage: assert-whatsapp-probes.py <results.tsv> | --selftest")
    try:
        rows = parse(argv[1])
    except Exception as exc:                      # noqa: BLE001 — any failure is a failure
        print("::error::could not read %s: %s" % (argv[1], exc))
        return 1
    ok, lines = evaluate(rows)
    for line in lines:
        print(line)
    if not ok:
        print("::error::WhatsApp probe assertions FAILED")
        return 1
    print("All probes matched. Probe J stopped at 503 — every gate passed and "
          "no WhatsApp credentials are configured.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
