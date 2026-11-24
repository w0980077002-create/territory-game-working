-- The hosted project was provisioned without any exposed Data API schemas.
-- Public holds only the service-role RPC wrappers. Gameplay tables stay in vvr.
do $$
begin
  if exists(select from pg_roles where rolname='authenticator') then
    execute format('alter role authenticator in database %I set pgrst.db_schemas to %L',current_database(),'public');
  end if;
end;
$$;
notify pgrst,'reload config';
notify pgrst,'reload schema';
