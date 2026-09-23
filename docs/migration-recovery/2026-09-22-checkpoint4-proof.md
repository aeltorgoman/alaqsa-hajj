# Checkpoint 4 — V1 Baseline Proof Closure

Status: **CLOSED** — proven by Run #8 and durably preserved at
`supabase/baseline/v1/v1_baseline.sql` (SHA-256 `80fbdb11640b4695a184f62a50573e47efc2c2a0dcc69abacce3cccf3a4e6350`).

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

The proven `v1_baseline_candidate.sql` is now preserved byte-for-byte as
`supabase/baseline/v1/v1_baseline.sql`, with its provenance in `supabase/baseline/v1/README.md`.
It is deliberately **not** in `supabase/migrations/`: placing it there before the ledger cutover
decision would make the active CLI migration path ambiguous.

Checkpoint 4 proves that the current verified application-owned database architecture can be
reconstructed from an empty PostgreSQL 17 Supabase local stack deterministically and with
schema/security/privilege equivalence to the live project.

Checkpoint 1 is now **CLOSED** as well — see `docs/migration-recovery/2026-09-21/final/`.

This document does **not** authorize Checkpoint 5, migration-ledger repair, migration-history
rewrites, or any live database mutation. The baseline is proven but **non-active**; the 37
historical migrations remain untouched; no ledger cutover has occurred; Checkpoint 5 has not
started.
