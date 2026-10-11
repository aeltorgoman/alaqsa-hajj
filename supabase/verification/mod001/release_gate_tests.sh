#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# MOD-001 — اختبارُ منطق بوّابات الإطلاق محلّيّاً (لا قاعدةَ بعيدة)
# ════════════════════════════════════════════════════════════
# يشغّل السكربتاتِ نفسَها التي يستدعيها سيرا العمل، على المكدّس المحلّيّ
# المؤقّت وحده، ويُثبت أنّ كلَّ بوّابةٍ **تمنع** ما يجب أن تمنعه وتُمرّر السليم:
#   ١) حارسُ الهدف: الأهدافُ الخاطئة والتفويضاتُ المتبادلة مرفوضة
#   ٢) السجلّ: تاريخٌ غيرُ متوقَّع (زائد · ناقص · مُطبَّقٌ سلفاً) مرفوض
#   ٣) ما قبل الدفع: جسمُ delete_season المختلف وبقايا MOD-001 مرفوضة
#   ٤) دفعٌ محلّيٌّ كامل بالمراحل نفسِها ← كلُّ ما بعده يمرّ
#   ٥) البصمات: تغيّرُ بيانٍ محميٍّ يمنع
#   ٦) بوّابةُ الأسعار: الفرقُ والحاجُّ بلا فندقٍ يمنعان، والغائبُ صفرٌ في الطرفين يمرّ،
#      ولا تخضرّ قبل تطبيق الترحيلات
#   ٧) نطاقُ المرجع (بلا قاعدة): مرجعٌ يحمل واجهةً، أو سيرُ عملٍ غيرُ مسجَّل على main
#      أو مختلفٌ عن نسخته المسجَّلة — مرفوض. (يُنشئ التزاماتٍ مؤقّتةً في
#      worktrees منفصلة ولا يمسّ الفرعَ الحاليّ ولا يدفع شيئاً.)
#
#   supabase/verification/mod001/release_gate_tests.sh
#
# ⚠️ يُعيد بناءَ القاعدة المحلّيّة (`db reset`) ويرفض أيَّ رابطٍ غيرِ 127.0.0.1.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT" || exit 2
G=supabase/verification/mod001/release_target_guard.sh
R=supabase/verification/mod001/release_run.sh
LOCAL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export OUT="${OUT:-/tmp/mod001-release-gate-tests}"
rm -rf "$OUT"; mkdir -p "$OUT"
LT=vgqowazlzzcovcrigcjz; PROD=zkucwcnclbfvukhdqhgc; HOST=aws-1-eu-central-1.pooler.supabase.com
PUSH_LT=PUSH-MOD001-LOADTEST-20261011012258; PUSH_PROD=PUSH-MOD001-PRODUCTION-20261011012258
GATE_LT=GATE-MOD001-LOADTEST-PRICES; GATE_PROD=GATE-MOD001-PRODUCTION-PRICES

pass=0; fail=0
ok()  { echo "PASS — $1"; pass=$((pass + 1)); }
bad() { echo "FAIL — $1"; fail=$((fail + 1)); }
expect_ok()    { local d="$1"; shift; if "$@" > "$OUT/last.log" 2>&1; then ok "$d"; else bad "$d (blocked unexpectedly)"; tail -3 "$OUT/last.log"; fi; }
expect_block() { local d="$1"; shift; if "$@" > "$OUT/last.log" 2>&1; then bad "$d (was NOT blocked)"; tail -3 "$OUT/last.log"; else ok "$d → blocked: $(grep -m1 -oE '(REFUSING|BLOCKED|FAILED|error)[^—]{0,90}' "$OUT/last.log" | head -1)"; fi; }
sql() { psql "$LOCAL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
local_run() { MOD001_LOCAL_URL="$LOCAL" "$R" "$@"; }
reset_to() { npx --yes supabase@2.117.0 db reset --local --version "$1" > "$OUT/reset.log" 2>&1 || { echo "reset to $1 failed"; exit 2; }; }

echo "═══ ١) حارسُ الهدف ═══"
expect_ok    "loadtest push, LT ref = secret"                  env MODE=push "$G" loadtest   $LT   postgres.$LT   $HOST $PUSH_LT $LT
expect_ok    "production push, production ref"                 env MODE=push "$G" production $PROD postgres.$PROD $HOST $PUSH_PROD ""
expect_ok    "production price-gate"                           env MODE=price-gate "$G" production $PROD postgres.$PROD $HOST $GATE_PROD ""
expect_ok    "loadtest price-gate"                             env MODE=price-gate "$G" loadtest   $LT   postgres.$LT   $HOST $GATE_LT $LT
expect_block "loadtest price-gate confirmation used for a push" env MODE=push "$G" loadtest   $LT   postgres.$LT   $HOST $GATE_LT $LT
expect_block "loadtest run pointed at PRODUCTION"              env MODE=push "$G" loadtest   $PROD postgres.$PROD $HOST $PUSH_LT $PROD
expect_block "loadtest ref differs from LT secret"             env MODE=push "$G" loadtest   $LT   postgres.$LT   $HOST $PUSH_LT bkuiafduzyzpddwhwjdh
expect_block "loadtest without LT secret"                      env MODE=push "$G" loadtest   $LT   postgres.$LT   $HOST $PUSH_LT ""
expect_block "loadtest with the PRODUCTION confirmation"       env MODE=push "$G" loadtest   $LT   postgres.$LT   $HOST $PUSH_PROD $LT
expect_block "production run pointed at Load Test"             env MODE=push "$G" production $LT   postgres.$LT   $HOST $PUSH_PROD ""
expect_block "production with the Load Test confirmation"      env MODE=push "$G" production $PROD postgres.$PROD $HOST $PUSH_LT ""
expect_block "production with a pooler user for another ref"   env MODE=push "$G" production $PROD postgres.$LT   $HOST $PUSH_PROD ""
expect_block "production via a direct (non-pooler) host"       env MODE=push "$G" production $PROD postgres.$PROD db.$PROD.supabase.co $PUSH_PROD ""
expect_block "production carrying a Load Test identity"        env MODE=push "$G" production $PROD postgres.$PROD $HOST $PUSH_PROD $LT
expect_block "price-gate confirmation used for a push"         env MODE=push "$G" production $PROD postgres.$PROD $HOST $GATE_PROD ""
expect_block "push confirmation used for a price-gate"         env MODE=price-gate "$G" production $PROD postgres.$PROD $HOST $PUSH_PROD ""
expect_block "unknown target"                                  env MODE=push "$G" staging    $PROD postgres.$PROD $HOST $PUSH_PROD ""
expect_block "unknown mode"                                    env MODE=apply "$G" production $PROD postgres.$PROD $HOST $PUSH_PROD ""
expect_block "malformed ref"                                   env MODE=push "$G" production ZKU   postgres.ZKU   $HOST $PUSH_PROD ""
expect_block "release_run refuses before connecting (wrong target)" \
  env MODE=push TARGET=production REF=$LT DB_USER=postgres.$LT DB_HOST=$HOST CONFIRM=$PUSH_PROD "$R" ledger-before
expect_block "release_run refuses a db_port carrying URI parameters" \
  env MODE=push TARGET=production REF=$PROD DB_USER=postgres.$PROD DB_HOST=$HOST DB_PORT='5432/postgres?hostaddr=203.0.113.9' CONFIRM=$PUSH_PROD "$R" ledger-before
expect_block "release_run local mode refuses a non-local URL" \
  env MOD001_LOCAL_URL="postgresql://postgres.$PROD@$HOST:5432/postgres" "$R" ledger-before
expect_block "push refuses without fingerprint evidence" env OUT="$OUT/empty" MOD001_LOCAL_URL="$LOCAL" "$R" push

echo "═══ ٢–٣) السجلّ وما قبل الدفع — قاعدةٌ عند 58 ببياناتٍ اصطناعيّة ═══"
reset_to 20260928100000
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 > "$OUT/data.log" 2>&1 <<'SQL' || { echo "data load failed"; cat "$OUT/data.log"; exit 2; }
insert into public.pricing_settings (key, label, type, amount) values
  ('package_double','d','package',5000), ('package_triple','t','package',4000), ('package_quad','q','package',3000),
  ('package_suite','s','package',6000), ('addon_view','v','addon',250);
insert into public.seasons (name, hijri_year, hotel_name, hotel_address, hotel_url) values ('اختبار ١', 1440, 'فندق أ', 'مكة', 'https://a.example');
insert into public.rooms (number, floor, type) values ('1','1','ثنائية');
insert into public.passengers (name_ar, hotel_type, hotel_view) values ('اختبار ١', 'ثنائية', 'مطلة'), ('اختبار ٢', 'فردية', 'غير مطلة');
select public.close_season('اختبار ٢', 1441, 'tests', null);
update public.seasons set hotel_name = 'فندق ب' where hijri_year = 1441;
insert into public.rooms (number, floor, type) values ('1','1','رباعية');
insert into public.passengers (name_ar, hotel_type) values ('اختبار ٣', 'رباعية'), ('اختبار ٤', null);
insert into public.passengers (name_ar, passenger_type) values ('إداري', 'إداري');
update public.pricing_settings set amount = amount + 7 where key like 'package%';
SQL
expect_ok    "ledger-before at 58 with exactly the three pending" local_run ledger-before
expect_block "price gate before the migrations are applied"      local_run price-gate
expect_ok    "preflight at 58"                                    local_run preflight

sql "insert into supabase_migrations.schema_migrations (version, name) values ('20261001000000','foreign')"
expect_block "ledger with an unexpected migration"               local_run ledger-before
sql "delete from supabase_migrations.schema_migrations where version = '20261001000000'"
v="$(sql "select version from supabase_migrations.schema_migrations where version = '20260928090000'")"
row="$(sql "select name from supabase_migrations.schema_migrations where version = '$v'")"
sql "delete from supabase_migrations.schema_migrations where version = '$v'"
expect_block "ledger missing one of the 58"                      local_run ledger-before
sql "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$row')"
expect_ok    "ledger restored"                                    local_run ledger-before

sql "comment on function public.delete_season(bigint, uuid) is 'touched'" # التعليقُ لا يغيّر الجسم
expect_ok    "a comment does not change the delete_season body"   local_run preflight
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -c "select pg_get_functiondef('public.delete_season(bigint,uuid)'::regprocedure)" -At \
  | sed "s/raise exception 'لا يوجد موسم بالمعرّف %.'/raise exception 'لا يوجد موسمٌ بالمعرّف %.'/" > "$OUT/ds_mut.sql"
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -f "$OUT/ds_mut.sql" > /dev/null
expect_block "preflight with a third-party delete_season body"   local_run preflight
psql "$LOCAL" -X -q -c "select pg_get_functiondef('public.delete_season(bigint,uuid)'::regprocedure)" -At \
  | sed "s/raise exception 'لا يوجد موسمٌ بالمعرّف %.'/raise exception 'لا يوجد موسم بالمعرّف %.'/" > "$OUT/ds_back.sql"
psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -f "$OUT/ds_back.sql" > /dev/null
expect_ok    "preflight with delete_season restored"              local_run preflight
sql "create table public.hotels (id int)"
expect_block "preflight with a pre-existing hotels table"        local_run preflight
sql "drop table public.hotels"

echo "═══ ٤) دفعٌ محلّيٌّ كامل بالمراحل نفسِها ═══"
expect_ok "fp-before"                                             local_run fp-before
expect_ok "push (local db push of the three migrations)"          local_run push
expect_ok "ledger-after: 61, originals untouched"                 local_run ledger-after
expect_ok "postcheck: structure, backfill, base prices, fingerprints" local_run postcheck
expect_ok "price gate right after the push"                       local_run price-gate
expect_block "ledger-before after the migrations are applied"     local_run ledger-before
expect_block "preflight after the migrations are applied"        local_run preflight

echo "═══ ٥) البصمات ═══"
sql "update public.pricing_settings set label = label || ' ' where key = 'addon_view'"
expect_block "postcheck after a protected row changed"            local_run postcheck
sql "update public.pricing_settings set label = btrim(label) where key = 'addon_view'"
expect_ok    "postcheck after it was restored"                    local_run postcheck

echo "═══ ٦) بوّابةُ الأسعار (أخيراً: تُعيد إدراجَ صفّ سعرٍ فتتغيّر البصمةُ بحقّ) ═══"
sql "update public.pricing_settings set amount = amount + 1 where key = 'package_double'"
expect_block "global package price edited during rollout"         local_run price-gate
sql "update public.pricing_settings set amount = amount - 1 where key = 'package_double'"
expect_ok    "price restored"                                     local_run price-gate
h="$(sql "select h.id from public.hotels h join public.seasons s on s.id = h.season_id where s.closed_at is null")"
amt="$(sql "select amount from public.hotel_package_prices where hotel_id = $h and package_key = 'package_suite'")"
sql "delete from public.hotel_package_prices where hotel_id = $h and package_key = 'package_suite'"
expect_block "hotel price missing while the global price is not zero" local_run price-gate
psl="$(sql "select amount from public.pricing_settings where key = 'package_suite'")"
sql "delete from public.pricing_settings where key = 'package_suite'"
expect_ok    "missing on both sides counts as zero = zero"        local_run price-gate
sql "insert into public.pricing_settings (key, label, type, amount) values ('package_suite','s','package',$psl)"
sql "insert into public.hotel_package_prices (hotel_id, package_key, amount) values ($h, 'package_suite', $amt)"
expect_ok    "both restored"                                      local_run price-gate
sql "update public.hotel_package_prices set amount = 0 where hotel_id = $h and package_key = 'package_quad'"
expect_block "explicit zero in the hotel against a non-zero global" local_run price-gate
sql "update public.hotel_package_prices set amount = (select amount from public.pricing_settings where key='package_quad') where hotel_id = $h and package_key = 'package_quad'"
sql "insert into public.hotels (name) values ('فندق ثانٍ')"
expect_block "a second open-season hotel with no prices"          local_run price-gate
sql "insert into public.hotel_package_prices (hotel_id, package_key, amount) select h2.id, ps.key, ps.amount from public.hotels h2 join public.pricing_settings ps on ps.key like 'package%' where h2.name = 'فندق ثانٍ'"
expect_ok    "second hotel priced like the global prices"        local_run price-gate
sql "insert into public.passengers (name_ar, hotel_type) values ('اختبار بلا فندق', 'ثنائية')"
expect_block "a priced pilgrim without a requested hotel"         local_run price-gate
sql "delete from public.passengers where name_ar = 'اختبار بلا فندق'"
sql "delete from public.hotel_package_prices where hotel_id in (select id from public.hotels where name = 'فندق ثانٍ'); delete from public.hotels where name = 'فندق ثانٍ'"
expect_ok    "back to the released state"                         local_run price-gate

echo "═══ ٧) نطاقُ المرجع المُرسَل (git محلّيّ، بلا قاعدة) ═══"
WT="$OUT/wt"; mkdir -p "$WT"
commit_with() { # $1 = الأب، ثمّ أزواجُ <مسار>=<ملفّ محلّيّ> ← التزامٌ مؤقّت (لا فرع)
  local parent="$1"; shift; local idx="$OUT/scope.idx" pair
  GIT_INDEX_FILE="$idx" git read-tree "$parent"
  for pair in "$@"; do
    GIT_INDEX_FILE="$idx" git update-index --add --cacheinfo "100644,$(git hash-object -w "${pair#*=}"),${pair%%=*}"
  done
  git commit-tree "$(GIT_INDEX_FILE="$idx" git write-tree)" -p "$parent" -m "mod001 scope test" ; rm -f "$idx"
}
LTW=.github/workflows/mod001-loadtest-release.yml; PRW=.github/workflows/mod001-production-release.yml
TK=(supabase/verification/mod001/release_{target_guard.sh,run.sh,preflight.sql,fingerprint.sql,postcheck.sql,price_gate.sql})
TKP=(); for f in "$LTW" "$PRW" "${TK[@]}"; do TKP+=("$f=$f"); done
REG="$(commit_with origin/main "${TKP[@]}")"                     # main بعد تسجيل عُدّة الإطلاق وحدها
printf '# drift\n' | cat "$LTW" - > "$OUT/lt-drift.yml"
printf 'export const x = 1;\n' > "$OUT/fe.ts"
DRIFT="$(commit_with HEAD "$LTW=$OUT/lt-drift.yml")"
sed 's/^phase="${1:-}"$/phase="${1:-}"; [ "$phase" = scope ] \&\& exit 0/' "$R" > "$OUT/run-bypass.sh"
BYPASS="$(commit_with HEAD "$R=$OUT/run-bypass.sh")"            # سكربتٌ معدَّلٌ يتجاوز فحصَه
FRONT="$(commit_with HEAD "src/mod001-new-frontend.ts=$OUT/fe.ts")"
scope_at() { # $1 = الالتزام المُرسَل، $2 = الأساس
  local d="$WT/$1"; [ -d "$d" ] || git worktree add -q --detach "$d" "$1"
  MOD001_SCOPE_BASE="$2" OUT="$OUT" "$d/supabase/verification/mod001/release_run.sh" scope; }
expect_ok    "database-only release ref, workflows registered on main" scope_at "$(git rev-parse HEAD)" "$REG"
expect_block "workflows not registered on main"                   scope_at "$(git rev-parse HEAD)" origin/main
expect_block "dispatched workflow differs from the registered copy" scope_at "$DRIFT" "$REG"
expect_block "release ref carries frontend changes"               scope_at "$FRONT" "$REG"
grep -q 'exit 0' "$OUT/run-bypass.sh" || bad "bypass fixture was not built"
# خطوةُ سير العمل نفسُها (مستخرَجةً من YAML) هي التي تسبق أيَّ سكربتٍ من المرجع:
yaml_toolkit_step() { # $1 = ملفُّ سير العمل، $2 = الالتزام المُرسَل → يشغّل الخطوةَ في worktree له
  local d="$WT/$2"; [ -d "$d" ] || git worktree add -q --detach "$d" "$2"
  python3 -c 'import sys,yaml
for st in yaml.safe_load(open(sys.argv[1]))["jobs"]["release"]["steps"]:
    if st.get("name","").startswith("GATE: release toolkit equals"): print(st["run"])' "$1" \
    | sed "s#origin/main#$REG#g" > "$OUT/toolkit-step.sh"
  [ -s "$OUT/toolkit-step.sh" ] || { echo "toolkit step not found in $1"; return 1; }
  (cd "$d" && GITHUB_REF=refs/heads/release/mod-001-db GITHUB_SHA="$2" bash "$OUT/toolkit-step.sh"); }
for wf in "$LTW" "$PRW"; do
  expect_ok    "$(basename "$wf"): toolkit step passes on the release ref"     yaml_toolkit_step "$wf" "$(git rev-parse HEAD)"
  expect_block "$(basename "$wf"): toolkit step blocks a self-bypassing script" yaml_toolkit_step "$wf" "$BYPASS"
  expect_block "$(basename "$wf"): toolkit step blocks a drifted workflow"     yaml_toolkit_step "$wf" "$DRIFT"
done
expect_ok    "(why it must run first: the bypassing script passes its own scope)" \
  env MOD001_SCOPE_BASE="$REG" OUT="$OUT" "$WT/$BYPASS/$R" scope
for d in "$WT"/*; do git worktree remove --force "$d"; done

echo
echo "release gate tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
