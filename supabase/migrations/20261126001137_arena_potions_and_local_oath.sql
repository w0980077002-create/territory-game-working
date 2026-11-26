set local lock_timeout = '5s';

-- Purchased units are cumulative. The mounted Railway database owns the
-- active reservation and the consumed count, in the same transaction as combat.
create table vvr.arena_potions (
 player_id uuid primary key references vvr.players(id),
 issued bigint not null check (issued > 0)
);
alter table vvr.arena_potions enable row level security;
revoke all on vvr.arena_potions from public,anon,authenticated,service_role;

create function public.vvr_arena_potions(p_token_hash text,p_telegram text,p_name text,
 p_operation uuid default null,p_stage integer default null,p_price bigint default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
 player uuid;
 stage integer;
 gold bigint;
 issued bigint;
 previous vvr.auction_operations%rowtype;
 action jsonb;
begin
 if not exists(select from vvr.arena_publishers where name='railway' and token_hash=p_token_hash) then
  raise exception 'arena_publisher_required' using errcode='42501';
 end if;
 select id into player from vvr.players where telegram_id=p_telegram;
 if not found then player:=vvr.resolve_player(p_telegram,p_name); end if;
 select coalesce((select c.stage from vvr.brotherhood_campaign c where c.player_id=player),1) into stage;

 if p_operation is not null then
  if p_stage is null or p_price is null or p_price<1 then
   raise exception 'arena_invalid_purchase' using errcode='22023';
  end if;
  action:=jsonb_build_object('kind','arena_potion','stage',p_stage,'price',p_price);
  perform pg_advisory_xact_lock(hashtextextended(player::text||':'||p_operation::text,811));
  select * into previous from vvr.auction_operations where actor_id=player and operation_id=p_operation;
  if found and previous.command<>action then
   raise exception 'operation_conflict' using errcode='23505';
  end if;
  if not found then
   if stage<>p_stage then return jsonb_build_object('status','price_changed'); end if;
   update vvr.wallets set balance=balance-p_price
    where player_id=player and resource='gold' and balance>=p_price;
   if not found then return jsonb_build_object('status','insufficient'); end if;
   insert into vvr.arena_potions values(player,1)
    on conflict(player_id) do update set issued=vvr.arena_potions.issued+1;
   insert into vvr.auction_operations(actor_id,operation_id,command,result)
    values(player,p_operation,action,jsonb_build_object('operationId',p_operation,'kind','arena_potion'));
  end if;
 end if;
 select coalesce((select w.balance from vvr.wallets w where w.player_id=player and w.resource='gold'),0) into gold;
 select coalesce((select a.issued from vvr.arena_potions a where a.player_id=player),0) into issued;
 return jsonb_build_object('status','ok','gold',gold,'stage',stage,'issued',issued,'attack',vvr.hero_attack(player));
end;
$$;

create table vvr.arena_local_oath_days (
 player_id uuid not null references vvr.players(id),
 utc_day date not null,
 room_id uuid not null,
 primary key(player_id,utc_day),
 unique(room_id)
);
alter table vvr.arena_local_oath_days enable row level security;
revoke all on vvr.arena_local_oath_days from public,anon,authenticated,service_role;

create function public.vvr_ingest_arena_oath(p_token_hash text,p_match uuid,p_mode text,p_started timestamptz,
 p_finished timestamptz,p_reason text,p_members jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare
 player uuid;
 member jsonb;
begin
 if not exists(select from vvr.arena_publishers where name='railway' and token_hash=p_token_hash) then
  raise exception 'arena_publisher_required' using errcode='42501';
 end if;
 if p_match is null or p_mode is null or p_mode not in ('team','chaos') or p_started is null
  or p_finished is null or p_finished not between p_started and p_started+interval '1 hour'
  or p_finished>clock_timestamp()+interval '5 seconds'
  or p_reason is null or p_reason not in ('hp','time')
  or jsonb_typeof(p_members) is distinct from 'array' then
  raise exception 'arena_invalid_oath_result' using errcode='22023';
 end if;
 member:=p_members->0;
 if jsonb_array_length(p_members)<>1 or member->'fought' is distinct from 'true'::jsonb
  or coalesce(member->>'telegram','')!~'^[1-9][0-9]{0,15}$' or coalesce(char_length(member->>'name'),0) not between 1 and 32
  or coalesce(member->>'hero','') not in ('berserker','ranger','runologist') then
  raise exception 'arena_invalid_oath_member' using errcode='22023';
 end if;
 select id into player from vvr.players where telegram_id=member->>'telegram';
 if not found then player:=vvr.resolve_player(member->>'telegram',member->>'name'); end if;
 insert into vvr.arena_local_oath_days values(player,(p_finished at time zone 'UTC')::date,p_match)
  on conflict do nothing;
 if not found then return true; end if;
 insert into vvr.arena_rooms(id,mode,opened_at,closes_at,ready_at)
  values(p_match,p_mode,p_started,p_started,p_started);
 insert into vvr.arena_room_seats(room_id,player_id,seat,hero,attack_power,released)
  values(p_match,player,0,member->>'hero',vvr.hero_attack(player),true);
 update vvr.arena_rooms set finished_at=p_finished,revision=1,
  snapshot=jsonb_build_object('terminalOnly',true,'id',p_match,'players',jsonb_build_array(jsonb_build_object('id',player,'fought',true)),
   'result',jsonb_build_object('reason',p_reason,'finishedAt',floor(extract(epoch from p_finished)*1000)::bigint))
  where id=p_match;
 return true;
end;
$$;

revoke all on function public.vvr_arena_potions(text,text,text,uuid,integer,bigint),
 public.vvr_ingest_arena_oath(text,uuid,text,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.vvr_arena_potions(text,text,text,uuid,integer,bigint),
 public.vvr_ingest_arena_oath(text,uuid,text,timestamptz,timestamptz,text,jsonb) to service_role;
notify pgrst,'reload schema';
