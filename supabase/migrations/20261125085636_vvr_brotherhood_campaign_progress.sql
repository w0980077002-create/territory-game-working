set local lock_timeout='5s';

-- Only the replay worker supplies these checkpoints. A Solo upload never
-- updates this cursor. A new checkpoint always advances exactly one wave.
create table vvr.brotherhood_campaign (
  player_id uuid primary key references vvr.referrals(invitee_id),
  checkpoint jsonb not null check (jsonb_typeof(checkpoint)='object' and octet_length(checkpoint::text)<180000),
  stage integer not null check (stage>=2),
  wave integer not null check (wave between 1 and 5),
  hero_level integer not null check (hero_level>=1),
  ticket uuid,
  attempt uuid,
  hero text check (hero in ('berserker','ranger','runologist')),
  seed bigint check (seed between 0 and 4294967295),
  started_at timestamptz,
  checked_at timestamptz
);
alter table vvr.brotherhood_campaign enable row level security;
revoke all on vvr.brotherhood_campaign from public,anon,authenticated,service_role,vvr_reward_writer;
alter table vvr.brotherhood_awards drop constraint brotherhood_awards_kind_check,
  add constraint brotherhood_awards_kind_check check (kind in ('welcome','oath','level','legend'));
create unique index brotherhood_legend_once on vvr.brotherhood_awards(recipient_id,tier) where kind='legend';

create function vvr.brotherhood_campaign_awards(p_player uuid,p_level integer)
returns void language plpgsql set search_path=pg_catalog
as $$
declare
  pair vvr.referrals;
  qualified integer;
begin
  select * into pair from vvr.referrals where invitee_id=p_player;
  if not found then return; end if;
  insert into vvr.brotherhood_awards(invitee_id,recipient_id,kind,tier,payload)
    select p_player,member.id,'level',tier.key::integer,tier.value
    from vvr.brotherhood_settings s cross join lateral jsonb_each(s.rewards->'level') tier
    cross join (values (pair.inviter_id),(p_player)) member(id)
    where tier.key::integer<=p_level
    on conflict(invitee_id,recipient_id,kind,tier) do nothing;
  if p_level<20 then return; end if;
  -- Serialize simultaneous level-20 transitions from distinct referrals.
  perform pg_advisory_xact_lock(hashtextextended(pair.inviter_id::text,9120));
  select count(*) into qualified from vvr.referrals r
    join vvr.brotherhood_campaign c on c.player_id=r.invitee_id
    where r.inviter_id=pair.inviter_id and c.hero_level>=20;
  insert into vvr.brotherhood_awards(invitee_id,recipient_id,kind,tier,payload)
    select p_player,pair.inviter_id,'legend',tier.key::integer,tier.value->'resources'
    from vvr.brotherhood_settings s cross join lateral jsonb_each(s.rewards->'legend') tier
    where tier.key in ('1','3','5') and tier.key::integer<=qualified
    on conflict do nothing;
end;
$$;
revoke all on function vvr.brotherhood_campaign_awards(uuid,integer) from public,anon,authenticated,service_role,vvr_reward_writer;

create function public.vvr_campaign_progress_seed(p_player uuid,p_checkpoint jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
begin
  insert into vvr.brotherhood_campaign(player_id,checkpoint,stage,wave,hero_level)
    select a.player_id,p_checkpoint,2,1,(p_checkpoint->>'level')::integer
    from vvr.campaign_boss_attempts a join vvr.referrals r on r.invitee_id=a.player_id
    where a.player_id=p_player and a.verified_at is not null and r.confirmed_at<=a.started_at
      and p_checkpoint->>'stage'='2' and p_checkpoint->>'wave'='1'
    on conflict do nothing;
  return exists(select from vvr.brotherhood_campaign where player_id=p_player);
end;
$$;

create function public.vvr_campaign_progress_begin(p_player uuid,p_attempt uuid,p_hero text,p_stage integer,p_wave integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  progress vvr.brotherhood_campaign;
  opened timestamptz:=clock_timestamp();
  previous_hero text;
begin
  select * into progress from vvr.brotherhood_campaign where player_id=p_player for update;
  if not found then
    select a.hero into previous_hero from vvr.campaign_boss_attempts a
      join vvr.referrals r on r.invitee_id=a.player_id
      where a.player_id=p_player and a.verified_at is not null and r.confirmed_at<=a.started_at;
    return case when previous_hero is null then jsonb_build_object('status','ineligible')
      else jsonb_build_object('status','bootstrap','hero',previous_hero) end;
  end if;
  if (p_stage,p_wave)<(progress.stage,progress.wave) then return jsonb_build_object('status','verified'); end if;
  if (p_stage,p_wave)<>(progress.stage,progress.wave) then return jsonb_build_object('status','waiting',
    'stage',progress.stage,'wave',progress.wave); end if;
  if progress.attempt=p_attempt and opened<progress.started_at+interval '30 minutes' then
    return jsonb_build_object('status','started','ticket',progress.ticket);
  end if;
  if opened<progress.started_at+interval '1 second' then return jsonb_build_object('status','retry','afterMs',1000); end if;
  update vvr.brotherhood_campaign set attempt=p_attempt,hero=p_hero,ticket=gen_random_uuid(),
    seed=('x'||substr(md5(gen_random_uuid()::text),1,8))::bit(32)::bigint,started_at=opened,checked_at=null
    where player_id=p_player returning * into progress;
  return jsonb_build_object('status','started','ticket',progress.ticket);
end;
$$;

create function public.vvr_campaign_progress_check(p_player uuid,p_ticket uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  progress vvr.brotherhood_campaign;
  checked timestamptz:=clock_timestamp();
begin
  select * into progress from vvr.brotherhood_campaign where player_id=p_player and ticket=p_ticket for update;
  if not found then return jsonb_build_object('status','expired'); end if;
  if checked>=progress.started_at+interval '30 minutes' then return jsonb_build_object('status','expired'); end if;
  if checked<progress.started_at+interval '2 seconds' or checked<progress.checked_at+interval '1 second' then
    return jsonb_build_object('status','retry','afterMs',2000);
  end if;
  update vvr.brotherhood_campaign set checked_at=checked where player_id=p_player;
  return jsonb_build_object('status','check','checkpoint',progress.checkpoint,'hero',progress.hero,
    'seed',progress.seed,'startedAt',floor(extract(epoch from progress.started_at)*1000));
end;
$$;

create function public.vvr_campaign_progress_finish(p_player uuid,p_ticket uuid,p_ticks integer,p_checkpoint jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  progress vvr.brotherhood_campaign;
  finished timestamptz:=clock_timestamp();
  next_stage integer;
  next_wave integer;
  next_level integer;
  delay integer;
begin
  select * into progress from vvr.brotherhood_campaign where player_id=p_player and ticket=p_ticket for update;
  if not found or finished>=progress.started_at+interval '30 minutes' then
    return jsonb_build_object('status','expired');
  end if;
  if progress.checked_at is null or p_ticks is null or p_ticks not between 1 and 3600 then
    raise exception 'invalid_campaign_outcome' using errcode='22023';
  end if;
  delay:=p_ticks*25-floor(extract(epoch from finished-progress.started_at)*1000)::integer;
  if delay>0 then return jsonb_build_object('status','retry','afterMs',delay+150); end if;
  next_stage:=progress.stage+case when progress.wave=5 then 1 else 0 end;
  next_wave:=progress.wave%5+1;
  next_level:=(p_checkpoint->>'level')::integer;
  if (p_checkpoint->>'stage')::integer is distinct from next_stage
    or (p_checkpoint->>'wave')::integer is distinct from next_wave
    or next_level is null or next_level not between progress.hero_level and progress.hero_level+5 then
    raise exception 'invalid_campaign_checkpoint' using errcode='22023';
  end if;
  update vvr.brotherhood_campaign set checkpoint=p_checkpoint,stage=next_stage,wave=next_wave,
    hero_level=next_level,ticket=null,attempt=null,started_at=null,checked_at=null
    where player_id=p_player;
  if next_level>progress.hero_level then perform vvr.brotherhood_campaign_awards(p_player,next_level); end if;
  return jsonb_build_object('status','verified');
end;
$$;

revoke all on function public.vvr_campaign_progress_seed(uuid,jsonb),
  public.vvr_campaign_progress_begin(uuid,uuid,text,integer,integer),public.vvr_campaign_progress_check(uuid,uuid),
  public.vvr_campaign_progress_finish(uuid,uuid,integer,jsonb)
  from public,anon,authenticated,service_role,vvr_reward_writer;
grant execute on function public.vvr_campaign_progress_seed(uuid,jsonb),
  public.vvr_campaign_progress_begin(uuid,uuid,text,integer,integer),public.vvr_campaign_progress_check(uuid,uuid),
  public.vvr_campaign_progress_finish(uuid,uuid,integer,jsonb) to service_role;
create or replace function vvr.brotherhood_pair_state(p_pair vvr.referrals,p_player uuid)
returns jsonb language sql stable set search_path=pg_catalog
as $$
  select jsonb_build_object('id',p_pair.invitee_id,'inviterId',p_pair.inviter_id,
    'name',(select display_name from vvr.players where id=
      case when p_player=p_pair.invitee_id then p_pair.inviter_id else p_pair.invitee_id end),
    'verifiedLevel',coalesce((select hero_level from vvr.brotherhood_campaign where player_id=p_pair.invitee_id),0),
    'verifiedXp',coalesce((select (checkpoint->>'xp')::numeric from vvr.brotherhood_campaign where player_id=p_pair.invitee_id),0),
    'active',vvr.brotherhood_active(p_pair),'days',vvr.brotherhood_days(p_pair),
    'awards',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'tier',a.tier,
      'payload',a.payload,'received',vvr.brotherhood_received(a)) order by a.kind desc,a.tier)
      from vvr.brotherhood_awards a where a.invitee_id=p_pair.invitee_id and a.recipient_id=p_player and a.kind<>'legend'),'[]'::jsonb));
$$;

create or replace function public.vvr_referrals(p_player uuid,p_before uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with old_feed as (select vvr.referral_state(p_player,p_before) as feed)
  select old_feed.feed || jsonb_build_object('brotherhood',jsonb_build_object(
    'enabled',s.payouts_enabled,
    'rewards',jsonb_set(s.rewards,'{legend}',(s.rewards->'legend')-array['10','25','50']::text[]),
    'incoming',(select vvr.brotherhood_pair_state(r,p_player) from vvr.referrals r where r.invitee_id=p_player),
    'outgoing',coalesce((select jsonb_agg(vvr.brotherhood_pair_state(r,p_player) order by entries.position)
      from jsonb_array_elements(old_feed.feed->'rows') with ordinality entries(entry,position)
      join vvr.referrals r on r.invitee_id=(entries.entry->>'id')::uuid and r.inviter_id=p_player),'[]'::jsonb),
    'invited',(select count(*) from vvr.referrals r where r.inviter_id=p_player),
    'active',(select count(*) from vvr.referrals r where r.inviter_id=p_player and vvr.brotherhood_active(r)),
    'qualifiedFriends',(select count(*) from vvr.referrals r join vvr.brotherhood_campaign c on c.player_id=r.invitee_id
      where r.inviter_id=p_player and c.hero_level>=20),
    'legendAwards',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'tier',a.tier,
      'payload',a.payload,'received',vvr.brotherhood_received(a)) order by a.tier)
      from vvr.brotherhood_awards a where a.recipient_id=p_player and a.kind='legend'),'[]'::jsonb),
    'wallet',vvr.brotherhood_wallet(p_player)
  )) from old_feed cross join vvr.brotherhood_settings s;
$$;

notify pgrst,'reload schema';
