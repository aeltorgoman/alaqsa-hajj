# Runbook — MOD-001 database release (multi-hotel)

Applies the three reviewed MOD-001 migrations **to Alaqsa Load Test first, then to
Production**, through two gated `workflow_dispatch` workflows dispatched on a
**database-only release branch**. The new frontend stays on the integration branch
until the very end. Nothing runs automatically. Every step that connects re-checks
the target first.

| Order | Migration | Purpose |
|---|---|---|
| 1 | `20261010194239_mod001_hotels_foundation.sql` | hotels, hotel package prices, columns, guards (additive) |
| 2 | `20261010203522_mod001_hotels_backfill.sql` | one hotel per existing season; links rooms and pilgrims; copies effective package prices |
| 3 | `20261011012258_mod001_hotel_operations.sql` | room assignment, ordering, hotel deletion, portal and settings functions |

The current frontend keeps working after all three (verified against the real
PostgREST surface). **The new frontend reaches `main` (= Vercel Production) only
in step 11, after the Production push and a green price gate.**

## Gates (both workflows, same scripts)

All logic lives in `supabase/verification/mod001/`. The workflows only call it.

| Gate | Blocks when |
|---|---|
| `release_target_guard.sh` (+ port check in `release_run.sh`) | wrong target, malformed ref, pooler user not `postgres.<ref>`, non-pooler host, a port other than 5432/6543, the other target's or the other mode's confirmation text, Load Test ref ≠ `LT_PROJECT_REF`, Production run carrying Load Test identity, Load Test run pointed at Production |
| workflow step *release toolkit equals the copy registered on main* (every mode, **before any repository script runs**) | any file of the release toolkit — both workflows, the six `release_*` scripts, the three `assert-*` checkers — differs from, or is missing on, `main` |
| `release_run.sh scope` (`check`, `push`) | the dispatched ref changes anything outside `supabase/migrations`, `supabase/verification`, `supabase/README.md`, `docs/` (i.e. it carries frontend, or `package.json`) |
| `release_run.sh static` | migration count ≠ 61, a migration file differs from its reviewed SHA-256, a migration writes application rows at top level |
| `release_run.sh ledger-before` | ledger ≠ 58 rows / `20260928100000`, pending set ≠ exactly the three, any unexpected ledger version |
| `release_run.sh preflight` | not Postgres 17, any MOD-001 object already present, `delete_season` body ≠ md5 `ae4c1905cebc93286cee74d4513c90c9` (the body PR 1 patches; identical on Production, Load Test and a local rebuild at 58), a dependency missing, not exactly one open season |
| `release_run.sh push` | no `fingerprint-before` evidence |
| `release_run.sh ledger-after` | ledger ≠ 61 / `20261011012258`, any of the 58 originals changed |
| `release_run.sh postcheck` | structure, RLS, grants, definer/search_path, backfill completeness, any pilgrim's base package price changed, **any protected fingerprint changed** (passengers, rooms, payments, receipts, custom charges, pricing settings, snapshots, seasons, financial groups, user profiles) |
| `release_run.sh price-gate` | any of the three migrations missing from the target's ledger (so it can never be green before the Production push), or, for the open season: any hotel whose package price ≠ the global package price (**missing = 0 on both sides**), or any priced pilgrim without a requested hotel |
| Production `push` only | no successful **Load Test `push`** run on the **same commit** (checked through the Actions API) |

Local proof of every block: `supabase/verification/mod001/release_gate_tests.sh`
(disposable local database only; refuses any non-local URL).

## Package-price freeze (decision P1 «a», review of #216)

From step 6 below until the new frontend is live: **no one edits package
prices** in Finance → Settings → Prices. The current frontend prices from
`pricing_settings`; the new one prices from `hotel_package_prices`. The price
gate detects drift and **blocks the launch**; it does not repair it.

## Why this order

- `main` deploys to **Vercel Production** automatically, so `main` only ever
  receives (a) the release toolkit and (b) database-only commits — until the
  frontend launch in step 11.
- The toolkit is registered on `main` (not only the YAML) so a modified script on
  the dispatched branch cannot vouch for itself: the workflow compares it with
  `main` inline, before running it. `check` mode never receives the password.
- `workflow_dispatch` — **verified, not assumed**:
  - GitHub docs (*Events that trigger workflows → workflow_dispatch*): the event
    "will only trigger a workflow run if the workflow file exists on the default
    branch"; a run may target another branch, with `GITHUB_REF` = that branch and
    `GITHUB_SHA` = its latest commit.
  - This repository already did exactly that: #178 put **only**
    `company-private-bucket-push.yml` on `main`, then run `36155610756` was
    dispatched on `feat/company-stamp-signature` (`head_sha b6d20f1`) and succeeded.
  - Step 3 re-proves it on this release with `mode=check` (no database, no
    password), and every run fails if its workflow or scripts differ from `main`,
    so it does not matter which copy GitHub executes.
- The migrations are additive and the current frontend was verified against
  them (PR 3), so Production can run on the old frontend between steps 7 and 11.

## Minimum steps

| # | Step | Touches |
|---|---|---|
| 1 | Cut **`release/mod-001-db`** from `feature/mod-001-multi-hotel` at the commit that merged this PR (database-only). Never add frontend to it. | git |
| 2 | **Register** the release toolkit: a PR to `main` containing **only** the two `mod001-*-release.yml` workflows and the six `supabase/verification/mod001/release_*` scripts, byte-identical to the release branch (as #178 did for one workflow). No migration, no frontend; Vercel rebuilds `main` with an unchanged frontend. | `main` (toolkit only) |
| 3 | **Verify dispatch:** *MOD-001 release - Load Test*, branch `release/mod-001-db`, `mode=check`. Expect `ref=refs/heads/release/mod-001-db … release toolkit matches main` and `scope PASS`. No database is contacted and no password is passed. | nothing |
| 4 | **Load Test push**, same branch: `mode=push`, `confirm=PUSH-MOD001-LOADTEST-20261011012258`, `target_ref=<Load Test ref>`. Every gate green; keep the evidence; note the **run id**. | Load Test DB |
| 5 | Check Load Test (rooms, assignment, portal, finance) through the integration Preview, which already points to Load Test. Optional `mode=price-gate`, `confirm=GATE-MOD001-LOADTEST-PRICES`. | nothing |
| 6 | **Freeze package prices** (tell everyone with `manage_payments`). | — |
| 7 | **Production push**, branch `release/mod-001-db` (**same commit** as step 4): `mode=push`, `confirm=PUSH-MOD001-PRODUCTION-20261011012258`, `loadtest_run_id=<step 4>`. Every gate green. | Production DB |
| 8 | **Smoke-test the current Production frontend** (rooms, assignment, registration, finance totals, portal): it must behave exactly as before. | — |
| 9 | Merge `release/mod-001-db` into `main` so `main` matches the Production ledger again (database-only, the `scope` gate already proved it). Frontend on Production is unchanged. | `main` (DB files only) |
| 10 | Frontend MOD-001 PRs land on `feature/mod-001-multi-hotel` only; its Preview stays on Load Test until full acceptance. | Preview only |
| 11 | **Launch:** immediately before, Production `mode=price-gate` (`confirm=GATE-MOD001-PRODUCTION-PRICES`) on the integration branch. **Green → merge the integration branch into `main`. Red → stop**; fix the prices or the unlinked pilgrim and re-run. The gate also fails if the migrations are not on Production, so the new frontend cannot precede them. | Production frontend |
| 12 | Lift the price freeze after the new frontend is live. | — |

## Failure and recovery

- Any gate before the push fails → **nothing was written**. Fix the cause, re-run.
- The push itself is one transaction per migration; migration 2 aborts as a whole
  if any amount would change.
- A post-check fails after the push → evidence is kept, **no automatic rollback**;
  recovery is a human decision and a forward migration.
- Running a push twice is safe: the second run stops at `ledger-before`.
