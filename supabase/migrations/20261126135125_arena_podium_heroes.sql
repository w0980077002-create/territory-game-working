-- Reuse the current season and ranking contract. Only send public class IDs
-- for the three podium positions, without exposing saved character data.
create or replace function public.vvr_arena_podium(p_player uuid) returns jsonb
 language sql stable security definer set search_path=pg_catalog
as $$
 with ranking as (
  select vvr.ranking_state(p_player,'arena_wins',null) as data
 ), leaders as (
  select t.player_id,t.points from vvr.season_totals t,ranking
   where t.metric='arena_wins' and t.season_id=(ranking.data#>>'{season,id}')::uuid
   order by t.points desc,t.player_id limit 3
 )
 select ranking.data||jsonb_build_object(
  'points',coalesce((select t.points from vvr.season_totals t where t.player_id=p_player
   and t.metric='arena_wins' and t.season_id=(ranking.data#>>'{season,id}')::uuid),0),
  'wins',(select count(*) from vvr.score_events where player_id=p_player and metric='arena_wins'),
  'teamLosses',(select count(*) from vvr.arena_room_seats where player_id=p_player and outcome='loss'),
  'serverNow',now(),
  'heroes',coalesce((
   select jsonb_agg(case when hero in ('berserker','ranger','runologist') then hero end order by points desc,player_id)
   from (
    select l.*,coalesce(
     (select s.hero from vvr.arena_room_seats s join vvr.arena_rooms r on r.id=s.room_id
      where s.player_id=l.player_id and r.finished_at is not null order by r.finished_at desc,r.id limit 1),
     (select s.raw::jsonb->>'heroClass' from vvr.solo_snapshots s where s.player_id=l.player_id order by s.revision desc limit 1)
    ) as hero from leaders l
   ) portraits),'[]'::jsonb)
 ) from ranking;
$$;
