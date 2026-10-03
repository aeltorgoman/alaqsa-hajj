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
  --dir /tmp/customer-release-v1.0.0

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

### The lint baseline is committed, not typed

The baseline lives in `release/lint-baseline.json` and the validator reads it by
default, so **the operator neither knows nor updates the number**. Lowering it is
a reviewed repository change made in the same pull request as the lint debt it
retires — which is what keeps it authoritative — and `docs/architecture/BACKLOG.md`
ن٥ cross-references it. The delta check is not optional: a missing or malformed
baseline file fails the validation, a positive delta fails it, and a negative
delta prints the instruction to lower the committed number. `--lint-baseline <n>`
exists only to override it for a one-off investigation.

## Generated into the snapshot

`.env.example` (variable **names and empty placeholders only** — never values),
`README.md`, `RELEASE.md` (version, date, boundary statement, deployment steps)
and `release-manifest.json` (sha256 of every shipped file).

## Deployment readiness is a separate question

Generating and validating a release needs **no environment and no secret value**;
a snapshot is produced and proven with nothing configured anywhere. Whether a
*target environment* is ready to receive a deployment is a different check, and
it belongs to the deployment path, not to snapshot generation.

`scripts/release/preflight-edge-config.mjs` is that check. Since the vendor
fallbacks were removed, `ALLOWED_ORIGINS`, `VERCEL_PROJECT_SLUG`,
`VERCEL_OWNER_SLUG` and `VAPID_SUBJECT` are required in every environment, and a
correct code change must not depend on an operator remembering that. The
preflight runs as a `GATE` step inside the existing per-function redeploy
workflows — `send-pilgrim-push`, `pilgrim-doc`, `whatsapp-send` — immediately
before `supabase functions deploy`, and refuses the deployment when the target
project does not hold the configuration the function's own source reads.

```bash
node scripts/release/preflight-edge-config.mjs \
  --function send-pilgrim-push --project-ref <ref>
```

It derives what each function needs by reading every `Deno.env.get("…")` in that
function and in the `_shared` files it imports, so a newly introduced variable
cannot be missed. Each name is then classified against
`envExampleVariables` in the manifest: platform-injected names are skipped,
`edgeRequired` names must be present, `edgeFeature` names are reported as
unavailable but do not fail, and a name in **none** of the three groups fails the
gate as unclassified configuration.

**What it can and cannot prove.** It reads secret **names only**, via
`supabase secrets list` — the same names-only pattern already reviewed in
`whatsapp-credential-free-verification.yml`. Secret values are never read,
printed or compared; the Management API does not expose them and the gate must
not want them. So it proves that a required name *is configured on the target*.
It cannot prove a value is correct, current, or points at this customer's own
domain, project and contact — that stays a human check under handover manual §13.
It never passes on an unverifiable result: if the inventory cannot be read, or
reads as empty, the gate **fails** rather than assuming.

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
