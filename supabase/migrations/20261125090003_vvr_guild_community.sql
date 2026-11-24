create function vvr.guild_state(p_player uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'directory',coalesce((select jsonb_agg(entry order by entry->>'name') from (
      select jsonb_build_object('id',g.id,'name',g.name,'members',count(m.player_id),
        'applied',exists(select from vvr.guild_applications a where a.guild_id=g.id and a.player_id=p_player)) entry
      from vvr.guilds g join vvr.guild_members m on m.guild_id=g.id
      group by g.id order by g.name,g.id limit 100
    ) directory),'[]'::jsonb),
    'guild',(select jsonb_build_object('id',g.id,'name',g.name,'role',me.role,
      'members',(select jsonb_agg(jsonb_build_object('name',p.display_name,'role',m.role)
          order by m.role,m.joined_at,m.player_id)
        from vvr.guild_members m join vvr.players p on p.id=m.player_id where m.guild_id=g.id),
      'applications',case when me.role='leader' then coalesce((
        select jsonb_agg(jsonb_build_object('id',a.player_id,'name',p.display_name)
          order by a.created_at,a.player_id)
        from vvr.guild_applications a join vvr.players p on p.id=a.player_id where a.guild_id=g.id
      ),'[]'::jsonb) else '[]'::jsonb end)
      from vvr.guild_members me join vvr.guilds g on g.id=me.guild_id where me.player_id=p_player)
  );
$$;

create function vvr.guild_community(p_player uuid,p_action text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if p_player is null or not exists(select from vvr.players where id=p_player) then
    raise exception 'verified_player_required' using errcode='42501';
  end if;
  case p_action
    when 'guild' then return vvr.guild_state(p_player);
    when 'guild_roster' then
      perform vvr.change_guild_roster(p_player,p_body->>'kind',(p_body->>'guild')::uuid,
        (p_body->>'applicant')::uuid,p_body->>'name');
      return vvr.guild_state(p_player);
    else raise exception 'invalid_guild_action' using errcode='22023';
  end case;
end;
$$;

create function public.vvr_guild_community(p_player uuid,p_action text,p_body jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select vvr.guild_community(p_player,p_action,p_body); $$;

revoke all on function vvr.guild_state(uuid),vvr.guild_community(uuid,text,jsonb),
  public.vvr_guild_community(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function vvr.guild_community(uuid,text,jsonb),
  public.vvr_guild_community(uuid,text,jsonb) to service_role;
