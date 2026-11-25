begin;
do $$
declare
  inviter uuid:=vvr.resolve_player('79401','Brother leader');
  invitee uuid:=public.vvr_resolve_referred_player('79402','New recruit',inviter);
  outsider uuid:=vvr.resolve_player('79403','Outsider');
  guild uuid;
  won_event uuid;
  missed_event uuid;
  welcome uuid;
  leader_award uuid;
  oath uuid;
  event_day date;
  gap integer;
  fixture_event uuid;
  pair vvr.referrals;
  award jsonb;
  stats jsonb;
begin
  assert public.vvr_referrals(invitee,null)#>>'{brotherhood,incoming,inviterId}'=inviter::text;
  assert public.vvr_referrals(inviter,null)#>>'{brotherhood,invited}'='1';
  assert public.vvr_referrals(inviter,null)#>>'{brotherhood,active}'='0';
  assert public.vvr_referrals(invitee,null)#>>'{brotherhood,rewards,welcome,invitee,horn}'='20';
  assert not (public.vvr_referrals(invitee,null)#>'{brotherhood,rewards,legend}' ? '10');
  assert public.vvr_snapshot_store(invitee,0,gen_random_uuid(),
    '{"level":100,"bosses":100,"claimed":["daily"],"horn":50}')=1;
  assert not exists(select from vvr.brotherhood_awards);
  assert not exists(select from vvr.resource_receipts where source_kind='brotherhood');
  assert public.vvr_resolve_referred_player('79401','Brother leader',inviter)=inviter;
  assert public.vvr_resolve_referred_player('79402','New recruit',outsider)=invitee;

  guild:=vvr.change_guild_roster(inviter,'create',p_name=>'Brotherhood test');
  perform vvr.change_guild_roster(invitee,'apply',guild);
  perform vvr.change_guild_roster(inviter,'accept',guild,invitee);
  insert into vvr.world_boss_admins(telegram_id) values ('79401');

  perform public.vvr_world_boss_admin_start('79401','Retreated','minotaur_echo',
    clock_timestamp()-interval '30 sec',30,1000,'{"damageMin":500,"damageMax":500,"critChance":0}');
  select id into missed_event from vvr.world_boss_events where status='open';
  perform public.vvr_world_boss_attack('79402','New recruit',gen_random_uuid());
  perform public.vvr_world_boss_admin_end('79401',missed_event);
  assert not exists(select from vvr.brotherhood_awards);
  assert public.vvr_referrals(inviter,null)#>>'{brotherhood,active}'='0';

  perform public.vvr_world_boss_admin_start('79401','Confirmed victory','minotaur_echo',
    clock_timestamp()-interval '30 sec',30,1000,'{"damageMin":500,"damageMax":500,"critChance":0}');
  select id into won_event from vvr.world_boss_events where status='open';
  perform vvr.configure_guild_boss_quest(won_event,1000,50);
  perform public.vvr_world_boss_attack('79401','Brother leader',gen_random_uuid());
  assert not exists(select from vvr.brotherhood_quest_completions);
  perform public.vvr_world_boss_attack('79402','New recruit',gen_random_uuid());
  assert (select status='defeated' from vvr.world_boss_events where id=won_event);
  assert (select count(*) from vvr.brotherhood_quest_completions)=2;
  assert public.vvr_referrals(inviter,null)#>>'{brotherhood,active}'='1';
  assert public.vvr_referrals(invitee,null)#>>'{brotherhood,incoming,days}'='1';
  select id into strict welcome from vvr.brotherhood_awards where recipient_id=invitee and kind='welcome';
  select id into strict leader_award from vvr.brotherhood_awards where recipient_id=inviter and kind='welcome';
  select id into strict oath from vvr.brotherhood_awards where recipient_id=invitee and kind='oath' and tier=1;
  assert (select count(*) from vvr.brotherhood_awards) = 4;

  assert public.vvr_brotherhood_claim(outsider,welcome)->>'status'='unavailable';
  begin
    perform public.vvr_brotherhood_admin(outsider,false);
    raise exception 'player disabled payouts';
  exception when insufficient_privilege then null;
  end;
  assert (public.vvr_brotherhood_admin(inviter,false)->>'enabled')::boolean=false;
  assert public.vvr_brotherhood_claim(invitee,welcome)->>'status'='paused';
  assert (select count(*) from vvr.brotherhood_awards)=4;
  assert not exists(select from vvr.resource_receipts where source_kind='brotherhood');
  assert (public.vvr_brotherhood_admin(inviter,true)->>'enabled')::boolean;

  -- Force one receive line to fail after previous wallet credits in the same transaction.
  insert into vvr.wallets(player_id,resource,balance) values(invitee,'horn',1000000000);
  begin
    perform public.vvr_brotherhood_claim(invitee,welcome);
    raise exception 'part of an overflowing chest was issued';
  exception when check_violation then null;
  end;
  assert not exists(select from vvr.resource_receipts where source_kind='brotherhood');
  assert (select count(*) from vvr.wallets where player_id=invitee)=1;
  delete from vvr.wallets where player_id=invitee and resource='horn';

  update vvr.brotherhood_settings set rewards=jsonb_set(rewards,'{welcome,invitee,gems}','222');
  award:=public.vvr_brotherhood_claim(invitee,welcome);
  assert award->>'status'='received';
  assert award->'wallet'='{"gold":2000,"gems":100,"horn":20,"chaosite":30,"rune_scrolls":40,"summon_seals":3}'::jsonb;
  assert public.vvr_brotherhood_claim(invitee,welcome)=award;
  assert public.vvr_brotherhood_claim(inviter,leader_award)#>>'{wallet,gems}'='25';
  assert public.vvr_brotherhood_claim(invitee,oath)#>>'{wallet,gems}'='110';
  assert (select count(*) from vvr.resource_receipts where source_kind='brotherhood')=8;
  assert public.vvr_referrals(invitee,null)#>>'{brotherhood,wallet,horn}'='20';

  -- Historical days and repeat quests within one UTC day cannot advance the oath.
  select utc_day into event_day from vvr.brotherhood_quest_completions c
    where c.event_id=won_event and c.player_id=invitee;
  update vvr.referrals set confirmed_at=(event_day::timestamp at time zone 'UTC')-interval '15 days'
    where invitee_id=invitee;
  insert into vvr.guild_boss_quests(event_id,target_damage,reward_gold) values(missed_event,100,1);
  insert into vvr.brotherhood_quest_completions(event_id,player_id,completed_at) values
    (missed_event,inviter,event_day::timestamp at time zone 'UTC'),
    (missed_event,invitee,event_day::timestamp at time zone 'UTC');
  assert public.vvr_referrals(invitee,null)#>>'{brotherhood,incoming,days}'='1';
  update vvr.brotherhood_quest_completions set completed_at=(event_day-4)::timestamp at time zone 'UTC'
    where brotherhood_quest_completions.event_id=missed_event;
  assert public.vvr_referrals(invitee,null)#>>'{brotherhood,incoming,days}'='2';

  stats:=public.vvr_brotherhood_admin(inviter,null);
  assert stats#>>'{tiers,welcome:1}'='1';
  assert stats#>>'{tiers,oath:1}'='1';
  assert stats#>>'{issued,gems}'='135';
  assert stats#>>'{rejections,self_referral}'='1';
  assert stats#>>'{rejections,foreign_or_unknown_award}'='1';

  -- Later stages unlock for both accounts across nonconsecutive UTC days.
  foreach gap in array array[2,6,8,10,12] loop
    insert into vvr.world_boss_events(title,boss,starts_at,ends_at,max_hp,hp,status,config,finished_at)
      values('UTC quest fixture','minotaur_echo',now()-interval '1 day',now(),1000,1000,'expired',
        vvr.world_boss_default_config(),now()) returning id into fixture_event;
    insert into vvr.guild_boss_quests(event_id,target_damage,reward_gold) values(fixture_event,100,1);
    insert into vvr.brotherhood_quest_completions(event_id,player_id,completed_at)
      values(fixture_event,inviter,((event_day-gap)::timestamp+interval '1 hour') at time zone 'UTC');
    assert vvr.brotherhood_days((select r from vvr.referrals r where r.invitee_id=invitee))<=6;
    insert into vvr.brotherhood_quest_completions(event_id,player_id,completed_at)
      values(fixture_event,invitee,((event_day-gap)::timestamp+interval '23 hours') at time zone 'UTC');
  end loop;
  select * into pair from vvr.referrals where invitee_id=invitee;
  assert vvr.brotherhood_days(pair)=7;
  perform vvr.brotherhood_oath_earned(pair);
  perform vvr.brotherhood_oath_earned(pair);
  assert (select count(*) from vvr.brotherhood_awards where kind='oath')=8;
  assert (select bool_and(payload='{"gems":50,"relic_shards":5}'::jsonb)
    from vvr.brotherhood_awards where kind='oath' and tier=7);
  assert not has_function_privilege('anon','public.vvr_brotherhood_claim(uuid,uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','public.vvr_brotherhood_admin(uuid,boolean)','EXECUTE');
  assert not has_table_privilege('service_role','vvr.brotherhood_awards','INSERT');
end;
$$;
rollback;
