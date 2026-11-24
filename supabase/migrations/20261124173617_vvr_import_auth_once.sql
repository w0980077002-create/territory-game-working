-- One-time Railway runtime transfer. Removed after the import finishes.
create function vvr.import_auth_once(p_digest text,p_bot text)
returns void language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if not exists(select from vvr.arena_publishers where name='railway' and token_hash=p_digest) then
    raise exception 'publisher_required' using errcode='42501';
  end if;
  if p_bot is null or p_bot !~ '^[0-9]{5,20}:[A-Za-z0-9_-]{25,100}$' then
    raise exception 'invalid_telegram_credential' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(668103);
  if exists(select from vault.secrets where name='TELEGRAM_BOT_TOKEN') then
    if not exists(select from vault.decrypted_secrets where name='TELEGRAM_BOT_TOKEN' and decrypted_secret=p_bot) then
      raise exception 'different_telegram_credential_exists' using errcode='23505';
    end if;
  else
    perform vault.create_secret(p_bot,'TELEGRAM_BOT_TOKEN','Telegram bot for VIKING VS ROME');
  end if;
  if not exists(select from vault.secrets where name='VVR_SESSION_SECRET') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'VVR_SESSION_SECRET','VVR session signing key');
  end if;
end;
$$;

create function public.vvr_import_auth_once(p_digest text,p_bot text)
returns void language sql security invoker set search_path=pg_catalog
as $$ select vvr.import_auth_once(p_digest,p_bot); $$;

revoke all on function vvr.import_auth_once(text,text),public.vvr_import_auth_once(text,text)
  from public,anon,authenticated,service_role;
grant execute on function vvr.import_auth_once(text,text),public.vvr_import_auth_once(text,text) to service_role;
notify pgrst,'reload schema';
