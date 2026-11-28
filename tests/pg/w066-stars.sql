begin;
do $$
declare
  owner_id uuid := vvr.resolve_player('40001','Stars owner');
  buyer uuid := vvr.resolve_player('40002','Buyer');
  r jsonb; o1 uuid; o2 uuid; t uuid:=gen_random_uuid();
begin
  insert into vvr.admin_access(player_id,role) values(owner_id,'owner');
  insert into vvr.admin_credentials(player_id,login,password_hash,unlocked_until)
   values(owner_id,'starsowner',extensions.crypt('stars-pass',extensions.gen_salt('bf',4)),clock_timestamp()+interval '1 hour');
  assert not has_table_privilege('service_role','vvr.stars_orders','SELECT');
  set local role service_role;
  -- Closed shop: players cannot order, the owner can, and only the owner sees the 1-Star test.
  assert public.vvr_stars_order(buyer,'gems-100')->>'status'='unavailable';
  assert public.vvr_stars_order(buyer,'test-1')->>'status'='unknown_offer';
  assert not (public.vvr_stars_offers(buyer)->>'open')::boolean;
  assert jsonb_path_exists(public.vvr_stars_offers(owner_id),'$.offers[*] ? (@.sku=="test-1")');
  r:=public.vvr_stars_order(owner_id,'test-1');o1:=(r->>'order')::uuid;
  assert r->>'stars'='1' and r->>'gems'='10',r::text;
  -- pre_checkout: only the ordering Telegram user and the exact price pass.
  assert public.vvr_stars_precheck(o1,'40001',1);
  assert not public.vvr_stars_precheck(o1,'40002',1);
  assert not public.vvr_stars_precheck(o1,'40001',2);
  -- successful_payment credits once per Telegram charge.
  assert public.vvr_stars_paid(o1,'40001',1,'charge-1')->>'status'='ok';
  assert public.vvr_stars_paid(o1,'40001',1,'charge-1')->>'status'='duplicate';
  assert public.vvr_stars_paid(o1,'40001',1,'charge-2')->>'status'='not_pending';
  assert public.vvr_stars_paid(gen_random_uuid(),'40001',5,'charge-3')->>'status'='unmatched';
  assert (public.vvr_stars_offers(owner_id)->>'balance')::int=10;
  assert not public.vvr_stars_precheck(o1,'40001',1),'paid orders cannot be paid twice';
  -- First purchase of a gem tier is doubled once.
  reset role;update vvr.network_features set enabled=true where name='stars_shop';set local role service_role;
  r:=public.vvr_stars_order(buyer,'gems-100');o2:=(r->>'order')::uuid;assert r->>'gems'='200',r::text;
  assert public.vvr_stars_paid(o2,'40002',50,'charge-4')->>'gems'='200';
  assert public.vvr_stars_order(buyer,'gems-100')->>'gems'='100';
  -- Transfer to the hero is idempotent and cannot overdraw.
  assert public.vvr_premium_transfer(buyer,t,150)->>'balance'='50';
  assert public.vvr_premium_transfer(buyer,t,150)->>'balance'='50';
  assert public.vvr_premium_transfer(buyer,gen_random_uuid(),51)->>'status'='insufficient';
  -- Refunds only while the gems are unspent; a failed Telegram refund restores them.
  assert public.vvr_stars_refund_begin(owner_id,o2)->>'status'='gems_spent';
  r:=public.vvr_stars_refund_begin(owner_id,o1);assert r->>'charge'='charge-1' and r->>'telegram'='40001',r::text;
  assert public.vvr_stars_refund_finish(owner_id,o1,false)->>'status'='restored';
  assert (public.vvr_stars_offers(owner_id)->>'balance')::int=10;
  perform public.vvr_stars_refund_begin(owner_id,o1);
  assert public.vvr_stars_refund_finish(owner_id,o1,true)->>'status'='refunded';
  assert (public.vvr_stars_offers(owner_id)->>'balance')::int=0;
  r:=public.vvr_finance_report(owner_id,30);
  -- The 1-Star test stays out of commercial figures; the unmatched charge is counted for a manual refund.
  assert (r->>'sales')::numeric=55 and (r->>'refunds')::numeric=0 and (r->>'test')::numeric=0 and (r->>'testCount')::int=1,r::text;
  assert (r->>'payers')::int=1 and (r->>'withdrawable')::numeric=0,r::text;
  begin
    perform public.vvr_finance_report(buyer,30);
    raise exception 'player read finance';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
