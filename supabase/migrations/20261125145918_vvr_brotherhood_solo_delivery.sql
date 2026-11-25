set local lock_timeout='5s';

-- Reuse the durable Brotherhood delivery journal and its operation aliases.
-- Horn deliveries remain readable by older clients and keep their pending slot.
alter table vvr.brotherhood_horn_openings add column kind text not null default 'horn'
  check (kind in ('horn','solo'));
alter table vvr.brotherhood_horn_openings drop constraint brotherhood_horn_openings_check,
  add constraint brotherhood_delivery_payload_check check (
    jsonb_typeof(item)='object' and item->>'id' is not null
    and item->>'id'='brotherhood-'||kind||':'||operation_id::text and octet_length(item::text)<4096
    and (kind='horn' or jsonb_typeof(item->'resources') is not distinct from 'object')
  );
create unique index brotherhood_delivery_one_pending
  on vvr.brotherhood_horn_openings(player_id,kind) where delivered_at is null;
drop index vvr.brotherhood_horn_one_pending;

-- Legacy gift credits are already part of the shared wallet. The available
-- amount is bounded both by the current wallet and by previously unexported
-- Brotherhood credits. Non-gift wallets and Horn charges are excluded.
create function vvr.brotherhood_solo_available(p_player uuid)
returns jsonb language sql stable set search_path=pg_catalog
as $$
  with movements as (
    select resource,amount::bigint as delta,issued_at as at,0 as priority,source_id as id
    from vvr.resource_receipts
    where player_id=p_player and source_kind='brotherhood'
      and resource in ('gold','gems','chaosite','rune_scrolls','summon_seals','relic_shards')
    union all
    select 'gold',-(case op.command->>'kind' when 'buy' then l.price else (op.result->>'price')::integer end)::bigint,
      op.at,1,op.operation_id
    from vvr.auction_operations op left join vvr.auction_listings l
      on l.id=(op.result->>'listingId')::uuid and op.command->>'kind'='buy'
    where op.actor_id=p_player and op.command->>'kind' in ('buy','enhance')
    union all
    select line.key,-line.value::bigint,d.opened_at,2,d.operation_id
    from vvr.brotherhood_horn_openings d cross join lateral jsonb_each_text(d.item->'resources') line
    where d.player_id=p_player and d.kind='solo'
  ), running as (
    select resource,delta,sum(delta) over (partition by resource order by at,priority,id) as total
    from movements
  ), unspent as (
    -- Existing network spends consume gifts first. A negative running sum is
    -- paid by ordinary funds and cannot subtract from later gifts.
    select resource,sum(delta)-least(0,min(total)) as amount from running group by resource
  ), available as (
    select w.resource,least(w.balance,unspent.amount) as amount
    from vvr.wallets w join unspent using(resource) where w.player_id=p_player
  )
  select coalesce(jsonb_object_agg(resource,amount) filter (where amount>0),'{}'::jsonb)
  from available;
$$;
revoke all on function vvr.brotherhood_solo_available(uuid)
  from public,anon,authenticated,service_role,vvr_reward_writer;

create or replace function public.vvr_brotherhood_horn(p_player uuid,p_action text,p_operation uuid default null,p_item jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  delivery vvr.brotherhood_horn_openings;
  delivery_kind text:=case when p_action in ('solo_state','solo_open','solo_ack') then 'solo' else 'horn' end;
  action text:=case when delivery_kind='solo' then substr(p_action,6) else p_action end;
  payload jsonb;
  charges bigint;
begin
  if action not in ('state','open','ack') or action is null
    or (action<>'state' and p_operation is null) then
    raise exception 'invalid_brotherhood_delivery_request' using errcode='22023';
  end if;
  perform 1 from vvr.players where id=p_player for no key update;
  if not found then raise exception 'verified_player_required' using errcode='42501'; end if;
  if action='ack' then
    update vvr.brotherhood_horn_openings set delivered_at=coalesce(delivered_at,clock_timestamp())
      where player_id=p_player and operation_id=p_operation and kind=delivery_kind;
    return jsonb_build_object('status',case when found then 'delivered' else 'unavailable' end);
  end if;
  if action='open' then
    select * into delivery from vvr.brotherhood_horn_openings
      where player_id=p_player and operation_id=coalesce(
        (select a.opening_id from vvr.brotherhood_horn_aliases a
          where a.player_id=p_player and a.operation_id=p_operation),p_operation);
    if found and delivery.kind<>delivery_kind then
      raise exception 'delivery_operation_conflict' using errcode='23505';
    end if;
  end if;
  if delivery.operation_id is null then
    select * into delivery from vvr.brotherhood_horn_openings
      where player_id=p_player and delivered_at is null and kind=delivery_kind;
    if action='open' and delivery.operation_id is not null then
      insert into vvr.brotherhood_horn_aliases values(p_player,p_operation,delivery.operation_id);
    end if;
  end if;
  if action='open' and delivery.operation_id is null then
    if delivery_kind='horn' then
      update vvr.wallets w set balance=w.balance-1
        where w.player_id=p_player and w.resource='horn' and w.balance>=1;
      if found then payload:=p_item; end if;
      if found and payload is null then
        raise exception 'missing_horn_item' using errcode='23502';
      end if;
    else
      -- Reward claims lock wallet rows in the same order. Compute the amount
      -- only after obtaining the locks, so a market spend cannot race the debit.
      perform 1 from vvr.wallets w where w.player_id=p_player
        and w.resource in ('gold','gems','chaosite','rune_scrolls','summon_seals','relic_shards')
        order by w.resource for update;
      payload:=vvr.brotherhood_solo_available(p_player);
      if payload='{}'::jsonb then
        payload:=null;
      else
        update vvr.wallets w set balance=w.balance-line.value::bigint
          from jsonb_each_text(payload) line where w.player_id=p_player and w.resource=line.key;
        payload:=jsonb_build_object('id','brotherhood-solo:'||p_operation::text,'resources',payload);
      end if;
    end if;
    if payload is not null then
      insert into vvr.brotherhood_horn_openings(player_id,operation_id,item,kind)
        values(p_player,p_operation,payload,delivery_kind) returning * into delivery;
    end if;
  end if;
  payload:=case when delivery.operation_id is not null and delivery.delivered_at is null
    then jsonb_build_object('id',delivery.operation_id,'item',delivery.item) else null end;
  if delivery_kind='solo' then
    return jsonb_build_object('status','ok','available',vvr.brotherhood_solo_available(p_player),
      'wallet',vvr.brotherhood_wallet(p_player),'pending',payload);
  end if;
  select balance into charges from vvr.wallets where player_id=p_player and resource='horn';
  return jsonb_build_object('status','ok','charges',coalesce(charges,0),'pending',payload);
end;
$$;

-- CREATE OR REPLACE keeps the prior ACL; spell out the intended boundary.
revoke all on function public.vvr_brotherhood_horn(uuid,text,uuid,jsonb)
  from public,anon,authenticated,service_role,vvr_reward_writer;
grant execute on function public.vvr_brotherhood_horn(uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
