# Pilgrim Portal load test

Test tooling only. Nothing here is application code, a migration, or a production change.

## Safety model
- Target: a **disposable Supabase Free project** ("Alaqsa Load Test"). Production (`zkucwcnclbfvukhdqhgc`) is
  hard-refused by `supabase/verification/assert-not-production.sh` (every step), by `k6/lib.js` (at init),
  and the workflows reference `LT_*` secrets only (self-checked).
- The operator types the target ref (`target_ref` input); it must equal the `LT_PROJECT_REF` secret and is
  passed to the guard as `ALLOWED_TMP_REF`.
- Data: 600 + 20 synthetic pilgrims from `seed/generate.py` (documents `LT######` / `LD######`, names
  `<first> اختبار <n>`). The seed refuses to run on any database holding non-synthetic pilgrims or seasons.

## Files
| path | purpose |
|---|---|
| `seed/generate.py` → `seed/seed.sql`, `k6/identities.json` | deterministic dataset (data step, not a migration) |
| `k6/lib.js` | endpoints exactly as `PilgrimPortal.tsx` calls them; target guard; metrics |
| `k6/probes.js` | security/isolation probes (1 VU, reserved LT000591–600) |
| `k6/journey.js` | sustained stages `smoke`, `A`=50, `B`=100, `C`=250, `D`=500 VUs |
| `k6/burst.js` | ~500 distinct logins over 60 s, then normal activity |
| `k6/docs.js` | separate document cohort / pilgrim-doc source-limit scenario |
| `sql/verify-env.sql` | ledger, functions, grants, RLS surface, dataset counts |
| `sql/fingerprint.sql` | protected-data hashes + expected-activity counts (before/after) |
| `sql/sample.sql`, `sql/top-statements.sql` | observability (connections, locks, deadlocks, slow statements) |
| `sql/reset-between-stages.sql`, `sql/cleanup.sql` | load-test project only |

## Run order (one dispatch each; never auto-advance)
1. `Load test - build the disposable environment` (`BUILD-LOADTEST-ENV`)
2. `Load test - run one scenario`: `probes` → `smoke` → `A` → `B` → `C` → `D`; `burst` separately; `docs` last.

## Local dry run (no network to Supabase needed)
PG16 replay of the 58 migrations + `seed.sql`, PostgREST v12 on 127.0.0.1, then
`k6 run -e LOCAL_DRY_RUN=1 -e BASE_URL=http://127.0.0.1:3999 -e ANON_KEY=<local anon jwt> probes.js`.

## Known finding (to be measured, not a confirmed production failure)
With photos, every portal open calls `pilgrim-doc` once (re-signed ~every 15 min). `portalDocSrc` is
2000/h per source IP, so ~500 photo-bearing pilgrims behind one NAT could approach it. Measured only in the
separate `docs` scenario; the limit is unchanged.

## Cleanup
Delete the disposable project, then remove the `LT_*` repository secrets.
