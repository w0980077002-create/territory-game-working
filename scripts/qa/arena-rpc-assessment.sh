#!/usr/bin/env bash
set -euo pipefail
# Scratch-only assessment of the TERRITORY row-lock queue pattern and VVR combat checkpoints.
# This measures local SQL transactions, without hosted W066, Edge Functions or realtime delivery.
box="vvr-arena-assessment-$$"
cleanup(){ docker rm -f "$box" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$box" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
ready(){
 for attempt in $(seq 1 35); do
  if docker exec "$box" pg_isready -q -h 127.0.0.1; then return; fi
  sleep 1
 done
 return 1
}
ready
pg(){ docker exec -i "$box" psql -Xq -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres "$@"; }
pg <<'SQL'
create table public.assessment_rooms(
 id bigint generated always as identity primary key,
 capacity int not null,
 coordinated boolean not null default false,
 seats int not null default 0 check(seats between 0 and capacity),
 version int not null default 0,
 snapshot jsonb not null default '{}'
);
create table public.assessment_entrants(actor bigint generated always as identity primary key,room_id bigint not null references public.assessment_rooms);
create index on public.assessment_rooms(coordinated,capacity,id) where seats<capacity;
create function public.assessment_join(p_capacity int,p_coordinated boolean) returns bigint language plpgsql as $$
declare room bigint;
begin
 -- Coordinate new placements within one mode. Room mutations retain their independent row lock.
 if p_coordinated then perform pg_advisory_xact_lock(1081,p_capacity); end if;
 select r.id into room from public.assessment_rooms r
 where r.coordinated=p_coordinated and r.capacity=p_capacity and r.seats<r.capacity
 order by r.id limit 1 for update skip locked;
 if not found then
  insert into public.assessment_rooms(capacity,coordinated) values(p_capacity,p_coordinated) returning id into room;
 end if;
 update public.assessment_rooms set seats=seats+1 where id=room;
 insert into public.assessment_entrants(room_id) values(room);
 return room;
end;
$$;
insert into public.assessment_rooms(capacity) values(2);
SQL
for coordinated in false true; do
 for capacity in 2 6 40; do
  docker exec -i "$box" sh -c 'cat > /tmp/join.sql' <<SQL
select public.assessment_join($capacity,$coordinated);
SQL
  echo "Admission load, $capacity seats, coordinated: $coordinated"
  docker exec "$box" pgbench -n -M prepared -c "$capacity" -j 2 -t 20 -U postgres -f /tmp/join.sql postgres |
    awk '/transactions actually processed|number of failed transactions|latency average|tps =/'
 done
done
pg -At <<'SQL'
do $$
begin
 assert (select count(*) from public.assessment_entrants)=1920;
 assert not exists(select from public.assessment_rooms r
  where r.seats<>(select count(*) from public.assessment_entrants e where e.room_id=r.id));
 assert (select count(*) from public.assessment_rooms where coordinated)=60;
 assert not exists(select from public.assessment_rooms where coordinated and seats<>capacity);
end;
$$;
select capacity||' seats, coordinated='||coordinated||': '||count(*) filter(where seats=capacity)||' full rooms, '||
 count(*) filter(where seats>0 and seats<capacity)||' partially filled rooms'
from public.assessment_rooms group by coordinated,capacity order by coordinated,capacity;
SQL
node --import tsx scripts/qa/arena-rpc-resume.ts "$box" seed
docker restart "$box" >/dev/null
ready
node --import tsx scripts/qa/arena-rpc-resume.ts "$box" resume
docker exec -i "$box" sh -c 'cat > /tmp/update.sql' <<'SQL'
begin;
select version from public.assessment_rooms where id=1 for update;
update public.assessment_rooms
 set version=version+1,snapshot=jsonb_set(snapshot,'{version}',to_jsonb(version+1)) where id=1;
commit;
SQL
for clients in 2 6 40; do
 echo "Shared room write load, $clients clients"
 docker exec "$box" pgbench -n -M prepared -c "$clients" -j 2 -T 4 -U postgres -f /tmp/update.sql postgres |
   awk '/transactions actually processed|number of failed transactions|latency average|tps =/'
done
[[ $(pg -At -c "select version=(snapshot->>'version')::integer from public.assessment_rooms where id=1;") == t ]]
echo 'Snapshot version matches committed room version'
