#!/usr/bin/env bash
# World boss end-to-end: scratch PostgreSQL + local server + game dev server + browser checks. Never a live database.
set -euo pipefail
bin=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
dir=$(mktemp -d /tmp/vvr-wb-e2e-XXXX); port=${VVR_PG_PORT:-55434}
as() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$dir"
as "$bin/initdb -D $dir/data -A trust -U postgres >/dev/null"
as "$bin/pg_ctl -D $dir/data -o '-p $port -k $dir -c listen_addresses=' -l $dir/log -w start >/dev/null"
pids=()
cleanup() { for p in "${pids[@]:-}"; do kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done; as "$bin/pg_ctl -D $dir/data -m fast stop >/dev/null" || true; }
trap cleanup EXIT
psql -X -q -h "$dir" -p "$port" -U postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end \$\$"
psql -X -q -v ON_ERROR_STOP=1 -h "$dir" -p "$port" -U postgres -f supabase/migrations/20261124155539_vvr_world_boss.sql
psql -X -q -h "$dir" -p "$port" -U postgres -c "insert into vvr.world_boss_admins values ('1')"
WB_PORT=18790 VVR_PG_HOST=$dir VVR_PG_PORT=$port setsid npx tsx scripts/qa/world-boss-local.ts >/tmp/vvr-wb-server.log 2>&1 & pids+=($!)
setsid npx vite --host 127.0.0.1 --port 5173 --strictPort >/tmp/vvr-wb-vite.log 2>&1 & pids+=($!)
for i in $(seq 1 60); do curl -sf http://127.0.0.1:5173/ >/dev/null && curl -s http://127.0.0.1:18790/local/init?id=1 >/dev/null && break; sleep 1; done
node scripts/qa/world-boss-ui.cjs
