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
