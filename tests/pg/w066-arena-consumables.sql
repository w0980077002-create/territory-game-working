begin;
set local plpgsql.check_asserts=on;
insert into vvr.arena_publishers values('railway',repeat('b',64))
 on conflict(name) do update set token_hash=excluded.token_hash;
do $$
declare
 token text:=repeat('b',64);
 telegram text:='84620';
 name text:='Arena V1 consumer';
 player uuid:=vvr.resolve_player(telegram,name);
 operation uuid:=gen_random_uuid();
 legacy uuid:=gen_random_uuid();
 result jsonb;
 item text;
 total bigint:=0;
 batch jsonb:='[]';
 items text[]:=array['potion','tear','berserk','thor','odin','niflheim','muspel','aegis','mars','mercury',
  'minerva','venom','fenrir','hel','loki','steel','neptune','apollo','valkyrie','bifrost'];
begin
 insert into vvr.wallets(player_id,resource,balance) values(player,'gold',1000);
 assert public.vvr_arena_potions(token,telegram,name,legacy,1,30)->>'issued'='1';
 result:=public.vvr_arena_consumables(token,telegram,name,legacy,1,30,'potion');
 assert result->'issued'->>'potion'='1' and result->>'gold'='970';
 foreach item in array items loop
  operation:=gen_random_uuid();
  result:=public.vvr_arena_consumables(token,telegram,name,operation,1,30,item);
  assert result->'issued'->>item=case when item='potion' then '2' else '1' end;
  assert public.vvr_arena_consumables(token,telegram,name,operation,1,30,item)=result;
  total:=total+1;
  batch:=batch||jsonb_build_array(jsonb_build_object('telegram',telegram,'item',item,'total',1));
 end loop;
 assert (select count(*) from jsonb_object_keys(result->'issued'))=20;
 assert result->>'gold'=(970-total*30)::text and result->'spent'='{}'::jsonb;
 assert vvr.auction_state(player)->'history'='[]'::jsonb;
 assert public.vvr_arena_consumables(token,telegram,name,gen_random_uuid(),2,30,'tear')->>'status'='price_changed';
 assert public.vvr_arena_consumables(token,telegram,name,gen_random_uuid(),1,371,'tear')->>'status'='insufficient';
 begin
  perform public.vvr_arena_consumables(token,telegram,name,operation,1,30,'tear');
  raise exception 'expected idempotency conflict';
 exception when unique_violation then null;
 end;
 begin
  perform public.vvr_arena_consumable_spending(token,batch||'[{"telegram":"84620","item":"tear","total":2}]');
  raise exception 'expected a rejected overdraft';
 exception when invalid_parameter_value then null;
 end;
 assert public.vvr_arena_consumables(token,telegram,name)->'spent'='{}'::jsonb;
 assert public.vvr_arena_consumable_spending(token,batch);
 assert public.vvr_arena_consumable_spending(token,'[{"telegram":"84620","item":"potion","total":2}]');
 assert public.vvr_arena_consumable_spending(token,batch);
 result:=public.vvr_arena_consumables(token,telegram,name);
 assert (select count(*) from jsonb_object_keys(result->'spent'))=20;
 assert result->'spent'->>'potion'='2' and result->'spent'->>'tear'='1';
 assert result->>'gold'='370';
 assert not has_function_privilege('authenticated','public.vvr_arena_consumables(text,text,text,uuid,integer,bigint,text)','execute');
 assert not has_function_privilege('anon','public.vvr_arena_consumable_spending(text,jsonb)','execute');
 assert not has_table_privilege('authenticated','vvr.arena_consumable_stock','select');
 begin
  perform public.vvr_arena_consumable_spending(repeat('c',64),batch);
  raise exception 'expected publisher authentication';
 exception when insufficient_privilege then null;
 end;
end;
$$;
rollback;
