begin;
do $$
declare
 owner_id uuid:=vvr.resolve_player('51001','Shipyard owner');
 buyer uuid:=vvr.resolve_player('51002','Buyer');
 stranger uuid:=vvr.resolve_player('51003','Stranger');
 ship uuid; refunded uuid; replay jsonb; level_no int; ver int; balance int;
begin
 insert into vvr.admin_access(player_id,role) values(owner_id,'owner');
 insert into vvr.admin_credentials(player_id,login,password_hash,unlocked_until)
  values(owner_id,'shipowner',extensions.crypt('ship-pass',extensions.gen_salt('bf',4)),clock_timestamp()+interval '1 hour');
 assert not has_function_privilege('anon','public.vvr_shipyard_paid(uuid,text,uuid,int,int,text)','execute');
 assert not has_table_privilege('service_role','vvr.paid_hulls','SELECT');
 assert public.vvr_shipyard_order(buyer,'scout')->>'status'='unavailable';
 update vvr.network_features set enabled=true where name='stars_shop';
 assert public.vvr_shipyard_order(buyer,'scout')->>'status'='unavailable';
 assert public.vvr_stars_order(owner_id,'ship-scout')->>'status'='unknown_offer';
 update vvr.network_features set enabled=true where name='shipyard_stars';
 set local role service_role;
 replay:=public.vvr_shipyard_order(buyer,'warship');
 assert replay->>'stars'='250',replay::text;
 ship:=(replay->>'order')::uuid;
 assert public.vvr_shipyard_order(buyer,'warship')->>'order'=ship::text;
 assert public.vvr_shipyard_order(buyer,'odin')->>'status'='invoice_pending';
 assert not public.vvr_shipyard_precheck(ship,'51003',250,'query-a');
 assert not public.vvr_shipyard_precheck(ship,'51002',249,'query-a');
 assert public.vvr_shipyard_precheck(ship,'51002',250,'query-a');
 assert public.vvr_shipyard_precheck(ship,'51002',250,'query-a');
 assert not public.vvr_shipyard_precheck(ship,'51002',250,'query-b');
 assert public.vvr_stars_paid(ship,'51002',250,'shipyard-charge-a')->>'status'='ok';
 assert public.vvr_stars_paid(ship,'51002',250,'shipyard-charge-a')->>'status'='duplicate';
 assert public.vvr_shipyard_order(buyer,'scout')->>'status'='occupied';
 assert public.vvr_shipyard_paid(stranger,'upgrade',ship,2)->>'status'='unavailable';
 assert public.vvr_shipyard_paid(buyer,'salvage',ship,2)->>'status'='hold';
 assert public.vvr_shipyard_paid(buyer,'upgrade',ship,2)->>'status'='insufficient';
 assert public.vvr_shipyard_paid(buyer,'launch',ship,2,4)->>'status'='ok';
 assert public.vvr_shipyard_paid(buyer,'launch',ship,2,4)->>'status'='stale';
 assert public.vvr_shipyard_paid(buyer,'claim',ship,3)->>'status'='not_ready';
 begin
  perform public.vvr_stars_refund_begin(owner_id,ship);
  raise exception 'used ship returned';
 exception when invalid_parameter_value then null;
 end;
 reset role;
 update vvr.paid_hulls set voyage=jsonb_set(voyage,'{endsAt}',to_jsonb(clock_timestamp()-interval '1 minute')) where order_id=ship;
 set local role service_role;
 assert public.vvr_shipyard_paid(buyer,'claim',ship,3)->>'status'='ok';
 assert public.vvr_shipyard_paid(buyer,'claim',ship,3)->>'status'='stale';
 assert public.vvr_shipyard_paid(buyer,'repair',ship,4)->>'status'='ok';
 assert public.vvr_shipyard_paid(buyer,'state')->>'gold'='295';
 reset role;
 -- Supply test state is confined to this rollback transaction.
 update vvr.paid_harbor set gold=gold+15100,materials=materials+64 where player_id=buyer;
 update vvr.stars_orders set paid_at=clock_timestamp()-interval '22 days' where id=ship;
 set local role service_role;
 for level_no in 1..4 loop
  ver:=4+level_no;
  assert public.vvr_shipyard_paid(buyer,'upgrade',ship,ver)->>'status'='ok';
  assert public.vvr_shipyard_paid(buyer,'upgrade',ship,ver)->>'status'='stale';
 end loop;
 assert public.vvr_shipyard_paid(buyer,'salvage',ship,9)->>'compensation'='700';
 assert public.vvr_shipyard_paid(buyer,'salvage',ship,9)->>'compensation'='700';
 assert public.vvr_stars_offers(buyer)->>'balance'='700';
 assert public.vvr_shipyard_paid(buyer,'state')->>'gold'='295';
 begin
  perform public.vvr_stars_refund_begin(owner_id,ship);
  raise exception 'salvaged ship returned';
 exception when invalid_parameter_value then null;
 end;
 replay:=public.vvr_shipyard_order(stranger,'scout');
 refunded:=(replay->>'order')::uuid;
 assert public.vvr_shipyard_precheck(refunded,'51003',250,'query-c');
 assert public.vvr_stars_paid(refunded,'51003',250,'shipyard-charge-c')->>'status'='ok';
 assert public.vvr_shipyard_refund_begin(owner_id,refunded)@>'{"status":"ok","ship":true}';
 assert public.vvr_shipyard_paid(stranger,'salvage',refunded,3)->>'status'='unavailable';
 assert not public.vvr_shipyard_refunded(refunded,'51003','wrong-charge',250);
 assert public.vvr_shipyard_refunded(refunded,'51003','shipyard-charge-c',250);
 assert public.vvr_shipyard_refunded(refunded,'51003','shipyard-charge-c',250);
 assert public.vvr_stars_offers(stranger)->>'balance'='0';
 assert public.vvr_shipyard_order(stranger,'odin')->>'status'='ok';
 assert not public.vvr_shipyard_refunded(ship,'51003','shipyard-charge-a',250);
 assert public.vvr_shipyard_refunded(ship,'51002','shipyard-charge-a',250);
 assert public.vvr_shipyard_order(buyer,'scout')->>'status'='unavailable';
 reset role;
 select count(*) into balance from vvr.finance_ledger where kind='stars_refund' and ref='shipyard-charge-c';
 assert balance=1;
end $$;
rollback;
