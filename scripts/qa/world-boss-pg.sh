#!/usr/bin/env bash
# Runs the world boss SQL tests against a throw-away local PostgreSQL cluster (never a live database).
set -euo pipefail
bin=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
[ -n "$bin" ] || { echo "PostgreSQL binaries not found"; exit 1; }
dir=$(mktemp -d /tmp/vvr-wb-XXXX); port=${VVR_PG_PORT:-55433}
as() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$dir"
as "$bin/initdb -D $dir/data -A trust -U postgres >/dev/null"
as "$bin/pg_ctl -D $dir/data -o '-p $port -k $dir -c listen_addresses=' -l $dir/log -w start >/dev/null"
trap 'as "$bin/pg_ctl -D $dir/data -m fast stop >/dev/null" || true' EXIT
VVR_PG_HOST=$dir VVR_PG_PORT=$port npx tsx --test tests/pg/worldBoss.test.ts
