# Hajj Management System
# Engineering Playbook

**Version:** 1.0  
**Status:** Official Project Standard  
**Owner:** Project Architecture Team  
**Applies To:** Entire Hajj Management System

---

# Copyright

This document defines the official engineering standards, architecture principles, development workflow, review process, and governance rules for the Hajj Management System.

Every engineer, AI assistant, reviewer, or contributor working on this project is expected to follow this document.

This document is considered the single engineering reference for the project.

---

# Document Status

Current Version:

```
Engineering Playbook v1.0
```

Status:

```
Approved
```

This document remains valid until a newer approved version replaces it.

---

# How To Use This Document

This document must be used before:

- Designing new features
- Writing code
- Reviewing Pull Requests
- Creating database migrations
- Modifying architecture
- Making product decisions

If a decision conflicts with this document, this document is the reference until officially updated.

---

# Table of Contents

1. Vision
2. Product Philosophy
3. Engineering Principles
4. Non-Negotiable Rules
5. Architecture Principles
6. Development Workflow
7. Scope Management
8. Decision Making
9. Communication Standards
10. Project Goals

11. Coding Standards
12. React Standards
13. TypeScript Standards
14. File Organization
15. Naming Rules
16. Comments
17. Error Handling
18. Logging
19. Supabase Standards
20. Database Standards
21. Edge Functions
22. Security Standards
23. Pull Requests
24. Git Rules
25. Technical Debt
26. Scope Rules
27. Code Review

28. Development Lifecycle
29. Feature Planning
30. Architecture Discussions
31. Implementation Planning
32. Scope Discipline
33. PR Standards
34. PR Size
35. Independent Review
36. Review Checklist
37. Verification Rules
38. Browser Verification
39. Database Verification
40. Security Verification
41. Reporting Rules
42. Bug Handling
43. Feature Completion
44. Feature Freeze
45. Merge Rules
46. After Merge
47. Technical Debt Management
48. Engineering Honesty
49. Long-Term Thinking
50. Definition of Success

51. Hajj System Rules
52. Core Modules
53. Season Architecture
54. Passengers
55. Documents
56. Finance
57. Financial Groups
58. Buses
59. Camps
60. Hotel
61. Flights
62. Reports
63. Operations Center
64. Pilgrim Portal
65. Notifications
66. WhatsApp
67. Users & Permissions
68. Settings
69. Architecture Decisions
70. Roadmap
71. Definition of Project Completion

72. Operational Rules
73. Claude Working Rules
74. Daily Workflow
75. Feature Checklist
76. PR Checklist
77. Review Checklist
78. Merge Checklist
79. Production Checklist
80. Architecture Decision Records
81. Documentation Rules
82. Success Criteria
83. Claude Project Instructions
84. Final Principle

85. Lessons Learned (M0–M5)

86. Engineering Playbook Governance

---

# Part I

# Vision & Engineering Principles

---

# 1. Vision

The Hajj Management System is not a website.

It is a long-term operating platform for managing Hajj campaigns.

The objective is to create a system that remains maintainable, scalable, secure, and understandable for many years.

Engineering quality always takes priority over implementation speed.

---

# 2. Product Philosophy

The system is designed around operations rather than CRUD pages.

Every screen must help employees make decisions.

Every workflow must reduce human error.

Every business rule should have a single source of truth.

The system must remain predictable.

---

# 3. Engineering Principles

The project follows these core principles.

## Database First

Whenever appropriate, business rules belong inside the database.

The frontend should reflect database state rather than enforce business rules.

---

## Source of Truth

Every business fact must have one authoritative source.

Duplicate business logic is considered technical debt.

---

## Security First

Security is designed into the architecture.

Never rely on the client for authorization.

Never trust browser state.

Always verify on the server.

---

## Simplicity

Prefer the simplest architecture capable of supporting future growth.

Avoid unnecessary abstraction.

Avoid clever code.

---

## Maintainability

Code will be read far more often than it is written.

Optimize for readability.

---

## Scalability

Every architectural decision should support future expansion.

Avoid shortcuts that create long-term limitations.

---

# 4. Non-Negotiable Rules

These rules may not be broken without an approved architectural decision.

## Database is the Source of Truth

Business rules belong in the database whenever practical.

---

## UI Reflects Reality

The frontend reflects the system.

It does not invent state.

It does not guess success.

It does not assume permissions.

---

## One Source of Logic

Each business rule exists in exactly one location.

If duplicated, it must be refactored.

---

## Atomic Operations

Critical operations must either:

- Complete entirely
- Or not execute at all

Partial completion is unacceptable.

---

## Defense in Depth

Security should exist at multiple layers:

- UI
- Edge Functions
- Database

---

## Single Responsibility

Every:

- Component
- Function
- Module
- Service

must have a single responsibility.

---

# 5. Architecture Principles

The architecture is divided into three responsibilities.

## Frontend

Responsible for:

- User Experience
- Rendering
- Navigation
- Feedback

Not responsible for business rules.

---

## Edge Functions

Responsible for:

- Authentication
- Authorization
- Validation
- Orchestration

---

## Database

Responsible for:

- Constraints
- Transactions
- Consistency
- Business Rules
- Data Integrity

---

# 6. Development Workflow

Every feature follows this lifecycle.

```
Idea

↓

Requirements

↓

Architecture

↓

Discussion

↓

Approval

↓

Implementation

↓

Pull Request

↓

Independent Review

↓

Approval

↓

Merge

↓

Feature Complete
```

Skipping stages is not allowed.

---

# 7. Scope Management

Every feature has a clearly defined scope.

Anything outside that scope is recorded.

It is not implemented.

Feature scope may only change after approval.

---

# 8. Decision Making

Engineering decisions are based on:

- Long-term maintainability
- Architectural quality
- Business correctness
- Security
- Scalability

Implementation speed is never the primary factor.

---

# 9. Communication Standards

Engineering reports must always distinguish between:

- Facts
- Assumptions
- Code Review
- Browser Testing
- Database Testing
- Limitations

Claims must match reality.

---

# 10. Project Goal

Success is measured by:

- Stability
- Maintainability
- Security
- Architecture Quality
- Documentation Quality
- Engineering Discipline

The objective is not to finish writing code.

The objective is to build a system capable of serving real Hajj campaigns reliably for many years.

---

**End of Part I**
# Part II — Engineering Standards

This section defines the engineering rules that govern every line of code written in this repository.

These are not recommendations.

These are mandatory standards.

Any implementation that violates these standards must be rejected during review regardless of whether it works.

---

# 11. General Engineering Principles

## Correctness Before Speed

Never optimize code that is not yet correct.

A slower correct solution is always preferred over a faster incorrect one.

Performance optimization is a dedicated engineering activity.

Not an excuse for compromising correctness.

---

## Simplicity Over Cleverness

Code should be understandable after six months.

Avoid writing code that is "smart".

Write code that is obvious.

Future maintainers must understand code without reverse engineering it.

---

## Readability Is a Feature

Readable code has business value.

Every function should explain itself through:

- naming
- structure
- responsibilities

Comments are not substitutes for good code.

---

## Explicit Beats Implicit

Avoid hidden behavior.

Avoid magic values.

Avoid assumptions.

State business rules explicitly.

---

## One Source of Truth

Every business concept must have exactly one authoritative source.

Examples:

Passenger status

Season state

Room occupancy

Financial balance

Permission model

Duplicate sources create bugs.

---

## Business Logic Must Be Deterministic

The same input must always produce the same result.

Business rules should never depend on UI timing.

Realtime timing.

Network latency.

Component lifecycle.

Browser behavior.

---

# 12. Project Architecture Philosophy

The architecture follows strict separation of concerns.

Every layer owns one responsibility.

UI

↓

Application

↓

Domain Logic

↓

Infrastructure

↓

Database

No layer may bypass another without a valid architectural reason.

---

# 13. React Architecture

React components exist to render UI.

Nothing more.

React components should never become business engines.

---

## Components should be

Small

Focused

Reusable

Predictable

Testable

---

Each component should answer only one question:

"What is my responsibility?"

If the answer contains "and",

the component is doing too much.

---

Bad:

PassengerPage

- loads data
- validates forms
- uploads files
- calculates finance
- prints reports
- updates permissions

Good:

PassengerList

PassengerFilters

PassengerForm

PassengerDocuments

PassengerActions

PassengerFinanceCard

PassengerPrintMenu

Each has one responsibility.

---

# 14. Component Size Limits

Recommended:

100–200 lines

Acceptable:

300 lines

Review Required:

400 lines

Anything above 500 lines requires architectural justification.

Large files hide problems.

Splitting files is not bureaucracy.

It is maintainability.

---

# 15. State Management Rules

State should exist only where necessary.

Never duplicate state.

Never synchronize duplicated state manually.

Prefer derived values.

Example:

Store:

Passengers

Compute:

Filtered passengers

Selected passengers

Statistics

Counts

Progress

Do not store derived data.

---

Local state is preferred.

Global state is expensive.

Introduce global state only when multiple independent parts truly require it.

---

# 16. TypeScript Standards

Type safety is mandatory.

Never disable the compiler to make code compile.

Never use:

any

except under documented and reviewed circumstances.

Prefer:

unknown

explicit interfaces

type narrowing

type guards

discriminated unions

---

Interfaces should describe business entities.

Not UI convenience.

Example:

Passenger

Room

Bus

Season

Flight

Payment

Not:

PassengerCardData

PassengerTemporaryObject

RandomResponse

---

Types must communicate meaning.

---

# 17. Naming Standards

Names should describe intent.

Not implementation.

Good:

calculateRemainingBalance

assignPassengerToRoom

closeSeason

validatePassport

Bad:

handleData

processStuff

temp

newObject

result2

abc

---

Variables:

noun

Functions:

verb

Booleans:

is

has

can

should

Collections:

plural

Constants:

UPPER_CASE only when truly constant.

---

# 18. Function Design

Functions should be small.

Predictable.

Single purpose.

Ideal size:

10–30 lines.

Large functions usually indicate missing abstractions.

---

A function should do one thing.

If the function description requires "and",

split it.

---

Avoid deeply nested logic.

Prefer early returns.

Reduce indentation.

Improve readability.

---

# 19. Error Handling

Never ignore errors.

Never swallow exceptions.

Every failure must have an intentional behavior.

Possible outcomes:

Recover

Retry

Rollback

Notify

Log

Fail safely

Doing nothing is not acceptable.

---

User-facing errors must be understandable.

Developer errors must be detailed.

Never expose internal stack traces to end users.

---

# 20. Logging Philosophy

Logs exist for operations.

Not for debugging forever.

Every log should answer one of these:

What happened?

When?

Why?

Which entity?

Who initiated it?

What was the result?

Avoid meaningless logs.

Example:

"clicked button"

provides no operational value.

Prefer structured logs.

---

**End of Part II**

> *Editorial correction (recovery review, 2026-09-30): the approved v1.0 text
> carries no `End of Part II` marker, although Parts I, III, IV and V all close
> with one. This marker is added — it is the only line in this document that is
> in neither the archived original nor the three later additions.*
# Part III — Backend, Database & Security Standards

This section defines the architecture standards for the backend, database, APIs, security model, and data integrity.

The backend is the foundation of the system.

If the backend is weak, no frontend can compensate for it.

---

# 21. Backend Philosophy

The frontend is not trusted.

The browser is a presentation layer only.

Every business rule that protects data must be enforced on the server.

Never rely on:

- hidden buttons
- disabled inputs
- frontend validation
- React state
- client-side permissions

Anything executed in the browser can be modified.

The server is always the source of authority.

---

# 22. Supabase Architecture

Supabase is not just a database.

Within this project it serves as:

- PostgreSQL database
- Authentication provider
- Storage
- Realtime engine
- Edge Functions
- Row Level Security
- RPC execution layer

Every feature should use the appropriate capability instead of duplicating functionality.

---

# 23. Database Philosophy

The database is part of the application.

Business rules belong as close to the data as possible.

Whenever a rule must always be true, enforce it in PostgreSQL.

Examples:

- UNIQUE constraints
- CHECK constraints
- FOREIGN KEY constraints
- NOT NULL constraints
- Triggers
- Policies
- Transactions

Never assume the frontend will always behave correctly.

---

# 24. Single Source of Truth

Each piece of business data must have exactly one owner.

Ownership is **stored where the entity is independent, and derived where ownership
is unambiguous** (Issue #42 §4). Deriving is not laziness: storing `season_id` on
`payments` makes it possible for a payment's season to contradict its owner's.
Deriving makes that contradiction impossible by construction.

Season ownership **stored** (the row carries `season_id`):

- `passengers`
- `rooms`
- `camps`
- `buses`
- `flights`
- `announcements`

Season ownership **derived** (reached through the owning row):

- `payments`, `custom_charges` → via `passenger_id`
- `financial_group_members`, `financial_groups` → via their members
- `notification_deliveries`, `pilgrim_push_subscriptions` → via `passenger_id`

**Not seasonal at all:**

- `user_profiles`
- `company_config`, `company_assets`
- `pricing_settings`

Other business facts and their owners:

Passenger status

→ `passengers`

Room occupancy

→ `passengers.room_id`, counted against `rooms.capacity`

Financial balance

→ computed from `payments` and `custom_charges` against the season's price
snapshot — never stored as a column

Season status

→ `seasons`

Historical price for a past season

→ `season_pricing_snapshot`, **not** `pricing_settings`

`pricing_settings` is a **current company setting**, not a seasonal one. A season's
dues are fixed against the snapshot taken for that season, because computing them
from live settings at render time retroactively rewrote the balances of archived
seasons.

Never duplicate values across tables unless there is a documented architectural reason.

Duplicated data eventually becomes inconsistent.

---

# 25. Transactions

Multi-step operations must be atomic.

Either everything succeeds.

Or nothing changes.

Examples:

Create financial group

+
Add first member

Assign room

+
Update occupancy

Delete season

+
Delete related resources

Generate financial document

+
Store audit record

If one step fails, the entire operation must rollback.

Partial success is considered failure.

---

# 26. RPC Standards

RPCs exist to protect business workflows.

Do not create RPCs merely to reduce frontend code.

Create RPCs when:

- multiple SQL statements belong together
- transactions are required
- security boundaries exist
- business logic belongs near the data

RPCs should have clear names.

Example:

create_financial_group_with_member()

instead of

process()

---

RPCs must:

- validate inputs
- return deterministic outputs
- rollback on failure
- document expected errors

---

# 27. Row Level Security (RLS)

RLS is mandatory.

No production table should depend on frontend permissions.

Policies must explicitly define:

Who can read

Who can insert

Who can update

Who can delete

Default behavior should deny access.

Allow only what is explicitly required.

---

# 28. Security Definer Functions

SECURITY DEFINER functions are dangerous.

Use them only when absolutely necessary.

Every SECURITY DEFINER function must:

- **pin `search_path` to `public, pg_temp`** — with `pg_temp` **last**, so it cannot
  shadow `public` — or to `''` when the body names no schema object at all. Never
  leave it unset, and never merely "set it explicitly": an unpinned or badly ordered
  `search_path` is how a definer function is made to execute an attacker's object.
- validate permissions internally
- expose the smallest possible capability
- avoid privilege escalation
- **carry explicit grants.** PostgreSQL grants `EXECUTE` to `PUBLIC` by default, and
  `PUBLIC` includes `anon`. Every restriction therefore begins with
  `REVOKE EXECUTE ... FROM PUBLIC`, then grants the required roles by name.
  `REVOKE ... FROM anon` alone does nothing.
- be documented

Never expose unrestricted administrative operations.

This is the authoritative statement of the rule. §35.1 applies it to migration
authoring and drift checking; where the two are read together, they say the same
thing and neither relaxes the other.

---

# 29. Authentication

Authentication answers:

Who are you?

Authorization answers:

What are you allowed to do?

Never confuse the two.

Being authenticated never automatically grants permissions.

Permissions are business decisions.

---

# 30. Authorization

Permissions must be role-based.

Avoid hardcoded user checks.

Never write:

if (user.email === "...")

Never depend on UI visibility.

Permission checks belong in the backend.

The UI may hide unavailable actions for usability,

but the backend must enforce every restriction.

---

# 31. Data Validation

Validation exists at multiple layers.

Frontend

→ usability

API

→ request integrity

Database

→ data integrity

Each layer has its own responsibility.

Do not remove validation from one layer because another layer exists.

Validation should be redundant by design.

---

# 32. Storage Standards

Files are business assets.

**Business documents are permanent records** and are never deleted as a side effect
of anything:

- passports
- IDs
- contracts
- tickets
- permits
- visas
- pilgrim photos

**Transient artefacts are not**, and must have a defined lifecycle: failed and
orphaned uploads, generated previews, temporary imports. An orphan-cleanup path is
legitimate for these and only these.

Each file should have:

- owner
- upload timestamp
- uploader
- category
- storage location

Never depend solely on filenames.

Metadata belongs in the database.

## Buckets are private by default

A bucket is public only where a genuine unauthenticated surface needs it, and that
exception is named, not assumed.

- `passengers-docs` — **private**. Pilgrim documents.
- `company-private` — **private**, and narrower still: every policy is gated on
  `manage_users`, so an authenticated employee without that permission cannot read
  it either.
- `company-assets` — **public, deliberately**. The logo, login background and banner
  must render on the login screen, before any session exists. That is the whole
  justification, and it does not extend to anything else.

Every bucket declares its MIME allowlist and size limit at creation.

## Store object keys, never URLs

Database columns hold **storage object keys**. Access to a private object is a
**short-lived signed URL**, minted per request by the server.

Columns named `*_url` currently hold object keys, not URLs — a naming debt recorded
in `docs/architecture/BACKLOG.md` ن١٢, not a licence to store URLs.

## Public surfaces get booleans, not keys

The Pilgrim Portal projection returns **document existence flags**
(`has_photo`, `has_hajj_permit`, `has_flight_ticket`) and never an object key. Actual
document access goes through the `pilgrim-doc` Edge Function, which resolves the
pilgrim from their session and returns a signed URL for that pilgrim's own object.
A caller cannot express "give me another pilgrim's file" because no passenger id and
no object path is part of the request.

---

# 33. Audit Trail

Critical operations must be traceable.

The system should always answer:

Who performed the action?

When?

What changed?

What was the previous value?

What is the new value?

Audit history is not optional for the operations within audit scope.

**Scope is explicit, not assumed.** Audit coverage is a named set of tables, defined
by `SECURITY_ARCHITECTURE.md` §10, and it is smaller than "everything". Adding a
business-critical table to that set is an architectural decision; assuming a table
is covered because it feels important is how an audit gap is discovered after the
fact. Do not claim coverage you have not checked against the triggers that exist.

**The actor is never supplied by the client.** It comes from `auth.uid()`, or from
the delegated-actor pattern for paths that write with the service key (where
`auth.uid()` is empty). When the actor cannot be determined, the write **fails
closed** — an audit row with an empty actor leaves "who did this?" unanswered, which
is the first question the log exists to answer.

**Suppression exists, once, and does not generalise.** `delete_season()` alone may
suppress row-level audit triggers, through the `audit_suppression` table keyed on
`txid_current()`. That table carries no grant to any role — not even `service_role` —
so no application role can set the flag. This replaced a session-variable (GUC) flag
that an adversarial review proved could be set by any `authenticated` role, deleting
a pilgrim with no audit row and no error: the one control in the audit design that
failed **open and silently**. Do not add a second suppression path.

Never overwrite history.

Append new records.

---

# 34. Destructive Operations

Permanent deletion must be intentional, and it must be survivable.

**The system does not implement soft delete.** There is no `deleted_at` column
anywhere in the schema, and none should be added without an approved architectural
decision. Soft delete is a **deferred** design option, not the current design, and
the Playbook must not describe it as though it were.

What protects business data today is not a hidden row — it is four rules.

## Refuse rather than cascade

Where losing a record would destroy history, the foreign key is `RESTRICT`, not
`CASCADE`. `payments.passenger_id` is `RESTRICT` precisely so that a payment can
never disappear as a side effect of deleting a pilgrim. Removal goes through a named
path that preserves the history, or it does not happen.

`RESTRICT` is also a safety net: if a seasonal table is added later and forgotten in
`delete_season()`, the delete fails loudly instead of orphaning rows.

## Destructive operations are transactional and counted

`delete_season()` runs in one transaction, refuses to delete an **open** season, and
counts every affected category **before** deleting — after deletion there is nothing
left to count. Partial completion is not a possible outcome.

## Evidence outlives the data

`audit_log` and `season_pricing_snapshot` have no foreign key to `seasons`, and
`delete_season()` deliberately does not touch them. This is what makes a season
deletion provable after the fact. Any future destructive operation must answer the
same question: what remains afterwards to prove this happened?

## Transient data may be deleted outright

Temporary imports, failed uploads, caches, generated previews and orphaned temporary
files carry no business history and may be removed by a cleanup path.

---

# 35. Migrations

Database schema changes must always use migrations.

**Never modify production tables manually.** The single exception is the recorded
break-glass procedure in §35.1, which is an incident, not an alternative route.

Every migration must be:

- deterministic
- repeatable
- version controlled
- reviewed **before it reaches any database**
- **immutable once merged or applied**

**Corrections roll forward.** A migration that has been merged or applied is never
edited: its content is the record of what the database was told to do, and changing
it makes that record a lie while silently diverging every environment rebuilt from
it. Write a new migration instead. Down-migrations are not this project's recovery
mechanism and "reversible whenever possible" is not a requirement here.

Where a historical version exists in the remote ledger but its SQL is reproduced by
the V1 baseline, the repository keeps a **ledger compatibility anchor**: a file that
deliberately contains no SQL, carrying only the version string the CLI matches on.
Adding SQL to an anchor executes it against an empty database on every fresh rebuild
and breaks the baseline proof. Anchors are never "filled in".

Schema history is part of the source code.

§35.1 states the procedure that makes this section operational. Where both speak,
§35.1 is the operative text and this section is its summary.

---

# 35.1 Canonical Migration Workflow (Supabase CLI)

**Status:** binding from the V1 cutover onward. This section makes §35 operational; §35 states the principles, this states the procedure.

**The normal path, and the only normal path:**

```
repository migration
  -> local rebuild / verification
  -> PR review
  -> merge
  -> Supabase CLI `db push`
  -> post-deploy drift verification
```

Dashboard SQL editor and MCP `apply_migration` are **not** the normal migration path. See *Break-glass* below for the one narrow exception.

The CLI version this workflow assumes is pinned in `package.json`. Invoke it as `npm run supabase -- <command>` so every developer and agent runs the same binary.

## CREATE

- Create migrations with `npm run supabase -- migration new <name>`.
- **The CLI-generated timestamp is authoritative.** After cutover, never hand-write, invent, renumber, or reuse a migration version. A version that the CLI did not generate is a defect.
- One migration per logical change. Do not batch unrelated changes to save a file.

## DEVELOP

- Migration SQL is reviewed in Git like any other source. It is not a script that happens to live in the repo.
- **Function DDL names exact signatures.** `ALTER`/`DROP FUNCTION` must carry the full argument list. Resolving a function by bare name is how a migration written against a drifted signature dies on `42883` — this project has already paid that cost once.
- **`SECURITY DEFINER` functions require an explicit `search_path`.** Use `public, pg_temp` (with `pg_temp` **last**, so it cannot shadow `public`), or `''` when the body names no schema object at all. Never leave it unset.
- **Privileges and grants are explicit.** PostgreSQL grants `EXECUTE` to `PUBLIC` by default, and `PUBLIC` includes `anon`. Every restriction therefore begins with `REVOKE EXECUTE ... FROM PUBLIC`, then grants the required roles by name. `REVOKE ... FROM anon` alone does nothing.
- **Destructive DDL requires explicit preconditions.** Before a `DROP`, the migration itself must prove the object is unused — at apply time, not only at authoring time, because a caller can appear in between.
- **No `DROP ... CASCADE` by default.** If a dependency exists, the migration should fail loudly rather than remove objects silently.
- Prefer fail-loudly assertions over comments. A `RAISE EXCEPTION` that guards an assumption is worth more than a paragraph describing it.
- **Scope assertions to what the migration owns.** A postcondition that sweeps every object in a schema will one day fail because of something the migration never touched. Assert on the exact signatures changed; audit anything wider with `RAISE NOTICE`.

## LOCAL VERIFY

- Rebuild from repository state alone: `npm run supabase -- db reset`.
- The seed is **local bootstrap only** (`supabase/seed.sql`). It carries no production or demo rows, and `db push` never runs it.
- Where the change is security-relevant, verify the outcome with independent queries after the reset — not only with the migration's own postconditions, which cannot be their own witness.
- Exercise the real failure path, not just the happy one.

## PR

- **The migration is reviewed before it reaches any database.** Review first, apply second — never the reverse.
- Application code and migration ordering must be safe in both directions: the deployed frontend must work against both the old and the new schema for the window in which they overlap. Additive schema change first, code second; removals only after no deployed code reads them.
- A migration PR should contain the migration. Mixing schema and unrelated application changes makes both harder to review and impossible to revert cleanly.

## PRE-DEPLOY

- Review the exact set of migrations that will be applied — `npm run supabase -- migration list` against the target.
- Verify the intended migration set matches expectation; investigate anything unexpected before pushing, never after.
- `npm run build`.
- `npm run lint`, and report the **delta** against the known baseline, not the absolute count.
- A clean `db reset` from repository state.

## DEPLOY

- **After merge**, never before.
- The normal mechanism is `npm run supabase -- db push`.
- Dashboard and MCP `apply_migration` are **prohibited** for normal migrations.

## POST-DEPLOY

- Verify the **exact** migration version recorded in the remote ledger, and that it matches the repository filename.
- Verify the intended schema and security state with independent catalog queries.
- Run a drift check (see *Drift checking is not schema diffing* below).

## ROLLBACK

- Roll forward. Write a new migration that corrects the problem.
- **Never edit a migration that has been merged or applied.** Its content is the record of what the database was told to do; changing it makes that record a lie and silently diverges every environment built from it.

## BREAK-GLASS

If a dashboard or MCP schema mutation is ever genuinely required in an emergency:

1. **Explicit authorization** from the project owner, recorded.
2. **The exact SQL executed is preserved**, byte for byte.
3. A **same-day** repository migration reconciling the change, so the repository and the database agree again within the day.
4. The **reason is documented** — what forced it, and why the normal path could not be used.
5. **Version and content drift is never left silently in place.** Any divergence between the remote ledger and the repository is recorded and scheduled, not tolerated.

Break-glass is an incident, not a shortcut. Each use should be rare enough to remember.

## Drift checking is not schema diffing

**`supabase db diff --linked` alone is NOT sufficient for security equivalence.** It compares schema shape. Most of this system's security lives in things it does not, or does not reliably, report.

V1 baseline validation — and any later drift check that claims security equivalence — must additionally compare:

- ACLs and grants on tables, views, sequences and functions
- default privileges (`ALTER DEFAULT PRIVILEGES`)
- RLS enabled/disabled per table
- RLS policies, including `USING` and `WITH CHECK` expressions
- function `SECURITY DEFINER` / `SECURITY INVOKER` mode
- function `search_path` (`proconfig`)
- `EXECUTE` privileges per role, **including `PUBLIC`** — check `aclexplode` grantee `0`, not the ACL string
- storage buckets, including `public` flag and MIME/size limits
- storage policies

A schema diff that comes back empty while any of the above differs is a false negative, and it is exactly the kind of false negative that ships an anonymous read path to production.

---

# 36. Realtime Standards

Realtime improves user experience.

Realtime must never become business logic.

Business rules must succeed correctly even if realtime is unavailable.

Realtime is a synchronization mechanism.

Not a validation mechanism.

Not an authorization mechanism.

Not a source of truth.

---

# 37. API Design Principles

APIs should expose business operations.

Not database implementation details.

Good:

assignPassengerToRoom()

closeSeason()

approvePayment()

Bad:

updateTable()

saveObject()

modifyData()

API names should communicate business intent.

---

# 38. Error Responses

Errors should be predictable.

Every write must return a **discriminated result**, and the caller must branch on it.

**Success is proven, never inferred.** The absence of an error object is not success:
an `UPDATE` filtered to zero rows by RLS returns no error at all, and code that read
success from "no error" reported "saved" when nothing had been saved. A successful
result therefore **carries the row**.

The project's contract is `SaveResult<T>` (`src/company/saveResult.ts`):

- `saved` — the row was found, authorized, and changed. Carries the row.
- `unchanged` — found and authorized, nothing differed. Success, and carries the row.
- `unauthorized` — permission refused. Not a fault, not an absence.
- `not_found` — zero rows reached. **Never read as success.**
- `invalid` — a value rejected before it reached the database. Names the field.
- `failed` — network or database fault.

Distinguishing `unauthorized` from `not_found` from `failed` matters: they need
different messages and different operator responses. Collapsing them into a boolean
and a string throws that away.

User-facing text for a failure is resolved in one place, so messages do not diverge
between screens.

Avoid ambiguous responses.

Clients should always know how to react.

---

# 39. Performance Philosophy

Performance matters.

Correctness matters more.

Measure before optimizing.

Never optimize based on assumptions.

Profile first.

Optimize second.

Measure again.

Every optimization should have measurable value.

---

# 40. Reliability First

The system manages real pilgrims.

Real payments.

Real travel.

Real accommodation.

Real legal documents.

Failures affect people.

Reliability is therefore a product requirement.

Not an engineering preference.

Every backend decision must prioritize correctness, integrity, recoverability, and long-term maintainability over short-term convenience.

---
**End of Part III**
# Part IV — Frontend Architecture, UX & Product Standards

This section defines how the user interface should be designed, implemented, and maintained.

The frontend is not decoration.

It is the operational interface used daily by real Hajj campaign employees.

Every screen must prioritize clarity, speed, reliability, and consistency.

---

# 41. Frontend Philosophy

The frontend exists to help users complete work.

Not to demonstrate technology.

Every interaction should reduce effort.

Every screen should reduce cognitive load.

Every feature should make daily operations easier.

Visual complexity is not product quality.

Operational efficiency is.

---

# 42. Design Principles

The interface should be:

- Clean
- Consistent
- Predictable
- Fast
- Accessible
- Responsive

Users should recognize patterns immediately.

The system should behave consistently across every module.

Consistency is more valuable than novelty.

---

# 43. User Experience Philosophy

The best interface is the one that requires the least explanation.

Users should understand:

- where they are
- what they can do
- what will happen next

without reading documentation.

Every action should feel obvious.

---

# 44. Workflow First

Design complete workflows.

Not isolated screens.

Example:

Creating a passenger is not a form.

It is a workflow.

Registration

↓

Document upload

↓

Validation

↓

Financial setup

↓

Room assignment

↓

Bus assignment

↓

Flight assignment

↓

Completion

Every screen should support the entire operational journey.

---

# 45. Consistency Rules

Identical actions must behave identically everywhere.

Examples:

Delete button

Save button

Cancel button

Search

Pagination

Filtering

Selection

Printing

Confirmation dialogs

Keyboard shortcuts

If behavior changes between pages, users lose confidence.

---

# 46. Navigation Standards

Navigation should reflect business structure.

Not technical implementation.

Users think in terms of:

Passengers

Rooms

Flights

Buses

Finance

Reports

Settings

Not:

Components

Tables

Services

Contexts

Architecture must remain invisible.

---

# 47. Screen Layout Standards

Every major page should follow a consistent structure.

Header

↓

Primary actions

↓

Filters

↓

Content

↓

Secondary actions

↓

Status information

Users should never search for primary actions.

Important controls belong in predictable locations.

---

# 48. Forms

Forms should collect information efficiently.

Every input should have:

- clear label
- validation
- helpful feedback
- appropriate keyboard behavior

Avoid unnecessary fields.

Only request information that provides business value.

---

Long forms should be divided into logical sections.

Not arbitrary pages.

---

# 49. Validation UX

Validation should prevent mistakes.

Not punish users.

Show validation:

- immediately when useful
- before submission when appropriate

Error messages should explain:

What is wrong.

Why it is wrong.

How to fix it.

Never display cryptic technical messages.

---

# 50. Tables

Tables are the primary operational interface.

They must support:

- sorting
- filtering
- searching
- pagination
- bulk actions
- responsive layouts

Users should never scroll horizontally unless absolutely necessary.

Important columns appear first.

Secondary information comes later.

---

# 51. Search Philosophy

Search should be fast.

Forgiving.

Predictable.

Users should not need exact spelling.

Search should prioritize operational usefulness.

Results should update quickly.

Searching should never block normal work.

---

# 52. Filters

Filters should represent business concepts.

Examples:

Season

Status

Flight

Room

Bus

Payment state

Nationality

Missing documents

Avoid technical filters.

Filters should answer operational questions.

---

# 53. Loading States

Every asynchronous action requires visible feedback.

Users should always know:

Loading

Saving

Uploading

Deleting

Synchronizing

Generating

Never leave users wondering whether the system is working.

---

Loading indicators should communicate progress whenever possible.

---

# 54. Empty States

Empty pages should never feel broken.

Explain:

Why nothing is displayed.

What users can do next.

Provide meaningful actions.

Example:

"No passengers have been registered for this season."

Instead of:

"No data."

---

# 55. Error States

Every error should help users recover.

Explain:

What happened.

What can be done.

Whether retrying is appropriate.

Do not blame users.

Do not expose technical details.

---

# 56. Confirmation Dialogs

Confirm only destructive operations.

Examples:

Delete season

Delete passenger

Remove payment

Close season

Archive records

Avoid confirming harmless actions.

Too many confirmations create habit.

Habit reduces safety.

---

# 57. Notifications

Notifications should be meaningful.

Use them for:

Successful completion

Warnings

Recoverable errors

Background progress

Avoid unnecessary success messages.

The interface itself should communicate successful actions whenever possible.

---

# 58. Accessibility

Accessibility is mandatory.

Support:

- keyboard navigation
- visible focus
- sufficient contrast
- readable typography
- screen readers where practical

Accessibility benefits every user.

Not only users with disabilities.

---

# 59. Responsive Design

The system should function across:

Desktop

Laptop

Tablet

Mobile

However,

desktop is the primary operational environment.

Responsive design must never reduce desktop efficiency.

Optimize for the primary users first.

---

# 60. Product Quality Standard

Every new feature must satisfy four questions before release.

Does it solve a real business problem?

Is it understandable without explanation?

Does it remain consistent with the rest of the product?

Can it scale for future Hajj seasons without redesign?

If the answer to any question is "No",

the feature is not ready.

---

**End of Part IV**
# Part V — Business Rules, Hajj Domain & Long-Term Product Vision

This section defines the product philosophy behind the Hajj Management System.

The goal is not merely to build software.

The goal is to build the operational platform that manages the entire lifecycle of a Hajj campaign.

Every engineering decision must support that vision.

---

# 61. Product Vision

The system is designed to become the single operational platform for Hajj campaigns.

It should eventually manage:

- Pilgrims
- Seasons
- Registration
- Documents
- Accommodation
- Transportation
- Flights
- Finance
- Operations Center
- Notifications
- Reports
- Pilgrim Portal
- Users & Permissions
- Future integrations

No business process should require external spreadsheets once the system is fully implemented.

---

# 62. Domain-Driven Thinking

Technology serves the business.

Business never serves technology.

When designing a feature,

start by understanding the operational workflow.

Never begin with database tables.

Never begin with UI components.

Begin with the real-world business process.

---

# 63. Seasons Are the Core of the System

Everything revolves around the active season.

Passengers

Assignments

Accommodation

Flights

Finance

Operations

Reports

Notifications

Documents

Every business entity should clearly define its relationship to a season.

A season is not a filter.

It is the primary business boundary.

---

# 64. Real Operational Workflows

The system should model how campaigns actually operate.

Not how developers imagine they operate.

Examples:

Pilgrims may register late.

Assignments may change.

Rooms may be upgraded.

Flights may be rescheduled.

Payments may arrive after allocation.

Operational reality always takes priority over theoretical perfection.

---

# 65. Business Rules Must Be Configurable

Avoid hardcoded operational policies.

Campaigns differ.

Future regulations change.

Business rules that may change should be configurable.

Examples:

Maximum room capacity.

Bus capacity.

Payment deadlines.

Required documents.

Notification templates.

Approval workflows.

Code should not need modification for ordinary business policy changes.

---

# 66. Data Integrity Above Convenience

Never sacrifice data integrity for user convenience.

If an action could create inconsistent business data,

prevent it.

Users may occasionally become frustrated.

Recovering corrupted operational data is far worse.

---

# 67. Every Action Has Consequences

Before implementing any feature, ask:

What business records will change?

Who depends on those records?

Can the operation be reversed?

Should it be reversible?

Will reports change?

Will notifications change?

Will finance change?

Engineering decisions should consider downstream effects.

---

# 68. Historical Accuracy

History must remain trustworthy.

Past seasons should always represent what actually happened.

Reports generated today for a previous season should match historical reality.

Historical records are business evidence.

Never rewrite history.

Corrections should generate new history,

not replace existing history.

---

# 69. Operational Transparency

Managers should always understand system status.

The system should clearly communicate:

Current season

Operational progress

Incomplete tasks

Missing documents

Outstanding balances

Room occupancy

Bus occupancy

Flight readiness

Critical alerts

Operational visibility reduces management effort.

---

# 70. Reports Represent Decisions

Reports are decision-making tools.

Not decorative documents.

Every report should answer a business question.

Examples:

Which pilgrims still require passports?

Which buses are incomplete?

Which rooms exceed capacity?

Which balances remain unpaid?

Which flights are not finalized?

Every report should support operational action.

---

# 71. Automation Philosophy

Automation should eliminate repetitive work.

Not remove human control.

Automate:

Notifications

Status calculations

Progress indicators

Document classification

Routine validation

Never automate business decisions that require human judgment without explicit approval.

---

# 72. Artificial Intelligence

AI should assist operations.

Not replace responsibility.

Potential future use cases:

Document classification.

OCR extraction.

Duplicate detection.

Operational recommendations.

Risk identification.

Smart search.

Report summarization.

AI suggestions must always remain reviewable by humans.

Human operators make final decisions.

---

# 73. Company Profile and Multi-Deployment Architecture

The product supports multiple Hajj campaigns through repeatable, isolated
deployments of one shared codebase.

Each customer deployment has exactly one company, one Supabase project, one
database, and one Vercel deployment.

The application is not a multi-tenant system. Do not add a companies table, a
tenant identifier, campaign membership, or a company selector to business data.

`company_config` row `id = 1` is the deployment-level persistence source for the
Company Profile. `company_assets` is the extensible source for company media.
Legacy asset URL columns remain compatibility inputs until an approved removal
migration is completed.

Company-specific identity, contact information, financial configuration,
branding, portal configuration, and assets must be configuration-driven. A new
customer must never require a source-code change or a separate codebase.

Application components must consume focused Company Profile hooks/selectors.
They must not query `company_config`, interpret its raw row shape, or construct
their own company defaults.

Company Service is a configuration boundary only. It may load, persist,
normalize, map legacy fields, resolve configuration assets, and expose typed
profile modules. It must not contain financial calculations, permission
decisions, season rules, operational workflows, room allocation, report
generation, or UI state.

`ReportBranding` is a data transfer object only. Rendering and formatting belong
to report/print modules; asset resolution and compatibility fallback belong to
Company Profile normalization.

Public surfaces such as the Pilgrim Portal receive an explicit safe projection
of the Company Profile. Secrets are environment configuration and must never be
stored in Company Profile.

This rule is implemented by the approved Company Profile architecture described
in `COMPANY_PROFILE_ARCHITECTURE_REVIEW.md`, with completion records in
`COMPANY_PROFILE_PHASE1.md` and `COMPANY_PROFILE_PHASE2.md`.

One platform.

Multiple customers.

---

# 74. Scalability

The product should scale across:

More users.

More pilgrims.

More seasons.

More reports.

More integrations.

**Serving more companies is not a scaling axis inside one system.** A new customer is
a new deployment — its own Supabase project, its own database, its own Vercel
deployment, from the same codebase (§73). Nothing in this section authorises a
tenant identifier, a `companies` table or a company selector.

Architectural decisions should prioritize sustainable growth over short-term implementation speed.

---

# 75. Extensibility

Future modules should integrate naturally.

Potential additions include:

Visa management.

Government integrations.

Payment gateways.

WhatsApp automation.

Mobile applications.

Electronic signatures.

Attendance tracking.

Warehouse management.

Supplier management.

No future module should require redesigning the existing architecture.

---

# 76. Operational Reliability

The system will be used during one of the busiest operational periods of the year.

Downtime has operational consequences.

Every feature should prioritize:

Reliability.

Predictability.

Recoverability.

Graceful failure.

Monitoring.

Stability is a feature.

---

# 77. Product Philosophy

The product should reduce stress.

Not create it.

Users should feel confident while operating the system.

Confidence comes from:

Consistency.

Correctness.

Clarity.

Speed.

Trust.

Every feature should strengthen those qualities.

---

# 78. Engineering Responsibility

Engineers are responsible for more than writing code.

They protect:

Business continuity.

Operational accuracy.

Financial correctness.

Historical records.

User trust.

Every pull request contributes to—or damages—that responsibility.

---

# 79. Continuous Improvement

The architecture is expected to evolve.

Refactoring is encouraged.

Technical debt should be reduced continuously.

However,

changes should improve the system,

not merely make it different.

Every architectural change should have a measurable benefit.

---

# 80. Final Engineering Principle

Whenever uncertainty exists,

choose the solution that will still make sense five years from now.

Do not optimize for today's shortcut.

Design for the future.

The objective is not to build software quickly.

The objective is to build the most reliable Hajj Management Platform possible.

---

# Architecture Decisions

Architectural decisions that become mandatory project standards are recorded in
`docs/architecture/ADR/`, one file per decision, numbered sequentially and never
renumbered. They are not temporary implementation notes: each defines a long-term
engineering rule and remains valid until an approved successor supersedes it.

This document **references** an ADR; it does not copy it. Where a rule here is
implemented by an ADR, the rule states the requirement and names the ADR, so that a
decision and its statement cannot drift apart.

| # | Decision | Status |
|---|---|---|
| `ADR-001` | **Company Profile** — `CompanyProfile` is the application contract; `company_config` is only the persistence model. See `docs/architecture/ADR/ADR-001-company-profile.md`. | Approved |

The Company Profile rule itself is stated in §73.

# Known Exceptions Register

This register records where the repository does **not** currently meet a rule stated
above.

It exists so that the gap is visible and bounded. **It does not weaken any rule.**
Every rule named here remains in force exactly as written; what is recorded is debt
against it, not an amendment to it. A new violation is still a review defect — the
register is a list of the ones already known, not a licence to add more.

## E-1 · §14 Component Size Limits

§14 requires architectural justification above 500 lines. **13 of 108 TypeScript
files in `src/` exceed 500 lines; 17 exceed the 400-line review threshold.**

| Lines | File |
|---:|---|
| 2485 | `src/components/PassengersPage.tsx` |
| 2392 | `src/components/ReportsPage.tsx` |
| 1621 | `src/components/FinancePage.tsx` |
| 1431 | `src/types/database.ts` — **generated**, see below |
| 1217 | `src/components/UsersPage.tsx` |
| 1113 | `src/components/HotelPage.tsx` |
| 1005 | `src/components/AdminsPage.tsx` |
| 831 | `src/utils/index.ts` |
| 813 | `src/components/FlightsPage.tsx` |
| 706 | `src/components/CampsPage.tsx` |
| 629 | `src/components/SeasonCloseWizard.tsx` |
| 575 | `src/components/PortalPage.tsx` |
| 546 | `src/components/PilgrimPortal.tsx` |

`src/types/database.ts` is generated from the schema and is **out of scope** for §14:
it is not hand-maintained code and splitting it would be meaningless.

`PassengersPage.tsx` is the case §13 names as its **Bad** example — one component that
loads data, validates forms, uploads files, calculates finance, prints reports and
updates permissions. The cost is not theoretical: `docs/architecture/BACKLOG.md` ن١٣
records a document-viewer modal duplicated verbatim twice in that file, both
rendering, the second covering the first — which is why a fix applied to one copy
appeared to do nothing.

**Policy:** reduce per file touched, on the ESLint-baseline pattern. No sweeping
refactor, and no new file admitted above the threshold without justification.

## E-2 · §16 TypeScript Standards

§16 permits `any` only under documented and reviewed circumstances. **139 occurrences
across 12 files** in `src/`, plus 10 `ts-ignore` / `ts-nocheck` / `eslint-disable`
directives. None carries the documentation §16 requires.

This sits alongside the standing ESLint baseline (`BACKLOG.md` ن٥: 291 notes, held as
a fixed reference, reduced per file touched, never swept in one pass). Lint is
reported as a **delta against that baseline**, never as an absolute count.

**Policy:** same as E-1 — reduce per file touched; new `any` needs the documented
justification §16 already demands.

## E-3 · §58 Accessibility — **status unknown, not assessed**

§58 states that accessibility is mandatory. **No accessibility audit has ever been
performed on this project**, and there is no automated accessibility checking in the
lint configuration or in CI.

The honest status is therefore **unknown**. This register does not claim the product
is accessible, and it does not claim it is inaccessible.

> **Attribute counts are not evidence either way.** Counting `aria-*` attributes or
> `role=` occurrences measures neither conformance nor failure: a correct, semantic,
> keyboard-navigable interface may need very few ARIA attributes, and a heavily
> annotated one may still be unusable. Do not cite such counts as a pass or a fail,
> and do not treat adding attributes as remediation.

§58's five requirements — keyboard navigation, visible focus, sufficient contrast,
readable typography, screen readers where practical — remain binding on new work and
are reviewable directly at the point of change.

**Policy:** an actual assessment is required before any statement is made about
conformance. Until one exists, the correct answer to "is the system accessible?" is
"it has not been assessed", and §58 continues to bind every change on its own terms.

**End of Part V**
