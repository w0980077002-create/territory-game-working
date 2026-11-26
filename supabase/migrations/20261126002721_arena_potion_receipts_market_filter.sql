-- Keep the existing operation journal for retry-safe potion purchases.
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
      select result from vvr.auction_operations where (actor_id=p_player or other_player_id=p_player)
        and (command->>'kind') is distinct from 'arena_potion'
        order by at desc,operation_id limit 100) q),'[]'::jsonb));
$$;
