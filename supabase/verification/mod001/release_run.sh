#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# MOD-001 — مراحلُ إطلاق ترحيلات PR 1–3 (يستدعيها سيرا العمل)
# ════════════════════════════════════════════════════════════
#   release_run.sh <phase>
#
# المراحل:
#   static        ملفّاتُ الترحيلات الثلاث بأختامها، وعددُ الترحيلات، وفاحصو المستودع
#   scope         (بلا قاعدة) المرجعُ المُرسَل لا يحمل إلا قاعدةَ بيانات: لا واجهة،
#                 ونسختا سيرَي العمل فيه مطابقتان لنسختَي main المسجَّلتين
#   ledger-before السجلُّ = 58 / 20260928100000، والمعلّقُ هو الثلاث بالضبط
#   preflight     release_preflight.sql (قراءة)
#   fp-before     بصماتُ ما لا يُمسّ (قراءة)
#   push          الكتابةُ الوحيدة: `supabase db push --db-url`
#   ledger-after  السجلُّ = 61 / 20261011012258، والأصليّةُ الثمانية والخمسون كما هي
#   postcheck     release_postcheck.sql + تطابقُ البصمات قبل وبعد
#   price-gate    الترحيلاتُ الثلاث في السجلّ + release_price_gate.sql (قراءة) —
#                 بوّابةُ ما قبل إطلاق الواجهة، فلا تخضرّ قبل ترحيلات الإنتاج
#
# البيئة (من سير العمل): TARGET REF DB_USER DB_HOST DB_PORT PGPASSWORD CONFIRM
#   LT_SECRET (loadtest وحده) OUT. وفي الاختبار المحلّيّ وحده: MOD001_LOCAL_URL
#   و MOD001_SCOPE_BASE (أساسُ مقارنة scope، افتراضيّاً origin/main).
#
# كلُّ مرحلةٍ تتّصل تُعيد فحصَ الهدف أوّلاً (release_target_guard.sh، ومعه
# assert-not-production.sh لبيئة الاختبار)، فلا يعتمد الأمانُ على ترتيب الخطوات.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
OUT="${OUT:-$ROOT/mod001-release-evidence}"
mkdir -p "$OUT"

readonly M1="20261010194239" M2="20261010203522" M3="20261011012258"
readonly F1="supabase/migrations/20261010194239_mod001_hotels_foundation.sql"
readonly F2="supabase/migrations/20261010203522_mod001_hotels_backfill.sql"
readonly F3="supabase/migrations/20261011012258_mod001_hotel_operations.sql"
readonly SHA1="a3b3dfe58b7e4ecd4d8ec8ced4b73e2b4107c6b466a69415071a158e9e39570d"
readonly SHA2="c57d25a49812e14398e480a390c592a556c0253993ae8e211048805d228eebe7"
readonly SHA3="28ecc132627564dd200237c461177a50334dfdde815b71c1418648139bb5fb79"
readonly ROWS_BEFORE=58 LATEST_BEFORE="20260928100000"
readonly ROWS_AFTER=61  LATEST_AFTER="$M3"
# جسمُ delete_season الذي كُتبت عليه ترحيلةُ PR 1 — مقروءٌ من الإنتاج وبيئة
# الاختبار والقاعدة المحلّيّة عند 58، والثلاثةُ متطابقة.
readonly DELETE_SEASON_MD5="ae4c1905cebc93286cee74d4513c90c9"

phase="${1:-}"

guard() {
  if [ -n "${MOD001_LOCAL_URL:-}" ]; then
    # اختبارٌ محلّيٌّ للمنطق وحده: الهدفُ يجب أن يكون 127.0.0.1، ولا مرجعَ بعيد.
    case "$MOD001_LOCAL_URL" in postgresql://*@127.0.0.1:*) ;; *)
      echo "::error::REFUSING: MOD001_LOCAL_URL is not a local database"; exit 1;; esac
    return 0
  fi
  "$HERE/release_target_guard.sh" "${TARGET:-}" "${REF:-}" "${DB_USER:-}" "${DB_HOST:-}" "${CONFIRM:-}" "${LT_SECRET:-}"
  # المنفذُ يدخل الرابطَ نصّاً: قيمةٌ مثل `5432/postgres?hostaddr=…` تحوّل الوجهة
  # إلى خادمٍ آخر وتكشف PGPASSWORD. منفذا الـpooler وحدهما.
  case "${DB_PORT:-5432}" in 5432|6543) ;; *)
    echo "::error::REFUSING: db_port must be 5432 or 6543 — nothing was touched."; exit 1;; esac
  if [ "${TARGET:-}" = "loadtest" ]; then
    ALLOWED_TMP_REF="$REF" "$ROOT/supabase/verification/assert-not-production.sh" "$REF" "postgres.$REF" >/dev/null
  fi
}

url() {
  if [ -n "${MOD001_LOCAL_URL:-}" ]; then printf '%s' "$MOD001_LOCAL_URL"
  else printf 'postgresql://%s@%s:%s/postgres' "$DB_USER" "$DB_HOST" "${DB_PORT:-5432}"; fi
}

RO="SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY"
ro_sql()  { psql "$(url)" -X -q -v ON_ERROR_STOP=1 -c "$RO" "$@"; }
ro_val()  { psql "$(url)" -X -q -At -v ON_ERROR_STOP=1 -c "$RO" -c "$1"; }

ledger_dump() { # $1 = ملفُّ الإخراج
  ro_val "select version from supabase_migrations.schema_migrations order by version" > "$1"
}

case "$phase" in
  static)
    cd "$ROOT"
    files=(supabase/migrations/*.sql)
    n="${#files[@]}"
    [ "$n" -eq "$ROWS_AFTER" ] || { echo "::error::expected $ROWS_AFTER repository migrations, found $n"; exit 1; }
    [ "${files[$((n - 1))]}" = "$F3" ] || { echo "::error::the latest repository migration is not $F3"; exit 1; }
    for pair in "$F1:$SHA1" "$F2:$SHA2" "$F3:$SHA3"; do
      f="${pair%:*}"; want="${pair##*:}"
      [ -f "$f" ] || { echo "::error::$f missing"; exit 1; }
      got="$(sha256sum "$f" | cut -d' ' -f1)"
      [ "$got" = "$want" ] || { echo "::error::$f sha256 $got != reviewed $want"; exit 1; }
      echo "ok   $(basename "$f")  $got"
    done
    python3 supabase/verification/assert-no-toplevel-data-writes.py --selftest >/dev/null
    python3 supabase/verification/assert-no-toplevel-data-writes.py "$F1" "$F2" "$F3"
    python3 supabase/verification/assert-ledger-correspondence.py --selftest >/dev/null
    echo "static PASS"
    ;;

  scope)
    # يُشغَّل قبل كلّ دفع: ما يُدفع من مرجعٍ يجب أن يُدمج في main لاحقاً دون أن
    # يحمل الواجهةَ الجديدة (main يُنشر على Vercel Production تلقائيّاً).
    cd "$ROOT"
    base="${MOD001_SCOPE_BASE:-origin/main}"
    git rev-parse -q --verify "$base^{commit}" >/dev/null || {
      echo "::error::scope base $base is not available (checkout needs fetch-depth: 0)"; exit 1; }
    echo "dispatched ref=${GITHUB_REF:-local} sha=$(git rev-parse HEAD) base=$base@$(git rev-parse --short "$base")"
    for wf in .github/workflows/mod001-loadtest-release.yml .github/workflows/mod001-production-release.yml; do
      git cat-file -e "$base:$wf" 2>/dev/null || { echo "::error::$wf is not registered on $base"; exit 1; }
      git diff --quiet "$base" HEAD -- "$wf" || {
        echo "::error::$wf on this ref differs from the copy registered on $base"; exit 1; }
    done
    mb="$(git merge-base "$base" HEAD)"
    git diff --name-only "$mb" HEAD > "$OUT/scope-files.txt"
    if grep -vE '^(supabase/migrations/[^/]+\.sql|supabase/verification/.+|supabase/README\.md|docs/.+|\.github/workflows/mod001-(loadtest|production)-release\.yml)$' "$OUT/scope-files.txt"; then
      echo "::error::this ref carries non-database changes (listed above) — dispatch only from a database-only release ref"; exit 1; fi
    echo "scope PASS: $(wc -l < "$OUT/scope-files.txt") changed files, database-only; workflow copies match $base"
    ;;

  ledger-before)
    guard
    ledger_dump "$OUT/ledger-before.txt"
    rows="$(wc -l < "$OUT/ledger-before.txt")"; latest="$(tail -1 "$OUT/ledger-before.txt")"
    echo "ledger rows=$rows latest=$latest"
    [ "$rows" -eq "$ROWS_BEFORE" ] || { echo "::error::ledger holds $rows rows, expected $ROWS_BEFORE"; exit 1; }
    [ "$latest" = "$LATEST_BEFORE" ] || { echo "::error::ledger latest $latest, expected $LATEST_BEFORE"; exit 1; }
    python3 "$ROOT/supabase/verification/assert-ledger-correspondence.py" \
      "$ROOT/supabase/migrations" "$OUT/ledger-before.txt" "$ROWS_BEFORE" "$LATEST_BEFORE" > "$OUT/correspondence-before.txt" 2>&1 || true
    grep -qF "repository versions absent from production: ['$M1', '$M2', '$M3']" "$OUT/correspondence-before.txt" || {
      cat "$OUT/correspondence-before.txt"; echo "::error::the pending set is not exactly [$M1 $M2 $M3]"; exit 1; }
    grep -qF "ok   no unexpected production migration" "$OUT/correspondence-before.txt" || {
      cat "$OUT/correspondence-before.txt"; echo "::error::the target carries a migration the repository does not"; exit 1; }
    echo "ledger-before PASS: 58 rows, exactly the three MOD-001 migrations pending"
    ;;

  preflight)
    guard
    ro_sql -v ds_md5="$DELETE_SEASON_MD5" -f "$HERE/release_preflight.sql"
    ;;

  fp-before)
    guard
    psql "$(url)" -X -q -At -v ON_ERROR_STOP=1 -c "$RO" -f "$HERE/release_fingerprint.sql" > "$OUT/fingerprint-before.txt"
    [ "$(wc -l < "$OUT/fingerprint-before.txt")" -eq 10 ] || { echo "::error::fingerprint before is incomplete"; exit 1; }
    cut -d'|' -f1,2 "$OUT/fingerprint-before.txt"
    ;;

  push)
    guard
    [ -s "$OUT/fingerprint-before.txt" ] || { echo "::error::no fingerprint-before evidence — refusing to write"; exit 1; }
    cd "$ROOT"
    if [ -n "${MOD001_LOCAL_URL:-}" ]; then
      DB_URL="$MOD001_LOCAL_URL"
    else
      DB_URL="$(python3 -c "import os,urllib.parse as u; print('postgresql://%s:%s@%s:%s/postgres' % (u.quote(os.environ['DB_USER'],safe=''), u.quote(os.environ['PGPASSWORD'],safe=''), os.environ['DB_HOST'], os.environ.get('DB_PORT','5432')))")"
      echo "::add-mask::$DB_URL"
    fi
    set +e
    npm run --silent supabase -- db push --db-url "$DB_URL" > "$OUT/push.out" 2> "$OUT/push.err"
    rc=$?
    set -e
    sed -E -i 's#postgres(ql)?://[^ ]*@#postgresql://***@#g' "$OUT/push.out" "$OUT/push.err" 2>/dev/null || true
    cat "$OUT/push.out" "$OUT/push.err"
    [ "$rc" -eq 0 ] || { echo "::error::db push failed rc=$rc"; exit 1; }
    ;;

  ledger-after)
    guard
    ledger_dump "$OUT/ledger-after.txt"
    python3 "$ROOT/supabase/verification/assert-ledger-correspondence.py" \
      "$ROOT/supabase/migrations" "$OUT/ledger-after.txt" "$ROWS_AFTER" "$LATEST_AFTER"
    grep -vxE "$M1|$M2|$M3" "$OUT/ledger-after.txt" | diff -u "$OUT/ledger-before.txt" - || {
      echo "::error::the 58 original ledger versions changed"; exit 1; }
    echo "ledger-after PASS"
    ;;

  postcheck)
    guard
    ro_sql -f "$HERE/release_postcheck.sql"
    psql "$(url)" -X -q -At -v ON_ERROR_STOP=1 -c "$RO" -f "$HERE/release_fingerprint.sql" > "$OUT/fingerprint-after.txt"
    diff -u "$OUT/fingerprint-before.txt" "$OUT/fingerprint-after.txt" || {
      echo "::error::data the migrations must not touch has CHANGED"; exit 1; }
    echo "fingerprints unchanged (10/10)"
    ;;

  price-gate)
    guard
    ledger_dump "$OUT/ledger-price-gate.txt"
    for v in "$M1" "$M2" "$M3"; do
      grep -qx "$v" "$OUT/ledger-price-gate.txt" || {
        echo "::error::PRICE GATE BLOCKED: migration $v is not applied to this database"; exit 1; }
    done
    ro_sql -f "$HERE/release_price_gate.sql"
    ;;

  *)
    echo "::error::unknown phase '$phase'"; exit 1;;
esac
