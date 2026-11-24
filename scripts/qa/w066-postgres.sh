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
for attempt in $(seq 1 40); do
  if docker exec "$container" pg_isready -q; then break; fi
  sleep 1
done
pg() { docker exec -i "$container" psql -Xq -v ON_ERROR_STOP=1 -U postgres "$@"; }
pg -c 'create role anon; create role authenticated; create role service_role;'
for file in supabase/migrations/*.sql; do pg -1 < "$file"; done
pg < tests/pg/w066-community.sql
pg < tests/pg/w066-snapshots.sql
pg < tests/pg/w066-guild-rosters.sql
pg < tests/pg/w066-guild-boss-quests.sql
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
