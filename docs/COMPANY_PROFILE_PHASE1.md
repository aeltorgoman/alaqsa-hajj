# Company Profile Refactoring — Phase 1

**Status:** Completed. Superseded as current-state guidance by
`COMPANY_PROFILE_PHASE2.md`; retained as migration history.

Phase 1 implements the approved, single-company-per-deployment architecture.
`company_config` remains the configuration row; no tenant or company selector is
introduced.

## Delivered

- Logical, typed Identity, Contact, Financial, Branding, Portal, and Assets
  modules under `src/company`.
- A normalization boundary and focused hooks/selectors while retaining
  `AppConfig` and `useConfig()` for backward compatibility.
- An extensible `company_assets` key/value table. Existing logo and dashboard
  banner URLs are seeded and continue to be written to their legacy columns.
- The approved five bank text fields. Payment QR is represented by the
  `payment_qr` company asset key rather than another URL column.
- Extensible portal settings plus welcome/help messages. Existing portal
  sections now honor flight, room, bus, document, notification, download,
  roommate, and lost-card visibility without changing their workflows.
- The login surface consumes the Company Service and supports `login_logo` and
  `login_background` assets, with legacy logo/color fallbacks.
- The portal RPC publishes only the new portal settings/messages and public
  asset URL map in addition to its existing payload.

## Compatibility

The migration is additive. It removes or renames no column. All portal switches
default to the previous visible behavior, except financial balance which remains
off because the current portal has no balance view. Legacy `features` flags,
`logo_url`, and `banner_image_url` are still read. A missing `company_assets`
query is treated as an empty legacy asset set.

## Deferred from Phase 1

- Theme Engine.
- Configuration versioning.
- Integrations and secret handling.
- New portal financial-balance, QR-code, or document-generation features.
- Migration of the remaining components from `useConfig()` to focused hooks.
- Dedicated asset-management UI for every future asset key; the reusable service
  and database layer are ready, while existing logo/banner controls dual-write.
