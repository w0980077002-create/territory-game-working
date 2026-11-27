-- Manual rollback for 20261127141117_vvr_premium_gem_wallet.
-- If a paid receipt, balance row or order exists, reconcile it from the
-- pre-migration backup before preparing a separate, reviewed rollback.
begin;
set local lock_timeout = '5s';

lock table vvr.premium_purchase_orders, vvr.resource_receipts, vvr.wallets
 in access exclusive mode;

do $$
begin
 if exists(select from vvr.premium_purchase_orders)
  or exists(select from vvr.wallets where resource='paid_gems')
  or exists(select from vvr.resource_receipts where source_kind in ('premium_gems','premium_purchase')) then
  raise exception 'premium_data_exists: reconcile paid balances and receipts before rollback';
 end if;
end;
$$;

drop function public.vvr_premium_wallet(uuid,uuid,text);
drop function public.vvr_premium_credit(uuid,uuid,integer);
drop function vvr.premium_catalog();
drop table vvr.premium_purchase_orders;
drop index vvr.vvr_premium_credit_receipt_once;

-- Restore the exact checks from 20261125052619_vvr_brotherhood.
alter table vvr.resource_receipts drop constraint resource_receipts_resource_check,
 add constraint resource_receipts_resource_check check (resource in
  ('gold','chaosite','tokens') or (source_kind='brotherhood' and resource in
  ('gems','horn','rune_scrolls','summon_seals','relic_shards')));
alter table vvr.wallets drop constraint wallets_resource_check,
 add constraint wallets_resource_check check (resource in
  ('gold','chaosite','tokens','gems','horn','rune_scrolls','summon_seals','relic_shards'));

notify pgrst,'reload schema';
commit;
