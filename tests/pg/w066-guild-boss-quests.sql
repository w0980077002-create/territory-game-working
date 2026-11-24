begin;
do $$
declare
  leader uuid:=vvr.resolve_player('72921','Leader');
  member_id uuid:=vvr.resolve_player('72922','Member');
  outsider uuid:=vvr.resolve_player('72923','Outsider');
  guild uuid;
  boss_event uuid;
  request_id uuid:=gen_random_uuid();
begin
  guild:=vvr.change_guild_roster(leader,'create',p_name=>'Northern Watch');
  perform vvr.change_guild_roster(member_id,'apply',guild);
  perform vvr.change_guild_roster(leader,'accept',guild,member_id);
  insert into vvr.world_boss_admins(telegram_id) values ('72921');
  perform public.vvr_world_boss_admin_start('72921','Guild battle','minotaur_echo',
    now()-interval '10 sec',30,1000,'{"damageMin":100,"damageMax":100,"critChance":0}');
  select id into boss_event from vvr.world_boss_events where status='open';
  perform vvr.configure_guild_boss_quest(boss_event,200,50);

  perform public.vvr_world_boss_attack('72921','Leader',request_id);
  perform public.vvr_world_boss_attack('72921','Leader',request_id);
  perform public.vvr_world_boss_attack('72923','Outsider',gen_random_uuid());
  assert (select sum(damage) from vvr.guild_boss_progress where event_id=boss_event)=100;
  assert (public.vvr_guild_community(leader,'guild','{}')->'quests'->0->>'damage')::int=100;
  assert jsonb_array_length(public.vvr_guild_community(outsider,'guild','{}')->'quests')=0;
  begin
    perform vvr.guild_boss_claim(leader,boss_event);
    raise exception 'premature guild reward granted';
  exception when unique_violation then null;
  end;
  begin
    perform vvr.configure_guild_boss_quest(boss_event,100,1);
    raise exception 'operator changed quest after the boss took damage';
  exception when unique_violation then null;
  end;

  perform public.vvr_world_boss_attack('72922','Member',gen_random_uuid());
  assert (select sum(damage) from vvr.guild_boss_progress where event_id=boss_event)=200;
  perform vvr.change_guild_roster(member_id,'leave');
  assert (public.vvr_guild_community(member_id,'guild','{}')->'quests'->0->>'canClaim')::boolean;
  assert (public.vvr_guild_community(member_id,'guild_boss_claim',jsonb_build_object('eventId',boss_event))->>'firstClaim')::boolean;
  assert not (vvr.guild_boss_claim(member_id,boss_event)->>'firstClaim')::boolean;
  assert (public.vvr_guild_community(member_id,'guild','{}')->'quests'->0->>'claimed')::boolean;
  assert (public.vvr_community(member_id,'auction','{}')->>'gold')::int=50;
  begin
    perform vvr.guild_boss_claim(outsider,boss_event);
    raise exception 'outsider received a guild reward';
  exception when unique_violation then null;
  end;
  assert not has_function_privilege('service_role','vvr.configure_guild_boss_quest(uuid,bigint,integer)','EXECUTE');
end;
$$;
rollback;
