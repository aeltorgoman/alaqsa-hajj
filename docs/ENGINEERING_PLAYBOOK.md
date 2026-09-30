# Hajj Management System
# Engineering Playbook

**Version:** 2.0
**Status:** Draft — awaiting approval
**Supersedes:** v1.0 (approved), archived at `docs/archive/ENGINEERING_PLAYBOOK_v1.0_original.md`
**Owner:** Project Architecture Team
**Applies To:** Entire Hajj Management System

---

# What This Document Is

This document defines the engineering standards, architecture principles, development
workflow, review process and governance rules for the Hajj Management System.

Every engineer, AI assistant, reviewer and contributor working on this project is
expected to follow it.

It must be consulted before designing a feature, writing code, reviewing a pull
request, creating a database migration, changing architecture, or making a product
decision.

If a decision conflicts with this document, this document governs until it is
officially updated.

---

# How v2.0 Relates to v1.0

v1.0 was approved, and its text is preserved unchanged in `docs/archive/`. It entered
this repository in a mechanically damaged state that lost 42 of its 80 sections; that
damage was diagnosed, the text was restored from the approved source, and its rules
were then reconciled against the repository before this restructuring began.

**Nothing in this document is new policy invented during the rewrite.** Every rule
below is one of three things, and Appendix A says which for each:

- **Restored** — the approved v1.0 rule, carried over.
- **Modernised** — the v1.0 rule, corrected against what the repository actually does,
  with the evidence recorded in Appendix C.
- **New (governance)** — rules about how this document and its companions are
  maintained. These are genuinely new text. v1.0 listed §§81–86 in its table of
  contents and **never wrote them**; that intent is now fulfilled in Part 7. Such text
  is labelled `NEW (governance)` and is never described as recovered.

Appendix C maps every v1.0 section to its destination here, including every removal
with its reason.

---

# Rule Levels

Every rule carries a level and an identifier. The identifier is stable: cite it in
reviews, and it stays valid across future editions.

| Level | Meaning |
|---|---|
| **MUST** `M-nn` | Not negotiable. An implementation that violates a MUST is rejected in review regardless of whether it works. Changing a MUST requires an approved architectural decision. |
| **SHOULD** `S-nn` | The default. Deviating is allowed where the case genuinely differs, and the deviation is stated in the pull request — not left to be discovered. |
| **GUIDELINE** `G-nn` | Judgement, not enforcement. Useful for reviewers to point at; never a blocker on its own. |
| **CONTEXTUAL** `C-nn` | A statement of fact about how this system is built, which constrains design. Not a target to hit but a condition to respect. |

Appendix B indexes every MUST in one place.

Where this document and a more specific one disagree, Part 7.1 decides which wins.

---

# Table of Contents

**Part 1 — Engineering Principles**

1.1 Correctness Before Speed
1.2 Simplicity, Readability, Explicitness
1.3 One Source of Truth
1.4 Determinism
1.5 Data Integrity Above Convenience
1.6 Redundant Validation by Design
1.7 Atomic Operations
1.8 Every Action Has Consequences
1.9 Reliability Is a Product Requirement
1.10 Long-Term Thinking

**Part 2 — Application Architecture**

2.1 Deployment Model
2.2 The System Is Not Multi-Tenant
2.3 Layer Responsibilities
2.4 The Company Profile Boundary
2.5 The Backend Is the Authority
2.6 Supabase as a Platform
2.7 Frontend Code Architecture
2.8 TypeScript Standards
2.9 Naming Standards
2.10 API Design
2.11 Typed Result Contracts
2.12 Error Handling
2.13 Logging

**Part 3 — Interface and Operational UX**

3.1 Frontend Philosophy
3.2 Design Principles
3.3 User Experience Philosophy
3.4 Workflow First
3.5 Consistency Rules
3.6 Navigation Standards
3.7 Screen Layout Standards
3.8 Forms
3.9 Validation UX
3.10 Tables
3.11 Search
3.12 Filters
3.13 Loading States
3.14 Empty States
3.15 Error States
3.16 Confirmation Dialogs
3.17 Notifications
3.18 Accessibility
3.19 Responsive Design
3.20 Product Quality Standard

**Part 4 — Database and Migrations**

4.1 The Database Owns Invariants
4.2 Ownership of Business Data
4.3 Transactions
4.4 RPC Standards
4.5 Migrations Are the Only Path
4.6 Immutability and Roll-Forward
4.7 Migration Authoring Rules
4.8 Local Verification
4.9 Backward-Compatible Deployment Ordering
4.10 Deploy
4.11 Post-Deploy Verification and Drift Control
4.12 Break-Glass
4.13 Destructive Operations

**Part 5 — Security**

5.1 Authority
5.2 Security Is Designed In
5.3 Authentication and Authorization Are Different Questions
5.4 Authorization
5.5 Row Level Security
5.6 SECURITY DEFINER Functions
5.7 Storage
5.8 Public Surfaces and the Pilgrim Portal
5.9 Rate Limiting
5.10 Auditability
5.11 Secrets and the Service Role

**Part 6 — Hajj Domain**

6.1 Domain-Driven Thinking
6.2 The Season Is the Primary Business Boundary
6.3 Season Lifecycle
6.4 Real Operational Workflows
6.5 Business Rules Must Be Configurable
6.6 Historical Accuracy
6.7 Operational Transparency
6.8 Reports Represent Decisions
6.9 Automation
6.10 Artificial Intelligence
6.11 Arabic Domain Values
6.12 Product Vision

**Part 7 — Workflow, Verification and Governance**

7.1 Document Authority
7.2 The Repository Is Source of Truth
7.3 Feature Lifecycle
7.4 Scope Management
7.5 Decision Making
7.6 Communication Standards
7.7 Pull Request Standards
7.8 Code Review
7.9 Verification Regime
7.10 Verification Standards Learned the Hard Way
7.11 Deployment Verification and Parity
7.12 Failure Recovery
7.13 Technical Debt
7.14 Engineering Responsibility
7.15 Continuous Improvement
7.16 ADR Lifecycle
7.17 Amending This Playbook
7.18 Working With AI Agents
7.19 Definition of Success
7.20 Final Engineering Principle

**Appendices**

A. Rule Inventory
B. Index of Every MUST
C. v1.0 → v2.0 Section Mapping
D. Known Exceptions Register
E. Referenced Documents

---

# Part 1 — Engineering Principles

Technology-independent rules. They outlive any framework this project uses.

## 1.1 Correctness Before Speed

**MUST `M-01`** — Never optimise code that is not yet correct. A slower correct
solution is always preferred over a faster incorrect one.

Performance optimisation is a dedicated engineering activity, not an excuse for
compromising correctness.

**SHOULD `S-01`** — Measure before optimising. Never optimise on assumption: profile
first, optimise second, measure again. Every optimisation should have a measurable
value.

Performance matters. Correctness matters more.

## 1.2 Simplicity, Readability, Explicitness

**SHOULD `S-02`** — Prefer the simplest architecture capable of supporting future
growth. Avoid unnecessary abstraction. Avoid clever code. Code should be
understandable after six months, and future maintainers must understand it without
reverse-engineering it.

**SHOULD `S-03`** — Optimise for readability. Code is read far more often than it is
written, and readable code has business value. Every function should explain itself
through naming, structure and responsibilities. Comments are not a substitute for
good code.

**SHOULD `S-04`** — Be explicit. Avoid hidden behaviour, magic values and
assumptions. State business rules explicitly.

## 1.3 One Source of Truth

**MUST `M-02`** — Every business concept has exactly one authoritative source.
Duplicate sources create bugs, and duplicated business logic is technical debt.

Named examples: passenger status, season state, room occupancy, financial balance,
permission model.

**MUST `M-03`** — The definition or calculation of a business concept has one shared
source. Pages may vary presentation, ordering, visibility and available actions, but
must never independently reimplement the same predicate.

When two screens disagree about a fact, the bug is the duplicated predicate, not the
screen. This is the rule that produced the readiness, room and passenger helpers and
the print boundary.

## 1.4 Determinism

**MUST `M-04`** — The same input must always produce the same result. Business rules
must never depend on UI timing, realtime timing, network latency, component lifecycle
or browser behaviour.

**MUST `M-05`** — Realtime is a synchronisation mechanism. It is not a validation
mechanism, not an authorization mechanism, and not a source of truth. Business rules
must succeed correctly even when realtime is unavailable.

**SHOULD `S-05`** — Realtime must not be the sole trigger for a write, and refetches
must be ordered so that a late response cannot overwrite newer state.

## 1.5 Data Integrity Above Convenience

**MUST `M-06`** — Never sacrifice data integrity for user convenience. If an action
could create inconsistent business data, prevent it.

Users may occasionally be frustrated. Recovering corrupted operational data is far
worse.

## 1.6 Redundant Validation by Design

Validation exists at multiple layers, and each layer has its own responsibility:

- Frontend → usability
- API → request integrity
- Database → data integrity

**MUST `M-07`** — Do not remove validation from one layer because another layer
exists. Validation is redundant by design.

## 1.7 Atomic Operations

**MUST `M-08`** — A critical operation either completes entirely or does not execute
at all. Partial completion is not an acceptable outcome; partial success is failure.

Part 4.3 states how this is enforced.

## 1.8 Every Action Has Consequences

**GUIDELINE `G-01`** — Before implementing any feature, ask: what business records
will change? Who depends on those records? Can the operation be reversed? Should it
be? Will reports change? Will notifications change? Will finance change?

Engineering decisions should consider downstream effects.

## 1.9 Reliability Is a Product Requirement

The system manages real pilgrims, real payments, real travel, real accommodation and
real legal documents. Failures affect people. It is used during one of the busiest
operational periods of the year, and downtime has operational consequences.

**SHOULD `S-06`** — Every backend decision should prioritise correctness, integrity,
recoverability and long-term maintainability over short-term convenience. Every
feature should prioritise reliability, predictability, recoverability, graceful
failure and monitorability.

Stability is a feature.

## 1.10 Long-Term Thinking

The Hajj Management System is not a website. It is a long-term operating platform for
managing Hajj campaigns, and the objective is a system that stays maintainable,
scalable, secure and understandable for many years.

**SHOULD `S-07`** — Base engineering decisions on long-term maintainability,
architectural quality, business correctness, security and scalability. Implementation
speed is never the primary factor.

**SHOULD `S-08`** — No future module should require redesigning the existing
architecture. Refactoring is encouraged and technical debt should be reduced
continuously — but a change should improve the system, not merely make it different,
and every architectural change should have a measurable benefit.

**GUIDELINE `G-02`** — Whenever uncertainty exists, choose the solution that will
still make sense five years from now. Do not optimise for today's shortcut.

---
# Part 2 — Application Architecture

## 2.1 Deployment Model

The product serves multiple Hajj campaigns through repeatable, isolated deployments
of one shared codebase.

**MUST `M-09`** — Each customer deployment has exactly one company, one Supabase
project, one database and one Vercel deployment.

**MUST `M-10`** — Company-specific identity, contact information, financial
configuration, branding, portal configuration and assets are configuration-driven. A
new customer must never require a source-code change or a separate codebase.

One platform. Multiple customers — each in its own deployment.

## 2.2 The System Is Not Multi-Tenant

**MUST `M-11`** — The application is not a multi-tenant system. Do not add a
`companies` table, a tenant identifier, campaign membership, or a company selector to
business data.

Serving more companies is not a scaling axis inside one system. A new customer is a
new deployment.

## 2.3 Layer Responsibilities

The architecture is divided into three responsibilities:

**Frontend** — user experience, rendering, navigation, feedback. Not responsible for
business rules.

**Edge Functions** — authentication, authorization, validation, orchestration.

**Database** — constraints, transactions, consistency, business rules, data
integrity.

**SHOULD `S-09`** — No layer may bypass another without a valid architectural
reason.

**MUST `M-12`** — Security exists at multiple layers: UI, Edge Functions, database.
A control at one layer is never a reason to omit it at a lower one.

The closed-season guard is the worked example: disabled buttons are user experience,
the write helper gives one consistent message, and the database trigger is the actual
guarantee.

## 2.4 The Company Profile Boundary

**MUST `M-13`** — Application components consume focused Company Profile
hooks/selectors. They must not query `company_config`, interpret its raw row shape,
or construct their own company defaults.

`company_config` row `id = 1` is the deployment-level persistence source for the
Company Profile; `company_assets` is the extensible source for company media.
`company_config` is the persistence model, not the application contract — the
contract is `CompanyProfile`.

**MUST `M-14`** — Company Service is a configuration boundary only. It may load,
persist, normalise, map legacy fields, resolve configuration assets and expose typed
profile modules. It must not contain financial calculations, permission decisions,
season rules, operational workflows, room allocation, report generation or UI state.

`ReportBranding` is a data transfer object only: rendering and formatting belong to
report and print modules; asset resolution and compatibility fallback belong to
Company Profile normalisation.

**MUST `M-15`** — Secrets are environment configuration and must never be stored in
the Company Profile. Public surfaces receive an explicit safe projection of it.

This rule is recorded as `ADR-001` (see Appendix E) and implemented by the approved
Company Profile architecture.

## 2.5 The Backend Is the Authority

The frontend is not trusted. The browser is a presentation layer.

**MUST `M-16`** — Every business rule that protects data is enforced on the server.
Never rely on hidden buttons, disabled inputs, frontend validation, React state or
client-side permissions. Anything executed in the browser can be modified.

**MUST `M-17`** — UI hiding is not authorization. The UI may hide unavailable actions
for usability; the backend must enforce every restriction regardless.

## 2.6 Supabase as a Platform

Within this project Supabase serves as the PostgreSQL database, authentication
provider, storage, realtime engine, Edge Function runtime, row-level security
mechanism and RPC execution layer.

**SHOULD `S-10`** — Use the appropriate platform capability rather than duplicating
it in application code.

## 2.7 Frontend Code Architecture

React components exist to render UI. They should never become business engines.

**MUST `M-18`** — A component must never be the enforcement point for authorization
or for a business invariant. Presentation may reflect a rule; it may not be the rule.

**SHOULD `S-11`** — Every component, function, module and service has a single
responsibility. Each component should answer one question — "what is my
responsibility?" — and if the answer contains "and", it is doing too much.

Bad: one `PassengerPage` that loads data, validates forms, uploads files, calculates
finance, prints reports and updates permissions. Good: `PassengerList`,
`PassengerFilters`, `PassengerForm`, `PassengerDocuments`, `PassengerActions`,
`PassengerFinanceCard`, `PassengerPrintMenu` — each with one responsibility.

**GUIDELINE `G-03`** — Component size: recommended 100–200 lines; acceptable 300;
review required at 400; above 500 requires architectural justification. Function size:
ideally 10–30 lines. Large files and large functions usually indicate missing
abstractions. Splitting is maintainability, not bureaucracy.

Generated files are out of scope for `G-03`. Existing exceedances are recorded in
Appendix D; they are debt, not permission.

**SHOULD `S-12`** — Prefer early returns over deeply nested logic. Reduce
indentation.

**SHOULD `S-13`** — State exists only where necessary. Never duplicate state and
never synchronise duplicated state by hand; prefer derived values. Store passengers;
compute filtered passengers, selections, statistics, counts and progress. Do not
store derived data.

**SHOULD `S-14`** — Local state is preferred. Global state is expensive; introduce it
only when several independent parts genuinely require it.

## 2.8 TypeScript Standards

**MUST `M-19`** — Type safety is mandatory. Never disable the compiler to make code
compile.

**CONTEXTUAL `C-01`** — `any` is permitted only under documented and reviewed
circumstances. Prefer `unknown`, explicit interfaces, type narrowing, type guards and
discriminated unions. Current usage is recorded as debt in Appendix D.

**SHOULD `S-15`** — Interfaces describe business entities, not UI convenience:
`Passenger`, `Room`, `Bus`, `Season`, `Flight`, `Payment` — not
`PassengerCardData`, `PassengerTemporaryObject`, `RandomResponse`. Types must
communicate meaning.

## 2.9 Naming Standards

**SHOULD `S-16`** — Names describe intent, not implementation.
`calculateRemainingBalance`, `assignPassengerToRoom`, `closeSeason`,
`validatePassport` — not `handleData`, `processStuff`, `temp`, `newObject`,
`result2`, `abc`.

**GUIDELINE `G-04`** — Variables are nouns; functions are verbs; booleans begin `is`,
`has`, `can` or `should`; collections are plural; `UPPER_CASE` only when truly
constant.

## 2.10 API Design

**SHOULD `S-17`** — APIs expose business operations, not database implementation
details. `assignPassengerToRoom()`, `closeSeason()`, `approvePayment()` — not
`updateTable()`, `saveObject()`, `modifyData()`. API names communicate business
intent.

## 2.11 Typed Result Contracts

**MUST `M-20`** — Every write returns a discriminated result, and the caller branches
on it.

**MUST `M-21`** — Success is proven, never inferred. The absence of an error object
is not success: an `UPDATE` filtered to zero rows by RLS returns no error at all, and
code that read success from "no error" reported "saved" when nothing had been saved.
A successful result therefore carries the row.

The project's contract is `SaveResult<T>`:

- `saved` — found, authorized and changed. Carries the row.
- `unchanged` — found and authorized, nothing differed. Success, and carries the row.
- `unauthorized` — permission refused. Not a fault, not an absence.
- `not_found` — zero rows reached. **Never read as success.**
- `invalid` — a value rejected before it reached the database. Names the field.
- `failed` — network or database fault.

Distinguishing `unauthorized` from `not_found` from `failed` matters: they need
different messages and different operator responses. Collapsing them into a boolean
and a string throws that away.

**SHOULD `S-18`** — User-facing text for a failure is resolved in one place, so
messages do not diverge between screens.

## 2.12 Error Handling

**MUST `M-22`** — Never ignore errors and never swallow exceptions. Every failure has
an intentional behaviour: recover, retry, roll back, notify, log, or fail safely.
Doing nothing is not acceptable.

**MUST `M-23`** — Never expose internal stack traces to end users. User-facing errors
must be understandable; developer-facing errors must be detailed.

## 2.13 Logging

Logs exist for operations, not for debugging forever.

**SHOULD `S-19`** — Every log answers at least one of: what happened, when, why,
which entity, who initiated it, what the result was. Prefer structured logs. Avoid
logs with no operational value — "clicked button" is not a log.

---

# Part 3 — Interface and Operational UX

The frontend is not decoration. It is the operational interface used daily by real
Hajj campaign employees, and every screen must prioritise clarity, speed, reliability
and consistency.

## 3.1 Frontend Philosophy

**SHOULD `S-20`** — The frontend exists to help users complete work, not to
demonstrate technology. Every interaction should reduce effort; every screen should
reduce cognitive load. Visual complexity is not product quality; operational
efficiency is.

## 3.2 Design Principles

**SHOULD `S-21`** — The interface should be clean, consistent, predictable, fast,
accessible and responsive. Users should recognise patterns immediately, and the
system should behave consistently across every module. Consistency is more valuable
than novelty.

## 3.3 User Experience Philosophy

**SHOULD `S-22`** — The best interface is the one that requires the least
explanation. Users should understand where they are, what they can do and what
happens next, without reading documentation.

## 3.4 Workflow First

**SHOULD `S-23`** — Design complete workflows, not isolated screens. Creating a
passenger is not a form; it is a workflow — registration, document upload,
validation, financial setup, room assignment, bus assignment, flight assignment,
completion. Every screen should support the whole operational journey.

## 3.5 Consistency Rules

**MUST `M-24`** — Identical actions behave identically everywhere: delete, save,
cancel, search, pagination, filtering, selection, printing, confirmation dialogs,
keyboard shortcuts.

If behaviour changes between pages, users lose confidence.

## 3.6 Navigation Standards

**SHOULD `S-24`** — Navigation reflects business structure, not technical
implementation. Users think in passengers, rooms, flights, buses, finance, reports
and settings — not components, tables, services and contexts.

Architecture must remain invisible.

## 3.7 Screen Layout Standards

**SHOULD `S-25`** — Every major page follows a consistent structure: header →
primary actions → filters → content → secondary actions → status information. Users
should never search for primary actions; important controls belong in predictable
locations.

## 3.8 Forms

**SHOULD `S-26`** — Every input has a clear label, validation, helpful feedback and
appropriate keyboard behaviour. Avoid unnecessary fields; request only information
that provides business value. Divide long forms into logical sections, not arbitrary
pages.

## 3.9 Validation UX

**SHOULD `S-27`** — Validation prevents mistakes; it does not punish users. Show it
immediately where useful and before submission where appropriate. Error messages
explain what is wrong, why, and how to fix it. Never display cryptic technical
messages.

## 3.10 Tables

**SHOULD `S-28`** — Tables are the primary operational interface. They must support
sorting, filtering, searching, pagination, bulk actions and responsive layouts.
Important columns appear first; users should not scroll horizontally unless
unavoidable.

## 3.11 Search

**SHOULD `S-29`** — Search should be fast, forgiving and predictable. Users should
not need exact spelling, results should update quickly, and searching should never
block normal work.

## 3.12 Filters

**SHOULD `S-30`** — Filters represent business concepts and answer operational
questions: season, status, flight, room, bus, payment state, nationality, missing
documents. Avoid technical filters.

## 3.13 Loading States

**MUST `M-25`** — Every asynchronous action has visible feedback. Users must always
know whether the system is loading, saving, uploading, deleting, synchronising or
generating. Never leave users wondering whether the system is working.

**SHOULD `S-31`** — Loading indicators communicate progress wherever possible.

## 3.14 Empty States

**SHOULD `S-32`** — An empty page must never feel broken. Explain why nothing is
shown and what the user can do next: "No passengers have been registered for this
season", not "No data".

## 3.15 Error States

**SHOULD `S-33`** — Every error helps the user recover: what happened, what can be
done, whether retrying is appropriate. Do not blame users and do not expose technical
detail.

## 3.16 Confirmation Dialogs

**SHOULD `S-34`** — Confirm destructive operations only — deleting a season, deleting
a passenger, removing a payment, closing a season, archiving records. Avoid
confirming harmless actions: too many confirmations create habit, and habit reduces
safety.

## 3.17 Notifications

**SHOULD `S-35`** — Use notifications for successful completion, warnings,
recoverable errors and background progress. Avoid unnecessary success messages — the
interface itself should communicate success wherever it can.

## 3.18 Accessibility

**MUST `M-26`** — Accessibility is mandatory. Support keyboard navigation, visible
focus, sufficient contrast, readable typography, and screen readers where practical.

Accessibility benefits every user, not only users with disabilities.

**CONTEXTUAL `C-02`** — The conformance status of the existing interface is
**unknown**: no accessibility audit has been performed and there is no automated
accessibility checking in lint or CI. Counting `aria-*` attributes or `role=`
occurrences proves neither conformance nor failure and must not be cited as either.
`M-26` binds every change on its own terms; see Appendix D.

## 3.19 Responsive Design

**MUST `M-27`** — The system must function across desktop, laptop, tablet and mobile.

**CONTEXTUAL `C-03`** — Desktop is the primary operational environment. Responsive
design must never reduce desktop efficiency; optimise for the primary users first.

## 3.20 Product Quality Standard

**MUST `M-28`** — Before release, every new feature satisfies four questions: does it
solve a real business problem; is it understandable without explanation; is it
consistent with the rest of the product; can it scale for future Hajj seasons without
redesign?

If the answer to any is "no", the feature is not ready.

---
# Part 4 — Database and Migrations

The database is part of the application, and the backend is the foundation of the
system. If the backend is weak, no frontend can compensate for it.

## 4.1 The Database Owns Invariants

**MUST `M-29`** — Where a rule must always be true regardless of which client is
calling, enforce it in PostgreSQL. Never assume the frontend will behave correctly.

The available tools are UNIQUE, CHECK, FOREIGN KEY and NOT NULL constraints,
triggers, policies and transactions.

The scope of this rule is invariants. Presentation, ordering and availability rules
do not belong in the database.

## 4.2 Ownership of Business Data

**MUST `M-30`** — Each piece of business data has exactly one owner. Never duplicate
values across tables without a documented architectural reason; duplicated data
eventually becomes inconsistent.

**CONTEXTUAL `C-04`** — Season ownership is **stored where the entity is independent
and derived where ownership is unambiguous**. Deriving is not laziness: storing
`season_id` on `payments` makes it possible for a payment's season to contradict its
owner's, and deriving makes that contradiction impossible by construction.

Stored (the row carries `season_id`): `passengers`, `rooms`, `camps`, `buses`,
`flights`, `announcements`.

Derived: `payments` and `custom_charges` via `passenger_id`; `financial_groups` and
`financial_group_members` via their members; `notification_deliveries` and
`pilgrim_push_subscriptions` via `passenger_id`.

Not seasonal at all: `user_profiles`, `company_config`, `company_assets`,
`pricing_settings`.

Other owners:

- Passenger status → `passengers`
- Room occupancy → `passengers.room_id`, counted against `rooms.capacity`
- Financial balance → computed from `payments` and `custom_charges` against the
  season's price snapshot; never stored as a column
- Season status → `seasons`
- Historical price for a past season → `season_pricing_snapshot`, **not**
  `pricing_settings`

`pricing_settings` is a current company setting, not a seasonal one. A season's dues
are fixed against the snapshot taken for that season, because computing them from
live settings at render time retroactively rewrote the balances of archived seasons.

## 4.3 Transactions

**MUST `M-31`** — Multi-step operations are atomic: either everything succeeds or
nothing changes. If one step fails, the entire operation rolls back.

Worked examples in this system: create a financial group and add its first member;
assign a room and update occupancy; delete a season and its related resources;
generate a financial document and store its audit record.

## 4.4 RPC Standards

**SHOULD `S-36`** — Create an RPC when several SQL statements belong together, a
transaction is required, a security boundary exists, or business logic belongs near
the data. Do not create RPCs merely to reduce frontend code.

**SHOULD `S-37`** — RPC names state business intent:
`create_financial_group_with_member()`, not `process()`.

**MUST `M-32`** — Every RPC validates its inputs, returns deterministic output,
rolls back on failure, and documents its expected errors.

## 4.5 Migrations Are the Only Path

**MUST `M-33`** — Database schema changes always use migrations. Schema history is
part of the source code.

**MUST `M-34`** — Never modify production tables manually. The single exception is
the recorded break-glass procedure in 4.12, which is an incident, not an alternative
route. The Dashboard SQL editor and MCP `apply_migration` are **prohibited** for
normal migrations.

**MUST `M-35`** — The migration is reviewed before it reaches any database. Review
first, apply second — never the reverse. Migration SQL is reviewed in Git like any
other source; it is not a script that happens to live in the repo.

The normal path, and the only normal path:

```
repository migration
  -> local rebuild / verification
  -> PR review
  -> merge
  -> Supabase CLI `db push`
  -> post-deploy drift verification
```

**MUST `M-36`** — The CLI-generated timestamp is authoritative. After cutover, never
hand-write, invent, renumber or reuse a migration version. A version that the CLI did
not generate is a defect.

**SHOULD `S-38`** — One migration per logical change. Do not batch unrelated changes
to save a file.

The CLI version this workflow assumes is pinned in `package.json`, and it is invoked
through the project script so every developer and agent runs the same binary. The
step-by-step procedure is in the migration runbook (Appendix E).

## 4.6 Immutability and Roll-Forward

**MUST `M-37`** — Never edit a migration that has been merged or applied. Its content
is the record of what the database was told to do; changing it makes that record a
lie and silently diverges every environment built from it.

**MUST `M-38`** — Corrections roll forward. Write a new migration that corrects the
problem. Down-migrations are not this project's recovery mechanism, and reversibility
is not a requirement here.

**MUST `M-39`** — Where a historical version exists in the remote ledger but its SQL
is reproduced by the V1 baseline, the repository keeps a **ledger compatibility
anchor**: a file that deliberately contains no SQL, carrying only the version string
the CLI matches on. Adding SQL to an anchor executes it against an empty database on
every fresh rebuild and breaks the baseline proof. Anchors are never "filled in".

## 4.7 Migration Authoring Rules

**MUST `M-40`** — Function DDL names exact signatures. `ALTER`/`DROP FUNCTION` must
carry the full argument list. Resolving a function by bare name is how a migration
written against a drifted signature dies on `42883` — this project has already paid
that cost once.

**MUST `M-41`** — Destructive DDL requires explicit preconditions. Before a `DROP`,
the migration itself must prove the object is unused — at apply time, not only at
authoring time, because a caller can appear in between.

**MUST `M-42`** — No `DROP ... CASCADE` by default. If a dependency exists, the
migration should fail loudly rather than remove objects silently.

**SHOULD `S-39`** — Prefer fail-loudly assertions over comments. A `RAISE EXCEPTION`
that guards an assumption is worth more than a paragraph describing it.

**SHOULD `S-40`** — Scope assertions to what the migration owns. A postcondition that
sweeps every object in a schema will one day fail because of something the migration
never touched. Assert on the exact signatures changed; audit anything wider with
`RAISE NOTICE`.

`SECURITY DEFINER` and grant rules are in 5.6; they apply in full to migration
authoring.

## 4.8 Local Verification

**MUST `M-43`** — Rebuild from repository state alone before proposing a migration.
The repository, by itself, must produce a working system.

The seed is local bootstrap only. It carries no production or demo rows, and
`db push` never runs it.

**MUST `M-44`** — Where the change is security-relevant, verify the outcome with
independent queries after the reset — not only with the migration's own
postconditions, which cannot be their own witness.

**SHOULD `S-41`** — Exercise the real failure path, not just the happy one.

## 4.9 Backward-Compatible Deployment Ordering

**MUST `M-45`** — Application code and migration ordering must be safe in both
directions: the deployed frontend must work against both the old and the new schema
for the window in which they overlap. Additive schema change first, code second;
removals only after no deployed code reads them.

**SHOULD `S-42`** — A migration PR should contain the migration. Mixing schema and
unrelated application changes makes both harder to review and impossible to revert
cleanly.

## 4.10 Deploy

**MUST `M-46`** — Apply after merge, never before.

**MUST `M-47`** — Before pushing, review the exact set of migrations that will be
applied against the target, and verify that set matches expectation. Investigate
anything unexpected before pushing, never after.

Pre-deploy also requires a clean build, a lint run reported as a delta against the
known baseline rather than an absolute count, and a clean rebuild from repository
state.

## 4.11 Post-Deploy Verification and Drift Control

**MUST `M-48`** — After applying, verify the exact migration version recorded in the
remote ledger and that it matches the repository filename, and verify the intended
schema and security state with independent catalog queries.

**MUST `M-49`** — A schema diff alone is **not** sufficient for security equivalence.
It compares schema shape, and most of this system's security lives in things it does
not, or does not reliably, report. Any drift check claiming security equivalence must
additionally compare:

- ACLs and grants on tables, views, sequences and functions
- default privileges (`ALTER DEFAULT PRIVILEGES`)
- RLS enabled/disabled per table
- RLS policies, including `USING` and `WITH CHECK` expressions
- function `SECURITY DEFINER` / `SECURITY INVOKER` mode
- function `search_path` (`proconfig`)
- `EXECUTE` privileges per role, **including `PUBLIC`** — check `aclexplode` grantee
  `0`, not the ACL string
- storage buckets, including `public` flag and MIME/size limits
- storage policies

A schema diff that comes back empty while any of the above differs is a false
negative, and it is exactly the kind of false negative that ships an anonymous read
path to production.

**SHOULD `S-43`** — Where a check runs against a remote database, enforce read-only
at the server rather than by discipline, so that a mistaken write is rejected by the
database rather than prevented by care.

## 4.12 Break-Glass

If a dashboard or MCP schema mutation is ever genuinely required in an emergency:

**MUST `M-50`** — All five of the following hold:

1. **Explicit authorization** from the project owner, recorded.
2. **The exact SQL executed is preserved**, byte for byte.
3. A **same-day** repository migration reconciling the change, so the repository and
   the database agree again within the day.
4. The **reason is documented** — what forced it, and why the normal path could not
   be used.
5. **Version and content drift is never left silently in place.** Any divergence
   between the remote ledger and the repository is recorded and scheduled, not
   tolerated.

Break-glass is an incident, not a shortcut. Each use should be rare enough to
remember.

## 4.13 Destructive Operations

Permanent deletion must be intentional, and it must be survivable.

**CONTEXTUAL `C-05`** — The system does not implement soft delete. There is no
`deleted_at` column anywhere in the schema, and none should be added without an
approved architectural decision. Soft delete is a deferred design option, not the
current design.

What protects business data is four rules.

**MUST `M-51`** — Where losing a record would destroy history, the foreign key is
`RESTRICT`, not `CASCADE`. Removal goes through a named path that preserves the
history, or it does not happen. `RESTRICT` is also a safety net: if a seasonal table
is added later and forgotten in the season delete, the delete fails loudly instead of
orphaning rows.

**MUST `M-52`** — Destructive operations are transactional and counted. They run in
one transaction, refuse to proceed when a precondition fails, and count every
affected category **before** deleting — after deletion there is nothing left to
count.

**MUST `M-53`** — Evidence outlives the data. `audit_log` and
`season_pricing_snapshot` have no foreign key to `seasons` and are deliberately not
touched by season deletion; that is what makes a deletion provable after the fact.
Any future destructive operation must answer the same question: what remains
afterwards to prove this happened?

**SHOULD `S-44`** — Transient data — temporary imports, failed uploads, caches,
generated previews, orphaned temporary files — carries no business history and may be
removed by a cleanup path.

---

# Part 5 — Security

## 5.1 Authority

**MUST `M-54`** — `SECURITY_ARCHITECTURE.md` is the supreme authority on everything
touching security. This Part states what every engineer must know and must not
contradict it; where the two differ, the Security Architecture governs and this Part
is corrected. *(NEW — governance)*

Implementation designs (S1–S4, S7, S8, B0) explain how a stage implemented what the
architecture requires. They never compete with it. If implementation reveals an error
in the architecture, the architecture is amended by a new version and a review — its
text is never bypassed silently.

## 5.2 Security Is Designed In

**MUST `M-55`** — Never rely on the client for authorization. Never trust browser
state. Always verify on the server.

## 5.3 Authentication and Authorization Are Different Questions

Authentication answers "who are you?". Authorization answers "what are you allowed to
do?".

**MUST `M-56`** — Never confuse the two. Being authenticated never automatically
grants permissions; permissions are business decisions.

## 5.4 Authorization

**MUST `M-57`** — Permissions are role-based and evaluated in the backend. Never
write a hardcoded user check such as comparing an email address to a literal.

**MUST `M-58`** — Protected Edge Functions use the shared authorization layer rather
than writing their own permission logic, and the triple pattern is mandatory: JWT
verification in deployment configuration, resolving the user from the JWT, and a
permission check. All three — because a public deployment key is a valid JWT that
passes the gate by itself.

## 5.5 Row Level Security

**MUST `M-59`** — RLS is mandatory. No production table depends on frontend
permissions.

**MUST `M-60`** — Policies explicitly define who can read, insert, update and delete.
Default behaviour denies; allow only what is explicitly required.

## 5.6 SECURITY DEFINER Functions

`SECURITY DEFINER` functions are dangerous. Use them only when necessary.

**MUST `M-61`** — Pin `search_path` to `public, pg_temp` — with `pg_temp` **last**, so
it cannot shadow `public` — or to `''` when the body names no schema object at all.
Never leave it unset, and never merely "set it explicitly": an unpinned or badly
ordered `search_path` is how a definer function is made to execute an attacker's
object.

**MUST `M-62`** — Privileges and grants are explicit. PostgreSQL grants `EXECUTE` to
`PUBLIC` by default, and `PUBLIC` includes `anon`. Every restriction therefore begins
with `REVOKE EXECUTE ... FROM PUBLIC`, then grants the required roles by name.
`REVOKE ... FROM anon` alone does nothing.

**MUST `M-63`** — Every such function validates permissions internally, exposes the
smallest possible capability, avoids privilege escalation, and is documented. Never
expose unrestricted administrative operations.

## 5.7 Storage

Files are business assets.

**MUST `M-64`** — Business documents — passports, IDs, contracts, tickets, permits,
visas, pilgrim photos — are permanent records and are never deleted as a side effect
of anything. Transient artefacts are not permanent and must have a defined lifecycle.

**MUST `M-65`** — Buckets are private by default. A bucket is public only where a
genuine unauthenticated surface needs it, and that exception is named, not assumed.
Every bucket declares its MIME allowlist and size limit at creation.

**CONTEXTUAL `C-06`** — Current buckets: `passengers-docs` is private;
`company-private` is private and narrower still, every policy gated on the user-
management permission, so an authenticated employee without it cannot read it either;
`company-assets` is public **deliberately** — the logo, login background and banner
must render on the login screen before any session exists. That is the whole
justification and it does not extend to anything else.

**MUST `M-66`** — Database columns hold storage object keys, never URLs. Access to a
private object is a short-lived signed URL, minted per request by the server.

Columns named `*_url` currently hold object keys; that naming debt is recorded in the
backlog and is not a licence to store URLs.

**SHOULD `S-45`** — Each file has an owner, an upload timestamp, an uploader, a
category and a storage location. Never depend solely on filenames; metadata belongs
in the database.

## 5.8 Public Surfaces and the Pilgrim Portal

**MUST `M-67`** — A public surface receives an explicit safe projection. Never
`SELECT *` on a public portal, configuration or asset path.

**MUST `M-68`** — The Pilgrim Portal projection returns document **existence flags**
and never an object key. Document access goes through the dedicated Edge Function,
which resolves the pilgrim from their session and returns a signed URL for that
pilgrim's own object. A caller cannot express "give me another pilgrim's file"
because no passenger id and no object path is part of the request.

**MUST `M-69`** — Financial and internal company data stays authenticated.

## 5.9 Rate Limiting

**MUST `M-70`** — Every public surface carries a named rate limit, defined in one
shared layer rather than per function.

**CONTEXTUAL `C-07`** — Rate limiting sits **behind** authorization, not instead of
it. It is protection against exhaustion, not an authorization gate.

## 5.10 Auditability

Critical operations must be traceable: who performed the action, when, what changed,
what the previous value was, what the new value is.

**MUST `M-71`** — Audit scope is explicit, not assumed. Coverage is a named set of
tables defined by the Security Architecture, and it is smaller than "everything".
Adding a business-critical table to that set is an architectural decision; assuming a
table is covered because it feels important is how an audit gap is discovered after
the fact. Do not claim coverage you have not checked against the triggers that exist.

**MUST `M-72`** — The actor is never supplied by the client. It comes from the
authenticated session, or from the delegated-actor pattern for paths that write with
the service key. When the actor cannot be determined, the write **fails closed** — an
audit row with an empty actor leaves "who did this?" unanswered, which is the first
question the log exists to answer.

**MUST `M-73`** — Suppression exists once and does not generalise. Season deletion
alone may suppress row-level audit triggers, through a table keyed on the current
transaction id that carries no grant to any role — not even the service role. This
replaced a session-variable flag that an adversarial review proved could be set by any
authenticated role, deleting a pilgrim with no audit row and no error: the one control
in the audit design that failed **open and silently**. Do not add a second suppression
path.

**MUST `M-74`** — Never overwrite history. Append new records.

## 5.11 Secrets and the Service Role

**MUST `M-75`** — Supabase secrets and service-role keys stay server-side. They never
appear in client code, logs, reports, printouts or chat.

**MUST `M-76`** — Escape values injected into generated HTML, and validate URLs and
colours before rendering them.

---
# Part 6 — Hajj Domain

Rules specific to Hajj campaign operations. Generic engineering standards are in
Parts 1–5 and 7.

## 6.1 Domain-Driven Thinking

**SHOULD `S-46`** — Technology serves the business; the business never serves
technology. When designing a feature, begin with the real-world operational
workflow — never with database tables, never with UI components.

## 6.2 The Season Is the Primary Business Boundary

Everything revolves around the active season: passengers, assignments,
accommodation, flights, finance, operations, reports, notifications, documents.

**MUST `M-77`** — Every business entity clearly defines its relationship to a season.
A season is not a filter; it is the primary business boundary.

**MUST `M-78`** — Scope operational reads and writes by season wherever the schema
requires it.

## 6.3 Season Lifecycle

Season architecture — the invariants, the distinction between the system-wide active
season and the per-tab viewed season, closed-season immutability, and the frozen
design decisions — is governed by the authoritative season reference named in
Appendix E, not restated here.

What this Playbook adds is the engineering consequence:

**MUST `M-79`** — Closed-season immutability is enforced at the database, not only in
the interface. The interface and any write helper are convenience layers above that
guarantee, never a replacement for it.

**MUST `M-80`** — Season deletion follows Part 4.13: transactional, counted before
execution, refusing an open season, and leaving the audit log and the season price
snapshot standing as evidence.

## 6.4 Real Operational Workflows

**SHOULD `S-47`** — Model how campaigns actually operate, not how developers imagine
they operate. Pilgrims may register late; assignments may change; rooms may be
upgraded; flights may be rescheduled; payments may arrive after allocation.

Operational reality takes priority over theoretical perfection.

## 6.5 Business Rules Must Be Configurable

Campaigns differ and regulations change.

**MUST `M-81`** — Avoid hardcoded operational policies. Business rules that may
change are configurable: maximum room capacity, bus capacity, payment deadlines,
required documents, notification templates, approval workflows. Code should not need
modification for an ordinary business policy change.

See 2.1: the same principle at deployment level means a new customer never requires
a code change.

## 6.6 Historical Accuracy

History must remain trustworthy. Past seasons should always represent what actually
happened, and a report generated today for a previous season must match historical
reality. Historical records are business evidence.

**MUST `M-82`** — Never rewrite history. Corrections generate new history; they do
not replace existing history.

**MUST `M-83`** — A past season's figures are computed against that season's price
snapshot, never against current settings. Editing a current price must not alter an
archived season's dues, balances, payment statuses or receivables.

## 6.7 Operational Transparency

**SHOULD `S-48`** — Managers should always understand system status: current season,
operational progress, incomplete tasks, missing documents, outstanding balances, room
and bus occupancy, flight readiness, critical alerts.

Operational visibility reduces management effort.

## 6.8 Reports Represent Decisions

**SHOULD `S-49`** — Reports are decision-making tools, not decorative documents.
Every report answers a business question and supports an operational action: which
pilgrims still require passports, which buses are incomplete, which rooms exceed
capacity, which balances remain unpaid, which flights are not finalised.

## 6.9 Automation

**MUST `M-84`** — Never automate a business decision that requires human judgement
without explicit approval.

**SHOULD `S-50`** — Automate the repetitive: notifications, status calculations,
progress indicators, document classification, routine validation. Automation
eliminates repetitive work; it does not remove human control.

## 6.10 Artificial Intelligence

**MUST `M-85`** — AI suggestions remain reviewable by humans, and human operators
make the final decision. AI assists operations; it does not replace responsibility.

Potential future use cases include document classification, OCR extraction,
duplicate detection, operational recommendations, risk identification, smart search
and report summarisation.

## 6.11 Arabic Domain Values

**MUST `M-86`** — Preserve Arabic enum and domain values **exactly** as stored. Never
translate a stored value.

Code identifiers stay English. Commit messages and inline comments in this repository
are written in Arabic prose by convention; match the surrounding style.

## 6.12 Product Vision

**GUIDELINE `G-05`** — The system is designed to become the single operational
platform for Hajj campaigns — pilgrims, seasons, registration, documents,
accommodation, transportation, flights, finance, operations centre, notifications,
reports, the Pilgrim Portal, users and permissions, and future integrations. No
business process should require external spreadsheets once the system is fully
implemented.

Possible future modules include visa management, government integrations, payment
gateways, WhatsApp automation, mobile applications, electronic signatures, attendance
tracking, warehouse management and supplier management. `S-08` applies: none should
require redesigning the existing architecture.

---

# Part 7 — Workflow, Verification and Governance

## 7.1 Document Authority

*(NEW — governance. v1.0 listed "Documentation Rules" and "Engineering Playbook
Governance" in its table of contents and never wrote them.)*

**MUST `M-87`** — Where two project documents conflict, this order decides:

1. `SECURITY_ARCHITECTURE.md` — supreme on anything touching security.
2. This Playbook — the general engineering and architecture authority.
3. The authoritative season reference — on season architecture.
4. Architecture Decision Records — on the decision each one records.
5. Implementation designs and runbooks — on how a rule is carried out.
6. Orientation and status documents — never authoritative over any of the above.

A document lower in this list never silently overrides one above it. If it reveals
that a higher document is wrong, the higher document is amended by a new version and
a review.

## 7.2 The Repository Is Source of Truth

*(NEW — governance)*

**MUST `M-88`** — Where a document and the repository disagree about what the system
does, the repository is correct and the document is a defect to be fixed. Verify
before citing: a backlog entry, a status note or a summary may have been overtaken by
a later merge.

**MUST `M-89`** — This Playbook states durable engineering and architecture rules. It
must not accumulate pull request history, bug logs, milestone diaries, temporary
backlog, implementation journals or lists of resolved incidents. Such content belongs
in ADRs, architecture documents, runbooks, the backlog, or lessons-learned documents.

## 7.3 Feature Lifecycle

Every feature follows this lifecycle:

```
Idea
  -> Requirements
  -> Architecture
  -> Discussion
  -> Approval
  -> Implementation
  -> Pull Request
  -> Independent Review
  -> Approval
  -> Merge
  -> Feature Complete
```

**MUST `M-90`** — Skipping stages is not allowed.

**SHOULD `S-51`** — Do not create endless assessment loops. Assessment that does not
end in shipped code is waste; if you find yourself writing a third analysis of the
same area without a commit in between, stop and implement.

## 7.4 Scope Management

**MUST `M-91`** — Every feature has a clearly defined scope. Anything outside it is
recorded, not implemented. Feature scope may only change after approval.

**SHOULD `S-52`** — What blocks implementation, breaks security or breaks
architecture stops the work and is reported. What is an improvement or a future
enhancement is recorded and the work continues, without opening a new architectural
discussion.

## 7.5 Decision Making

**SHOULD `S-53`** — Base engineering decisions on long-term maintainability,
architectural quality, business correctness, security and scalability. Implementation
speed is never the primary factor. *(See `S-07`.)*

## 7.6 Communication Standards

**MUST `M-92`** — Engineering reports always distinguish facts, assumptions, code
review, browser testing, database testing, and limitations.

**MUST `M-93`** — Claims must match reality. Do not report as verified what was not
verified, and do not describe a check as covering more than it covered.

**SHOULD `S-54`** — For any code change, report: what changed and why; the exact
files; database, RLS, RPC, permission and public-surface impact; build result and
lint delta, distinguishing legacy from new; tests run **or an explicit statement that
no applicable suite exists**; manual scenarios still required; risks, rollback path
and merge recommendation.

## 7.7 Pull Request Standards

**MUST `M-94`** — A migration PR contains the migration. *(See `S-42`.)*

**SHOULD `S-55`** — One focused diff per pull request. A PR is not ready merely
because it builds.

**MUST `M-95`** — Never run production migrations, merge pull requests, delete data
or deploy without explicit authorization from the project owner.

## 7.8 Code Review

**MUST `M-96`** — An implementation that violates a MUST is rejected during review
regardless of whether it works.

**SHOULD `S-56`** — Deep review is warranted for authentication, RLS, permissions and
security boundaries; destructive data operations; finance calculations; and major
architecture decisions. For visual and UI work, real preview and manual acceptance
are authoritative, and automated assertions are a supplement rather than the verdict.

## 7.9 Verification Regime

**CONTEXTUAL `C-08`** — This project has **no automated test framework**. There is no
test script, no unit test runner, and no test suite to run.

**MUST `M-97`** — Never claim that tests pass. Where no applicable suite exists, say
so explicitly.

Verification is: a clean build; a lint run; purpose-built probes written for the
change; and manual acceptance in a real preview deployment.

**MUST `M-98`** — Report lint as a **delta against the known baseline**, never as an
absolute count. The baseline is deliberate and is reduced per file touched, never
swept in one pass.

## 7.10 Verification Standards Learned the Hard Way

*(Imported from the project's existing recorded standards — see Appendix E. These are
not new decisions.)*

**MUST `M-99`** — Test the real thing, not a proxy. A feature once "passed" because a
check asserted that a configuration property was `true` — a tautology — instead of
rendering the output. It failed immediately in a real preview.

**MUST `M-100`** — Never ship a non-functional control. A toggle that does nothing is
a lie: remove it and say why.

**SHOULD `S-57`** — Measure, do not estimate. Rendered dimensions and pagination must
be measured from real output; arithmetic on paper has been wrong before.

**SHOULD `S-58`** — Check the harness before trusting the result. An apparent product
defect has turned out to be a limitation of the measuring tool.

## 7.11 Deployment Verification and Parity

**MUST `M-101`** — The deployed artefact must be the reviewed source. Where a
deployed function and the repository diverge, the fix is to redeploy the repository
copy — never to edit the source to match what is deployed.

**SHOULD `S-59`** — A deployment operation names exactly what it touches, and
anything it must not do is stated and checked rather than merely avoided.

## 7.12 Failure Recovery

**SHOULD `S-60`** — Recovery is proven by rehearsal on a disposable target, and the
thing proven is that the repository alone produces a working system — not that an old
database can be upgraded.

**MUST `M-102`** — A destructive rehearsal guards its target at every step that opens
a connection or writes, not once at the beginning. Step order is not a guarantee and
operator intent is not a guarantee.

## 7.13 Technical Debt

**MUST `M-103`** — Debt is recorded, not silent. A known deviation from a rule in
this Playbook is written down with its evidence and its policy; it never becomes an
unwritten allowance, and it never weakens the rule it deviates from.

Appendix D is this document's register. Broader debt lives in the project backlog.

## 7.14 Engineering Responsibility

**SHOULD `S-61`** — Engineers are responsible for more than writing code. They
protect business continuity, operational accuracy, financial correctness, historical
records and user trust. Every pull request contributes to — or damages — that
responsibility.

## 7.15 Continuous Improvement

**SHOULD `S-62`** — The architecture is expected to evolve; refactoring is
encouraged. But a change should improve the system, not merely make it different.
*(See `S-08`.)*

## 7.16 ADR Lifecycle

*(NEW — governance)*

**MUST `M-104`** — An architectural decision that becomes a mandatory project
standard is recorded as an ADR in `docs/architecture/ADR/`, numbered sequentially and
never renumbered.

**MUST `M-105`** — Every ADR carries a status: `Proposed`, `Approved`, `Superseded
by ADR-nnn`, or `Withdrawn`. An approved ADR is never edited in place to mean
something different: it is superseded by a new one, and the superseded text is kept
with the reason it was replaced.

**MUST `M-106`** — This Playbook references an ADR; it does not copy it. Where a rule
here is implemented by an ADR, the rule states the requirement and names the ADR.

## 7.17 Amending This Playbook

*(NEW — governance)*

**MUST `M-107`** — A change to a MUST requires an approved architectural decision and
a version increment. A change to a SHOULD, GUIDELINE or CONTEXTUAL statement requires
review, and the version is incremented at the next release.

**MUST `M-108`** — Rule identifiers are stable. A retired rule's identifier is never
reused; it is marked retired in Appendix A with the reason.

**MUST `M-109`** — A superseded edition is archived unchanged, never edited in place.
Archived editions carry no added headers; their provenance is recorded in the archive
README.

**MUST `M-110`** — Every edition satisfies the structural checks in Appendix A's
preamble before it is proposed: the table of contents matches the body in both
directions, headings are unique, rule identifiers are unique and contiguous, every
MUST appears in Appendix B, every prior-edition section is accounted for in
Appendix C, and every referenced path resolves.

## 7.18 Working With AI Agents

*(NEW — governance)*

An AI assistant working in this repository is bound by this document exactly as a
human contributor is. The following restate existing rules in the form that assistants
most often violate:

**MUST `M-111`** — Never state that tests pass (`C-08`, `M-97`). Never report a check
as covering more than it covered (`M-93`).

**MUST `M-112`** — Never apply a migration, merge, deploy or delete data without
explicit authorization (`M-95`, `M-34`).

**MUST `M-113`** — Verify a claim against the repository before repeating it from a
document (`M-88`).

**SHOULD `S-63`** — Prefer citing a rule identifier from this Playbook over
paraphrasing the rule.

## 7.19 Definition of Success

**GUIDELINE `G-06`** — Success is measured by stability, maintainability, security,
architecture quality, documentation quality and engineering discipline. The objective
is not to finish writing code; it is to build a system capable of serving real Hajj
campaigns reliably for many years.

## 7.20 Final Engineering Principle

Whenever uncertainty exists, choose the solution that will still make sense five
years from now. Do not optimise for today's shortcut. Design for the future.

The objective is not to build software quickly. The objective is to build the most
reliable Hajj Management Platform possible.

---
# Appendix A — Rule Inventory

Every normative statement in this document, with its level, where it came from, and
where it now lives.

**Source vocabulary**

| Tag | Meaning |
|---|---|
| `v1.0 §N — restored` | The approved v1.0 rule, carried over. |
| `v1.0 §N — modernised` | The v1.0 rule corrected against the repository. Appendix C gives the evidence. |
| `reconciled 2026-09-30` | Written during rule reconciliation to replace v1.0 text that no longer described the system. |
| `imported: <doc>` | An existing, already-recorded project standard brought into the Playbook. Not a new decision. |
| `NEW (governance)` | Genuinely new text about how these documents are maintained. v1.0 listed §§81–86 and never wrote them; this is that intent fulfilled. **Never described as recovered.** |
| `NEW (engineering)` | A proposed new engineering rule. One only — see the open decisions in the pull request. |

**Structural checks every edition must pass** (`M-110`): table of contents matches the
body both ways · headings unique · rule identifiers unique and contiguous · every
MUST in Appendix B · every prior-edition section in Appendix C · every referenced
path resolves.

| ID | Level | Destination | Source | Rule |
|---|---|---|---|---|
| `M-01` | MUST | 1.1 Correctness Before Speed | v1.0 §11 + §39 — restored | Never optimise code that is not yet correct |
| `M-02` | MUST | 1.3 One Source of Truth | v1.0 §2 · §3 · §4 · §11 — restored | Every business concept has exactly one authoritative source |
| `M-03` | MUST | 1.3 One Source of Truth | imported: PROJECT_MASTER_HANDOFF §5 (shared-predicate) | The definition or calculation of a business concept has one shared |
| `M-04` | MUST | 1.4 Determinism | v1.0 §11 — restored | The same input must always produce the same result |
| `M-05` | MUST | 1.4 Determinism | v1.0 §36 — restored | Realtime is a synchronisation mechanism |
| `M-06` | MUST | 1.5 Data Integrity Above Convenience | v1.0 §66 — restored | Never sacrifice data integrity for user convenience |
| `M-07` | MUST | 1.6 Redundant Validation by Design | v1.0 §31 — restored | Do not remove validation from one layer because another layer |
| `M-08` | MUST | 1.7 Atomic Operations | v1.0 §4 — restored | A critical operation either completes entirely or does not execute |
| `M-09` | MUST | 2.1 Deployment Model | v1.0 §73 (2026 replacement) — restored | Each customer deployment has exactly one company, one Supabase |
| `M-10` | MUST | 2.1 Deployment Model | v1.0 §73 (2026 replacement) — restored | Company-specific identity, contact information, financial |
| `M-11` | MUST | 2.2 The System Is Not Multi-Tenant | v1.0 §73 (2026 replacement) — restored | The application is not a multi-tenant system |
| `M-12` | MUST | 2.3 Layer Responsibilities | v1.0 §4 — restored | Security exists at multiple layers: UI, Edge Functions, database |
| `M-13` | MUST | 2.4 The Company Profile Boundary | v1.0 §73 + ADR-001 — restored | Application components consume focused Company Profile |
| `M-14` | MUST | 2.4 The Company Profile Boundary | v1.0 §73 — restored | Company Service is a configuration boundary only |
| `M-15` | MUST | 2.4 The Company Profile Boundary | v1.0 §73 — restored | Secrets are environment configuration and must never be stored in |
| `M-16` | MUST | 2.5 The Backend Is the Authority | v1.0 §21 — restored | Every business rule that protects data is enforced on the server |
| `M-17` | MUST | 2.5 The Backend Is the Authority | v1.0 §30 + Handoff §5 — restored | UI hiding is not authorization |
| `M-18` | MUST | 2.7 Frontend Code Architecture | v1.0 §13 — modernised (narrow MUST carved out) | A component must never be the enforcement point for authorization |
| `M-19` | MUST | 2.8 TypeScript Standards | v1.0 §16 — restored | Type safety is mandatory |
| `M-20` | MUST | 2.11 Typed Result Contracts | v1.0 §38 — modernised (SaveResult<T>) | Every write returns a discriminated result, and the caller branches |
| `M-21` | MUST | 2.11 Typed Result Contracts | v1.0 §38 — modernised (SaveResult<T>) | Success is proven, never inferred |
| `M-22` | MUST | 2.12 Error Handling | v1.0 §19 — restored | Never ignore errors and never swallow exceptions |
| `M-23` | MUST | 2.12 Error Handling | v1.0 §19 — restored | Never expose internal stack traces to end users |
| `M-24` | MUST | 3.5 Consistency Rules | v1.0 §45 — restored | Identical actions behave identically everywhere: delete, save, |
| `M-25` | MUST | 3.13 Loading States | v1.0 §53 — restored | Every asynchronous action has visible feedback |
| `M-26` | MUST | 3.18 Accessibility | v1.0 §58 — restored | Accessibility is mandatory |
| `M-27` | MUST | 3.19 Responsive Design | v1.0 §59 — restored | The system must function across desktop, laptop, tablet and mobile |
| `M-28` | MUST | 3.20 Product Quality Standard | v1.0 §60 — restored | Before release, every new feature satisfies four questions: does it |
| `M-29` | MUST | 4.1 The Database Owns Invariants | v1.0 §3 · §4 · §23 — modernised (scope stated) | Where a rule must always be true regardless of which client is |
| `M-30` | MUST | 4.2 Ownership of Business Data | v1.0 §24 — restored | Each piece of business data has exactly one owner |
| `M-31` | MUST | 4.3 Transactions | v1.0 §25 — restored | Multi-step operations are atomic: either everything succeeds or |
| `M-32` | MUST | 4.4 RPC Standards | v1.0 §26 — restored | Every RPC validates its inputs, returns deterministic output, |
| `M-33` | MUST | 4.5 Migrations Are the Only Path | v1.0 §35 — restored | Database schema changes always use migrations |
| `M-34` | MUST | 4.5 Migrations Are the Only Path | v1.0 §35 — modernised (break-glass exception) | Never modify production tables manually |
| `M-35` | MUST | 4.5 Migrations Are the Only Path | v1.0 §35.1 — restored | The migration is reviewed before it reaches any database |
| `M-36` | MUST | 4.5 Migrations Are the Only Path | v1.0 §35.1 — restored | The CLI-generated timestamp is authoritative |
| `M-37` | MUST | 4.6 Immutability and Roll-Forward | v1.0 §35.1 — restored | Never edit a migration that has been merged or applied |
| `M-38` | MUST | 4.6 Immutability and Roll-Forward | v1.0 §35 — modernised (roll-forward) | Corrections roll forward |
| `M-39` | MUST | 4.6 Immutability and Roll-Forward | reconciled 2026-09-30 (ledger anchors) | Where a historical version exists in the remote ledger but its SQL |
| `M-40` | MUST | 4.7 Migration Authoring Rules | v1.0 §35.1 — restored | Function DDL names exact signatures |
| `M-41` | MUST | 4.7 Migration Authoring Rules | v1.0 §35.1 — restored | Destructive DDL requires explicit preconditions |
| `M-42` | MUST | 4.7 Migration Authoring Rules | v1.0 §35.1 — restored | No DROP |
| `M-43` | MUST | 4.8 Local Verification | v1.0 §35.1 — restored | Rebuild from repository state alone before proposing a migration |
| `M-44` | MUST | 4.8 Local Verification | v1.0 §35.1 — restored | Where the change is security-relevant, verify the outcome with |
| `M-45` | MUST | 4.9 Backward-Compatible Deployment Ordering | v1.0 §35.1 — restored | Application code and migration ordering must be safe in both |
| `M-46` | MUST | 4.10 Deploy | v1.0 §35.1 — restored | Apply after merge, never before |
| `M-47` | MUST | 4.10 Deploy | v1.0 §35.1 — restored | Before pushing, review the exact set of migrations that will be |
| `M-48` | MUST | 4.11 Post-Deploy Verification and Drift Control | v1.0 §35.1 — restored | After applying, verify the exact migration version recorded in the |
| `M-49` | MUST | 4.11 Post-Deploy Verification and Drift Control | v1.0 §35.1 — restored | A schema diff alone is not sufficient for security equivalence |
| `M-50` | MUST | 4.12 Break-Glass | v1.0 §35.1 — restored | All five of the following hold: |
| `M-51` | MUST | 4.13 Destructive Operations | reconciled 2026-09-30 | Where losing a record would destroy history, the foreign key is |
| `M-52` | MUST | 4.13 Destructive Operations | reconciled 2026-09-30 | Destructive operations are transactional and counted |
| `M-53` | MUST | 4.13 Destructive Operations | reconciled 2026-09-30 | Evidence outlives the data |
| `M-54` | MUST | 5.1 Authority | NEW (governance) | SECURITY_ARCHITECTURE.md is the supreme authority on everything |
| `M-55` | MUST | 5.2 Security Is Designed In | v1.0 §3 — restored | Never rely on the client for authorization |
| `M-56` | MUST | 5.3 Authentication and Authorization Are Different Questions | v1.0 §29 — restored | Never confuse the two |
| `M-57` | MUST | 5.4 Authorization | v1.0 §30 — restored | Permissions are role-based and evaluated in the backend |
| `M-58` | MUST | 5.4 Authorization | imported: supabase/README.md + S3 implementation design | Protected Edge Functions use the shared authorization layer rather |
| `M-59` | MUST | 5.5 Row Level Security | v1.0 §27 — restored | RLS is mandatory |
| `M-60` | MUST | 5.5 Row Level Security | v1.0 §27 — restored | Policies explicitly define who can read, insert, update and delete |
| `M-61` | MUST | 5.6 SECURITY DEFINER Functions | v1.0 §28 — modernised (pinned, ordered) | Pin search_path to public, pg_temp — with pg_temp last, so |
| `M-62` | MUST | 5.6 SECURITY DEFINER Functions | v1.0 §28 — modernised (explicit grants) | Privileges and grants are explicit |
| `M-63` | MUST | 5.6 SECURITY DEFINER Functions | v1.0 §28 — restored | Every such function validates permissions internally, exposes the |
| `M-64` | MUST | 5.7 Storage | v1.0 §32 — modernised (permanent vs transient) | Business documents — passports, IDs, contracts, tickets, permits, |
| `M-65` | MUST | 5.7 Storage | reconciled 2026-09-30 | Buckets are private by default |
| `M-66` | MUST | 5.7 Storage | reconciled 2026-09-30 | Database columns hold storage object keys, never URLs |
| `M-67` | MUST | 5.8 Public Surfaces and the Pilgrim Portal | v1.0 §73 + Handoff §5 — restored | A public surface receives an explicit safe projection |
| `M-68` | MUST | 5.8 Public Surfaces and the Pilgrim Portal | reconciled 2026-09-30 | The Pilgrim Portal projection returns document existence flags |
| `M-69` | MUST | 5.8 Public Surfaces and the Pilgrim Portal | imported: Handoff §5 | Financial and internal company data stays authenticated |
| `M-70` | MUST | 5.9 Rate Limiting | imported: _shared/rateLimit.ts + supabase/README.md | Every public surface carries a named rate limit, defined in one |
| `M-71` | MUST | 5.10 Auditability | v1.0 §33 — modernised (scope explicit) | Audit scope is explicit, not assumed |
| `M-72` | MUST | 5.10 Auditability | v1.0 §33 — modernised (fail-closed actor) | The actor is never supplied by the client |
| `M-73` | MUST | 5.10 Auditability | reconciled 2026-09-30 | Suppression exists once and does not generalise |
| `M-74` | MUST | 5.10 Auditability | v1.0 §33 — restored | Never overwrite history |
| `M-75` | MUST | 5.11 Secrets and the Service Role | imported: Handoff §5 | Supabase secrets and service-role keys stay server-side |
| `M-76` | MUST | 5.11 Secrets and the Service Role | imported: Handoff §5 | Escape values injected into generated HTML, and validate URLs and |
| `M-77` | MUST | 6.2 The Season Is the Primary Business Boundary | v1.0 §63 — restored | Every business entity clearly defines its relationship to a season |
| `M-78` | MUST | 6.2 The Season Is the Primary Business Boundary | imported: Handoff §5 | Scope operational reads and writes by season wherever the schema |
| `M-79` | MUST | 6.3 Season Lifecycle | imported: Handoff §6 / §8 (database trigger is the guarantee) | Closed-season immutability is enforced at the database, not only in |
| `M-80` | MUST | 6.3 Season Lifecycle | reconciled 2026-09-30 | Season deletion follows Part 4.13: transactional, counted before |
| `M-81` | MUST | 6.5 Business Rules Must Be Configurable | v1.0 §65 — restored | Avoid hardcoded operational policies |
| `M-82` | MUST | 6.6 Historical Accuracy | v1.0 §68 — restored | Never rewrite history |
| `M-83` | MUST | 6.6 Historical Accuracy | reconciled 2026-09-30 (season pricing snapshot) | A past season's figures are computed against that season's price |
| `M-84` | MUST | 6.9 Automation | v1.0 §71 — restored | Never automate a business decision that requires human judgement |
| `M-85` | MUST | 6.10 Artificial Intelligence | v1.0 §72 — restored | AI suggestions remain reviewable by humans, and human operators |
| `M-86` | MUST | 6.11 Arabic Domain Values | imported: Handoff §17 / project skill | Preserve Arabic enum and domain values exactly as stored |
| `M-87` | MUST | 7.1 Document Authority | NEW (governance) | Where two project documents conflict, this order decides: |
| `M-88` | MUST | 7.2 The Repository Is Source of Truth | NEW (governance) | Where a document and the repository disagree about what the system |
| `M-89` | MUST | 7.2 The Repository Is Source of Truth | NEW (governance) | This Playbook states durable engineering and architecture rules |
| `M-90` | MUST | 7.3 Feature Lifecycle | v1.0 §6 — restored | Skipping stages is not allowed |
| `M-91` | MUST | 7.4 Scope Management | v1.0 §7 — restored | Every feature has a clearly defined scope |
| `M-92` | MUST | 7.6 Communication Standards | v1.0 §9 — restored | Engineering reports always distinguish facts, assumptions, code |
| `M-93` | MUST | 7.6 Communication Standards | v1.0 §9 — restored | Claims must match reality |
| `M-94` | MUST | 7.7 Pull Request Standards | v1.0 §35.1 — restored | A migration PR contains the migration |
| `M-95` | MUST | 7.7 Pull Request Standards | imported: Handoff §5 | Never run production migrations, merge pull requests, delete data |
| `M-96` | MUST | 7.8 Code Review | v1.0 Part II preamble — restored | An implementation that violates a MUST is rejected during review |
| `M-97` | MUST | 7.9 Verification Regime | imported: Handoff §4 / §17 | Never claim that tests pass |
| `M-98` | MUST | 7.9 Verification Regime | v1.0 §35.1 — restored | Report lint as a delta against the known baseline, never as an |
| `M-99` | MUST | 7.10 Verification Standards Learned the Hard Way | imported: Handoff §17 | Test the real thing, not a proxy |
| `M-100` | MUST | 7.10 Verification Standards Learned the Hard Way | imported: Handoff §17 | Never ship a non-functional control |
| `M-101` | MUST | 7.11 Deployment Verification and Parity | imported: .github/workflows (edge-function parity) | The deployed artefact must be the reviewed source |
| `M-102` | MUST | 7.12 Failure Recovery | imported: .github/workflows (assert-not-production) | A destructive rehearsal guards its target at every step that opens |
| `M-103` | MUST | 7.13 Technical Debt | NEW (governance) | Debt is recorded, not silent |
| `M-104` | MUST | 7.16 ADR Lifecycle | NEW (governance) | An architectural decision that becomes a mandatory project |
| `M-105` | MUST | 7.16 ADR Lifecycle | NEW (governance) | Every ADR carries a status: Proposed, Approved, Superseded |
| `M-106` | MUST | 7.16 ADR Lifecycle | NEW (governance) | This Playbook references an ADR; it does not copy it |
| `M-107` | MUST | 7.17 Amending This Playbook | NEW (governance) | A change to a MUST requires an approved architectural decision and |
| `M-108` | MUST | 7.17 Amending This Playbook | NEW (governance) | Rule identifiers are stable |
| `M-109` | MUST | 7.17 Amending This Playbook | NEW (governance) | A superseded edition is archived unchanged, never edited in place |
| `M-110` | MUST | 7.17 Amending This Playbook | NEW (governance) | Every edition satisfies the structural checks in Appendix A's |
| `M-111` | MUST | 7.18 Working With AI Agents | NEW (governance) | Never state that tests pass (C-08, M-97) |
| `M-112` | MUST | 7.18 Working With AI Agents | NEW (governance) | Never apply a migration, merge, deploy or delete data without |
| `M-113` | MUST | 7.18 Working With AI Agents | NEW (governance) | Verify a claim against the repository before repeating it from a |
| `S-01` | SHOULD | 1.1 Correctness Before Speed | v1.0 §39 — restored | Measure before optimising |
| `S-02` | SHOULD | 1.2 Simplicity, Readability, Explicitness | v1.0 §3 + §11 — restored | Prefer the simplest architecture capable of supporting future |
| `S-03` | SHOULD | 1.2 Simplicity, Readability, Explicitness | v1.0 §3 + §11 — restored | Optimise for readability |
| `S-04` | SHOULD | 1.2 Simplicity, Readability, Explicitness | v1.0 §11 — restored | Be explicit |
| `S-05` | SHOULD | 1.4 Determinism | NEW (engineering) — proposed, see open decisions | Realtime must not be the sole trigger for a write, and refetches |
| `S-06` | SHOULD | 1.9 Reliability Is a Product Requirement | v1.0 §40 + §76 — restored | Every backend decision should prioritise correctness, integrity, |
| `S-07` | SHOULD | 1.10 Long-Term Thinking | v1.0 §8 — restored | Base engineering decisions on long-term maintainability, |
| `S-08` | SHOULD | 1.10 Long-Term Thinking | v1.0 §75 + §79 — restored | No future module should require redesigning the existing |
| `S-09` | SHOULD | 2.3 Layer Responsibilities | v1.0 §12 — restored | No layer may bypass another without a valid architectural |
| `S-10` | SHOULD | 2.6 Supabase as a Platform | v1.0 §22 — restored | Use the appropriate platform capability rather than duplicating |
| `S-11` | SHOULD | 2.7 Frontend Code Architecture | v1.0 §4 + §13 — restored | Every component, function, module and service has a single |
| `S-12` | SHOULD | 2.7 Frontend Code Architecture | v1.0 §18 — restored | Prefer early returns over deeply nested logic |
| `S-13` | SHOULD | 2.7 Frontend Code Architecture | v1.0 §15 — restored | State exists only where necessary |
| `S-14` | SHOULD | 2.7 Frontend Code Architecture | v1.0 §15 — restored | Local state is preferred |
| `S-15` | SHOULD | 2.8 TypeScript Standards | v1.0 §16 — restored | Interfaces describe business entities, not UI convenience: |
| `S-16` | SHOULD | 2.9 Naming Standards | v1.0 §17 — restored | Names describe intent, not implementation |
| `S-17` | SHOULD | 2.10 API Design | v1.0 §37 — restored | APIs expose business operations, not database implementation |
| `S-18` | SHOULD | 2.11 Typed Result Contracts | reconciled 2026-09-30 | User-facing text for a failure is resolved in one place, so |
| `S-19` | SHOULD | 2.13 Logging | v1.0 §20 — restored | Every log answers at least one of: what happened, when, why, |
| `S-20` | SHOULD | 3.1 Frontend Philosophy | v1.0 §41 — restored | The frontend exists to help users complete work, not to |
| `S-21` | SHOULD | 3.2 Design Principles | v1.0 §42 — restored | The interface should be clean, consistent, predictable, fast, |
| `S-22` | SHOULD | 3.3 User Experience Philosophy | v1.0 §43 — restored | The best interface is the one that requires the least |
| `S-23` | SHOULD | 3.4 Workflow First | v1.0 §44 — restored | Design complete workflows, not isolated screens |
| `S-24` | SHOULD | 3.6 Navigation Standards | v1.0 §46 — restored | Navigation reflects business structure, not technical |
| `S-25` | SHOULD | 3.7 Screen Layout Standards | v1.0 §47 — restored | Every major page follows a consistent structure: header → |
| `S-26` | SHOULD | 3.8 Forms | v1.0 §48 — restored | Every input has a clear label, validation, helpful feedback and |
| `S-27` | SHOULD | 3.9 Validation UX | v1.0 §49 — restored | Validation prevents mistakes; it does not punish users |
| `S-28` | SHOULD | 3.10 Tables | v1.0 §50 — restored | Tables are the primary operational interface |
| `S-29` | SHOULD | 3.11 Search | v1.0 §51 — restored | Search should be fast, forgiving and predictable |
| `S-30` | SHOULD | 3.12 Filters | v1.0 §52 — modernised (Campaign removed) | Filters represent business concepts and answer operational |
| `S-31` | SHOULD | 3.13 Loading States | v1.0 §53 — restored | Loading indicators communicate progress wherever possible |
| `S-32` | SHOULD | 3.14 Empty States | v1.0 §54 — restored | An empty page must never feel broken |
| `S-33` | SHOULD | 3.15 Error States | v1.0 §55 — restored | Every error helps the user recover: what happened, what can be |
| `S-34` | SHOULD | 3.16 Confirmation Dialogs | v1.0 §56 — restored | Confirm destructive operations only — deleting a season, deleting |
| `S-35` | SHOULD | 3.17 Notifications | v1.0 §57 — restored | Use notifications for successful completion, warnings, |
| `S-36` | SHOULD | 4.4 RPC Standards | v1.0 §26 — restored | Create an RPC when several SQL statements belong together, a |
| `S-37` | SHOULD | 4.4 RPC Standards | v1.0 §26 — restored | RPC names state business intent: |
| `S-38` | SHOULD | 4.5 Migrations Are the Only Path | v1.0 §35.1 — restored | One migration per logical change |
| `S-39` | SHOULD | 4.7 Migration Authoring Rules | v1.0 §35.1 — restored | Prefer fail-loudly assertions over comments |
| `S-40` | SHOULD | 4.7 Migration Authoring Rules | v1.0 §35.1 — restored | Scope assertions to what the migration owns |
| `S-41` | SHOULD | 4.8 Local Verification | v1.0 §35.1 — restored | Exercise the real failure path, not just the happy one |
| `S-42` | SHOULD | 4.9 Backward-Compatible Deployment Ordering | v1.0 §35.1 — restored | A migration PR should contain the migration |
| `S-43` | SHOULD | 4.11 Post-Deploy Verification and Drift Control | imported: .github/workflows (read-only remote gate) | Where a check runs against a remote database, enforce read-only |
| `S-44` | SHOULD | 4.13 Destructive Operations | v1.0 §34 — modernised | Transient data — temporary imports, failed uploads, caches, |
| `S-45` | SHOULD | 5.7 Storage | v1.0 §32 — restored | Each file has an owner, an upload timestamp, an uploader, a |
| `S-46` | SHOULD | 6.1 Domain-Driven Thinking | v1.0 §62 — restored | Technology serves the business; the business never serves |
| `S-47` | SHOULD | 6.4 Real Operational Workflows | v1.0 §64 — restored | Model how campaigns actually operate, not how developers imagine |
| `S-48` | SHOULD | 6.7 Operational Transparency | v1.0 §69 — restored | Managers should always understand system status: current season, |
| `S-49` | SHOULD | 6.8 Reports Represent Decisions | v1.0 §70 — restored | Reports are decision-making tools, not decorative documents |
| `S-50` | SHOULD | 6.9 Automation | v1.0 §71 — restored | Automate the repetitive: notifications, status calculations, |
| `S-51` | SHOULD | 7.3 Feature Lifecycle | imported: Handoff §17 | Do not create endless assessment loops |
| `S-52` | SHOULD | 7.4 Scope Management | imported: BACKLOG.md working rule | What blocks implementation, breaks security or breaks |
| `S-53` | SHOULD | 7.5 Decision Making | v1.0 §8 — restored | Base engineering decisions on long-term maintainability, |
| `S-54` | SHOULD | 7.6 Communication Standards | imported: Handoff §17 | For any code change, report: what changed and why; the exact |
| `S-55` | SHOULD | 7.7 Pull Request Standards | imported: Handoff §17 | One focused diff per pull request |
| `S-56` | SHOULD | 7.8 Code Review | imported: Handoff §17 | Deep review is warranted for authentication, RLS, permissions and |
| `S-57` | SHOULD | 7.10 Verification Standards Learned the Hard Way | imported: Handoff §17 | Measure, do not estimate |
| `S-58` | SHOULD | 7.10 Verification Standards Learned the Hard Way | imported: Handoff §17 | Check the harness before trusting the result |
| `S-59` | SHOULD | 7.11 Deployment Verification and Parity | imported: .github/workflows | A deployment operation names exactly what it touches, and |
| `S-60` | SHOULD | 7.12 Failure Recovery | imported: .github/workflows (recovery rehearsal) | Recovery is proven by rehearsal on a disposable target, and the |
| `S-61` | SHOULD | 7.14 Engineering Responsibility | v1.0 §78 — restored | Engineers are responsible for more than writing code |
| `S-62` | SHOULD | 7.15 Continuous Improvement | v1.0 §79 — restored | The architecture is expected to evolve; refactoring is |
| `S-63` | SHOULD | 7.18 Working With AI Agents | NEW (governance) | Prefer citing a rule identifier from this Playbook over |
| `G-01` | GUIDELINE | 1.8 Every Action Has Consequences | v1.0 §67 — restored | Before implementing any feature, ask: what business records |
| `G-02` | GUIDELINE | 1.10 Long-Term Thinking | v1.0 §80 — restored | Whenever uncertainty exists, choose the solution that will |
| `G-03` | GUIDELINE | 2.7 Frontend Code Architecture | v1.0 §14 + §18 — restored | Component size: recommended 100–200 lines; acceptable 300; |
| `G-04` | GUIDELINE | 2.9 Naming Standards | v1.0 §17 — restored | Variables are nouns; functions are verbs; booleans begin is, |
| `G-05` | GUIDELINE | 6.12 Product Vision | v1.0 §61 + §75 — restored | The system is designed to become the single operational |
| `G-06` | GUIDELINE | 7.19 Definition of Success | v1.0 §10 — restored | Success is measured by stability, maintainability, security, |
| `C-01` | CONTEXTUAL | 2.8 TypeScript Standards | v1.0 §16 — modernised (debt recorded) | any is permitted only under documented and reviewed |
| `C-02` | CONTEXTUAL | 3.18 Accessibility | reconciled 2026-09-30 | The conformance status of the existing interface is |
| `C-03` | CONTEXTUAL | 3.19 Responsive Design | v1.0 §59 — restored | Desktop is the primary operational environment |
| `C-04` | CONTEXTUAL | 4.2 Ownership of Business Data | v1.0 §24 — modernised (Issue #42 §4) | Season ownership is stored where the entity is independent |
| `C-05` | CONTEXTUAL | 4.13 Destructive Operations | reconciled 2026-09-30 | The system does not implement soft delete |
| `C-06` | CONTEXTUAL | 5.7 Storage | reconciled 2026-09-30 | Current buckets: passengers-docs is private; |
| `C-07` | CONTEXTUAL | 5.9 Rate Limiting | imported: supabase/README.md | Rate limiting sits behind authorization, not instead of |
| `C-08` | CONTEXTUAL | 7.9 Verification Regime | imported: Handoff §4 | This project has no automated test framework |

---

# Appendix B — Index of Every MUST

All 113 MUST rules, in document order. This index is generated from the body; if a
MUST exists that is not listed here, the document fails `M-110`.

| ID | Section | Rule |
|---|---|---|
| `M-01` | 1.1 Correctness Before Speed | Never optimise code that is not yet correct |
| `M-02` | 1.3 One Source of Truth | Every business concept has exactly one authoritative source |
| `M-03` | 1.3 One Source of Truth | The definition or calculation of a business concept has one shared |
| `M-04` | 1.4 Determinism | The same input must always produce the same result |
| `M-05` | 1.4 Determinism | Realtime is a synchronisation mechanism |
| `M-06` | 1.5 Data Integrity Above Convenience | Never sacrifice data integrity for user convenience |
| `M-07` | 1.6 Redundant Validation by Design | Do not remove validation from one layer because another layer |
| `M-08` | 1.7 Atomic Operations | A critical operation either completes entirely or does not execute |
| `M-09` | 2.1 Deployment Model | Each customer deployment has exactly one company, one Supabase |
| `M-10` | 2.1 Deployment Model | Company-specific identity, contact information, financial |
| `M-11` | 2.2 The System Is Not Multi-Tenant | The application is not a multi-tenant system |
| `M-12` | 2.3 Layer Responsibilities | Security exists at multiple layers: UI, Edge Functions, database |
| `M-13` | 2.4 The Company Profile Boundary | Application components consume focused Company Profile |
| `M-14` | 2.4 The Company Profile Boundary | Company Service is a configuration boundary only |
| `M-15` | 2.4 The Company Profile Boundary | Secrets are environment configuration and must never be stored in |
| `M-16` | 2.5 The Backend Is the Authority | Every business rule that protects data is enforced on the server |
| `M-17` | 2.5 The Backend Is the Authority | UI hiding is not authorization |
| `M-18` | 2.7 Frontend Code Architecture | A component must never be the enforcement point for authorization |
| `M-19` | 2.8 TypeScript Standards | Type safety is mandatory |
| `M-20` | 2.11 Typed Result Contracts | Every write returns a discriminated result, and the caller branches |
| `M-21` | 2.11 Typed Result Contracts | Success is proven, never inferred |
| `M-22` | 2.12 Error Handling | Never ignore errors and never swallow exceptions |
| `M-23` | 2.12 Error Handling | Never expose internal stack traces to end users |
| `M-24` | 3.5 Consistency Rules | Identical actions behave identically everywhere: delete, save, |
| `M-25` | 3.13 Loading States | Every asynchronous action has visible feedback |
| `M-26` | 3.18 Accessibility | Accessibility is mandatory |
| `M-27` | 3.19 Responsive Design | The system must function across desktop, laptop, tablet and mobile |
| `M-28` | 3.20 Product Quality Standard | Before release, every new feature satisfies four questions: does it |
| `M-29` | 4.1 The Database Owns Invariants | Where a rule must always be true regardless of which client is |
| `M-30` | 4.2 Ownership of Business Data | Each piece of business data has exactly one owner |
| `M-31` | 4.3 Transactions | Multi-step operations are atomic: either everything succeeds or |
| `M-32` | 4.4 RPC Standards | Every RPC validates its inputs, returns deterministic output, |
| `M-33` | 4.5 Migrations Are the Only Path | Database schema changes always use migrations |
| `M-34` | 4.5 Migrations Are the Only Path | Never modify production tables manually |
| `M-35` | 4.5 Migrations Are the Only Path | The migration is reviewed before it reaches any database |
| `M-36` | 4.5 Migrations Are the Only Path | The CLI-generated timestamp is authoritative |
| `M-37` | 4.6 Immutability and Roll-Forward | Never edit a migration that has been merged or applied |
| `M-38` | 4.6 Immutability and Roll-Forward | Corrections roll forward |
| `M-39` | 4.6 Immutability and Roll-Forward | Where a historical version exists in the remote ledger but its SQL |
| `M-40` | 4.7 Migration Authoring Rules | Function DDL names exact signatures |
| `M-41` | 4.7 Migration Authoring Rules | Destructive DDL requires explicit preconditions |
| `M-42` | 4.7 Migration Authoring Rules | No DROP |
| `M-43` | 4.8 Local Verification | Rebuild from repository state alone before proposing a migration |
| `M-44` | 4.8 Local Verification | Where the change is security-relevant, verify the outcome with |
| `M-45` | 4.9 Backward-Compatible Deployment Ordering | Application code and migration ordering must be safe in both |
| `M-46` | 4.10 Deploy | Apply after merge, never before |
| `M-47` | 4.10 Deploy | Before pushing, review the exact set of migrations that will be |
| `M-48` | 4.11 Post-Deploy Verification and Drift Control | After applying, verify the exact migration version recorded in the |
| `M-49` | 4.11 Post-Deploy Verification and Drift Control | A schema diff alone is not sufficient for security equivalence |
| `M-50` | 4.12 Break-Glass | All five of the following hold: |
| `M-51` | 4.13 Destructive Operations | Where losing a record would destroy history, the foreign key is |
| `M-52` | 4.13 Destructive Operations | Destructive operations are transactional and counted |
| `M-53` | 4.13 Destructive Operations | Evidence outlives the data |
| `M-54` | 5.1 Authority | SECURITY_ARCHITECTURE.md is the supreme authority on everything |
| `M-55` | 5.2 Security Is Designed In | Never rely on the client for authorization |
| `M-56` | 5.3 Authentication and Authorization Are Different Questions | Never confuse the two |
| `M-57` | 5.4 Authorization | Permissions are role-based and evaluated in the backend |
| `M-58` | 5.4 Authorization | Protected Edge Functions use the shared authorization layer rather |
| `M-59` | 5.5 Row Level Security | RLS is mandatory |
| `M-60` | 5.5 Row Level Security | Policies explicitly define who can read, insert, update and delete |
| `M-61` | 5.6 SECURITY DEFINER Functions | Pin search_path to public, pg_temp — with pg_temp last, so |
| `M-62` | 5.6 SECURITY DEFINER Functions | Privileges and grants are explicit |
| `M-63` | 5.6 SECURITY DEFINER Functions | Every such function validates permissions internally, exposes the |
| `M-64` | 5.7 Storage | Business documents — passports, IDs, contracts, tickets, permits, |
| `M-65` | 5.7 Storage | Buckets are private by default |
| `M-66` | 5.7 Storage | Database columns hold storage object keys, never URLs |
| `M-67` | 5.8 Public Surfaces and the Pilgrim Portal | A public surface receives an explicit safe projection |
| `M-68` | 5.8 Public Surfaces and the Pilgrim Portal | The Pilgrim Portal projection returns document existence flags |
| `M-69` | 5.8 Public Surfaces and the Pilgrim Portal | Financial and internal company data stays authenticated |
| `M-70` | 5.9 Rate Limiting | Every public surface carries a named rate limit, defined in one |
| `M-71` | 5.10 Auditability | Audit scope is explicit, not assumed |
| `M-72` | 5.10 Auditability | The actor is never supplied by the client |
| `M-73` | 5.10 Auditability | Suppression exists once and does not generalise |
| `M-74` | 5.10 Auditability | Never overwrite history |
| `M-75` | 5.11 Secrets and the Service Role | Supabase secrets and service-role keys stay server-side |
| `M-76` | 5.11 Secrets and the Service Role | Escape values injected into generated HTML, and validate URLs and |
| `M-77` | 6.2 The Season Is the Primary Business Boundary | Every business entity clearly defines its relationship to a season |
| `M-78` | 6.2 The Season Is the Primary Business Boundary | Scope operational reads and writes by season wherever the schema |
| `M-79` | 6.3 Season Lifecycle | Closed-season immutability is enforced at the database, not only in |
| `M-80` | 6.3 Season Lifecycle | Season deletion follows Part 4.13: transactional, counted before |
| `M-81` | 6.5 Business Rules Must Be Configurable | Avoid hardcoded operational policies |
| `M-82` | 6.6 Historical Accuracy | Never rewrite history |
| `M-83` | 6.6 Historical Accuracy | A past season's figures are computed against that season's price |
| `M-84` | 6.9 Automation | Never automate a business decision that requires human judgement |
| `M-85` | 6.10 Artificial Intelligence | AI suggestions remain reviewable by humans, and human operators |
| `M-86` | 6.11 Arabic Domain Values | Preserve Arabic enum and domain values exactly as stored |
| `M-87` | 7.1 Document Authority | Where two project documents conflict, this order decides: |
| `M-88` | 7.2 The Repository Is Source of Truth | Where a document and the repository disagree about what the system |
| `M-89` | 7.2 The Repository Is Source of Truth | This Playbook states durable engineering and architecture rules |
| `M-90` | 7.3 Feature Lifecycle | Skipping stages is not allowed |
| `M-91` | 7.4 Scope Management | Every feature has a clearly defined scope |
| `M-92` | 7.6 Communication Standards | Engineering reports always distinguish facts, assumptions, code |
| `M-93` | 7.6 Communication Standards | Claims must match reality |
| `M-94` | 7.7 Pull Request Standards | A migration PR contains the migration |
| `M-95` | 7.7 Pull Request Standards | Never run production migrations, merge pull requests, delete data |
| `M-96` | 7.8 Code Review | An implementation that violates a MUST is rejected during review |
| `M-97` | 7.9 Verification Regime | Never claim that tests pass |
| `M-98` | 7.9 Verification Regime | Report lint as a delta against the known baseline, never as an |
| `M-99` | 7.10 Verification Standards Learned the Hard Way | Test the real thing, not a proxy |
| `M-100` | 7.10 Verification Standards Learned the Hard Way | Never ship a non-functional control |
| `M-101` | 7.11 Deployment Verification and Parity | The deployed artefact must be the reviewed source |
| `M-102` | 7.12 Failure Recovery | A destructive rehearsal guards its target at every step that opens |
| `M-103` | 7.13 Technical Debt | Debt is recorded, not silent |
| `M-104` | 7.16 ADR Lifecycle | An architectural decision that becomes a mandatory project |
| `M-105` | 7.16 ADR Lifecycle | Every ADR carries a status: Proposed, Approved, Superseded |
| `M-106` | 7.16 ADR Lifecycle | This Playbook references an ADR; it does not copy it |
| `M-107` | 7.17 Amending This Playbook | A change to a MUST requires an approved architectural decision and |
| `M-108` | 7.17 Amending This Playbook | Rule identifiers are stable |
| `M-109` | 7.17 Amending This Playbook | A superseded edition is archived unchanged, never edited in place |
| `M-110` | 7.17 Amending This Playbook | Every edition satisfies the structural checks in Appendix A's |
| `M-111` | 7.18 Working With AI Agents | Never state that tests pass (C-08, M-97) |
| `M-112` | 7.18 Working With AI Agents | Never apply a migration, merge, deploy or delete data without |
| `M-113` | 7.18 Working With AI Agents | Verify a claim against the repository before repeating it from a |

---

# Appendix C — v1.0 → v2.0 Section Mapping

Every section of the approved v1.0 text, with its destination. Nothing is
unaccounted for.

v1.0 is archived unchanged at `docs/archive/ENGINEERING_PLAYBOOK_v1.0_original.md`.
The damaged copy that reached `main` is archived at
`docs/archive/ENGINEERING_PLAYBOOK_v1.0_damaged_main.md`. Both are byte-for-byte as
they were, with no headers added inside them; their provenance and hashes are in
`docs/archive/README.md`.

## C.1 Parts

| v1.0 | v2.0 |
|---|---|
| Front matter · Copyright · Document Status · How To Use | Front matter · What This Document Is · How v2.0 Relates to v1.0 · Rule Levels |
| Table of Contents (86 entries) | Table of Contents (regenerated; verified against the body both ways) |
| Part I — Vision & Engineering Principles | Part 1 |
| Part II — Engineering Standards | Part 1 · Part 2 |
| Part III — Backend, Database & Security Standards | Part 4 · Part 5 |
| Part IV — Frontend Architecture, UX & Product Standards | Part 3 |
| Part V — Business Rules, Hajj Domain & Long-Term Product Vision | Part 6 |
| *(no v1.0 equivalent)* | Part 7 — Workflow, Verification and Governance |

The Part boundaries changed because v1.0's Part III mixed database and security, and
its Part II mixed principles with code standards. UX keeps a Part of its own rather
than being folded into architecture.

## C.2 Sections

| v1.0 § | Title | Verdict | v2.0 destination |
|---|---|---|---|
| 1 | Vision | KEEP | 1.10 |
| 2 | Product Philosophy | MERGE | 1.3 (`M-02`) |
| 3 | Engineering Principles | MERGE | 1.2 · 1.3 · 1.10 · 2.5 · 4.1 · 5.2 |
| 4 | Non-Negotiable Rules | MERGE | 1.3 · 1.7 · 2.3 · 2.7 · 4.1 |
| 5 | Architecture Principles | KEEP | 2.3 |
| 6 | Development Workflow | KEEP | 7.3 (`M-90`) |
| 7 | Scope Management | KEEP | 7.4 (`M-91`) |
| 8 | Decision Making | KEEP | 1.10 (`S-07`) · 7.5 |
| 9 | Communication Standards | KEEP | 7.6 (`M-92`, `M-93`) |
| 10 | Project Goal | KEEP | 7.19 (`G-06`) |
| 11 | General Engineering Principles | KEEP | 1.1 · 1.2 · 1.3 · 1.4 |
| 12 | Project Architecture Philosophy | MERGE | 2.3 (`S-09`) |
| 13 | React Architecture | UPDATE | 2.7 (`M-18`, `S-11`) |
| 14 | Component Size Limits | KEEP | 2.7 (`G-03`) + Appendix D E-1 |
| 15 | State Management Rules | KEEP | 2.7 (`S-13`, `S-14`) |
| 16 | TypeScript Standards | KEEP + CLEAN | 2.8 (`M-19`, `C-01`, `S-15`) + Appendix D E-2 |
| 17 | Naming Standards | KEEP | 2.9 (`S-16`, `G-04`) |
| 18 | Function Design | MERGE | 2.7 (`G-03`, `S-12`) |
| 19 | Error Handling | KEEP | 2.12 |
| 20 | Logging Philosophy | KEEP | 2.13 |
| 21 | Backend Philosophy | KEEP | 2.5 (`M-16`) |
| 22 | Supabase Architecture | KEEP + CLEAN | 2.6 (`S-10`) |
| 23 | Database Philosophy | UPDATE | 4.1 (`M-29`, scope stated) |
| 24 | Single Source of Truth | UPDATE | 4.2 (`M-30`, `C-04`) |
| 25 | Transactions | KEEP | 1.7 (`M-08`) · 4.3 (`M-31`) |
| 26 | RPC Standards | KEEP | 4.4 |
| 27 | Row Level Security | KEEP | 5.5 |
| 28 | Security Definer Functions | UPDATE | 5.6 (`M-61`, `M-62`, `M-63`) |
| 29 | Authentication | KEEP | 5.3 |
| 30 | Authorization | KEEP | 2.5 (`M-17`) · 5.4 (`M-57`) |
| 31 | Data Validation | KEEP | 1.6 (`M-07`) |
| 32 | Storage Standards | UPDATE | 5.7 |
| 33 | Audit Trail | UPDATE | 5.10 |
| 34 | Soft Delete vs Hard Delete | **REMOVE + REPLACE** | 4.13 — see C.3 |
| 35 | Migrations | MERGE | 4.5 · 4.6 |
| 35.1 | Canonical Migration Workflow | KEEP + SPLIT | 4.5–4.12 (binding rules, reasons intact) · procedure → `docs/runbooks/MIGRATION_WORKFLOW.md` |
| 36 | Realtime Standards | MERGE | 1.4 (`M-05`) |
| 37 | API Design Principles | KEEP | 2.10 |
| 38 | Error Responses | UPDATE | 2.11 (`M-20`, `M-21`) |
| 39 | Performance Philosophy | MERGE | 1.1 (`S-01`) |
| 40 | Reliability First | MERGE | 1.9 (`S-06`) |
| 41 | Frontend Philosophy | KEEP | 3.1 |
| 42 | Design Principles | KEEP | 3.2 |
| 43 | User Experience Philosophy | KEEP | 3.3 |
| 44 | Workflow First | KEEP | 3.4 |
| 45 | Consistency Rules | KEEP | 3.5 (`M-24`) |
| 46 | Navigation Standards | KEEP | 3.6 |
| 47 | Screen Layout Standards | KEEP | 3.7 |
| 48 | Forms | KEEP | 3.8 |
| 49 | Validation UX | KEEP | 3.9 |
| 50 | Tables | KEEP | 3.10 |
| 51 | Search Philosophy | KEEP | 3.11 |
| 52 | Filters | KEEP + CLEAN | 3.12 (`S-30`) — see C.3 |
| 53 | Loading States | KEEP | 3.13 (`M-25`) |
| 54 | Empty States | KEEP | 3.14 |
| 55 | Error States | KEEP | 3.15 |
| 56 | Confirmation Dialogs | KEEP | 3.16 |
| 57 | Notifications | KEEP | 3.17 |
| 58 | Accessibility | KEEP | 3.18 (`M-26`, `C-02`) + Appendix D E-3 |
| 59 | Responsive Design | KEEP | 3.19 |
| 60 | Product Quality Standard | KEEP | 3.20 (`M-28`) |
| 61 | Product Vision | MOVE (in part) | 6.12 (`G-05`) — aspirational module list retained as a guideline, not a rule |
| 62 | Domain-Driven Thinking | KEEP | 6.1 |
| 63 | Seasons Are the Core | KEEP + UPDATE | 6.2 (`M-77`) |
| 64 | Real Operational Workflows | KEEP | 6.4 |
| 65 | Business Rules Must Be Configurable | KEEP | 6.5 |
| 66 | Data Integrity Above Convenience | KEEP | 1.5 (`M-06`) |
| 67 | Every Action Has Consequences | KEEP | 1.8 (`G-01`) |
| 68 | Historical Accuracy | KEEP + UPDATE | 6.6 |
| 69 | Operational Transparency | KEEP | 6.7 |
| 70 | Reports Represent Decisions | KEEP | 6.8 |
| 71 | Automation Philosophy | KEEP | 6.9 |
| 72 | Artificial Intelligence | KEEP + CLEAN | 6.10 (`M-85`); speculative use-case list demoted to context |
| 73 | Company Profile and Multi-Deployment Architecture | KEEP | 2.1 · 2.2 · 2.4 |
| 73 *(original)* | Multi-Tenant Readiness | **REMOVED at recovery** | — see C.3 |
| 74 | Scalability | UPDATE | 2.2 · 1.10 — see C.3 |
| 75 | Extensibility | MERGE | 1.10 (`S-08`) · 6.12 |
| 76 | Operational Reliability | MERGE | 1.9 (`S-06`) |
| 77 | Product Philosophy | MERGE | 3.1 · 3.2 |
| 78 | Engineering Responsibility | KEEP | 7.14 (`S-61`) |
| 79 | Continuous Improvement | MERGE | 1.10 (`S-08`) · 7.15 |
| 80 | Final Engineering Principle | KEEP | 1.10 (`G-02`) · 7.20 |
| Architecture Decisions + ADR-001 | | **MOVED** | `docs/architecture/ADR/ADR-001-company-profile.md`; referenced from 2.4 |
| 81–86 | *(TOC-only in v1.0; no body text ever written)* | **WRITTEN FOR THE FIRST TIME** | 81 Documentation Rules → 7.1 · 7.2 · 7.17 · 82 Success Criteria → 7.19 · 83 Claude Project Instructions → 7.18 · 84 Final Principle → 7.20 · 85 Lessons Learned → **not written**, belongs in a lessons-learned document (`M-89`) · 86 Playbook Governance → 7.16 · 7.17 |

> **§§81–86 carry no recovered text.** v1.0 listed them and never wrote them. What
> appears in Part 7 against those numbers is new governance text, labelled
> `NEW (governance)` in Appendix A. It is not a restoration and must never be
> described as one. §85 in particular is deliberately still unwritten.

## C.3 Removals, with reasons

| Removed | Reason | Evidence |
|---|---|---|
| **§73 *Multi-Tenant Readiness*** (whole section) | Says "no campaign should access another campaign's data", which presumes campaigns coexist in one system. The approved architecture is the opposite: one company per deployment, explicitly not multi-tenant. Both cannot be true. | `M-09`, `M-11`; `PROJECT_MASTER_HANDOFF.md` §4 and §18; no `companies` table in the V1 baseline |
| **§34 soft-delete classification** (passengers, financial records, assignments, payments, operational history listed as soft-delete) | Describes a mechanism that does not exist and never did. Keeping it would instruct engineers to add `deleted_at` columns the architecture does not use. | No `deleted_at` / `is_deleted` anywhere in `src/` or any migration; `payments.passenger_id` is `ON DELETE RESTRICT`; season deletion is a counted hard delete; Handoff §8 lists soft delete as deferred |
| **§52 filter example `Campaign`** | A surviving multi-tenant assumption inside an otherwise sound UX rule. | Same as §73 above |
| **§74 scaling axis "More campaigns"** | Same. Recast: a new customer is a new deployment, not more rows. | Same as §73 above |
| **§35 "reversible whenever possible"** | Contradicts roll-forward and migration immutability, which are the actual recovery mechanism. | `M-37`, `M-38`; ledger compatibility anchors in `supabase/migrations/` |
| **§38 four-field response shape** (`success status / error code / message / identifier`) | Is the bug the codebase abandoned: an RLS-filtered `UPDATE` returns zero rows **and no error**, so a boolean success reported "saved" when nothing was saved. | `src/company/saveResult.ts` and its recorded rationale |
| **§32 "treat uploaded files as permanent records"** (as a blanket) | True of business documents, false of orphaned uploads and generated previews, which have a cleanup path. Split rather than deleted. | `supabase/scripts/purge_orphan_company_uploads.mjs`; `M-64` |
| **§33 "not optional for business-critical operations"** (as an absolute) | False about this system, and a false rule stops guiding. Audit coverage is a named subset and one narrow suppression path exists. Qualified, not loosened. | Four audit triggers only; `audit_suppression` with no grant to any role; `SECURITY_ARCHITECTURE.md` v1.7 §10.1 |
| **§35.1 step-by-step CLI procedure** | Relocated, not deleted: commands date faster than rules. Every rule and every attached reason stays in Part 4. | `docs/runbooks/MIGRATION_WORKFLOW.md` |
| **ADR-001 full text** | Relocated, not deleted. An ADR embedded in the Playbook cannot be superseded independently (`M-105`, `M-106`). | `docs/architecture/ADR/ADR-001-company-profile.md` |
| **§72 speculative AI use-case list**, **§61/§75 future-module lists** | Retained as guidelines rather than removed; they are aspiration, not rules, and are marked as such. | `G-05` |

No other v1.0 content was removed. Prose that merged into a shared section kept its
distinctive sentences; where a v1.0 sentence carried a reason for a rule, the reason
travelled with the rule.

---

# Appendix D — Known Exceptions Register

Where the repository does not currently meet a rule above.

It exists so the gap is visible and bounded. **It does not weaken any rule.** Every
rule named here remains in force exactly as written; what is recorded is debt against
it, not an amendment to it. A new violation is still a review defect (`M-96`,
`M-103`).

## E-1 · `G-03` Component and function size

13 of 108 TypeScript files in `src/` exceed 500 lines; 17 exceed the 400-line review
threshold.

| Lines | File |
|---:|---|
| 2485 | `src/components/PassengersPage.tsx` |
| 2392 | `src/components/ReportsPage.tsx` |
| 1621 | `src/components/FinancePage.tsx` |
| 1431 | `src/types/database.ts` — **generated**, out of scope |
| 1217 | `src/components/UsersPage.tsx` |
| 1113 | `src/components/HotelPage.tsx` |
| 1005 | `src/components/AdminsPage.tsx` |
| 831 | `src/utils/index.ts` |
| 813 | `src/components/FlightsPage.tsx` |
| 706 | `src/components/CampsPage.tsx` |
| 629 | `src/components/SeasonCloseWizard.tsx` |
| 575 | `src/components/PortalPage.tsx` |
| 546 | `src/components/PilgrimPortal.tsx` |

`PassengersPage.tsx` is the case 2.7 names as its Bad example. The cost is not
theoretical: the backlog records a document-viewer modal duplicated verbatim twice in
that file, both rendering, the second covering the first — which is why a fix applied
to one copy appeared to do nothing.

**Policy:** reduce per file touched. No sweeping refactor, and no new file admitted
above the threshold without justification.

## E-2 · `C-01` TypeScript `any`

139 occurrences across 12 files, plus 10 `ts-ignore` / `ts-nocheck` /
`eslint-disable` directives. None carries the documentation `C-01` requires.

This sits alongside the standing lint baseline, held as a fixed reference and reduced
per file touched, never swept in one pass. Lint is reported as a delta against that
baseline (`M-98`).

**Policy:** as E-1. New `any` needs the documented justification.

## E-3 · `M-26` Accessibility — status unknown, not assessed

No accessibility audit has ever been performed on this project, and there is no
automated accessibility checking in lint or CI.

The honest status is **unknown**. This register does not claim the product is
accessible, and does not claim it is inaccessible.

> **Attribute counts are not evidence either way.** Counting `aria-*` attributes or
> `role=` occurrences measures neither conformance nor failure: a correct, semantic,
> keyboard-navigable interface may need very few ARIA attributes, and a heavily
> annotated one may still be unusable. Do not cite such counts as a pass or a fail,
> and do not treat adding attributes as remediation.

`M-26`'s five requirements remain binding on new work and are reviewable directly at
the point of change.

**Policy:** an actual assessment is required before any statement about conformance.
Until one exists, the correct answer to "is the system accessible?" is "it has not
been assessed".

---

# Appendix E — Referenced Documents

| Document | Role |
|---|---|
| `docs/architecture/SECURITY_ARCHITECTURE.md` | Supreme authority on security (`M-54`) |
| `docs/architecture/README.md` | Architecture index and authority ladder |
| `docs/architecture/ADR/` | Architecture Decision Records (`M-104`–`M-106`) |
| `docs/architecture/ADR/ADR-001-company-profile.md` | The Company Profile boundary (2.4) |
| `docs/architecture/BACKLOG.md` | Recorded debt and deferred decisions |
| `docs/architecture/BREAK_GLASS.md` | Break-glass account and its recovery procedure |
| `docs/runbooks/MIGRATION_WORKFLOW.md` | The migration procedure (Part 4) |
| `docs/PROJECT_MASTER_HANDOFF.md` | Orientation and current state; never authoritative over this document |
| `docs/COMPANY_PROFILE_ARCHITECTURE_REVIEW.md` | The approved Company Profile architecture |
| `supabase/README.md` | Database structure, anonymous access inventory, Edge Function rules |
| `docs/archive/README.md` | Provenance and hashes of archived Playbook editions |
| GitHub Issue #42 | Authoritative season architecture (6.3) |

---

**End of Engineering Playbook v2.0**
