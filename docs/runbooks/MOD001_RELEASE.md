# Runbook — MOD-001 database release (multi-hotel)

Applies the three reviewed MOD-001 migrations **to Alaqsa Load Test first, then to
Production**, through two gated `workflow_dispatch` workflows. Nothing runs
automatically. Every step that connects re-checks the target first.

| Order | Migration | Purpose |
|---|---|---|
| 1 | `20261010194239_mod001_hotels_foundation.sql` | hotels, hotel package prices, columns, guards (additive) |
| 2 | `20261010203522_mod001_hotels_backfill.sql` | one hotel per existing season; links rooms and pilgrims; copies effective package prices |
| 3 | `20261011012258_mod001_hotel_operations.sql` | room assignment, ordering, hotel deletion, portal and settings functions |

The current frontend keeps working after all three (verified against the real
PostgREST surface). **The new frontend is launched separately and only after the
price gate passes.**

## Gates (both workflows, same scripts)

All logic lives in `supabase/verification/mod001/`. The workflows only call it.

| Gate | Blocks when |
|---|---|
| `release_target_guard.sh` | wrong target, malformed ref, pooler user not `postgres.<ref>`, non-pooler host, the other target's or the other mode's confirmation text, Load Test ref ≠ `LT_PROJECT_REF`, Production run carrying Load Test identity, Load Test run pointed at Production |
| `release_run.sh static` | migration count ≠ 61, a migration file differs from its reviewed SHA-256, a migration writes application rows at top level |
| `release_run.sh ledger-before` | ledger ≠ 58 rows / `20260928100000`, pending set ≠ exactly the three, any unexpected ledger version |
| `release_run.sh preflight` | not Postgres 17, any MOD-001 object already present, `delete_season` body ≠ md5 `ae4c1905cebc93286cee74d4513c90c9` (the body PR 1 patches; identical on Production, Load Test and a local rebuild at 58), a dependency missing, not exactly one open season |
| `release_run.sh push` | no `fingerprint-before` evidence |
| `release_run.sh ledger-after` | ledger ≠ 61 / `20261011012258`, any of the 58 originals changed |
| `release_run.sh postcheck` | structure, RLS, grants, definer/search_path, backfill completeness, any pilgrim's base package price changed, **any protected fingerprint changed** (passengers, rooms, payments, receipts, custom charges, pricing settings, snapshots, seasons, financial groups, user profiles) |
| `release_run.sh price-gate` | for the open season: any hotel whose package price ≠ the global package price (**missing = 0 on both sides**), or any priced pilgrim without a requested hotel |
| Production `push` only | no successful **Load Test `push`** run on the **same commit** (checked through the Actions API) |

Local proof of every block: `supabase/verification/mod001/release_gate_tests.sh`
(disposable local database only; refuses any non-local URL).

## Package-price freeze (decision P1 «a», review of #216)

From the moment step 4 below starts until the new frontend is live:
**no one edits package prices** in Finance → Settings → Prices. The current
frontend still prices from `pricing_settings`; the new one prices from
`hotel_package_prices`. The price gate detects any drift and **blocks the launch**;
it does not repair it.

## Minimum steps

1. **Merge** the MOD-001 integration branch to `main` only when the release is
   approved (the workflows must exist on the dispatched ref).
2. **Load Test — push.** Actions → *MOD-001 release - Load Test* → `mode=push`,
   `confirm=PUSH-MOD001-LOADTEST-20261011012258`, `target_ref=<Load Test ref>`.
   Expect every gate green. Download the evidence artifact. Note the **run id**.
3. **Load Test — check.** Open the integration Preview (pointed at Load Test) and
   confirm hotels, rooms and the portal behave. Optional: `mode=price-gate`,
   `confirm=GATE-MOD001-LOADTEST-PRICES`.
4. **Freeze package prices** (announce to whoever holds `manage_payments`).
5. **Production — push.** Actions → *MOD-001 release - Production* → `mode=push`,
   `confirm=PUSH-MOD001-PRODUCTION-20261011012258`, `loadtest_run_id=<run id from step 2>`,
   on the **same commit**. Expect every gate green.
6. **Smoke test the current Production frontend** (rooms, assignment, registration,
   finance totals, portal) — it must behave exactly as before.
7. **Immediately before the frontend launch:** Production `mode=price-gate`,
   `confirm=GATE-MOD001-PRODUCTION-PRICES`. **Green → launch. Red → stop**, fix the
   prices (or the unlinked pilgrim) and re-run the gate.
8. Lift the price freeze only after the new frontend is live.

## Failure and recovery

- Any gate before the push fails → **nothing was written**. Fix the cause, re-run.
- The push itself is one transaction per migration; migration 2 aborts as a whole
  if any amount would change.
- A post-check fails after the push → evidence is kept, **no automatic rollback**;
  recovery is a human decision and a forward migration.
- Running a push twice is safe: the second run stops at `ledger-before`.
