-- Existing items retain their identity, provenance and original (+0) attack.
alter table vvr.network_items add column enhancement_rank smallint not null default 0
  check(enhancement_rank between 0 and 40);

-- Match the current ordinary-item Forge settings: +5% of base per rank,
-- ceiling for stats and round(100 * 1.3^rank) for the next cost.
create function vvr.enhancement_gold(p_rank integer)
returns integer language sql immutable set search_path=pg_catalog
as $$ select round(100*power(1.3::numeric,p_rank))::integer; $$;

-- Use the current wallet and the same idempotent operations journal as trade.
create function public.vvr_enhance_item(p_player uuid,p_item uuid,p_expected integer,p_operation uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  current_rank integer;
  catalog text;
  price integer;
  command jsonb;
  previous vvr.auction_operations%rowtype;
  reply jsonb;
begin
  if p_player is null or p_item is null or p_operation is null
    or p_expected is null or p_expected not between 0 and 39 then
    raise exception 'invalid_enhancement_rank' using errcode='22023';
  end if;
  command:=jsonb_build_object('kind','enhance','itemId',p_item,'expectedRank',p_expected);
  perform pg_advisory_xact_lock(hashtextextended(p_player::text||':'||p_operation::text,811));
  select * into previous from vvr.auction_operations where actor_id=p_player and operation_id=p_operation;
  if found then
    if previous.command<>command then raise exception 'operation_conflict' using errcode='23505'; end if;
    return previous.result;
  end if;
  select enhancement_rank,catalog_id into current_rank,catalog from vvr.network_items
    where id=p_item and owner_id=p_player for update;
  if not found or vvr.item_attack_bonus(catalog)=0
    or exists(select 1 from vvr.auction_listings where item_id=p_item and status='open') then
    raise exception 'item_unavailable' using errcode='23505';
  end if;
  if current_rank<>p_expected then raise exception 'stale_enhancement_rank' using errcode='23505'; end if;
  price:=vvr.enhancement_gold(current_rank);
  update vvr.wallets set balance=balance-price
    where player_id=p_player and resource='gold' and balance>=price;
  if not found then raise exception 'insufficient_gold' using errcode='23505'; end if;
  update vvr.network_items set enhancement_rank=current_rank+1 where id=p_item;
  reply:=jsonb_build_object('operationId',p_operation,'kind','enhance','itemId',p_item,
    'price',price,'rank',current_rank+1,'at',statement_timestamp());
  insert into vvr.auction_operations(actor_id,operation_id,command,result) values(p_player,p_operation,command,reply);
  return reply;
end;
$$;

create or replace function vvr.hero_attack(p_player uuid)
returns integer language sql stable set search_path=pg_catalog
as $$
  select coalesce((select attack_power from vvr.hero_combat_stats where player_id=p_player),100)
    + coalesce((select ceil(vvr.item_attack_bonus(i.catalog_id)*(100+5*i.enhancement_rank)/100.0)::integer
      from vvr.hero_equipment e join vvr.network_items i on i.id=e.item_id and i.owner_id=e.player_id
      where e.player_id=p_player),0);
$$;

create or replace function public.vvr_equipment(p_player uuid,p_action text,p_item uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$
  select vvr.equipment(p_player,p_action,p_item)||jsonb_build_object('enhancements',
    coalesce((select jsonb_object_agg(i.id,jsonb_build_object('rank',i.enhancement_rank,
      'cost',case when i.enhancement_rank<40 then vvr.enhancement_gold(i.enhancement_rank) end))
      from vvr.network_items i where i.owner_id=p_player and vvr.item_attack_bonus(i.catalog_id)>0),'{}'::jsonb));
$$;

create or replace function vvr.auction_state(p_player uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'gold',coalesce((select balance from vvr.wallets where player_id=p_player and resource='gold'),0),
    'items',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select i.id,i.catalog_id as "catalogId",i.enhancement_rank as rank from vvr.network_items i where i.owner_id=p_player
        and not exists(select 1 from vvr.auction_listings l where l.item_id=i.id and l.status='open')
        order by i.id limit 100) q),'[]'::jsonb),
    'listings',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select l.id,l.price,i.catalog_id as "catalogId",i.enhancement_rank as rank,l.seller_id=p_player as mine
        from vvr.auction_listings l join vvr.network_items i on i.id=l.item_id
        where l.status='open' order by l.opened_at desc,l.id limit 50) q),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(q.result) from (
      select result from vvr.auction_operations where actor_id=p_player or other_player_id=p_player
        order by at desc,operation_id limit 100) q),'[]'::jsonb));
$$;

-- Read the same authoritative attack used by team Arena and World Boss.
-- Railway reuses the existing server-to-server publisher credential.
create function public.vvr_arena_hero(p_token_hash text,p_telegram text,p_name text)
returns integer language plpgsql security definer set search_path=pg_catalog
as $$
declare player uuid;
begin
  if not exists(select from vvr.arena_publishers where name='railway' and token_hash=p_token_hash) then
    raise exception 'arena_publisher_required' using errcode='42501';
  end if;
  select id into player from vvr.players where telegram_id=p_telegram;
  if not found then player:=vvr.resolve_player(p_telegram,p_name); end if;
  return vvr.hero_attack(player);
end;
$$;
revoke all on function vvr.enhancement_gold(integer),public.vvr_enhance_item(uuid,uuid,integer,uuid),public.vvr_arena_hero(text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.vvr_enhance_item(uuid,uuid,integer,uuid) to service_role;
grant execute on function public.vvr_arena_hero(text,text,text) to service_role;
notify pgrst,'reload schema';
