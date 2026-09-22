# Checkpoint 5 — repository cutover

Status: **repository side prepared; the live ledger reconciliation has NOT been performed.**

This change moves the active Supabase CLI migration path from the historical migration set to
the proven anchor + V1 baseline model. It touches the repository only. No production write of any
kind was made, and nothing here authorises one.

## What changed

| | before | after |
|---|---|---|
| `supabase/migrations/` | 37 historical files | **46 ledger anchors + 1 V1 baseline** = 47 |
| `supabase/migrations-archive/` | — | **the same 37 files, `git mv`'d, byte-identical** |
| production ledger | 46 rows, latest `20260921141422` | **unchanged** |
| production schema / data / security | — | **unchanged** |

No historical migration was deleted, renamed or edited. The archive is outside the CLI's
execution path: the CLI reads `supabase/migrations/` and nothing else.

## How the active set was produced

`supabase/cutover-candidate/tools/assemble-cutover.sh` — the tooling proven in Checkpoint 5
Run #3 — not by hand. It copies the 46 anchors and the canonical baseline from
`supabase/baseline/v1/v1_baseline.sql`, asserting the SHA-256 both before and after the copy, so
the installed migration is byte-identical to the Checkpoint 4 artifact by construction.

| | |
|---|---|
| Canonical baseline SHA-256 | `80fbdb11640b4695a184f62a50573e47efc2c2a0dcc69abacce3cccf3a4e6350` |
| Installed `20260922120000_v1_baseline.sql` | same hash, verified after installation |
| Archive aggregate (sha256 over the sorted per-file digests) | `e9e27f73c2c99a02dd5832b7d882cf0b84c9c31c782416adaac92a5892efe7e6`, identical before and after the move |

## Local verification performed

- **Archive:** 37 files, aggregate digest identical before and after — 0 lost, 0 modified.
- **Active set:** 47 files; 46 anchor versions equal the 46 captured production ledger versions
  exactly (0 missing, 0 unexpected, 0 duplicates); every anchor still contains **no executable
  SQL**; the baseline version sorts after every anchor.
- **Reconciliation rehearsal**, pinned CLI 2.117.0 against a **local** database seeded with the
  exact 46 captured ledger rows, run from this very working tree:

  | | |
  |---|---|
  | pending before | exactly `20260922120000_v1_baseline.sql` |
  | ledger rows | 46 → 47 |
  | the 46 existing rows | unchanged |
  | schema objects | 0 → 0 — the baseline was stored, not executed |
  | pending after | none; the database reports up to date |

- `verify-cutover.py` and `assert-reconciliation.py`: **PASS**.

## Workflow assertions de-hardcoded

Both proof workflows asserted `supabase/migrations` held exactly **37** files — once at toolchain
validation and once when restoring the directory afterwards. This cutover makes that 47, so all
four assertions would have failed. They now read the expected count from the repository index and
carry it to the restore step, which is correct before and after the cutover and needs no further
maintenance. The integrity check itself is unchanged and still fails closed.

## What has NOT happened

- **No live ledger write.** Production still has 46 rows, latest `20260921141422`, and
  `20260922120000` is absent.
- The live reconciliation — `supabase migration repair --status applied 20260922120000 --linked`
  — remains **ungated by this change** and unperformed.
- No execution path for that write exists in this repository. Creating one is a separate,
  separately reviewed step.
- Checkpoint 5 is **not closed**.

## Until the live reconciliation happens

Between merging this and performing the reconciliation, the repository and the production ledger
disagree by design: the CLI will see one pending migration, the baseline. In that window
**`supabase db push --linked` must not be run** — it would execute the baseline against a
database that already has that schema. The reconciliation is what closes the window.

---

## The live reconciliation workflow

`.github/workflows/checkpoint5-live-reconciliation.yml` is the **only** workflow in this
repository permitted to write to the production project, and it may perform exactly **one**
mutation, hard-coded with no dynamic version and no fallback:

```
supabase migration repair --status applied 20260922120000 --linked
```

An audit of the file finds **exactly one** production-mutating command. Every other remote
command is `db dump --linked` (read-only `pg_dump`), `db push --dry-run --linked` (plans, applies
nothing), or `link --project-ref` (local CLI state). All **12** remote `psql` calls carry the
in-band `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`, and a SQLSTATE 25006 control
proves the server refuses writes in those sessions before any gate query runs.

### Gates, all before the write

1. typed confirmation `RECONCILE-20260922120000`, plus both secrets present
2. CLI is exactly 2.117.0
3. active path: 47 files, 46 anchors, 1 baseline; active and canonical baseline SHA-256 both
   `80fbdb11…e6350`; `verify-cutover.py` PASS
4. project ref is `zkucwcnclbfvukhdqhgc`, hard-coded, not an input; the db user must belong to it
   and the host must be a Supabase session pooler
5. gate sessions proven read-only
6. live ledger: exactly 46 rows, latest `20260921141422`, `20260922120000` absent
7. the 46 rows match the preserved Checkpoint 1 evidence — versions, names, payload hashes, byte
   lengths, and the NULL-statements row
8. BEFORE security fingerprint and BEFORE structural dump captured
9. the plan shows exactly one pending migration, and it is the baseline

### After the write

Ledger 46 → 47 · baseline present exactly once · latest is the baseline · the 46 originals
re-verified against the evidence · security fingerprint BEFORE vs AFTER with **0 unresolved**
across ACLs, grants, default privileges, RLS, policies, function security mode, `search_path`,
EXECUTE grants and storage · structural comparison unchanged · the baseline SQL is certified as
**not executed** · the plan shows zero pending.

### Safety properties

- **No automatic rollback.** On post-write failure the run fails, preserves evidence and escalates.
- **Double-run safe.** After success the ledger holds 47 rows and the baseline exists, so gate 6
  fails and a second run stops before mutating anything. `concurrency` prevents overlap and never
  cancels a run mid-write.
- **Least privilege.** `workflow_dispatch` only, `permissions: contents: read`, no `GITHUB_TOKEN`
  use, no repository write path.
- Evidence is secret-scanned before upload; credentials are never printed.
