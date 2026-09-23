# Checkpoint 5 — ledger cutover candidate

**Nothing here is active.** This directory does not sit on the Supabase CLI's execution
path: the CLI reads `supabase/migrations/` and nothing else. Merging this directory cannot
change which migrations run, anywhere.

## What the cutover would do

| | before | after |
|---|---|---|
| `supabase/migrations/` | 37 historical files | 46 ledger anchors + 1 V1 baseline |
| `supabase/migrations-archive/` | — | the 37 historical files, `git mv`'d, byte-identical |
| remote ledger | 46 rows | 47 rows — one added, none altered |
| production schema | — | **unchanged** |

## Why anchors exist

The Supabase CLI matches local migration files to remote ledger rows by **version string
alone** — proven, not assumed: `DXe()` in CLI 2.117.0 compares `remoteVersion === localVersion`
where the local version comes from the filename regex `/^([0-9]+)_(.*)\.sql$/`. Migration SQL
is never hashed or compared. A remote version with no local file is a hard conflict
(`missing-local`), which is why all 46 must exist locally.

An anchor therefore needs nothing but the right *name*. Each one is comments only. **No SQL may
ever be added to an anchor**: anchors run before the baseline on every fresh rebuild, against an
empty database, and `verify-cutover.py` fails the build if any anchor contains executable SQL.

## Contents

| Path | Purpose |
|---|---|
| `anchors/` | the 46 no-op ledger anchors, one per captured remote ledger version |
| `manifest.json` | baseline version and SHA-256, the 46 versions, provenance run IDs |
| `tools/assemble-cutover.sh` | materialises the proposed `supabase/migrations/` tree |
| `tools/verify-cutover.py` | fail-closed structural checks (46↔46, no duplicates, anchors are no-ops, baseline hash, archive integrity) |
| `tools/seed-simulated-ledger.py` | rebuilds the captured 46-row ledger in a throwaway database, from the Checkpoint 1 evidence |

The baseline is **not copied into this directory**. `assemble-cutover.sh` copies it from
`supabase/baseline/v1/v1_baseline.sql` and asserts its SHA-256, so the migration body is
byte-identical to the Checkpoint 4 artifact by construction and there is no second copy to drift.

## The live reconciliation — GATED, NOT AUTHORISED

One command, and it is not authorised by this directory or by any document in this repository:

```
supabase migration repair --status applied 20260922120000 --linked
```

It runs exactly one statement against the ledger:
`INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES($1,$2,$3)
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, statements = EXCLUDED.statements`
— inside `BEGIN`/`COMMIT`, with `ROLLBACK` on error. **It executes no migration SQL.**

### Prohibited variants

| Command | Why |
|---|---|
| `supabase migration repair --status applied` *(no version)* | prompts to repair the **entire** history, which **`TRUNCATE`s** the ledger and reinserts from local files — every preserved remote payload would be destroyed |
| `supabase migration repair --status applied <historical version>` | the `ON CONFLICT DO UPDATE` **overwrites** that row's preserved `statements`; verified experimentally |
| `supabase migration repair --status reverted …` | `DELETE FROM … WHERE version = ANY($1)` — removes ledger rows |
| `supabase db push --linked` before the repair | would **execute** the baseline against production |

The first three destroy Checkpoint 1 evidence *in the ledger*. The evidence survives in
`docs/migration-recovery/2026-09-21/final/` either way — that is why Checkpoint 1 came first.
