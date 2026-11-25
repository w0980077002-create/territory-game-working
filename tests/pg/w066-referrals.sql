-- All fixtures live in the scratch cluster.
do $$
declare
  inviter_a uuid := public.vvr_resolve_player('79201','Referral A');
  inviter_b uuid := public.vvr_resolve_player('79202','Referral B');
  existing_player uuid := public.vvr_resolve_player('79203','Existing player');
  newcomer uuid;
  no_inviter uuid;
  page jsonb;
begin
  assert public.vvr_resolve_referred_player('79201','Referral A',inviter_a)=inviter_a;
  assert public.vvr_resolve_referred_player('79203','Existing player',inviter_b)=existing_player;
  no_inviter:=public.vvr_resolve_referred_player('79205','Unknown link',gen_random_uuid());
  assert public.vvr_resolve_referred_player('79205','Unknown link retry',inviter_b)=no_inviter;
  assert not exists(select from vvr.referrals);

  newcomer:=public.vvr_resolve_referred_player('79204','Newcomer',inviter_a);
  assert public.vvr_resolve_referred_player('79204','Newcomer',inviter_a)=newcomer;
  assert public.vvr_resolve_referred_player('79204','Newcomer',inviter_b)=newcomer;
  assert (select count(*) from vvr.referrals)=1;
  assert (select inviter_id from vvr.referrals where invitee_id=newcomer)=inviter_a;
  page:=public.vvr_referrals(inviter_a,null);
  assert page->>'startParam'='ref_'||inviter_a;
  assert page#>>'{rows,0,name}'='Newcomer';
  assert page#>>'{rows,0,status}'='confirmed';
  assert public.vvr_referrals(inviter_b,null)->'rows'='[]';
  assert public.vvr_referrals(inviter_b,newcomer)->'rows'='[]';
  assert not exists(select from vvr.resource_receipts where source_kind='referral');
  assert not exists(select from vvr.wallets where player_id=inviter_a);

  assert not has_table_privilege('service_role','vvr.referrals','INSERT');
  assert not has_table_privilege('anon','vvr.referrals','SELECT');
  assert not has_function_privilege('anon','public.vvr_resolve_referred_player(text,text,uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','public.vvr_referrals(uuid,uuid)','EXECUTE');
  assert not has_function_privilege('service_role','vvr.issue_referral_reward(uuid,text,integer)','EXECUTE');
  assert not has_function_privilege('vvr_reward_writer','vvr.issue_referral_reward(uuid,text,integer)','EXECUTE');

  begin
    perform vvr.issue_referral_reward(existing_player,'gold',7);
    raise exception 'No reward should be possible without attribution';
  exception when invalid_parameter_value then null;
  end;
  assert vvr.issue_referral_reward(newcomer,'gold',7);
  assert not vvr.issue_referral_reward(newcomer,'gold',7);
  begin
    perform vvr.issue_referral_reward(newcomer,'gold',8);
    raise exception 'An existing receipt cannot change';
  exception when unique_violation then null;
  end;
  assert (select balance from vvr.wallets where player_id=inviter_a and resource='gold')=7;
  assert public.vvr_referrals(inviter_a,null)#>>'{rows,0,status}'='rewarded';

  perform public.vvr_resolve_referred_player((79300+i)::text,'Another newcomer',inviter_a)
    from generate_series(1,26) i;
  page:=public.vvr_referrals(inviter_a,null);
  assert jsonb_array_length(page->'rows')=25;
  assert jsonb_array_length(public.vvr_referrals(inviter_a,(page->>'next')::uuid)->'rows')=2;
end;
$$;

-- Check that the actual RPC role can work and the caller does not read the private table.
set role service_role;
select public.vvr_resolve_referred_player('79206','RPC registration',null);
select public.vvr_referrals(public.vvr_resolve_player('79206','RPC registration'),null);
reset role;
