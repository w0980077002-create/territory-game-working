set local lock_timeout='5s';

-- A spent charge always has a durable delivery. An unfinished delivery is
-- returned by subsequent requests for the same player, even with a new key.
create table vvr.brotherhood_horn_openings (
  player_id uuid not null references vvr.players(id),
  operation_id uuid not null,
  item jsonb not null check (jsonb_typeof(item)='object' and
    item->>'id' is not null and item->>'id'='brotherhood-horn:'||operation_id::text and octet_length(item::text)<4096),
  opened_at timestamptz not null default clock_timestamp(),
  delivered_at timestamptz,
  primary key(player_id,operation_id)
);
create unique index brotherhood_horn_one_pending
  on vvr.brotherhood_horn_openings(player_id) where delivered_at is null;
-- A retry of an overlapping request still resolves to its original opening
-- after another tab has acknowledged that opening.
create table vvr.brotherhood_horn_aliases (
  player_id uuid not null,
  operation_id uuid not null,
  opening_id uuid not null,
  primary key(player_id,operation_id),
  foreign key(player_id,opening_id) references vvr.brotherhood_horn_openings(player_id,operation_id)
);
alter table vvr.brotherhood_horn_openings enable row level security;
alter table vvr.brotherhood_horn_aliases enable row level security;
revoke all on vvr.brotherhood_horn_aliases from public,anon,authenticated,service_role,vvr_reward_writer;
revoke all on vvr.brotherhood_horn_openings from public,anon,authenticated,service_role,vvr_reward_writer;

create function public.vvr_brotherhood_horn(p_player uuid,p_action text,p_operation uuid default null,p_item jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  delivery vvr.brotherhood_horn_openings;
  charges bigint;
begin
  if p_action not in ('state','open','ack') or p_action is null
    or (p_action<>'state' and p_operation is null) then
    raise exception 'invalid_horn_request' using errcode='22023';
  end if;
  -- Serializes a player's openings and acknowledgements, in that order.
  perform 1 from vvr.players where id=p_player for no key update;
  if not found then raise exception 'verified_player_required' using errcode='42501'; end if;
  if p_action='ack' then
    update vvr.brotherhood_horn_openings set delivered_at=coalesce(delivered_at,clock_timestamp())
      where player_id=p_player and operation_id=p_operation;
    return jsonb_build_object('status',case when found then 'delivered' else 'unavailable' end);
  end if;
  if p_action='open' then
    select * into delivery from vvr.brotherhood_horn_openings
      where player_id=p_player and operation_id=coalesce(
        (select a.opening_id from vvr.brotherhood_horn_aliases a
          where a.player_id=p_player and a.operation_id=p_operation),p_operation);
  end if;
  if delivery.operation_id is null then
    select * into delivery from vvr.brotherhood_horn_openings
      where player_id=p_player and delivered_at is null;
    if p_action='open' and delivery.operation_id is not null then
      insert into vvr.brotherhood_horn_aliases values(p_player,p_operation,delivery.operation_id);
    end if;
  end if;
  if p_action='open' and delivery.operation_id is null then
    update vvr.wallets w set balance=w.balance-1
      where w.player_id=p_player and w.resource='horn' and w.balance>=1;
    if found then
      insert into vvr.brotherhood_horn_openings(player_id,operation_id,item)
        values(p_player,p_operation,p_item) returning * into delivery;
    end if;
  end if;
  select balance into charges from vvr.wallets where player_id=p_player and resource='horn';
  return jsonb_build_object('status','ok','charges',coalesce(charges,0),'pending',
    case when delivery.operation_id is not null and delivery.delivered_at is null
      then jsonb_build_object('id',delivery.operation_id,'item',delivery.item) else null end);
end;
$$;

revoke all on function public.vvr_brotherhood_horn(uuid,text,uuid,jsonb)
  from public,anon,authenticated,service_role,vvr_reward_writer;
grant execute on function public.vvr_brotherhood_horn(uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
