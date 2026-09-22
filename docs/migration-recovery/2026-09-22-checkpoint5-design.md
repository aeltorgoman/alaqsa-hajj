# Checkpoint 5 — cutover design, CLI behaviour proof, and alias analysis

Status: **design + local proof complete; schema-rebuild proof and the live cutover both still
gated.** Nothing in this document authorises a live mutation.

All CLI behaviour below was read out of the pinned binary (`supabase@2.117.0`, not stripped) and
then **executed** against a throwaway local PostgreSQL 16 cluster seeded with the exact 46
captured remote ledger rows. Nothing is argued from memory or documentation.

## Q1 — does matching use the version, so a no-op anchor satisfies a remote row? **Yes.**

The pending/conflict computation is one function:

```js
function DXe(t, n) {                                   // t = local paths, n = remote versions
  let c = n[l];                                        // remote version
  let e = TL.exec(Zce(H[s]))?.[1] ?? "";               // local version, from the FILENAME
  if (c === e) { l++; s++; }                           // match: string equality, nothing else
  ...
  if (o.length > 0) return { kind: "missing-local", versions: o };
  if (i.length > 0) return { kind: "missing-remote", paths: i };
  return { kind: "pending", paths: H.slice(n.length) };
}
```

`TL = /^([0-9]+)_(.*)\.sql$/u`. The file's *contents* never enter the comparison.

**Executed:** with 46 comment-only anchors whose versions match the ledger, `migration list`
reported **46 matched, 0 missing-local, 1 pending**. Anchor bodies bear no resemblance to the
historical SQL, and it made no difference.

## Q2 — does the CLI compare SQL contents or hashes? **No.**

`statements` is *written* (`INSERT … VALUES($1,$2,$3)`) and *read* (`SELECT version,
coalesce(name,'') as name, statements`), but no code path diffs it against a local file. There is
no hash column and no hash computation over migration bodies anywhere in the ledger code. The
seed-file mechanism does hash (`supabase_migrations.seed_files(path, hash)`), but that is seeds,
not migrations.

**This is what makes the 21 byte-different aliases irrelevant to the cutover.**

## Q3 — can the 46 remote versions stay untouched while local history is 46 anchors? **Yes.**

Proven end to end against the simulated ledger — see *Local rehearsal* below. The 46 rows were
bit-for-bit unchanged.

## Q5 — what does `migration repair --status applied <version>` actually do?

The implementation, in full:

```js
S8n = (conn, …, versions, status, repairAll) => {
  Jh(conn);                                   // CREATE SCHEMA/TABLE/COLUMN … IF NOT EXISTS, only if absent
  if (status === "applied")
    for (v of versions) { file = glob(`supabase/migrations/${v}_*.sql`);   // must exist
                          parsed.push(read+split(file)); }                 // parsed, never run
  BEGIN
    if (repairAll) TRUNCATE supabase_migrations.schema_migrations          // ← only with no version args
    if (status === "applied") for (p of parsed)
        INSERT … VALUES($1,$2,$3) ON CONFLICT (version) DO UPDATE SET name=…, statements=…
    else if (!repairAll) DELETE FROM … WHERE version = ANY($1)
  COMMIT
}
```

| Question | Answer |
|---|---|
| Ledger rows inserted/updated | exactly one per version argument |
| Name handling | taken from the filename's `<name>` capture |
| Statements handling | the local file is split into `text[]` and **stored as data** |
| Does migration SQL execute? | **No.** The only statements issued are `BEGIN`, the upsert, `COMMIT` |
| Any schema DDL? | only `CREATE SCHEMA/TABLE/COLUMN … IF NOT EXISTS` for the ledger table itself, skipped when it already exists — which it does on the live project |
| Local migration missing | hard error: `glob supabase/migrations/<v>_*.sql: file does not exist` (verified) |
| Version already present | **`ON CONFLICT DO UPDATE` overwrites `name` and `statements`** (verified: the preserved payload of `20260818103356` was replaced) |

The last row is the most dangerous property in this checkpoint and is recorded as a stop
condition in `supabase/cutover-candidate/README.md`.

## Q6/Q7/Q11 — history alignment and pending set

`pending = H.slice(n.length)` — local files beyond the count of remote rows. With 46 remote rows
and 47 local files, pending is exactly the baseline; once the ledger has 47 rows, pending is
empty. Future migrations sort after the baseline and become the new tail.

## Local rehearsal — executed, not described

Throwaway PostgreSQL 16 database seeded from `docs/migration-recovery/2026-09-21/final/` with the
exact 46 rows, including the NULL-statements row and every byte-exact payload.

| Step | Result |
|---|---|
| Control: today's 37 migrations vs the ledger | `LegacyDbPushMissingLocalError` naming **39** remote versions with no local file |
| With 46 anchors: `migration list` | 46 matched · 0 missing-local · pending `['20260922120000']` |
| `db push --dry-run` before | `"upToDate": false`, migrations `["20260922120000_v1_baseline.sql"]` |
| `migration repair --status applied 20260922120000` | `Repaired migration history: [20260922120000] => applied` |
| The 46 pre-existing rows | **bit-for-bit unchanged** (md5 over version\|name\|statements) |
| Schema objects outside `supabase_migrations` | **0 before, 0 after** — the baseline's 628 statements were stored, not executed |
| Ledger rows | 46 → 47 |
| `db push --dry-run` after | `"upToDate": true`, migrations `[]` |

## Q8 — hazards of the anchor model

| Surface | Assessment |
|---|---|
| `db reset` / fresh rebuild | anchors are comments-only, so they are inert; the baseline builds the schema. `verify-cutover.py` fails the build if any anchor gains SQL |
| `db push` | anchors are never pending (all sort before the baseline and all exist remotely) |
| `migration list` | shows 46 matched historical versions — accurate, since they *were* applied |
| `migration repair` | the real hazard, documented above as prohibited variants |
| Future developers | the danger is someone "filling in" an anchor. Mitigated by the file header, by `verify-cutover.py`, and by the archive being the only place historical SQL lives |
| Disaster recovery | strictly improved: recovery is one proven baseline rather than 46 partly-divergent historical bodies |
| Branch / preview environments | they replay `supabase/migrations/`, so they get anchors + baseline — the proven path |

## Q9 — is there a safer design?

The alternatives were each weighed against all seven constraints:

| Option | Fails on |
|---|---|
| `migration repair --status reverted` for the 39 unmatched versions, then push the baseline | **deletes 39 remote ledger rows** — violates "no deletion of the existing 46" |
| Repair-all (`TRUNCATE` + reinsert) | destroys all 46 rows and their preserved payloads |
| Keep the 37 historical files active and add the baseline | a fresh rebuild would replay historical SQL *and* the baseline; the 39 missing-local conflicts remain |
| Squash into a single historical file at the earliest version | rewrites the meaning of an already-applied version; still leaves 39 conflicts |
| Anchors + baseline | — |

**Keep the anchor model.** It is the only option that satisfies zero replay, zero row deletion,
one reconciliation operation, a deterministic empty rebuild, a clean future workflow, preserved
evidence and low operational complexity. Not one alternative failed on aesthetics; each failed on
a stated constraint.

## The 21 byte-different aliases

22 repository files share a *name* with a ledger row under a different version. Classified by
statement-level comparison (dollar-quoted bodies preserved verbatim):

| Class | Count |
|---|---|
| byte-identical | 1 |
| formatting / comment only (identical statements after normalisation) | 11 |
| identical once comments inside function bodies are stripped | 2 |
| function body differs beyond comments | 7 |
| an extra statement present remotely | 1 |

The single structural difference is `20260811140000` → `20260811081632`
(`s6_close_public_storage_writes`): the applied remote payload carries one statement the
repository file does not —
`revoke insert, update, delete, truncate on storage.objects from anon`. The remote is
**stricter**, not weaker, and the live database is what Checkpoint 4 fingerprinted.

The 7 body-level differences are all the same shape: one `create or replace function …`
statement whose dollar-quoted body differs from the repository text — the same
comment-fidelity phenomenon already documented for `20260822224856`.

**Effect on Checkpoint 5: none.** The CLI never compares content (Q2), so no alias difference can
affect matching. And the *end state* is not in question: Checkpoint 4 proved the baseline
reproduces the live schema with 847 fingerprint records and **zero** unresolved differences,
covering ACLs, grants, default privileges, RLS, policies, function security mode, `search_path`,
EXECUTE grants and storage security. The aliases describe *how* the schema was reached, not
*what* it is. Repairing that history is not proposed, here or anywhere.

## What is NOT proven here

The schema rebuild through the CLI — anchors → baseline on an empty PostgreSQL **17** stack, with
Level 1, Level 2, compatibility probes and a `db reset` determinism check — **has not run**. This
sandbox has no Docker and only PostgreSQL 16, and the live grants use `MAINTAIN`, which PG16
cannot express; that is the same constraint that moved Checkpoint 4 into GitHub Actions.

`.github/workflows/checkpoint5-cutover-proof.yml` performs exactly that proof, plus the
reconciliation rehearsal, read-only against the remote project. **It has not been dispatched.**
Checkpoint 5 is not closed and the live cutover is not authorised until it passes.
