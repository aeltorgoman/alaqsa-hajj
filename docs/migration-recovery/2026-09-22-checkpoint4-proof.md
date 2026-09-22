# Checkpoint 4 — V1 Baseline Proof Closure

Status: **PROVEN / pending durable baseline materialization**

Authoritative proof run: GitHub Actions Run #8, ID `35722292083`.

- Source main SHA: `209125afe961a4bcbdcc0f00eb57e5c96cc11916`
- Artifact: `checkpoint4-proof`
- Artifact ID: `10692132186`
- Artifact ZIP SHA-256: `f7daf6de7c66415ce40ed826fe4032e1ca97a25bf59e09862a6793d9ef220335`
- PostgreSQL major version: **17**
- Comparator self-test: **31 passed / 0 failed**
- Privilege prologue: **PASS**
- Level 1 structural equivalence: **PASS**
- Level 2 security fingerprint equivalence: **PASS**, unresolved differences **0**
- Compatibility probes: **PASS**
- Fresh Build #2: **PASS**
- Determinism: **PASS**, unresolved differences **0**
- Level-2 allowlist: **zero active entries**
- Historical migrations: **37 intact and unmodified**
- Artifact secret scan: **clean**

The successful artifact contains the proven `v1_baseline_candidate.sql`. It is deliberately not
placed in `supabase/migrations/`: doing so before the ledger cutover decision would make the
active CLI migration path ambiguous.

Checkpoint 4 proves that the current verified application-owned database architecture can be
reconstructed from an empty PostgreSQL 17 Supabase local stack deterministically and with
schema/security/privilege equivalence to the live project.

This document does **not** authorize Checkpoint 5, migration-ledger repair, migration-history
rewrites, or any live database mutation. Checkpoint 1 evidence preservation must be fully closed
first.
