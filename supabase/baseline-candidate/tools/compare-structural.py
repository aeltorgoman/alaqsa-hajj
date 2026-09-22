#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مقارنُ البنية — Level 1 (structural) comparator.

Compares two `pg_dump --schema-only` outputs statement by statement and
classifies every difference, instead of recording `diff -u` output and
reporting success anyway.

A raw `diff -u` between two pg_dump outputs is dominated by differences
that carry no meaning:

  A  dump metadata     - "Dumped from database version 17.6" vs the
                         local server's version, the pg_dump version,
                         the generation date.
  B  comments/blanks   - `--` comments and blank lines.
  C  statement order   - pg_dump groups by object class; two servers
                         can emit the same statements in a different
                         order without differing at all.

and the differences that do carry meaning:

  D  privilege/owner   - GRANT, REVOKE, ALTER ... OWNER TO, ALTER
                         DEFAULT PRIVILEGES present on one side only.
  E  schema object     - any other statement present on one side only.
  F  unclassified      - a statement this tool cannot parse.

A/B are removed by canonicalisation and counted. C is reported and
tolerated: within a schema-only dump the emission order is not
semantic, and Level 2 plus a successful apply cover what order would
have told us. D/E/F fail the run.
"""

import re
import sys
from collections import Counter

# Statements whose presence or absence is a privilege decision.
PRIVILEGE_RE = re.compile(
    r"^\s*(GRANT|REVOKE|ALTER\s+DEFAULT\s+PRIVILEGES|ALTER\s+\w+\s+.*\bOWNER\s+TO\b)",
    re.IGNORECASE | re.DOTALL)

# Session setup pg_dump emits; identical in intent on both sides, and
# already asserted elsewhere (the candidate guard checks search_path).
SETTING_RE = re.compile(r"^\s*(SET|SELECT\s+pg_catalog\.set_config)\b", re.IGNORECASE)


def split_statements(sql):
    """Split a pg_dump script into statements.

    Dollar-quoting, single-quoted strings, double-quoted identifiers,
    `--` line comments and `/* */` block comments are all respected, so
    a `;` inside a function body does not split a statement and a
    semicolon inside a comment does not either.
    """
    out, buf, i, n = [], [], 0, len(sql)
    while i < n:
        ch = sql[i]
        if ch == "-" and sql.startswith("--", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j + 1
            continue
        if ch == "/" and sql.startswith("/*", i):
            depth, i = 1, i + 2
            while i < n and depth:
                if sql.startswith("/*", i):
                    depth, i = depth + 1, i + 2
                elif sql.startswith("*/", i):
                    depth, i = depth - 1, i + 2
                else:
                    i += 1
            continue
        if ch == "'":
            buf.append(ch)
            i += 1
            while i < n:
                if sql[i] == "'" and sql.startswith("''", i):
                    buf.append("''")
                    i += 2
                    continue
                buf.append(sql[i])
                if sql[i] == "'":
                    i += 1
                    break
                i += 1
            continue
        if ch == '"':
            buf.append(ch)
            i += 1
            while i < n:
                buf.append(sql[i])
                if sql[i] == '"':
                    i += 1
                    break
                i += 1
            continue
        if ch == "$":
            m = re.match(r"\$[A-Za-z_\u0080-￿0-9]*\$", sql[i:])
            if m:
                tag = m.group(0)
                end = sql.find(tag, i + len(tag))
                end = n if end < 0 else end + len(tag)
                buf.append(sql[i:end])
                i = end
                continue
        if ch == ";":
            out.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    if "".join(buf).strip():
        out.append("".join(buf))
    return out


def normalise(stmt):
    """Collapse whitespace; keep everything else byte for byte."""
    return re.sub(r"\s+", " ", stmt).strip()


def classify(stmt):
    if PRIVILEGE_RE.match(stmt):
        return "D"
    if not stmt:
        return "F"
    return "E"


def load(path):
    with open(path, encoding="utf-8") as fh:
        raw = fh.read()
    statements = [normalise(s) for s in split_statements(raw)]
    kept, dropped_settings = [], 0
    for s in statements:
        if not s:
            continue
        if SETTING_RE.match(s):
            dropped_settings += 1
            continue
        kept.append(s)
    lines = raw.splitlines()
    noise = sum(1 for l in lines if not l.strip() or l.lstrip().startswith("--"))
    return kept, noise, dropped_settings


def main(argv):
    if len(argv) < 3:
        sys.exit("usage: compare-structural.py REFERENCE CANDIDATE [--max-show N]")
    ref_path, cand_path = argv[1], argv[2]
    max_show = 30
    rest = argv[3:]
    while rest:
        flag = rest.pop(0)
        if flag == "--max-show":
            max_show = int(rest.pop(0))
        else:
            sys.exit("unknown option: %s" % flag)

    ref, ref_noise, ref_set = load(ref_path)
    cand, cand_noise, cand_set = load(cand_path)

    print("== Level 1 (structural) ==")
    print("reference: %s (%d statements)" % (ref_path, len(ref)))
    print("candidate: %s (%d statements)" % (cand_path, len(cand)))
    print("A dump metadata / B comments+blank lines ignored: %d reference, %d candidate lines"
          % (ref_noise, cand_noise))
    print("  session SET / set_config statements ignored: %d reference, %d candidate"
          % (ref_set, cand_set))

    if not ref:
        print("::error::Level 1 reference dump contains no statements - capture failed")
        return 1

    only_ref = Counter(ref) - Counter(cand)
    only_cand = Counter(cand) - Counter(ref)

    if not only_ref and not only_cand:
        if ref != cand:
            print("C statement order differs; the statement multisets are identical.")
        print("Level 1 PASS - both dumps carry exactly the same statements.")
        return 0

    diffs = ([("-", s) for s, n in sorted(only_ref.items()) for _ in range(n)] +
             [("+", s) for s, n in sorted(only_cand.items()) for _ in range(n)])
    by_class = Counter(classify(s) for _, s in diffs)

    print("D privilege/ownership differences: %d" % by_class.get("D", 0))
    print("E schema object differences:       %d" % by_class.get("E", 0))
    print("F unclassified:                    %d" % by_class.get("F", 0))
    print("")
    print("--- differing statements (- = reference only, + = candidate only) ---")
    for i, (sign, stmt) in enumerate(diffs):
        if i < max_show:
            print("%s[%s] %s" % (sign, classify(stmt), stmt[:400]))
        elif i == max_show:
            print("  ... %d further statements suppressed; full set is in the artifact"
                  % (len(diffs) - max_show))
    print("")
    print("::error::Level 1 FAIL - %d statement(s) are present on only one side. "
          "The baseline candidate and the database rebuilt from it are not "
          "structurally identical." % len(diffs))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
