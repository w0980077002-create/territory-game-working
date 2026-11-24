begin;
do $$
declare
 seller uuid := vvr.resolve_player('70101','Алиса');
 buyer uuid := vvr.resolve_player('70102','Борис');
 viewer uuid := vvr.resolve_player('70103','Вера');
 grant_event uuid := gen_random_uuid();
 asset uuid;
 operation uuid := gen_random_uuid();
 buy_operation uuid := gen_random_uuid();
 listing uuid;
 posted jsonb;
 first_trade jsonb;
 season uuid;
 score_event uuid := gen_random_uuid();
 at_time timestamptz := now()-interval '1 second';
begin
 assert vvr.resolve_player('70101','Алиса')=seller;
 assert not has_function_privilege('anon','public.vvr_community(uuid,text,jsonb)','EXECUTE');
 assert not has_function_privilege('authenticated','public.vvr_resolve_player(text,text)','EXECUTE');
 assert not has_function_privilege('service_role','vvr.issue_resource(uuid,text,uuid,text,integer)','EXECUTE');
 assert has_function_privilege('vvr_reward_writer','vvr.issue_resource(uuid,text,uuid,text,integer)','EXECUTE');
 assert not has_function_privilege('service_role','vvr.record_score(uuid,text,uuid,bigint,timestamptz)','EXECUTE');
 assert not has_table_privilege('service_role','vvr.wallets','UPDATE');

 assert vvr.issue_resource(buyer,'world_boss',grant_event,'gold',100);
 assert not vvr.issue_resource(buyer,'world_boss',grant_event,'gold',100);
 assert (select balance from vvr.wallets where player_id=buyer and resource='gold')=100;
 begin
  perform vvr.issue_resource(buyer,'world_boss',grant_event,'gold',101);
  raise exception 'conflicting reward was accepted';
 exception when unique_violation then null;
 end;

 asset := vvr.issue_item(seller,'world_boss',grant_event,'shield');
 assert vvr.issue_item(seller,'world_boss',grant_event,'shield')=asset;
 begin
  perform public.vvr_community(buyer,'trade',jsonb_build_object('kind','list','operationId',operation,'itemId',asset,'price',70));
  raise exception 'someone else listed the item';
 exception when unique_violation then null;
 end;
 first_trade:=public.vvr_community(seller,'trade',jsonb_build_object('kind','list','operationId',operation,'itemId',asset,'price',70));
 listing:=(first_trade->>'listingId')::uuid;
 assert first_trade=public.vvr_community(seller,'trade',jsonb_build_object('kind','list','operationId',operation,'itemId',asset,'price',70));
 assert jsonb_array_length(public.vvr_community(seller,'auction','{}')->'items')=0;
 begin
  perform public.vvr_community(viewer,'trade',jsonb_build_object('kind','buy','operationId',gen_random_uuid(),'listingId',listing));
  raise exception 'purchase without funds';
 exception when unique_violation then null;
 end;
 first_trade:=public.vvr_community(buyer,'trade',jsonb_build_object('kind','buy','operationId',buy_operation,'listingId',listing));
 assert first_trade=public.vvr_community(buyer,'trade',jsonb_build_object('kind','buy','operationId',buy_operation,'listingId',listing));
 assert (public.vvr_community(buyer,'auction','{}')->>'gold')::int=30;
 assert (public.vvr_community(seller,'auction','{}')->>'gold')::int=70;
 assert jsonb_array_length(public.vvr_community(seller,'auction','{}')->'history')=2;
 assert (public.vvr_community(buyer,'auction','{}')->'items'->0->>'id')::uuid=asset;
 assert vvr.issue_item(seller,'world_boss',grant_event,'shield')=asset;
 assert (select owner_id from vvr.network_items where id=asset)=buyer;

 operation:=gen_random_uuid();
 posted:=public.vvr_community(seller,'post',jsonb_build_object('operationId',operation,'text','  Привет  всем! '));
 assert posted->>'text'='Привет всем!';
 assert posted=public.vvr_community(seller,'post',jsonb_build_object('operationId',operation,'text','Привет всем!'));
 assert public.vvr_community(buyer,'chat','{}')->'messages'->0=posted;
 begin
  perform public.vvr_community(seller,'post',jsonb_build_object('operationId',gen_random_uuid(),'text','Слишком быстро'));
  raise exception 'post rate check was skipped';
 exception when sqlstate 'P0429' then null;
 end;
 begin
  perform public.vvr_community(buyer,'hide',jsonb_build_object('message',posted->'id'));
  raise exception 'ordinary member hid a message';
 exception when insufficient_privilege then null;
 end;
 insert into vvr.chat_moderators values(viewer);
 assert (public.vvr_community(viewer,'hide',jsonb_build_object('message',posted->'id'))->>'hidden')::boolean;
 assert jsonb_array_length(public.vvr_community(buyer,'chat','{}')->'messages')=0;

 insert into vvr.seasons(name,starts_at,ends_at) values('Северный сезон',now()-interval '1 day',now()+interval '1 day') returning id into season;
 assert vvr.record_score(seller,'world_boss_damage',score_event,100,at_time);
 assert not vvr.record_score(seller,'world_boss_damage',score_event,100,at_time);
 assert vvr.record_score(buyer,'world_boss_damage',score_event,100,at_time);
 assert jsonb_array_length(public.vvr_community(buyer,'ranking','{"metric":"world_boss_damage"}')->'rows')=2;
 assert (public.vvr_community(buyer,'ranking',jsonb_build_object('metric','world_boss_damage','season',season))->'rows'->1->>'rank')::int=1;
 assert jsonb_array_length(public.vvr_community(buyer,'ranking','{"metric":"arena_wins"}')->'rows')=0;
end;
$$;

-- Exercise the exact service role and reward writer path used by separate modules.
set local role service_role;
select public.vvr_resolve_player('70104','Дружинник') as player \gset
select public.vvr_community(:'player','auction','{}');
set local role vvr_reward_writer;
select vvr.issue_resource(:'player','world_boss','70104000-0000-0000-0000-000000000001','tokens',5);
select vvr.issue_item(:'player','world_boss','70104000-0000-0000-0000-000000000002','shield');
set local role vvr_score_writer;
select vvr.record_score(:'player','world_boss_damage','70104000-0000-0000-0000-000000000003',55,now());
rollback;
