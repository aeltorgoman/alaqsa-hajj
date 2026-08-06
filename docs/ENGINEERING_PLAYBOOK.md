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

85. Lessons Learned (M0

Requirements



Discussion



Implementation



Independent Review



Merge

Engineering Standards

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



Domain Logic



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

10030 lines.

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
# Part III passengers table

Room occupancy

financial transactions

Season status

usability

API

data integrity

Each layer has its own responsibility.

Do not remove validation from one layer because another layer exists.

Validation should be redundant by design.

---

# 32. Storage Standards

Files are business assets.

Treat uploaded files as permanent records.

Store:

- passports
- IDs
- contracts
- tickets
- permits
- visas
- pilgrim photos

Each file should have:

- owner
- upload timestamp
- uploader
- category
- storage location

Never depend solely on filenames.

Metadata belongs in the database.

---

# 33. Audit Trail

Critical operations must be traceable.

The system should always answer:

Who performed the action?

When?

What changed?

What was the previous value?

What is the new value?

Audit history is not optional for business-critical operations.

Never overwrite history.

Append new records.

---

# 34. Soft Delete vs Hard Delete

Not everything should be deleted permanently.

Business entities should be classified.

Soft Delete:

- passengers
- financial records
- assignments
- payments
- operational history

Hard Delete:

- temporary imports
- failed uploads
- cache
- generated previews
- orphan temporary files

Permanent deletion must be intentional.

---

# 35. Migrations

Database schema changes must always use migrations.

Never modify production tables manually.

Every migration must be:

- deterministic
- repeatable
- version controlled
- reviewed
- reversible whenever possible

Schema history is part of the source code.

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

Every API should return structured responses.

Include:

- success status
- error code
- human-readable message
- machine-readable identifier

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
# Part IV 

Document upload



Financial setup



Bus assignment



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



Filters



Secondary actions

Business Rules, Hajj Domain & Long-Term Product Vision

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

More campaigns.

More seasons.

More reports.

More integrations.

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

Every pull request contributes tothat responsibility.

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

**End of Part V**
