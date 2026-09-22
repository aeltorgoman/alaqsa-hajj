#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# اختبارُ المقارنَين نفسِه — يُشغَّل قبل أيّ عملٍ على قاعدة
# ════════════════════════════════════════════════════════════
# A comparator that cannot fail is not a control. This proves, on
# fixtures and with no database at all, that:
#
#   * identical-but-reordered fingerprints PASS (collation noise),
#   * an intentionally altered SECURITY fixture FAILS, in each of the
#     ways the security model can actually be broken,
#   * the Level 1 comparator ignores dump metadata and ordering, and
#     fails on a missing GRANT or a missing object.
#
# Every case asserts the exit code, so a comparator that silently
# started returning 0 would be caught here rather than in a run.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
FP="$here/compare-fingerprints.py"
ST="$here/compare-structural.py"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pass=0
fail=0

expect() { # expect <wanted-rc> <name> <cmd...>
  local want="$1" name="$2"; shift 2
  local rc=0
  "$@" > "$tmp/out.txt" 2>&1 || rc=$?
  if [ "$rc" -eq "$want" ]; then
    printf 'ok    %-58s (rc=%s)\n' "$name" "$rc"
    pass=$((pass + 1))
  else
    printf 'FAIL  %-58s (rc=%s, wanted %s)\n' "$name" "$rc" "$want"
    sed 's/^/        /' "$tmp/out.txt"
    fail=$((fail + 1))
  fi
}

# ── a reference fingerprint covering every required record kind ──
cat > "$tmp/ref.txt" <<'EOF'
COUNT  tables = 22
COUNT  policies = 31
COLUMN passengers.season_id bigint null=NO def=active_season_id() ident=-
COLUMN غرف.رقم text null=YES def=- ident=-
CONSTRAINT camps camps_gender_vocab CHECK ((gender = ANY (ARRAY['ذكر'::text, 'أنثى'::text])))
INDEX  CREATE UNIQUE INDEX seasons_one_open ON public.seasons USING btree (id)
VIEW   company_profile_public opts=security_invoker=true md5=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
FUNC   has_permission(p text) lang=plpgsql vol=s secdef=true cfg=search_path=public,pg_temp acl=EXECUTE:authenticated md5=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
TRIGGER rooms trg_rooms_apply_capacity md5=cccccccccccccccccccccccccccccccc
RLS    passengers enabled=true forced=false
POLICY passengers passengers_read SELECT PERMISSIVE roles=authenticated qual=dddddddddddddddddddddddddddddddd chk=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
GRANT  passengers authenticated=SELECT
SCHEMA public acl={postgres=UC/postgres,anon=U/postgres}
DEFACL role=postgres schema=public objtype=r acl={authenticated=arwdDxtm/postgres}
EXT    pgcrypto schema=extensions
BUCKET docs public=false size=- mime=-
STPOL  objects docs_read SELECT roles=authenticated qual=ffffffffffffffffffffffffffffffff
EOF

# ── 1. identical content, different order: MUST PASS ──
tac "$tmp/ref.txt" > "$tmp/shuffled.txt"
expect 0 "L2: reordered fingerprint (collation noise) passes" \
  python3 "$FP" "$tmp/ref.txt" "$tmp/shuffled.txt" --label "selftest"

# ── 1b. byte-identical: MUST PASS ──
cp "$tmp/ref.txt" "$tmp/same.txt"
expect 0 "L2: byte-identical fingerprint passes" \
  python3 "$FP" "$tmp/ref.txt" "$tmp/same.txt" --label "selftest"

# ── 2. altered SECURITY fixtures: each MUST FAIL ──
mutate() { # mutate <name> <sed-script>
  sed "$2" "$tmp/ref.txt" > "$tmp/mut.txt"
  cmp -s "$tmp/ref.txt" "$tmp/mut.txt" && { echo "FIXTURE BUG: $1 changed nothing"; exit 1; }
  expect 1 "L2: $1 fails closed" python3 "$FP" "$tmp/ref.txt" "$tmp/mut.txt" --label "selftest"
}
mutate "SECURITY DEFINER flipped off"      's/secdef=true/secdef=false/'
mutate "function search_path emptied"      's/cfg=search_path=public,pg_temp/cfg=-/'
mutate "EXECUTE granted to anon"           's/acl=EXECUTE:authenticated/acl=EXECUTE:anon EXECUTE:authenticated/'
mutate "RLS disabled on passengers"        's/RLS    passengers enabled=true/RLS    passengers enabled=false/'
mutate "policy USING expression changed"   's/qual=dddddddddddddddddddddddddddddddd/qual=00000000000000000000000000000000/'
mutate "policy role widened to anon"       's/POLICY passengers passengers_read SELECT PERMISSIVE roles=authenticated/POLICY passengers passengers_read SELECT PERMISSIVE roles=anon,authenticated/'
mutate "table GRANT widened to anon"       's/GRANT  passengers authenticated=SELECT/GRANT  passengers anon=SELECT/'
mutate "default privileges changed"        's/acl={authenticated=arwdDxtm\/postgres}/acl={authenticated=r\/postgres}/'
mutate "storage bucket made public"        's/BUCKET docs public=false/BUCKET docs public=true/'
mutate "storage policy expression changed" 's/qual=ffffffffffffffffffffffffffffffff/qual=11111111111111111111111111111111/'
mutate "view security_invoker removed"     's/opts=security_invoker=true/opts=-/'
mutate "schema ACL widened"                's|SCHEMA public acl={postgres=UC/postgres,anon=U/postgres}|SCHEMA public acl={postgres=UC/postgres,anon=UC/postgres}|'

# ── 3. a DELETED policy line: MUST FAIL ──
grep -v '^POLICY' "$tmp/ref.txt" > "$tmp/nopolicy.txt"
expect 1 "L2: deleted POLICY record fails closed" \
  python3 "$FP" "$tmp/ref.txt" "$tmp/nopolicy.txt" --label "selftest"

# ── 4. an ADDED grant line: MUST FAIL ──
{ cat "$tmp/ref.txt"; echo 'GRANT  payments anon=SELECT'; } > "$tmp/extra.txt"
expect 1 "L2: added GRANT record fails closed" \
  python3 "$FP" "$tmp/ref.txt" "$tmp/extra.txt" --label "selftest"

# ── 5. empty or gutted capture must NOT read as equal ──
: > "$tmp/empty.txt"
expect 1 "L2: empty reference capture fails closed" \
  python3 "$FP" "$tmp/empty.txt" "$tmp/empty.txt" --label "selftest"
grep -v '^GRANT' "$tmp/ref.txt" > "$tmp/nogrant.txt"
expect 1 "L2: reference missing a required kind fails closed" \
  python3 "$FP" "$tmp/nogrant.txt" "$tmp/nogrant.txt" --label "selftest"

# ── 6. allowlist adjudicates, and only with a stated reason ──
printf '# WHY: selftest fixture\n+GRANT  payments anon=SELECT\n' > "$tmp/allow.txt"
expect 0 "L2: adjudicated difference passes with a stated reason" \
  python3 "$FP" "$tmp/ref.txt" "$tmp/extra.txt" --label "selftest" --allowlist "$tmp/allow.txt"
printf '+GRANT  payments anon=SELECT\n' > "$tmp/allow-nowhy.txt"
expect 1 "L2: allowlist entry without a reason is rejected" \
  python3 "$FP" "$tmp/ref.txt" "$tmp/extra.txt" --label "selftest" --allowlist "$tmp/allow-nowhy.txt"

# ── Level 1 fixtures ──
cat > "$tmp/dump-a.sql" <<'EOF'
--
-- PostgreSQL database dump
--
-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SELECT pg_catalog.set_config('search_path', '', false);

CREATE TABLE public.seasons (
    id bigint NOT NULL,
    name text NOT NULL
);

CREATE FUNCTION public.active_season_id() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select s.id from public.seasons s where s.closed_at is null;  -- ; inside a body
$$;

ALTER TABLE public.seasons OWNER TO postgres;
GRANT SELECT ON TABLE public.seasons TO authenticated;
EOF

# same statements, different order, different dump header, extra comments
cat > "$tmp/dump-b.sql" <<'EOF'
--
-- PostgreSQL database dump
--
-- Dumped from database version 17.2
-- Dumped by pg_dump version 17.4
-- an extra comment that means nothing

SET statement_timeout = 0;
SELECT pg_catalog.set_config('search_path', '', false);

CREATE FUNCTION public.active_season_id() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select s.id from public.seasons s where s.closed_at is null;  -- ; inside a body
$$;

CREATE TABLE public.seasons (
    id bigint NOT NULL,
    name text NOT NULL
);

GRANT SELECT ON TABLE public.seasons TO authenticated;
ALTER TABLE public.seasons OWNER TO postgres;
EOF

expect 0 "L1: metadata + ordering noise passes" python3 "$ST" "$tmp/dump-a.sql" "$tmp/dump-b.sql"

grep -v '^GRANT SELECT' "$tmp/dump-b.sql" > "$tmp/dump-c.sql"
expect 1 "L1: a dropped GRANT fails closed"     python3 "$ST" "$tmp/dump-a.sql" "$tmp/dump-c.sql"

sed 's/name text NOT NULL/name text/' "$tmp/dump-b.sql" > "$tmp/dump-d.sql"
expect 1 "L1: a relaxed NOT NULL fails closed"  python3 "$ST" "$tmp/dump-a.sql" "$tmp/dump-d.sql"

sed "s/SET search_path TO 'public', 'pg_temp'/SET search_path TO 'public'/" "$tmp/dump-b.sql" > "$tmp/dump-e.sql"
expect 1 "L1: a changed function search_path fails closed" python3 "$ST" "$tmp/dump-a.sql" "$tmp/dump-e.sql"

: > "$tmp/dump-empty.sql"
expect 1 "L1: empty reference dump fails closed" python3 "$ST" "$tmp/dump-empty.sql" "$tmp/dump-empty.sql"

echo ""
echo "comparator self-test: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || { echo "::error::comparator self-test failed - the Level 1/2 controls are not trustworthy"; exit 1; }
