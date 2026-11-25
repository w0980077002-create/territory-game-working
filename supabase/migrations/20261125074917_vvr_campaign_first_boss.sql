set local lock_timeout='5s';

-- Proof attempts are scoped to the existing W066 identity. They are
-- separate from Solo backups and never contain a submitted hero or save.
create table vvr.campaign_boss_attempts (
  player_id uuid primary key references vvr.players(id),
  id uuid not null unique default gen_random_uuid(),
  client_attempt uuid not null,
  hero text not null check(hero in ('berserker','ranger','runologist')),
  seed bigint not null check(seed between 0 and 4294967295),
  started_at timestamptz not null,
  checked_at timestamptz,
  verified_at timestamptz
);
alter table vvr.campaign_boss_attempts enable row level security;
revoke all on vvr.campaign_boss_attempts from public,anon,authenticated,service_role,vvr_reward_writer;

create or replace function vvr.brotherhood_activity_days(p_player uuid,p_since timestamptz)
returns setof date language sql stable set search_path=pg_catalog
as $$
  select q.utc_day from vvr.brotherhood_quest_completions q
    where q.player_id=p_player and q.completed_at>=p_since
  union
  select (proof.at at time zone 'UTC')::date
    from vvr.arena_room_seats s join vvr.arena_rooms r on r.id=s.room_id
    cross join lateral (select vvr.brotherhood_arena_completed(r,p_player) as at) proof
    where s.player_id=p_player and r.finished_at>=p_since and proof.at>=p_since
  union
  select (b.verified_at at time zone 'UTC')::date
    from vvr.campaign_boss_attempts b where b.player_id=p_player and b.verified_at>=p_since;
$$;

create function public.vvr_campaign_boss_begin(p_player uuid,p_client uuid,p_hero text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  attempt vvr.campaign_boss_attempts;
  opened timestamptz:=clock_timestamp();
begin
  if p_client is null or p_hero is null or p_hero not in ('berserker','ranger','runologist') then
    raise exception 'campaign_proof_invalid_attempt' using errcode='22023';
  end if;
  -- The account lock serializes even the first attempt, before its row exists.
  perform 1 from vvr.players where id=p_player for no key update;
  if not found then return jsonb_build_object('status','ineligible'); end if;
  select * into attempt from vvr.campaign_boss_attempts where player_id=p_player for update;
  if found then
    if attempt.verified_at is not null then return jsonb_build_object('status','verified'); end if;
    if attempt.client_attempt=p_client and opened<=attempt.started_at+interval '30 minutes' then
      return jsonb_build_object('status','started','ticket',attempt.id);
    end if;
    if opened<attempt.started_at+interval '1 second' then
      return jsonb_build_object('status','retry','afterMs',1000);
    end if;
  end if;
  insert into vvr.campaign_boss_attempts(player_id,client_attempt,hero,seed,started_at)
    values(p_player,p_client,p_hero,('x'||substr(md5(gen_random_uuid()::text),1,8))::bit(32)::bigint,opened)
  on conflict(player_id) do update set id=excluded.id,client_attempt=excluded.client_attempt,hero=excluded.hero,
    seed=excluded.seed,started_at=excluded.started_at,checked_at=null
  returning * into attempt;
  return jsonb_build_object('status','started','ticket',attempt.id);
end;
$$;

create function public.vvr_campaign_boss_check(p_player uuid,p_ticket uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  attempt vvr.campaign_boss_attempts;
  checked timestamptz:=clock_timestamp();
begin
  select * into attempt from vvr.campaign_boss_attempts where player_id=p_player and id=p_ticket for update;
  if not found then return jsonb_build_object('status','ineligible'); end if;
  if attempt.verified_at is not null then return jsonb_build_object('status','verified'); end if;
  if checked>attempt.started_at+interval '30 minutes' then return jsonb_build_object('status','expired'); end if;
  if checked<attempt.started_at+interval '3 seconds' or checked<attempt.checked_at+interval '1 second' then
    return jsonb_build_object('status','retry','afterMs',3000);
  end if;
  update vvr.campaign_boss_attempts set checked_at=checked where player_id=p_player;
  return jsonb_build_object('status','check','hero',attempt.hero,'seed',attempt.seed,
    'startedAt',floor(extract(epoch from attempt.started_at)*1000));
end;
$$;

-- Called solely by the authenticated Edge worker after it replays the fight.
-- Award rows capture the existing reward configuration for both participants.
create function public.vvr_campaign_boss_finish(p_player uuid,p_ticket uuid,p_victory_ticks integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  attempt vvr.campaign_boss_attempts;
  pair vvr.referrals;
  elapsed integer;
  required_delay integer;
  finished timestamptz:=clock_timestamp();
begin
  if p_victory_ticks is null or p_victory_ticks not between 1 and 1600 then
    raise exception 'campaign_proof_invalid_outcome' using errcode='22023';
  end if;
  select * into attempt from vvr.campaign_boss_attempts where player_id=p_player and id=p_ticket for update;
  if not found then return jsonb_build_object('status','ineligible'); end if;
  if attempt.verified_at is not null then return jsonb_build_object('status','verified'); end if;
  if finished>attempt.started_at+interval '30 minutes' then return jsonb_build_object('status','expired'); end if;
  if attempt.checked_at is null then raise exception 'campaign_proof_not_checked' using errcode='42501'; end if;
  elapsed:=floor(extract(epoch from finished-attempt.started_at)*1000)::integer;
  -- Each simulation tick is 50 ms. The existing game allows speed x2.
  required_delay:=p_victory_ticks*25-elapsed;
  if required_delay>0 then return jsonb_build_object('status','retry','afterMs',required_delay+150); end if;
  insert into vvr.brotherhood_awards(invitee_id,recipient_id,kind,tier,payload,earned_at)
    select referral.invitee_id,gift.recipient,'welcome',1,gift.payload,finished
    from vvr.referrals referral cross join vvr.brotherhood_settings settings
    cross join lateral (values (referral.invitee_id,settings.rewards#>'{welcome,invitee}'),
      (referral.inviter_id,settings.rewards#>'{welcome,inviter}')) gift(recipient,payload)
    where referral.invitee_id=p_player and referral.confirmed_at<=attempt.started_at
    on conflict(invitee_id,recipient_id,kind,tier) do nothing;
  update vvr.campaign_boss_attempts set verified_at=finished where player_id=p_player;
  for pair in select r.* from vvr.referrals r
    where (r.inviter_id=p_player or r.invitee_id=p_player) and r.confirmed_at<=finished
    order by r.invitee_id
  loop
    perform vvr.brotherhood_oath_earned(pair);
  end loop;
  return jsonb_build_object('status','verified');
end;
$$;

revoke all on function public.vvr_campaign_boss_begin(uuid,uuid,text),
  public.vvr_campaign_boss_check(uuid,uuid),public.vvr_campaign_boss_finish(uuid,uuid,integer)
  from public,anon,authenticated,service_role,vvr_reward_writer;
grant execute on function public.vvr_campaign_boss_begin(uuid,uuid,text),
  public.vvr_campaign_boss_check(uuid,uuid),public.vvr_campaign_boss_finish(uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
