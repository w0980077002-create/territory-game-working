begin;
do $$
declare
  inviter uuid:=vvr.resolve_player('79801','Campaign inviter');
  invitee uuid:=public.vvr_resolve_referred_player('79802','Campaign friend',inviter);
  outsider uuid:=vvr.resolve_player('79803','Campaign outsider');
  client uuid:=gen_random_uuid();
  ticket uuid;
  inviter_ticket uuid;
  award vvr.brotherhood_awards;
  before_save text;
begin
  assert not has_table_privilege('anon','vvr.campaign_boss_attempts','SELECT');
  assert not has_table_privilege('service_role','vvr.campaign_boss_attempts','UPDATE');
  assert not has_function_privilege('authenticated','public.vvr_campaign_boss_finish(uuid,uuid,integer)','EXECUTE');
  assert not has_function_privilege('anon','public.vvr_campaign_boss_begin(uuid,uuid,text)','EXECUTE');
  assert has_function_privilege('service_role','public.vvr_campaign_boss_check(uuid,uuid)','EXECUTE');
  assert (select relrowsecurity from pg_class where oid='vvr.campaign_boss_attempts'::regclass);

  before_save:='{"level":100,"stage":250,"wave":5,"horn":500,"gems":650,"equipment":{"weapon":{"id":"saved"}}}';
  perform public.vvr_snapshot_store(invitee,0,gen_random_uuid(),before_save);
  assert not exists(select from vvr.brotherhood_awards where invitee_id=invitee);
  ticket:=(public.vvr_campaign_boss_begin(invitee,client,'berserker')->>'ticket')::uuid;
  assert (public.vvr_campaign_boss_begin(invitee,client,'ranger')->>'ticket')::uuid=ticket;
  assert (select hero='berserker' from vvr.campaign_boss_attempts where id=ticket);
  assert public.vvr_campaign_boss_check(outsider,ticket)->>'status'='ineligible';
  assert public.vvr_campaign_boss_finish(outsider,ticket,370)->>'status'='ineligible';
  assert public.vvr_campaign_boss_check(invitee,ticket)->>'status'='retry';
  begin
    perform public.vvr_campaign_boss_finish(invitee,ticket,370);
    raise exception 'Campaign finish should require a successful check';
  exception when insufficient_privilege then
    assert sqlerrm='campaign_proof_not_checked';
  end;
  update vvr.campaign_boss_attempts set started_at=clock_timestamp()-interval '4 sec' where id=ticket;
  assert public.vvr_campaign_boss_check(invitee,ticket)->>'status'='check';
  assert public.vvr_campaign_boss_check(invitee,ticket)->>'status'='retry';
  assert public.vvr_campaign_boss_finish(invitee,ticket,370)->>'status'='retry';

  update vvr.referrals set confirmed_at=clock_timestamp()-interval '2 min' where invitee_id=invitee;
  update vvr.campaign_boss_attempts set started_at=clock_timestamp()-interval '12 sec' where id=ticket;
  assert public.vvr_campaign_boss_finish(invitee,ticket,370)->>'status'='verified';
  assert public.vvr_campaign_boss_finish(invitee,ticket,370)->>'status'='verified';
  assert public.vvr_campaign_boss_check(invitee,ticket)->>'status'='verified';
  assert public.vvr_campaign_boss_begin(invitee,gen_random_uuid(),'berserker')->>'status'='verified';
  assert (select count(*)=2 from vvr.brotherhood_awards where invitee_id=invitee and kind='welcome');
  assert public.vvr_referrals(inviter,null)#>>'{brotherhood,active}'='1';
  assert public.vvr_referrals(invitee,null)#>>'{brotherhood,incoming,days}'='0';
  for award in select * from vvr.brotherhood_awards where invitee_id=invitee and kind='welcome' loop
    assert public.vvr_brotherhood_claim(award.recipient_id,award.id)->>'status'='received';
    assert public.vvr_brotherhood_claim(award.recipient_id,award.id)->>'status'='received';
  end loop;
  assert (select jsonb_object_agg(resource,balance) from vvr.wallets where player_id=invitee)
    ='{"gold":2000,"gems":100,"horn":20,"chaosite":30,"rune_scrolls":40,"summon_seals":3}'::jsonb;
  assert (select balance=25 from vvr.wallets where player_id=inviter and resource='gems');
  assert (select count(*)=7 from vvr.resource_receipts where source_kind='brotherhood' and player_id in (inviter,invitee));
  assert (select count(*)=1 and min(raw)=before_save from vvr.solo_snapshots where player_id=invitee);

  inviter_ticket:=(public.vvr_campaign_boss_begin(inviter,gen_random_uuid(),'ranger')->>'ticket')::uuid;
  update vvr.campaign_boss_attempts set started_at=clock_timestamp()-interval '31 min' where id=inviter_ticket;
  assert public.vvr_campaign_boss_check(inviter,inviter_ticket)->>'status'='expired';
  inviter_ticket:=(public.vvr_campaign_boss_begin(inviter,gen_random_uuid(),'ranger')->>'ticket')::uuid;
  update vvr.campaign_boss_attempts set started_at=clock_timestamp()-interval '12 sec' where id=inviter_ticket;
  assert public.vvr_campaign_boss_check(inviter,inviter_ticket)->>'status'='check';
  assert public.vvr_campaign_boss_finish(inviter,inviter_ticket,370)->>'status'='verified';
  assert public.vvr_referrals(invitee,null)#>>'{brotherhood,incoming,days}'='1';
  assert (select count(*)=2 from vvr.brotherhood_awards where invitee_id=invitee and kind='oath' and tier=1);
end;
$$;
rollback;
