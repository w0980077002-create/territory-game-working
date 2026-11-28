-- Opens no network feature. Online trade uses only the existing gold wallet and issued item IDs.
alter table vvr.network_items add column consumed_at timestamptz;
create table vvr.market_requests (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid not null references vvr.players(id),
 catalog_id text not null,
 price integer not null check(price between 10 and 1000000000),
 status text not null default 'open' check(status in ('open','filled','cancelled')),
 created_at timestamptz not null default clock_timestamp()
);
create index market_requests_buyer on vvr.market_requests(buyer_id,status,created_at);
create index market_requests_open on vvr.market_requests(created_at desc,id) where status='open';
alter table vvr.market_requests enable row level security;
revoke all on vvr.market_requests from public,anon,authenticated,service_role;
create index market_sales_by_time on vvr.auction_operations(at desc)
 where command->>'kind' in ('buy','fulfill') and result ? 'catalogId';

create table vvr.network_workshops (
 player_id uuid primary key references vvr.players(id),
 profession text not null check(profession in ('smith','leatherworker','tailor','jeweler')),
 gathered_on date
);
alter table vvr.network_workshops enable row level security;
revoke all on vvr.network_workshops from public,anon,authenticated,service_role;

create function vvr.workshop_catalog()
returns table(profession text, own_material text, partner_material text, product text, gold integer)
language sql immutable set search_path=pg_catalog as $$
 values ('smith','craft-ingot','craft-inlay','workshop-blade',120),
  ('leatherworker','craft-hide','craft-ingot','workshop-grip',120),
  ('tailor','craft-cloth','craft-hide','workshop-mantle',120),
  ('jeweler','craft-inlay','craft-cloth','workshop-charm',120)
$$;
revoke all on function vvr.workshop_catalog() from public,anon,authenticated,service_role;

create or replace function vvr.item_attack_bonus(p_catalog text)
returns integer language sql immutable set search_path=pg_catalog as $$
 select case when p_catalog='world-boss-trophy' then 10
  when p_catalog in ('workshop-blade','workshop-grip','workshop-mantle','workshop-charm') then 4 else 0 end
$$;

create function public.vvr_market_workshop(p_player uuid,p_operation uuid default null,p_body jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare workshop vvr.network_workshops; recipe record; old vvr.auction_operations; product_id uuid;
 verb text:=p_body->>'kind'; today date:=(statement_timestamp() at time zone 'UTC')::date;
 proof boolean; a uuid; b uuid; reply jsonb;
begin
 if not vvr.network_allowed(p_player,'auction_trade') then raise exception 'market_unavailable' using errcode='42501'; end if;
 select exists(select from vvr.campaign_boss_attempts where player_id=p_player and verified_at is not null) into proof;
 if p_operation is null and p_body='{}' then
  select * into workshop from vvr.network_workshops where player_id=p_player;
  return jsonb_build_object('profession',workshop.profession,'canGather',proof and workshop.profession is not null
   and workshop.gathered_on is distinct from today,'verified',proof);
 end if;
 if p_operation is null or verb is null or verb not in ('choose','gather','craft') then
  raise exception 'invalid_workshop_action' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_player::text||':'||p_operation::text,811));
 select * into old from vvr.auction_operations where actor_id=p_player and operation_id=p_operation;
 if found then
  if old.command<>p_body then raise exception 'operation_conflict' using errcode='23505'; end if;
  return old.result;
 end if;
 if verb='choose' then
  insert into vvr.network_workshops(player_id,profession) select p_player,profession from vvr.workshop_catalog()
   where profession=p_body->>'profession' on conflict do nothing;
  if not found then raise exception 'profession_already_selected_or_invalid' using errcode='23505'; end if;
 else
  select * into workshop from vvr.network_workshops where player_id=p_player for update;
  if not found then raise exception 'profession_required' using errcode='42501'; end if;
  select * into strict recipe from vvr.workshop_catalog() where profession=workshop.profession;
  if verb='gather' then
   if not proof or workshop.gathered_on=today then raise exception 'gather_unavailable' using errcode='42501'; end if;
   update vvr.network_workshops set gathered_on=today where player_id=p_player;
   product_id:=vvr.issue_item(p_player,'workshop_material',p_operation,recipe.own_material);
  else
   a:=(p_body->>'own')::uuid; b:=(p_body->>'partner')::uuid;
   perform 1 from vvr.network_items where id in (a,b) and owner_id=p_player order by id for update;
   if not exists(select from vvr.network_items where id=a and owner_id=p_player and catalog_id=recipe.own_material and consumed_at is null)
     or not exists(select from vvr.network_items where id=b and owner_id=p_player and catalog_id=recipe.partner_material and consumed_at is null)
     or exists(select from vvr.auction_listings where item_id in (a,b) and status='open') then
    raise exception 'materials_unavailable' using errcode='23505';
   end if;
   update vvr.wallets set balance=balance-recipe.gold where player_id=p_player and resource='gold' and balance>=recipe.gold;
   if not found then raise exception 'insufficient_gold' using errcode='23505'; end if;
   update vvr.network_items set consumed_at=statement_timestamp() where id in (a,b);
   product_id:=vvr.issue_item(p_player,'workshop_product',p_operation,recipe.product);
  end if;
 end if;
 reply:=jsonb_build_object('status','ok','itemId',product_id);
 insert into vvr.auction_operations(actor_id,operation_id,command,result)
 values(p_player,p_operation,p_body,reply);
 return reply;
end;
$$;
revoke all on function public.vvr_market_workshop(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.vvr_market_workshop(uuid,uuid,jsonb) to service_role;

create or replace function vvr.auction_trade(p_player uuid,p_operation uuid,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog
as $$
declare
  verb text := p_command->>'kind';
  listing vvr.auction_listings%rowtype;
  old vvr.auction_operations%rowtype;
  asset uuid;
  other_player uuid;
  price integer;
  fee integer;
  catalog text;
  demand vvr.market_requests;
  reply jsonb;
begin
  if p_operation is null or verb is null or verb not in ('list','buy','cancel','request','withdraw','fulfill') then
    raise exception 'invalid_trade' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_player::text || ':' || p_operation::text,811));
  select * into old from vvr.auction_operations where actor_id=p_player and operation_id=p_operation;
  if found then
    if old.command<>p_command then raise exception 'operation_conflict' using errcode='23505'; end if;
    return old.result;
  end if;

  if verb in ('request','withdraw','fulfill') then
    if verb='request' then
      price := (p_command->>'price')::integer;
      catalog := p_command->>'catalogId';
      if price is null or price not between 10 and 1000000000 or catalog is null
        or (catalog <> 'world-boss-trophy' and not exists(select from vvr.workshop_catalog()
            where catalog in (own_material,product))) then
        raise exception 'invalid_request' using errcode='22023';
      end if;
      perform 1 from vvr.players where id=p_player for no key update;
      if (select count(*) from vvr.market_requests where buyer_id=p_player and status='open')>=10 then
        raise exception 'request_limit' using errcode='23505';
      end if;
      update vvr.wallets set balance=balance-price where player_id=p_player and resource='gold' and balance>=price;
      if not found then raise exception 'insufficient_gold' using errcode='23505'; end if;
      insert into vvr.market_requests(buyer_id,catalog_id,price) values(p_player,catalog,price) returning * into demand;
    else
      select * into demand from vvr.market_requests where id=(p_command->>'requestId')::uuid for update;
      if not found or demand.status<>'open' then raise exception 'request_unavailable' using errcode='23505'; end if;
      price:=demand.price;
      catalog:=demand.catalog_id;
      if verb='withdraw' then
        if demand.buyer_id<>p_player then raise exception 'buyer_required' using errcode='42501'; end if;
        update vvr.wallets set balance=balance+price where resource='gold' and player_id=p_player and balance<=1000000000-price;
        if not found then raise exception 'wallet_full' using errcode='23505'; end if;
        update vvr.market_requests set status='cancelled' where id=demand.id;
      else
        if demand.buyer_id=p_player then raise exception 'self_purchase' using errcode='42501'; end if;
        if demand.created_at<=statement_timestamp()-interval '72 hours' then
          raise exception 'request_expired' using errcode='23505';
        end if;
        asset:=(p_command->>'itemId')::uuid;
        perform 1 from vvr.network_items where id=asset and owner_id=p_player and catalog_id=catalog
          and consumed_at is null and enhancement_rank=0 for update;
        if not found or exists(select from vvr.hero_equipment where item_id=asset)
          or exists(select from vvr.auction_listings where item_id=asset and status='open') then
          raise exception 'item_unavailable' using errcode='23505';
        end if;
        fee:=(price+9)/10;
        insert into vvr.wallets(player_id,resource,balance) values(p_player,'gold',0) on conflict do nothing;
        update vvr.wallets set balance=balance+price-fee
         where player_id=p_player and resource='gold' and balance<=1000000000-price+fee;
        if not found then raise exception 'seller_wallet_full' using errcode='23505'; end if;
        update vvr.network_items set owner_id=demand.buyer_id where id=asset;
        update vvr.market_requests set status='filled' where id=demand.id;
        other_player:=demand.buyer_id;
      end if;
    end if;
    reply:=jsonb_build_object('operationId',p_operation,'kind',verb,'requestId',demand.id,
      'itemId',asset,'catalogId',catalog,'price',price,'commission',fee,'sellerNet',price-fee,'at',statement_timestamp());
  elsif verb='list' then
    asset := (p_command->>'itemId')::uuid;
    price := (p_command->>'price')::integer;
    if price is null or price<10 or price>1000000000 then
      raise exception 'invalid_price' using errcode='22023';
    end if;
    perform 1 from vvr.players where id=p_player for no key update;
    if (select count(*) from vvr.auction_listings where seller_id=p_player and status='open')>=10 then
      raise exception 'listing_limit' using errcode='23505';
    end if;
    perform 1 from vvr.network_items where id=asset and owner_id=p_player and consumed_at is null for update;
    if not found or exists(select 1 from vvr.auction_listings where item_id=asset and status='open') then
      raise exception 'item_unavailable' using errcode='23505';
    end if;
    insert into vvr.wallets(player_id,resource,balance) values(p_player,'gold',0) on conflict do nothing;
    insert into vvr.auction_listings(item_id,seller_id,price)
      values(asset,p_player,price) returning * into listing;
  else
    select * into listing from vvr.auction_listings where id=(p_command->>'listingId')::uuid for update;
    if not found or listing.status<>'open' then raise exception 'listing_unavailable' using errcode='23505'; end if;
    if verb='cancel' then
      if listing.seller_id<>p_player then raise exception 'seller_required' using errcode='42501'; end if;
      update vvr.auction_listings set status='cancelled' where id=listing.id;
    else
      if listing.seller_id=p_player then raise exception 'self_purchase' using errcode='42501'; end if;
      if listing.opened_at<=statement_timestamp()-interval '72 hours' then
        raise exception 'listing_expired' using errcode='23505';
      end if;
      fee:=(listing.price+9)/10;
      select catalog_id into catalog from vvr.network_items where id=listing.item_id;
      -- All sales lock the two wallets in the same order, including reciprocal purchases.
      perform 1 from vvr.wallets where resource='gold' and player_id in (p_player,listing.seller_id)
        order by player_id for update;
      update vvr.wallets set balance=balance-listing.price
        where resource='gold' and player_id=p_player and balance>=listing.price;
      if not found then raise exception 'insufficient_gold' using errcode='23505'; end if;
      update vvr.wallets set balance=balance+listing.price-fee
        where resource='gold' and player_id=listing.seller_id and balance<=1000000000-listing.price+fee;
      if not found then raise exception 'seller_wallet_full' using errcode='23505'; end if;
      update vvr.network_items set owner_id=p_player where id=listing.item_id and owner_id=listing.seller_id;
      if not found then raise exception 'item_unavailable' using errcode='23505'; end if;
      update vvr.auction_listings set status='sold',buyer_id=p_player where id=listing.id;
      other_player:=listing.seller_id;
    end if;
  end if;
  if reply is null then
    reply:=jsonb_build_object('operationId',p_operation,'kind',verb,'listingId',listing.id,
      'itemId',listing.item_id,'catalogId',catalog,'price',listing.price,'commission',fee,
      'sellerNet',listing.price-fee,'at',statement_timestamp());
  end if;
  insert into vvr.auction_operations(actor_id,operation_id,command,result,other_player_id)
    values(p_player,p_operation,p_command,reply,other_player);
  return reply;
end;
$$;

create or replace function vvr.auction_state(p_player uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'gold',coalesce((select balance from vvr.wallets where player_id=p_player and resource='gold'),0),
    'items',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select i.id,i.catalog_id as "catalogId",i.enhancement_rank as rank from vvr.network_items i where i.owner_id=p_player and i.consumed_at is null
        and not exists(select 1 from vvr.auction_listings l where l.item_id=i.id and l.status='open')
        order by i.id limit 100) q),'[]'::jsonb),
    'listings',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select l.id,l.price,i.catalog_id as "catalogId",i.enhancement_rank as rank,l.seller_id=p_player as mine,
       l.opened_at<=statement_timestamp()-interval '72 hours' as expired
        from vvr.auction_listings l join vvr.network_items i on i.id=l.item_id
        where l.status='open' and (l.seller_id=p_player or l.opened_at>statement_timestamp()-interval '72 hours') order by l.opened_at desc,l.id limit 50) q),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select r.id,r.catalog_id as "catalogId",r.price,r.buyer_id=p_player as mine,
        r.created_at<=statement_timestamp()-interval '72 hours' as expired
      from vvr.market_requests r where r.status='open'
       and (r.buyer_id=p_player or r.created_at>statement_timestamp()-interval '72 hours')
      order by r.created_at desc,r.id limit 50) q),'[]'::jsonb),
    'priceHistory',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select result->>'catalogId' as "catalogId",(result->>'price')::integer as price,at
       from vvr.auction_operations where command->>'kind' in ('buy','fulfill') and result ? 'catalogId'
       order by at desc limit 50) q),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(q.result) from (
      select result from vvr.auction_operations where (actor_id=p_player or other_player_id=p_player)
        and command->>'kind' in ('list','buy','cancel','enhance','request','withdraw','fulfill')
        order by at desc,operation_id limit 100) q),'[]'::jsonb));
$$;

notify pgrst,'reload schema';
