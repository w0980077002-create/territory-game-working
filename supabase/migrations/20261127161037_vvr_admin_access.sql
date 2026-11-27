create table vvr.admin_access (
  player_id uuid primary key references vvr.players(id),
  role text not null unique check (role in ('owner','project_lead')),
  granted_at timestamptz not null default now()
);
alter table vvr.admin_access enable row level security;
revoke all on vvr.admin_access from public, anon, authenticated, service_role;

create function vvr.require_admin(p_actor uuid)
returns text language plpgsql stable set search_path=pg_catalog
as $$
declare admin_role text;
begin
  select role into admin_role from vvr.admin_access where player_id=p_actor;
  if not found then
    raise exception 'admin_access_required' using errcode='42501';
  end if;
  return admin_role;
end;
$$;
revoke all on function vvr.require_admin(uuid) from public, anon, authenticated, service_role;

create function public.vvr_admin_find_player(p_actor uuid,p_telegram text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare result jsonb;
begin
  perform vvr.require_admin(p_actor);
  if p_telegram is null or p_telegram !~ '^[1-9][0-9]{0,15}$' then
    raise exception 'invalid_telegram_id' using errcode='22023';
  end if;
  select jsonb_build_object(
    'id', p.id, 'name', p.display_name,
    'paidGems', coalesce(w.balance,0)
  ) into result
  from vvr.players p
  left join vvr.wallets w on w.player_id=p.id and w.resource='paid_gems'
  where p.telegram_id=p_telegram;
  return result;
end;
$$;
revoke all on function public.vvr_admin_find_player(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.vvr_admin_find_player(uuid,text) to service_role;

notify pgrst,'reload schema';
