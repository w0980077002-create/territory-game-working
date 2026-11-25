begin;
do $$
declare
  host uuid:=vvr.resolve_player('79971','Ledger inviter');
  friend uuid:=public.vvr_resolve_referred_player('79972','Ledger friend',host);
  opponent uuid:=vvr.resolve_player('79973','Other player');
  first uuid:=gen_random_uuid();
  alias uuid:=gen_random_uuid();
  second uuid:=gen_random_uuid();
  attempt uuid:=gen_random_uuid();
  ticket uuid;
  award vvr.brotherhood_awards;
  initial jsonb:='{"stage":2,"wave":1,"level":2,"xp":0}';
  expected jsonb:='{"stage":2,"wave":2,"level":10,"xp":0}';
  result jsonb;
  additional uuid;
begin
  assert not has_function_privilege('authenticated','public.vvr_campaign_progress_finish(uuid,uuid,integer,jsonb)','EXECUTE');
  assert not has_function_privilege('anon','public.vvr_brotherhood_horn(uuid,text,uuid,jsonb)','EXECUTE');
  assert not has_table_privilege('service_role','vvr.brotherhood_horn_openings','UPDATE');
  assert not public.vvr_campaign_progress_seed(friend,initial);
  perform public.vvr_snapshot_store(friend,0,gen_random_uuid(),'{"level":100,"stage":999,"horn":50,"gems":100,"equipment":{"weapon":{"id":"solo-only"}}}');
  assert public.vvr_campaign_progress_begin(friend,attempt,'berserker',2,1)->>'status'='ineligible';
  assert not exists(select from vvr.brotherhood_awards where invitee_id=friend);

  perform public.vvr_campaign_boss_begin(friend,attempt,'berserker');
  update vvr.campaign_boss_attempts set verified_at=clock_timestamp() where player_id=friend;
  assert public.vvr_campaign_progress_seed(friend,initial);
  assert public.vvr_campaign_progress_begin(friend,attempt,'berserker',20,1)->>'status'='waiting';
  update vvr.brotherhood_campaign set hero_level=9 where player_id=friend;
  ticket:=(public.vvr_campaign_progress_begin(friend,attempt,'berserker',2,1)->>'ticket')::uuid;
  assert public.vvr_campaign_progress_check(opponent,ticket)->>'status'='expired';
  assert public.vvr_campaign_progress_check(friend,ticket)->>'status'='retry';
  update vvr.brotherhood_campaign set started_at=clock_timestamp()-interval '14 sec' where player_id=friend;
  assert public.vvr_campaign_progress_check(friend,ticket)->>'status'='check';
  assert public.vvr_campaign_progress_finish(friend,ticket,400,expected)->>'status'='verified';
  assert public.vvr_campaign_progress_finish(friend,ticket,400,expected)->>'status'='expired';
  assert public.vvr_campaign_progress_begin(friend,attempt,'berserker',2,1)->>'status'='verified';
  assert (select count(*)=2 from vvr.brotherhood_awards where invitee_id=friend and kind='level' and tier=10);
  assert public.vvr_referrals(host,null)#>>'{brotherhood,outgoing,0,verifiedLevel}'='10';

  -- Seed a partially completed server fixture at higher verified levels.
  update vvr.brotherhood_campaign set hero_level=100 where player_id=friend;
  perform vvr.brotherhood_campaign_awards(friend,100);
  perform vvr.brotherhood_campaign_awards(friend,100);
  assert (select count(*)=12 from vvr.brotherhood_awards where invitee_id=friend and kind='level');
  assert (select count(*)=1 from vvr.brotherhood_awards where recipient_id=host and kind='legend');
  assert public.vvr_referrals(host,null)#>>'{brotherhood,qualifiedFriends}'='1';
  select * into award from vvr.brotherhood_awards where recipient_id=host and kind='legend' and tier=1;
  assert public.vvr_brotherhood_claim(friend,award.id)->>'status'='unavailable';
  assert public.vvr_brotherhood_claim(host,award.id)->>'status'='received';
  assert public.vvr_brotherhood_claim(host,award.id)->>'status'='received';

  for n in 1..4 loop
    additional:=public.vvr_resolve_referred_player((79980+n)::text,'Qualified player',host);
    perform public.vvr_campaign_boss_begin(additional,gen_random_uuid(),'berserker');
    update vvr.campaign_boss_attempts set verified_at=clock_timestamp() where player_id=additional;
    assert public.vvr_campaign_progress_seed(additional,initial);
    update vvr.brotherhood_campaign set hero_level=20 where player_id=additional;
    perform vvr.brotherhood_campaign_awards(additional,20);
  end loop;
  assert public.vvr_referrals(host,null)#>>'{brotherhood,qualifiedFriends}'='5';
  assert (select array_agg(tier order by tier)=array[1,3,5] from vvr.brotherhood_awards
    where recipient_id=host and kind='legend');

  perform vvr.issue_resource(friend,'brotherhood',gen_random_uuid(),'horn',20);
  result:=public.vvr_brotherhood_horn(friend,'open',first,jsonb_build_object('id','brotherhood-horn:'||first,'level',8));
  assert result->>'charges'='19' and result#>>'{pending,id}'=first::text;
  assert public.vvr_brotherhood_horn(friend,'open',alias,null)=result;
  assert public.vvr_brotherhood_horn(friend,'state')=result;
  assert public.vvr_brotherhood_horn(opponent,'ack',first)->>'status'='unavailable';
  assert public.vvr_brotherhood_horn(friend,'ack',first)->>'status'='delivered';
  assert public.vvr_brotherhood_horn(friend,'ack',first)->>'status'='delivered';
  assert public.vvr_brotherhood_horn(friend,'open',first,null)->'pending'='null'::jsonb;
  assert public.vvr_brotherhood_horn(friend,'open',alias,null)->>'charges'='19';
  begin
    perform public.vvr_brotherhood_horn(friend,'open',second,'{"invalid":true}');
    raise exception 'Invalid item should roll back the debit';
  exception when check_violation then null;
  end;
  assert public.vvr_brotherhood_horn(friend,'state')->>'charges'='19';
  assert public.vvr_brotherhood_horn(friend,'open',second,jsonb_build_object('id','brotherhood-horn:'||second))->>'charges'='18';
  assert (select raw::jsonb#>>'{equipment,weapon,id}'='solo-only' and raw::jsonb->>'horn'='50'
    from vvr.solo_snapshots where player_id=friend);
end;
$$;
rollback;
