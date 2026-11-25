set local lock_timeout = '5s';

-- W066 remains the only trusted reward wallet. These resource codes are
-- existing game resources. Solo saves cannot read, spend or import these balances.
alter table vvr.resource_receipts drop constraint resource_receipts_resource_check,
  add constraint resource_receipts_resource_check check (resource in
    ('gold','chaosite','tokens') or (source_kind='brotherhood' and resource in
    ('gems','horn','rune_scrolls','summon_seals','relic_shards')));
alter table vvr.wallets drop constraint wallets_resource_check,
  add constraint wallets_resource_check check (resource in
    ('gold','chaosite','tokens','gems','horn','rune_scrolls','summon_seals','relic_shards'));

create function vvr.brotherhood_valid_payload(p_payload jsonb)
returns boolean language sql immutable set search_path=pg_catalog
as $$
  select case when jsonb_typeof(p_payload)='object' and p_payload<>'{}'::jsonb then (
    select bool_and(entry.key in ('gold','gems','horn','chaosite','rune_scrolls','summon_seals','relic_shards')
      and (entry.value::text ~ '^[1-9][0-9]{0,5}$' or entry.value='1000000'::jsonb))
    from jsonb_each(p_payload) entry
  ) else false end;
$$;
revoke all on function vvr.brotherhood_valid_payload(jsonb) from public,anon,authenticated,service_role,vvr_reward_writer;

create table vvr.brotherhood_settings (
  singleton boolean primary key default true check (singleton),
  payouts_enabled boolean not null default true,
  rewards jsonb not null check (
    vvr.brotherhood_valid_payload(rewards#>'{welcome,invitee}') and
    vvr.brotherhood_valid_payload(rewards#>'{welcome,inviter}') and
    vvr.brotherhood_valid_payload(rewards#>'{oath,1}') and
    vvr.brotherhood_valid_payload(rewards#>'{oath,3}') and
    vvr.brotherhood_valid_payload(rewards#>'{oath,5}') and
    vvr.brotherhood_valid_payload(rewards#>'{oath,7}') and
    (rewards->'oath')-array['1','3','5','7']::text[]='{}'::jsonb
  )
);
insert into vvr.brotherhood_settings(rewards) values ('{
  "welcome": {
    "invitee": {"gold":2000,"gems":100,"horn":20,"chaosite":30,"rune_scrolls":40,"summon_seals":3},
    "inviter": {"gems":25}
  },
  "level": {
    "10":{"gems":50,"chaosite":20},
    "20":{"gems":75,"summon_seals":3},
    "30":{"gems":100,"relic_shards":10},
    "50":{"gems":150,"summon_seals":5,"chaosite":50},
    "75":{"gems":200,"rune_scrolls":100},
    "100":{"gems":300,"summon_seals":10,"chaosite":100}
  },
  "legend": {
    "1":{"title":"comrade","resources":{"gems":50,"summon_seals":5}},
    "3":{"title":"leader","resources":{"gems":150,"chaosite":100}},
    "5":{"title":"chief","resources":{"gems":300},"honor":"chief"},
    "10":{"title":"jarl","cosmetic":"wings"},
    "25":{"title":"great_jarl","cosmetic":"companion"},
    "50":{"title":"north_legend","cosmetic":"hero","honor":"north_legend"}
  },
  "oath": {
    "1":{"gems":10},
    "3":{"chaosite":30},
    "5":{"summon_seals":3},
    "7":{"gems":50,"relic_shards":5}
  }
}'::jsonb);

-- An earned award snapshots the approved contents. Receipt lines in the
-- existing journal alone determine whether it has been received.
create table vvr.brotherhood_awards (
  id uuid primary key default gen_random_uuid(),
  invitee_id uuid not null references vvr.referrals(invitee_id),
  recipient_id uuid not null references vvr.players(id),
  kind text not null check (kind in ('welcome','oath')),
  tier integer not null check (tier>0),
  payload jsonb not null check (vvr.brotherhood_valid_payload(payload)),
  earned_at timestamptz not null default statement_timestamp(),
  unique (invitee_id,recipient_id,kind,tier)
);
create index brotherhood_awards_recipient on vvr.brotherhood_awards(recipient_id);

-- Guild quest completion is recorded once per player and event. NULL means
-- a historical completion whose actual day cannot be reconstructed.
create table vvr.brotherhood_quest_completions (
  event_id uuid not null references vvr.guild_boss_quests(event_id),
  player_id uuid not null references vvr.players(id),
  completed_at timestamptz,
  utc_day date generated always as ((completed_at at time zone 'UTC')::date) stored,
  primary key (event_id,player_id)
);
create index brotherhood_quest_days on vvr.brotherhood_quest_completions(player_id,utc_day,completed_at)
  where completed_at is not null;
create index brotherhood_boss_participation on vvr.world_boss_participants(player_id,event_id);

create table vvr.brotherhood_rejections (
  player_id uuid not null references vvr.players(id),
  utc_day date not null,
  reason text not null check (reason in ('self_referral','foreign_or_unknown_award')),
  attempts bigint not null default 1,
  primary key (player_id,utc_day,reason)
);
alter table vvr.brotherhood_settings enable row level security;
alter table vvr.brotherhood_awards enable row level security;
alter table vvr.brotherhood_quest_completions enable row level security;
alter table vvr.brotherhood_rejections enable row level security;
revoke all on vvr.brotherhood_settings,vvr.brotherhood_awards,vvr.brotherhood_quest_completions,
  vvr.brotherhood_rejections from public,anon,authenticated,service_role,vvr_reward_writer;

-- The reward writer may keep issuing existing kinds. Brotherhood receipts
-- are reserved for the function that verifies the entitlement and owner.
create policy brotherhood_receipt_guard on vvr.resource_receipts as restrictive
  for insert to vvr_reward_writer with check (source_kind <> 'brotherhood');

create function vvr.brotherhood_note_rejection(p_player uuid,p_reason text)
returns void language sql set search_path=pg_catalog
as $$
  insert into vvr.brotherhood_rejections(player_id,utc_day,reason)
    values(p_player,(statement_timestamp() at time zone 'UTC')::date,p_reason)
  on conflict(player_id,utc_day,reason) do update set attempts=vvr.brotherhood_rejections.attempts+1;
$$;

-- Preserve the PR #114 resolver and the same immutable referral relationship.
create or replace function public.vvr_resolve_referred_player(p_telegram text,p_name text,p_inviter uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare player uuid;
begin
  player:=vvr.resolve_referred_player(p_telegram,p_name,p_inviter);
  if player=p_inviter then perform vvr.brotherhood_note_rejection(player,'self_referral'); end if;
  return player;
end;
$$;

create function vvr.brotherhood_line(p_award uuid,p_resource text)
returns uuid language sql immutable set search_path=pg_catalog
as $$ select md5(p_award::text||':'||p_resource)::uuid; $$;

create function vvr.brotherhood_received(p_award vvr.brotherhood_awards)
returns boolean language sql stable set search_path=pg_catalog
as $$
  select not exists (
    select from jsonb_each_text(p_award.payload) line
    where not exists(select from vvr.resource_receipts r where r.player_id=p_award.recipient_id
      and r.source_kind='brotherhood' and r.source_id=vvr.brotherhood_line(p_award.id,line.key))
  );
$$;

create function vvr.brotherhood_boss_earned(p_event uuid)
returns void language sql set search_path=pg_catalog
as $$
  insert into vvr.brotherhood_awards(invitee_id,recipient_id,kind,tier,payload,earned_at)
  select r.invitee_id,award.recipient,'welcome',1,award.payload,e.finished_at
  from vvr.world_boss_events e
  join vvr.world_boss_participants p on p.event_id=e.id
  join vvr.referrals r on r.invitee_id=p.player_id and r.confirmed_at<=e.finished_at
  cross join vvr.brotherhood_settings s
  cross join lateral (values (r.invitee_id,s.rewards#>'{welcome,invitee}'),
    (r.inviter_id,s.rewards#>'{welcome,inviter}')) award(recipient,payload)
  where e.id=p_event and e.status='defeated' and p.total_damage>0
    and p.total_hits>=(e.config->>'minHitsForReward')::integer
  on conflict(invitee_id,recipient_id,kind,tier) do nothing;
$$;

create function vvr.brotherhood_boss_finished()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  perform vvr.brotherhood_boss_earned(new.id);
  return new;
end;
$$;

-- Attach after the server has recorded hits and settled the boss's HP.
create trigger brotherhood_boss_finished after update of status on vvr.world_boss_events
  for each row when (new.status='defeated' and old.status<>'defeated')
  execute function vvr.brotherhood_boss_finished();

-- Backfill recorded victories after attribution, independent of claiming the boss's mail.
do $$
declare event_id uuid;
begin
  for event_id in select id from vvr.world_boss_events where status='defeated' order by finished_at,id loop
    perform vvr.brotherhood_boss_earned(event_id);
  end loop;
end;
$$;

create function vvr.brotherhood_days(p_pair vvr.referrals)
returns integer language sql stable set search_path=pg_catalog
as $$
  select least(7,count(distinct a.utc_day))::integer
  from vvr.brotherhood_quest_completions a
  join vvr.brotherhood_quest_completions b on b.player_id=p_pair.inviter_id and b.utc_day=a.utc_day
  where a.player_id=p_pair.invitee_id and a.completed_at>=p_pair.confirmed_at and b.completed_at>=p_pair.confirmed_at;
$$;

create function vvr.brotherhood_oath_earned(p_pair vvr.referrals)
returns void language sql set search_path=pg_catalog
as $$
  insert into vvr.brotherhood_awards(invitee_id,recipient_id,kind,tier,payload)
  select p_pair.invitee_id,recipient.id,'oath',tier.key::integer,tier.value
  from vvr.brotherhood_settings s cross join lateral jsonb_each(s.rewards->'oath') tier
  cross join (values (p_pair.invitee_id),(p_pair.inviter_id)) recipient(id)
  where tier.key::integer<=vvr.brotherhood_days(p_pair)
  on conflict(invitee_id,recipient_id,kind,tier) do nothing;
$$;

-- Existing guild quest eligibility already requires membership damage and the
-- guild threshold. Record the first time it is met for each contributor,
-- while the World Boss attack holds the existing event lock.
create function vvr.brotherhood_guild_quest_finished()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare
  pair vvr.referrals;
  completed timestamptz:=clock_timestamp();
begin
  if not exists(select from vvr.guild_boss_quests q where q.event_id=new.event_id and q.target_damage<=(
    select sum(damage) from vvr.guild_boss_progress where event_id=new.event_id and guild_id=new.guild_id
  )) then return new; end if;

  for pair in
    with earned as (
      insert into vvr.brotherhood_quest_completions(event_id,player_id,completed_at)
      select new.event_id,p.player_id,completed from vvr.guild_boss_progress p
        where p.event_id=new.event_id and p.guild_id=new.guild_id
      on conflict(event_id,player_id) do nothing returning player_id
    )
    select r.* from vvr.referrals r where r.confirmed_at<=completed and
      (r.invitee_id in (select player_id from earned) or r.inviter_id in (select player_id from earned))
    order by r.invitee_id
  loop
    perform vvr.brotherhood_oath_earned(pair);
  end loop;
  return new;
end;
$$;

insert into vvr.brotherhood_quest_completions(event_id,player_id,completed_at)
select distinct p.event_id,p.player_id,null::timestamptz
from vvr.guild_boss_progress p join vvr.guild_boss_quests q on q.event_id=p.event_id
join (
  select event_id,guild_id,sum(damage) as damage from vvr.guild_boss_progress group by event_id,guild_id
) totals on totals.event_id=p.event_id and totals.guild_id=p.guild_id and totals.damage>=q.target_damage;

create trigger brotherhood_guild_quest_finished after insert or update of damage on vvr.guild_boss_progress
  for each row execute function vvr.brotherhood_guild_quest_finished();

create function vvr.brotherhood_active(p_pair vvr.referrals)
returns boolean language sql stable set search_path=pg_catalog
as $$
  select exists(select from vvr.brotherhood_awards a where a.invitee_id=p_pair.invitee_id and a.kind='welcome')
    or exists(select from vvr.brotherhood_quest_completions q where q.player_id=p_pair.invitee_id
      and q.completed_at>=p_pair.confirmed_at);
$$;

create function vvr.brotherhood_pair_state(p_pair vvr.referrals,p_player uuid)
returns jsonb language sql stable set search_path=pg_catalog
as $$
  select jsonb_build_object('id',p_pair.invitee_id,'inviterId',p_pair.inviter_id,
    'name',(select display_name from vvr.players where id=
      case when p_player=p_pair.invitee_id then p_pair.inviter_id else p_pair.invitee_id end),
    'active',vvr.brotherhood_active(p_pair),'days',vvr.brotherhood_days(p_pair),
    'awards',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'tier',a.tier,
      'payload',a.payload,'received',vvr.brotherhood_received(a)) order by a.kind desc,a.tier)
      from vvr.brotherhood_awards a where a.invitee_id=p_pair.invitee_id and a.recipient_id=p_player),'[]'::jsonb));
$$;

create function vvr.brotherhood_wallet(p_player uuid)
returns jsonb language sql stable set search_path=pg_catalog
as $$
  select coalesce(jsonb_object_agg(resource,balance),'{}'::jsonb) from vvr.wallets
  where player_id=p_player and resource in ('gold','chaosite','gems','horn','rune_scrolls','summon_seals','relic_shards');
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
    'wallet',vvr.brotherhood_wallet(p_player)
  )) from old_feed cross join vvr.brotherhood_settings s;
$$;

-- Lock the kill switch before the award. All receipt lines and wallet credits
-- commit together. Sorting resources gives simultaneous claims consistent lock order.
create function public.vvr_brotherhood_claim(p_player uuid,p_award uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  enabled boolean;
  award vvr.brotherhood_awards;
  line record;
begin
  select payouts_enabled into enabled from vvr.brotherhood_settings for share;
  select * into award from vvr.brotherhood_awards where id=p_award and recipient_id=p_player for update;
  if not found then
    perform vvr.brotherhood_note_rejection(p_player,'foreign_or_unknown_award');
    return jsonb_build_object('status','unavailable');
  end if;
  if vvr.brotherhood_received(award) then
    return jsonb_build_object('status','received','wallet',vvr.brotherhood_wallet(p_player));
  end if;
  if not enabled then return jsonb_build_object('status','paused'); end if;
  for line in select * from jsonb_each_text(award.payload) order by key loop
    perform vvr.issue_resource(p_player,'brotherhood',vvr.brotherhood_line(award.id,line.key),line.key,line.value::integer);
  end loop;
  return jsonb_build_object('status','received','wallet',vvr.brotherhood_wallet(p_player));
end;
$$;

create function public.vvr_brotherhood_admin(p_player uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if not exists(select from vvr.players p join vvr.world_boss_admins a using(telegram_id) where p.id=p_player) then
    raise exception 'brotherhood_admin_required' using errcode='42501';
  end if;
  if p_enabled is not null then update vvr.brotherhood_settings set payouts_enabled=p_enabled; end if;
  return jsonb_build_object(
    'enabled',(select payouts_enabled from vvr.brotherhood_settings),
    'invited',(select count(*) from vvr.referrals),
    'active',(select count(*) from vvr.referrals r where vvr.brotherhood_active(r)),
    'tiers',coalesce((select jsonb_object_agg(k,n) from
      (select kind||':'||tier as k,count(distinct invitee_id) n from vvr.brotherhood_awards group by kind,tier) stats),'{}'::jsonb),
    'issued',coalesce((select jsonb_object_agg(resource,total) from
      (select resource,sum(amount) total from vvr.resource_receipts where source_kind='brotherhood' group by resource) stats),'{}'::jsonb),
    'rejections',coalesce((select jsonb_object_agg(reason,total) from
      (select reason,sum(attempts) total from vvr.brotherhood_rejections group by reason) stats),'{}'::jsonb)
  );
end;
$$;

revoke all on function vvr.brotherhood_note_rejection(uuid,text),vvr.brotherhood_line(uuid,text),
  vvr.brotherhood_received(vvr.brotherhood_awards),vvr.brotherhood_boss_earned(uuid),vvr.brotherhood_boss_finished(),
  vvr.brotherhood_days(vvr.referrals),vvr.brotherhood_oath_earned(vvr.referrals),vvr.brotherhood_guild_quest_finished(),
  vvr.brotherhood_active(vvr.referrals),vvr.brotherhood_pair_state(vvr.referrals,uuid),vvr.brotherhood_wallet(uuid),
  public.vvr_brotherhood_claim(uuid,uuid),public.vvr_brotherhood_admin(uuid,boolean)
  from public,anon,authenticated,service_role,vvr_reward_writer;
grant execute on function public.vvr_brotherhood_claim(uuid,uuid),public.vvr_brotherhood_admin(uuid,boolean)
  to service_role;
notify pgrst,'reload schema';
