-- B4.1: the admin panel opens only after a hidden gesture and a login/password check.
-- The Telegram-signed session and the server role stay required; the password is a second factor.
-- Credentials are created outside GitHub (SQL by the project lead); only bcrypt hashes are stored.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table vvr.admin_credentials (
  player_id uuid primary key references vvr.admin_access(player_id) on delete cascade,
  login text not null unique check (login ~ '^[a-z0-9_.-]{3,32}$'),
  password_hash text not null,
  failed integer not null default 0,
  locked_until timestamptz,
  unlocked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);
alter table vvr.admin_credentials enable row level security;
revoke all on vvr.admin_credentials from public, anon, authenticated, service_role;

-- Every admin function goes through require_admin: it now also needs an unexpired unlock.
create or replace function vvr.require_admin(p_actor uuid)
returns text language plpgsql stable set search_path=pg_catalog
as $$
declare admin_role text;
begin
  select a.role into admin_role from vvr.admin_access a
   join vvr.admin_credentials c on c.player_id=a.player_id
   where a.player_id=p_actor and c.unlocked_until>clock_timestamp();
  if not found then
    raise exception 'admin_access_required' using errcode='42501';
  end if;
  return admin_role;
end;
$$;

create function vvr.admin_log(p_actor uuid,p_role text,p_kind text)
returns void language sql set search_path=pg_catalog
as $$
 insert into vvr.admin_actions(actor_telegram,actor_role,kind,reason,args)
  select telegram_id,coalesce(p_role,'player'),p_kind,'admin_login','{}'::jsonb from vvr.players where id=p_actor;
$$;

-- Wrong login, wrong password and "not an admin" are indistinguishable for the caller.
create function public.vvr_admin_unlock(p_actor uuid,p_login text,p_password text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
 cred vvr.admin_credentials;
 admin_role text;
begin
 if p_login is null or p_password is null or char_length(p_login)>32 or char_length(p_password)>72 then
  return '{"status":"invalid"}';
 end if;
 select c.* into cred from vvr.admin_credentials c where c.player_id=p_actor for update;
 if not found then
  perform vvr.admin_log(p_actor,null,'login_failed');
  return '{"status":"invalid"}';
 end if;
 select role into admin_role from vvr.admin_access where player_id=p_actor;
 if cred.locked_until>clock_timestamp() then
  return jsonb_build_object('status','locked','until',cred.locked_until);
 end if;
 if cred.login<>lower(btrim(p_login)) or cred.password_hash<>extensions.crypt(p_password,cred.password_hash) then
  update vvr.admin_credentials set failed=case when failed>=4 then 0 else failed+1 end,
   locked_until=case when failed>=4 then clock_timestamp()+interval '15 minutes' else locked_until end
   where player_id=p_actor;
  perform vvr.admin_log(p_actor,admin_role,'login_failed');
  return '{"status":"invalid"}';
 end if;
 update vvr.admin_credentials set failed=0,locked_until=null,unlocked_until=clock_timestamp()+interval '30 minutes'
  where player_id=p_actor;
 perform vvr.admin_log(p_actor,admin_role,'login');
 return '{"status":"ok"}';
end;
$$;

create function public.vvr_admin_lock(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
begin
 update vvr.admin_credentials set unlocked_until=null where player_id=p_actor;
 return '{"status":"ok"}';
end;
$$;

create function public.vvr_admin_password(p_actor uuid,p_old text,p_login text,p_password text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
 admin_role text:=vvr.require_admin(p_actor);
 cred vvr.admin_credentials;
 next_login text:=lower(btrim(p_login));
begin
 select * into cred from vvr.admin_credentials where player_id=p_actor for update;
 if p_old is null or cred.password_hash<>extensions.crypt(p_old,cred.password_hash) then
  return '{"status":"invalid"}';
 end if;
 if next_login is null or next_login !~ '^[a-z0-9_.-]{3,32}$' then return '{"status":"bad_login"}'; end if;
 if p_password is null or char_length(p_password) not between 8 and 72 or p_password=p_old then
  return '{"status":"weak_password"}';
 end if;
 if exists(select from vvr.admin_credentials where login=next_login and player_id<>p_actor) then
  return '{"status":"bad_login"}';
 end if;
 update vvr.admin_credentials set login=next_login,
  password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',10)),updated_at=clock_timestamp()
  where player_id=p_actor;
 perform vvr.admin_log(p_actor,admin_role,'password_changed');
 return '{"status":"ok"}';
end;
$$;

revoke all on function vvr.admin_log(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.vvr_admin_unlock(uuid,text,text),public.vvr_admin_lock(uuid),
 public.vvr_admin_password(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.vvr_admin_unlock(uuid,text,text),public.vvr_admin_lock(uuid),
 public.vvr_admin_password(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
