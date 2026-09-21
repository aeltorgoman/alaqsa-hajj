# 03 — Remote-only migrations (SQL preserved and hash-verified)

Two migrations were applied to the database but have **no repository file of any name**.
Before this capture their SQL existed **only** inside `supabase_migrations.schema_migrations.statements`.

Both are now preserved as files under `raw/`. Each was transported as base64, decoded locally, and
verified against the server-computed SHA-256 **before** being written. A mismatch would have aborted.

| Remote version | Name | Bytes | SHA-256 | Verified | Preserved file |
|---|---|---|---|---|---|
| `20260818103356` | s1_revoke_trigger_fn_execute | **419** | `ee3fb7a86281bbb5468fa295b287a1f68d02dfd98c682932b9541ff6a0d1f6ba` | ✅ exact | `raw/stmt_20260818103356_s1_revoke_trigger_fn_execute.sql` |
| `20260822224856` | s8_audit_log_delete_season_comment_fidelity | **5 179** | `3ff23d8a144e661c0477ec3bdf9daa026071668ec048ca06b1a52b972a606655` | ✅ exact | `raw/stmt_20260822224856_s8_audit_log_delete_season_comment_fidelity.sql` |

## Status and intent

These are **evidence artifacts, not migrations.** They live under `docs/migration-recovery/`,
deliberately **outside** `supabase/migrations/`, and must not be moved into it.

Per the approved architecture (§5 of the Permanent Migration Architecture Recommendation):
creating dated migration files for them now would imply an August authorship they never had —
manufactured history. Their effects are already live and will be captured by the V1 baseline
in Checkpoint 4. No repository migration file is to be created from them.

## Content summary (for orientation only — the files are authoritative)

- `20260818103356` — revokes `EXECUTE` on the trigger function `public.passengers_assign_sort_order()`
  from `public, anon, authenticated`, so PostgREST stops publishing it under `/rpc/`.
- `20260822224856` — restores `public.delete_season(bigint, uuid)` to the byte-exact reviewed body
  from PR #103, re-adding 11 explanatory comment lines omitted by the previously applied body.
  Code-only fingerprint was already identical; no behavioural change. Ends by re-revoking
  `EXECUTE` from `public, anon, authenticated` and granting it to `service_role`.
