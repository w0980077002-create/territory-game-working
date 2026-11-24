#!/usr/bin/env bash
set -euo pipefail
container="vvr-w066-qa-$$"
results=$(mktemp -d)
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$results"
}
trap cleanup EXIT
docker run --rm -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
# The image's temporary initialization server listens on a Unix socket only.
ready=false
for attempt in $(seq 1 40); do
  if docker exec "$container" pg_isready -q -h 127.0.0.1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  docker logs "$container" >&2
  exit 1
fi
pg() { docker exec -i "$container" psql -Xq -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres "$@"; }
pg -c 'create role anon; create role authenticated; create role service_role;'
for file in supabase/migrations/*.sql; do pg -1 < "$file"; done
pg < tests/pg/w066-community.sql
pg < tests/pg/w066-snapshots.sql
pg < tests/pg/w066-equipment.sql
pg < tests/pg/w066-arena-scores.sql
pg < tests/pg/w066-arena-rooms.sql
pg < tests/pg/w066-guild-rosters.sql
pg < tests/pg/w066-guild-boss-quests.sql
pg -c "select vvr.resolve_player((73000+i)::text,'Arena simultaneous client') from generate_series(0,39) i" >/dev/null
docker exec -i "$container" sh -c 'cat > /tmp/arena-join.sql' <<'SQL'
select public.vvr_arena_join(id,'chaos') from vvr.players where telegram_id=(73000+:client_id)::text;
SQL
docker exec "$container" pgbench -n -c 40 -j 4 -t 1 -U postgres -f /tmp/arena-join.sql postgres > "$results/arena"
grep -Fq 'number of transactions actually processed: 40/40' "$results/arena"
pg <<'SQL'
do $$
begin
 assert (select count(*) from vvr.arena_rooms)=1;
 assert (select count(*) from vvr.arena_room_seats)=40;
 assert (select ready_at is not null from vvr.arena_rooms);
end;
$$;
SQL
docker exec -i "$container" sh -c 'cat > /tmp/arena-checkpoint.sql' <<'SQL'
select public.vvr_arena_checkpoint(id,0,jsonb_build_object('id',id,'client',:client_id),false) from vvr.arena_rooms;
SQL
docker exec "$container" pgbench -n -c 40 -j 4 -t 1 -U postgres -f /tmp/arena-checkpoint.sql postgres > "$results/arena"
grep -Fq 'number of transactions actually processed: 40/40' "$results/arena"
pg <<'SQL'
do $$
begin
 assert (select revision=1 and (snapshot->>'client')::int between 0 and 39 from vvr.arena_rooms);
end;
$$;
SQL
node --import tsx scripts/qa/team-arena-rpc.ts "$container"
listing=$(pg -At <<'SQL'
select vvr.resolve_player('71001','Seller') as seller,
       vvr.resolve_player('71002','Buyer A') as buyer_a,
       vvr.resolve_player('71003','Buyer B') as buyer_b \gset
select vvr.issue_resource(:'buyer_a','fixtures','71000000-0000-0000-0000-000000000001','gold',100) as funded_a,
       vvr.issue_resource(:'buyer_b','fixtures','71000000-0000-0000-0000-000000000001','gold',100) as funded_b,
       vvr.issue_item(:'seller','fixtures','71000000-0000-0000-0000-000000000002','shield') as item \gset
select public.vvr_community(:'seller','trade',jsonb_build_object('kind','list',
  'operationId',gen_random_uuid(),'itemId',:'item','price',60))->>'listingId';
SQL
)
buy() {
  pg -At -v listing="$listing" -v telegram="$1" <<'SQL'
select id from vvr.players where telegram_id=:'telegram' \gset
set role service_role;
select public.vvr_community(:'id','trade',jsonb_build_object('kind','buy',
 'operationId',gen_random_uuid(),'listingId',:'listing'));
SQL
}
buy 71002 > "$results/a" 2>&1 & first=$!
buy 71003 > "$results/b" 2>&1 & second=$!
first_status=0; wait "$first" || first_status=$?
second_status=0; wait "$second" || second_status=$?
[[ "$first_status" == 0 && "$second_status" != 0 || "$first_status" != 0 && "$second_status" == 0 ]]
grep -q 'listing_unavailable' "$results"/{a,b}
pg <<'SQL'
do $$
begin
 assert (select balance from vvr.wallets w join vvr.players p on p.id=w.player_id where p.telegram_id='71001')=60;
 assert (select array_agg(balance order by balance) from vvr.wallets w join vvr.players p on p.id=w.player_id
   where p.telegram_id in ('71002','71003'))=array[40::bigint,100::bigint];
 assert (select count(*) from vvr.auction_listings where status='sold')=1;
end;
$$;
SQL
echo 'W066 Postgres: identity, grants, escrow race, moderation and ranking verified'
