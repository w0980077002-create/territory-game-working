-- Only the server role can read these two fixed W066 credentials.
create function vvr.auth_secrets()
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  return (select jsonb_build_object(
    'botToken',max(decrypted_secret) filter(where name='TELEGRAM_BOT_TOKEN'),
    'sessionKey',max(decrypted_secret) filter(where name='VVR_SESSION_SECRET')
  ) from vault.decrypted_secrets where name in ('TELEGRAM_BOT_TOKEN','VVR_SESSION_SECRET'));
end;
$$;

create function public.vvr_auth_secrets()
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select vvr.auth_secrets(); $$;

revoke all on function vvr.auth_secrets(),public.vvr_auth_secrets() from public,anon,authenticated,service_role;
grant execute on function vvr.auth_secrets(),public.vvr_auth_secrets() to service_role;
