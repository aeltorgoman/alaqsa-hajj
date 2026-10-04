#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# demo-rehearsal.sh — prove the Demo is reproducible end to end
# ════════════════════════════════════════════════════════════════
# refresh (reset → seed → load → verify, fingerprint A) → portal smoke →
# refresh again (fingerprint B) → A must equal B.
# The fingerprint covers the whole business dataset and the SHA-256 of
# every Storage object; ids and wall-clock fields are excluded (see README).
#   DEMO_RESET_CONFIRM=RESET-DEMO-<ref> DEMO_ANON_KEY=… bash demo-rehearsal.sh
set -euo pipefail
. "$(dirname "$0")/demo-lib.sh"
demo_require DEMO_PROJECT_REF DEMO_ANON_KEY
OUT="${DEMO_REHEARSAL_DIR:-$DEMO_GENERATED/rehearsal}"; mkdir -p "$OUT"
demo_step "cycle 1"; bash "$DEMO_TOOLS/demo-refresh.sh" "$OUT/fingerprint-1.json"
demo_step "portal smoke (rehearsal credential)"; node "$DEMO_TOOLS/demo-portal-smoke.mjs"
demo_step "cycle 2"; bash "$DEMO_TOOLS/demo-refresh.sh" "$OUT/fingerprint-2.json"
demo_step "compare"
a="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["fingerprint"])' "$OUT/fingerprint-1.json")"
b="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["fingerprint"])' "$OUT/fingerprint-2.json")"
echo "  cycle 1: $a"; echo "  cycle 2: $b"
[ "$a" = "$b" ] || { echo "✗ the second seed did not reproduce the first (diff the two fingerprint files)" >&2; exit 1; }
echo "✓ rehearsal passed — the reseed reproduced the same business dataset and identical Storage bytes."
