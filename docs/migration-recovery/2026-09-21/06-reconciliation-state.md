# 06 — Migration history state BEFORE remediation

Captured 2026-09-21 at `main` @ `21cb1de`. Read-only.

## Counts

| Metric | Value |
|---|---|
| Repository migration files | **36** |
| Remote ledger rows | **45** |
| Exact version matches (repo version present in ledger) | **7** |
| Repository-only versions (absent from ledger) | **29** |
| Remote-only versions (no repo file of that version) | **38** |

The 7 exact matches: `20260101000000`, `20260802021913`, `20260802021944`, `20260802022009`,
`20260802022040`, `20260802022310`, `20260919120000`.

## Breakdown of the 29 repository-only versions

| Class | Count | Meaning |
|---|---|---|
| Byte-identical to a ledger row under a different version | 1 | `20260920120000` ↔ `20260920115407` |
| Same **name** in the ledger under a different version (apply-time alias) | 20 | dashboard/MCP apply re-stamped the timestamp |
| No ledger name at all, but effects confirmed live | 7 | `20260806110000`, `20260827120000`, `20260829120000`, `20260909120000`, `20260909180000`, `20260910120000`, `20260911120000` |
| **No ledger name, effects NOT present** | **1** | **`20260809100000_s9_pin_search_path`** |

## `20260809100000_s9_pin_search_path` — CONFIRMED NOT APPLIED

**Not represented as applied in the ledger, and its intended hardening is not present in the database.**

The migration issues twelve `ALTER FUNCTION … SET search_path = public, pg_temp` statements.
Measured live state (see `04-function-security-before.json`):

- Of 36 `SECURITY DEFINER` functions in `public`, **7 carry `search_path=public` with `pg_temp` unmentioned**.
- Those 7 are exactly the migration's targets that **still bear their original signature**:
  `active_season_id()`, `announcement_audience(text, bigint[])`, `delete_empty_financial_group()`,
  `push_enabled_passengers()`, `reject_write_closed_season()`,
  `reject_write_closed_season_derived()`, `resolve_pilgrim_id(text,int,int,int)`.
- The five targets that **do** carry `public, pg_temp` all have **changed signatures**
  (`close_season`, `delete_season`, `mark_pilgrim_notification_read`, `register_pilgrim_push`,
  `unregister_pilgrim_push`) — they were pinned by later rewrites, not by this migration.

There is no reading of this evidence in which the migration ran.

Additionally, the file **cannot be re-run as written**: it names `close_season(text,text)`,
`delete_season(bigint)`, `create_user`, `update_user` and other signatures that no longer exist,
so `ALTER FUNCTION` would fail with `42883`.

**NOT REPAIRED in this checkpoint. Must not be marked applied.** Its permanent replacement is
Checkpoint 2 (a new forward migration targeting the signatures that exist today).

## Additional unhardened surface found (not part of the original migration)

`room_type_capacity(p_type text)` — `SECURITY INVOKER`, **no `search_path` at all**, and
`EXECUTE` granted to **PUBLIC** (`=X/postgres`). Lower risk than a `SECURITY DEFINER` function,
but in scope for Checkpoint 2.
