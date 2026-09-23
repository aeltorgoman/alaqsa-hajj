# V1 Baseline — proven, preserved, and intentionally NON-ACTIVE

`v1_baseline.sql` is the exact, unmodified `v1_baseline_candidate.sql` produced and proven by
GitHub Actions **Run #8**. It is a byte-for-byte copy of the artifact file; nothing was
reformatted, regenerated or edited on the way in.

## Provenance

| | |
|---|---|
| Proof run | [#8 — `35722292083`](https://github.com/aeltorgoman/alaqsa-hajj/actions/runs/35722292083) |
| Source `main` SHA | `209125afe961a4bcbdcc0f00eb57e5c96cc11916` |
| Artifact | `checkpoint4-proof`, ID `10692132186` |
| Artifact ZIP SHA-256 | `f7daf6de7c66415ce40ed826fe4032e1ca97a25bf59e09862a6793d9ef220335` |
| Baseline file SHA-256 | `80fbdb11640b4695a184f62a50573e47efc2c2a0dcc69abacce3cccf3a4e6350` |
| Baseline file size | 271 907 bytes |
| Server | PostgreSQL **17** (live 17.6; local stack asserted 17.x) |

## What Run #8 proved

| Surface | Verdict | Evidence |
|---|---|---|
| Comparator self-test | **31 / 31** | run before any database was touched |
| Privilege prologue | **PASS** | `anon` holds no default privilege and no write privilege in `public` |
| Level 1 — structural | **PASS** | 595 reference statements vs 595 candidate statements, identical multisets |
| Level 2 — security fingerprint | **PASS**, **0 unresolved** | 847 records vs 847, reference-only 0, candidate-only 0 |
| Compatibility probes | **PASS** | every probe fail-closed; `no_residue` asserted across all written tables |
| Fresh Build #2 | **PASS** | rebuilt from empty a second time |
| Determinism | **PASS**, **0 unresolved** | build #1 vs build #2 — `determinism.diff` is 0 bytes |
| Level-2 allowlist | **zero active entries** | nothing was adjudicated away |

The only lines in the raw Level 1 diff were pg_dump's per-invocation `\restrict` / `\unrestrict`
nonce comments — dump metadata, classified and ignored by design, with zero statement differences.

### The privilege environment, measured on the run

The baseline opens with a privilege prologue because a clean Supabase instance ships
`postgres`-owned default privileges that grant **ALL** to `anon`. Run #8 recorded the before and
after state directly:

```
before   postgres | public | r | {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
after    postgres |        | r | {postgres=arwdDxtm,               authenticated=arwdDxtm, service_role=arwdDxtm}
```

which is exactly the live project's state. The `supabase_admin`-owned platform defaults are
untouched, as intended — they are not application-owned.

## Status: NON-ACTIVE

This file is **not** a migration and **must not** be moved into `supabase/migrations/`.

- The active migration path is unchanged: the 37 historical migrations remain in place, untouched.
- **No ledger cutover has occurred.** The remote `supabase_migrations.schema_migrations` ledger
  is exactly as it was: 46 rows, latest version `20260921141422`.
- **Checkpoint 5 has not started.** Nothing here authorises migration repair, migration-history
  rewriting, `db push`, or any live database mutation.

Checkpoint 4 is closed on the strength of this proof. Turning this baseline into the active
migration path is a separate, separately-approved decision.
