begin;
do $$
declare
  actor uuid:=vvr.resolve_player('79991','Gift owner');
  other uuid:=vvr.resolve_player('79992','Other player');
  opening uuid:=gen_random_uuid();
  alternate uuid:=gen_random_uuid();
  horn uuid:=gen_random_uuid();
  received jsonb;
  gift jsonb:='{"gold":2000,"gems":100,"chaosite":30,"rune_scrolls":40,"summon_seals":3,"relic_shards":10}';
  line record;
  trophy uuid;
begin
  assert not has_function_privilege('anon','public.vvr_brotherhood_horn(uuid,text,uuid,jsonb)','EXECUTE');
  assert not has_function_privilege('service_role','vvr.brotherhood_solo_available(uuid)','EXECUTE');
  assert not has_table_privilege('authenticated','vvr.brotherhood_horn_openings','SELECT');
  assert vvr.issue_resource(actor,'world_boss',gen_random_uuid(),'gold',700);
  assert vvr.issue_resource(actor,'world_boss',gen_random_uuid(),'chaosite',12);
  assert public.vvr_brotherhood_horn(actor,'solo_state')->'available'='{}'::jsonb;
  for line in select * from jsonb_each_text(gift) loop
    assert vvr.issue_resource(actor,'brotherhood',gen_random_uuid(),line.key,line.value::integer);
  end loop;
  assert vvr.issue_resource(actor,'brotherhood',gen_random_uuid(),'horn',20);
  assert public.vvr_brotherhood_horn(actor,'solo_state')->'available'=gift;
  received:=public.vvr_brotherhood_horn(actor,'solo_open',opening);
  assert received#>'{pending,item,resources}'=gift;
  assert received#>>'{wallet,gold}'='700';
  assert received#>>'{wallet,chaosite}'='12';
  assert received#>>'{wallet,horn}'='20';
  assert public.vvr_brotherhood_horn(actor,'solo_open',alternate)=received;
  assert public.vvr_brotherhood_horn(other,'solo_ack',opening)->>'status'='unavailable';
  assert public.vvr_brotherhood_horn(actor,'ack',opening)->>'status'='unavailable';
  assert public.vvr_brotherhood_horn(actor,'open',horn,jsonb_build_object('id','brotherhood-horn:'||horn))->>'charges'='19';
  assert public.vvr_brotherhood_horn(actor,'solo_state')#>>'{pending,id}'=opening::text;
  assert public.vvr_brotherhood_horn(actor,'solo_ack',opening)->>'status'='delivered';
  assert public.vvr_brotherhood_horn(actor,'solo_ack',opening)->>'status'='delivered';
  assert public.vvr_brotherhood_horn(actor,'solo_open',alternate)->'pending'='null'::jsonb;
  assert not exists(select from vvr.solo_snapshots where player_id=actor);

  -- A gold gift already spent in the network must stay spent even after
  -- a later non-gift credit.
  assert vvr.issue_resource(actor,'brotherhood',gen_random_uuid(),'gold',100);
  update vvr.resource_receipts set issued_at=clock_timestamp()-interval '1 min'
    where player_id=actor and source_kind='brotherhood' and resource='gold' and amount=100;
  trophy:=vvr.issue_item(actor,'fixtures',gen_random_uuid(),'world-boss-trophy');
  perform public.vvr_enhance_item(actor,trophy,0,gen_random_uuid());
  assert vvr.issue_resource(actor,'world_boss',gen_random_uuid(),'gold',20);
  assert public.vvr_brotherhood_horn(actor,'solo_state')->'available'='{}'::jsonb;
  assert public.vvr_brotherhood_horn(actor,'solo_state')#>>'{wallet,gold}'='720';
end;
$$;
rollback;
