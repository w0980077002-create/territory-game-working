create table vvr.arena_publishers (
  name text primary key,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$')
);
alter table vvr.arena_publishers enable row level security;
revoke all on vvr.arena_publishers from public,anon,authenticated,service_role;

create unique index arena_match_single_winner on vvr.score_events(source_id) where metric='arena_wins';

create function vvr.ingest_arena_result(p_token_hash text,p_match uuid,p_telegram text,p_name text,p_finished timestamptz)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare
  player uuid;
begin
  if not exists(select from vvr.arena_publishers where name='railway' and token_hash=p_token_hash) then
    raise exception 'arena_publisher_required' using errcode='42501';
  end if;
  select id into player from vvr.players where telegram_id=p_telegram;
  if not found then player:=vvr.resolve_player(p_telegram,p_name); end if;
  return vvr.record_score(player,'arena_wins',p_match,1,p_finished);
end;
$$;

create function public.vvr_ingest_arena_result(p_token_hash text,p_match uuid,p_telegram text,p_name text,p_finished timestamptz)
returns boolean language sql security invoker set search_path=pg_catalog
as $$ select vvr.ingest_arena_result(p_token_hash,p_match,p_telegram,p_name,p_finished); $$;

revoke all on function vvr.ingest_arena_result(text,uuid,text,text,timestamptz),
  public.vvr_ingest_arena_result(text,uuid,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function vvr.ingest_arena_result(text,uuid,text,text,timestamptz),
  public.vvr_ingest_arena_result(text,uuid,text,text,timestamptz) to service_role;
