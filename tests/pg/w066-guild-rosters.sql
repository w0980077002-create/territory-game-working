do $$
declare
  leader uuid := vvr.resolve_player('72901','Guild leader');
  applicant uuid := vvr.resolve_player('72902','Applicant');
  other_player uuid := vvr.resolve_player('72903','Other player');
  guild uuid;
  other_guild uuid;
begin
  guild:=vvr.change_guild_roster(leader,'create',p_name=>' Северный дозор ');
  other_guild:=vvr.change_guild_roster(other_player,'create',p_name=>'Вороны');
  assert (select name from vvr.guilds where id=guild)='Северный дозор';
  perform vvr.change_guild_roster(applicant,'apply',guild);
  perform vvr.change_guild_roster(applicant,'apply',guild);
  perform vvr.change_guild_roster(applicant,'apply',other_guild);
  assert (select count(*) from vvr.guild_applications where player_id=applicant)=2;
  begin
    perform vvr.change_guild_roster(other_player,'accept',guild,applicant);
    raise exception 'non-leader accepted a guild application';
  exception when insufficient_privilege then null;
  end;
  perform vvr.change_guild_roster(leader,'accept',guild,applicant);
  perform vvr.change_guild_roster(leader,'accept',guild,applicant);
  assert (select guild_id from vvr.guild_members where player_id=applicant)=guild;
  assert not exists(select from vvr.guild_applications where player_id=applicant);
  begin
    perform vvr.change_guild_roster(applicant,'create',p_name=>'Second guild');
    raise exception 'player joined multiple guilds';
  exception when unique_violation then null;
  end;
  perform vvr.change_guild_roster(leader,'leave');
  assert (select role from vvr.guild_members where player_id=applicant)='leader', 'leadership was not transferred';
  perform vvr.change_guild_roster(applicant,'leave');
  assert not exists(select from vvr.guilds where id=guild), 'empty guild was not deleted';
  assert not has_function_privilege('anon','vvr.change_guild_roster(uuid,text,uuid,uuid,text)','EXECUTE'), 'browser execution was granted';
  assert not has_function_privilege('authenticated','vvr.change_guild_roster(uuid,text,uuid,uuid,text)','EXECUTE'), 'browser execution was granted';
  assert not has_table_privilege('service_role','vvr.guild_members','INSERT');
end;
$$;

begin;
select vvr.resolve_player('72911','Captain') as captain,
       vvr.resolve_player('72912','Member') as member,
       vvr.resolve_player('72913','Pending') as pending \gset
set local role service_role;
select public.vvr_guild_community(:'captain','guild_roster','{"kind":"create","name":"Guild RPC"}')->'guild'->>'id' as guild \gset
select public.vvr_guild_community(:'member','guild_roster',jsonb_build_object('kind','apply','guild',:'guild')) is not null as result \gset
select public.vvr_guild_community(:'captain','guild_roster',
  jsonb_build_object('kind','accept','guild',:'guild','applicant',:'member')) is not null as result \gset
select public.vvr_guild_community(:'pending','guild_roster',jsonb_build_object('kind','apply','guild',:'guild')) is not null as result \gset
select set_config('test.guild_ids',jsonb_build_array(:'captain',:'member',:'pending')::text,true) as ids \gset
do $$
declare
  ids jsonb := current_setting('test.guild_ids')::jsonb;
  captain jsonb := public.vvr_guild_community((ids->>0)::uuid,'guild','{}');
  member jsonb := public.vvr_guild_community((ids->>1)::uuid,'guild','{}');
  pending jsonb := public.vvr_guild_community((ids->>2)::uuid,'guild','{}');
begin
  assert jsonb_array_length(captain->'guild'->'applications')=1;
  assert jsonb_array_length(member->'guild'->'applications')=0;
  assert jsonb_array_length(member->'guild'->'members')=2;
  assert pending->'guild'='null'::jsonb;
  assert exists(select from jsonb_array_elements(pending->'directory') entry
    where entry->>'id'=captain->'guild'->>'id' and (entry->>'applied')::boolean);
  assert not has_function_privilege('authenticated','public.vvr_guild_community(uuid,text,jsonb)','EXECUTE');
end;
$$;
rollback;
