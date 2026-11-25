-- One immutable attribution per newly created W066 player.
create table vvr.referrals (
  invitee_id uuid primary key references vvr.players(id),
  inviter_id uuid not null references vvr.players(id),
  confirmed_at timestamptz not null default statement_timestamp(),
  check (invitee_id <> inviter_id)
);
create index referrals_by_inviter on vvr.referrals(inviter_id,confirmed_at desc,invitee_id desc);
alter table vvr.referrals enable row level security;
revoke all on vvr.referrals from public,anon,authenticated,service_role;

-- Called only after the Edge Function has verified Telegram's signed start_param.
-- The unique Telegram identity arbitrates concurrent first registrations, including
-- those without an invitation and registrations from other W066 entry points.
create function vvr.resolve_referred_player(p_telegram text,p_name text,p_inviter uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare
  inviter uuid;
  invitee uuid;
begin
  select id into inviter from vvr.players where id=p_inviter and telegram_id<>p_telegram;
  if not found then return vvr.resolve_player(p_telegram,p_name); end if;

  insert into vvr.players(telegram_id,display_name) values(p_telegram,p_name)
    on conflict(telegram_id) do nothing returning id into invitee;
  if not found then return vvr.resolve_player(p_telegram,p_name); end if;

  insert into vvr.referrals(invitee_id,inviter_id) values(invitee,inviter);
  return invitee;
end;
$$;

create function public.vvr_resolve_referred_player(p_telegram text,p_name text,p_inviter uuid)
returns uuid language sql security invoker set search_path=pg_catalog
as $$ select vvr.resolve_referred_player(p_telegram,p_name,p_inviter); $$;

create function vvr.referral_state(p_player uuid,p_before uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with page as materialized (
    select r.invitee_id as id,r.confirmed_at as at,p.display_name as name,
      case when exists(select from vvr.resource_receipts receipt
        where receipt.player_id=p_player and receipt.source_kind='referral' and receipt.source_id=r.invitee_id)
        then 'rewarded' else 'confirmed' end as status
    from vvr.referrals r join vvr.players p on p.id=r.invitee_id
    where r.inviter_id=p_player and (p_before is null or (r.confirmed_at,r.invitee_id) <
      (select cursor.confirmed_at,cursor.invitee_id from vvr.referrals cursor
       where cursor.inviter_id=p_player and cursor.invitee_id=p_before))
    order by r.confirmed_at desc,r.invitee_id desc limit 26
  )
  select jsonb_build_object(
    'startParam','ref_'||p_player,
    'rows',coalesce((select jsonb_agg(to_jsonb(entry) order by entry.at desc,entry.id desc)
      from (select * from page order by at desc,id desc limit 25) entry),'[]'::jsonb),
    'next',case when (select count(*) from page)>25 then
      (select id from page order by at desc,id desc offset 24 limit 1) end
  );
$$;

create function public.vvr_referrals(p_player uuid,p_before uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog
as $$ select vvr.referral_state(p_player,p_before); $$;

-- No gameplay caller or runtime role may issue this reward. A future approved
-- policy must call this helper only after verifying eligibility on the server.
-- Debit/credit configuration lives outside this helper. The existing journal
-- and wallet trigger settle one award per confirmed invitee in a transaction.
create function vvr.issue_referral_reward(p_invitee uuid,p_resource text,p_amount integer)
returns boolean language plpgsql security invoker set search_path=pg_catalog
as $$
declare inviter uuid;
begin
  select inviter_id into inviter from vvr.referrals where invitee_id=p_invitee;
  if not found then raise exception 'referral_missing' using errcode='22023'; end if;
  return vvr.issue_resource(inviter,'referral',p_invitee,p_resource,p_amount);
end;
$$;

revoke all on function vvr.resolve_referred_player(text,text,uuid),public.vvr_resolve_referred_player(text,text,uuid),
  vvr.referral_state(uuid,uuid),public.vvr_referrals(uuid,uuid),vvr.issue_referral_reward(uuid,text,integer)
  from public,anon,authenticated,service_role,vvr_reward_writer;
grant execute on function vvr.resolve_referred_player(text,text,uuid),public.vvr_resolve_referred_player(text,text,uuid),
  vvr.referral_state(uuid,uuid),public.vvr_referrals(uuid,uuid) to service_role;
notify pgrst,'reload schema';
