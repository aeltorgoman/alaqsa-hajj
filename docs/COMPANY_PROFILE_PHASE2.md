# Company Profile Refactoring — Phase 2

**Status:** Completed — authoritative implementation record. The mandatory
engineering rules are maintained in `ENGINEERING_PLAYBOOK.md` §73.

Phase 2 completes application consumption through Company Service. UI
components no longer import `useConfig`, query `company_config`, or construct
branding from database-shaped objects.

## Completed

- Migrated dashboard, top bar, hotel, buses, camps, flights, passengers,
  administrators, finance, reports, settings, portal administration, and login
  to focused Company Profile hooks or Company Service commands.
- Made `ReportBranding` a required, strongly typed object for the shared report
  and finance-print entry points; removed campaign-specific print defaults.
- Resolved logos and banners through Company Assets with legacy fallback only in
  the normalization boundary.
- Applied runtime document title, favicon, theme color, and OpenGraph title from
  Company Profile; portal manifest metadata uses its public profile projection.
- Replaced the customer-specific notification fallback and HTML title with
  generic product fallbacks.
- Migrated the customer-specific boot cache key while retaining a one-time read
  and removal of the old key.
- Removed the unused legacy `reportUtils.ts` implementation.

## Intentional compatibility boundaries

- `AppConfig` and `DEFAULT_CONFIG` now exist only inside `ConfigProvider` and the
  Company Service normalizer. They are not application-consumption APIs.
- Raw `company_config` access exists only inside Company Service.
- `logo_url`, `banner_image_url`, legacy portal feature flags, and the old boot
  cache key remain readable only for production compatibility.
- The public Pilgrim Portal consumes its explicit RPC DTO because it runs outside
  the authenticated application provider; that DTO is not a database row.

## Remaining work

No application component remains on the legacy configuration context. Future
work is limited to separately approved milestones (Theme Engine, integrations,
configuration versioning) and eventual database-column retirement after the
production compatibility window.
