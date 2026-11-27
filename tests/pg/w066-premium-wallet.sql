begin;
set local plpgsql.check_asserts=on;
do $$
declare
 player uuid:=vvr.resolve_player('84680','Premium test');
 other_player uuid:=vvr.resolve_player('84681','Other test');
 credit uuid:=gen_random_uuid();
 order_id uuid:=gen_random_uuid();
 result jsonb;
begin
 -- Solo wallet values and gift exports are separate from the commercial ledger.
 perform vvr.snapshot_store(player,0,gen_random_uuid(),'{"gems":1000000000,"paidGems":1000000000}');
 assert vvr.issue_resource(player,'brotherhood',gen_random_uuid(),'gems',90);
 assert public.vvr_premium_wallet(player)->>'balance'='0';
 assert vvr.brotherhood_solo_available(player)->>'gems'='90';
 assert public.vvr_premium_wallet(player,order_id,'horn-10')->>'status'='insufficient';
 assert not exists(select from vvr.premium_purchase_orders where player_id=player);

 assert public.vvr_premium_credit(player,credit,15);
 assert not public.vvr_premium_credit(player,credit,15);
 begin
  perform public.vvr_premium_credit(other_player,credit,15);
  raise exception 'expected credit identity conflict';
 exception when unique_violation then null;
 end;
 assert public.vvr_premium_wallet(other_player)->>'balance'='0';
 assert public.vvr_premium_wallet(player)->>'balance'='15';
 assert vvr.brotherhood_solo_available(player)->>'gems'='90';
 assert not(vvr.brotherhood_solo_available(player)?'paid_gems');

 result:=public.vvr_premium_wallet(player,order_id,'horn-10');
 assert result->>'balance'='5' and result#>>'{receipt,amount}'='10';
 assert result=public.vvr_premium_wallet(player,order_id,'horn-10');
 assert public.vvr_premium_wallet(player,gen_random_uuid(),'horn-10')->>'status'='insufficient';
 assert (select balance from vvr.wallets where player_id=player and resource='horn')=10;
 assert (select count(*) from vvr.resource_receipts where player_id=player and source_kind='premium_purchase')=1;
 begin
  perform public.vvr_premium_wallet(player,order_id,'other-sku');
  raise exception 'expected order conflict';
 exception when unique_violation then null;
 end;
 begin
  perform public.vvr_premium_wallet(player,gen_random_uuid(),'other-sku');
  raise exception 'expected unknown SKU rejection';
 exception when invalid_parameter_value then null;
 end;
 assert public.vvr_premium_wallet(player)->>'balance'='5';

 assert not has_function_privilege('authenticated','public.vvr_premium_credit(uuid,uuid,int)','execute');
 assert not has_function_privilege('anon','public.vvr_premium_wallet(uuid,uuid,text)','execute');
 assert not has_table_privilege('authenticated','vvr.premium_purchase_orders','select');
end;
$$;
rollback;
