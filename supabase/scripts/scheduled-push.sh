#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  تفعيلُ الدفع المجدوَل (M5) في نشر العميل، والتحقّقُ منه — لسير عمل
#  Customer Backend Setup.
#
#  ما يحتاجه `push-dispatch` ليعمل (ترحيلة 20261020211932):
#    · pg_net وpg_cron ومهمّة m5-push-dispatch — من الترحيلات نفسها.
#    · في Vault: `push_dispatch_url` (عنوانُ دالّة هذا المشروع) و`push_dispatch_token`.
#    · سرُّ الدالّة `PUSH_DISPATCH_TOKEN` بالقيمة نفسها، ونشرُ `push-dispatch`
#      (verify_jwt = false في config.toml)، وأسرارُ VAPID التي يستعملها الدفعُ الفوريّ.
#
#  الرمز: يُولَّد **داخل القاعدة** (gen_random_bytes) فلا يظهر في نصّ جملةٍ ولا في
#  مُعامِل. يُقرأ مرّةً واحدة ليُضبط سرَّ الدالّة، ويُخفى في السجلّ قبل أيّ شيء.
#  ولا قيمةَ في المستودع ولا في GitHub Secrets.
#
#  prepare: يضبط عنوانَ Vault دائماً. ثم إن كان الطريقُ كلُّه سليماً (فحصٌ من القاعدة
#           عبر pg_net إلى الدالّة المنشورة) يُبقي الرمز؛ وإلا يولّد رمزاً جديداً في
#           Vault ويخرجه (rotate=true، token=…) ليضبطه سرَّ الدالّة. استبدالُ الرمز
#           لا يمسّ جهازاً ولا حاجّاً: لا يستعمله إلا المُجدوِل.
#  verify:  بوّابةٌ إلزاميّة — لا نجاحَ ما دام الدفعُ المجدوَل غيرَ مفعَّل:
#           الدالّة ACTIVE بلا JWT · السرّ موجود · المهمّة بعينها ومفعّلة وتنجح ·
#           Vault صالحٌ وعنوانُه لهذا المشروع · وفحصٌ من القاعدة يصل الدالّةَ ويُصادَق (200).
#
#  البيئة: API · PROJECT_REF · SUPABASE_ACCESS_TOKEN · RUNNER_TEMP (و GITHUB_OUTPUT لـprepare).
#  لا يطبع رمزاً ولا ردّاً كاملاً: حالاتٌ وأعدادٌ فقط.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

JOB="m5-push-dispatch"
JOB_SCHEDULE="* * * * *"
JOB_COMMAND="SELECT public.push_dispatch_tick();"
PROBE_WAIT="${PROBE_WAIT:-45}"     # ثوانٍ لردّ pg_net على الفحص
CRON_WAIT="${CRON_WAIT:-90}"       # ثوانٍ لتشغيلٍ منتهٍ من pg_cron

# stderr: most calls run inside $(…), whose stdout is captured
fail() { echo "::error::$*" >&2; exit 1; }

[[ "${PROJECT_REF:-}" =~ ^[a-z0-9]{20}$ ]] || fail "SUPABASE_PROJECT_REF is not a Supabase project ref (20 lowercase letters or digits)."
URL="https://$PROJECT_REF.supabase.co/functions/v1/push-dispatch"
AUTH=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")

# sql <query>: rows as JSON on stdout. On failure the database's own message is shown.
sql() {
  local body="$RUNNER_TEMP/sp-sql.json" out="$RUNNER_TEMP/sp-sql.out" code
  jq -n --arg q "$1" '{query:$q}' > "$body"
  code="$(curl -sS -o "$out" -w '%{http_code}' "${AUTH[@]}" -H "Content-Type: application/json" \
    -X POST "$API/projects/$PROJECT_REF/database/query" --data-binary @"$body")" || {
      rm -f "$body" "$out"; fail "Could not reach the Supabase Management API."; }
  rm -f "$body"
  if [[ ! "$code" =~ ^2 ]]; then
    local msg; msg="$(jq -r '.message // empty' "$out" 2>/dev/null || true)"
    rm -f "$out"; fail "Database query returned HTTP $code: ${msg:-no message}"
  fi
  cat "$out"; rm -f "$out"
}

# api_get <path> <file>: Management API GET into a file.
api_get() {
  curl --fail-with-body -sS "${AUTH[@]}" "$API/projects/$PROJECT_REF$1" -o "$2" || {
    fail "Could not read $1 from the Management API: $(jq -r '.message // empty' "$2" 2>/dev/null || true)"; }
}

function_state() {   # prints: absent | active | inactive | jwt (deployed but verify_jwt is not false)
  api_get /functions "$RUNNER_TEMP/sp-functions.json"
  jq -r 'map(select(.slug == "push-dispatch")) | if length == 0 then "absent"
         elif .[0].status != "ACTIVE" then "inactive" elif .[0].verify_jwt != false then "jwt" else "active" end' \
    "$RUNNER_TEMP/sp-functions.json"
  rm -f "$RUNNER_TEMP/sp-functions.json"
}

secret_present() {   # names only; the list never carries a value
  api_get /secrets "$RUNNER_TEMP/sp-secrets.json"
  local r; r="$(jq -r 'type == "array" and any(.[]; .name == "PUSH_DISPATCH_TOKEN")' "$RUNNER_TEMP/sp-secrets.json")"
  rm -f "$RUNNER_TEMP/sp-secrets.json"; [ "$r" = true ]
}

target_state() {     # valid | url (valid token, URL for another project) | missing
  sql "select case when not exists (select 1 from public._push_dispatch_target()) then 'missing'
                   when (select url from public._push_dispatch_target()) <> '$URL' then 'url'
                   else 'valid' end as s" | jq -r '.[0].s'
}

# probe: the database sends one probe through pg_net to the deployed function, as the scheduler
# would: the same target (Vault URL and token, validated by _push_dispatch_target()), the same body
# and header as push_dispatch_probe(). It is sent here rather than through push_dispatch_probe()
# because that function discards pg_net's request id, and only the id identifies THIS probe's
# response among concurrent pg_net traffic (net._http_response.id = the request id). The token
# stays in the database: it is read by the statement itself, never returned.
# The probe counts what is due and delivers nothing.
# Prints: ok | not_configured | http_<code> | error | timeout
probe() {
  local id row
  id="$(sql "select net.http_post(
                      url := d.url,
                      body := '{\"mode\":\"probe\"}'::jsonb,
                      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-dispatch-token', d.token),
                      timeout_milliseconds := 10000) as id
               from public._push_dispatch_target() d" | jq -r '.[0].id // empty')"
  [ -n "$id" ] || { echo "not_configured"; return 0; }
  [[ "$id" =~ ^[0-9]+$ ]] || fail "Unexpected pg_net request id: $id"
  for _ in $(seq 1 "$PROBE_WAIT"); do
    row="$(sql "select status_code, coalesce(content, '') ~ '\"mode\"[[:space:]]*:[[:space:]]*\"probe\"' as is_probe,
                       (timed_out is true or error_msg is not null) as failed
                  from net._http_response where id = $id")"
    if jq -e 'length == 1' <<<"$row" >/dev/null; then
      if jq -e '.[0].status_code == 200 and .[0].is_probe' <<<"$row" >/dev/null; then echo ok
      elif jq -e '.[0].status_code != null and .[0].status_code != 200' <<<"$row" >/dev/null; then echo "http_$(jq -r '.[0].status_code' <<<"$row")"
      elif jq -e '.[0].failed' <<<"$row" >/dev/null; then echo error
      else echo "http_200_unexpected"; fi
      return 0
    fi
    sleep 1
  done
  echo timeout
}

probe_message() {
  case "$1" in
    not_configured) echo "Vault does not hold a valid push_dispatch_url and push_dispatch_token for this project." ;;
    http_401) echo "push-dispatch rejected the token (HTTP 401): the PUSH_DISPATCH_TOKEN function secret does not match Vault push_dispatch_token." ;;
    http_503) echo "push-dispatch has no valid PUSH_DISPATCH_TOKEN function secret (HTTP 503)." ;;
    http_404) echo "push-dispatch is not deployed at the Vault URL (HTTP 404)." ;;
    http_200_unexpected) echo "push-dispatch answered the probe with HTTP 200 but not as a probe." ;;
    http_*)   echo "push-dispatch answered the probe with HTTP ${1#http_}." ;;
    error)    echo "pg_net could not reach push-dispatch (network error or timeout)." ;;
    timeout)  echo "No answer to the probe within ${PROBE_WAIT}s: pg_net did not deliver it." ;;
    *)        echo "Unexpected probe result: $1" ;;
  esac
}

prepare() {
  # The URL names this project only; it is not a secret.
  sql "do \$\$ begin
         if exists (select 1 from vault.secrets where name = 'push_dispatch_url') then
           perform vault.update_secret((select id from vault.secrets where name = 'push_dispatch_url'), '$URL');
         else
           perform vault.create_secret('$URL', 'push_dispatch_url', 'Scheduled push: URL of this project''s push-dispatch function');
         end if;
       end \$\$" >/dev/null

  local fn target result=""
  fn="$(function_state)"
  target="$(target_state)"
  if [ "$fn" = active ] && [ "$target" = valid ] && secret_present; then
    result="$(probe)"
    if [ "$result" = ok ]; then
      echo "rotate=false" >> "$GITHUB_OUTPUT"
      echo "Scheduled push: the existing dispatch token works end to end; it is kept."
      return 0
    fi
  fi
  echo "Scheduled push: generating a new dispatch token (function: $fn · Vault: $target${result:+ · probe: $result})."

  # Generated in the database: the value never appears in a statement or parameter.
  sql "do \$\$
       declare v text;
       begin
         loop
           v := replace(replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');
           exit when v !~ '^(sb_|eyJ)' and (select count(distinct c) from regexp_split_to_table(v, '') c) >= 16;
         end loop;
         if exists (select 1 from vault.secrets where name = 'push_dispatch_token') then
           perform vault.update_secret((select id from vault.secrets where name = 'push_dispatch_token'), v);
         else
           perform vault.create_secret(v, 'push_dispatch_token', 'Scheduled push: token for push-dispatch (same value as its PUSH_DISPATCH_TOKEN secret)');
         end if;
       end \$\$" >/dev/null

  local token
  token="$(sql "select decrypted_secret as token from vault.decrypted_secrets where name = 'push_dispatch_token'" | jq -r '.[0].token // empty')"
  [ -n "$token" ] && echo "::add-mask::$token"
  [[ "$token" =~ ^[A-Za-z0-9_-]{43,128}$ ]] || fail "The new dispatch token could not be read back from Vault."
  [ "$(target_state)" = valid ] || fail "Vault does not hold a valid dispatch URL and token after writing them."
  { echo "rotate=true"; echo "token=$token"; } >> "$GITHUB_OUTPUT"
  echo "Scheduled push: new dispatch token stored in Vault; it is set as the PUSH_DISPATCH_TOKEN function secret next."
}

verify() {
  local fn target rows st result
  fn="$(function_state)"
  case "$fn" in
    active) ;;
    absent)   fail "Scheduled push is not active: push-dispatch is not deployed." ;;
    inactive) fail "Scheduled push is not active: push-dispatch is not ACTIVE." ;;
    jwt)      fail "Scheduled push is not active: push-dispatch must be deployed with verify_jwt = false (supabase/config.toml)." ;;
  esac
  secret_present || fail "Scheduled push is not active: the PUSH_DISPATCH_TOKEN function secret is missing. Run this workflow again."

  rows="$(sql "select count(*)::int as n,
                      bool_and(schedule = '$JOB_SCHEDULE' and command = '$JOB_COMMAND' and active
                               and username = current_user and database = current_database()) as ok
                 from cron.job where jobname = '$JOB'")"
  [ "$(jq -r '.[0].n' <<<"$rows")" = 1 ] || fail "Scheduled push is not active: expected exactly one pg_cron job $JOB, found $(jq -r '.[0].n' <<<"$rows")."
  [ "$(jq -r '.[0].ok' <<<"$rows")" = true ] || fail "Scheduled push is not active: pg_cron job $JOB is not the approved schedule and command, or is disabled."

  target="$(target_state)"
  case "$target" in
    valid) ;;
    url)     fail "Scheduled push is not active: Vault push_dispatch_url does not point to this project's push-dispatch. Run this workflow again." ;;
    *)       fail "Scheduled push is not active: Vault push_dispatch_url / push_dispatch_token are missing or invalid. Run this workflow again." ;;
  esac

  # pg_cron really runs the job, and its latest finished run succeeded.
  st=""
  for _ in $(seq 1 "$CRON_WAIT"); do
    st="$(sql "select coalesce((select d.status from cron.job_run_details d join cron.job j using (jobid)
                                 where j.jobname = '$JOB' and d.status in ('succeeded', 'failed')
                                   and d.start_time > now() - interval '5 minutes'
                                 order by d.start_time desc limit 1), '') as s" | jq -r '.[0].s')"
    [ -n "$st" ] && break
    sleep 1
  done
  [ -n "$st" ] || fail "Scheduled push is not active: pg_cron has not run $JOB within ${CRON_WAIT}s."
  [ "$st" = succeeded ] || fail "Scheduled push is not active: the latest run of $JOB failed (see cron.job_run_details)."

  result="$(probe)"
  [ "$result" = ok ] || fail "Scheduled push is not active: $(probe_message "$result") Run this workflow again."
  echo "Scheduled push: active — pg_cron runs $JOB, and a probe from the database through pg_net reached push-dispatch and was authenticated."
}

case "${1:-}" in
  prepare) prepare ;;
  verify)  verify ;;
  *) fail "usage: scheduled-push.sh prepare|verify" ;;
esac
