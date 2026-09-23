# Migration Recovery Evidence — 2026-09-21

Checkpoint 1 of the approved **Strategy E** permanent migration architecture
(V1 baseline + archive-preserved history + Supabase CLI for all future migrations).

**This directory is evidence, not code.** Nothing here is a migration. Nothing here may be
moved into `supabase/migrations/`. It exists so that any later remediation step can be undone.

Capture was **strictly read-only** against Supabase: every call was a `SELECT`. No row was
written, no migration history was altered, no migration was executed, nothing was deployed.

## Contents

| File | Purpose |
|---|---|
| `01-baseline.md` | Git branch/SHA/clean status, project ref, repo + ledger counts, ordered list of the 36 repository migrations |
| `02-ledger-export.json` | All **45** ledger rows: version, name, created_by, idempotency_key, rollback, statement count, byte length, **SHA-256 of the executed SQL** |
| `03-remote-only-sql.md` | The two migrations whose SQL existed only in the ledger — preserved, hash-verified, with their status and why no migration file is being created |
| `04-function-security-before.json` | All 43 `public` functions: signature, DEFINER/INVOKER, owner, `proconfig`, EXECUTE ACL, trigger usage. **BEFORE state for Checkpoint 2.** |
| `05-schema-security-fingerprint.json` | Counts + canonical SHA-256 fingerprints of columns, constraints, indexes, triggers, policies, table ACLs, default privileges, extensions, storage buckets and storage policies |
| `06-reconciliation-state.md` | Repo/ledger counts, the classification of all 29 repository-only versions, and the evidence that `s9_pin_search_path` was never applied |
| `raw/` | The preserved SQL payloads and the ledger metadata they were built from |

## Integrity method

Every preserved SQL payload was transported as base64, decoded locally, and checked against a
SHA-256 computed **by the database** before being written to disk. Hashes are recorded in
`02-ledger-export.json` and `03-remote-only-sql.md`, so any file here can be re-verified at any
time against the live ledger while it still exists.

## CLOSED — the full ledger SQL export is now complete

> **Superseded 2026-09-22.** The limitation described below was real when this directory was
> written. It is closed. `final/` holds the complete capture: **46 ledger rows, 45 byte-exact
> statement payloads, 1 explained NULL row, 0 unexplained missing payloads**, every payload
> SHA-256 verified. See `final/RECONCILIATION.md`. The text below is kept as the historical
> record of what was outstanding, not as current status.

### Historical note — the export was PARTIAL when first captured

`statements[1]` is preserved **byte-exactly for 3 of the 44** rows that carry SQL:

| Version | Why it is preserved |
|---|---|
| `20260818103356` | Remote-only — transcribed via base64, SHA-256 verified |
| `20260822224856` | Remote-only — transcribed via base64, SHA-256 verified |
| `20260920115407` | Byte-identical to `supabase/migrations/20260920120000_…sql`; SHA-256 `ce219c28…` matches on both sides, so the repository file *is* the preserved copy |

For the remaining **41** rows this capture records version, name, `created_by`, byte length and
**SHA-256** — enough to prove later whether any given text is the one that ran, but not the text itself.

**Why:** this environment has no direct Postgres egress (the agent proxy refuses `CONNECT` to
`*.supabase.co`), so the only channel is the MCP SQL tool. Reproducing 186 082 bytes through it
requires hand-transcribing ~250 000 base64 characters, which introduces exactly the corruption
risk this checkpoint exists to prevent.

**How to close it** — from any machine with database credentials, before Checkpoint 5:

```
pg_dump --schema=supabase_migrations --data-only --no-owner --no-privileges "$DATABASE_URL" \
  > docs/migration-recovery/2026-09-21/raw/schema_migrations.sql
```

Then verify: 45 rows, and each row's `statements[1]` SHA-256 equal to the value recorded in
`02-ledger-export.json`.

Checkpoint 5 is the only step that writes to the ledger. **This gap must be closed before Checkpoint 5.**
Checkpoints 2–4 do not touch `schema_migrations` and are not blocked by it.

## No secrets

These artifacts contain schema DDL, catalog metadata and migration SQL only. They contain no
password, token, service-role key, JWT, connection string or user credential. `created_by` holds
the project owner's e-mail address as recorded by Supabase — it is ledger metadata, not a credential.
