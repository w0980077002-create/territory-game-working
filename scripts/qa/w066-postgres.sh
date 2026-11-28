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
pg < tests/pg/w066-arena-railway.sql
pg < tests/pg/w066-arena-potions.sql
pg < tests/pg/w066-arena-consumables.sql
pg < tests/pg/w066-admin-access.sql
pg < tests/pg/w066-admin-password.sql
pg < tests/pg/w066-analytics.sql
pg < tests/pg/w066-stars.sql
pg -c "update vvr.network_features set enabled=true where name='premium_shop';"
pg < tests/pg/w066-premium-wallet.sql
pg < tests/pg/w066-assortment.sql
pg <<'SQL'
select vvr.resolve_player('84682','Premium purchase race') as player \gset
select public.vvr_premium_credit(:'player','11111111-aaaa-4111-8111-111111111111',10);
SQL
buy_premium() {
  pg -At -v operation="$1" <<'SQL'
select id from vvr.players where telegram_id='84682' \gset
set role service_role;
select public.vvr_premium_wallet(:'id',:'operation','horn-10')->>'status';
SQL
}
buy_premium '11111111-aaaa-4111-8111-111111111112' > "$results/premium-buy-a" & first=$!
buy_premium '11111111-aaaa-4111-8111-111111111113' > "$results/premium-buy-b" & second=$!
wait "$first"
wait "$second"
test "$(sort "$results/premium-buy-a" "$results/premium-buy-b")" = "$(printf 'insufficient\nok')"
pg <<'SQL'
do $$
declare player uuid:=(select id from vvr.players where telegram_id='84682');
begin
 assert (select count(*) from vvr.premium_purchase_orders where player_id=player)=1;
 assert (select balance from vvr.wallets where player_id=player and resource='horn')=10;
end;
$$;
update vvr.network_features set enabled=false where name='premium_shop';
SQL
pg <<'SQL'
insert into vvr.arena_publishers values('railway',repeat('9',64))
 on conflict(name) do update set token_hash=excluded.token_hash;
select vvr.resolve_player('84621','Arena purchase race') as player \gset
insert into vvr.wallets(player_id,resource,balance) values(:'player','gold',72);
SQL
buy_arena() {
  pg -At -v operation="$1" <<'SQL'
set role service_role;
select public.vvr_arena_consumables(repeat('9',64),'84621','Arena purchase race',:'operation',1,36,'tear')->>'status';
SQL
}
buy_arena '11111111-bbbb-4111-9111-111111111111' > "$results/arena-buy-a" & first=$!
buy_arena '11111111-bbbb-4111-9111-111111111111' > "$results/arena-buy-b" & second=$!
wait "$first"
wait "$second"
test "$(cat "$results/arena-buy-a" "$results/arena-buy-b")" = "$(printf 'ok\nok')"
buy_arena '22222222-bbbb-4222-9222-222222222222' > "$results/arena-buy-a" & first=$!
buy_arena '33333333-bbbb-4333-9333-333333333333' > "$results/arena-buy-b" & second=$!
wait "$first"
wait "$second"
test "$(sort "$results/arena-buy-a" "$results/arena-buy-b")" = "$(printf 'insufficient\nok')"
pg <<'SQL'
do $$
declare result jsonb:=public.vvr_arena_consumables(repeat('9',64),'84621','Arena purchase race');
begin
 assert result->'issued'->>'tear'='2' and result->>'gold'='0';
end;
$$;
SQL
pg < tests/pg/w066-guild-rosters.sql
pg < tests/pg/w066-guild-boss-quests.sql
pg < tests/pg/w066-brotherhood.sql
pg < tests/pg/w066-campaign-proof.sql
pg < tests/pg/w066-brotherhood-ledger.sql
pg < tests/pg/w066-brotherhood-solo.sql
pg < tests/pg/w066-referrals.sql
pg <<'SQL'
select vvr.resolve_player('79811','Proof race inviter') as inviter \gset
select public.vvr_resolve_referred_player('79812','Proof race invitee',:'inviter') as invitee \gset
update vvr.referrals set confirmed_at=clock_timestamp()-interval '1 min' where invitee_id=:'invitee';
select public.vvr_campaign_boss_begin(:'invitee',gen_random_uuid(),'berserker');
update vvr.campaign_boss_attempts set started_at=clock_timestamp()-interval '15 sec' where player_id=:'invitee';
SQL
finish_campaign() {
  pg -At <<'SQL'
select b.id as ticket,b.player_id as actor from vvr.campaign_boss_attempts b
  join vvr.players p on p.id=b.player_id where p.telegram_id='79812' \gset
set role service_role;
select public.vvr_campaign_boss_finish(:'actor',:'ticket',370)->>'status';
SQL
}
pg <<'SQL'
select b.id as ticket,b.player_id as actor from vvr.campaign_boss_attempts b
  join vvr.players p on p.id=b.player_id where p.telegram_id='79812' \gset
set role service_role;
select public.vvr_campaign_boss_check(:'actor',:'ticket')->>'status';
SQL
finish_campaign > "$results/campaign-a" & first=$!
finish_campaign > "$results/campaign-b" & second=$!
wait "$first"
wait "$second"
test "$(cat "$results/campaign-a" "$results/campaign-b")" = "$(printf 'verified\nverified')"
pg <<'SQL'
do $$
begin
 assert (select count(*)=2 from vvr.brotherhood_awards a join vvr.players p on p.id=a.invitee_id
  where p.telegram_id='79812' and a.kind='welcome');
end;
$$;
SQL
pg <<'SQL'
select vvr.resolve_player('79411','Concurrency inviter') as inviter \gset
select public.vvr_resolve_referred_player('79412','Concurrency friend',:'inviter') as invitee \gset
insert into vvr.brotherhood_awards(invitee_id,recipient_id,kind,tier,payload)
  select :'invitee',:'invitee','welcome',1,rewards#>'{welcome,invitee}' from vvr.brotherhood_settings;
SQL
claim_brotherhood() {
  pg -At <<'SQL'
select a.id as award,a.recipient_id as player from vvr.brotherhood_awards a
  join vvr.players p on p.id=a.recipient_id where p.telegram_id='79412' \gset
set role service_role;
select public.vvr_brotherhood_claim(:'player',:'award');
SQL
}
claim_brotherhood > "$results/brotherhood-a" & first=$!
claim_brotherhood > "$results/brotherhood-b" & second=$!
wait "$first"
wait "$second"
cmp "$results/brotherhood-a" "$results/brotherhood-b"
pg <<'SQL'
do $$
declare recipient uuid := (select id from vvr.players where telegram_id='79412');
begin
  assert (select count(*) from vvr.resource_receipts where source_kind='brotherhood' and player_id=recipient)=6;
  assert (select balance from vvr.wallets where resource='horn' and player_id=recipient)=20;
end;
$$;
SQL
register_referral() {
  pg -At -v inviter="$1" <<'SQL'
select id from vvr.players where telegram_id=:'inviter' \gset
set role service_role;
select public.vvr_resolve_referred_player('79207','Simultaneous referral',:'id');
SQL
}
register_referral 79201 > "$results/referral-a" & first=$!
register_referral 79202 > "$results/referral-b" & second=$!
wait "$first"
wait "$second"
cmp "$results/referral-a" "$results/referral-b"
award_referral() {
  pg -At <<'SQL'
select vvr.issue_referral_reward(id,'gold',11) from vvr.players where telegram_id='79207';
SQL
}
award_referral > "$results/reward-a" & first=$!
award_referral > "$results/reward-b" & second=$!
wait "$first"
wait "$second"
test "$(sort "$results/reward-a" "$results/reward-b")" = "$(printf 'f\nt')"
pg <<'SQL'
do $$
declare invitee uuid := (select id from vvr.players where telegram_id='79207');
begin
  assert (select count(*) from vvr.players where telegram_id='79207')=1;
  assert (select count(*) from vvr.referrals where invitee_id=invitee)=1;
  assert (select count(*) from vvr.resource_receipts where source_kind='referral' and source_id=invitee)=1;
  assert (select receipt.player_id=r.inviter_id and receipt.amount=11
    from vvr.resource_receipts receipt join vvr.referrals r on r.invitee_id=receipt.source_id
    where receipt.source_kind='referral' and r.invitee_id=invitee);
  assert (select sum(balance) from vvr.wallets w join vvr.players p on p.id=w.player_id
    where p.telegram_id in ('79201','79202') and w.resource='gold')=18;
end;
$$;
SQL
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
pg <<'SQL'
select vvr.resolve_player('78101','Enhancement concurrency') as actor \gset
select vvr.issue_resource(:'actor','fixtures',gen_random_uuid(),'gold',1000);
select vvr.issue_item(:'actor','fixtures',gen_random_uuid(),'world-boss-trophy');
SQL
upgrade() {
 pg -At <<'SQL'
select p.id as actor,i.id as item from vvr.players p
 join vvr.network_items i on i.owner_id=p.id where p.telegram_id='78101' \gset
set role service_role;
select public.vvr_enhance_item(:'actor',:'item',0,'78101000-0000-0000-0000-000000000001');
SQL
}
upgrade > "$results/upgrade-a" & first=$!
upgrade > "$results/upgrade-b" & second=$!
wait "$first"
wait "$second"
cmp "$results/upgrade-a" "$results/upgrade-b"
pg <<'SQL'
do $$
begin
 assert (select i.enhancement_rank from vvr.network_items i join vvr.players p on i.owner_id=p.id
  where p.telegram_id='78101')=1;
 assert (select w.balance from vvr.wallets w join vvr.players p on w.player_id=p.id
  where p.telegram_id='78101' and w.resource='gold')=900;
end;
$$;
SQL
pg < tests/pg/w066-brotherhood-activity.sql
finish_oath_room() {
  pg -At -v room="$1" <<'SQL'
select player_id from vvr.arena_room_seats where room_id=:'room' \gset
set role service_role;
select public.vvr_arena_checkpoint(:'room',0,jsonb_build_object('id',:'room',
 'result',jsonb_build_object('reason','hp','winner',0,'finishedAt',floor(extract(epoch from clock_timestamp())*1000)),
 'players',jsonb_build_array(jsonb_build_object('id',:'player_id','fought',true,'side',0),
  jsonb_build_object('id','bot-1','bot',true,'fought',true,'side',1))),true);
SQL
}
finish_oath_room 79700000-0000-4000-8000-000000000001 > "$results/oath-a" & first=$!
finish_oath_room 79700000-0000-4000-8000-000000000002 > "$results/oath-b" & second=$!
wait "$first"
wait "$second"
test "$(cat "$results/oath-a")" = 1
test "$(cat "$results/oath-b")" = 1
pg <<'SQL'
do $$
declare
  inviter uuid:=(select id from vvr.players where telegram_id='79701');
  invitee uuid:=(select id from vvr.players where telegram_id='79702');
  record_id uuid;
begin
  assert public.vvr_referrals(invitee,null)#>>'{brotherhood,incoming,days}'='1';
  assert public.vvr_referrals(inviter,null)#>>'{brotherhood,active}'='1';
  assert (select count(*) from vvr.brotherhood_awards where invitee_id=invitee and kind='oath')=2;
  assert not exists(select from vvr.score_events where player_id in (inviter,invitee));
  for record_id in select id from vvr.brotherhood_awards where invitee_id=invitee and kind='oath' loop
    assert (select public.vvr_brotherhood_claim(recipient_id,record_id)->>'status' from vvr.brotherhood_awards where id=record_id)='received';
    assert (select public.vvr_brotherhood_claim(recipient_id,record_id)->>'status' from vvr.brotherhood_awards where id=record_id)='received';
  end loop;
  assert (select count(*) from vvr.resource_receipts where player_id in (inviter,invitee) and source_kind='brotherhood' and amount=10)=2;
end;
$$;
SQL
echo 'W066 Postgres: identity, grants, escrow race, moderation and ranking verified'
