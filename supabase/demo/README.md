# Demo Environment — Sales Demo Dataset

> ⚠️ **Never run any Demo tooling against Production.**
> Everything under `supabase/demo/` is meant for the dedicated Demo Supabase
> project only. Its tools must refuse any other target, Production above all.
> If you are unsure which project a connection string points at, stop.

**Status:** contract only. Right now this directory has two files: this README
and `demo.manifest.json`. The seed, the document generator, the guard and the
verifier don't exist yet. They will be built against the manifest in later,
separately reviewed steps.

---

## 1. Purpose

A separate, reproducible, **100% synthetic** dataset. It fills a dedicated Demo
Supabase project so that every module of the Hajj Management System looks
operational and believable during customer demonstrations:

- Dashboard
- Operations Room
- Pilgrims
- Finance
- Buses
- Camps
- Hotel
- Flights
- Reports
- Seasons archive
- Pilgrim Portal
- Company identity

The dataset exists to **demonstrate the product**, not to maximise row count.
Every count in the manifest is there to make a specific screen, filter, alert
or report show something meaningful.

## 2. What this is not — explicit separation

| Thing | Relationship to the Demo |
|---|---|
| **Production** | No connection, no shared credentials, no shared data. No Production record is copied, anonymised, transformed or used as a template. |
| `supabase/seed.sql` | Stays the **intentionally empty** local bootstrap (Engineering Playbook §4.8). The Demo never adds rows there and is never invoked from it. `db push` / `db reset` never run Demo files. |
| `supabase/scripts/seed_test_seasons.sql` | Stays dedicated to Season-Architecture acceptance testing. The Demo doesn't call it, import it or extend it. Its patterns are reused **conceptually** only. |
| `supabase/migrations/` | The Demo never alters the schema. It populates the schema exactly as the migrations define it. |

## 3. Environment architecture (approved)

- **Persistent, dedicated Demo Supabase project.** It has its own project ref,
  its own keys and its own Edge Function secrets.
- **Persistent, dedicated Demo Vercel deployment.** Its environment variables
  point only at the Demo Supabase project.
- This is **not** a throwaway preview. It must be resettable and reproducible
  on demand before every customer demonstration.

## 4. Safety principles (approved)

1. **Production is never a valid target.** The Production ref is denied by a
   hard-coded check, using the same pattern as
   `supabase/verification/assert-not-production.sh`.
2. **The target must be explicitly allowed.** The Demo project ref has to be
   supplied explicitly. A missing, malformed or unrecognised target is refused.
3. **There is an in-database Demo sentinel.** Seed and reset abort unless the
   connected database carries a Demo marker. That marker is placed once,
   deliberately and by hand, in the Demo project only. A forgotten CLI flag is
   never the only protection.
4. **Every step re-asserts the guards.** Each step that connects or writes runs
   the guards before it opens a connection. Asserting once at the top isn't
   enough.
5. **Destructive actions need extra intent.** A reset requires an additional
   explicit confirmation on top of the target guards.
6. **Database protections are never weakened.** RLS, triggers, constraints,
   season isolation, permissions and grants stay exactly as in Production.
   - `app.season_maintenance` is **never** used while seeding.
   - It may be considered only inside the destructive reset path, and only if
     the existing `delete_season()` workflow is proven insufficient. Even then
     it is used after all guards pass, transaction-locally, documented
     explicitly, and never in Production.
7. **The repository holds no secrets.** That means no passwords, API keys,
   service-role keys or project refs. Demo credentials live only in an
   uncommitted local environment and in the Demo project's secret store.
8. **Production credentials are not reused.** No Production API credential
   (Anthropic, Meta/WhatsApp, VAPID or Supabase) is reused unless that is
   explicitly approved later.

## 5. Dataset strategy (approved)

- **Two seasons:**
  - one **archived** season (1447), closed through the real `close_season()`
    RPC with its own pricing snapshot;
  - one **active** season (1448).
- **Active season: 120 `حاج` + 6 non-Hajj rows** (3 `مرافق`, 2 `مشرف`,
  1 `إداري`). Dashboard, Reports and Finance count `حاج` only, so every
  headline figure reads 120.
- **Realistic-looking Arabic and English names.** Every identifier is
  synthetic:
  - passports: `DX` + 7 digits;
  - national IDs: 14 digits beginning with `99`;
  - phones: a documented non-routable range only;
  - every row is tagged `created_by = 'demo-seed'`.
- **Families, financial groups and gaps:**
  - families and financial groups with realistic sizes;
  - fully paid, partial, unpaid and credit-balance accounts;
  - discounts, add-ons and custom charges;
  - deliberate Operations Room gaps (missing documents, missing allocations,
    expiring passports, duplicate phones).
- **Commercial service columns are written explicitly.** These are `bus`,
  `flight`, `hotel_type`, `hotel_view`, `camp_mina`, `camp_arafa` and
  `custom_price`, and Finance is computed from them. They are kept coherent
  with the actual allocation:
  - VIP payers sit on the VIP bus;
  - `خاص` payers sit in `خاص` camps and rooms;
  - one or two deliberate mismatches show the Finance context rows.
- **The seed exercises the normal production path:**
  - season defaults and closed-season guards;
  - capacity, gender and cross-season triggers;
  - receipt RPCs (`issue_payment_receipt`, `cancel_payment_receipt`), run as
    an authenticated Demo staff identity.
- **One deterministic Portal pilgrim** (`DEMO-P-001`) plus a rehearsal pilgrim
  (`DEMO-P-002`). Both are synthetic, non-secret by design and valid only in
  the Demo project.

Exact expected counts live in **`demo.manifest.json`**. That file is the
contract.

## 6. `DEMO_ANCHOR_DATE`

- `DEMO_ANCHOR_DATE` is declared in `demo.manifest.json` (currently
  **`2026-10-01`**).
- Every seeded business date is the anchor plus or minus a fixed offset. This
  covers:
  - payment dates;
  - passport and ID expiry;
  - flight dates;
  - announcement `show_at` and `expires_at`.
- These are forbidden in seeded business data: `CURRENT_DATE`, `now()`,
  `clock_timestamp()`, `random()`.
- Wall-clock system metadata is **outside** the determinism contract:
  `created_at`, receipt `issued_at` and `cancelled_at`, the audit log, and
  Storage timestamps.
- **Drift.** The application evaluates expiry alerts, announcement visibility
  and the travel phase against the *real* date. The manifest's expected counts
  hold while the real date is within the declared drift window after the
  anchor.
- **Changing the anchor** is a deliberate, reviewed change to the manifest,
  followed by a reset and reseed.

## 7. Synthetic-data policy

- No real person, Production row or real document is ever stored, copied,
  anonymised or transformed into Demo data.
- Names come from a fixed synthetic pool. Identifiers follow the patterns in
  §5.
- Company identity is fictitious, and bank details are visibly non-functional.
- The data contains no real company's branding.
- Airline names are chosen only so that the existing report-logo mapping
  renders. Flight numbers are synthetic.

## 8. Storage truthfulness rule

> **Non-null database reference = existing, openable Demo Storage object.**

The rule applies to all six passenger document columns:

- `photo_url`
- `passport_url`
- `national_id_url`
- `contract_url`
- `hajj_permit_url`
- `flight_ticket_url`

It also applies to every `company_assets` row.

- No fake or nonexistent key is ever used to drive a count. A presenter must
  never see a document listed as present and then fail to open it.
- Every object is referenced exactly once, and no orphan objects are allowed.
- **Archived-season pilgrims carry no document references.** The real
  season-close workflow removes a closed season's objects from
  `passengers-docs`, so references there would point at nothing.

| Bucket | Visibility | Stored value | Object key shape |
|---|---|---|---|
| `passengers-docs` | private | object key | `<passenger_id>/<doc_type>_demo.<ext>`, where `doc_type` is `photo`, `passport`, `national_id`, `contract`, `hajj_permit` or `flight_ticket` |
| `company-assets` | public | full public URL | `<asset_key>_demo.<ext>`, for `logo`, `favicon`, `portal_banner`, `dashboard_banner` |
| `company-private` | private | object key | `<asset_key>_demo.<ext>`, for `company_stamp`, `manager_signature` |

Files must be PNG, JPEG or PDF, and their magic bytes must match the extension.
The app's document fetch rejects anything else.

### Generated documents (later step)

The future generator produces:

- generated passport
- generated national ID
- **geometric avatar** for the personal photo
- generated contract
- generated Hajj permit
- generated flight ticket
- company logo, banner, favicon, stamp and signature

Rules for every generated asset:

- It is visibly marked **"DEMO — NOT A REAL DOCUMENT"**.
- No human faces, real or AI-generated.
- No real branding.
- MRZ and check digits are deliberately invalid.
- It is deterministic from the passenger ref.
- Assets are generated at runtime and never committed as binaries.

## 9. External services

| Service | Demo v1 | Notes |
|---|---|---|
| OCR (`Scan-passport`) | **Live** | Deployed on the Demo project with a **Demo-only** Anthropic key held as a Demo project secret. The generated passport, ID and permit images are the scan input. |
| WhatsApp (`whatsapp-send`) | **Simulated** | No live Meta delivery. The workflow is shown up to the UI confirmation step, and no fabricated "sent" history is seeded. |
| Web Push | **Optional, later** | Needs Demo-only VAPID keys and a real browser opt-in on the presenter's device. No push subscriptions or delivery rows are seeded. |
| Document opening (`pilgrim-doc`, signed URLs) | **Live** | Needs real objects (§8), plus the Demo frontend origin in the Edge CORS allowlist. |
| Staff login | **Setup step** | Uses the existing `scripts/seed_first_admin.mjs` pattern. The repository holds no passwords. |

## 10. Lifecycle (high level)

1. **Bootstrap (once).**
   - Create the Demo Supabase project and the Demo Vercel deployment.
   - Apply migrations.
   - Place the Demo sentinel.
   - Create the Demo staff account.
   - Deploy the Edge Functions and set Demo-only secrets.
2. **Seed.**
   - Guards run first.
   - The archived season is populated while open, then closed with
     `close_season()`.
   - Live pricing changes.
   - The active season is populated: master data, pilgrims, allocation,
     finance through the receipt RPCs, announcements and portal settings.
   - Business data is deterministic from `DEMO_ANCHOR_DATE`.
3. **Load Storage.**
   - Guards run first.
   - Documents are generated, then uploaded to fixed keys.
   - Reference columns are written only for objects that actually uploaded.
4. **Verify.**
   - Guards run first.
   - Independent queries assert every manifest expectation: counts,
     occupancy, finance states, alert counts, receipt numbering, and
     bidirectional reference ↔ object reconciliation.
   - The seed never acts as its own witness.
5. **Reset** (before or after a customer demo).
   - Guards run first, plus the destructive confirmation.
   - Demo Storage objects are purged first.
   - Demo rows are removed in a constraint-safe order, using `delete_season()`
     for the archived season.
   - Then seed → load → verify again. Same anchor means the same dataset.

## 11. Files that will belong here

```
supabase/demo/
├── README.md                        # this runbook
├── demo.manifest.json               # expected-state contract
├── sql/                             # ordered, guard-first seed steps (later)
│   ├── 00_guard.sql
│   ├── 10_company_profile.sql
│   ├── 20_archive_season.sql
│   ├── 30_active_season.sql
│   ├── 40_pilgrims.sql
│   ├── 50_allocation.sql
│   ├── 60_finance.sql
│   ├── 70_portal.sql
│   └── 99_summary.sql
└── tools/                           # later
    ├── assert-demo-target.sh        # Production denylist + explicit allowlist
    ├── demo-seed.sh
    ├── demo-reset.sh
    ├── generate-demo-documents.mjs
    ├── demo-storage-load.mjs
    ├── demo-storage-purge.mjs
    └── verify-demo.py               # asserts demo.manifest.json
```

Generated document files go to a git-ignored working directory and are never
committed.

---

> ⚠️ **Again: Demo tooling must never be run against Production.** A refusal
> from a guard is the system working correctly. Do not work around it.
