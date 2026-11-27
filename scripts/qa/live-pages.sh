#!/usr/bin/env bash
# Waits until the published page serves the entry bundle of this build (CDN refresh), then loads it.
set -uo pipefail
page="$1";built="$2"
want=$(grep -o 'assets/index-[^"]*\.js' "$built/index.html" | head -1)
[[ -n "$want" ]] || { echo "no entry bundle in the build"; exit 1; }
for attempt in $(seq 1 24);do
  live=$(curl -fsSL -m 20 "${page}?check=${GITHUB_SHA:-manual}-$attempt" | grep -o 'assets/index-[^"]*\.js' | head -1)
  if [[ "$live" == "$want" ]];then
    code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "${page%/}/$want")
    echo "| Published page | ok | serves $want (HTTP $code) after $attempt check(s) |" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
    [[ "$code" == 200 ]] && exit 0 || exit 1
  fi
  sleep 15
done
echo "| Published page | FAILED | serves ${live:-nothing}, expected $want |" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
exit 1
