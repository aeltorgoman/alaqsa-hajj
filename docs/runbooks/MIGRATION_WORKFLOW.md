# Runbook — Canonical Migration Workflow (Supabase CLI)

**Status:** binding from the V1 cutover onward.
**Rules:** `ENGINEERING_PLAYBOOK.md` Part 4 states the binding rules and the reasons
behind them. **This runbook is the procedure only.** Where the two appear to differ,
the Playbook governs and this file is corrected.

Commands date faster than rules, which is why they live here: this file can be
updated when the CLI changes without reopening an engineering standard.

---

## The normal path, and the only normal path

```
repository migration
  -> local rebuild / verification
  -> PR review
  -> merge
  -> Supabase CLI `db push`
  -> post-deploy drift verification
```

Dashboard SQL editor and MCP `apply_migration` are **not** the normal migration path.
See *Break-glass* below for the one narrow exception.

The CLI version this workflow assumes is pinned in `package.json`. Invoke it as
`npm run supabase -- <command>` so every developer and agent runs the same binary.

## CREATE

- Create migrations with `npm run supabase -- migration new <name>`.
- The CLI-generated timestamp is authoritative (`M-36`).
- One migration per logical change (`S-38`).

## DEVELOP

Authoring rules — exact function signatures, `SECURITY DEFINER` `search_path`,
explicit grants, destructive-DDL preconditions, no `DROP ... CASCADE`, fail-loudly
assertions, scoped postconditions — are `M-40`–`M-42`, `S-39`, `S-40`, `M-61`–`M-63`.
Read them there; they carry the reasons this project learned them from.

## LOCAL VERIFY

- Rebuild from repository state alone: `npm run supabase -- db reset` (`M-43`).
- The seed is local bootstrap only (`supabase/seed.sql`). It carries no production or
  demo rows, and `db push` never runs it.
- Verify security-relevant outcomes with independent queries after the reset
  (`M-44`).
- Exercise the real failure path, not just the happy one (`S-41`).

## PR

- The migration is reviewed before it reaches any database (`M-35`).
- Ordering must be safe in both directions (`M-45`).
- A migration PR should contain the migration (`S-42`).

## PRE-DEPLOY

- `npm run supabase -- migration list` against the target; verify the pending set
  matches expectation (`M-47`).
- `npm run build`.
- `npm run lint`, reported as a **delta** against the known baseline (`M-98`).
- A clean `db reset` from repository state.

## DEPLOY

- After merge, never before (`M-46`).
- The normal mechanism is `npm run supabase -- db push`.
- Dashboard and MCP `apply_migration` are prohibited for normal migrations (`M-34`).

> ⚠️ `--db-url`, not `--linked`. `supabase link` resolves the project's **secret**
> service-role key through the management API, which no scoped personal access token
> can satisfy. The push needs a database connection, which is what `--db-url` takes.
> This is why the repository's canonical push workflows in `.github/workflows/` pass
> `--db-url` and name `--project-ref` explicitly.

## POST-DEPLOY

- Verify the exact migration version in the remote ledger against the repository
  filename, and the intended schema and security state by independent catalog
  queries (`M-48`).
- Run a drift check. **A schema diff alone is not sufficient for security
  equivalence** — the nine things it misses are enumerated in `M-49`.

## ROLLBACK

Roll forward (`M-38`). Never edit a migration that has been merged or applied
(`M-37`). Ledger compatibility anchors are never filled in (`M-39`).

## BREAK-GLASS

The five conditions are `M-50`. Break-glass is an incident, not a shortcut.

---

## Applying one migration through CI

The repository's canonical push workflows in `.github/workflows/` are the worked
pattern: BEFORE gates that capture and assert the starting state, **exactly one**
production-mutating command, AFTER gates that prove the intended delta and nothing
else, and an explicit audited list of operations that must be absent (`migration
repair`, `migration up`, `--include-all`, manual SQL mutation, rollback, baseline
execution, any operation on a historical migration, any Dashboard action).

Read-only remote verification is enforced at the server with
`default_transaction_read_only = on`, so a mistaken write is rejected by the database
rather than prevented by care (`S-43`).

Destructive rehearsals guard their target at every step that opens a connection or
writes — `supabase/verification/assert-not-production.sh` — not once at the top
(`M-102`).
