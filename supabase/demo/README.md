# Demo Environment — Sales Demo Dataset

> ⚠️ **Never run any Demo tooling against Production.**
> Everything under `supabase/demo/` is meant for the dedicated Demo Supabase
> project only. Its tools must refuse any other target, Production above all.
> If you are unsure which project a connection string points at, stop.

**Status:** implemented. The seed, guards, document generator, Storage
loader, reset path and independent verifier are all in this directory.
They were rehearsed end to end on a local, non-production Supabase stack
(seed → verify → reset → seed → verify, identical fingerprints).
Implementation adjustments to the contract are listed in
`demo.manifest.json` → `implementation_adjustments`. Product issues found
along the way, and deliberately not fixed here, are in `BACKLOG.md`.

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

### Generated documents (`tools/generate-demo-documents.mjs`)

The generator produces:

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

## 10. Operator runbook

All tools read their settings from the environment, or from a file named
by `DEMO_ENV_FILE` (template: `demo.env.example`). Keep that file outside
the repository, or name it `*.env` inside `supabase/demo/`, which is
git-ignored. Requirements: `bash`, `psql`, Node ≥ 22, Python 3. Run
`npm ci` once in the repository root, because `seed_first_admin.mjs`
needs `@supabase/supabase-js`.

### 10.1 One-time bootstrap of the persistent Demo project

1. **Create the Demo projects.**
   - Create the Demo Supabase project and the Demo Vercel deployment.
   - Point the Vercel environment variables (`VITE_SUPABASE_URL`,
     `VITE_SUPABASE_ANON_KEY`) at the Demo project only.
2. **Apply migrations.** Apply the repository migrations to the Demo
   project, following the normal migration process (Playbook §4.10).
3. **Place the sentinel.** Do this once, deliberately:
   ```
   DEMO_SENTINEL_CONFIRM=PLACE-DEMO-SENTINEL-<ref> bash supabase/demo/tools/demo-bootstrap-sentinel.sh
   ```
4. **Create the operator.** This reuses `supabase/scripts/seed_first_admin.mjs`
   and grants 11 operational permissions:
   ```
   DEMO_OPERATOR_PASSWORD=… bash supabase/demo/tools/demo-operator.sh
   ```
5. **Deploy Edge Functions to the Demo project**:
   - `pilgrim-doc` and `Scan-passport` are required;
   - `send-pilgrim-push` is optional.

   Then set Demo-only secrets with the Supabase CLI against the Demo ref:
   - `ALLOWED_ORIGINS` (the Demo Vercel origin);
   - `ANTHROPIC_API_KEY` (a Demo-only key, for OCR);
   - optionally the VAPID keys.

   Never reuse Production credentials.

### 10.2 Before each customer demonstration

```
DEMO_RESET_CONFIRM=RESET-DEMO-<ref> bash supabase/demo/tools/demo-refresh.sh
```

This runs reset → seed → generate documents → load Storage → verify, and
stops on the first failure. Each stage runs the guard again on its own.
The command ends with `✓ verify-demo: N checks passed, 0 failed`.

To rehearse the portal without spending the presenter's credential:

```
node supabase/demo/tools/demo-portal-smoke.mjs        # uses DEMO-P-002
```

### 10.3 Reproducibility proof (optional, slower)

```
DEMO_RESET_CONFIRM=RESET-DEMO-<ref> bash supabase/demo/tools/demo-rehearsal.sh
```

This runs refresh → portal smoke → refresh, then compares the two
fingerprints. They must be identical. A fingerprint covers every seeded
business row and the SHA-256 of all 488 Storage objects. The
`determinism.excluded` list in the manifest names what it leaves out:
database ids, wall-clock timestamps, receipt `issued_at`/`issued_by`,
and the passenger id inside object keys.

### 10.4 What each stage does

| Stage | Tool | Writes |
|---|---|---|
| guard | `tools/assert-demo-target.sh` | nothing. It checks: the Production ref is denied in every value; `DEMO_PROJECT_REF` is explicit; every URL belongs to that ref; the sentinel is in the database; `--destructive` has its token |
| dataset | `tools/build-dataset.mjs` (`--check`) | `data/dataset.json` only. It is the single deterministic source, and is re-derived and matched against every manifest count |
| seed | `tools/demo-seed.sh` → `sql/10…70` | DB rows through the normal schema. Every SQL file includes `sql/00_guard.sql` first |
| documents | `tools/generate-demo-documents.mjs` | `.generated/` only (git-ignored) |
| storage | `tools/demo-storage-load.mjs` | It uploads objects, confirms that they exist, and only then writes the references |
| verify | `tools/verify-demo.py` | nothing (read-only session). Expected values come only from the manifest |
| portal smoke | `tools/demo-portal-smoke.mjs` | one real portal session (then revoked), plus rate-limit counters |
| reset | `tools/demo-reset.sh` → `tools/demo-storage-purge.mjs`, `sql/90_reset.sql` | It empties the three Demo buckets, then runs `close_season()` → `delete_season()` |

Seed order: `10` company + archive-era pricing → `20` archived season
(open) → `21` its receipts (as the operator) → `22` `close_season()` opens
1448, then live pricing and season locations → `30` resources → `40`
people → `50` allocation (one `UPDATE` per person, so every
capacity/gender/season trigger checks it) → `60` charges, groups and
receipts (as the operator) → `70` announcements and portal settings (as
the operator).

**Authorization is real.** Finance, announcement and portal steps run
inside a transaction that does `set local role authenticated`, with the
operator's JWT claims. This is exactly what PostgREST does for a
logged-in user. So the following execute for real:

- `has_permission()`;
- RLS insert policies;
- `issue_payment_receipt()` / `cancel_payment_receipt()` numbering;
- `update_active_season()`;
- `update_portal_settings()`.

Nothing in the seed sets `app.season_maintenance`.

### 10.5 What a reset keeps (by design)

- `payment_receipts` rows of the deleted Demo seasons. Receipts are
  immutable in Production, with no bypass. They are invisible in the app
  and excluded from verification by season id. Only recreating the
  project purges them.
- `audit_log`, which is immutable.
- The sentinel.
- The operator account.
- `company_config` row 1 and `pricing_settings`, which the seed rewrites.

### 10.6 OCR readiness (live demo)

- **Input.** The generator writes three walk-in samples that are *not*
  in the database. They are meant to be scanned live as a new pilgrim:
  - `.generated/ocr-samples/walk-in-passport.png`: specimen state
    `UTO`, passport `DX1449901`, name `SAMIR KHALED AL-HADDAD`;
  - `.generated/ocr-samples/walk-in-national-id.png`;
  - `.generated/ocr-samples/walk-in-hajj-permit.png`.

  All three are PNG, which `Scan-passport` accepts. Any seeded pilgrim's
  generated passport or ID under `.generated/people/<ref>/` works too.
- **Needs**
  - `Scan-passport` deployed on the Demo project.
  - `ANTHROPIC_API_KEY` set as a Demo project secret, using a Demo-only
    key that is never committed.
  - An operator login.
- **Expected.** The Latin fields are extracted: passport number, names,
  nationality code, dates. The OCR logic was not changed for the Demo.
- **Not rehearsed here.** No Anthropic key was available in the
  rehearsal environment, and none may be committed. The first live
  check is part of the hosted Demo bootstrap.

### 10.7 WhatsApp (simulated) and Web Push (optional)

- **WhatsApp.** There is no Meta integration in Demo v1. Demonstrate the
  Reports → WhatsApp workflow up to the confirmation step.
  - The synthetic numbers (`+97400…`) are non-routable by design.
  - No delivery history is seeded, so none can be fabricated.
- **Web Push.** No subscription is seeded. To add one real opt-in later:
  1. Set Demo-only `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
     `VAPID_SUBJECT` secrets.
  2. Set `VITE_VAPID_PUBLIC_KEY` on the Demo Vercel deployment.
  3. Deploy `send-pilgrim-push`.
  4. Open the Demo portal on the presenter's device as `DEMO-P-001` and
     accept notifications.

  That creates the only `pilgrim_push_subscriptions` row, through
  `register_pilgrim_push`.

## 11. Files

```
supabase/demo/
├── README.md                  # this runbook
├── BACKLOG.md                 # product findings recorded, not fixed here
├── demo.manifest.json         # the contract (expected state)
├── demo.env.example           # environment template — no values
├── .gitignore                 # .generated/ and *.env never committed
├── data/
│   └── dataset.json           # generated by tools/build-dataset.mjs (deterministic, committed)
├── sql/
│   ├── 00_guard.sql           # in-database guard, included by every file
│   ├── 10_company_profile.sql
│   ├── 20_archive_season.sql
│   ├── 21_archive_finance.sql
│   ├── 22_archive_close.sql
│   ├── 30_active_resources.sql
│   ├── 40_people.sql
│   ├── 50_allocation.sql
│   ├── 60_finance.sql
│   ├── 70_portal.sql
│   ├── 90_reset.sql           # reset only (destructive path)
│   ├── 99_summary.sql
│   └── _resources.sql · _people.sql · _allocation.sql · _receipts.sql · _as_operator.sql
└── tools/
    ├── assert-demo-target.sh       # the guard (pattern of verification/assert-not-production.sh)
    ├── demo-lib.sh · demo-common.mjs
    ├── demo-bootstrap-sentinel.sh  # once per Demo project
    ├── demo-operator.sh            # wraps scripts/seed_first_admin.mjs
    ├── build-dataset.mjs
    ├── demo-seed.sh
    ├── generate-demo-documents.mjs
    ├── demo-storage-load.mjs
    ├── demo-storage-purge.mjs
    ├── demo-reset.sh
    ├── demo-refresh.sh
    ├── demo-portal-smoke.mjs
    ├── demo-rehearsal.sh
    └── verify-demo.py
```

---

> ⚠️ **Again: Demo tooling must never be run against Production.** A refusal
> from a guard is the system working correctly. Do not work around it.
