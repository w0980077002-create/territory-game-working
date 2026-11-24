set local lock_timeout = '5s';

-- A Telegram player and request identify an accepted strike even after event rotation.
create index world_boss_hits_player_request on vvr.world_boss_hits(player_id,request_id,hit_at,event_id);

alter function public.vvr_world_boss_attack(text,text,uuid) set schema vvr;
revoke all on function vvr.vvr_world_boss_attack(text,text,uuid) from public,anon,authenticated,service_role;

create function public.vvr_world_boss_attack(p_telegram_id text,p_name text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  prior vvr.world_boss_hits%rowtype;
begin
  if p_request_id is null then raise exception 'world_boss_bad_request'; end if;
  -- Keep an in-flight retry behind the first strike until its result is visible.
  perform pg_advisory_xact_lock(hashtextextended(p_telegram_id||':'||p_request_id::text,7418));
  select h.* into prior
    from vvr.players p join vvr.world_boss_hits h on h.player_id=p.id
    where p.telegram_id=p_telegram_id and h.request_id=p_request_id
    order by h.hit_at,h.event_id limit 1;
  if found then
    return public.vvr_world_boss_state(p_telegram_id)||jsonb_build_object('hit',
      jsonb_build_object('damage',prior.damage,'critical',prior.critical,'killing',prior.killing,'repeated',true));
  end if;
  return vvr.vvr_world_boss_attack(p_telegram_id,p_name,p_request_id);
end;
$$;

revoke all on function public.vvr_world_boss_attack(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.vvr_world_boss_attack(text,text,uuid) to service_role;
notify pgrst,'reload schema';
