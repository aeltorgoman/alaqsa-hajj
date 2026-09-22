#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# تركيبُ شجرةِ الهجرات المقترحة — لا يمسّ المستودعَ إلا بأمر
# ════════════════════════════════════════════════════════════
# Materialises the PROPOSED supabase/migrations/ tree into a target
# directory: the 46 ledger anchors plus the proven V1 baseline.
#
# The baseline is COPIED from supabase/baseline/v1/v1_baseline.sql and
# its SHA-256 is asserted, so the migration body is byte-identical to
# the artifact proven by Checkpoint 4 Run #8 by construction - there is
# no second copy in the repository that could drift.
#
#   usage: assemble-cutover.sh <target-migrations-dir>
set -euo pipefail

here="$(cd "$(dirname "$0")/../../.." && pwd)"
cand="$here/supabase/cutover-candidate"
dest="${1:?usage: assemble-cutover.sh <target-migrations-dir>}"

ver="$(python3 -c "import json;print(json.load(open('$cand/manifest.json'))['baseline_version'])")"
name="$(python3 -c "import json;print(json.load(open('$cand/manifest.json'))['baseline_name'])")"
want="$(python3 -c "import json;print(json.load(open('$cand/manifest.json'))['baseline_sha256'])")"
src="$here/supabase/baseline/v1/v1_baseline.sql"

got="$(sha256sum "$src" | cut -d' ' -f1)"
[ "$got" = "$want" ] || { echo "::error::baseline SHA-256 mismatch: expected $want, got $got"; exit 1; }

mkdir -p "$dest"
cp -p "$cand"/anchors/*.sql "$dest"/
cp -p "$src" "$dest/${ver}_${name}.sql"

got2="$(sha256sum "$dest/${ver}_${name}.sql" | cut -d' ' -f1)"
[ "$got2" = "$want" ] || { echo "::error::the assembled baseline migration is not byte-identical to the proven baseline"; exit 1; }

n="$(ls "$dest"/*.sql | wc -l)"
echo "Assembled $n migrations into $dest (46 anchors + 1 baseline, baseline sha256 $want)."
