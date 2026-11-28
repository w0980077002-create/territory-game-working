#!/usr/bin/env bash
# Probes the live W066 functions without credentials: each answer proves the deployed version
# knows the action (401 session_required) instead of rejecting it as unknown (400 invalid_request).
set -uo pipefail
base="${W066_FUNCTIONS:-https://cemifozgxyhnbknsexzt.supabase.co/functions/v1}"
failed=0
probe(){ # name url body expected-status expected-text
  local out status
  out=$(curl -s -m 20 -w '\n%{http_code}' -X POST "$2" -H 'content-type: application/json' -d "$3")
  status=${out##*$'\n'};out=${out%$'\n'*}
  if [[ "$status" == "$4" && "$out" == *"$5"* ]];then echo "| $1 | ok | $status $out |"
  else echo "| $1 | FAILED | $status $out (expected $4 $5) |";failed=1;fi
}
{
echo "| Check | Result | Answer |"
echo "|---|---|---|"
probe "community: unknown action rejected" "$base/vvr-community" '{"action":"no_such_action","body":{}}' 400 invalid_request
probe "community: analytics action deployed" "$base/vvr-community" '{"action":"track","body":{"events":[{}]}}' 401 session_required
probe "community: admin analytics deployed" "$base/vvr-community" '{"action":"admin_analytics","body":{}}' 401 session_required
probe "community: admin login deployed" "$base/vvr-community" '{"action":"admin_unlock","body":{"login":"x","password":"y"}}' 401 session_required
probe "community: Stars shop deployed" "$base/vvr-community" '{"action":"stars_offers","body":{}}' 401 session_required
probe "community: Stars webhook rejects unsigned calls" "$base/vvr-community/stars-webhook" '{}' 401 '{}'
probe "community: Arena policy route" "$base/vvr-community/arena-policy" '{}' 401 arena_publisher_required
probe "world boss: signature required" "$base/vvr-world-boss" '{"action":"state"}' 401 world_boss_auth_required
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
exit $failed
