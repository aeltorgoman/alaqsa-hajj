# Final ledger evidence — reconciliation

The eight files beside this one are the **exact bytes** of the `migration-ledger-evidence`
artifact. Nothing was normalised, re-encoded or reconstructed. This file is the analysis; those
files are the evidence.

## Provenance and integrity

| | |
|---|---|
| Run | [`35724787367`](https://github.com/aeltorgoman/alaqsa-hajj/actions/runs/35724787367) — SUCCESS |
| Source `main` SHA | `771695a0b29b4a7473a3b14c02f9ba4ee7cea30a` |
| Artifact | `migration-ledger-evidence`, ID `10693006611` |
| Artifact ZIP SHA-256 | `f0aafc1929f132836674f71987170d45a6b704bee2ee777fd9cf3c287711e349` — **verified** |

Three independent integrity checks, all recomputed here rather than taken on trust:

1. **ZIP digest** matches the published value exactly.
2. **`SHA256SUMS`** verifies against the three files it covers (`sha256sum -c`, all OK).
3. **`overall-evidence.sha256`** = `23e2d0e5…a2b598` is reproduced exactly by the rule the
   capture workflow uses — `sha256sum ledger-evidence/{ledger-metadata,statement-payloads}.jsonl
   | sha256sum`.
4. **Every one of the 45 payloads** was base64-decoded and re-hashed locally: **45 verified, 0
   mismatches.**

Remote access was read-only and proved so, not asserted (`readonly.txt`):

```
default_transaction_read_only=on
ERROR:  25006: cannot execute CREATE TABLE in a read-only transaction
```

The ledger was unchanged by the capture (`ledger-unchanged.txt`): `before=46|20260921141422`,
`after=46|20260921141422`.

## Ledger reconciliation

| Claim | Result | How it was checked |
|---|---|---|
| Total ledger rows = **46** | ✅ | `ledger-metadata.jsonl` has 46 records |
| Rows with available statement payloads = **45** | ✅ | 45 records in `statement-payloads.jsonl`, one per row |
| NULL-statement rows = **1** | ✅ | `20260101000000 baseline_schema`, `statements_is_null: true` |
| Unexplained available payloads missing = **0** | ✅ | every non-NULL row has a payload; no payload lacks a row; every `statement_count` equals its payload element count |
| Latest ledger version = **20260921141422** | ✅ | max version in the metadata; matches `ledger-state.txt` |

The single NULL row is the historical `baseline_schema` entry. Its `statements` column is NULL in
the ledger — there is no payload to capture, so it is **explained, not missing**.

## Reconciliation with the earlier partial capture

`02-ledger-export.json` recorded 45 rows with byte length and SHA-256 but, for 41 of them, no SQL
text. That gap is now closed.

| Check | Result |
|---|---|
| Earlier-recorded SHA-256 and byte length vs the final capture | **44 matched, 0 mismatched** |
| The 45th earlier row | `20260101000000` — the NULL-statements row, correctly absent from the payload file |

**The two remote-only migrations are preserved and byte-identical** to the copies already in
`../raw/`:

| Version | Name | Bytes | SHA-256 | Bytes identical |
|---|---|---|---|---|
| `20260818103356` | `s1_revoke_trigger_fn_execute` | 419 | `ee3fb7a8…d1f6ba` | ✅ |
| `20260822224856` | `s8_audit_log_delete_season_comment_fidelity` | 5 179 | `3ff23d8a…a606655` | ✅ |

**The PR #123 remote alias relationship holds.** PR #123 ("PR B — Legacy cleanup: drop the
`company_config` compatibility layer", merged `d9595da3`) contributed
`supabase/migrations/20260920120000_drop_company_config_legacy_columns.sql`. The dashboard/MCP
apply re-stamped it into the ledger as version `20260920115407`. The repository file and the
captured ledger payload are **byte-identical** — 23 424 bytes, SHA-256 `ce219c28…5d40`. Until now
this could only be argued from a hash recorded on both sides; it is now a direct byte comparison
of the preserved payload.

### New information the full capture makes available

With all 45 bodies preserved, repository files and their ledger name-aliases can be compared at
byte level for the first time. Against the current 37 repository migrations:

| | Count |
|---|---|
| Exact version matches (repo version present in the ledger) | 7 |
| Repository-only versions | 30 |
| — of those, the same **name** appears in the ledger under a different version | 22 |
| — of those, no ledger name at all | 8 |
| Name-aliases whose repository file is **byte-identical** to the ledger payload | **1** (the PR #123 pair) |
| Name-aliases whose repository file **differs** from the applied payload | **21** |

This contradicts nothing previously recorded: `06-reconciliation-state.md` claimed a *name* alias
for those rows, never byte identity. It is stated here because Checkpoint 5 planning needs it —
21 aliases are not simple re-stampings of the repository text, and each will have to be judged on
its own captured bytes. That judgement is **not** made here and **nothing is repaired**.

The counts have moved since `06-reconciliation-state.md` (36 repository files / 45 ledger rows at
`21cb1de`) for one reason only: the Checkpoint 2 migration. The repository file
`20260921120000_s9_pin_search_path_forward.sql` was applied and re-stamped into the ledger as
`20260921141422 s9_pin_search_path_forward`, adding one repository file and one ledger row.

## Verdict

Zero unexplained available payloads remain. Every payload the ledger can yield is preserved
byte-exactly and hash-verified. **Checkpoint 1 is CLOSED.**

No ledger row was written, no migration was repaired, no migration was executed, and nothing here
authorises any of those.
