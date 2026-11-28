begin;
do $$
declare
 owner_id uuid:=vvr.resolve_player('54001','Red owner');
 buyer uuid:=vvr.resolve_player('54002','Red player');
 stranger uuid:=vvr.resolve_player('54003','Red second player');
 request_id uuid:=gen_random_uuid();
 dispatch_id uuid:=gen_random_uuid();
 withdraw_tx text:=repeat('a',64);
 fund_tx text:=repeat('b',64);
 fees_tx text:=repeat('c',64);
 past timestamptz:=clock_timestamp()-interval '1 hour';
 deposit jsonb;
 proof jsonb;
 command jsonb;
 audit jsonb;
begin
 insert into vvr.admin_access(player_id,role) values(owner_id,'owner');
 insert into vvr.admin_credentials(player_id,login,password_hash,unlocked_until)
 values(owner_id,'redowner',extensions.crypt('red-pass',extensions.gen_salt('bf',4)),clock_timestamp()+interval '1 hour');
 assert not has_function_privilege('anon','public.vvr_red_action(uuid,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.vvr_red_observe(jsonb)','execute');
 assert not has_table_privilege('service_role','vvr.red_treasury','update');
 assert public.vvr_red_action(buyer,'{"kind":"state"}') @> '{"status":"closed"}';
 assert public.vvr_red_action(owner_id,'{"kind":"admin_state"}') @> '{"enabled":false,"issuance":false,"withdrawals":false}';
 command:=jsonb_build_object('kind','fund','operation',gen_random_uuid(),'txid',fund_tx);
 assert public.vvr_red_action(owner_id,command)->>'status'='closed';
 begin
  perform public.vvr_red_action(buyer,command);
  raise exception 'player funded a reserve';
 exception when insufficient_privilege then null;
 end;
 deposit:=jsonb_build_object('kind','fund','txid',fund_tx,'network','testnet','asset','USDT','source','sender-fixture',
  'destination','vault-fixture','units','200000','fee_units','0','occurred_at',past,'request','');
 assert not public.vvr_red_observe(deposit);
 -- Test-only configuration. The whole fixture is rolled back.
 update vvr.red_treasury set enabled=true,network='testnet',asset='USDT',fee_asset='native',
  treasury_address='vault-fixture',fee_address='fee-fixture',address_pattern='^[a-z-]{4,60}$' where id;
 set local role service_role;
 assert public.vvr_red_action(owner_id,command)->>'status'='proof_required';
 assert not public.vvr_red_observe(deposit||'{"asset":"counterfeit"}');
 assert not public.vvr_red_observe(deposit||'{"destination":"other-fixture"}');
 assert public.vvr_red_observe(deposit);
 assert public.vvr_red_observe(deposit);
 assert not public.vvr_red_observe(deposit||'{"units":"400000"}');
 assert public.vvr_red_action(owner_id,command)->>'status'='ok';
 assert public.vvr_red_action(owner_id,command)->>'status'='ok';
 assert public.vvr_red_action(owner_id,command||jsonb_build_object('operation',gen_random_uuid()))->>'status'='proof_required';
 assert public.vvr_red_observe(deposit||jsonb_build_object('kind','fund_fee','txid',fees_tx,'asset','native',
  'destination','fee-fixture','units','1000'));
 assert public.vvr_red_action(owner_id,jsonb_build_object('kind','fund_fee','operation',gen_random_uuid(),'txid',fees_tx))->>'status'='ok';
 command:=jsonb_build_object('kind','award','operation',gen_random_uuid(),'player',buyer,
  'source','free_achievement','event',gen_random_uuid(),'units','80001');
 assert public.vvr_red_action(owner_id,command)->>'status'='closed';
 reset role;
 update vvr.red_treasury set issue_enabled=true where id;
 set local role service_role;
 assert public.vvr_red_action(owner_id,command||'{"units":"200001"}')->>'status'='unfunded';
 assert public.vvr_red_action(owner_id,command)->>'status'='ok';
 assert public.vvr_red_action(owner_id,command||jsonb_build_object('operation',gen_random_uuid()))->>'status'='duplicate_event';
 assert public.vvr_red_action(buyer,'{"kind":"state"}') @> '{"scale":10000,"available":"80001","held":"0"}';
 command:=jsonb_build_object('kind','request','operation',request_id,'units','50000','destination','receiver-fixture');
 assert public.vvr_red_action(buyer,command)->>'status'='closed';
 reset role;
 update vvr.red_treasury set withdrawals_enabled=true where id;
 set local role service_role;
 begin
  perform public.vvr_red_action(buyer,command||'{"units":"49999"}');
  raise exception 'below minimum was accepted';
 exception when invalid_parameter_value then null;
 end;
 assert public.vvr_red_action(buyer,command)->>'status'='ok';
 assert public.vvr_red_action(buyer,command)->>'status'='ok';
 assert public.vvr_red_action(buyer,command||jsonb_build_object('operation',gen_random_uuid()))->>'status'='request_pending';
 assert public.vvr_red_action(stranger,'{"kind":"state"}')->'requests'='[]';
 command:=jsonb_build_object('kind','settle','request',request_id,'operation',gen_random_uuid(),'txid',withdraw_tx);
 assert public.vvr_red_action(owner_id,command)->>'status'='invalid_transition';
 command:=jsonb_build_object('kind','approve','request',request_id,'operation',gen_random_uuid(),'fee_cap','1010');
 assert public.vvr_red_action(owner_id,command)->>'status'='fee_reserve_required';
 assert public.vvr_red_action(owner_id,command||'{"fee_cap":"100"}')->>'status'='ok';
 command:=jsonb_build_object('kind','dispatch','request',request_id,'operation',dispatch_id);
 assert public.vvr_red_action(owner_id,command)->>'status'='ok';
 assert public.vvr_red_action(owner_id,command)->>'status'='already_claimed';
 assert public.vvr_red_action(owner_id,command||jsonb_build_object('operation',gen_random_uuid()))->>'status'='invalid_transition';
 assert public.vvr_red_action(owner_id,jsonb_build_object('kind','reject','request',request_id,
  'operation',gen_random_uuid()))->>'status'='invalid_transition';
 command:=jsonb_build_object('kind','settle','request',request_id,'operation',gen_random_uuid(),'txid',withdraw_tx);
 assert public.vvr_red_action(owner_id,command)->>'status'='proof_required';
 proof:=jsonb_build_object('kind','payout','txid',withdraw_tx,'network','testnet','asset','USDT','source','vault-fixture',
  'destination','receiver-fixture','units','50000','fee_units','22','occurred_at',clock_timestamp(),'request',request_id);
 assert not public.vvr_red_observe(proof||'{"request":""}');
 assert public.vvr_red_observe(proof||jsonb_build_object('txid',repeat('d',64),'destination','wrong-fixture'));
 assert public.vvr_red_action(owner_id,command||jsonb_build_object('txid',repeat('d',64)))->>'status'='proof_mismatch';
 assert public.vvr_red_observe(proof||jsonb_build_object('txid',repeat('e',64),'occurred_at',past));
 assert public.vvr_red_action(owner_id,command||jsonb_build_object('txid',repeat('e',64)))->>'status'='proof_mismatch';
 assert public.vvr_red_observe(proof);
 assert public.vvr_red_action(owner_id,command)->>'status'='ok';
 assert public.vvr_red_action(owner_id,command)->>'status'='ok';
 assert public.vvr_red_action(owner_id,command||jsonb_build_object('operation',gen_random_uuid()))->>'status'='invalid_transition';
 audit:=public.vvr_red_action(owner_id,'{"kind":"admin_state"}');
 assert audit @> '{"reserve":"150000","fund":"119999","outstanding":"30001","fees":"978","feesHeld":"0"}',audit::text;
 assert public.vvr_red_action(buyer,'{"kind":"state"}') @> '{"available":"30001","held":"0"}';

 -- A late rejected review returns all funds. Approved/sending rows cannot be unwound by a user.
 command:=jsonb_build_object('kind','award','operation',gen_random_uuid(),'player',stranger,
  'source','free_achievement','event',gen_random_uuid(),'units','50000');
 assert public.vvr_red_action(owner_id,command)->>'status'='ok';
 request_id:=gen_random_uuid();
 assert public.vvr_red_action(stranger,jsonb_build_object('kind','request','operation',request_id,
  'units','50000','destination','receiver-fixture'))->>'status'='ok';
 reset role;
 update vvr.red_withdrawals set created_at=clock_timestamp()-interval '15 days' where id=request_id;
 set local role service_role;
 command:=jsonb_build_object('kind','approve','request',request_id,'operation',gen_random_uuid(),'fee_cap','0');
 assert public.vvr_red_action(owner_id,command)->>'status'='invalid_transition';
 assert public.vvr_red_action(owner_id,command-'fee_cap'||'{"kind":"reject"}')->>'status'='ok';
 assert public.vvr_red_action(stranger,'{"kind":"state"}') @> '{"available":"50000","held":"0"}';
 reset role;
 assert (select coalesce(sum(available+held),0) from vvr.red_wallets)=(select outstanding from vvr.red_treasury);
 assert (select coalesce(sum(fee_cap),0) from vvr.red_withdrawals where status in ('approved','sending'))=
  (select fees_held from vvr.red_treasury);
end $$;
rollback;
