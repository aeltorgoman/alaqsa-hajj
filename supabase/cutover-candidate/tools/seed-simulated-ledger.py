#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
بذرةُ سجلٍّ محاكٍ — emit SQL that recreates the CAPTURED remote ledger
in a throwaway local database, so the one reconciliation command can be
rehearsed without ever addressing the live project.

Source of truth is the Checkpoint 1 evidence, byte for byte:
docs/migration-recovery/2026-09-21/final/. Nothing is reconstructed
from memory, and the NULL-statements row stays NULL.

Writes SQL to stdout. It never connects to anything.
"""
import base64
import io
import json
import os
import sys

E = os.path.join("docs", "migration-recovery", "2026-09-21", "final")


def lit(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "''") + "'"


def main(argv):
    root = argv[1] if len(argv) > 1 else "."
    base = os.path.join(root, E)
    meta = [json.loads(l) for l in io.open(os.path.join(base, "ledger-metadata.jsonl"),
                                           encoding="utf-8") if l.strip()]
    pay = {}
    for l in io.open(os.path.join(base, "statement-payloads.jsonl"), encoding="utf-8"):
        if l.strip():
            d = json.loads(l)
            pay.setdefault(d["version"], []).append(d)
    meta.sort(key=lambda m: m["version"])

    out = sys.stdout
    out.write("-- generated from the Checkpoint 1 evidence; do not edit\n")
    out.write("create schema if not exists supabase_migrations;\n")
    out.write("create table if not exists supabase_migrations.schema_migrations "
              "(version text not null primary key);\n")
    out.write("alter table supabase_migrations.schema_migrations "
              "add column if not exists statements text[];\n")
    out.write("alter table supabase_migrations.schema_migrations "
              "add column if not exists name text;\n")
    for m in meta:
        v, n = m["version"], m["name"]
        if m.get("statements_is_null"):
            st = "null"
        else:
            ps = sorted(pay.get(v, []), key=lambda d: d["ordinal"])
            st = "array[" + ",".join(
                "E" + lit(base64.b64decode(p["base64"]).decode("utf-8")) for p in ps
            ) + "]::text[]"
        out.write("insert into supabase_migrations.schema_migrations(version,name,statements) "
                  "values(%s,%s,%s);\n" % (lit(v), lit(n), st))
    sys.stderr.write("seeded %d ledger rows\n" % len(meta))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
