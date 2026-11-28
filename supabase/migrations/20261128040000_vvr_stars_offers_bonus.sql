-- Shop cards mark the one-time ×2 first purchase explicitly; prices, amounts and payment logic are unchanged.
create or replace function public.vvr_stars_offers(p_player uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare admin boolean:=exists(select from vvr.admin_access where player_id=p_player);
begin
 return jsonb_build_object(
  'open',vvr.network_allowed(p_player,'stars_shop'),
  'admin',admin,
  'balance',vvr.paid_gems(p_player),
  'offers',(select coalesce(jsonb_agg(jsonb_build_object('sku',o.sku,'kind',o.kind,'title',o.title,'stars',o.stars,
     'bonus',b.bonus,'gems',o.gems*case when b.bonus then 2 else 1 end) order by o.sort),'[]'::jsonb)
   from vvr.stars_offers o cross join lateral (select o.first_bonus and not exists(select from vvr.stars_orders s
     where s.player_id=p_player and s.sku=o.sku and s.status in ('paid','refunding')) as bonus) b
   where o.active and (o.kind<>'test' or admin)));
end;
$$;
notify pgrst,'reload schema';
