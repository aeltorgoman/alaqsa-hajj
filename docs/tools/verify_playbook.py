#!/usr/bin/env python3
"""Structural verification for docs/ENGINEERING_PLAYBOOK.md — the checks M-117 requires.

Read-only. Exits non-zero on any failure.

    python3 docs/tools/verify_playbook.py
"""
import re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PLAYBOOK = os.path.join(ROOT, "docs", "ENGINEERING_PLAYBOOK.md")

fails, notes = [], []


def fail(msg):
    fails.append(msg)


def main():
    text = open(PLAYBOOK, encoding="utf-8").read()
    lines = text.split("\n")

    # ---- 1. table of contents <-> body, both directions -------------------
    toc = set()
    in_toc = False
    for ln in lines:
        if ln.startswith("# Table of Contents"):
            in_toc = True
            continue
        if in_toc and ln.startswith("# Part 1 —"):
            break
        m = re.match(r"^(\d+\.\d+) (.+)$", ln.strip())
        if in_toc and m:
            toc.add(f"{m.group(1)} {m.group(2)}")
    body = set()
    for ln in lines:
        m = re.match(r"^## (\d+\.\d+) (.+)$", ln)
        if m:
            body.add(f"{m.group(1)} {m.group(2)}")
    for s in sorted(toc - body):
        fail(f"TOC lists a section absent from the body: {s}")
    for s in sorted(body - toc):
        fail(f"body has a section absent from the TOC: {s}")
    notes.append(f"TOC/body sections matched both ways: {len(body)}")

    # ---- 2. heading uniqueness -------------------------------------------
    heads = [ln for ln in lines if re.match(r"^#{1,3} ", ln)]
    dupes = {h for h in heads if heads.count(h) > 1}
    for d in sorted(dupes):
        fail(f"duplicate heading: {d}")
    notes.append(f"headings unique: {len(heads)}")

    # ---- 3. rule ids unique, contiguous ----------------------------------
    rules = re.findall(r"\*\*(MUST|SHOULD|GUIDELINE|CONTEXTUAL) `([MSGC]-\d+)`\*\*", text)
    ids = [r[1] for r in rules]
    for i in sorted({i for i in ids if ids.count(i) > 1}):
        fail(f"duplicate rule id in body: {i}")
    # the retired register lives in Appendix A.1; a gap is legitimate only if listed there
    try:
        a1 = text.split("## A.1 Retired identifiers")[1].split("## A.2")[0]
    except IndexError:
        a1 = ""
        fail("Appendix A.1 (retired identifiers register) is missing")
    for pre, lvl in (("M", "MUST"), ("S", "SHOULD"), ("G", "GUIDELINE"), ("C", "CONTEXTUAL")):
        nums = sorted(int(i.split("-")[1]) for l, i in rules if i.startswith(pre + "-"))
        if not nums:
            fail(f"no {lvl} rules found")
            continue
        # Identifiers are stable and never renumbered (M-115). A gap is therefore
        # legitimate once a rule is retired -- but only if Appendix A records it,
        # so a gap can never be an accidental omission.
        retired = set(int(x) for x in re.findall(r"`" + pre + r"-0*(\d+)`", a1))
        gaps = [n for n in range(1, max(nums) + 1)
                if n not in nums and n not in retired]
        if gaps:
            fail(f"{lvl} ids neither defined nor recorded as retired in Appendix A: {gaps}")
        wrong = [i for l, i in rules if i.startswith(pre + "-") and l != lvl]
        if wrong:
            fail(f"{lvl} prefix used with another level: {wrong}")
        notes.append(f"{lvl}: {len(nums)} defined, {len(retired)} retired, none unaccounted")

    # ---- 4. every rule in Appendix A, every MUST in Appendix B -----------
    appA = text.split("# Appendix A")[1].split("# Appendix B")[0]
    appB = text.split("# Appendix B")[1].split("# Appendix C")[0]
    for _lvl, rid in rules:
        if f"`{rid}`" not in appA:
            fail(f"{rid} missing from Appendix A (rule inventory)")
    musts = [rid for lvl, rid in rules if lvl == "MUST"]
    for rid in musts:
        if f"`{rid}`" not in appB:
            fail(f"{rid} missing from Appendix B (MUST index)")
    for rid in re.findall(r"\| `([MSGC]-\d+)` \|", appB):
        if rid not in musts:
            fail(f"Appendix B lists {rid}, which is not a MUST in the body")
    notes.append(f"Appendix A covers {len(rules)} rules; Appendix B covers {len(musts)} MUSTs")

    # ---- 4b. every referenced rule id is defined -------------------------
    defined = set(rid for _l, rid in rules)
    # A.1 names retired ids by definition, so it is not a source of references.
    scan = text.replace(a1, "") if a1 else text
    referenced = set(re.findall(r"`([MSGC]-\d+)`", scan))
    for rid in sorted(referenced - defined):
        fail(f"cross-reference to an undefined rule id: {rid}")
    notes.append(f"cross-references resolved: {len(referenced)} distinct ids, none dangling")

    # ---- 5. every v1.0 section accounted for in Appendix C ---------------
    appC = text.split("# Appendix C")[1].split("# Appendix D")[0]
    listed = {int(m) for m in re.findall(r"^\| (\d{1,2}) \|", appC, re.M)}
    missing = [n for n in range(1, 81) if n not in listed]
    if missing:
        fail(f"Appendix C does not account for v1.0 sections: {missing}")
    notes.append(f"Appendix C accounts for v1.0 §§1-80 ({len(listed)} rows)")
    if "81–86" not in appC:
        fail("Appendix C does not address v1.0 §§81-86")
    if "carry no recovered text" not in appC:
        fail("Appendix C is missing the §§81-86 'not recovered' statement")

    # ---- 6. referenced repository paths resolve --------------------------
    paths = set(re.findall(r"`((?:docs|src|supabase|\.github)/[A-Za-z0-9_./-]+)`", text))
    for p in sorted(paths):
        if p.endswith("/"):
            ok = os.path.isdir(os.path.join(ROOT, p))
        else:
            ok = os.path.exists(os.path.join(ROOT, p))
        if not ok:
            fail(f"referenced path does not exist: {p}")
    notes.append(f"referenced repository paths resolved: {len(paths)}")

    # ---- 7. archives byte-for-byte --------------------------------------
    import hashlib
    expected = {
        "docs/archive/ENGINEERING_PLAYBOOK_v1.0_original.md":
            "a79a1aa6cc70345ec61afc1845ba5f3b8ffa0931b85d8c6627e9248fdc52eac4",
        "docs/archive/ENGINEERING_PLAYBOOK_v1.0_damaged_main.md":
            "2033f364cd73d09386f951c9d43b0bb1b32d4ce5360191820d33b45e1fce9128",
    }
    for rel, want in expected.items():
        got = hashlib.sha256(open(os.path.join(ROOT, rel), "rb").read()).hexdigest()
        if got != want:
            fail(f"archived file changed: {rel}\n    expected {want}\n    got      {got}")
    notes.append("archived v1.0 editions unchanged (sha256)")

    # ---- report ----------------------------------------------------------
    for n in notes:
        print(f"  ok  {n}")
    if fails:
        print()
        for f in fails:
            print(f"FAIL  {f}")
        print(f"\n{len(fails)} failure(s)")
        return 1
    print("\nall structural checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
