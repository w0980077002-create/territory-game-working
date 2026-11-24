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
