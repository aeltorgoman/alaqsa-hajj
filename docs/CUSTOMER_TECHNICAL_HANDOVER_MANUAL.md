# Hajj Management System
# Customer Technical Handover Manual

**Version:** Draft 0.1  
**Status:** In Progress — Approved Decisions Only  
**Owner:** Project Architecture Team  
**Applies To:** Customer production deployments of the Hajj Management System

---

## Purpose

This manual defines the approved technical ownership, release, deployment, access, continuity, and handover rules for customer deployments.

It is intentionally updated section by section as architecture decisions are approved. Unapproved or future decisions must not be treated as project policy.

The Engineering Playbook remains the engineering standard for how the product is designed, developed, reviewed, and maintained. This manual defines how a customer deployment is structured, operated, released, and handed over.

---

# 1. Technical Ownership and Access

## 1.1 Deployment Model

Each customer deployment is isolated.

The approved deployment model is:

- One customer per deployment.
- One dedicated Supabase project per customer.
- One dedicated Vercel project per customer.
- One dedicated database per customer.
- Customer production data is not shared with other customers.

The previous multi-tenant deployment model is not the active production model.

## 1.2 Account and Access Principle

Administrative authority is attached to the authorized administrative account or role, not permanently to a named individual.

Shared passwords must not be used as the normal access model.

Access should use personal accounts, appropriate roles, least privilege, and two-factor authentication where supported.

## 1.3 Source Code Ownership

The Master Repository and customer source repositories remain under the vendor's ownership and control under the currently approved model.

Customers do not receive source-code access at this stage.

The future source-code continuity or delivery mechanism is intentionally deferred and must be approved separately before becoming policy.

Production infrastructure and customer data ownership are handled separately from source-code ownership and will be documented in their relevant sections as those decisions are approved.

---

# 2. GitHub Repository Architecture

## 2.1 Master Repository

The Master Repository is the single development source for the product.

All product development starts in Master, including:

- General product features.
- Bug fixes.
- Security fixes.
- Customer-specific functionality.

Customer repositories must not become independent development codebases.

## 2.2 Customer Repository

Each customer receives a private Customer Repository used for that customer's approved runnable releases.

A Customer Repository:

- Is separate from the Master Repository.
- Must not be maintained as a permanent direct fork that exposes Master development history.
- Starts from an approved clean customer release.
- Represents the actual application version intended for that customer.
- Does not contain production secrets.
- Does not contain customer operational data or uploaded customer documents.

A customer release repository may include the application source required to run the approved release, database migrations, Edge Functions, package manifests, configuration templates, documentation, and version information.

## 2.3 Development Rule

Development must not be performed directly in a Customer Repository.

The approved path is:

```text
Master
  -> Development and Testing
  -> Approved Customer Release
  -> Customer Repository
  -> Release Validation
  -> Production
```

This prevents customer repositories from drifting into separate products.

## 2.4 Customer-Specific Customization

Customer-specific differences should be implemented in Master whenever practical through configuration rather than divergent customer codebases.

Preferred mechanisms include:

- Company configuration.
- Feature flags.
- Module configuration.
- Branding configuration.

Examples include customer branding, contact details, optional reports, or optional modules.

A substantially different customer workflow must be architecturally reviewed before implementation rather than being introduced as an uncontrolled customer-repository patch.

---

# 3. Secrets and Environment Configuration

## 3.1 General Rule

No production secret value may be committed to GitHub.

GitHub may contain:

- Environment-variable names.
- Configuration documentation.
- Safe example files such as `.env.example`.

Real production values must remain in the appropriate deployment platform.

## 3.2 Frontend Configuration

Frontend/public configuration belongs in the customer deployment environment, currently Vercel.

Examples include:

- Supabase project URL.
- Client-safe Supabase public/publishable key.
- Public VAPID key.

No privileged server secret may be exposed through frontend environment variables.

## 3.3 Backend and Edge Function Secrets

Backend secrets used by Supabase Edge Functions belong in the customer's Supabase project secrets.

Examples include:

- Anthropic/OCR API credentials.
- Private VAPID key.
- WhatsApp token.
- WhatsApp phone identifier.
- Other server-only integration credentials.

## 3.4 GitHub Actions Secrets

GitHub Actions Secrets are reserved for credentials that GitHub automation itself requires.

Runtime application secrets must not be duplicated into GitHub merely for convenience.

## 3.5 Customer Isolation

Production credentials and secrets must be isolated per customer.

A production credential must not become a shared global secret across customer deployments unless a future architecture decision explicitly approves that design.

## 3.6 Pre-Customer Secret Audit

Before the first commercial customer deployment, perform a dedicated Secret and Environment Audit covering at minimum:

- Frontend environment variables.
- Supabase Edge Function environment variables.
- GitHub Actions workflows and secrets.
- Environment documentation and examples.
- Current Supabase key model and the planned migration from legacy keys where applicable.

---

# 4. Customer Release Control

## 4.1 Release Gate

A Customer Release must not move directly to Production without validation.

The approved release flow is:

```text
Master
  -> Development + Testing
  -> Approved Release
  -> Customer Repository
  -> Automated Release Gate
  -> Production
```

The Release Gate should automate as much verification as practical, including build validation, required configuration checks, database migration checks, and appropriate smoke tests.

If the gate fails, the existing Production release remains the active version.

## 4.2 Pull Request Requirement

Changes to the Customer Repository's `main` branch must pass through a Pull Request.

Direct changes to `main` are not part of the approved workflow.

The intended path is:

```text
Branch
  -> Pull Request
  -> Automated Checks
  -> Authorized Approval
  -> Merge
  -> Release Gate
  -> Production
```

## 4.3 Approval and Merge Authority

Final approval and merge authority belongs to the authorized administrative account or role controlling the Customer Repository.

The rule is role/account based rather than permanently tied to a named individual.

Automated checks do not replace the required authorized approval.

---

# 5. Versioning and Release History

## 5.1 Official Versioning

Every Customer Release must have an official version number.

The project uses semantic-style versioning:

```text
v1.0.0  Initial official release
v1.0.1  Patch / bug fix
v1.1.0  New backward-compatible feature release
v2.0.0  Major release / major change
```

The exact version deployed to each customer must be identifiable.

## 5.2 Tags and Historical Releases

Each released customer version must retain its corresponding version/tag history.

Older releases must not be deleted merely because a newer release exists.

This history is required for traceability and recovery.

---

# 6. Rollback Principle

A formal rollback procedure is required.

If a new Production release causes a critical problem, the system must support returning to the last known stable application release according to the approved rollback procedure.

Application-release rollback and database rollback are not treated as the same operation.

Database rollback rules are intentionally deferred until the Supabase section is designed and approved.

---

# 7. Independent Repository Backup

An independent backup of critical GitHub repositories is required before commercial operation.

The backup must exist outside GitHub so that repository recovery does not depend solely on continued access to the GitHub account or service.

The exact backup destination, frequency, encryption, retention policy, and automation mechanism are intentionally deferred until the backup architecture is approved.

---

# 8. Supabase Customer Environment

## 8.1 Ownership and Billing

Each customer's production Supabase account/Organization and project are customer-owned.

The account should be established using an official email address controlled by the customer. The customer may create the account directly, or the technical team may perform the setup on the customer's behalf. The important requirement is that ownership and account recovery remain under the customer's control.

Supabase subscription, billing details, and operating charges are the customer's responsibility.

## 8.2 Technical Team Access

While the technical team is responsible for operating and maintaining the system, it may hold full administrative access to the customer's Supabase environment.

This access must use the technical team's own authorized accounts rather than shared use of the customer's password.

The customer remains the underlying owner of the account and project.

## 8.3 Production and Optional Additional Environments

One production Supabase project is the normal baseline for a customer deployment.

Additional Staging or Test environments are optional and may be created when there is a practical need. A permanent additional Supabase project is not required for every customer.

Real customer and pilgrim data must not be copied casually into Test or Staging environments.

## 8.4 Database Migrations

Database schema changes must be represented by migrations stored with the code and associated release history.

When a customer is upgraded, the migrations required by that release are applied to the customer's Supabase project.

Untracked or arbitrary Production schema changes are not the normal deployment path.

## 8.5 Emergency or Necessary Manual Database Changes

Direct manual changes in Supabase are permitted when operationally necessary.

If a manual change alters database structure or security configuration, such as a table, column, policy, function, or equivalent schema element, the change must subsequently be represented in a migration in the codebase so that the repository and deployed database do not permanently diverge.

## 8.6 Customer Data and Documents

All customer operational data and documents stored in the customer's Supabase Database or Storage belong to the customer.

This includes pilgrim records and operational data as well as uploaded documents such as passport images, ID images, personal photos, contracts, tickets, permits, and other customer files.

The technical team must not maintain an independent copy of customer pilgrim data or documents outside the customer's environment except where an approved customer-specific backup process requires it.

## 8.7 Backup Approach

For the database, the project relies on the backup capability provided by the customer's Supabase service/plan.

For Storage documents, an independent external backup may be added when it can be implemented in a simple, automated, and low-maintenance way.

A complex custom backup platform is not a requirement for the product.

The exact Storage backup mechanism may therefore be selected during customer deployment or later operational setup when appropriate.

## 8.8 Secrets and API Key Inventory

The technical documentation must maintain an inventory of required Secrets and API Keys without recording their actual secret values.

For each entry, the documentation should identify:

- Variable/key name.
- Purpose.
- Where it is stored.
- Whether it is client-safe/public configuration or a server-side secret.

Existing Secrets do not require mandatory rotation solely because a maintenance relationship ends. Rotation may be performed when there is a specific operational or security reason.

## 8.9 End of Maintenance or Technical Handover

Because the Supabase environment is customer-owned from the beginning, ending the maintenance relationship does not require transferring the Supabase project.

The handover process consists of confirming that the customer or replacement technical team has the required access and technical information, then removing the outgoing technical team's Supabase access after the handover is complete.

## 8.10 Production Project Deletion

A customer's Production Supabase project must not be deleted as part of normal operation or maintenance.

Permanent deletion requires the customer's explicit request or approval and confirmation that any customer data or documents that must be retained have been preserved as required.

## 8.11 Supabase Platform Compatibility

During an active maintenance period, the technical team is responsible for tracking Supabase platform changes that materially affect the system and taking the actions necessary to preserve compatibility and continued operation.

This includes relevant changes to APIs, authentication/key models, platform services, or deprecated functionality used by the system.

---

# 9. Sections Pending Architecture Approval

The following areas are not yet finalized in this manual and must be documented only after their decisions are approved:

- Supabase ownership, access, database, storage, backups, and recovery.
- Vercel ownership, access, environments, and deployment controls.
- Domain and DNS ownership and handover.
- Detailed production secrets inventory and rotation procedure.
- Full backup and disaster-recovery procedure.
- Emergency access and technical handover procedure.
- Final customer deployment verification checklist.
- Future source-code continuity/delivery mechanism.

---

# Document Governance

This document must be updated when a relevant technical handover decision is formally approved.

Draft discussion, suggestions, and unapproved options must not be recorded as final policy.

The repository version of this document is the technical source of truth. Exported PDF or other formatted copies are reference copies and must not silently diverge from the repository version.
