# Hajj Management System

Operational management application for a Hajj campaign, built with React,
TypeScript, Vite, and Supabase.

## Deployment model

The repository is a shared product codebase, but every customer receives an
isolated deployment with one Supabase project, one database, and one Vercel
deployment. The application is **not multi-tenant**.

Customer-specific identity, contact details, financial configuration, branding,
portal settings, and media are managed through Company Profile. Onboarding a new
campaign must require configuration only, never source-code changes.

## Engineering documentation

- [`docs/ENGINEERING_PLAYBOOK.md`](docs/ENGINEERING_PLAYBOOK.md) — mandatory
  engineering rules; Company Profile is defined in §73.
- [`docs/COMPANY_PROFILE_ARCHITECTURE_REVIEW.md`](docs/COMPANY_PROFILE_ARCHITECTURE_REVIEW.md)
  — approved architecture and historical decision record.
- [`docs/COMPANY_PROFILE_PHASE1.md`](docs/COMPANY_PROFILE_PHASE1.md) — additive
  schema, assets, and initial service migration history.
- [`docs/COMPANY_PROFILE_PHASE2.md`](docs/COMPANY_PROFILE_PHASE2.md) — completed
  application-consumer migration and current implementation record.
- [`supabase/README.md`](supabase/README.md) — database migrations and operational
  database instructions.

## Local development

```bash
npm install
npm run dev
```

Required public environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Verification

```bash
npm run build
npm run lint
```
