-- Optional goal for an existing boss event. Event operators set the target and prize
-- through the trusted configuration path before the first hit.
create table vvr.guild_boss_quests (
  event_id uuid primary key references vvr.world_boss_events(id) on delete cascade,
  target_damage bigint not null check(target_damage>0),
  reward_gold integer not null check(reward_gold between 1 and 1000000000)
);

create table vvr.guild_boss_progress (
  event_id uuid not null references vvr.guild_boss_quests(event_id) on delete cascade,
  -- Keep earned contributions if a player leaves or their guild is later dissolved.
  guild_id uuid not null,
  player_id uuid not null references vvr.players(id),
  damage bigint not null check(damage>0),
  primary key (event_id,guild_id,player_id)
);
create index guild_boss_player on vvr.guild_boss_progress(player_id,event_id);
alter table vvr.guild_boss_quests enable row level security;
alter table vvr.guild_boss_progress enable row level security;
revoke all on vvr.guild_boss_quests,vvr.guild_boss_progress from public,anon,authenticated,service_role;

create function vvr.configure_guild_boss_quest(p_event uuid,p_target bigint,p_gold integer)
returns void language plpgsql security invoker set search_path=pg_catalog
as $$
declare
  max_damage bigint;
begin
  select max_hp into max_damage from vvr.world_boss_events where id=p_event and status='open' for update;
  if not found or p_target is null or p_target<1 or p_target>max_damage then
    raise exception 'invalid_guild_boss_target' using errcode='22023';
  end if;
  if exists(select from vvr.world_boss_participants where event_id=p_event) then
    raise exception 'guild_boss_already_started' using errcode='23505';
  end if;
  insert into vvr.guild_boss_quests values(p_event,p_target,p_gold);
end;
$$;

create function vvr.guild_boss_track_hit()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if exists(select from vvr.guild_boss_quests where event_id=new.event_id) then
    insert into vvr.guild_boss_progress(event_id,guild_id,player_id,damage)
      select new.event_id,m.guild_id,new.player_id,new.damage from vvr.guild_members m where m.player_id=new.player_id
      on conflict(event_id,guild_id,player_id) do update
        set damage=vvr.guild_boss_progress.damage+excluded.damage;
  end if;
  return new;
end;
$$;
create trigger guild_boss_track_hit after insert on vvr.world_boss_hits
  for each row execute function vvr.guild_boss_track_hit();

create function vvr.guild_boss_claim(p_player uuid,p_event uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog
as $$
declare
  target bigint;
  prize integer;
begin
  select target_damage,reward_gold into target,prize from vvr.guild_boss_quests where event_id=p_event;
  if not found then raise exception 'guild_boss_quest_missing' using errcode='22023'; end if;
  if not exists(
    select from vvr.guild_boss_progress mine
    where mine.event_id=p_event and mine.player_id=p_player and target<=(
      select sum(all_hits.damage) from vvr.guild_boss_progress all_hits
      where all_hits.event_id=mine.event_id and all_hits.guild_id=mine.guild_id
    )
  ) then raise exception 'guild_boss_goal_incomplete' using errcode='23505'; end if;

  return jsonb_build_object('firstClaim',vvr.issue_resource(p_player,'guild_boss_quest',p_event,'gold',prize));
end;
$$;

revoke all on function vvr.configure_guild_boss_quest(uuid,bigint,integer),vvr.guild_boss_track_hit(),vvr.guild_boss_claim(uuid,uuid)
  from public,anon,authenticated,service_role;

create function vvr.guild_boss_quest_feed(p_player uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog
as $$
  select coalesce(jsonb_agg(quest order by begins desc,id),'[]'::jsonb) from (
    select e.id,e.starts_at begins,jsonb_build_object(
      'id',e.id,'name',e.title,'target',q.target_damage,'gold',q.reward_gold,
      'damage',coalesce(t.damage,0),'canClaim',coalesce(t.eligible,false) and r.player_id is null,
      'claimed',r.player_id is not null
    ) quest
    from vvr.guild_boss_quests q join vvr.world_boss_events e on e.id=q.event_id
    left join vvr.guild_members me on me.player_id=p_player
    left join vvr.resource_receipts r on r.player_id=p_player
      and r.source_kind='guild_boss_quest' and r.source_id=e.id
    left join lateral (
      select max(total) damage, bool_or(contributed and total>=q.target_damage) eligible,
        bool_or(contributed) contributed
      from (
        select sum(g.damage) total, bool_or(g.player_id=p_player) contributed
        from vvr.guild_boss_progress g where g.event_id=e.id
        group by g.guild_id
        having g.guild_id=me.guild_id or bool_or(g.player_id=p_player)
      ) groups
    ) t on true
    where coalesce(t.contributed,false) or (me.guild_id is not null and e.status='open')
    order by e.starts_at desc,e.id limit 25
  ) feed;
$$;
revoke all on function vvr.guild_boss_quest_feed(uuid) from public,anon,authenticated,service_role;

create or replace function vvr.guild_community(p_player uuid,p_action text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if p_player is null or not exists(select from vvr.players where id=p_player) then
    raise exception 'verified_player_required' using errcode='42501';
  end if;
  case p_action
    when 'guild' then
      return vvr.guild_state(p_player)||jsonb_build_object('quests',vvr.guild_boss_quest_feed(p_player));
    when 'guild_roster' then
      perform vvr.change_guild_roster(p_player,p_body->>'kind',(p_body->>'guild')::uuid,
        (p_body->>'applicant')::uuid,p_body->>'name');
      return vvr.guild_state(p_player)||jsonb_build_object('quests',vvr.guild_boss_quest_feed(p_player));
    when 'guild_boss_claim' then
      return vvr.guild_boss_claim(p_player,(p_body->>'eventId')::uuid);
    else raise exception 'invalid_guild_action' using errcode='22023';
  end case;
end;
$$;
