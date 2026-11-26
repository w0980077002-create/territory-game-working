set local lock_timeout = '5s';

-- Railway publishes the terminal result only. The historic rooms, podium,
-- source IDs and Brotherhood trigger keep the same settlement semantics.
create function public.vvr_ingest_arena_team(
 p_token_hash text,p_match uuid,p_mode text,p_started timestamptz,p_finished timestamptz,
 p_reason text,p_winner integer,p_members jsonb
) returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare
 member record;
 player uuid;
 capacity integer;
 seat integer:=0;
 ranked boolean;
 published_players jsonb:='[]'::jsonb;
begin
 if not exists(select from vvr.arena_publishers where name='railway' and token_hash=p_token_hash) then
  raise exception 'arena_publisher_required' using errcode='42501';
 end if;
 capacity:=case p_mode when 'team' then 6 when 'chaos' then 40 end;
 if capacity is null or p_match is null or p_started is null or p_finished is null
    or p_finished<p_started or p_finished>clock_timestamp()+interval '5 seconds'
    or p_reason is null or p_reason not in ('hp','time','afk') or (p_winner is not null and p_winner not in (0,1))
    or jsonb_typeof(p_members) is distinct from 'array' then
  raise exception 'arena_invalid_result' using errcode='22023';
 end if;
 if jsonb_array_length(p_members) not between 2 and capacity then
  raise exception 'arena_invalid_roster' using errcode='22023';
 end if;

 insert into vvr.arena_rooms(id,mode,opened_at,closes_at,ready_at)
 values(p_match,p_mode,p_started,p_started,p_started)
 on conflict(id) do nothing;
 if not found then
  return exists(select from vvr.arena_rooms where id=p_match and mode=p_mode and finished_at=p_finished);
 end if;
 ranked:=jsonb_array_length(p_members)=capacity and p_winner is not null and p_reason in ('hp','time')
  and not exists(select from jsonb_array_elements(p_members) f where
   f->'fought' is distinct from 'true'::jsonb or f->'rankEligible' is distinct from 'true'::jsonb);

 for member in select * from jsonb_to_recordset(p_members) as f(
  telegram text,name text,hero text,side integer,fought boolean,"rankEligible" boolean
 ) order by telegram loop
  if member.telegram is null or member.telegram!~'^[1-9][0-9]{0,15}$' or member.name is null
     or char_length(member.name) not between 1 and 32 or member.side is null or member.side not in (0,1)
     or member.hero is null or member.hero not in ('berserker','ranger','runologist') or member.fought is null then
   raise exception 'arena_invalid_member' using errcode='22023';
  end if;
  select id into player from vvr.players where telegram_id=member.telegram;
  if not found then player:=vvr.resolve_player(member.telegram,member.name); end if;
  insert into vvr.arena_room_seats(room_id,player_id,seat,hero,attack_power,released,outcome)
  values(p_match,player,seat,member.hero,vvr.hero_attack(player),true,
   case when ranked then case when member.side=p_winner then 'win' else 'loss' end end);
  published_players:=published_players||jsonb_build_array(jsonb_build_object('id',player,'fought',member.fought,'side',member.side));
  seat:=seat+1;
  if ranked and member.side=p_winner then
   perform vvr.record_score(player,'arena_wins',md5(p_match::text||player::text)::uuid,1,p_finished);
  end if;
 end loop;
 update vvr.arena_rooms set finished_at=p_finished,revision=1,
  snapshot=jsonb_build_object('terminalOnly',true,'id',p_match,'players',published_players,'result',
   jsonb_build_object('winner',p_winner,'reason',p_reason,'finishedAt',floor(extract(epoch from p_finished)*1000)::bigint))
 where id=p_match;
 return true;
end;
$$;

revoke all on function public.vvr_ingest_arena_team(text,uuid,text,timestamptz,timestamptz,text,integer,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.vvr_ingest_arena_team(text,uuid,text,timestamptz,timestamptz,text,integer,jsonb) to service_role;
-- Legacy Edge clients only resume snapshots that their combat runtime understands.
create or replace function public.vvr_arena_current(p_player uuid) returns jsonb
 language sql stable security definer set search_path=pg_catalog
as $$
 select vvr.arena_room_state(r.id)
  from vvr.arena_room_seats s join vvr.arena_rooms r on r.id=s.room_id
  where s.player_id=p_player and (not s.released or r.finished_at>now()-interval '30 minutes')
   and (r.snapshot->'terminalOnly') is distinct from 'true'::jsonb
  order by s.released,r.opened_at desc limit 1;
$$;

notify pgrst,'reload schema';
