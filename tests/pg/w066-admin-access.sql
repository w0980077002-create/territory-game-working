begin;
do $$
declare
  owner_id uuid := vvr.resolve_player('10001','Test owner');
  operator_id uuid := vvr.resolve_player('10002','Test operator');
  target_id uuid := vvr.resolve_player('10003','Test player');
  purchase_id uuid := gen_random_uuid();
  used_id uuid := gen_random_uuid();
  credit_id uuid := gen_random_uuid();
  refund_id uuid := gen_random_uuid();
  horn_id uuid := gen_random_uuid();
  gifted_horn_id uuid := gen_random_uuid();
  player_arg jsonb := jsonb_build_object('player',target_id);
begin
  insert into vvr.admin_access(player_id,role) values(owner_id,'owner'),(operator_id,'operator');
  insert into vvr.admin_credentials(player_id,login,password_hash,unlocked_until)
   select id,'admin'||telegram_id,extensions.crypt('unused-password',extensions.gen_salt('bf',4)),clock_timestamp()+interval '1 hour'
   from vvr.players where id in (owner_id,operator_id);
  assert not has_function_privilege('anon','public.vvr_admin_find_player(uuid,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.vvr_admin_apply(uuid,uuid,text,text,jsonb)','EXECUTE');
  assert not has_function_privilege('service_role','vvr.vvr_premium_wallet_internal(uuid,uuid,text)','EXECUTE');
  assert not has_table_privilege('service_role','vvr.admin_access','INSERT');
  assert not has_table_privilege('service_role','vvr.admin_actions','UPDATE');

  set local role service_role;
  assert public.vvr_admin_find_player(owner_id,'10003')->>'id'=target_id::text;
  assert public.vvr_admin_find_player(operator_id,'10004') is null;
  assert public.vvr_admin_status(operator_id)->>'role'='operator';
  assert public.vvr_admin_status(owner_id)->'flags'->>'premium_shop'='false';
  assert public.vvr_admin_status(owner_id)->'history'->0->>'actor_telegram'='10002';
  assert public.vvr_premium_wallet(target_id)->>'purchaseAvailable'='false';
  assert public.vvr_premium_wallet(target_id,purchase_id,'horn-10')->>'status'='unavailable';
  begin
    perform public.vvr_admin_find_player(target_id,'10001');
    raise exception 'Non-admin admitted';
  exception when insufficient_privilege then
    null;
  end;
  assert public.vvr_admin_apply(owner_id,credit_id,'credit','Test incident',player_arg||'{"amount":30}') ->> 'status'='ok';
  assert public.vvr_admin_apply(owner_id,credit_id,'credit','Test incident',player_arg||'{"amount":30}') ->> 'status'='ok';
  assert public.vvr_premium_wallet(target_id)->>'balance'='30';
  begin
    perform public.vvr_admin_apply(owner_id,credit_id,'credit','Test incident',player_arg||'{"amount":31}');
    raise exception 'Conflicting operation id accepted';
  exception when unique_violation then
    null;
  end;
  assert public.vvr_admin_apply(owner_id,gen_random_uuid(),'flag','Test launch gate','{"name":"premium_shop","enabled":true}')
   ->>'status'='premium_requires_b5';
  reset role;
  update vvr.network_features set enabled=true where name='premium_shop';
  perform vvr.issue_resource(target_id,'brotherhood',gen_random_uuid(),'horn',1);

  set local role service_role;
  assert public.vvr_premium_wallet(target_id,purchase_id,'horn-10')->>'status'='ok';
  perform public.vvr_brotherhood_horn(target_id,'open',gifted_horn_id,jsonb_build_object('id','brotherhood-horn:'||gifted_horn_id));
  assert public.vvr_admin_apply(owner_id,refund_id,'cancel_purchase','Test cancellation',
    player_arg||jsonb_build_object('purchase',purchase_id))->>'status'='ok';
  assert public.vvr_admin_apply(owner_id,refund_id,'cancel_purchase','Test cancellation',
    player_arg||jsonb_build_object('purchase',purchase_id))->>'status'='ok';
  assert public.vvr_premium_wallet(target_id,purchase_id,'horn-10')->>'status'='refunded';
  assert public.vvr_premium_wallet(target_id)->>'balance'='30';
  perform public.vvr_brotherhood_horn(target_id,'ack',gifted_horn_id);
  assert public.vvr_premium_wallet(target_id,used_id,'horn-10')->>'status'='ok';
  perform public.vvr_brotherhood_horn(target_id,'open',horn_id,jsonb_build_object('id','brotherhood-horn:'||horn_id));
  assert public.vvr_admin_apply(owner_id,gen_random_uuid(),'cancel_purchase','Test cancellation',
    player_arg||jsonb_build_object('purchase',used_id))->>'status'='resource_spent';
  assert public.vvr_premium_wallet(target_id)->>'balance'='20';

  assert public.vvr_admin_apply(operator_id,gen_random_uuid(),'sanction','Test moderation',
    player_arg||'{"kind":"chat_mute","expiresAt":null}')->>'status'='ok';
  assert not public.vvr_network_policy('chat',target_id);
  assert not public.vvr_network_policy('arena_chat',target_id);
  assert public.vvr_network_policy('chat_view',target_id);
  assert public.vvr_network_policy('arena_ranked',target_id);
  assert public.vvr_admin_apply(owner_id,gen_random_uuid(),'lift','Test wrong role',
    player_arg||'{"kind":"chat_mute"}')->>'status'='sanction_role_mismatch';
  assert public.vvr_admin_apply(operator_id,gen_random_uuid(),'lift','Test same role',
    player_arg||'{"kind":"chat_mute"}')->>'status'='ok';
  assert public.vvr_network_policy('chat',target_id);
  assert public.vvr_admin_apply(operator_id,gen_random_uuid(),'sanction','Test trading ban',
    player_arg||'{"kind":"trade_ban","expiresAt":null}')->>'status'='ok';
  assert not public.vvr_network_policy('auction_trade',target_id);
  assert public.vvr_network_policy('arena_ranked',target_id);
  assert public.vvr_admin_apply(operator_id,gen_random_uuid(),'sanction','Test network ban',
    player_arg||jsonb_build_object('kind','network_ban','expiresAt',clock_timestamp()+interval '1 day'))->>'status'='ok';
  assert not public.vvr_network_policy('arena_team',target_id);
  assert not public.vvr_network_policy('brotherhood',target_id);
  assert public.vvr_network_policy('world_boss',target_id);
  assert public.vvr_premium_wallet(target_id,gen_random_uuid(),'horn-10')->>'status'='unavailable';
  assert public.vvr_admin_apply(owner_id,gen_random_uuid(),'flag','Test ranked disabled','{"name":"arena_ranked","enabled":false}')
   ->>'status'='ok';
  assert not public.vvr_network_policy('arena_team',owner_id);

  reset role;
  assert (select balance from vvr.wallets where wallets.player_id=target_id and resource='horn')=9;
  assert (select count(*) from vvr.admin_actions where operation=credit_id)=1;
  assert (select count(*) from vvr.admin_actions where operation=refund_id)=1;
end $$;
rollback;
