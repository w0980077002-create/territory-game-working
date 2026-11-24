begin;
do $$
declare
  token text:=encode(sha256(convert_to('fixture publisher','UTF8')),'hex');
  event uuid:=gen_random_uuid();
  winner uuid:=vvr.resolve_player('73021','Player');
  happened timestamptz:=now()-interval '1 minute';
begin
  insert into vvr.arena_publishers values('railway',token);
  insert into vvr.seasons(name,starts_at,ends_at) values('Arena test',now()-interval '1 day',now()+interval '1 day');
  begin
    perform public.vvr_ingest_arena_result(repeat('f',64),event,'73021','Arena',happened);
    raise exception 'An untrusted publisher submitted a ranked result';
  exception when insufficient_privilege then null;
  end;
  assert public.vvr_ingest_arena_result(token,event,'73021','Arena',happened);
  assert not public.vvr_ingest_arena_result(token,event,'73021','Arena',happened);
  begin
    perform public.vvr_ingest_arena_result(token,event,'73022','Second player',happened);
    raise exception 'One match counted for more than one winner';
  exception when unique_violation then null;
  end;
  assert (select display_name from vvr.players where id=winner)='Player';
  assert (vvr.ranking_state(winner,'arena_wins',null)->'rows'->0->>'points')::int=1;
  assert not has_function_privilege('authenticated','public.vvr_ingest_arena_result(text,uuid,text,text,timestamptz)','EXECUTE');
end;
$$;
rollback;
