begin;
do $$
declare
  owner_id uuid := vvr.resolve_player('20001','Test owner');
  player_id uuid := vvr.resolve_player('20002','Test player');
begin
  insert into vvr.admin_access(player_id,role) values(owner_id,'owner');
  insert into vvr.admin_credentials(player_id,login,password_hash)
   values(owner_id,'owner',extensions.crypt('start-pass',extensions.gen_salt('bf',4)));
  assert not has_table_privilege('service_role','vvr.admin_credentials','SELECT');
  assert not has_function_privilege('anon','public.vvr_admin_unlock(uuid,text,text)','EXECUTE');

  set local role service_role;
  -- Role alone is not enough until the password unlock.
  begin
    perform public.vvr_admin_status(owner_id);
    raise exception 'Locked admin admitted';
  exception when insufficient_privilege then null;
  end;
  -- A player without credentials gets the same answer as a wrong password.
  assert public.vvr_admin_unlock(player_id,'owner','start-pass')->>'status'='invalid';
  assert public.vvr_admin_unlock(owner_id,'owner','wrong')->>'status'='invalid';
  assert public.vvr_admin_unlock(owner_id,'OWNER ','start-pass')->>'status'='ok';
  assert public.vvr_admin_status(owner_id)->>'role'='owner';

  assert public.vvr_admin_password(owner_id,'wrong','owner','new-password-1')->>'status'='invalid';
  assert public.vvr_admin_password(owner_id,'start-pass','owner','short')->>'status'='weak_password';
  assert public.vvr_admin_password(owner_id,'start-pass','Bad Login!','new-password-1')->>'status'='bad_login';
  assert public.vvr_admin_password(owner_id,'start-pass','jarl','new-password-1')->>'status'='ok';
  assert public.vvr_admin_lock(owner_id)->>'status'='ok';
  begin
    perform public.vvr_admin_status(owner_id);
    raise exception 'Logged-out admin admitted';
  exception when insufficient_privilege then null;
  end;
  assert public.vvr_admin_unlock(owner_id,'owner','start-pass')->>'status'='invalid';

  -- Five failures lock the login for 15 minutes, even for the right password.
  for i in 1..4 loop
    assert public.vvr_admin_unlock(owner_id,'jarl','guess')->>'status'='invalid';
  end loop;
  assert public.vvr_admin_unlock(owner_id,'jarl','guess')->>'status'='invalid';
  assert public.vvr_admin_unlock(owner_id,'jarl','new-password-1')->>'status'='locked';

  reset role;
  assert (select count(*) from vvr.admin_actions where kind='login_failed')=8;
  assert (select count(*) from vvr.admin_actions where kind='password_changed')=1;
  assert not exists(select from vvr.admin_actions where args::text like '%pass%');
end $$;
rollback;
