begin;
do $$
declare
 players uuid[];
 actor uuid;
 team jsonb;
 chaos jsonb;
 room uuid;
 revision bigint;
 snapshot jsonb;
begin
 select array_agg(vvr.resolve_player((72000+i)::text,'Arena tester') order by i) into players
  from generate_series(1,8) i;
 assert not has_function_privilege('anon','public.vvr_arena_join(uuid,text)','EXECUTE');
 assert not has_function_privilege('authenticated','public.vvr_arena_checkpoint(uuid,bigint,jsonb,boolean)','EXECUTE');
 assert not has_table_privilege('service_role','vvr.arena_rooms','UPDATE');

 team:=public.vvr_arena_join(players[1],'team');
 room:=(team->>'id')::uuid;
 assert team->'players'=to_jsonb(players[1:1]);
 assert team->>'readyAt' is null;
 assert team=public.vvr_arena_join(players[1],'chaos');
 assert (public.vvr_arena_join(players[8],'team')->>'id')::uuid=room;
 assert public.vvr_arena_cancel(players[8],room);
 assert not public.vvr_arena_cancel(players[8],room);
 begin
  perform public.vvr_arena_room(players[8],room);
  raise exception 'unauthorized Arena room read';
 exception when insufficient_privilege then null;
 end;
 snapshot:=jsonb_build_object('id',room,'round',1);
 assert public.vvr_arena_checkpoint(room,0,snapshot,false) is null;
 foreach actor in array players[2:6] loop
  team:=public.vvr_arena_join(actor,'team');
  assert (team->>'id')::uuid=room;
 end loop;
 assert team->'players'=to_jsonb(players[1:6]);
 assert team->>'readyAt' is not null;
 assert not public.vvr_arena_cancel(players[2],room);
 assert (public.vvr_arena_join(players[7],'team')->>'id')::uuid<>room;
 chaos:=public.vvr_arena_join(players[8],'chaos');
 assert chaos->>'readyAt' is null;
 update vvr.arena_rooms set closes_at=clock_timestamp()-interval '1 sec' where id=(chaos->>'id')::uuid;
 assert public.vvr_arena_room(players[8],(chaos->>'id')::uuid)->>'readyAt' is not null;

 revision:=public.vvr_arena_checkpoint(room,0,snapshot,false);
 assert revision=1;
 assert public.vvr_arena_room(players[4],room)->'snapshot'=snapshot;
 assert public.vvr_arena_checkpoint(room,0,snapshot||'{"round":2}',true) is null;
 assert (public.vvr_arena_join(players[4],'chaos')->>'id')::uuid=room;
 assert public.vvr_arena_checkpoint(room,revision,snapshot||'{"round":3}',true)=2;
 assert public.vvr_arena_checkpoint(room,2,snapshot||'{"round":4}',false) is null;
 assert (public.vvr_arena_room(players[4],room)->'snapshot'->>'round')::int=3;
 assert (public.vvr_arena_join(players[4],'chaos')->>'id')::uuid<>(chaos->>'id')::uuid;
end;
$$;
rollback;
