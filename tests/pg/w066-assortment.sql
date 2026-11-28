begin;
do $$
declare
 buyer uuid:=vvr.resolve_player('53001','Buyer');
 viewer uuid:=vvr.resolve_player('53002','Viewer');
 owner_id uuid:=vvr.resolve_player('53003','Owner');
 season_no uuid;
 offer uuid;
 vip uuid;
 one_ad uuid;
 i int;
begin
 insert into vvr.admin_access(player_id,role) values(owner_id,'owner');
 insert into vvr.admin_credentials(player_id,login,password_hash,unlocked_until)
  values(owner_id,'stageowner',extensions.crypt('stage-pass',extensions.gen_salt('bf',4)),clock_timestamp()+interval '1 hour');
 assert public.vvr_assortment_order(buyer,'edition-north')->>'status'='unavailable';
 assert public.vvr_rewarded_ad_begin(buyer) is null;
 assert not has_function_privilege('anon','public.vvr_rewarded_ad_finish(uuid,text)','EXECUTE');
 update vvr.network_features set enabled=true where name in ('stars_shop','stars_assortment','rewarded_ads');
 assert public.vvr_stars_order(buyer,'edition-north')->>'status'='unknown_offer';
 assert public.vvr_assortment_order(buyer,'edition-pass')->>'status'='season_closed';
 insert into vvr.assortment_seasons(title,starts_at,ends_at)
  values('Test',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day') returning id into season_no;
 set local role service_role;
 offer:=(public.vvr_assortment_order(buyer,'edition-north')->>'order')::uuid;
 assert (public.vvr_assortment_order(buyer,'edition-north')->>'order')::uuid=offer;
 assert public.vvr_assortment_precheck(offer,'53002',150,'query')=false;
 assert public.vvr_assortment_precheck(offer,'53001',1,'query')=false;
 assert public.vvr_assortment_precheck(offer,'53001',150,'query');
 assert public.vvr_assortment_precheck(offer,'53001',150,'query');
 assert not public.vvr_assortment_precheck(offer,'53001',150,'other');
 assert public.vvr_stars_paid(offer,'53001',150,'assortment-charge')->>'status'='ok';
 assert public.vvr_stars_paid(offer,'53001',150,'assortment-charge')->>'status'='duplicate';
 assert public.vvr_assortment_state(buyer)->'owned' ? 'edition-north';
 assert public.vvr_assortment_order(buyer,'edition-north')->>'status'='owned';
 assert public.vvr_stars_offers(buyer)->>'balance'='0';
 assert public.vvr_stars_refund_begin(owner_id,offer)->>'status'='ok';
 assert not public.vvr_assortment_refunded(offer,'53002',150,'assortment-charge');
 assert public.vvr_assortment_refunded(offer,'53001',150,'assortment-charge');
 assert public.vvr_assortment_refunded(offer,'53001',150,'assortment-charge');
 assert not (public.vvr_assortment_state(buyer)->'owned' ? 'edition-north');
 vip:=(public.vvr_assortment_order(buyer,'edition-vip')->>'order')::uuid;
 assert public.vvr_assortment_precheck(vip,'53001',250,'vip-query');
 assert public.vvr_stars_paid(vip,'53001',250,'vip-charge')->>'status'='ok';
 assert public.vvr_assortment_state(buyer)->>'vipUntil' is not null;
 offer:=(public.vvr_assortment_order(buyer,'edition-pass')->>'order')::uuid;
 assert public.vvr_assortment_precheck(offer,'53001',500,'pass-query');
 assert public.vvr_stars_paid(offer,'53001',500,'pass-charge')->>'status'='ok';
 assert public.vvr_assortment_state(buyer)->'season' @> '{"pass":true,"freeGoal":false}';
 assert public.vvr_assortment_state(viewer)->'season' @> '{"pass":false,"freeGoal":false}';
 for i in 1..3 loop
  one_ad:=public.vvr_rewarded_ad_begin(buyer);
  assert one_ad is not null;
  assert public.vvr_rewarded_ad_begin(buyer)=one_ad;
  assert public.vvr_rewarded_ad_finish(one_ad,'ad-receipt-'||i);
  assert public.vvr_rewarded_ad_finish(one_ad,'ad-receipt-'||i);
 end loop;
 assert public.vvr_rewarded_ad_begin(buyer) is null;
 assert not public.vvr_rewarded_ad_finish(public.vvr_rewarded_ad_begin(viewer),'ad-receipt-1');
 assert public.vvr_assortment_state(buyer)->>'adTokens'='3';
 assert public.vvr_assortment_state(viewer)->>'adTokens'='0';
end $$;
rollback;
