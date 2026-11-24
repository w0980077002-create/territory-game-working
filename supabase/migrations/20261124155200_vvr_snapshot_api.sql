-- Immutable Solo backups. Only the authenticated Edge handler supplies p_player.
create function vvr.snapshot_read(p_player uuid,p_previous boolean)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select jsonb_build_object('revision',s.revision,'raw',s.raw,'at',s.created_at)
  from vvr.solo_snapshots s where s.player_id=p_player
  order by s.revision desc offset case when p_previous then 1 else 0 end limit 1;
$$;

create function vvr.snapshot_store(p_player uuid,p_expected integer,p_request uuid,p_raw text)
returns integer language plpgsql security definer set search_path=pg_catalog
as $$
declare
  latest integer;
  previous vvr.solo_snapshots%rowtype;
  next_checksum text;
begin
  if p_request is null or p_expected is null or p_expected<0 or p_raw is null
    or octet_length(p_raw)>2097152 or jsonb_typeof(p_raw::jsonb)<>'object' then
    raise exception 'invalid_snapshot' using errcode='22023';
  end if;
  perform 1 from vvr.players where id=p_player for update;
  if not found then raise exception 'verified_player_required' using errcode='42501'; end if;

  next_checksum:=encode(sha256(convert_to(p_raw,'UTF8')),'hex');
  select * into previous from vvr.solo_snapshots where player_id=p_player and request_id=p_request;
  if found then
    if previous.checksum<>next_checksum then raise exception 'snapshot_request_conflict' using errcode='23505'; end if;
    return previous.revision;
  end if;
  select coalesce(max(revision),0) into latest from vvr.solo_snapshots where player_id=p_player;
  if latest<>p_expected then raise exception 'snapshot_revision_conflict' using errcode='23505'; end if;
  if exists(select from vvr.solo_snapshots s where s.player_id=p_player and s.revision=latest and s.checksum=next_checksum) then
    return latest;
  end if;
  insert into vvr.solo_snapshots(player_id,revision,request_id,raw,checksum)
    values(p_player,latest+1,p_request,p_raw,next_checksum);
  return latest+1;
end;
$$;

create function public.vvr_snapshot_read(p_player uuid,p_previous boolean)
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select vvr.snapshot_read(p_player,p_previous); $$;

create function public.vvr_snapshot_store(p_player uuid,p_expected integer,p_request uuid,p_raw text)
returns integer language sql security invoker set search_path=pg_catalog
as $$ select vvr.snapshot_store(p_player,p_expected,p_request,p_raw); $$;

revoke all on function vvr.snapshot_read(uuid,boolean),vvr.snapshot_store(uuid,integer,uuid,text),
  public.vvr_snapshot_read(uuid,boolean),public.vvr_snapshot_store(uuid,integer,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function vvr.snapshot_read(uuid,boolean),vvr.snapshot_store(uuid,integer,uuid,text),
  public.vvr_snapshot_read(uuid,boolean),public.vvr_snapshot_store(uuid,integer,uuid,text)
  to service_role;
