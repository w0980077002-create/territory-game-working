begin;
do $$
declare
  owner_id uuid := vvr.resolve_player('10001','Test owner');
  lead_id uuid := vvr.resolve_player('10002','Test lead');
  player_id uuid := vvr.resolve_player('10003','Test player');
begin
  insert into vvr.admin_access(player_id,role) values(owner_id,'owner'),(lead_id,'project_lead');
  assert not has_function_privilege('anon','public.vvr_admin_find_player(uuid,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.vvr_admin_find_player(uuid,text)','EXECUTE');
  assert not has_table_privilege('service_role','vvr.admin_access','INSERT');

  set local role service_role;
  assert public.vvr_admin_find_player(owner_id,'10003')->>'id'=player_id::text;
  assert public.vvr_admin_find_player(lead_id,'10003')->>'paidGems'='0';
  assert public.vvr_admin_find_player(lead_id,'10004') is null;
  begin
    perform public.vvr_admin_find_player(player_id,'10001');
    raise exception 'Non-admin admitted';
  exception when insufficient_privilege then
    null;
  end;
end $$;
rollback;
