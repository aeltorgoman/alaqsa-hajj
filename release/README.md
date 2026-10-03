# Customer Release mechanism

Generates a **clean Customer Release snapshot** from an approved Master commit or
tag, for publication to that customer's own private Customer Repository.

Governing documents: `docs/CUSTOMER_TECHNICAL_HANDOVER_MANUAL.md` §2.2 (clean
snapshot, not transferred history), §3.1–§3.3 and §3.7 (secrets and per-customer
configuration), §4 and §5 (release control and versioning); `supabase/README.md`
(which Supabase paths are canonical); `docs/ENGINEERING_PLAYBOOK.md` `M-104`,
`M-105`, `M-108`.

## Operator process

```bash
# 0. stand on the approved Master release state
git checkout v1.0.0            # or the approved commit

# 1. generate the snapshot into a temporary directory
node scripts/release/generate-customer-release.mjs \
  --out /tmp/customer-release-v1.0.0 --version 1.0.0

# 2. validate it — clean install, production build, lint delta
node scripts/release/validate-customer-release.mjs \
  --dir /tmp/customer-release-v1.0.0 --lint-baseline 198

# 3. publish, only after both steps exited 0 (see "Publishing" below)
```

The operator chooses no files. The allowlist is
`release/customer-release.manifest.json`.

## What the mechanism is

- **An allowlist, not a cleanup.** Only paths named in the manifest are copied.
  Nothing is copied and then deleted, so a new Master directory is excluded by
  default rather than by someone remembering to exclude it.
- **No Master history.** `.git` is never read or copied. The snapshot is a plain
  directory; the Customer Repository gets its own first commit for the release.
- **Fail closed.** The generator exits non-zero — and the snapshot must not be
  published — when a required file is missing, an unexpected sensitive file
  appears, a secret-shaped string or a retired vendor identifier is found, or the
  snapshot contains anything outside the allowlist.

## Checks the generator enforces

| Check | Failure condition |
|---|---|
| Allowlist resolution | an allowlisted file or tree is missing from Master, or a tree matches nothing |
| Completeness | any path in `required` is absent from the snapshot |
| Closure | the snapshot holds any file not in the allowlist or generated set |
| Boundary | any `forbiddenPaths` entry appears (`.git`, `.github`, `loadtest`, `attached_assets`, `supabase/baseline*`, `supabase/cutover-candidate`, `supabase/migrations-archive`, `supabase/verification`, internal `docs/**`, …) |
| Sensitive files | a `.env`, key, certificate, dump, spreadsheet, CSV or log file appears (`.env.example` excepted) |
| Secrets | a JWT, Supabase key or access token, Anthropic/GitHub/Meta/AWS/Google/Slack token, PEM private key block, or an assigned secret env value appears in any text file |
| Neutral identity | `alaqsa` / `al-aqsa` or the vendor Vercel account slug appears anywhere |
| `.env.example` | any line is not a bare `NAME=` placeholder |
| Supabase migrations | the shipped `.sql` set or any file's content differs from Master |
| Supabase functions | a required function or its `index.ts` is missing, or `_shared` is absent |
| Supabase config | a required function has no `verify_jwt` entry, `config.toml` declares a function the snapshot does not ship, or `project_id` is absent |
| Build inputs | lockfile name mismatch, a missing `build`/`lint`/`supabase` script, or an unpinned Supabase CLI |

The validator then proves the snapshot stands on its own: `npm ci` from the
shipped lockfile, `npm run build`, and `npm run lint` reported as a **delta**
against the baseline (`M-105`) — a positive delta fails.

## Generated into the snapshot

`.env.example` (variable **names and empty placeholders only** — never values),
`README.md`, `RELEASE.md` (version, date, boundary statement, deployment steps)
and `release-manifest.json` (sha256 of every shipped file).

## Publishing

Publication is a deliberate, separately authorized step and is **not** automated
by these scripts. The validated snapshot becomes the Customer Repository's own
commit and release tag under handover manual §2.2 and §5 — `git init` inside the
snapshot, one commit, one tag, push to the customer remote. Master's history is
never a parent of it.

## Changing the boundary

Edit `release/customer-release.manifest.json`, never the scripts. Adding a
Master directory does not change what ships; shipping it is an explicit manifest
decision, reviewed like any other change.
