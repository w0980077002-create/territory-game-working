begin;
set local plpgsql.check_asserts=on;
insert into vvr.arena_publishers values('railway',repeat('a',64)) on conflict(name) do update set token_hash=excluded.token_hash;
do $$
declare
 player uuid:=vvr.resolve_player('84601','Arena consumer');
 purchase uuid:=gen_random_uuid();
 matchid uuid:=gen_random_uuid();
 result_at timestamptz:=date_trunc('milliseconds',clock_timestamp());
 members jsonb:=jsonb_build_array(jsonb_build_object('telegram','84601','name','Arena consumer','hero','ranger','fought',true));
begin
 insert into vvr.wallets(player_id,resource,balance) values(player,'gold',100);
 assert (public.vvr_arena_potions(repeat('a',64),'84601','Arena consumer')->>'issued')::int=0;
 assert (public.vvr_arena_potions(repeat('a',64),'84601','Arena consumer',purchase,1,30)->>'issued')::int=1;
 assert (public.vvr_arena_potions(repeat('a',64),'84601','Arena consumer',purchase,1,30)->>'issued')::int=1;
 assert (select balance from vvr.wallets where player_id=player and resource='gold')=70;
 assert public.vvr_arena_potions(repeat('a',64),'84601','Arena consumer',gen_random_uuid(),2,30)->>'status'='price_changed';
 assert public.vvr_arena_potions(repeat('a',64),'84601','Arena consumer',gen_random_uuid(),1,71)->>'status'='insufficient';
 begin
  perform public.vvr_arena_potions(repeat('a',64),'84601','Arena consumer',purchase,1,31);
  raise exception 'expected idempotency conflict';
 exception when unique_violation then null;
 end;

 assert public.vvr_ingest_arena_oath(repeat('a',64),matchid,'chaos',result_at-interval '41 seconds',result_at,'hp',members);
 assert public.vvr_ingest_arena_oath(repeat('a',64),gen_random_uuid(),'team',result_at-interval '30 seconds',result_at,'hp',members);
 assert (select count(*) from vvr.arena_local_oath_days where player_id=player)=1;
 assert (select count(*) from vvr.arena_room_seats where player_id=player)=1;
 assert (select vvr.brotherhood_arena_completed(r,player) from vvr.arena_rooms r where r.id=matchid)=result_at;
 assert not exists(select from vvr.score_events where player_id=player);
 assert not has_function_privilege('authenticated','public.vvr_arena_potions(text,text,text,uuid,integer,bigint)','execute');
 assert not has_function_privilege('authenticated','public.vvr_ingest_arena_oath(text,uuid,text,timestamptz,timestamptz,text,jsonb)','execute');
end;
$$;
rollback;
