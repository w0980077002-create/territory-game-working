-- Common W066 economy and #101 are both prerequisites.
create role vvr_hero_writer nologin nosuperuser nobypassrls;
grant usage on schema vvr to vvr_hero_writer;

create table vvr.hero_combat_stats (
  player_id uuid primary key references vvr.players(id),
  revision bigint not null check(revision>0),
  attack_power integer not null check(attack_power between 1 and 1000000)
);
alter table vvr.hero_combat_stats enable row level security;
revoke all on vvr.hero_combat_stats from public,anon,authenticated,service_role;

-- The trusted hero service publishes a monotonic revision after resolving owned gear and progression.
create function vvr.set_hero_attack(p_player uuid,p_revision bigint,p_attack integer)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
begin
  insert into vvr.hero_combat_stats values(p_player,p_revision,p_attack)
    on conflict(player_id) do update set revision=excluded.revision,attack_power=excluded.attack_power
      where vvr.hero_combat_stats.revision<excluded.revision;
  if found then return true; end if;
  if exists(select 1 from vvr.hero_combat_stats where player_id=p_player
    and revision=p_revision and attack_power<>p_attack) then
    raise exception 'hero_revision_conflict' using errcode='23505';
  end if;
  return false;
end;
$$;
revoke all on function vvr.set_hero_attack(uuid,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function vvr.set_hero_attack(uuid,bigint,integer) to vvr_hero_writer;

-- The existing boss balance remains the starter baseline. Modifiers are capped independently of item power.
create function vvr.world_boss_attack_multiplier(p_player uuid)
returns numeric language sql stable security invoker set search_path=pg_catalog
as $$
  select least(2.0,greatest(0.5,coalesce((select attack_power from vvr.hero_combat_stats
    where player_id=p_player),100)/100.0));
$$;
revoke all on function vvr.world_boss_attack_multiplier(uuid) from public,anon,authenticated,service_role;

-- Only a newly settled, server-generated hit enters the season. The event namespaces browser retry ids.
create function vvr.world_boss_score_hit()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  perform vvr.record_score(new.player_id,'world_boss_damage',
    md5(new.event_id::text||':'||new.request_id::text)::uuid,new.damage,new.hit_at);
  return new;
end;
$$;
revoke all on function vvr.world_boss_score_hit() from public,anon,authenticated,service_role;
create trigger world_boss_score_hit after insert on vvr.world_boss_hits
  for each row execute function vvr.world_boss_score_hit();

create or replace function public.vvr_world_boss_attack(p_telegram_id text, p_name text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_player uuid := vvr.resolve_player(p_telegram_id,vvr.world_boss_name(p_name));
  v_now timestamptz;
  v_day date;
  e vvr.world_boss_events%rowtype;
  prev vvr.world_boss_participants%rowtype;
  old vvr.world_boss_hits%rowtype;
  v_hits integer;
  v_damage bigint;
  v_crit boolean;
  v_kill boolean;
  v_name text := vvr.world_boss_name(p_name);
begin
  if p_request_id is null then raise exception 'world_boss_bad_request'; end if;
  -- Serialize every hit on the one shared HP pool (also two parallel taps of one account).
  select * into e from vvr.world_boss_events where status = 'open' for update;
  if not found then
    -- A retry of a request that already finished the boss still gets its stored result.
    select h.* into old from vvr.world_boss_hits h where h.player_id = v_player and h.request_id = p_request_id
      order by h.hit_at desc limit 1;
    if found then
      return public.vvr_world_boss_state(p_telegram_id) || jsonb_build_object('hit',
        jsonb_build_object('damage', old.damage, 'critical', old.critical, 'killing', old.killing, 'repeated', true));
    end if;
    raise exception 'world_boss_no_event';
  end if;
  v_now := clock_timestamp();
  v_day := (v_now at time zone 'UTC')::date;

  select * into old from vvr.world_boss_hits where event_id = e.id and player_id = v_player and request_id = p_request_id;
  if found then
    return public.vvr_world_boss_state(p_telegram_id) || jsonb_build_object('hit',
      jsonb_build_object('damage', old.damage, 'critical', old.critical, 'killing', old.killing, 'repeated', true));
  end if;

  if v_now >= e.ends_at then
    perform vvr.world_boss_expire_if_due(e.id);
    return public.vvr_world_boss_state(p_telegram_id) || jsonb_build_object('error', 'world_boss_event_ended');
  end if;
  if v_now < e.starts_at then raise exception 'world_boss_not_started'; end if;

  select * into prev from vvr.world_boss_participants where event_id = e.id and player_id = v_player;
  v_hits := case when prev.hit_day = v_day then coalesce(prev.hits_today, 0) else 0 end;
  if v_hits >= (e.config ->> 'dailyHits')::integer then raise exception 'world_boss_daily_limit'; end if;
  if prev.last_hit_at is not null
     and v_now < prev.last_hit_at + make_interval(secs => (e.config ->> 'cooldownSeconds')::integer) then
    raise exception 'world_boss_cooldown';
  end if;

  -- Resolve the roll using only the server's event settings and trusted hero revision.
  v_damage := (e.config ->> 'damageMin')::bigint
    + floor(random() * ((e.config ->> 'damageMax')::bigint - (e.config ->> 'damageMin')::bigint + 1))::bigint;
  v_crit := random() < (e.config ->> 'critChance')::numeric;
  if v_crit then v_damage := floor(v_damage * (e.config ->> 'critMultiplier')::numeric)::bigint; end if;
  v_damage := least(e.hp, greatest(1,floor(v_damage * vvr.world_boss_attack_multiplier(v_player))::bigint));
  v_kill := v_damage >= e.hp;

  insert into vvr.world_boss_participants (event_id, player_id, display_name, total_damage, total_hits, hit_day, hits_today, last_hit_at)
  values (e.id, v_player, v_name, v_damage, 1, v_day, 1, v_now)
  on conflict (event_id, player_id) do update
    set total_damage = vvr.world_boss_participants.total_damage + excluded.total_damage,
        total_hits = vvr.world_boss_participants.total_hits + 1,
        display_name = excluded.display_name,
        hit_day = v_day, hits_today = v_hits + 1, last_hit_at = v_now;
  insert into vvr.world_boss_hits (event_id, player_id, request_id, damage, critical, killing, hit_at)
  values (e.id, v_player, p_request_id, v_damage, v_crit, v_kill, v_now);

  if v_kill then
    update vvr.world_boss_events
       set hp = 0, status = 'defeated', finished_at = v_now, last_hit_player = v_player,
           last_hit_name = v_name, last_hit_damage = v_damage, updated_at = v_now
     where id = e.id;
    perform vvr.world_boss_settle(e.id);
  else
    update vvr.world_boss_events set hp = hp - v_damage, updated_at = v_now where id = e.id;
  end if;

  return public.vvr_world_boss_state(p_telegram_id) || jsonb_build_object('hit',
    jsonb_build_object('damage', v_damage, 'critical', v_crit, 'killing', v_kill, 'repeated', false));
end;
$$;
