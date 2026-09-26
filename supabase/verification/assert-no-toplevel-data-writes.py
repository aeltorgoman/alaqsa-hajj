#!/usr/bin/env python3
"""يمنع ترحيلةً تُغيّر صفوفَ تطبيقٍ قائمةً **لحظةَ التطبيق**.

والفرقُ الذي أخفق فيه grep السطريّ: عبارةُ `insert into public.payments`
داخلَ جسمِ دالّةٍ ليست كتابةً لحظةَ التطبيق — إنّها **تعريفُ سلوكٍ**
يُنفَّذ لاحقاً بنداءٍ مأذونٍ، وهو المعمارُ المعتمَدُ بعينه. أمّا العبارةُ
نفسُها في المستوى الأعلى فتُنفَّذ الآن على بياناتٍ حيّة.

فتُطرَح أوّلاً كلُّ الكتلِ المُقتبَسةِ بعلامةِ الدولار ($$ … $$ و
$tag$ … $tag$) — وهي أجسامُ الدالّاتِ وكتلُ DO — ثُمّ يُفحَص الباقي.

    assert-no-toplevel-data-writes.py <file> [<file> …]
    assert-no-toplevel-data-writes.py --selftest
"""
import re
import sys

TABLES = r"(payments|passengers|seasons|custom_charges|financial_groups|financial_group_members)"
VERB = re.compile(
    r"\b(insert\s+into|update|delete\s+from|truncate)\s+(?:public\.)?" + TABLES + r"\b",
    re.IGNORECASE,
)
DOLLAR_OPEN = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)?\$")


def strip_dollar_quoted(sql: str) -> str:
    """يُبدل كلَّ كتلةٍ مُقتبَسةٍ بالدولار بأسطرٍ فارغةٍ بعددِها،
    فتبقى أرقامُ الأسطرِ صحيحةً في التقرير."""
    out, i = [], 0
    while True:
        m = DOLLAR_OPEN.search(sql, i)
        if not m:
            out.append(sql[i:])
            break
        out.append(sql[i:m.start()])
        tag = m.group(0)
        close = sql.find(tag, m.end())
        if close == -1:
            # اقتباسٌ غيرُ مُغلَق: يُعَدّ الباقي كلُّه جسماً، ولا يُفحَص
            out.append("\n" * sql.count("\n", m.start()))
            break
        out.append("\n" * sql.count("\n", m.start(), close + len(tag)))
        i = close + len(tag)
    return "".join(out)


def offenders(sql: str):
    stripped = strip_dollar_quoted(sql)
    found = []
    for n, line in enumerate(stripped.splitlines(), 1):
        bare = re.sub(r"--.*$", "", line)
        if VERB.search(bare):
            found.append((n, line.strip()))
    return found


def selftest() -> int:
    bad = 0

    def case(name, sql, expect):
        nonlocal bad
        got = len(offenders(sql)) > 0
        ok = got == expect
        print(("ok   " if ok else "FAIL ") + name + f"  (flagged={got}, expected={expect})")
        if not ok:
            bad = 1

    case("top-level update IS caught",
         "update public.payments set amount = 0;", True)
    case("top-level insert IS caught",
         "insert into public.payments (amount) values (1);", True)
    case("top-level delete IS caught",
         "delete from public.passengers where id = 1;", True)
    case("top-level truncate IS caught",
         "truncate public.seasons;", True)
    case("unqualified table name IS caught",
         "update payments set amount = 0;", True)
    case("inside $$ function body is NOT caught",
         "create function f() returns void language plpgsql as $$\n"
         "begin\n  insert into public.payments (amount) values (1);\nend;\n$$;", False)
    case("inside $tag$ body is NOT caught",
         "create function f() returns void language plpgsql as $fn$\n"
         "begin\n  delete from public.payments where id = 1;\nend;\n$fn$;", False)
    case("inside DO block is NOT caught",
         "do $$\nbegin\n  update public.seasons set name = 'x';\nend;\n$$;", False)
    case("two bodies in one file, both skipped",
         "create function a() returns void language plpgsql as $$\n"
         "begin update public.payments set amount=1; end; $$;\n"
         "create function b() returns void language plpgsql as $b$\n"
         "begin delete from public.passengers; end; $b$;", False)
    case("a top-level write AFTER a body is still caught",
         "create function a() returns void language plpgsql as $$\n"
         "begin update public.payments set amount=1; end; $$;\n"
         "delete from public.payments;", True)
    case("DDL is not a data write",
         "alter table public.payments add column x int;", False)
    case("commented-out write is not caught",
         "-- update public.payments set amount = 0;", False)
    case("an unrelated table is not caught",
         "insert into public.company_assets (asset_key) values ('x');", False)
    print("SELFTEST: " + ("PASS" if bad == 0 else "FAIL"))
    return bad


def main(argv):
    if len(argv) == 2 and argv[1] == "--selftest":
        return selftest()
    if len(argv) < 2:
        return int(bool(sys.stderr.write(
            "usage: assert-no-toplevel-data-writes.py <file> [<file> …] | --selftest\n")))
    bad = 0
    for path in argv[1:]:
        with open(path, encoding="utf-8") as fh:
            found = offenders(fh.read())
        if found:
            bad = 1
            for n, text in found:
                print(f"::error::{path}:{n}: top-level data write: {text}")
        else:
            print(f"ok   {path}: no top-level data write on an application table")
    if bad:
        print("::error::a migration would change existing application rows at apply time")
    return bad


if __name__ == "__main__":
    sys.exit(main(sys.argv))
