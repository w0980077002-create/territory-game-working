begin;
set local plpgsql.check_asserts=on;
insert into vvr.seasons(name,starts_at,ends_at) values('Railway Arena test',now()-interval '1 day',now()+interval '1 day');
insert into vvr.arena_publishers values('railway',repeat('a',64)) on conflict(name) do update set token_hash=excluded.token_hash;
do $$
declare
 match_id uuid:=gen_random_uuid();
 mixed uuid:=gen_random_uuid();
 at timestamptz:=date_trunc('milliseconds',clock_timestamp());
 members jsonb;
 winner uuid;
 loser uuid;
 podium jsonb;
begin
 select jsonb_agg(jsonb_build_object('telegram',n::text,'name','Railway '||n,'side',n%2,
  'hero',case when n=84502 then 'runologist' when n=84504 then 'ranger' else 'berserker' end,'fought',true,'rankEligible',true) order by n) into members from generate_series(84501,84506) n;
 assert public.vvr_ingest_arena_team(repeat('a',64),match_id,'team',at-interval '20 seconds',at,'hp',0,members);
 assert public.vvr_ingest_arena_team(repeat('a',64),match_id,'team',at-interval '20 seconds',at,'hp',0,members);
 select p.id into winner from vvr.players p where p.telegram_id='84502';
 select p.id into loser from vvr.players p where p.telegram_id='84501';
 assert (select count(*) from vvr.score_events s where s.metric='arena_wins' and
  s.player_id in (select player_id from vvr.arena_room_seats where room_id=match_id))=3;
 assert (select outcome from vvr.arena_room_seats where room_id=match_id and player_id=loser)='loss';
 assert (select vvr.brotherhood_arena_completed(r,winner) from vvr.arena_rooms r where r.id=match_id)=at;
 assert public.vvr_arena_current(winner) is null;
 podium:=public.vvr_arena_podium(winner);
 assert podium->>'serverNow' is not null and podium#>>'{season,name}'='Railway Arena test';
 assert jsonb_array_length(podium->'heroes')=3 and podium->'heroes' @> '["runologist","ranger","berserker"]'::jsonb;
 assert (select bool_and(
  case row.value->>'name' when 'Railway 84502' then 'runologist' when 'Railway 84504' then 'ranger' else 'berserker' end
   =podium->'heroes'->>(row.ordinality::int-1))
  from jsonb_array_elements(podium->'rows') with ordinality as row(value,ordinality));
 assert public.vvr_ingest_arena_team(repeat('a',64),mixed,'team',at-interval '20 seconds',at,'hp',0,jsonb_build_array(members->0,members->1));
 assert not exists(select from vvr.arena_room_seats where room_id=mixed and outcome is not null);
 assert (select vvr.brotherhood_arena_completed(r,winner) from vvr.arena_rooms r where r.id=mixed)=at;
 begin
  perform public.vvr_ingest_arena_team(repeat('z',64),gen_random_uuid(),'team',at,at,'hp',0,members);
  raise exception 'expected invalid publisher rejection';
 exception when insufficient_privilege then null;
 end;
end;
$$;
rollback;
