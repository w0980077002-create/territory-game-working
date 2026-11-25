begin;
do $$
declare
  seller uuid:=vvr.resolve_player('73011','Winner');
  buyer uuid:=vvr.resolve_player('73012','Buyer');
  event_id uuid;
  item uuid;
  lot uuid;
  hit jsonb;
  upgrade_operation uuid:=gen_random_uuid();
  receipt jsonb;
  token_hash text:=repeat('a',64);
begin
  insert into vvr.world_boss_admins(telegram_id) values ('73011');
  perform public.vvr_world_boss_admin_start('73011','Loot test','minotaur_echo',
    now()-interval '10 sec',30,1000,'{"damageMin":500,"damageMax":500,"critChance":0}');
  select id into event_id from vvr.world_boss_events where status='open';
  perform public.vvr_world_boss_attack('73012','Buyer',gen_random_uuid());
  hit:=public.vvr_world_boss_attack('73011','Winner',gen_random_uuid())->'hit';
  assert (hit->>'killing')::boolean;
  assert (public.vvr_world_boss_claim('73011',event_id,'last_hit')->>'firstClaim')::boolean;
  assert not (public.vvr_world_boss_claim('73011',event_id,'last_hit')->>'firstClaim')::boolean;
  assert (select count(*) from vvr.network_items where source_id=event_id and owner_id=seller)=1;
  select id into item from vvr.network_items where source_id=event_id and owner_id=seller;

  begin
    perform public.vvr_equipment(buyer,'equip',item);
    raise exception 'Equipped an item still owned by another player';
  exception when unique_violation then null;
  end;
  assert (public.vvr_equipment(seller,'equip',item)->>'attack')::integer=110;
  begin
    perform public.vvr_community(seller,'trade',jsonb_build_object('kind','list','operationId',gen_random_uuid(),'itemId',item,'price',500));
    raise exception 'Listed equipped item';
  exception when unique_violation then null;
  end;
  perform public.vvr_equipment(seller,'unequip',item);

  perform public.vvr_world_boss_claim('73012',event_id,'participation');
  assert public.vvr_snapshot_store(buyer,0,gen_random_uuid(),'{"level":99,"gold":999999,"attack":999999}')=1;
  lot:=(public.vvr_community(seller,'trade',jsonb_build_object('kind','list','operationId',gen_random_uuid(),
    'itemId',item,'price',500))->>'listingId')::uuid;
  perform public.vvr_community(buyer,'trade',jsonb_build_object('kind','buy','operationId',gen_random_uuid(),'listingId',lot));
  assert (public.vvr_equipment(seller,'equipment',null)->>'attack')::int=100;
  assert (public.vvr_equipment(buyer,'equip',item)->>'attack')::int=110;
  assert (public.vvr_community(buyer,'auction','{}')->>'gold')::int=4500;
  assert (public.vvr_equipment(buyer,'equipment',null)->'enhancements'->item::text->>'cost')::int=100;
  assert not has_function_privilege('anon','public.vvr_enhance_item(uuid,uuid,integer,uuid)','EXECUTE');
  assert not has_function_privilege('service_role','vvr.set_hero_attack(uuid,bigint,integer)','EXECUTE');
  insert into vvr.arena_publishers(name,token_hash) values('railway',token_hash);
  begin
    perform public.vvr_arena_hero(repeat('b',64),'73012','Buyer');
    raise exception 'unauthorized publisher received trusted attack';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.vvr_enhance_item(seller,item,0,gen_random_uuid());
    raise exception 'former owner enhanced transferred item';
  exception when unique_violation then null;
  end;
  receipt:=public.vvr_enhance_item(buyer,item,0,upgrade_operation);
  assert receipt=public.vvr_enhance_item(buyer,item,0,upgrade_operation);
  assert (receipt->>'price')::int=100;
  assert vvr.enhancement_gold(61)<=1000000000 and vvr.enhancement_gold(62)>1000000000;
  begin
    perform public.vvr_enhance_item(buyer,item,1,upgrade_operation);
    raise exception 'a reused operation id changed the upgrade';
  exception when unique_violation then null;
  end;
  begin
    perform public.vvr_enhance_item(buyer,item,0,gen_random_uuid());
    raise exception 'old rank upgraded the same item twice';
  exception when unique_violation then null;
  end;
  assert (public.vvr_community(buyer,'auction','{}')->>'gold')::int=4400;
  assert (public.vvr_equipment(buyer,'equipment',null)->>'attack')::int=111;
  assert public.vvr_arena_hero(token_hash,'73012','Buyer')=111;
  lot:=(public.vvr_arena_join(buyer,'team','ranger')->>'id')::uuid;
  assert (public.vvr_arena_room(buyer,lot)->'roster'->0->>'attackPower')::int=111;
  assert public.vvr_arena_cancel(buyer,lot);
  assert (public.vvr_arena_join(buyer,'chaos','ranger')->'roster'->0->>'attackPower')::int=111;
  assert public.vvr_arena_cancel(buyer,(public.vvr_arena_current(buyer)->>'id')::uuid);
  assert (public.vvr_arena_join(seller,'chaos','ranger')->'roster'->0->>'attackPower')::int=100;


  perform public.vvr_world_boss_admin_start('73011','Second fight','minotaur_echo',
    now()-interval '10 sec',30,1000,'{"damageMin":500,"damageMax":500,"critChance":0}');
  hit:=public.vvr_world_boss_attack('73012','Buyer',gen_random_uuid())->'hit';
  assert (hit->>'damage')::int=555;
end;
$$;
rollback;
