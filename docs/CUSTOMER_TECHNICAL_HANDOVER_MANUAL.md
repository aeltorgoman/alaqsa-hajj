# Hajj Management System
# Customer Technical Handover Manual

**Version:** Draft 0.2  
**Status:** Architecture Complete — Pending Final Review  
**Owner:** Project Architecture Team  
**Applies To:** Customer production deployments of the Hajj Management System

---

## Purpose

This manual defines the approved technical ownership, release, deployment, access, continuity, and handover rules for customer deployments.

It is intentionally updated section by section as architecture decisions are approved. Unapproved or future decisions must not be treated as project policy.

## Document Authority

The Engineering Playbook (`docs/ENGINEERING_PLAYBOOK.md`) remains the authoritative general engineering standard for how the product is designed, developed, reviewed, and maintained.

Within its own domain, this manual is the authoritative project document for:

- Customer deployment ownership, including the external service accounts a deployment depends on.
- Infrastructure handover.
- Operational continuity.
- Source-code handover policy.

Existing domain-specific authorities are unchanged. Security remains governed by `docs/architecture/SECURITY_ARCHITECTURE.md`, season architecture by its approved reference, and each approved ADR by its own record (Engineering Playbook `M-94`).

Where this manual touches a rule that another document already owns — migrations, break-glass, storage rules, destructive operations — it states the customer-deployment consequence and cross-references the governing document. It does not maintain a competing copy of that rule.

## Approved Architecture Versus Current Implementation

This manual records the **approved architecture for customer deployments**. It is not a description of what the internal development repository currently implements.

Where a section describes a capability that is approved but not yet built, that is stated explicitly. A reader must not treat this manual as evidence of current implemented behaviour; the repository is authoritative about what exists today (Engineering Playbook `M-95`).

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

Access granted during the maintenance period is removed at final offboarding under section 12.3.

## 1.3 Source Code Ownership

The Master Repository and customer source repositories remain under the vendor's ownership and control under the currently approved model. Customers do not receive source-code access as part of standard deployment or handover.

Production infrastructure and customer data ownership are separate from source-code ownership and are governed by their own sections: Supabase (section 8), Vercel (section 9), Domain and DNS (section 10), and handover (section 12).

The full source-code delivery and continuity policy, including what possession of source code does and does not grant, is in **section 14**. That section governs; this one only establishes the ownership separation.

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
- Is a **clean release repository**, not a permanent GitHub fork of Master and not a full-history mirror of Master.
- Starts from an approved clean customer release.
- Represents the actual application version intended for that customer.
- Does not contain production secrets.
- Does not contain customer operational data or uploaded customer documents.

A customer release repository may include the application source required to run the approved release, database migrations, Edge Functions, package manifests, configuration templates, documentation, and version information.

### Clean Snapshot, Not Transferred History

Each approved customer release reaches the Customer Repository as a **clean snapshot** of that release. The Master Repository's internal development history is not transferred with it.

The following are **not** transferred into a Customer Repository:

- Master development branches.
- Internal Pull Requests.
- Experiments and abandoned work.
- Unrelated development history.
- Any internal work that is not part of the approved customer release.
- Internal operational workflows and verification tooling that target vendor-owned infrastructure.

That last exclusion is not theoretical. The Master Repository's operational workflows and verification scripts carry vendor project identifiers, and a snapshot that copied them unchanged would give a customer repository active automation pointing at vendor-owned production or test infrastructure — and would leave the vendor's own production-safety guards protecting the wrong project. The clean release process must ensure a Customer Repository contains no automation that unintentionally targets vendor-owned infrastructure. Where a customer deployment genuinely needs an operational workflow, it is included deliberately and configured for that customer's own environment.

The Customer Repository maintains **its own clean customer release history** instead — one identifiable commit/release state per approved customer release, tagged under the versioning rules in section 5:

```text
v1.0.0
  -> v1.0.1
  -> v1.1.0
  -> future approved customer releases
```

The division of responsibility is:

- **Master Repository** — the internal product-development source of truth.
- **Customer Repository** — the clean, approved release history required for that customer's deployed system.

## 2.3 Development Rule

Development must not be performed directly in a Customer Repository.

The approved path is:

```text
Master Repository
  -> Development and Testing
  -> Approved Customer Release
  -> Clean Release Snapshot
  -> Customer Repository
  -> Customer Release Version/Tag
  -> Release Validation
  -> Production
```

This prevents customer repositories from drifting into separate products, and keeps Master's internal development history out of them (section 2.2).

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

The customer's Supabase Edge Function configuration also holds the non-secret per-customer values in section 3.7.

The external service accounts these credentials belong to — who owns them, who pays, and what happens at handover — are covered in **section 15**. Documenting a secret is not the same as documenting the account behind it.

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
- The required per-customer configuration values in section 3.7.
- The external service accounts and credentials in section 15.

## 3.7 Required Per-Customer Configuration Values

Some configuration values are not secrets but are still **customer-specific** and must be set explicitly for every customer deployment:

| Value | Where it is set | Purpose |
|---|---|---|
| `ALLOWED_ORIGINS` | Customer's Supabase Edge Function configuration | The browser origins the customer's Edge Functions accept requests from — the customer's own Production domain and preview origins |
| `VERCEL_PROJECT_SLUG` | Customer's Supabase Edge Function configuration | Identifies the customer's own Vercel project |
| `VERCEL_OWNER_SLUG` | Customer's Supabase Edge Function configuration | Identifies the customer's own Vercel account/team |
| `VAPID_SUBJECT` | Customer's Supabase Edge Function configuration | The Web Push sender contact identity required by the VAPID standard — an appropriate customer contact address, not a vendor address (section 15.3) |

These values must reference the **customer's own** domain, Vercel project, Vercel account, and contact identity. A customer deployment must never be left pointing at a vendor-owned or another customer's origin, project, account, or contact address — that would breach the customer isolation rule in section 3.5.

They are also required by:

- Deployment setup (section 9.6).
- Domain or subdomain change (section 10.6).
- Configuration recovery documentation (section 11.10).
- The Final Customer Deployment Checklist (section 13).

**What happens today when they are not set.** The current implementation carries **vendor-specific fallback values** for all four. The behaviour differs by value and should not be described in one sentence:

- For `ALLOWED_ORIGINS`, `VERCEL_PROJECT_SLUG` and `VERCEL_OWNER_SLUG`, an unconfigured customer deployment **fails closed, not open**. CORS is not opened to everyone: the customer's own origin is simply not trusted, so the application does not work against its Edge Functions. The remaining defect is the inverse one — the customer's Edge Functions continue to trust the **vendor's** origin and the vendor's preview-origin pattern. A valid customer session is still required, so this is not an open door, but it is a trust relationship the customer never agreed to and it must be removed for proper customer isolation.
- For `VAPID_SUBJECT`, the fallback is a **vendor contact address**, which would be presented as the sender identity for that customer's push notifications.

> **Follow-up implementation item (not resolved by this manual).**
> The vendor-specific fallbacks must be removed or made safe for customer deployments before the first commercial deployment — for example by requiring the values explicitly and failing loudly when they are absent, and by removing the vendor preview-origin trust. This affects the shared Edge Function HTTP code for the three origin/project values and the push function for `VAPID_SUBJECT`. These are application-code changes and are deliberately **not** made by this manual. Until they are done, setting all four values explicitly is mandatory for every customer deployment, and the checklist in section 13 verifies it.

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

The Release Gate should automate as much verification as practical, including build validation, required configuration checks, database migration and Edge Function checks (section 4.4), and appropriate release verification.

If the gate fails, the existing Production release remains the active version.

> **Status.** The Release Gate is **approved architecture, not current implementation.** The repository today has no gate that runs automatically on a pull request or a merge, and — as the Engineering Playbook records in `C-06` — the project has **no automated test framework and no test suite**. Nothing in this section should be read as a claim that automated tests exist. Release verification today is a clean build, a lint run reported as a delta against the known baseline, purpose-built checks for the change, and manual acceptance in a real Preview deployment (`M-104`, `M-105`).

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

## 4.4 Releases Containing Migrations or Edge Function Changes

The normal release flow is unchanged:

```text
Pull Request
  -> Preview
  -> Approval
  -> Merge
  -> Production
```

This is the same flow as sections 4.2 and 9.7, shown compactly; nothing is added to it here.

Merging the release deploys the **application** (section 9.5). It does not by itself apply database migrations or deploy Edge Functions. Those are separate deployment actions, and a release that contains either is not complete until they are done.

The Release Gate must therefore **identify** whether an approved release contains:

- database migrations, and/or
- Supabase Edge Function changes,

and the release must then follow the project's existing approved rules for each.

**Database migrations.** Governed by the Engineering Playbook Part 4 and the migration runbook (`docs/runbooks/MIGRATION_WORKFLOW.md`). This manual does not define a competing migration workflow. The two rules that most affect a customer release are that migrations are applied **after** merge and never before (`M-52`), and that application code and schema must be safe in **both** directions for the window in which they overlap — additive schema change first, code second (`M-51`). Because merging triggers the application deployment, the migration ordering required by `M-51` must be planned before the release is approved, not discovered afterwards.

**Edge Functions.** The deployed function must correspond to the **reviewed release source** (`M-108`). Where a deployed function and the approved release diverge, the correction is to redeploy the release source — never to edit source to match what is deployed.

**Responsibility.** Applying the migrations and deploying the Edge Functions for an approved release is the responsibility of the authorized technical team performing that release, under the authorization rule in `M-102`. Section 13 verifies that both were actually done before a deployment is declared Production Ready.

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

This history lives in the Customer Repository as that customer's own clean release history (section 2.2). It is not the Master Repository's development history, and it is not derived from it.

Older releases must not be deleted merely because a newer release exists.

This history is required for traceability and recovery.

---

# 6. Rollback Principle

A formal rollback procedure is required.

If a new Production release causes a critical problem, the system must support returning to the last known stable application release according to the approved rollback procedure. The application-side mechanism is in section 9.8.

**Application rollback and database rollback are not the same operation.** Reverting the deployed application does not reverse a database migration or undo data changes.

For the database, this manual does not define a separate rollback system. The governing rule is the Engineering Playbook's roll-forward principle (`M-44`): **corrections roll forward.** A problem introduced by a migration is corrected by writing a new migration that fixes it — down-migrations are not this project's recovery mechanism, and an applied migration is never edited after the fact (`M-43`).

Where a database problem cannot be corrected by rolling forward, the path is recovery from backup under section 11.4, not reversal.

---

# 7. Independent Repository Backup

An independent, automated backup of each Customer Repository outside GitHub is required before commercial operation, so that repository recovery does not depend solely on continued access to the GitHub account or service.

This backup remains under vendor control and is not placed in customer-owned storage, because the Customer Repository contains source code (sections 11.3 and 14).

The requirement is defined in full in **section 11.3**, which governs.

---

# 8. Supabase Customer Environment

## 8.1 Ownership and Billing

Each customer's production Supabase account/Organization and project are customer-owned.

The account should be established using an official email address controlled by the customer. The customer may create the account directly, or the technical team may perform the setup on the customer's behalf. The important requirement is that ownership and account recovery remain under the customer's control.

Supabase subscription, billing details, and operating charges are the customer's responsibility.

## 8.2 Technical Team Access

The technical team receives the permissions necessary to carry out its responsibilities, following least privilege.

Full administrative access may be granted where it is genuinely required for administration or maintenance of the customer's Supabase environment. It is a justified grant, not an automatic default.

This access must use the technical team's own authorized accounts rather than shared use of the customer's password.

The customer remains the underlying owner of the account and project. At final offboarding, the outgoing team's access is removed and the secret-rotation rule in section 12.3 applies.

## 8.3 Production and Optional Additional Environments

One production Supabase project is the normal baseline for a customer deployment.

Additional Staging or Test environments are optional and may be created when there is a practical need. A permanent additional Supabase project is not required for every customer.

Real customer and pilgrim data must not be copied casually into Test or Staging environments.

## 8.4 Database Migrations

Database schema changes must be represented by migrations stored with the code and associated release history.

When a customer is upgraded, the migrations required by that release are applied to the customer's Supabase project. How this fits into the release — who applies them, when, and in what order relative to the automatic application deployment — is in section 4.4, under the Engineering Playbook's migration rules.

Untracked or arbitrary Production schema changes are not the normal deployment path; the exception is governed by section 8.5.

## 8.5 Emergency or Necessary Manual Database Changes

Migrations are the normal and only routine path for schema change (section 8.4). A direct manual change to a customer's Production database structure or security configuration is an **incident, not an alternative route**.

This manual does not define a second break-glass policy. Where such a change is genuinely unavoidable, it is governed by the existing procedure:

- Engineering Playbook Part 4, section 4.12 — **`M-56`**, which states the conditions that must all hold, including recorded explicit authorization, preservation of the exact SQL executed, a same-day repository migration reconciling the change, a documented reason, and drift never left silently in place.
- `docs/architecture/BREAK_GLASS.md` — the break-glass account and its recovery procedure.

Those rules apply unchanged to customer Production environments. The customer-deployment consequence is that the reconciling migration belongs in the release history for that customer, so the Customer Repository and the customer's deployed database do not permanently diverge — which is what makes section 11's recovery model work at all.

## 8.6 Customer Data and Documents

All customer operational data and documents stored in the customer's Supabase Database or Storage belong to the customer.

This includes pilgrim records and operational data as well as uploaded documents such as passport images, ID images, personal photos, contracts, tickets, permits, and other customer files.

The technical team must not maintain an independent copy of customer pilgrim data or documents outside the customer's environment except where an approved customer-specific backup process requires it.

## 8.7 Backup Approach

For the **database**, the project relies on the backup capability provided by the customer's Supabase service/plan. No second or custom database-backup system is introduced.

For **Storage documents**, an independent external backup is required, and the mechanism is approved and settled: a daily, copy-oriented `rclone` backup to a customer-owned Cloudflare R2 destination.

A complex custom backup platform is not a requirement for the product.

Both are defined in full in **section 11**, which governs — section 11.4 for the database and sections 11.5 to 11.7 for Storage. The mechanism is not left to be selected during deployment.

## 8.8 Secrets and API Key Inventory

The technical documentation must maintain an inventory of required Secrets and API Keys without recording their actual secret values.

For each entry, the documentation should identify:

- Variable/key name.
- Purpose.
- Where it is stored.
- Whether it is client-safe/public configuration or a server-side secret.

The inventory must also cover the required per-customer configuration values in section 3.7 (`ALLOWED_ORIGINS`, `VERCEL_PROJECT_SLUG`, `VERCEL_OWNER_SLUG`), which are not secrets but are customer-specific and required.

**Rotation during normal maintenance.** There is no mandatory periodic rotation merely for the sake of rotation. Rotation is performed when there is a specific operational or security reason.

**Rotation at final offboarding** is different, and is required for the credentials named in section 12.3 — with two deliberate exceptions, the customer's Anthropic credential and the VAPID key pair, where routine rotation would break a working customer service. Those exceptions are defined in sections 15.1 and 15.3.

## 8.9 End of Maintenance or Technical Handover

Because the Supabase environment is customer-owned from the beginning, ending the maintenance relationship does not require transferring the Supabase project.

The handover process consists of confirming that the customer or replacement technical team has the required access and technical information, then removing the outgoing technical team's Supabase access after the handover is complete.

Where this is a **final** offboarding, the secret-rotation and verification steps in section 12.3 also apply: removing a console seat does not invalidate a server-side key the outgoing team already held.

## 8.10 Production Project Deletion

A customer's Production Supabase project must not be deleted as part of normal operation or maintenance.

Permanent deletion requires the customer's explicit request or approval and confirmation that any customer data or documents that must be retained have been preserved as required.

## 8.11 Supabase Platform Compatibility

During an active maintenance period, the technical team is responsible for tracking Supabase platform changes that materially affect the system and taking the actions necessary to preserve compatibility and continued operation.

This includes relevant changes to APIs, authentication/key models, platform services, or deprecated functionality used by the system.

The same responsibility applies to the external service APIs the system calls directly, which are listed in section 15. The concrete current case is the Anthropic API: the model identifier and API version used for document OCR are fixed in the application code, and provider model lifecycles move independently of this system (section 15.1).

---

# 9. Vercel Customer Environment

## 9.1 Ownership and Billing

Each customer's Production Vercel account/team and project are customer-owned.

The account should use an official email address controlled by the customer. The technical team may create and configure the account on the customer's behalf, but ownership and account recovery must remain under the customer's control.

Vercel subscription, billing details, domain registration/renewal charges, and applicable operating charges are the customer's responsibility.

The Production plan used for a commercial customer deployment must permit commercial use under Vercel's applicable terms at that time.

## 9.2 Technical Team Access

The technical team receives the permissions necessary to carry out its responsibilities, following least privilege.

Full administrative access may be granted where it is genuinely required for administration or maintenance of the customer's Vercel environment. It is a justified grant, not an automatic default.

Access must use the technical team's own authorized accounts rather than shared use of the customer's password.

The customer remains the underlying owner of the Vercel account/project and may remove the outgoing technical team's access after a completed handover. At final offboarding, section 12.3 applies.

## 9.3 Spend Management

When configuring the customer's Production Vercel environment, appropriate spend-management controls and usage/billing alerts should be configured to reduce the risk of unexpected usage charges.

This is an operational configuration requirement and does not require a separate monitoring platform.

## 9.4 Customer Repository Connection

The customer's Vercel Production project must connect to that customer's approved Customer Repository, not directly to the internal Master Repository.

The release path is:

```text
Master Repository
        ↓
Approved Customer Release
        ↓
Clean Release Snapshot
        ↓
Customer Repository
        ↓
Vercel
        ↓
Production
```

This preserves the Customer Repository as the deployable source for that customer's running system.

## 9.5 Automatic Production Deployment

After an approved Pull Request is merged into the Customer Repository's protected `main` branch, Vercel automatically deploys that merged version to Production.

The approval controls occur before the merge through the agreed Pull Request and release process.

This deploys the **application only**. A release that also contains database migrations or Edge Function changes is not complete at merge — see section 4.4 for what else must happen and in what order.

## 9.6 Environment Variables

Vercel Environment Variables are customer-specific and belong to the customer's Vercel project.

Actual environment values must not be committed to GitHub.

The technical team may manage these values during the maintenance period.

Documentation records variable names, purpose, and storage location without recording secret values.

Client-safe/public frontend configuration required by the application, such as the Supabase project URL, the applicable public/publishable Supabase key, and the VAPID public key, is configured in Vercel as appropriate.

Server-only secrets remain in their designated server-side environment rather than being exposed through frontend Vercel variables.

Deployment setup must also configure the required per-customer values in section 3.7 — `ALLOWED_ORIGINS`, `VERCEL_PROJECT_SLUG` and `VERCEL_OWNER_SLUG` — in the customer's Supabase Edge Function configuration, pointing at the customer's own domain, Vercel project and Vercel account. A deployment is not correctly configured until these are set explicitly.

## 9.7 Preview Deployments

Vercel Preview Deployments are used as part of reviewing Customer Repository Pull Requests before they are approved for Production.

The normal path is:

```text
Pull Request
    ↓
Vercel Preview
    ↓
Review / Verification
    ↓
Approval
    ↓
Merge to main
    ↓
Automatic Production Deployment
```

A separate permanent Vercel project is not required solely to provide this preview capability.

## 9.8 Application Rollback

The operating process must preserve the ability to return the application to the last known stable Vercel deployment when a newly deployed application release causes a Production problem.

Application rollback and database rollback are separate concerns. Reverting the deployed application does not by itself reverse database migrations or data changes.

## 9.9 Domain Ownership and Connection

The Production custom domain belongs to the customer.

The technical team may configure the domain and DNS records and connect the domain to the customer's Vercel project, but domain ownership and renewal remain under the customer's control.

This ensures that ending the maintenance relationship does not require transferring the customer's Production domain away from the technical team.

## 9.10 HTTPS and TLS

Every Production deployment must be served over HTTPS.

Under the normal Vercel deployment model, TLS/SSL certificate provisioning and renewal are managed through Vercel for the connected domain unless a specific customer environment requires a different arrangement.

## 9.11 Hosting Continuity

Vercel is the primary application hosting platform for the current deployment architecture.

A second hosting provider is not maintained as a permanently running parallel standby solely for redundancy.

If future contractual, operational, or availability requirements justify a secondary hosting architecture, it should be evaluated as a separate architecture decision at that time.

---

# 10. Domain and DNS

## 10.1 Domain Registrar Ownership

The Domain Registrar account used for the customer's Production domain must be customer-owned and should use an official email address controlled by the customer.

The technical team may purchase, configure, or manage the domain on the customer's behalf, but ownership, account recovery, and ultimate control remain with the customer.

## 10.2 Default Use of a Subdomain

When the customer already owns and uses an existing company domain, the default approach is to host the Hajj Management System on a dedicated subdomain, for example:

```text
hajj.company.qa
```

or:

```text
system.company.qa
```

The customer's main website remains independent and is not replaced or modified merely to host the Hajj Management System.

If the customer does not already have a suitable domain, an appropriate customer-owned domain may be registered during deployment setup.

## 10.3 DNS Ownership and Technical Access

DNS remains within an account or service controlled by the customer.

The technical team may receive the permissions required to configure and maintain DNS records related to the system during the maintenance period.

DNS must not be moved into a vendor-owned account merely to operate the Hajj Management System.

After a completed handover, the customer may remove the outgoing technical team's DNS access.

## 10.4 Domain Renewal

Automatic renewal should be enabled whenever supported by the Domain Registrar.

The customer is responsible for the domain's payment method and for domain registration and renewal charges.

Continued operation of the customer's domain must not depend on a vendor-owned payment card or vendor-owned registrar account.

## 10.5 DNS Documentation Scope

Technical documentation should record the DNS records that are materially required to operate the Hajj Management System and connect it to Vercel, such as applicable CNAME or A records.

The handover documentation does not need to duplicate the customer's complete DNS configuration for unrelated services such as corporate email, unrelated websites, or other infrastructure.

## 10.6 Future Domain or Subdomain Change

A Production domain or subdomain may be changed in the future.

When changing it, the new address must first be configured, connected to Vercel, and verified to operate correctly.

A domain or subdomain change also requires updating `ALLOWED_ORIGINS` (section 3.7) so the customer's Edge Functions accept requests from the new address. If this is missed, the application will fail against the Edge Functions once the old address stops being used. Where the customer's Vercel project or account also changes, `VERCEL_PROJECT_SLUG` and `VERCEL_OWNER_SLUG` must be updated with it.

The old Production address should only be removed after the new address has been successfully validated — including the Edge Function paths — reducing the risk of avoidable service interruption.

---

# 11. Backup and Disaster Recovery

## 11.1 Recovery Scope

The recovery approach must cover the four components required to restore a customer deployment:

1. Source code — vendor-controlled backup, outside GitHub (section 11.3).
2. Database — the customer's Supabase backup capability (section 11.4).
3. Supabase Storage files — customer-owned Cloudflare R2 (section 11.5).
4. Required technical configuration and environment documentation (section 11.10).

These destinations are deliberately not the same: the customer's R2 account holds the customer's **Storage** backup, never the repository source-code backup (section 11.3).

Database backup alone is not considered a complete system backup.

The backup and recovery design must remain simple, low-maintenance, and use existing platform capabilities wherever practical rather than introducing a separate complex backup platform.

## 11.2 Automation Principle

Recurring Production backups should be automated wherever practical.

Native backup capabilities provided by the platforms should be preferred over custom backup systems when they satisfy the recovery requirement.

## 11.3 Source Code Backup

Each Customer Repository must have one automated independent backup **outside GitHub**, so that repository recovery does not depend solely on continued access to the GitHub account or service. GitHub remains the operational repository; the external copy provides continuity.

**The backup destination must remain under vendor control.**

**It must not be stored in the customer's Cloudflare R2 account, or in any other customer-controlled storage.** The reason is a policy one, not a technical one: a Customer Repository contains application source code, and placing a readable repository backup in customer-owned storage would effectively provide source-code access outside the separate agreement required by section 14. The repository backup and the source-code policy must not be allowed to contradict each other.

This is the one place in the architecture where a backup is deliberately **not** customer-owned. Everything that belongs to the customer — the database, Storage documents, and the R2 Storage backup destination — remains customer-owned under sections 8.6, 11.4 and 11.5.

The specific storage provider and destination are **not** selected by this manual. Choosing them is implementation work to be resolved when the repository-backup mechanism is built, with simplicity and maintainability as the primary criteria, and under the constraint above. No new backup platform is introduced here.

This is the single statement of the repository-backup requirement; section 7 refers here.

## 11.4 Database Backup and Restore

The customer's Supabase backup capability is the database backup mechanism.

**No second or off-platform database backup is introduced.** A separate custom database-backup system is deliberately not part of this architecture, and the Cloudflare R2 destination used for Storage (section 11.5) is **not** used for database dumps. This is an accepted, deliberate simplicity trade-off: the architecture stays low-maintenance, and the residual risk — that database recovery depends on the customer's Supabase project and its native backups remaining available — is knowingly accepted.

The restoration procedure must be documented clearly enough to be executed when required, and must be proven once by the Recovery Test in section 11.9 before the first commercial deployment.

## 11.5 Supabase Storage Backup

Customer Supabase Storage must have an independent external backup.

The approved architecture is:

```text
Customer Supabase Storage
          ↓
        rclone  (copy-oriented)
          ↓
Customer-owned Cloudflare R2
```

The Cloudflare/R2 account and backup destination are customer-owned.

**The backup is copy-oriented, not a destructive mirror.** Deleting a file from Supabase Storage must **not** cause the backup copy in R2 to be deleted. Destructive `sync --delete` semantics must not be used.

This matters because the files in question are permanent business records — passports, IDs, contracts, tickets, permits, pilgrim photos — which the Engineering Playbook states are never deleted as a side effect of anything (`M-70`). A destructive mirror would propagate an accidental or malicious deletion into the only external copy within a day.

No Object Lock, retention platform, or separate archive system is introduced at this stage.

Before this mechanism is relied upon operationally for the first customer, the Recovery Test in section 11.9 must confirm that both backup and restoration work correctly.

## 11.6 Storage Backup Frequency

Supabase Storage is backed up to the external R2 destination automatically once per day.

The design intentionally avoids unnecessary high-frequency backup operations for the current product requirements.

## 11.7 Backup Versus Archive

The R2 Storage backup is a current disaster-recovery copy, not a permanent historical archive containing every daily version of every file.

Season archiving and long-term historical retention are separate product/lifecycle concerns and are not implemented by accumulating indefinite daily backup versions.

## 11.8 Backup Failure Notification

If the automated Storage backup fails, the technical team must receive a failure notification.

A run that completes without copying anything is treated as a failure, not a success. A backup that reports success while having saved nothing is the failure mode that matters most, and the notification must cover it.

This requirement should be implemented without introducing a separate complex monitoring platform solely for the backup process.

## 11.9 Recovery Test

**Before the first commercial customer deployment, one complete Recovery Test must be performed and must succeed.**

The Recovery Test proves that the recovery process documented in this section can actually restore the required system and data state — not merely that backups exist. It covers the database restore path (section 11.4) and the Storage restore path:

```text
Cloudflare R2
      ↓
Restore
      ↓
Supabase Storage
```

**Why this is required rather than assumed.** The repository records that a previous full recovery attempt for this system **was not completed successfully**: the restore of Supabase-managed Auth and Storage state collided with the managed project's own state and the attempt was stopped (`docs/PROJECT_MASTER_HANDOFF.md`, section 11.2). The backup itself was complete and verified; the restore was never proven end to end. Until the Recovery Test described here succeeds, recovery for this system is **not proven**, and the first commercial deployment must not be declared Production Ready on the assumption that it is (section 13).

**After it succeeds:**

- No recurring or scheduled restore drills are required.
- The Recovery Test is repeated only after a material change to the backup or recovery architecture.

A recurring recovery-testing system is deliberately not built.

## 11.10 Configuration Recovery Information

Recovery documentation must preserve the information required to reconstruct the customer environment, including the required Environment Variable names, relevant Supabase/Vercel configuration, the per-customer configuration values in section 3.7 (`ALLOWED_ORIGINS`, `VERCEL_PROJECT_SLUG`, `VERCEL_OWNER_SLUG`), system DNS records, and external service dependencies.

It must also record the external service accounts and third-party dependencies in section 15, since an environment cannot be reconstructed from platform configuration alone.

Actual passwords and secret values must not be written into this manual.

---

# 12. Access and Technical Handover

## 12.1 Handover Objective

If maintenance ends or the customer appoints another technical team, the customer environment must be capable of being handed over without requiring continued operational dependence on the outgoing technical team.

## 12.2 Handover Scope

The technical handover must confirm that the customer or replacement technical team has the required access to:

- Supabase.
- Vercel.
- Domain Registrar and relevant DNS management.
- The customer-owned external service accounts in section 15 that the deployment actually uses.
- Required technical documentation, configuration references, Environment Variable names, and external-service dependencies.

Access must be practically verified rather than assumed.

Source-code delivery is not automatically part of this standard infrastructure handover. What that means in practice is in section 12.4, and the governing policy is in section 14.

## 12.3 Final Offboarding

At **final** offboarding — when the outgoing technical team is being removed and the customer or another team takes control — three things are required:

1. **Remove outgoing access.** Remove the outgoing team's accounts and permissions from Supabase, Vercel, the Domain Registrar and DNS, and any other customer-owned service it held.

2. **Rotate sensitive server-side credentials — with two defined exceptions.** Rotate the server-side credentials and secrets the outgoing team could have known or accessed: the Supabase service-role key, the database password, platform access tokens, and the credentials for the customer's R2 Storage backup destination.

   This is required because removing an account removes **console** access, not knowledge of a key. A server-side key that was legitimately handled during the maintenance period keeps working after the account that used it is gone, and a service-role key bypasses row-level security entirely.

   **The two exceptions exist because rotating them would break a working customer service, which would defeat the purpose of the handover:**

   - **The customer's Anthropic credential** is not rotated or revoked merely because maintenance ends, where doing so would stop document OCR working. It is rotated when there is a genuine reason — suspected exposure, a security requirement, access removal, or normal credential lifecycle — and then in a way that preserves the customer's service. See section 15.1.
   - **The VAPID key pair** is not routinely rotated at offboarding. Changing it invalidates every existing pilgrim push subscription. The working key pair stays with the customer's production environment and is made available to the authorized incoming technical team. See section 15.3.

   Where an exception applies, the corresponding account access is still removed under step 1, and the credential's custody passes to the customer or the incoming team.

   The vendor-controlled Customer Repository backup (section 11.3) is not customer infrastructure and is not part of this handover; its credentials are managed under the outgoing team's own practice, not rotated or transferred here.

3. **Verify the system still operates** after the credential changes, before the handover is treated as complete. Rotating a secret that something depends on and not noticing is the predictable failure here, so the verification must exercise the features that depend on the rotated credentials — not only confirm that the application loads.

This is a one-time offboarding step. It does not create a recurring key-rotation programme; during normal ongoing maintenance the rule in section 8.8 applies and there is no mandatory periodic rotation.

## 12.4 What the Standard Handover Does and Does Not Provide

A completed standard technical handover gives the customer **independence over its Production infrastructure and data**. The customer and any replacement technical team can operate, administer, support and recover the running system, because Supabase, Vercel, the domain and DNS, and the backup destination are all customer-owned.

It does **not** give a replacement technical team the ability to modify, develop or deploy new application source-code releases. Source code is not part of the standard handover (section 14.1), and application releases are deployed from the Customer Repository (section 9.4), which remains vendor-controlled.

The practical consequence, stated plainly so the two sections cannot be read as contradicting each other:

| Capability | Standard handover |
|---|---|
| Operate, administer and support the running system | Yes |
| Manage users, data, configuration and secrets | Yes |
| Restore from backup and recover the environment | Yes |
| Change DNS, domain, and platform settings | Yes |
| Roll back to a previous deployed application version | Yes |
| Build, change or deploy a **new** application release | No |
| Apply a new database migration as part of a release | No |
| Receive the application source code, or a backup copy of it | No |

If the customer wants another technical team to take over source-code development or maintenance, source-code access is governed by the separate arrangement in **section 14** — it is not an extension of the standard handover, and it does not follow from it automatically.

---

# 13. Final Customer Deployment Checklist

Before a customer deployment is declared Production Ready, a concise final verification must confirm that the approved deployment architecture is in place.

The checklist must verify, as applicable:

- Customer-owned Supabase Production environment is configured and accessible.
- Customer-owned Vercel Production environment is configured and accessible.
- The approved Customer Repository is connected to Vercel.
- Pull Request, Preview, approval, merge, and Production deployment flow is working.
- Customer-owned Domain/DNS is connected correctly.
- Production HTTPS is working.
- Required administrative access is available to the authorized technical team.
- Production has been practically verified to operate after deployment.
- **Backup** — the first Storage backup has actually **run and copied data successfully** to the customer-owned R2 destination. The existence of a configured backup job is not sufficient evidence (sections 11.5 to 11.8).
- **Recovery** — the foundational Recovery Test in section 11.9 has **succeeded**. Before the first commercial deployment this is a prerequisite, not an optional check.
- **Database and Edge Functions** — the migrations required by the release are applied, and the required Edge Functions are deployed from the approved release source (sections 4.4 and 8.4).
- **Configuration** — required Secrets, Environment Variables and customer-specific configuration are set in their designated platforms, including the per-customer values in section 3.7: `ALLOWED_ORIGINS`, `VERCEL_PROJECT_SLUG`, `VERCEL_OWNER_SLUG`, `VAPID_SUBJECT`. The VAPID public key configured in Vercel and the private key in Supabase are the **same key pair** (section 15.3).
- **External service accounts** — the customer-owned Anthropic account and credential are in place for that customer (section 15.1), and, where WhatsApp is being activated, the customer-owned Meta/WhatsApp assets are in place before activation (section 15.2).
- **Feature verification** — document OCR and Pilgrim Portal push notifications have each been practically verified to work in the customer's Production environment, not merely configured.

When the applicable checklist items pass, the customer deployment may be marked Production Ready.

The checklist is intended to be short and operational; it must not duplicate the full manual as a second process.

---

# 14. Source Code Delivery and Continuity

## 14.1 Standard Customer Handover

Source code is not included automatically in the customer's standard technical handover.

The Master Repository and Customer Repository remain under the approved vendor-controlled source-code model unless a separate agreement changes that arrangement.

The technical consequence of this for a customer or a replacement technical team — what the standard handover does and does not enable — is set out in section 12.4. The two sections are intended to be read together: section 12 governs infrastructure handover, this section governs source code.

Consistent with this, the Customer Repository backup required by section 11.3 is held under vendor control and is never placed in customer-owned storage. A backup is not a delivery mechanism, and no part of the backup or handover architecture grants source-code access that this section does not grant.

## 14.2 Optional Source Code Delivery

If a customer requests a copy of source code, any delivery must be governed by a separate commercial and licensing agreement and may require a separate payment.

Receiving a copy of source code does not, by itself, transfer ownership of the product, intellectual property, or the right to resell, redistribute, sublicense, or commercially exploit the product beyond the rights expressly granted in that separate agreement.

Any broader transfer of ownership or commercial rights requires an explicit separate agreement.

## 14.3 Exceptional Long-Term Continuity

Any special source-code arrangement intended for exceptional circumstances, including permanent discontinuation of maintenance or service, is a contractual and commercial matter to be defined separately before such a commitment is offered to a customer.

This manual does not create an automatic source-code escrow or automatic source-code release right.

---

# 15. External Service Accounts and Third-Party Dependencies

Sections 8 to 10 cover the three platforms every customer deployment owns: Supabase, Vercel, and the Domain/DNS. This section covers the remaining external services the system depends on.

Naming a secret is not the same as defining the account behind it. Section 3 says where each credential is stored; this section says **who owns the account, who pays, who has access, what happens at handover, and whether the customer can keep operating the feature without the vendor**.

This section states the ownership rules and the constraints that follow from them. It deliberately does not give step-by-step setup instructions. Creating and configuring the customer's Anthropic account, configuring Meta/WhatsApp when that feature is activated, generating the customer's VAPID key pair and setting `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`, and testing OCR and push notifications, are operational procedures for the separate Customer Deployment Guide. The rules here are what that guide must satisfy.

## 15.1 Anthropic — Document OCR

The system extracts passport and document data by calling the Anthropic API from a Supabase Edge Function. Without it, document scanning does not work; the rest of the system is unaffected.

**This means the Anthropic API / Console account used by a customer's production deployment, not a personal Claude.ai chat subscription.** They are different products: a Claude.ai subscription does not provide an API credential and cannot be used by this system.

**Ownership and billing.**

- The production Anthropic API / Console account is **customer-owned**, created using an appropriate customer-controlled identity or account.
- API usage and billing are the **customer's** responsibility.
- The technical team receives only the access required to configure and maintain the integration, following the least-privilege rule in section 1.2.

**Credential handling.**

- `ANTHROPIC_API_KEY` is a server-side secret and is stored in the **customer's** Supabase Edge Function secrets (section 3.3). It is never exposed to the frontend.
- Production Anthropic credentials must **not** be shared between customer deployments (section 3.5).
- A customer's production OCR must use a credential belonging to that customer's own environment.

**Final handover and offboarding.**

- Remove the outgoing technical team's access to the customer's Anthropic account, as applicable.
- **Do not rotate or revoke the customer's working Anthropic credential merely because maintenance ends**, where doing so would break OCR. This is a deliberate exception to the rotation rule in section 12.3.
- Rotate or revoke it where there is a genuine reason — suspected exposure, a security requirement, access removal, or normal credential lifecycle — and do so in a way that preserves the customer's service continuity.

**Continuity.** Because the account, the billing relationship and the credential are the customer's, the customer can continue operating document OCR after the vendor is no longer involved.

**Operational dependency a replacement team must know about.** The Anthropic **model identifier and API version are currently fixed in the application code** rather than configured per deployment. Provider model lifecycles move independently of this system, so a model retirement or API change can stop OCR working with no change on our side. Anthropic API and model compatibility must therefore be monitored as part of the responsibility in section 8.11, and updating them is an application-code change made through the normal release process (section 4.4).

## 15.2 Meta / WhatsApp Business

The system can send a WhatsApp message to a pilgrim through the Meta Graph API from a Supabase Edge Function.

**Current state — this integration is not live.** The live WhatsApp integration is **deliberately deferred** until a real external number and configuration are available and approved. The function performs all of its authorization, permission and rate-limit checks and then returns a clear "configuration incomplete" response when the credentials are absent. The system operates fully without it; only the sending of the message itself is unavailable. Nothing in this section should be read as describing a currently active production integration.

**The ownership rules below apply when the feature is activated for a customer, and are to be settled before activation, not after.** A WhatsApp Business phone number is bound to the Meta Business Account it was registered under and is materially harder to move afterwards than an API key.

**Ownership and billing, on activation.**

- The Meta Business and WhatsApp Business assets used by that customer's production deployment are **customer-owned**.
- The production WhatsApp phone number belongs to the customer and control of it remains with the customer.
- Message templates and their approvals belong to the **customer's** WhatsApp Business environment.
- Any applicable Meta/WhatsApp usage charges are the **customer's** responsibility.
- The technical team receives only the access required for setup and maintenance.

**Credential handling.**

- `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID` are server-side production configuration held in the **customer's** environment (section 3.3).
- Production WhatsApp credentials and assets must **not** be shared between customer deployments (section 3.5).

**Final handover and offboarding.** Remove the outgoing technical team's access to the customer's Meta Business and WhatsApp Business assets, while preserving the customer's phone number, message templates and messaging capability.

**Continuity.** Because the Business account, the number and the templates are the customer's, the customer can continue operating WhatsApp messaging after the vendor is no longer involved.

## 15.3 Web Push and the VAPID Key Pair

Pilgrim Portal notifications use the Web Push standard, which authenticates the sender with a VAPID key pair.

**VAPID is not an external service account.** There is no provider to register with, no subscription, and no billing. It is a cryptographic key pair this project generates itself. A replacement technical team should not go looking for an account that does not exist. The browser push services that actually deliver the notifications are chosen by each pilgrim's own browser and require no account from us.

**Per-customer key pair.**

- Generate a **dedicated VAPID key pair for each customer deployment**.
- A production VAPID key pair must **not** be reused across different customers.
- `VAPID_PUBLIC_KEY` is the public component; `VAPID_PRIVATE_KEY` is sensitive and remains server-side in the customer's Supabase Edge Function secrets.
- `VITE_VAPID_PUBLIC_KEY`, configured in the customer's Vercel project, must correspond to the **same key pair** as the backend private key. A mismatched pair produces push that fails without an obvious error.
- `VAPID_SUBJECT` must be explicitly configured with an appropriate customer contact identity and must not rely on the vendor default (section 3.7).

**The key pair is production continuity configuration, not an ordinary secret.**

The application subscribes each pilgrim's browser using the public key, so **every stored push subscription is bound to the specific key pair that created it. Changing the key pair invalidates all existing subscriptions**, and each pilgrim must re-enable notifications on their own device — an action no technical team can perform for them. The failure is silent: notifications simply stop arriving, and an administrative console shows nothing wrong.

Therefore:

- **Do not routinely rotate the VAPID key pair merely because the maintenance or vendor relationship ends.** This is a deliberate exception to the rotation rule in section 12.3.
- The existing working key pair remains with the customer's production environment and is made available to the authorized incoming technical team as required for continuity.
- Rotate it only where there is a genuine reason, such as suspected compromise or another security requirement — and then treat the resulting re-subscription of pilgrims as a planned, communicated activity, not a side effect.

The key pair must be preserved in the customer's configuration recovery information (section 11.10): losing the private key has the same effect as rotating it.

## 15.4 Third-Party Runtime and Deployment Dependencies

The current implementation depends on a small number of externally hosted resources. **None of these requires a customer account, credential, or billing relationship**, and none is customer infrastructure. They are recorded here so a future technical team knows they exist and can diagnose failures that originate outside the customer's own platforms.

| Dependency | Where it is used | Practical consequence if unavailable |
|---|---|---|
| **Google Fonts** | Arabic webfonts in the Pilgrim Portal, the application theme, and printed output | Typography falls back to other fonts. Because printed output is treated as authoritative and its layout is verified, a font substitution can change how printed documents render. |
| **Externally hosted airline logo** | An airline logo in the flights and reports screens is **hotlinked** from an external encyclopedia-hosted image rather than served from the application | The logo stops displaying in flight screens and printed reports. Availability is outside this project's control, and the external host may change or restrict the asset at any time. |
| **`esm.sh` and `deno.land/std`** | Module sources imported directly by the Supabase Edge Functions | These resolve when a function is **deployed**. If either source is unavailable, Edge Functions cannot be deployed — including a security fix. This is a dependency of the deployment path in section 4.4, not of the running system. |

Whether to self-host the fonts and the logo asset, or to vendor and pin the Edge Function module sources, is implementation work to be decided when it is addressed. It is not an architecture decision for this manual, and no customer account or ownership question arises from any of it.

---

# Document Governance

This document is the authoritative project document for customer deployment ownership, infrastructure handover, operational continuity, and source-code handover policy, as stated under Purpose. It does not outrank the Engineering Playbook on general engineering standards, nor any existing domain-specific authority.

Where this manual and a governing document appear to disagree, that is a discrepancy to be recorded and resolved by review under Engineering Playbook `M-121` — not settled silently in favour of whichever document is newer.

This document must be updated when a relevant technical handover decision is formally approved.

Draft discussion, suggestions, and unapproved options must not be recorded as final policy.

The repository version of this document is the technical source of truth. Exported PDF or other formatted copies are reference copies and must not silently diverge from the repository version.
