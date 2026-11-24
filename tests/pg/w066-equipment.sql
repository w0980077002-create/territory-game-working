begin;
do $$
declare
  seller uuid:=vvr.resolve_player('73011','Winner');
  buyer uuid:=vvr.resolve_player('73012','Buyer');
  event_id uuid;
  item uuid;
  lot uuid;
  hit jsonb;
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

  perform public.vvr_world_boss_admin_start('73011','Second fight','minotaur_echo',
    now()-interval '10 sec',30,1000,'{"damageMin":500,"damageMax":500,"critChance":0}');
  hit:=public.vvr_world_boss_attack('73012','Buyer',gen_random_uuid())->'hit';
  assert (hit->>'damage')::int=550;
end;
$$;
rollback;
