create table vvr.arena_rooms (
 id uuid primary key default gen_random_uuid(),
 mode text not null check (mode in ('team','chaos')),
 opened_at timestamptz not null,
 closes_at timestamptz not null,
 ready_at timestamptz,
 finished_at timestamptz,
 revision bigint not null default 0,
 snapshot jsonb
);
create index arena_rooms_waiting on vvr.arena_rooms(mode,opened_at,id) where ready_at is null;
create table vvr.arena_room_seats (
 room_id uuid not null references vvr.arena_rooms(id),
 player_id uuid not null references vvr.players(id),
 hero text not null check (hero in ('berserker','ranger','runologist')),
 attack_power integer not null,
 seat integer not null check (seat between 0 and 39),
 released boolean not null default false,
 outcome text check (outcome in ('win','loss')),
 primary key (room_id,seat),
 unique (room_id,player_id)
);
create unique index arena_one_active_seat on vvr.arena_room_seats(player_id) where not released;
create index arena_room_seats_player on vvr.arena_room_seats(player_id,room_id);
alter table vvr.arena_rooms enable row level security;
alter table vvr.arena_room_seats enable row level security;
revoke all on vvr.arena_rooms,vvr.arena_room_seats from public,anon,authenticated,service_role;

create function vvr.arena_room_state(p_room uuid) returns jsonb
 language sql stable security invoker set search_path=pg_catalog
as $$
 select jsonb_build_object('id',r.id,'mode',r.mode,'closesAt',r.closes_at,'readyAt',r.ready_at,
  'finishedAt',r.finished_at,'revision',r.revision,'snapshot',r.snapshot,'players',coalesce((
   select jsonb_agg(s.player_id order by s.seat) from vvr.arena_room_seats s where s.room_id=r.id
  ),'[]'::jsonb),'roster',coalesce((
   select jsonb_agg(jsonb_build_object('id',s.player_id,'name',p.display_name,'hero',s.hero,
    'attackPower',s.attack_power,
    'rankAwarded',case when s.outcome='win' then exists(select 1 from vvr.score_events score
     where score.player_id=s.player_id and score.metric='arena_wins'
      and score.source_id=md5(r.id::text||s.player_id::text)::uuid) else false end) order by s.seat) from vvr.arena_room_seats s
   join vvr.players p on p.id=s.player_id where s.room_id=r.id
  ),'[]'::jsonb)) from vvr.arena_rooms r where r.id=p_room;
$$;

-- Queue locking is per mode and never covers combat updates in existing rooms.
create function public.vvr_arena_join(p_player uuid,p_mode text,p_hero text default 'berserker') returns jsonb
 language plpgsql security definer set search_path=pg_catalog
as $$
declare
 room uuid;
 next_seat integer;
 seat_count integer;
 capacity integer;
 joined_at timestamptz;
begin
 if p_player is null or p_mode is null or p_mode not in ('team','chaos') or
    p_hero is null or p_hero not in ('berserker','ranger','runologist') then
  raise exception 'arena_invalid_queue' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_player::text,10910));
 select s.room_id into room from vvr.arena_room_seats s where s.player_id=p_player and not s.released;
 if found then return vvr.arena_room_state(room); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_mode,10911));
 joined_at:=clock_timestamp();
 capacity:=case p_mode when 'team' then 6 else 40 end;
 select r.id into room from vvr.arena_rooms r
  where r.mode=p_mode and r.ready_at is null and r.closes_at>joined_at
  order by r.opened_at,r.id limit 1 for update;
 if not found then
  insert into vvr.arena_rooms(mode,opened_at,closes_at)
   values(p_mode,joined_at,joined_at+make_interval(secs=>case p_mode when 'team' then 20 else 30 end))
   returning id into room;
 end if;
 select count(*) into seat_count from vvr.arena_room_seats s where s.room_id=room;
 select n into next_seat from generate_series(0,capacity-1) n
  where not exists(select 1 from vvr.arena_room_seats s where s.room_id=room and s.seat=n) order by n limit 1;
 insert into vvr.arena_room_seats(room_id,player_id,seat,hero,attack_power)
  values(room,p_player,next_seat,p_hero,vvr.hero_attack(p_player));
 if seat_count+1=capacity then update vvr.arena_rooms set ready_at=joined_at where id=room; end if;
 return vvr.arena_room_state(room);
end;
$$;

create function public.vvr_arena_room(p_player uuid,p_room uuid) returns jsonb
 language plpgsql security definer set search_path=pg_catalog
as $$
begin
 if not exists(select 1 from vvr.arena_room_seats s join vvr.arena_rooms r on r.id=s.room_id
  where s.room_id=p_room and s.player_id=p_player and (r.finished_at is null or r.finished_at>clock_timestamp()-interval '30 minutes')) then
  raise exception 'arena_not_member' using errcode='42501';
 end if;
 -- On an expired search the game server completes the roster with bots.
 update vvr.arena_rooms set ready_at=closes_at where id=p_room and ready_at is null and closes_at<=clock_timestamp();
 return vvr.arena_room_state(p_room);
end;
$$;

create function public.vvr_arena_cancel(p_player uuid,p_room uuid) returns boolean
 language plpgsql security definer set search_path=pg_catalog
as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_player::text,10910));
 perform 1 from vvr.arena_rooms where id=p_room and ready_at is null and closes_at>clock_timestamp() for update;
 if not found then return false; end if;
 delete from vvr.arena_room_seats where room_id=p_room and player_id=p_player;
 if not found then return false; end if;
 delete from vvr.arena_rooms where id=p_room and not exists(select 1 from vvr.arena_room_seats where room_id=p_room);
 return true;
end;
$$;

create function public.vvr_arena_current(p_player uuid) returns jsonb
 language sql stable security definer set search_path=pg_catalog
as $$
 select vvr.arena_room_state(r.id)
  from vvr.arena_room_seats s join vvr.arena_rooms r on r.id=s.room_id
  where s.player_id=p_player and (not s.released or r.finished_at>now()-interval '30 minutes')
  order by s.released,r.opened_at desc limit 1;
$$;

create function public.vvr_arena_podium(p_player uuid) returns jsonb
 language sql stable security definer set search_path=pg_catalog
as $$
 select vvr.ranking_state(p_player,'arena_wins',null)||jsonb_build_object(
  'points',coalesce((select sum(t.points) from vvr.season_totals t join vvr.seasons s on s.id=t.season_id
   where t.player_id=p_player and t.metric='arena_wins' and now()>=s.starts_at and now()<s.ends_at),0),
  'wins',(select count(*) from vvr.score_events where player_id=p_player and metric='arena_wins'),
  'teamLosses',(select count(*) from vvr.arena_room_seats where player_id=p_player and outcome='loss'));
$$;

-- The game server builds the snapshot from trusted state. A competing writer
-- reloads and retries the command when its prior revision has already changed.
create function public.vvr_arena_checkpoint(p_room uuid,p_revision bigint,p_snapshot jsonb,p_finished boolean)
 returns bigint language plpgsql security definer set search_path=pg_catalog
as $$
declare
 new_revision bigint;
 result_time timestamptz;
 ranked boolean;
 member record;
begin
 if p_finished is null or p_revision is null or p_revision<0 or jsonb_typeof(p_snapshot) is distinct from 'object'
   or p_snapshot->>'id' is distinct from p_room::text then
  raise exception 'arena_invalid_checkpoint' using errcode='22023';
 end if;
 update vvr.arena_rooms set revision=revision+1,snapshot=p_snapshot,
   finished_at=coalesce(finished_at,case when p_finished then clock_timestamp() end)
  where id=p_room and revision=p_revision and ready_at is not null and (
   finished_at is null or (
    not p_finished and finished_at>clock_timestamp()-interval '30 minutes' and
    snapshot-'chat'-'messageId'-'updatedAt'-'players'=p_snapshot-'chat'-'messageId'-'updatedAt'-'players' and
    (select jsonb_agg(f-'sequence'-'lastChatAt') from jsonb_array_elements(snapshot->'players') f)=
    (select jsonb_agg(f-'sequence'-'lastChatAt') from jsonb_array_elements(p_snapshot->'players') f)))
  returning revision,finished_at into new_revision,result_time;
 if new_revision is not null and p_finished then
  -- A full, completed human fight is the only source of team ranking points.
  ranked:= p_snapshot#>>'{result,reason}' in ('hp','time') and p_snapshot#>>'{result,winner}' in ('0','1')
   and not exists(select 1 from jsonb_array_elements(p_snapshot->'players') fighter
    where fighter->>'bot'='true' or fighter->>'fought' is distinct from 'true')
   and (select count(*) from vvr.arena_room_seats s where s.room_id=p_room and exists
    (select 1 from jsonb_array_elements(p_snapshot->'players') fighter where fighter->>'id'=s.player_id::text))
     =(select case mode when 'team' then 6 else 40 end from vvr.arena_rooms where id=p_room)
   and jsonb_array_length(p_snapshot->'players')=
     (select case mode when 'team' then 6 else 40 end from vvr.arena_rooms where id=p_room);
  update vvr.arena_room_seats set released=true where room_id=p_room;
  if ranked then
   for member in select s.player_id,fighter->>'side'=p_snapshot#>>'{result,winner}' as won
    from vvr.arena_room_seats s join lateral jsonb_array_elements(p_snapshot->'players') fighter
    on fighter->>'id'=s.player_id::text where s.room_id=p_room order by s.player_id loop
    update vvr.arena_room_seats set outcome=case when member.won then 'win' else 'loss' end
     where room_id=p_room and player_id=member.player_id;
    if member.won then
     perform vvr.record_score(member.player_id,'arena_wins',md5(p_room::text||member.player_id::text)::uuid,1,result_time);
    end if;
   end loop;
  end if;
 end if;
 return new_revision;
end;
$$;

revoke all on function vvr.arena_room_state(uuid),public.vvr_arena_join(uuid,text,text),public.vvr_arena_room(uuid,uuid),
 public.vvr_arena_current(uuid),public.vvr_arena_podium(uuid),public.vvr_arena_cancel(uuid,uuid),public.vvr_arena_checkpoint(uuid,bigint,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.vvr_arena_join(uuid,text,text),public.vvr_arena_room(uuid,uuid),
 public.vvr_arena_current(uuid),public.vvr_arena_podium(uuid),public.vvr_arena_cancel(uuid,uuid),public.vvr_arena_checkpoint(uuid,bigint,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
