# ADR-001 — Company Profile

**Status:** Approved
**Applies to:** Entire Hajj Management System
**Referenced by:** `ENGINEERING_PLAYBOOK.md` §2.4 (`M-14`, `M-15`, `M-16`)
**Implemented by:** the approved Company Profile architecture described in
`../../COMPANY_PROFILE_ARCHITECTURE_REVIEW.md`

> This decision was recorded inside the Engineering Playbook until v2.0. It was moved
> here unchanged in substance so that it can be superseded independently of the
> Playbook (`M-112`, `M-113`). The Playbook now states the requirement and names this
> ADR rather than carrying a second copy of it.

---

## Decision

Company information must never be accessed directly from `company_config` by
application components.

`company_config` is the persistence model. It is not the application contract.

The application contract is `CompanyProfile`.

All application code must consume company information exclusively through
`CompanyService` and its typed selectors.

Normalization, backward compatibility, legacy mapping, and configuration translation
belong only inside `CompanyService`.

Application components must never understand the database representation of company
configuration.

Future features must follow this architecture. Direct database consumption is
prohibited.

---

## Scope of the boundary

`CompanyService` is a **configuration boundary only**. It may load, persist,
normalize, map legacy fields, resolve configuration assets, and expose typed profile
modules.

It must not contain financial calculations, permission decisions, season rules,
operational workflows, room allocation, report generation, or UI state.

`ReportBranding` is a data transfer object only: rendering and formatting belong to
report and print modules; asset resolution and compatibility fallback belong to
Company Profile normalization.

Public surfaces such as the Pilgrim Portal receive an explicit safe projection of the
Company Profile. Secrets are environment configuration and must never be stored in
the Company Profile.

---

## Persistence

`company_config` row `id = 1` is the deployment-level persistence source for the
Company Profile. `company_assets` is the extensible source for company media.

This ADR does not alter the deployment model: one company, one Supabase project, one
database, one Vercel deployment, and the application is not multi-tenant
(`ENGINEERING_PLAYBOOK.md` §2.1–2.2).
