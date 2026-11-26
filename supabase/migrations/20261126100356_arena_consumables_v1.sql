set local lock_timeout = '5s';

create function vvr.arena_consumable_kind(p_item text)
returns boolean language sql immutable set search_path=pg_catalog
as $$
 select coalesce(p_item in ('potion','tear','berserk','thor','odin','niflheim','muspel','aegis','mars','mercury',
  'minerva','venom','fenrir','hel','loki','steel','neptune','apollo','valkyrie','bifrost'),false);
$$;

-- Keep existing Heart of Valhalla issuance and purchase receipts.
create table vvr.arena_consumable_stock (
 player_id uuid not null references vvr.players(id),
 item text not null check (vvr.arena_consumable_kind(item)),
 issued bigint not null default 0,
 spent bigint not null default 0,
 primary key (player_id,item),
 check (spent>=0 and (item='potion' and issued=0 or item<>'potion' and issued>=spent))
);
alter table vvr.arena_consumable_stock enable row level security;
revoke all on vvr.arena_consumable_stock from public,anon,authenticated,service_role;

create function public.vvr_arena_consumables(p_token_hash text,p_telegram text,p_name text,
 p_operation uuid default null,p_stage integer default null,p_price bigint default null,p_item text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
 player uuid;
 stage integer;
 previous vvr.auction_operations%rowtype;
 command jsonb;
begin
 if not exists(select from vvr.arena_publishers where name='railway' and token_hash=p_token_hash) then
  raise exception 'arena_publisher_required' using errcode='42501';
 end if;
 select id into player from vvr.players where telegram_id=p_telegram;
 if not found then player:=vvr.resolve_player(p_telegram,p_name); end if;
 select coalesce((select c.stage from vvr.brotherhood_campaign c where c.player_id=player),1) into stage;

 if p_operation is not null then
  if not vvr.arena_consumable_kind(p_item) or p_stage is null or p_price is null or p_price<1 then
   raise exception 'arena_invalid_purchase' using errcode='22023';
  end if;
  -- The shared journal also serializes retries from the legacy and V1 clients.
  command:=jsonb_build_object('kind','arena_potion','stage',p_stage,'price',p_price);
  if p_item<>'potion' then command:=command||jsonb_build_object('item',p_item); end if;
  perform pg_advisory_xact_lock(hashtextextended(player::text||':'||p_operation::text,811));
  select * into previous from vvr.auction_operations where actor_id=player and operation_id=p_operation;
  if found and previous.command<>command then
   raise exception 'operation_conflict' using errcode='23505';
  end if;
  if not found then
   if stage<>p_stage then return jsonb_build_object('status','price_changed'); end if;
   update vvr.wallets set balance=balance-p_price
    where player_id=player and resource='gold' and balance>=p_price;
   if not found then return jsonb_build_object('status','insufficient'); end if;
   if p_item='potion' then
    insert into vvr.arena_potions values(player,1)
     on conflict(player_id) do update set issued=vvr.arena_potions.issued+1;
   else
    insert into vvr.arena_consumable_stock(player_id,item,issued) values(player,p_item,1)
     on conflict(player_id,item) do update set issued=vvr.arena_consumable_stock.issued+1;
   end if;
   insert into vvr.auction_operations(actor_id,operation_id,command,result)
    values(player,p_operation,command,jsonb_build_object('operationId',p_operation,'kind','arena_potion','item',p_item));
  end if;
 elsif p_item is not null or p_stage is not null or p_price is not null then
  raise exception 'arena_invalid_purchase' using errcode='22023';
 end if;

 return (
  select jsonb_build_object('status','ok','stage',stage,'attack',vvr.hero_attack(player),
   'gold',coalesce((select balance from vvr.wallets where player_id=player and resource='gold'),0),
   'issued',coalesce((select jsonb_object_agg(item,issued) from vvr.arena_consumable_stock where player_id=player and item<>'potion'),'{}'::jsonb)||
    jsonb_build_object('potion',coalesce((select issued from vvr.arena_potions where player_id=player),0)),
   'spent',coalesce((select jsonb_object_agg(item,spent) from vvr.arena_consumable_stock where player_id=player and spent>0),'{}'::jsonb))
 );
end;
$$;

-- Railway records successful uses in the same SQLite transaction as combat.
-- Publishing absolute totals lets retries and out-of-order batches commute.
create function public.vvr_arena_consumable_spending(p_token_hash text,p_entries jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare
 entry record;
 player uuid;
 available_issued bigint;
begin
 if not exists(select from vvr.arena_publishers where name='railway' and token_hash=p_token_hash) then
  raise exception 'arena_publisher_required' using errcode='42501';
 end if;
 if jsonb_typeof(p_entries) is distinct from 'array' then
  raise exception 'arena_invalid_spending' using errcode='22023';
 end if;
 if jsonb_array_length(p_entries) not between 1 and 100 then
  raise exception 'arena_invalid_spending' using errcode='22023';
 end if;
 for entry in select * from jsonb_to_recordset(p_entries) as row(telegram text,item text,total bigint) order by telegram,item loop
  if entry.telegram is null or entry.telegram!~'^[1-9][0-9]{0,15}$' or not vvr.arena_consumable_kind(entry.item)
   or entry.total is null or entry.total<1 or entry.total>9007199254740991 then
   raise exception 'arena_invalid_spending' using errcode='22023';
  end if;
  select id into player from vvr.players where telegram_id=entry.telegram;
  if entry.item='potion' then
   select issued into available_issued from vvr.arena_potions where player_id=player;
  else
   select issued into available_issued from vvr.arena_consumable_stock where player_id=player and item=entry.item;
  end if;
  if available_issued is null or entry.total>available_issued then
   raise exception 'arena_unissued_spending' using errcode='22023';
  end if;
  if entry.item='potion' then
   insert into vvr.arena_consumable_stock(player_id,item,spent) values(player,entry.item,entry.total)
    on conflict(player_id,item) do update set spent=greatest(vvr.arena_consumable_stock.spent,excluded.spent);
  else
   update vvr.arena_consumable_stock set spent=greatest(spent,entry.total) where player_id=player and item=entry.item;
  end if;
 end loop;
 return true;
end;
$$;

revoke all on function public.vvr_arena_consumables(text,text,text,uuid,integer,bigint,text),
 public.vvr_arena_consumable_spending(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.vvr_arena_consumables(text,text,text,uuid,integer,bigint,text),
 public.vvr_arena_consumable_spending(text,jsonb) to service_role;
notify pgrst,'reload schema';
