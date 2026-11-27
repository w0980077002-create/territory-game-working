set local lock_timeout = '5s';

-- Paid gems use the existing W066 ledger. The internal resource key keeps
-- commercial credits outside the legacy gift-to-Solo delivery path.
alter table vvr.resource_receipts drop constraint resource_receipts_resource_check,
 add constraint resource_receipts_resource_check check (
  resource in ('gold','chaosite','tokens')
  or (source_kind='brotherhood' and resource in ('gems','horn','rune_scrolls','summon_seals','relic_shards'))
  or (source_kind='premium_gems' and resource='paid_gems')
  or (source_kind='premium_purchase' and resource='horn')
 );
alter table vvr.wallets drop constraint wallets_resource_check,
 add constraint wallets_resource_check check (resource in
  ('gold','chaosite','tokens','gems','horn','rune_scrolls','summon_seals','relic_shards','paid_gems'));

create unique index vvr_premium_credit_receipt_once
 on vvr.resource_receipts(source_id) where source_kind='premium_gems';

create table vvr.premium_purchase_orders (
 player_id uuid not null references vvr.players(id),
 operation_id uuid not null,
 sku text not null,
 price integer not null check (price>0),
 resource text not null,
 amount integer not null check (amount>0),
 created_at timestamptz not null default now(),
 primary key(player_id,operation_id)
);
alter table vvr.premium_purchase_orders enable row level security;
revoke all on vvr.premium_purchase_orders from public,anon,authenticated,service_role;

-- Catalog entries mirror existing prices. The network Horn consumes charges
-- from this wallet and has no dependency on the device's Horn counter.
create function vvr.premium_catalog()
returns table(sku text,price integer,resource text,amount integer)
language sql immutable set search_path=pg_catalog
as $$ values ('horn-10',10,'horn',10) $$;

-- Trusted server callers supply a stable receipt ID. No browser route issues paid funds.
create function public.vvr_premium_credit(p_player uuid,p_receipt uuid,p_amount integer)
returns boolean language sql security definer set search_path=pg_catalog
as $$ select vvr.issue_resource(p_player,'premium_gems',p_receipt,'paid_gems',p_amount) $$;

create function public.vvr_premium_wallet(p_player uuid,p_operation uuid default null,p_sku text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
 balance bigint;
 order_row vvr.premium_purchase_orders;
 product record;
begin
 if (p_operation is null)<>(p_sku is null) then
  raise exception 'invalid_premium_order' using errcode='22023';
 end if;
 if p_operation is null then
  if not exists(select from vvr.players where id=p_player) then
   raise exception 'verified_player_required' using errcode='42501';
  end if;
 else
  perform 1 from vvr.players where id=p_player for no key update;
  if not found then raise exception 'verified_player_required' using errcode='42501'; end if;
  select * into order_row from vvr.premium_purchase_orders where player_id=p_player and operation_id=p_operation;
  if found then
   if order_row.sku<>p_sku then raise exception 'premium_operation_conflict' using errcode='23505'; end if;
  else
   select * into product from vvr.premium_catalog() where sku=p_sku;
   if not found then raise exception 'unknown_premium_sku' using errcode='22023'; end if;
   update vvr.wallets w set balance=w.balance-product.price
    where w.player_id=p_player and w.resource='paid_gems' and w.balance>=product.price;
   if not found then
    return jsonb_build_object('status','insufficient','balance',coalesce((
     select w.balance from vvr.wallets w where w.player_id=p_player and w.resource='paid_gems'
    ),0));
   end if;
   perform vvr.issue_resource(p_player,'premium_purchase',p_operation,product.resource,product.amount);
   insert into vvr.premium_purchase_orders(player_id,operation_id,sku,price,resource,amount)
    values(p_player,p_operation,product.sku,product.price,product.resource,product.amount)
    returning * into order_row;
  end if;
 end if;
 select coalesce((select w.balance from vvr.wallets w where w.player_id=p_player and w.resource='paid_gems'),0) into balance;
 if p_operation is null then
  return jsonb_build_object('status','ok','balance',balance,'offers',(
   select jsonb_agg(to_jsonb(product_row) order by sku) from vvr.premium_catalog() product_row));
 end if;
 return jsonb_build_object('status','ok','balance',balance,
  'receipt',jsonb_build_object('operationId',order_row.operation_id,'sku',order_row.sku,'price',order_row.price,
   'resource',order_row.resource,'amount',order_row.amount));
end;
$$;

revoke all on function vvr.premium_catalog() from public,anon,authenticated,service_role;
revoke all on function public.vvr_premium_credit(uuid,uuid,integer),public.vvr_premium_wallet(uuid,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function public.vvr_premium_credit(uuid,uuid,integer),public.vvr_premium_wallet(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
