# Company Profile Architecture Review

**Status:** Approved and implemented (Phases 1–2)
**Scope:** One company per Supabase project, Vercel deployment, and database  
**Non-goal:** SaaS or multi-tenancy

## Executive decision

Keep `company_config` as the single-row, deployment-level source of truth. Do
not create a `companies` table, tenant identifier, membership model, or company
selector. Evolve the existing configuration into a typed **Company Profile**,
loaded once by `ConfigProvider` and consumed through domain-specific selectors.

This document preserves the approved design review and the reasoning that led to
the implementation. The completed implementation is recorded in
`COMPANY_PROFILE_PHASE1.md` and `COMPANY_PROFILE_PHASE2.md`. Any references below
to proposed work or approval gates are historical planning context, not the
current implementation status.

## 1. Current implementation

### Database

`company_config` is a single row addressed as `id = 1`. It currently stores:

- identity: `name_ar`, `name_en`, `tagline`, `logo_url`;
- visual settings: `color_primary`, `color_accent`, `color_sidebar`,
  `banner_image_url`, `banner_position`, `banner_position_x`;
- contact: `contact_phone`, `contact_email`, `country`, `city`;
- display: `season_label`;
- portal/operator values: `admin_name`, `admin_phone`, `admin_whatsapp`;
- operational-location values: `hotel_name`, hotel/camp addresses and map URLs;
- feature flags in `features` JSONB.

The baseline enables RLS but gives `company_config` an `allow all` policy.
The pilgrim portal RPC serializes selected company fields into its response.

### Frontend

- `AppConfig` is the frontend contract and `DEFAULT_CONFIG` is its fallback.
- `ConfigProvider` reads row 1, shallow-merges it over defaults, and provides it
  through `useConfig()`.
- `ThemeProvider` is nested under `ConfigProvider`, but it selects one of four
  static theme palettes rather than applying all configured colors.
- `UsersPage` is the current editor. It only edits names, tagline, phone, email,
  season label, two colors, logo, and dashboard banner.
- Dashboard, reports, finance prints, passenger exports, login, and parts of the
  portal already consume some configuration.
- Portal configuration is duplicated in a local `PortalConfig` type and in the
  RPC JSON projection rather than sharing the `AppConfig` contract.

### Boot and public surfaces

- A reduced profile is cached under `aqsa_boot_config` to brand the loading
  screen.
- `index.html` owns a static title and favicon before React loads.
- `portalManifest.ts` generates a manifest and icon from runtime configuration.
- The service worker has its own hardcoded notification-title fallback.

## 2. Existing strengths

1. The correct one-company-per-deployment aggregate already exists.
2. Configuration loading is centralized and has safe generic defaults.
3. Branding is already propagated to many high-value print/report paths.
4. Feature flags are data-driven and should remain so.
5. Logo and banner URLs avoid bundling customer media in source code.
6. The portal RPC can expose a deliberately selected public subset rather than
   the complete internal profile.
7. The existing `id = 1` convention permits an incremental, backward-compatible
   migration without changing foreign keys or business tables.

## 3. Existing weaknesses

### Contract and ownership

- `AppConfig`, generated database types, `PortalConfig`, form state, RPC JSON,
  print branding arguments, and manifest options are separate partial contracts.
  They can drift silently.
- The shallow merge does not validate malformed colors, URLs, enum values, or
  the nested `features` object.
- Company identity, portal contact, hotel/camp data, and seasonal display data
  are mixed in one unstructured editor.
- `season_label` duplicates a season concern. It is useful for compatibility,
  but `default_season_name` should be the company default while the active
  season remains authoritative at runtime.
- `admin_*`, `hotel_*`, and `camp_*` are ambiguous: some are company-profile
  values and some are operational data that can change by season.

### Presentation

- Selecting a static theme can override or ignore configured company colors.
- Default burgundy/gold values are repeated in components and print templates.
- Print functions accept long positional branding parameter lists and also
  define Alaqsa-specific defaults; omitted arguments reintroduce old branding.
- Report header/footer/stamp/signature are not modelled as reusable profile
  assets.
- Login has a fixed background, uses the main logo instead of a login-specific
  logo, and appends a fixed country label.
- Portal welcome/help/legal text and parts of its visual palette are fixed.

### Security and lifecycle

- `company_config` is writable under an `allow all` RLS policy. Profile editing
  needs an authenticated management permission; public consumers need only a
  safe projection.
- Company uploads currently reuse the passenger document upload path and the
  synthetic passenger id `0`; company assets need a dedicated storage path and
  policy.
- WhatsApp access tokens and phone IDs are currently persisted in local storage
  by `ReportsPage`. Tokens are secrets and must move to environment variables or
  a server-side integration. They must never become Company Profile fields.
- `ConfigProvider` has no explicit refresh/update API, schema version, or
  normalized cache invalidation strategy.

## 4. Required database changes

### Fields that remain authoritative

Keep these columns without semantic change:

`name_ar`, `name_en`, `tagline`, `logo_url`, `color_primary`, `color_accent`,
`contact_phone`, `contact_email`, `country`, `city`, `features`,
`banner_image_url`, `banner_position`, and `banner_position_x`.

Keep `color_sidebar` for compatibility. It becomes a legacy/custom surface color
unless the final theme contract explicitly promotes it.

### Fields to add

All additions should be nullable initially or have generic, product-level
defaults. No customer-specific default belongs in a migration.

| Section | Proposed columns |
| --- | --- |
| Identity | `short_name`, `favicon_url`, `login_logo_url`, `color_secondary` |
| Contact | `contact_whatsapp`, `website_url`, `address`, `google_maps_url` |
| Legal | `commercial_registration`, `license_number`, `hajj_campaign_license`, `tax_number` |
| Financial | `bank_name`, `bank_account_name`, `bank_account_number`, `bank_iban`, `bank_swift`, `payment_qr_url`, `default_currency` |
| System defaults | `default_language`, `time_zone`, `date_format`, `time_format`, `default_season_name`, `default_nationality`, `default_passenger_type` |
| Branding | `report_header_url`, `report_footer_text`, `company_stamp_url`, `manager_signature_url`, `portal_banner_url`, `login_background_url` |
| Communication | `whatsapp_business_number`, `whatsapp_sender_name`, `reply_email` |
| Pilgrim portal | `portal_welcome_message`, `portal_help_message`, `portal_support_phone`, `terms_and_conditions`, `privacy_policy` |
| Operational defaults | `default_bus_capacity`, `default_room_capacity`, `default_hotel_room_type`, `default_flight_class` |
| Lifecycle | `updated_at` |

Use ISO 4217 codes for `default_currency` (initial generic fallback: `QAR` only
for backward compatibility), IANA identifiers for `time_zone`, and constrained
application enums for language/date/time formats. Capacity defaults must be
positive when present. URL and color validation should be shared between the
form and database checks where practical.

### Rename/deprecation map

Do not physically rename or drop columns in the first migration.

| Existing | Canonical replacement | Compatibility behavior |
| --- | --- | --- |
| `season_label` | `default_season_name` | Read new value first, then legacy value; active season still wins in operational screens. |
| `admin_phone` | `portal_support_phone` | Dual-read; stop writing legacy after migration. |
| `admin_whatsapp` | `contact_whatsapp` or `whatsapp_business_number` | Map by purpose during data migration; do not assume both concepts are identical. |
| `admin_name` | none yet | Retain until a manager/contact ownership decision is approved. |
| `banner_image_url` | remains dashboard banner | Do not reuse it for portal or login; the new assets are separate. |
| `hotel_*`, `camp_*` | season/operations data | Retain for portal compatibility, mark deprecated, and migrate only after the operational model has an authoritative replacement. |
| `color_sidebar` | theme surface token | Retain; stop exposing it as an independent brand identity color unless design approves it. |

### Single-row invariant and access

- Add a check enforcing `id = 1`; seed/upsert the row idempotently.
- Replace `allow all` with explicit policies: authenticated read, authorized
  update using the existing permission architecture, and no client-side insert
  or delete.
- Public portal access must continue through a safe RPC/view containing only
  public identity, contact, branding, and portal-policy fields. Legal and bank
  data must not be returned by default.
- Keep feature flags as JSONB, but normalize them against a typed default map so
  a missing key is deterministic. Do not place secrets in this JSON.

## 5. Required frontend changes

1. Rename the conceptual contract from branding-oriented `AppConfig` to
   `CompanyProfile` while temporarily exporting `AppConfig` as a compatibility
   alias.
2. Split the contract into typed logical sections/selectors (`identity`,
   `contact`, `legal`, `financial`, `systemDefaults`, `branding`,
   `communication`, `portal`, `operationalDefaults`, `features`) without changing
   the one-row database representation.
3. Add one normalization function that converts a database row into a complete,
   validated profile and performs all legacy fallbacks. Components must never
   invent their own company-name or color fallback.
4. Expose focused hooks such as `useCompanyIdentity()`, `useReportBranding()`,
   and `usePortalProfile()`; keep `useConfig()` during migration.
5. Replace the long settings form with section components backed by a single
   draft/profile update service. This is an architecture/UI organization change,
   not a workflow redesign.
6. Provide a single `CompanyAsset` upload abstraction and dedicated storage
   paths for logo, favicon, login, portal, report, stamp, and signature assets.
7. Introduce `applyDocumentBranding(profile)` to update title, description,
   favicon, theme color, and manifest after configuration loads. Keep generic
   HTML fallbacks for first paint.
8. Make configured brand colors the base CSS variables. Theme presets may derive
   neutral/surface tokens, but must not replace company identity colors unless
   the user explicitly chooses that behavior.
9. Centralize storage keys in a generic `storageKeys.ts`; version serialized
   values and migrate old keys once.

## 6. Required backend changes

- Extend the portal RPC projection only with approved public fields: identity,
  portal messages, support contact, terms/privacy, portal banner, and relevant
  feature flags.
- Update the push delivery path so the server/service worker receives a generic
  fallback or configured sender name; never hardcode a customer name.
- Add authorized Company Profile update and asset-upload boundaries. Prefer an
  authenticated database policy for ordinary fields and a controlled storage
  policy; use an Edge Function only where privileged processing is required.
- Move WhatsApp credentials to deployment environment variables and make sends
  through a backend/Edge Function. The profile may store only non-secret sender
  identity and reply/contact information.
- Do not add a company id to seasons or business tables. Deployment isolation is
  the company boundary.

## 7. Hardcoded company-specific values inventory

### Explicit Alaqsa/Qatar identity

| Location | Finding | Required direction |
| --- | --- | --- |
| `index.html` | Static `حملة الأقصى` title, static `/favicon.svg`, gold brand-mark colors | Generic first-paint metadata, then runtime profile metadata/assets. |
| `public/sw-push.js` | Notification title fallback `حملة الأقصى` | Configured sender/title supplied in payload; generic offline fallback. |
| `src/config/ConfigContext.tsx` | `aqsa_boot_config` and `aqsa-*` animation names; burgundy/gold boot fallbacks | Rename persisted key with compatibility migration; animation names are cosmetic but should become generic. |
| `src/config/ThemeContext.tsx` | `qatar-heritage` default and “التراث القطري” customer/geography naming | Use a neutral preset id/name; map the old id for stored-value compatibility. |
| `src/styles/themes.css` | “حملة الأقصى” comment and Qatar preset as root default | Generic documentation and profile-driven identity tokens. |
| `src/components/LoginPage.tsx` | Fixed `#5C1830` background, main logo reused, `دولة قطر` footer | Use login background/logo and configured country. |
| `src/components/DashboardBanner.tsx` | `حملة الأقصى`, fixed fallback tagline, fixed palette fragments | Consume normalized identity and branding selectors. |
| `src/components/AdminsPage.tsx` | Entire administrators report calls `makeHTML` with Alaqsa name, empty logo/tagline, and fixed colors | Use report branding selector. |
| `src/components/PassengersPage.tsx` | Alaqsa report/export fallbacks and repeated colors | Pass one normalized report-branding object. |
| `src/components/FinancePage.tsx` | Alaqsa name and fixed print-color fallbacks | Pass one normalized report-branding object. |
| `src/components/ReportsPage.tsx` | Alaqsa name and fixed print-color fallbacks | Pass one normalized report-branding object. |
| `src/components/finance/finance.print.ts` | Four Alaqsa default names, QAR label `ر.ق`, fixed brand defaults | Require branding/currency context; keep only neutral technical defaults. |
| `src/utils/index.ts` | Alaqsa defaults in shared print helpers plus burgundy/gold card templates | Accept typed `ReportBranding`/`CardBranding`; no customer fallback in low-level helpers. |
| `src/utils/portalManifest.ts` | Alaqsa fallback name | Use normalized generic/profile value. |
| `src/components/PilgrimPortal.tsx` | Fixed burgundy/gold palette, `HAJJ GROUP`, fixed welcome/help/push/legal copy | Read portal identity/messages/policies from the public profile projection. |
| `supabase/README.md` and baseline comments | “نظام الأقصى” documentation labels | Rename documentation only; migration filenames/history remain immutable. |
| `package.json` | Package name `alaqsa-hajj` | Change only if deployment tooling confirms no dependency; it is not user-visible runtime configuration. |

Occurrences of “Qatar Airways”, Qatar airline logos, nationality “قطري”, and
report country codes are domain data/options, not company branding. They should
not be removed as part of this refactor. Default nationality and currency,
however, must become Company Profile defaults rather than implicit Qatar policy.

### Local/session storage review

Only `aqsa_boot_config` is directly customer-specific. Rename it to a versioned
generic key such as `hajj.company-profile.boot.v1`, read the old key once, write
the new key, then remove the old key. The `hajj_*`, `portal_*`,
`__hajj_pkg_filter__`, and `stk_print_dates` keys are product/domain-specific and
can remain, but should be centralized and versioned over time.

`wa_token` is a secret stored in local storage and `wa_phone_id` is integration
configuration. Remove both from browser persistence when the backend send path
is introduced. `wa_template` may remain a non-secret configuration/template but
should be server-managed if shared across operators.

### Assets review

- `public/favicon.svg` and the inline `brand-mark` in `index.html` are visual
  branding surfaces. Keep a generic fallback in the bundle, but use
  `favicon_url` and `logo_url` after profile load.
- `src/assets/hero.png` is not referenced by the application and should be
  verified before later removal; no removal belongs in this architecture task.
- `src/assets/react.svg` and `src/assets/vite.svg` are unused template assets and
  are not company branding.
- `attached_assets/image_*.png` are not referenced by runtime source. Treat them
  as design/source attachments until ownership is confirmed; do not promote them
  to defaults.
- `public/icons.svg` contains shared application icons and is product-level,
  while generated portal icons should continue deriving from the profile.

### Reports and printable documents review

The following print families must converge on a required `ReportBranding`
object: generic `makeHTML` reports, passenger list/Excel summary, administrator
list, flight reports, camp reports, all `finance.print.ts` documents, delivery
reports, hotel cards, luggage cards, room cards, and pilgrim cards. Header,
footer, logo, company name, tagline, colors, currency, stamp, and manager
signature must be resolved once at the boundary. Report titles such as “كشف
الحجاج” remain business text, not company configuration.

## 8. Proposed migration plan

### Phase 0 — approval and contract freeze

Approve this review, field names, public/private classification, and the
deprecation map. No runtime changes.

### Phase 1 — additive schema

Add nullable columns, constraints, `updated_at`, the single-row invariant, and
safe RLS policies. Backfill only unambiguous aliases. Regenerate database types.
Do not drop or rename legacy columns.

### Phase 2 — normalized read architecture

Introduce `CompanyProfile`, defaults, validation/normalization, selectors, and
legacy dual-read logic. Keep `AppConfig`/`useConfig()` compatibility exports.
Add contract tests for a minimal legacy row and a complete new row.

### Phase 3 — settings and assets

Build sectioned profile editing on the same row, add dedicated company asset
storage, and dual-write only where an older deployed consumer still requires a
legacy column.

### Phase 4 — consumption migration

Migrate metadata/login/theme first, then dashboard, portal, reports/printing,
manifest/push, and finally local-storage keys. Each slice must preserve existing
output when only legacy fields are populated.

### Phase 5 — secrets and backend boundary

Move WhatsApp sending and credentials server-side. Restrict the full profile and
publish only the portal-safe projection.

### Phase 6 — deprecation cleanup

After at least one production release and a data audit, stop dual writes. Column
removal requires a separate approved migration and is explicitly outside this
task.

## 9. Backward compatibility considerations

- Existing row 1 and all existing fields continue to work.
- New fields are optional initially; normalized generic/legacy fallbacks preserve
  current rendering.
- `features` is deep-merged per key rather than replaced wholesale.
- Old theme and storage key values are mapped rather than invalidated.
- Existing portal links remain valid; the RPC response is additive.
- Existing print functions receive an adapter until every caller uses
  `ReportBranding`.
- Existing asset URLs remain valid. Moving files is copy-first, never destructive.
- Database migration order remains immutable; only new additive migrations are
  introduced.

## 10. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| A partially filled profile creates inconsistent output | One normalizer and completeness diagnostics in settings. |
| Public portal leaks legal/bank/internal fields | Explicit public DTO/RPC projection; never `select *`. |
| Feature JSON loses keys on update | Deep merge and schema validation. |
| Theme preference defeats company brand | Separate identity tokens from neutral appearance/theme tokens. |
| Asset URLs break because of storage migration | Copy, verify, switch URL, retain old object through a rollback window. |
| Old clients and new schema disagree | Additive columns, compatibility aliases, dual-read before dual-write removal. |
| Rich legal text enables unsafe HTML | Store text/approved markup format and sanitize at rendering boundaries. |
| Time zone/date defaults change historical meaning | Apply defaults only to new/display operations; store canonical timestamps. |
| Operational defaults overwrite real business data | Apply only during creation and never reapply to existing records. |
| Configuration becomes a secret store | Field allowlist, documentation, and server environment variables for secrets. |
| One oversized context rerenders the application | Stable normalized object and focused selectors/hooks. |

## 11. Final recommended architecture

```text
one deployment
  └── company_config (exactly row id=1)
        ├── private CompanyProfile (management UI)
        ├── PublicCompanyProfile (portal/manifest/push projection)
        ├── ReportBranding (print selector)
        └── SystemDefaults (creation/display defaults only)

Supabase row
  -> generated Row type
  -> normalizeCompanyProfile(row, legacyFallbacks)
  -> ConfigProvider
  -> focused selectors/hooks
  -> UI, portal, reports, print, metadata
```

The database row is the persistence source of truth; the normalizer is the only
compatibility/defaulting boundary; focused projections are the only consumption
contracts. Customer onboarding becomes: deploy the standard code, apply the
standard migrations, upload company assets, complete Company Profile settings,
and configure secrets in deployment environment variables. No source edit,
tenant model, or business-workflow change is required.

## Historical approval gates

1. Approve the proposed column names and legacy mapping.
2. Decide whether `admin_name` belongs to Company Profile or a future staff
   directory.
3. Confirm where season-specific hotel/camp contact data will ultimately live.
4. Approve the public portal projection and legal-text format.
5. Approve the theme rule: company identity colors always win over presets.
6. Approve the RLS/update permission and dedicated company asset storage policy.

These decisions were approved before Phase 1 implementation. The section is
retained as the historical decision record.
