# Hajj Management System — Project Master Handoff

**Repository:** `aeltorgoman/alaqsa-hajj`
**Document status:** Master context / engineering + product handoff
**Prepared:** 2026-09-17
**Verified against:** `main` @ `8605451e01746185747a1157a4248d96867ce56c`

---

## Evidence key

Every claim in this document carries one of these markers. **Do not upgrade a marker without new evidence.**

| Marker | Meaning |
|---|---|
| ✅ **VERIFIED** | Confirmed directly from this repository (code, migrations, git history, GitHub API) on the date above |
| 📜 **PROJECT CONTEXT** | Historical decision or operational fact **not fully reconstructable from the repository** — treat as probably true, verify before acting |
| 🔄 **CURRENT** | Work in flight right now |
| ⏸️ **DEFERRED** | Intentionally postponed with a decision behind it — not a bug, not forgotten |
| ⚠️ **DEBT / RISK** | Known operational hazard |

---

## Table of contents

1. [Document purpose](#1-document-purpose)
2. [Project overview](#2-project-overview)
3. [Product operating model](#3-product-operating-model)
4. [Tech stack and deployment](#4-tech-stack-and-deployment)
5. [Architectural principles](#5-architectural-principles)
6. [Database / Supabase architecture](#6-database--supabase-architecture)
7. [Security program status](#7-security-program-status)
8. [Season architecture](#8-season-architecture)
9. [Major completed work](#9-major-completed-work)
10. [Module status matrix](#10-module-status-matrix)
11. [Backup / recovery status](#11-backup--recovery-status)
12. [WhatsApp status](#12-whatsapp-status)
13. [Reporting / print architecture](#13-reporting--print-architecture)
14. [Pilgrim Portal — current work](#14-pilgrim-portal--current-work)
15. [Pilgrim Portal — Phase 2](#15-pilgrim-portal--phase-2)
16. [Deferred / intentionally postponed work](#16-deferred--intentionally-postponed-work)
17. [Working method](#17-working-method)
18. [Things NOT to reopen](#18-things-not-to-reopen)
19. [Remaining roadmap to V1](#19-remaining-roadmap-to-v1)
20. [Current exact checkpoint](#20-current-exact-checkpoint)
21. [Start here in a new chat](#21-start-here-in-a-new-chat)

---

## 1. Document purpose

This document exists so that **losing the conversation history is not a project-continuity disaster.**

Give this one file to a new AI assistant or a new developer with no prior context, and they should be able to answer: what the system is, how it is built, what rules govern it, what is already finished and must not be re-litigated, what is deliberately postponed, how we work, and precisely what to do next.

**This is not a README, not a marketing summary, and not a substitute for `docs/ENGINEERING_PLAYBOOK.md`.** The Playbook remains the authoritative engineering policy; `docs/architecture/SECURITY_ARCHITECTURE.md` remains the supreme authority on security; GitHub Issue #42 remains the authoritative season architecture. This document orients you and points at those.

---

## 2. Project overview

✅ **VERIFIED** — An Arabic, RTL, single-company Hajj campaign management system used in **real campaign operations**. It manages a Hajj campaign end to end:

| Domain | What it covers |
|---|---|
| **Pilgrims** | Registration, personal file, family/financial grouping, allocation state |
| **Document scanning / OCR** | Passport and Hajj-permit capture via the `Scan-passport` Edge Function, with a confirmation step before persistence |
| **Documents** | Passport, national ID, Hajj permit, flight ticket — stored as **object keys**, served only through short-lived signed URLs |
| **Finance** | Packages, add-ons/discounts, payments, custom charges, financial groups, balances, receipts and statements |
| **Buses** | Bus fleet and pilgrim-to-bus allocation for movement between the holy sites |
| **Mina / Arafat** | Camp definition and pilgrim-to-camp allocation (two independent camp assignments) |
| **Hotel** | Rooms with authoritative type and capacity, floors, occupancy and roommate visibility |
| **Flights** | Outbound and return legs, airline, airports, times, class, campaign seat counts |
| **Reports** | Operational and financial printouts through one shared print architecture |
| **Users / permissions** | Supabase Auth identity, `user_profiles`, `has_permission()`, eleven permission keys |
| **Pilgrim Portal** | Public pilgrim-facing app at `/hajj` — separate client, no staff session |
| **WhatsApp / notifications** | Web Push to pilgrims (live) and WhatsApp document/text send (blocked — see §12) |
| **Seasons** | Multiple Hajj seasons inside one deployment, with archive lifecycle and closed-season immutability |

**Scale context** ✅ **VERIFIED** (from Issue #42, as of 2026-08-02): one open season, zero closed seasons, 25 pilgrims. This is a system built ahead of its data volume — treat production data as small but **real and irreplaceable**.

---

## 3. Product operating model

📜 **PROJECT CONTEXT** (the stages are a product model, not a code construct)

A Hajj season runs through four stages:

| Stage | What is true | What the pilgrim needs |
|---|---|---|
| **A. Registration** | Pilgrims enrol. Most allocations do not exist yet. May last **months**. | Reassurance that registration succeeded; nothing operational to act on |
| **B. Distribution / allocation** | Room, bus, Mina and Arafat assignments begin to appear, pilgrim by pilgrim | To learn what changed |
| **C. Pre-travel** | Flights, ticket and permit become critical | Documents and flight, fast |
| **D. Travel / Hajj** | The campaign is operating on the ground | Immediate operational facts — bus, camp, hotel, emergency contact |

**Two rules that follow from this and that the code must respect:**

1. **The stages overlap.** A campaign can be in stage C for most pilgrims while a late registrant is still in stage A. Nothing may assume the whole campaign is in one stage.
2. **Absence is normal, not an error.** During stage A almost everything is unassigned. Staff-facing readiness warnings and pilgrim-facing status are **different products** and must not share language or colour.

⚠️ **Do not build a "phase engine."** This has been explicitly rejected more than once. Ordering by *data availability* plus simple date comparison achieves the same result without a state machine.

---

## 4. Tech stack and deployment

✅ **VERIFIED** from `package.json` at `main`:

| Layer | Technology |
|---|---|
| UI | **React 19.2** + **TypeScript ~6.0** |
| Build | **Vite 8** (`npm run build` = `tsc -b && vite build`) |
| Lint | **ESLint 10** + `typescript-eslint` + `eslint-plugin-react-hooks` |
| Backend | **Supabase** (`@supabase/supabase-js` ^2.45) — Postgres, Auth, Storage, Edge Functions |
| PDF | `pdfjs-dist` ^4.10 (portal + document printing) |
| Spreadsheets | `xlsx` ^0.18 |
| Archive | `jszip` ^3.10 |
| Hosting | **Vercel** (Preview per PR, Production on `main`) |

### ⚠️ Two corrections to common assumptions

1. **There is NO Tailwind.** No `tailwind.config`, no `postcss.config`, no Tailwind dependency. Styling is **inline React style objects** plus three CSS files (`src/index.css`, `src/App.css`, `src/styles/themes.css`) driven by CSS custom properties. Do not introduce Tailwind. ✅ **VERIFIED**
2. **There is NO automated test framework.** No `test` script, no Vitest, no Jest. ✅ **VERIFIED** Verification is: `npm run build`, `npm run lint` (tracked as a **delta against baseline**, never an absolute), purpose-built throwaway probes, and **manual Preview acceptance**. Do not claim "tests pass" — there are none to run.

### Single company per deployment ✅ **VERIFIED**

One company per deployment. **Do not introduce multi-tenancy, tenant IDs, a company selector, or a `companies` table.** Company identity, branding, contact, banking and report values are **never hardcoded**; they flow through the `CompanyService` boundary (`src/company/`) and typed selectors. Components must not read raw `company_config` or legacy branding keys.

### Entry points ✅ **VERIFIED**

`src/main.tsx` branches on the URL path:

```
/hajj*  → <PilgrimPortal />          public, no ConfigProvider, no staff session
else    → <ConfigProvider><App /></ConfigProvider>   staff application
```

---

## 5. Architectural principles

`docs/ENGINEERING_PLAYBOOK.md` (1,280 lines) is the **authoritative** engineering policy. This is an orientation summary, not a replacement.

✅ **VERIFIED** — Playbook principles:

- **Correctness before speed**
- **Simplicity over cleverness**
- **Readability is a feature**
- **Explicit beats implicit**
- **One source of truth** — "Every business concept must have exactly one authoritative source." Named examples: passenger status, season state, room occupancy, financial balance, permission model.
- **Business logic must be deterministic** — same input, same result; never dependent on UI timing, Realtime timing, or network latency.

### The shared-predicate working principle 📜 **PROJECT CONTEXT** (established in practice across the Dashboard/Operations/Reports work)

> **The definition or calculation of a business concept has one shared source. Pages may vary presentation, ordering, visibility and available actions — but must never independently reimplement the same predicate.**

This is the rule that produced the readiness helper (`src/utils/readiness.ts`), the room capacity helper (`src/utils/room.ts`), the passenger helpers (`src/utils/passenger.ts`), and the entire `src/print/` boundary. When two screens disagree about a fact, the bug is the duplicated predicate, not the screen.

### Non-negotiable rules ✅ **VERIFIED** (from the project skill and enforced throughout the codebase)

- Financial and internal company data stays authenticated; public surfaces get explicit projections and allowlists only.
- Supabase secrets and service-role keys stay server-side — never in client code, logs, reports or chat.
- Scope operational reads and writes by `season_id` wherever the schema requires it.
- Preserve Arabic enum/domain values **exactly** — never translate stored values.
- Use existing permission gates for navigation and mutations. **UI hiding is not authorization.**
- Never `SELECT *` on public portal/config/asset paths.
- `SECURITY DEFINER` functions must pin a safe `search_path` and carry minimal execute grants.
- Escape values injected into generated HTML; validate URLs and CSS colours before rendering.
- **Never** run production migrations, merge PRs, delete data or deploy without explicit authorization from the project owner.

---

## 6. Database / Supabase architecture

✅ **VERIFIED** — 33 migrations in `supabase/migrations/`, starting from `20260101000000_baseline_schema.sql`.

### Seasonal ownership — stored vs derived

Per Issue #42 §4, the decision is **store on independent entities, derive where ownership is unambiguous**:

| `season_id` **stored** | Season **derived** | **Not seasonal at all** |
|---|---|---|
| `passengers`, `buses`, `camps`, `rooms` | `payments`, `custom_charges` ← via `passenger_id` | `users` / `user_profiles` |
| `flights`, `announcements` (added in M7) | `financial_groups` ← via members | `company_config` |
| | `notification_deliveries`, `pilgrim_push_subscriptions` | `pricing_settings` |

> **Why derive rather than store:** storing `season_id` on `payments` creates the possibility of a payment whose season contradicts its owner's. Deriving makes that contradiction **impossible by construction**. This reduced the work from five tables to two.

### Closed-season immutability ✅ **VERIFIED**

`20260802021944_season_reject_writes_to_closed_season.sql` installs a **database trigger** that rejects writes to rows belonging to a closed season. This is the real guarantee — the UI disabling buttons and `useSeasonWrite` are convenience layers above it.

```
UI (disabled buttons)   → user experience
useSeasonWrite          → consistency + one message
database trigger        → the actual guarantee
```

✅ **All eleven seasonal tables carry `trg_reject_closed_season`.** M1 installed it on `passengers`, `buses`, `camps`, `rooms` and the derived tables; **M7 extended it to `flights` and `announcements`** — `20260829120000_m7_season_flights_announcements.sql` §1 installs the trigger on both, reusing the **same** `reject_write_closed_season()` function rather than a second copy, so the behaviour is identical by sharing and not merely by resemblance.

> ⚠️ **Stale-source warning.** `docs/architecture/BACKLOG.md` item **ن١٧** still claims `flights` and `announcements` lack this trigger. **That entry is out of date and must not be trusted.** BACKLOG.md was last updated `2026-08-27` (`f6ce8f8`, during the S8 inventory); the M7 migration that closed the gap merged `2026-08-29` (`97763a0`, PR #105) — two days later. Production verification recorded **2 closed-season triggers, one on `flights` and one on `announcements`**, which matches the current migration. The gap was real when ن١٧ was written and is now closed. **Treat the repository as source of truth over BACKLOG.md.**

### Season pricing snapshot ✅ **VERIFIED**

`20260827120000_season_pricing_snapshot.sql`. The problem was proven, not assumed: `calcTotalDue` computed a pilgrim's dues **at render time** from live `pricing_settings`. Editing a package price for a future season therefore **retroactively rewrote the balances of an archived season** — dues, balance, payment status and receivables reports — with no `audit_log` trace (that table is outside S8 coverage) and no trigger to stop it (`pricing_settings` is not seasonal).

The fix adds a **season-level price snapshot** underneath, without overturning Issue #42 §4: `pricing_settings` remains a current company setting; a layer is added below it.

### Flights and announcements become seasonal ✅ **VERIFIED**

`20260829120000_m7_season_flights_announcements.sql` (PR #105) — closes M7 of Issue #42. Announcements are filtered by the pilgrim's own season in **both** read paths (`get_pilgrim_portal_by_session` and `get_portal_announcements`), so a pilgrim never inherits an announcement from a previous season.

### RPC and security boundaries ✅ **VERIFIED**

Portal RPCs are `SECURITY DEFINER`, pin `search_path = public, pg_temp`, and are **revoked from `public` and `authenticated`, granted to `anon` only**:

- `create_pilgrim_session(p_doc, p_day, p_month, p_year)` — the **only** function in the entire system that accepts document + date of birth
- `get_pilgrim_portal_by_session(p_token)` — the portal projection
- `get_portal_announcements()` — active-season announcements
- `revoke_pilgrim_session(p_token)`
- `_pilgrim_session_owner(p_token)` — internal resolver

The portal projection returns **booleans for document existence, never object keys** (`has_photo`, `has_hajj_permit`, `has_flight_ticket`). Actual document access goes through the `pilgrim-doc` Edge Function, which returns a short-lived signed URL.

**Edge Functions** ✅ **VERIFIED** — `Scan-passport`, `pilgrim-doc`, `season-admin`, `send-pilgrim-push`, `user-admin`, plus `_shared` (authorize / http / rateLimit). All but `user-admin` use the shared triple pattern (`verify_jwt` + `getUser(jwt)` + `has_permission()`).

### Audit log ✅ **VERIFIED**

`20260822120000_s8_audit_log.sql` (PR #103). Records **who acted**, not merely what happened. Notably: `audit_log` and `season_pricing_snapshot` **survive season deletion** — neither has a foreign key to `seasons` and `delete_season` does not touch them. This is deliberate: it is what makes a season deletion provable **after the fact**.

### ⚠️ Migration history caveat

📜 **PROJECT CONTEXT — verify before acting.** Production migration history is understood to be **inconsistent** with the repository's migration folder (migrations were applied out of band during earlier stages).

> ### 🔴 `supabase db push` must NOT be run casually against Production.
> Apply migrations deliberately and individually, verify the result, and never assume the repository folder and Production are in sync. This has not been reconciled — see §16.

---

## 7. Security program status

✅ **VERIFIED** from `docs/architecture/README.md` §2 and the merged PR history.

The security program ran as ten sequenced stages (س٠–س٩). **The order was not a suggestion** — each dependency is explained in Security Architecture §14.

| Stage | Scope | Status |
|---|---|---|
| **س٠ / S0** | Emergency containment — `Scan-passport`, **self-signup disabled** | 🟢 CLOSED |
| **س١ / S1** | Foundation — `user_profiles`, `has_permission()` | 🟢 CLOSED, deployed |
| **س٢ / S2** | Login — `signInWithPassword`, `user-admin` | 🟢 CLOSED |
| **س٣ / S3** | Authorization — triple pattern on Edge Functions | 🟢 CLOSED, deployed |
| **س٤ / S4** | **RLS + full `anon` revocation** | 🟢 CLOSED, deployed |
| **س٥ / S5** | Deleting the defective legacy identity system | 🟢 CLOSED, deployed |
| **س٦ / S6** | Storage + portal documents together (indivisible) | 🟢 CLOSED, deployed |
| **س٧ / S7** | Portal session token + verification rate limit | 🟢 CLOSED, deployed |
| **س٨ / S8** | Audit log, delegated actor, `view_audit` | 🟢 CLOSED, deployed |
| **س٩ / S9** | Finishing — `search_path`, message hiding, response filtering, rate limits, CORS | 🟢 CLOSED, deployed |

### 🔴 These stages are CLOSED. Do not reopen them for ceremony.

S8's acceptance campaign closed with final verdicts: **26 passed, 2 blocked (ب٣, ت١٢ — never implemented), zero failed, zero undecided.** Reopening requires a **concrete, demonstrated defect** — not a review, not a re-audit, not "let me double-check."

### Security constants

Constants أ١–أ١٢ are defined in `SECURITY_ARCHITECTURE.md`. The one most likely to be accidentally violated:

> **أ١٢ (A12)** — the pilgrim's device holds an **opaque session token**, never their passport number and date of birth. 30-day idle expiry, 90-day absolute, revoked on logout, dropped when the season closes. Exactly one place in the code knows its shape.

### Deferred security debt ⏸️ (see `docs/architecture/BACKLOG.md` §4)

| # | Item | Why it is acceptable |
|---|---|---|
| **أ٨ / أ٦** | `user-admin` sits outside the shared layer — no `authorize()`, no rate limit, no `cors()` | Its security behaviour is **equivalent** (reads `is_active` and `manage_users` from `user_profiles` with the service key); it is the only function duplicating the logic. Closes with alignment task **د١** |
| **أ٢** | `company_profile_public` raises `security_definer_view` in Advisors | **Intentional** — explicitly excluded in the anonymous-access inventory |
| **أ٥** | Secret rotation | Deployment task, not code |

---

## 8. Season architecture

✅ **VERIFIED** — **GitHub Issue #42 is the single authoritative reference** and is marked 🔒 **frozen and approved**. It supersedes issues #38, #39, #40. It is **CLOSED** as of 2026-09-24, once M7 completed — see the delivery history below. It remains the authoritative season reference to read; closure records that its work is done, not that the document is superseded.

### The vision

> **One application that switches context — not parallel archive pages.** Every operational page works on the *viewed* season. No data copying, no duplicated reports.

### Invariants

| # | Invariant | Enforced by |
|---|---|---|
| **ث١** | At most **one** active season | Partial unique index |
| **ث٢** | At least **one** active season | `close_season()` in a single transaction |
| **ث٣** | **No writes to a closed season** | Database trigger |
| **ث٤** | A closed-season pilgrim **cannot enter the Portal** | Filter inside the portal RPC |
| **ث٥** | Every seasonal row has a season | `not null` + `default` |
| **ث٦** | `viewedSeason` never affects another user | `sessionStorage` (never `localStorage`) |

### 🔴 The single most dangerous mistake in this design

> **Confusing `activeSeason` with `viewedSeason`.**
> `activeSeason` is **system-wide** — the season new data belongs to.
> `viewedSeason` is **per browser tab** — what this user is looking at.
> If switching the viewed season changed the active season, a staff member browsing 2024 would convert the entire system to 2024.

`canWrite = viewedSeason.id === activeSeason.id`. `readOnly = !canWrite`.

### Separation of concerns ✅ **VERIFIED** (`src/season/`)

```
src/utils/write.ts            fully generic · knows nothing about seasons · do not touch
src/season/SeasonContext.tsx  knows seasons · knows nothing about writing
src/season/useSeasonWrite.ts  the ONLY file that knows both
```

### Frozen decisions

| Decision | Status |
|---|---|
| `activeSeason` separated from `viewedSeason` | ✅ approved |
| Database-level protection (trigger) | ✅ approved |
| One app, no duplicated archive pages | ✅ approved |
| Remount page tree with `key={viewedSeason.id}` | ✅ approved |
| `sessionStorage`, **not** `localStorage` | ✅ approved |
| `writeOk` stays generic; `useSeasonWrite` is a composition layer | ✅ approved |
| **Portal serves the active season only** | ✅ approved |
| Store on two tables, not five | ✅ approved |
| General pages (Settings, Users, Portal settings tab) exempt from read-only | ✅ approved |
| `pricing_settings` is **global/current**, not seasonal | ✅ approved (§4) |
| Historical price fixity handled by a **season pricing snapshot** | ✅ approved (separate migration, does not overturn §4) |
| `flights` and `announcements` are **season-owned** | ✅ approved (M7, PR #105) |
| **No global cross-season announcements** | ✅ approved |
| Container cloning — containers only, deferred | ⏸️ deferred |
| Soft delete (ق٥) — currently a **hard delete** | ⏸️ deferred, see §16 |

### Deletion and audit survival

`delete_season(p_season_id, p_actor)` runs in one transaction, refuses to delete an **open** season, counts all twelve categories **before** deleting (after deletion there is nothing left to count), and deliberately leaves `audit_log` and `season_pricing_snapshot` intact.

---

## 9. Major completed work

✅ **VERIFIED** — reconstructed from `git log --first-parent main`. SHAs are the squash-merge commits on `main`.

> ⚠️ **History caveat:** the repository's first-parent history begins at **PR #53** (2026-08-02). Work numbered below #53 is **not reconstructable from this repository**. Referenced issue numbers (#16, #23, #36, #38–#41) exist as GitHub issues but their PRs predate the retained history.

### Phase 1 — Season foundation (Aug 2026)

| PR | Commit | Work |
|---|---|---|
| #53 | `e113bed` | Portal announcements targeted at the active season |
| #54 | `9fc8461` | `SeasonManagerPage` listing + archive entry |
| #55 | `35aead1` | `season-admin` Edge Function for close and delete |
| #56 | `0061f48` | Season close wizard |
| #57 | `f7aed4f` | Permanent deletion of a closed season |
| #58 | `4382cda` | `ArchivePage` retired; season manager finished |
| — | `2fb87a5` | **Engineering Playbook v1.0 added** |

### Phase 2 — Security program S1–S9 (Aug 2026)

| PR | Commit | Work |
|---|---|---|
| #60, #63, #65 | `a92e263`, `9766985`, `a378311` | S1 — identity foundation, first admin in Supabase Auth, interactive seed |
| #64 | `96d9e63` | S2 — Supabase Auth login + user management |
| #66–#68 | `58143aa`, `5e5f9b0`, `9cc1c4b` | S3 — JWT authorization for season-admin, scanner, push |
| #69, #70 | `8b96623`, `0c7909d` | S4 — announcements behind a SECURITY DEFINER projection; **real RLS + full `anon` revocation** |
| #73, #74, #75, #76, #77 | `b33f9e8`, `27f8865`, `3ee4701`, `675933f`, `b33dcd8` | S9 — message hiding, `search_path` pinning, response filtering, rate limiting, CORS scoping |
| #80 | `f3794a2` | S5 — legacy identity system dropped |
| #81–#92, #99 | `0c5b769` … `e04a6c7`, `56e6a2d` | S6 — storage closed, object-key backfill, company-assets bucket, signing layer, documents bucket privatized, **season-close backup made real** |
| #100 | `808743c` | **S7 — portal session token** ("a session the pilgrim can lose, instead of a passport he cannot") |
| #102, #103 | `f3f51a7`, `f6ce8f8` | **S8 — audit log with a named actor** |

### Phase 3 — Season + finance integrity (Aug–Sep 2026)

| PR | Commit | Work |
|---|---|---|
| #93 | `2d1d3f4` | Hotel — "a bed is occupied whoever sleeps in it" |
| #94–#97 | `70885d0` … `af904dc` | Admin file, resource ordering per context, one row contract |
| #98 | `fd40786` | **Two permissions, two populations, enforced by the database** |
| #104 | `7e20019` | **Historical pricing snapshot** — "a history that does not change with a new price" |
| #105 | `97763a0` | **M7 — flights and announcements become seasonal** |
| #106 | `bce2359` | **Reports count bug** — "zero pilgrims" was read as "one incomplete pilgrim" in four cards |
| #107 | `07820b4` | **`user-admin` joins the CORS allowlist** — no longer alone on `*` |

### Phase 4 — Product/UX completion program (Sep 2026)

| PR | Commit | Work |
|---|---|---|
| #109 | `e8e5d31` | **Dashboard** — unified pilgrim readiness: one definition, one card |
| #110 | `694711d` | **Operations Center** — says where the gap is, drives the work queue |
| #111 | `9933c4b` | **Pilgrims + Pilgrim Profile** — the file stops asserting what it cannot verify |
| #112 | `65ea69c` | **Hotel / Room Management** Product/UX completion |
| #113 | `e5a233a` | **Bus + Mina + Arafat** as one allocation family; limits moved into the database |
| #114 | `a25aa19` | **Flights** — two legs, campaign seats, limits moved into the database |
| #115 | `f3f3b1c` | **Finance Product/UX** — price follows what was paid, not what was allocated |
| #116 | `06dd020` | **Reports R1** — one shared print shell and one shared manifest |
| #117 | `8605451` | **Reports R2** — print chrome as a capability, authoritative hotel report, atomic document pages |

### Items requested but not independently verifiable

📜 **PROJECT CONTEXT — verify if needed:**

- **Baseline migration** — `20260101000000_baseline_schema.sql` exists ✅, but the circumstances of its creation are not recorded in retained history.
- **Duplicate passenger work / root cause** — no PR in retained history matches. The Playbook flags `App.tsx` passenger state and Realtime as concurrency-sensitive with a duplicate-insert hazard, which is consistent with such work having happened, but the PR is not recoverable here.
- **`database.ts` verification** — closed as backlog item **د٤** ("regenerate `database.ts` after the S4 migration deployment"), marked ✅ in `BACKLOG.md`.
- **Pricing settings** — present in code and referenced by Issue #42 §4 ✅; the specific PR is not identifiable in retained history.

---

## 10. Module status matrix

| Module | Status | Important notes |
|---|---|---|
| **Dashboard** | ✅ **CLOSED** | PR #109. Unified readiness definition — one shared predicate, not per-page logic |
| **Operations Center** | ✅ **CLOSED** | PR #110. Points at where the gap is and drives the work queue |
| **Pilgrims / Profile** | ✅ **CLOSED** | PR #111. Table shows where the pilgrim was allocated |
| **Hotel** | ✅ **CLOSED** | PRs #93, #112, R2 (#117). Room **type** is authoritative, not inferred from occupant count. Print output is **frozen** — do not alter |
| **Buses** | ✅ **CLOSED** | PR #113 |
| **Mina** | ✅ **CLOSED** | PR #113 (same allocation family) |
| **Arafat** | ✅ **CLOSED** | PR #113 (same allocation family) |
| **Flights** | ✅ **CLOSED** | PR #114. Two legs; integrity limits in the database |
| **Finance** | ✅ **CLOSED** | PR #115 + pricing snapshot #104. **Calculations are closed** — do not touch without a concrete defect |
| **Reports** | ✅ **CLOSED** | R1 #116 + R2 #117. Shared print architecture. R3 deferred |
| **Pilgrim Portal** | 🔄 **CURRENT** | **PR #118 open, not merged.** Phase 1 awaiting manual Preview acceptance |
| **Settings** | ⏸️ **PENDING** | Next Product/UX module after Portal Phase 2 |
| **WhatsApp** | ✅ **CODE COMPLETE / SECURITY COMPLETE** | PR #108 **merged** (`cb4deb6`) — the Meta token no longer touches the browser. Server-side `whatsapp-send` carries the ق٥ triple, a per-pilgrim recipient guard and the active-season condition; verified end to end by the credential-free harness (A–J 10/10, J=503 proving the guards run before any secret is read). **The live Meta integration test remains deferred — and only because the real external WhatsApp Business number and credentials do not exist yet, not because of any code or security gap.** Historical context in §12, written while it was still blocked |
| **Backup** | ✅ **COMPLETE** | Roles + schema + data dumps done; Auth data and sequence state (16 `setval`) present; 31 Storage files / 3,193,704 bytes. Season-close document backup verified in PR #99 — §11.1 |
| **Recovery** | ⚠️ **PARTIAL / NOT PROVEN END-TO-END** | Restore test **stopped** — Supabase-managed Auth/Storage restore collided with managed project state. **The backup is not the problem** — §11.2 |
| **Season Management** | ✅ **CLOSED** | Issue #42 architecture frozen and now closed; M7 delivered in two stages — **#105** delivered it **partially** (season flights and announcements), and **#150** completed **items 3–4** (`financial_groups.season_id` with DB-level membership/season consistency and closed-season protection, and removal of the temporary FinancePage compatibility logic). Migration `20260924093000` carries item 3 |
| **Security** | ✅ **CLOSED** | S0–S9 complete and deployed. Residual debt in `BACKLOG.md` §4 |
| **Push notifications** | ✅ **CLOSED (core)** | `send-pilgrim-push` + `pushClient.ts` + service worker live. Follow-ups deferred |
| **Company Profile** | ✅ **CLOSED** | `CompanyService` boundary; see `docs/COMPANY_PROFILE_*.md` |
| **Bootstrap (ب٠ / B0)** | ⬜ **DESIGN APPROVED, NOT BUILT** | `B0_IMPLEMENTATION_DESIGN.md`. Product path, separate from the security path |

---

## 11. Backup / recovery status

> ### The distinction that matters
> **BACKUP = COMPLETE and verified.**
> **FULL END-TO-END RECOVERY = NOT PROVEN.**
>
> These are two different things and must never be collapsed into one status. The backup is **not** partial.

### 11.1 Backup — ✅ COMPLETE / VERIFIED OPERATIONALLY

📜 **PROJECT CONTEXT** (recorded during operational verification; the artefacts live outside this repository, so the figures cannot be re-derived from it — but the backup itself is complete and was verified)

| Component | Result |
|---|---|
| Roles dump | ✅ completed |
| Schema dump | ✅ completed |
| Data dump | ✅ completed |
| **Auth data** | ✅ present in the dump |
| **Sequence state** | ✅ present — **16 `setval` calls** |
| Storage object backup | ✅ completed |
| Storage files | **31 files** |
| Storage bytes | **3,193,704 bytes** |

Nothing about the backup is partial, missing or unverified. Auth data and sequence state — the two things most often silently absent from a Postgres dump — were both explicitly confirmed present.

✅ **VERIFIED from the repository** — separately, the **season-close document backup** works and is honest about itself. PR #99 (`56e6a2d`). Before it, the close wizard handed the user a ZIP and then deleted the originals — but since PR #83 the columns hold **object keys**, so `fetch(value)` hit the app's own origin, 404'd, and every document was counted as failed. **The archive came out empty.** Worse, the final confirmation screen — the last screen before permanent deletion — read the `downloaded` flag alone and told the user a backup existed when not one byte had been saved. Now each key is signed immediately before it is fetched, and the wizard reports what actually happened.

### 11.2 Recovery — ⚠️ PARTIAL / NOT PROVEN END-TO-END

📜 **PROJECT CONTEXT**

> ### 🔴 The full restore/recovery test was stopped, not completed.
> Restoring Supabase-**managed** Auth and Storage state **collided with the managed project's own state**. The restore path could not be driven to completion, so there is **no verified, repeatable, end-to-end recovery procedure for this system today.**

What this means in practice:

- A good backup exists. **Being able to restore from it has not been demonstrated.**
- The blocker is specifically the **Supabase-managed** surfaces (Auth, Storage), not the SQL dump.
- If asked whether the system can be recovered from backup, the honest answer is: **the backup is complete; the restore has never been proven end to end.**

Do not describe recovery as "done", "complete" or "covered". Do not describe the **backup** as partial — it is not.

### 11.3 Account-access recovery — ✅ VERIFIED (a separate thing again)

✅ **VERIFIED** — `docs/architecture/BREAK_GLASS.md`. A break-glass account exists and **its login has been actually exercised**, not merely created. This is **account-access recovery** — it restores a locked-out administrator, and has nothing to do with data recovery. Its password lives outside the repository, and it is re-verified by real login once before each season.

### 11.4 ⚠️ Migration history

📜 **PROJECT CONTEXT — verify before acting.** Production migration history is understood to be **inconsistent** with the repository's migration folder.

> ### 🔴 `supabase db push` must NOT be used casually against Production.
> Apply migrations deliberately and individually, verify each result, and never assume the repository folder and Production are in sync. This has not been reconciled — see §16.

No credentials, tokens or connection strings appear in this document or anywhere in the repository.

---

## 12. WhatsApp status

✅ **VERIFIED** — **PR #108 is OPEN and intentionally blocked.**

| Field | Value |
|---|---|
| **PR** | [#108](https://github.com/aeltorgoman/alaqsa-hajj/pull/108) — "security: move WhatsApp API credentials server-side" |
| **Branch** | `claude/whatsapp-server-side` |
| **Head** | `c2ab938419d694dacad49d576f4fc8c2d5f032da` |
| **Base** | `main` @ `07820b44` — ⚠️ **stale**, ten PRs behind current `main` |
| **Files** | 3 (`whatsapp-send/index.ts` new, `ReportsPage.tsx`, `_shared/rateLimit.ts`) |
| **Database impact** | **Zero** — no migration, no RLS, no new table |

### What it fixes

`ReportsPage` was pasting the **permanent Meta token into a plain text field**, storing it in `localStorage["wa_token"]`, and sending it from the browser straight to `graph.facebook.com`. A token authorizing messaging as the campaign's phone number was living in **every staff member's browser** — no `httpOnly`, no encryption, no expiry, on every device ever used, with no server layer between it and Meta. Any XSS read it instantly.

### 🔴 Why it must NOT be picked up as the next task

The PR's own description opens with: **"Do not merge and do not deploy yet."** Merging is only step 2 of a **seven-step production cutover** that the project owner must perform, and steps 1, 4, 5, 6 and 7 require access and actions outside this repository:

1. Set two Supabase Edge Function secrets (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`)
2. Merge the PR and deploy `whatsapp-send`
3. Deploy the frontend
4. Positive verification with a `manage_portal` account
5. Negative verification with an account lacking `manage_portal`
6. **Second PR** removing the temporary fallback and clearing `localStorage`
7. **Only then** rotate the Meta token

> ⚠️ **Step 7 must never precede step 6** — revoking the old token before wiping it from browsers breaks the fallback and strands dead copies on devices.

**The current Meta token has not been rotated or revoked.** Until the Meta/phone setup and the owner's cutover sequence exist, **do not continue WhatsApp work.** Also note the base is stale — it will need rebasing onto current `main` before any merge.

---

## 13. Reporting / print architecture

✅ **VERIFIED** — `src/print/` (13 modules).

### R1 — one shell, one manifest (PR #116, `06dd020`)

Unified **the shell and the source**. Whatever door a report is printed from, the paper is identical. This is why `HotelPage` and `ReportsPage` produce byte-identical hotel documents.

### R2 — chrome as a capability (PR #117, `8605451`)

Everything *around* the report body became a **declared capability** (`PrintChrome`): header mode, season, issue stamp, page numbers, scope caption.

> ### The governing rule: **a capability is never a mandate.**
> Every default equals pre-R2 behaviour **exactly**. This was proved, not asserted: across **20 printouts rendered before and after**, exactly one changed at default settings — the combined flights report regaining a campaign header it used to drop, the single approved visible change.

### Accepted rules — do not violate

1. **Atomic physical pages.** Each intended printed page is **one wrapper** sized exactly to the sheet (`box-sizing: border-box`, `overflow: hidden`, `break-inside: avoid`), with `break-before: page` only **between** wrappers and never after the last. The shell then runs `@page { margin: 0 }`, `footer: false`, `header: "none"`.
   - **Why:** shell header, body and footer are otherwise *independent pagination participants* and Chrome breaks between them wherever it likes. This caused blank pages in both Hotel and Documents, and was fixed by measurement — not by millimetre arithmetic.
2. **Hotel print output is FROZEN.** Floor boundaries start new physical pages; room type comes from `rooms.type` with `roomCapacity()`; absent capacity prints «سعة غير محدّدة» — **no number is invented**.
3. **Page numbers only where pagination is by construction.** Chromium implements neither `counter(page)` nor `@page` margin boxes. Numbering is offered **only** where the page count is *computed*, never measured. It was **removed from Finance** because Finance chunks by row count (`PER_PAGE = 30`), not sheet measurement — in 4 of 7 stress cases the number would have lied. **A false number on a financial page is worse than no number.**
4. **Chrome pagination must be proven with actual Chromium physical pages** — never estimated.
5. **Do not reintroduce embed/iframe PDF printing.** The accepted document pipeline is PDF → `pdfjs-dist` → rendered page images → print HTML.

### Deferred — R3 ⏸️

- **Payment Receipt redesign.** Currently A5 and byte-identical to pre-R2. Explicitly deferred to R3.
- **Luggage stickers** — CLOSED, not to be redesigned.

---

## 14. Pilgrim Portal — current work

> ## 🔄 THIS IS WHERE DEVELOPMENT IS STOPPED TODAY.

### PR #118 — verified facts ✅

| Field | Value |
|---|---|
| **PR** | [#118](https://github.com/aeltorgoman/alaqsa-hajj/pull/118) — "Pilgrim Portal — Phase 1: mobile UX (product/UX only, no refactor)" |
| **State** | **OPEN — NOT MERGED** |
| **Branch** | `claude/portal-mobile-ux-phase1` |
| **Head commit** | `de257b7756c22b88f55cd0f09b5184c85b60b94d` |
| **Base** | `main` @ `8605451e01746185747a1157a4248d96867ce56c` (current) |
| **Files changed** | **1** — `src/components/PilgrimPortal.tsx` |
| **Diff** | +279 / −86 |
| **Created** | 2026-09-16 |

### Portal architecture context ✅ **VERIFIED**

- `src/components/PilgrimPortal.tsx` — the **pilgrim-facing** app (912 lines before this PR), mounted at `/hajj`
- `src/components/PortalPage.tsx` — the **staff-facing** admin screen inside `App`. **Different thing. Not in scope.**
- `src/portalSupabase.ts` — a deliberately **session-less** Supabase client (`persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false`, dedicated `storageKey`, and a **no-op storage adapter** as the final guarantee). Its requests always carry the `anon` key, whatever the browser's state. Without this, opening the portal in a logged-in staff member's browser attached their JWT and the RPC returned 403.

### Phase 1 scope — frontend UX only

**Explicitly out of scope and unchanged:** Supabase schema, migrations, RPC signatures/projections, RLS, Edge Function security, pilgrim session architecture, season architecture, push architecture, WhatsApp, staff `PortalPage`, Reports, Finance, Settings.

### Changes implemented

**Flight behaviour** — the one-flight-per-stage *concept* is preserved. What changed is what flips it.

- **Before:** the flip was driven by `getSeasonArafa()` — the Day of Arafat derived from the **device's** Hijri calendar, unrelated to aviation.
- **After:** driven by the outbound flight itself, via `arrival_date` (falling back to `date`) — a field already present in the payload and read by **nothing**.
- Selection: `(outboundDone && back) ? back : (go ?? back)`.
- Dates parsed as **civil days** (built from parts, never `new Date(string)`) so the device timezone cannot shift them backwards a day.

This removed three proven defects:

| Defect | Before | After |
|---|---|---|
| Flip timing | One day after Arafat, not after arrival — a completed outbound flight headlined the screen for weeks | Flips at actual arrival |
| **Reversion** | The 40-day lookback window slid; on day **+41** it returned *next year's* Arafat and reverted to the outbound flight | A past flight stays past (monotonic) |
| Return-only | A pilgrim with only a return flight was told "no flight recorded" | Return flight shown |

**Flight display** — `arrival_date` now rendered; overnight arrival made unambiguous with a `+1` marker plus an explicit strip («الوصول في اليوم التالي — …»); dates formatted for Arabic readers (`Intl` `ar-EG`) instead of raw ISO; مغادرة/وصول labels added; visual identity preserved.

**Arafat countdown** — fully decoupled from flight selection. `getSeasonArafa()` now returns `Date | null`. The **`now + 30 days` fallback is removed** — it presented an invented date as fact, and because it *also* governed flight selection it hid the return flight **permanently** on any device without `islamic-umalqura`. When the date is unknown the countdown simply hides.

**Registration / preparation state** — unavailable operational cards now hide; one calm card replaces the wall of negatives:

> **رحلتك قيد التجهيز** — جاري استكمال ترتيبات رحلتك، وستظهر تفاصيل السكن والتنقل والطيران هنا فور اعتمادها.

No percentages, no checklist, no warning colours. Documents use «سيظهر هنا فور جاهزيته» only where the card is contextually useful, to avoid repeating the message.

**Label/value information unit** — the wide `space-between` row is gone. Label and value now sit adjacent and read as a single unit («الغرفة ١٢٠٤»), value carrying the weight and colour, flowing and wrapping rather than stretching.

**Hotel prefix** — «فندق فندق …» fixed. ⚠️ **Note for future work:** the first attempt used `/^(فندق|…)\b/`, which **never matches** — JS `\b` is defined over `[A-Za-z0-9_]`, so no word boundary exists after an Arabic letter. Corrected to an explicit space/end-of-string boundary. Stored data untouched.

**Long camp names** — wrap naturally instead of fighting their label.

**Urgent banner** — the confirmed overlap bug. Reserved height was a hard-coded `130px`; the banner with a two-line announcement measures **176px** at 360px, covering the campaign name by 30px. Since the text comes from staff, **no constant can be correct.** Now measured with a callback ref + `ResizeObserver`.

**Document UX** — visible loading, visible failure, retry, and an explicit "open in a separate page" fallback for browsers (notably iOS Safari) that will not render a PDF in an iframe. Signing, TTL, `is_pdf` detection and download permissions **untouched**.

**Unread badge** — was `length − seen`, which broke whenever an announcement expired and the count shrank. Now counts announcements whose `id` exceeds the highest seen. Frontend-only.

**Header / logout** — campaign name 36→27px, countdown digits 34→27px, logo 100→74px, so the pilgrim's name leads. Logout is quieter but now a **44px** touch target (was 67×34 — the only sub-44 target in the portal).

### Verification already performed by the implementation ✅

Scenarios were exercised by mounting the **real `PilgrimPortal` component** in headless Chromium at true mobile viewport widths, with dates computed relative to today.

| Check | Result |
|---|---|
| `npm run build` | ✓ built in 1.20s |
| `npm run lint` | **191E / 9W — identical to `main`, delta 0** |
| Horizontal overflow @ 360/390/430 | none — 18/18 cases |
| Touch targets < 44px | none |
| Flight: before / after / go-only / back-only | الذهاب / العودة / الذهاب / العودة ✅ |
| Urgent banner, 3 text lengths × 3 widths | heights 146px → 411px, **zero coverage in all 9** |
| Registration fixture | 1 calm card, **0** negative phrases |

### 🔴 This is NOT user acceptance.

The above is **implementation self-verification in a synthetic harness with stubbed data**. It is not the same as, and does not substitute for, **manual Preview acceptance by the project owner against real data**. For visual/UI work, real Preview is authoritative.

### Critical current state

- **PR #118 is OPEN.**
- **It has NOT been merged.**
- **Phase 1 has NOT received final manual Preview acceptance.**
- **Phase 2 has NOT started.**

### One open judgment call for the owner

The documents card now **hides entirely** during registration rather than showing two «سيظهر هنا فور جاهزيته» rows, to avoid duplicating the preparation message. If it should always be visible, that is a one-line change.

---

## 15. Pilgrim Portal — Phase 2

⏸️ **NOT STARTED. BLOCKED ON PHASE 1 ACCEPTANCE.**

Phase 2 is the component extraction / refactor of `PilgrimPortal.tsx`, deliberately separated from Phase 1 so that UX review and structural review never mix in one diff.

### Rules

1. **Phase 2 begins only after Phase 1 manual UX acceptance and merge.**
2. > ### 🔴 ZERO intentional visual or behavioural change.
   > Phase 2 is a pure structural refactor. Any visual difference is a defect, not an improvement. Verify by byte-comparison or rendered-output comparison, not by eye.
3. **Extract by actual responsibility and reuse — never to satisfy a predetermined list of filenames.** A file-name list was explicitly rejected during Phase 1 planning. If a candidate component has exactly one caller and no independent responsibility, it does not need to exist.
4. Do not split the file merely to reduce its line count.

---

## 16. Deferred / intentionally postponed work

> **Three different things live here. Do not confuse them.**
> ⏸️ **Deferred intentionally** — a decision was made; acting on it now is out of scope.
> 🐛 **Bug** — a real defect, small, fixable when the area is next touched.
> 🔴 **Required before production confidence** — a genuine gap.

### Deferred intentionally ⏸️

| Item | Decision |
|---|---|
| **WhatsApp / Meta setup** (PR #108) | Blocked on owner's Meta/phone setup and a 7-step cutover — §12 |
| **Q5 / ق٥ — soft delete for pilgrims** | Playbook §34 classifies pilgrims and financial records under soft delete; the implementation is a **hard delete**. S8 deliberately did not change this; `old_value` (a full snapshot at deletion) is the compensating control. **Open product decision** |
| **Payment Receipt redesign (R3)** | Reports R3 — §13 |
| **Container cloning between seasons** | Issue #42 §M6 — containers only, deferred |
| **ق٢ / د٣ — role model** | 5 permission combinations for 6 users, i.e. no real roles. Deferring is free because every authorization goes through `has_permission()` |
| **ق٦ — 5-year audit retention mechanism** | Policy is written (`SECURITY_ARCHITECTURE.md` §10); the mechanism is deliberately undesigned (decision D5) |
| **ق١ / ق٣ — vendor support account / vendor portal** | Not approved; conditions in Security Architecture §18.8 |
| **ب٠ / B0 — Bootstrap wizard** | Design approved, not built |
| **Portal privacy / data-exposure review** | Roommates' and family members' **full legal names** (plus family room/floor/bus/camp) are delivered to every co-occupant and cached in `localStorage`. `roommates[].bus_name` and `pilgrim.phone` are delivered and **never used** — trimmable. Defensible, but should be an explicit product decision, and it is a **projection change** so it belongs in its own PR |
| **Push follow-ups** | Core push is live; enhancements deferred |
| **Portal Arafat date from season data** | Would require backend work; out of Phase 1 scope |
| **د١ / أ٨ / أ٦ — `user-admin` alignment** | Behaviour is equivalent today; alignment is a standalone task |
| **د٢ — global passenger fetch on startup** | Blocks tightening the RLS read policy. Long-term architecture (S4 §3.2.1) |
| **ن١٢ — `*_url` columns hold object keys** | Name is misleading since S6. Renaming touches 16 files with **no security gain** |
| **ESLint baseline (ن٥)** | Tracked as a fixed reference and reduced gradually per file touched — **never** fixed in one sweep. Always report a **delta**, not an absolute |

### Bugs / small defects 🐛

| Item | Effect |
|---|---|
| **ن٦** — `handleDocUpload` in `PassengersPage` has no `try/catch` around `Promise.all([uploadDoc, scanDocument])` | A failed scan leaves `docUploading` stuck with no message until page refresh |
| **ن١٣** — the document viewer modal is **duplicated verbatim** in `PassengersPage` (lines ~1726 and ~1745); both render and the second covers the first | Already caused one real bug where a fix in one copy did not appear |
| **ن٧ / ت١** — scan error messages swallowed and shown generically | Cosmetic; real message is in the log |
| **ن٣** — `LoginPage` placeholder still says `admin@company.local` | Cosmetic |

### Required before production confidence 🔴

| Item | Why |
|---|---|
| **End-to-end recovery proof** | **The backup is complete and verified — the gap is the restore.** The restore test was stopped when Supabase-managed Auth/Storage state collided with the managed project. Needs a proven, repeatable restore path — §11.2 |
| **Migration-history reconciliation** | Production and repository are out of sync; `supabase db push` is unsafe — §6, §11 |

---

## 17. Working method

### Preferred workflow

```
feature → focused implementation → build + lint + relevant verification
        → PR → ONE focused diff / visual review → merge → next feature
```

> ### 🔴 Do not create endless assessment loops.
> Assessment that does not end in shipped code is waste. If you find yourself writing a third analysis of the same area without a commit in between, stop and implement.

### Where deep review IS warranted

- Auth, RLS, permissions, security boundaries
- Destructive data operations (deletion, season close, migrations)
- Finance calculations
- Major architecture decisions

### Where deep review is NOT warranted

- Visual/UI work — **real Preview and manual acceptance are authoritative.** Automated assertions on UI are a supplement, never the verdict.

### Verification standards learned the hard way

1. **Test the real thing, not a proxy.** A Finance print feature once "passed" because the check asserted a config property was `true` — a tautology — instead of rendering Finance output. It failed immediately in real Preview.
2. **Measure, do not estimate.** Chrome pagination and element heights must be measured from real rendered output. Millimetre arithmetic was wrong twice.
3. **Check the harness before trusting the result.** During the Portal assessment, apparent horizontal clipping at 360px turned out to be Chromium's ~500px minimum window width, not a product defect.
4. **Report lint as a delta against baseline**, never as an absolute.
5. **Never ship a non-functional control.** A toggle that does nothing is a lie — remove it and say why (this is exactly what happened to Finance page numbers).

### Completion standard

For any code change, report: what changed and why · exact files · database/RLS/RPC/permission/public-surface impact · build result and lint delta (distinguishing legacy from new) · tests run **or an explicit statement that no applicable suite exists** · manual Preview scenarios still required · risks, rollback path, merge recommendation.

**A PR is not ready merely because it builds.**

### Language and communication

The project owner (Abdelaziz) works in Arabic. Code identifiers stay English; Arabic domain values stay **exactly** as stored. Commit messages and inline comments in this repository are written in Arabic prose by convention — match the surrounding style.

---

## 18. Things NOT to reopen

> ### 🔴 This section exists to stop a future assistant from burning the owner's time.

| Do NOT | Why |
|---|---|
| **Reopen S8 (audit log)** | Acceptance closed with final verdicts: 26 pass, 2 blocked, 0 fail, 0 undecided. Needs a **demonstrated defect** to reopen |
| **Reopen S0–S9 generally** | All closed and deployed. Re-auditing for ceremony is waste |
| **Redesign Finance calculations** | Closed in #115 + #104. Requires a **concrete, reproduced defect** |
| **Re-apply already-applied Production migrations** | Production history is inconsistent — re-applying can corrupt state |
| **Use `supabase db push` casually on Production** | See §6, §11. Apply deliberately, verify individually |
| **Continue WhatsApp (PR #108)** | Blocked on Meta/phone setup and the owner's 7-step cutover. Also has a **stale base** |
| **Start Portal Phase 2 before Phase 1 acceptance** | Explicit sequencing decision — §15 |
| **Alter Hotel print output** | Frozen and accepted. Byte-identical across 20 printouts |
| **Reintroduce embed/iframe PDF printing** | Deliberately replaced by the pdfjs pipeline |
| **Add page numbers to Finance printouts** | Proven untruthful in 4 of 7 stress cases and removed on purpose |
| **Introduce Tailwind** | Not in the stack; styling is inline + CSS variables |
| **Introduce multi-tenancy / a `companies` table** | One company per deployment is architectural |
| **Rewrite `getSeasonArafa` to fabricate a date** | The `now + 30 days` fallback was removed deliberately — §14 |
| **Build a "phase engine" for the Portal** | Explicitly rejected; availability-ordering achieves the same |
| **Fix all ESLint errors in one sweep** | Baseline is deliberate; reduce per file touched |
| **Confuse `activeSeason` with `viewedSeason`** | The single most dangerous mistake in the season design — §8 |
| **Expose document object keys to the Portal** | Closed in S6. Portal gets booleans; access goes through `pilgrim-doc` |
| **Store the pilgrim's passport + DOB on their device** | Violates constant أ١٢. Session tokens only |

---

## 19. Remaining roadmap to V1

📜 **PROJECT CONTEXT** — reconstructed from the Product/UX completion programme's observed sequence.

```
1. 🔄 Pilgrim Portal Phase 1 — MANUAL PREVIEW ACCEPTANCE          ← WE ARE HERE
2. ⏸️ Fix only accepted Preview issues, inside PR #118
3. ⏸️ Merge PR #118
4. ⏸️ Portal Phase 2 — component refactor (zero visual change)
5. ⏸️ Settings Product/UX
6. ⏸️ Full-season end-to-end scenario
7. ⏸️ V1 core completion assessment
```

### The full-season end-to-end scenario (step 6)

One pilgrim, walked through the entire lifecycle, verifying that every module agrees at every step:

```
registration → documents → payment → financial group → bus
→ Mina / Arafat → room → flight → Pilgrim Portal → Reports
→ close season → archived read-only → new season
```

This is the **first real exercise of season closure** — note Issue #42's rule: *no real season close before M4 is complete.* Verify that prerequisite before attempting it. Expect this scenario to surface integration defects that no single-module review could.

### V1 completion is assessed only after step 6

Do not declare V1 before the end-to-end scenario passes. The two 🔴 items in §16 (**restore** proof — the backup itself is complete — and migration-history reconciliation) should be weighed in that assessment.

---

## 20. CURRENT EXACT CHECKPOINT

> # 🛑 STOP HERE. READ THIS BEFORE DOING ANYTHING.

### Where we are

**We are waiting for MANUAL PREVIEW REVIEW of Pilgrim Portal Phase 1 in PR #118.**

- `main` = `8605451e01746185747a1157a4248d96867ce56c`
- PR #118 = **OPEN**, head `de257b7756c22b88f55cd0f09b5184c85b60b94d`, base `main` @ `8605451`
- 1 file changed: `src/components/PilgrimPortal.tsx` (+279 / −86)

### What NOT to do

- ### 🔴 Do NOT merge PR #118.
- ### 🔴 Do NOT start Phase 2.
- Do not open a new feature, a new assessment, or a new module.
- Do not touch WhatsApp, Settings, Reports, Finance or any backend.

### The next action — this and nothing else

**Open the PR #118 Vercel Preview and manually inspect the pilgrim experience**, specifically:

| Area | What to look for |
|---|---|
| **Room** | Label and value read as one unit; long hotel names render once (no «فندق فندق») |
| **Bus** | Card hides when unassigned; number prominent when assigned |
| **Mina** | Long camp names wrap without crowding the label |
| **Arafat** | Same; map link reachable |
| **Flight** | Correct leg for the stage; arrival date present; overnight `+1` clear; Arabic dates |
| **Documents** | Loading state, failure state, retry, and the iOS "open in a separate page" fallback |
| **Incomplete registration** | One calm «رحلتك قيد التجهيز» card — **no wall of negatives** |
| **Urgent announcement** | Short, two-line and long Arabic text — **nothing may be covered** |
| **Mobile widths** | 360 / 390 / 430px where practical |

### Then

- **If visual or behavioural issues are found** → fix them **inside PR #118** on branch `claude/portal-mobile-ux-phase1`, re-verify, and re-request review. Do not open a new PR.
- **If accepted** → merge Phase 1, then start Phase 2 under the §15 rules.

### ⚠️ Branch note

The originally designated branch `claude/cool-edison-8x2bot` still points at the **already-merged** PR #117 head (`9daa9e8`), whose content is identical to `main`. Phase 1 was pushed to a **new** branch, `claude/portal-mobile-ux-phase1`, because resetting the old branch required a force-push that policy blocked. Nothing was lost. Use `claude/portal-mobile-ux-phase1` for all Phase 1 follow-ups.

---

## 21. START HERE IN A NEW CHAT

> **Addressed to a new AI assistant or developer picking up this project.**

You are continuing an in-flight, **production** Hajj campaign management system. Real pilgrims' data is in it. Read this block before your first tool call.

### Do this

1. **Read this document first, in full.** It is the map.
2. **Treat `docs/ENGINEERING_PLAYBOOK.md` as authoritative engineering policy.** Treat `docs/architecture/SECURITY_ARCHITECTURE.md` as supreme on security, and **GitHub Issue #42 as authoritative on seasons**. This document orients; those govern.
3. **Verify current GitHub state before acting** — `main`'s SHA, PR #118's state, whether anything merged since 2026-09-17. This document is a snapshot and can go stale.
4. **Continue from §20, "CURRENT EXACT CHECKPOINT."** That is the only live task.
5. **Preserve deferred decisions.** §16 items are decisions, not oversights. Do not "helpfully" implement them.
6. **Ask the owner only when a genuine product decision is required.** Routine engineering judgment is yours to exercise.
7. **Keep responses and plans concise.** Report what changed, what you verified, and what remains.
8. **Prioritize finishing the system over generating assessments.** The project is close to V1. Analysis that does not end in shipped code is waste.

### Do NOT do this

- Do **not** restart completed reviews (§18).
- Do **not** claim tests pass — **there is no test framework**. Say what you actually verified and how.
- Do **not** report lint as an absolute number — report the **delta against baseline**.
- Do **not** run migrations, merge PRs, delete data or deploy without the owner's explicit authorization.
- Do **not** mark something verified that you inferred. Use the evidence markers at the top of this document honestly. When you cannot verify a claim in here, say so rather than repeating it as fact.
- Do **not** treat this document as newer than the repository. **The repository wins.** If they disagree, the repository is right and this document needs updating.

### Fastest orientation commands

```bash
git log --oneline --first-parent main | head -20   # recent merged PRs
ls supabase/migrations/                            # database evolution
cat docs/architecture/BACKLOG.md                   # what is known and deferred
cat docs/architecture/README.md                    # which doc governs what
```

---

*End of Master Handoff. Keep this file updated at each checkpoint change — a stale handoff is worse than none.*
