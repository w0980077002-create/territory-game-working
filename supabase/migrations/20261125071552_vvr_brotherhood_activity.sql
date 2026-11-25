set local lock_timeout = '5s';

-- The campaign boss will be the source of new welcome awards. Preserve the
-- entitlements and receipts already earned under the former World Boss rule.
drop trigger brotherhood_boss_finished on vvr.world_boss_events;
drop function vvr.brotherhood_boss_finished();
drop function vvr.brotherhood_boss_earned(uuid);

-- The Arena Edge server builds checkpoints from signed player commands and
-- server-controlled combat. Require an actual strike in a completed fight.
create function vvr.brotherhood_arena_completed(p_room vvr.arena_rooms,p_player uuid)
returns timestamptz language sql stable set search_path=pg_catalog
as $$
  select least(result.at,p_room.finished_at)
  from (
    select case when p_room.snapshot#>>'{result,finishedAt}' ~ '^[0-9]{13}$'
      then to_timestamp((p_room.snapshot#>>'{result,finishedAt}')::bigint/1000.0) end as at
  ) result
  where p_room.finished_at is not null
    and result.at between date_trunc('milliseconds',p_room.ready_at) and p_room.finished_at+interval '5 seconds'
    and p_room.snapshot#>>'{result,reason}' in ('hp','time')
    and exists (
      select from jsonb_array_elements(
        case when jsonb_typeof(p_room.snapshot->'players')='array' then p_room.snapshot->'players' end
      ) fighter
      where fighter->>'id'=p_player::text and fighter->'fought'='true'::jsonb
        and coalesce(fighter->'bot','false'::jsonb)='false'::jsonb
    );
$$;

create function vvr.brotherhood_activity_days(p_player uuid,p_since timestamptz)
returns setof date language sql stable set search_path=pg_catalog
as $$
  select q.utc_day from vvr.brotherhood_quest_completions q
    where q.player_id=p_player and q.completed_at>=p_since
  union
  select (proof.at at time zone 'UTC')::date
    from vvr.arena_room_seats s join vvr.arena_rooms r on r.id=s.room_id
    cross join lateral (select vvr.brotherhood_arena_completed(r,p_player) as at) proof
    where s.player_id=p_player and r.finished_at>=p_since and proof.at>=p_since;
$$;

create or replace function vvr.brotherhood_days(p_pair vvr.referrals)
returns integer language sql stable set search_path=pg_catalog
as $$
  select count(*)::integer from (
    select a.day from vvr.brotherhood_activity_days(p_pair.invitee_id,p_pair.confirmed_at) a(day)
    intersect
    select b.day from vvr.brotherhood_activity_days(p_pair.inviter_id,p_pair.confirmed_at) b(day)
    limit 7
  ) shared;
$$;

create or replace function vvr.brotherhood_active(p_pair vvr.referrals)
returns boolean language sql stable set search_path=pg_catalog
as $$
  select exists(select from vvr.brotherhood_awards a where a.invitee_id=p_pair.invitee_id and a.kind='welcome')
    or exists(select from vvr.brotherhood_activity_days(p_pair.invitee_id,p_pair.confirmed_at));
$$;

-- Arena rooms and guild quests can finish concurrently for the same pair.
-- Serialize only the pair reconciliation and read both sources after the lock.
-- All callers that reconcile multiple pairs visit them in invitee UUID order.
create or replace function vvr.brotherhood_oath_earned(p_pair vvr.referrals)
returns void language plpgsql set search_path=pg_catalog
as $$
declare days integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_pair.invitee_id::text,9461));
  days:=vvr.brotherhood_days(p_pair);
  insert into vvr.brotherhood_awards(invitee_id,recipient_id,kind,tier,payload)
  select p_pair.invitee_id,recipient.id,'oath',tier.key::integer,tier.value
  from vvr.brotherhood_settings s cross join lateral jsonb_each(s.rewards->'oath') tier
  cross join (values (p_pair.invitee_id),(p_pair.inviter_id)) recipient(id)
  where tier.key::integer<=days
  on conflict(invitee_id,recipient_id,kind,tier) do nothing;
end;
$$;

create function vvr.brotherhood_arena_finished()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare pair vvr.referrals;
begin
  for pair in
    with participants as materialized (
      select s.player_id from vvr.arena_room_seats s
      where s.room_id=new.id and vvr.brotherhood_arena_completed(new,s.player_id) is not null
    )
    select r.* from vvr.referrals r where r.confirmed_at<=new.finished_at and
      (r.invitee_id in (select player_id from participants) or r.inviter_id in (select player_id from participants))
    order by r.invitee_id
  loop
    perform vvr.brotherhood_oath_earned(pair);
  end loop;
  return new;
end;
$$;

create trigger brotherhood_arena_finished after update of finished_at on vvr.arena_rooms
  for each row when (old.finished_at is null and new.finished_at is not null)
  execute function vvr.brotherhood_arena_finished();

-- Past Arena completions retain server timestamps. Only shared UTC days
-- after attribution can open entitlements for a previously existing pair.
do $$
declare pair vvr.referrals;
begin
  for pair in select r.* from vvr.referrals r where vvr.brotherhood_days(r)>0 order by r.invitee_id loop
    perform vvr.brotherhood_oath_earned(pair);
  end loop;
end;
$$;

revoke all on function vvr.brotherhood_arena_completed(vvr.arena_rooms,uuid),
  vvr.brotherhood_activity_days(uuid,timestamptz),vvr.brotherhood_arena_finished()
  from public,anon,authenticated,service_role,vvr_reward_writer;
