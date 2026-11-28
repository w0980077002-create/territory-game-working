#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
output=${SIM_OUTPUT:-.tmp/economy-year}
mkdir -p "$output"

run_one() {
  local output=$1 minutes=$2 usd=$3 seed=$4 hero=$5
  local name="$minutes-$usd-$seed-$hero"
  node --import tsx scripts/sim/economy/year.ts "$minutes" "$usd" "$seed" "$hero" > "$output/$name.partial"
  mv "$output/$name.partial" "$output/$name.json"
}
export -f run_one
list_profiles() {
  if [[ -n "${SIM_PROFILES:-}" ]]; then
    for profile in $SIM_PROFILES; do
      IFS=: read -r minutes usd seed <<< "$profile"
      printf '%s %s %s %s berserker\n' "$output" "$minutes" "$usd" "$seed"
    done
    return
  fi
  for cohort in "90 0" "30 0" "180 0" "90 5" "90 20" "90 50" "90 100"; do
    for seed in ${SIM_SEEDS:-17 29 47}; do
      printf '%s %s %s berserker\n' "$output" "$cohort" "$seed"
    done
  done
}
list_profiles | xargs -n 5 -P "${SIM_JOBS:-2}" bash -c 'set -e; run_one "$@"' _
