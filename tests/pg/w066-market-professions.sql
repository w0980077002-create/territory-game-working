begin;
do $$
declare
 smith uuid:=vvr.resolve_player('52001','Smith');
 jeweler uuid:=vvr.resolve_player('52002','Jeweler');
 smith_material uuid; partner uuid; product uuid; request_id uuid; listing uuid;
 replay jsonb; op uuid:=gen_random_uuid();
begin
 update vvr.network_features set enabled=true where name='auction_trade';
 insert into vvr.wallets(player_id,resource,balance) values(smith,'gold',1000),(jeweler,'gold',1000);
 insert into vvr.campaign_boss_attempts(player_id,client_attempt,hero,seed,started_at,verified_at)
  values(smith,gen_random_uuid(),'berserker',1,clock_timestamp(),clock_timestamp()),
    (jeweler,gen_random_uuid(),'ranger',2,clock_timestamp(),clock_timestamp());
 assert not has_function_privilege('anon','public.vvr_market_workshop(uuid,uuid,jsonb)','EXECUTE');
 assert not has_table_privilege('service_role','vvr.market_requests','UPDATE');
 set local role service_role;
 assert public.vvr_market_workshop(smith,gen_random_uuid(),'{"kind":"choose","profession":"smith"}')->>'status'='ok';
 assert public.vvr_market_workshop(jeweler,gen_random_uuid(),'{"kind":"choose","profession":"jeweler"}')->>'status'='ok';
 smith_material:=(public.vvr_market_workshop(smith,op,'{"kind":"gather"}')->>'itemId')::uuid;
 assert (public.vvr_market_workshop(smith,op,'{"kind":"gather"}')->>'itemId')::uuid=smith_material;
 begin
  perform public.vvr_market_workshop(smith,gen_random_uuid(),'{"kind":"gather"}');
  raise exception 'gathered again';
 exception when insufficient_privilege then null;
 end;
 partner:=(public.vvr_market_workshop(jeweler,gen_random_uuid(),'{"kind":"gather"}')->>'itemId')::uuid;
 request_id:=(public.vvr_community(smith,'trade',jsonb_build_object('kind','request','operationId',gen_random_uuid(),
  'catalogId','craft-inlay','price',101))->>'requestId')::uuid;
 assert public.vvr_community(smith,'auction','{}')->>'gold'='899';
 begin
  perform public.vvr_community(smith,'trade',jsonb_build_object('kind','fulfill','operationId',gen_random_uuid(),
   'requestId',request_id,'itemId',partner));
  raise exception 'self purchase accepted';
 exception when insufficient_privilege then null;
 end;
 op:=gen_random_uuid();
 replay:=public.vvr_community(jeweler,'trade',jsonb_build_object('kind','fulfill','operationId',op,'requestId',request_id,'itemId',partner));
 assert replay->>'commission'='11',replay::text;
 assert replay->>'sellerNet'='90',replay::text;
 assert public.vvr_community(jeweler,'trade',jsonb_build_object('kind','fulfill','operationId',op,'requestId',request_id,'itemId',partner))=replay;
 assert public.vvr_community(jeweler,'auction','{}')->>'gold'='1090';
 assert (public.vvr_community(jeweler,'auction','{}')->'priceHistory'->0->>'catalogId')='craft-inlay';
 op:=gen_random_uuid();
 product:=(public.vvr_market_workshop(smith,op,jsonb_build_object('kind','craft','own',smith_material,'partner',partner))->>'itemId')::uuid;
 assert (public.vvr_market_workshop(smith,op,jsonb_build_object('kind','craft','own',smith_material,'partner',partner))->>'itemId')::uuid=product;
 assert public.vvr_community(smith,'auction','{}')->>'gold'='779';
 assert public.vvr_community(smith,'auction','{}')->'items'->0->>'catalogId'='workshop-blade';
 assert public.vvr_equipment(smith,'equip',product)->>'attack'='104';
 perform public.vvr_equipment(smith,'unequip',product);
 listing:=(public.vvr_community(smith,'trade',jsonb_build_object('kind','list','operationId',gen_random_uuid(),
  'itemId',product,'price',250))->>'listingId')::uuid;
 replay:=public.vvr_community(jeweler,'trade',jsonb_build_object('kind','buy','operationId',gen_random_uuid(),'listingId',listing));
 assert replay->>'commission'='25';
 assert public.vvr_community(smith,'auction','{}')->>'gold'='1004';
 assert public.vvr_community(jeweler,'auction','{}')->>'gold'='840';
 assert public.vvr_community(jeweler,'auction','{}')->'items'->0->>'id'=product::text;
 request_id:=(public.vvr_community(smith,'trade',jsonb_build_object('kind','request','operationId',gen_random_uuid(),
  'catalogId','craft-cloth','price',200))->>'requestId')::uuid;
 perform public.vvr_community(smith,'trade',jsonb_build_object('kind','withdraw','operationId',gen_random_uuid(),'requestId',request_id));
 assert public.vvr_community(smith,'auction','{}')->>'gold'='1004';
 listing:=(public.vvr_community(jeweler,'trade',jsonb_build_object('kind','list','operationId',gen_random_uuid(),
  'itemId',product,'price',300))->>'listingId')::uuid;
 replay:=public.vvr_community(smith,'trade',jsonb_build_object('kind','buy','operationId',gen_random_uuid(),'listingId',listing));
 assert replay->>'commission'='30';
 reset role;
 assert exists(select from vvr.network_items where id=product and owner_id=smith and issued_to=smith);
end $$;
rollback;
