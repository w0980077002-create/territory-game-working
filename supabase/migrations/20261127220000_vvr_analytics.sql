-- B2: product analytics inside W066 (no new services). Events carry the internal player id only:
-- no Telegram id, names or free text except a bounded error code/message filtered on the client and here.
create table vvr.analytics_events (
  id bigint generated always as identity primary key,
  player_id uuid not null,
  session_id uuid not null,
  kind text not null check (kind in ('enter','session','stage','battle','purchase','error')),
  at timestamptz not null,
  data jsonb not null
);
create index analytics_events_player_at on vvr.analytics_events(player_id,at);
create index analytics_events_kind_at on vvr.analytics_events(kind,at);
alter table vvr.analytics_events enable row level security;
revoke all on vvr.analytics_events from public,anon,authenticated,service_role;

-- Strings reach the table only through these filters.
create function vvr.analytics_token(p_value jsonb,p_max int)
returns text language sql immutable set search_path=pg_catalog
as $$ select case when jsonb_typeof(p_value)='string' and (p_value#>>'{}') ~ ('^[a-z0-9_.:-]{1,'||p_max||'}$')
  then p_value#>>'{}' end $$;
create function vvr.analytics_int(p_value jsonb,p_min bigint,p_max bigint)
returns bigint language sql immutable set search_path=pg_catalog
as $$ select case when jsonb_typeof(p_value)='number' and (p_value#>>'{}') ~ '^-?[0-9]{1,15}$'
  and (p_value#>>'{}')::bigint between p_min and p_max then (p_value#>>'{}')::bigint end $$;

/** Accepts up to 25 events; invalid ones are skipped. At most 600 events per player per hour are stored. */
create function public.vvr_track(p_player uuid,p_events jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
 e jsonb;
 kind text;
 data jsonb;
 session uuid;
 ago bigint;
 budget int;
 stored int:=0;
begin
 if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) not between 1 and 25 then
  raise exception 'invalid_events' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('vvr.track:'||p_player::text,0));
 select 600-count(*) into budget from vvr.analytics_events
  where player_id=p_player and at>clock_timestamp()-interval '1 hour';
 for e in select value from jsonb_array_elements(p_events) loop
  exit when budget<=0;
  continue when jsonb_typeof(e) is distinct from 'object';
  kind:=e->>'kind';
  ago:=vvr.analytics_int(e->'ago',0,604800);
  begin session:=(e->>'session')::uuid; exception when others then session:=null; end;
  continue when session is null or ago is null;
  data:=case kind
   when 'enter' then jsonb_strip_nulls(jsonb_build_object('first',case when jsonb_typeof(e->'first')='boolean' then e->'first' end,
     'version',vvr.analytics_token(e->'version',24),'stage',vvr.analytics_int(e->'stage',1,100000)))
   when 'session' then jsonb_build_object('seconds',vvr.analytics_int(e->'seconds',0,86400))
   when 'stage' then jsonb_build_object('stage',vvr.analytics_int(e->'stage',1,100000),'level',vvr.analytics_int(e->'level',1,100000))
   when 'battle' then jsonb_build_object('mode',vvr.analytics_token(e->'mode',16),'win',case when jsonb_typeof(e->'win')='boolean' then e->'win' end,
     'seconds',vvr.analytics_int(e->'seconds',0,3600),'stage',vvr.analytics_int(e->'stage',1,100000))
   when 'purchase' then jsonb_build_object('sku',vvr.analytics_token(e->'sku',48),'currency',vvr.analytics_token(e->'currency',16),
     'price',vvr.analytics_int(e->'price',0,1000000000000))
   when 'error' then jsonb_strip_nulls(jsonb_build_object('code',vvr.analytics_token(e->'code',40),
     'message',case when jsonb_typeof(e->'message')='string' then left(regexp_replace(e->>'message','[0-9]{4,}','#','g'),120) end))
  end;
  -- Every field of the kind must survive its filter (error message is optional).
  continue when data is null or exists(select from jsonb_each(data) where value='null'::jsonb)
   or (kind='error' and data->>'code' is null) or (kind='enter' and data->>'first' is null);
  insert into vvr.analytics_events(player_id,session_id,kind,at,data)
   values(p_player,session,kind,clock_timestamp()-make_interval(secs=>ago),data);
  stored:=stored+1;budget:=budget-1;
 end loop;
 return jsonb_build_object('stored',stored);
end;
$$;

/** Launch metrics for the admin panel: funnel of the first session, D1/D7, battles, purchases, client errors. */
create function public.vvr_analytics_report(p_actor uuid,p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
 admin_role text:=vvr.require_admin(p_actor);
 since timestamptz:=clock_timestamp()-make_interval(days=>least(greatest(coalesce(p_days,14),1),90));
 result jsonb;
begin
 with firsts as (
  select distinct on (player_id) player_id,session_id,at as first_at
  from vvr.analytics_events where kind='enter' and (data->>'first')::boolean
  order by player_id,at
 ), cohort as (select * from firsts where first_at>=since),
 first_session as (
  select c.player_id,c.first_at,greatest(
   coalesce(extract(epoch from max(e.at)-min(e.at)),0),
   coalesce(max((e.data->>'seconds')::numeric) filter (where e.kind='session'),0)) as seconds
  -- A Mini App can stay open in the background for days: only the first two hours describe the first session.
  from cohort c join vvr.analytics_events e on e.player_id=c.player_id and e.session_id=c.session_id
   and e.at<c.first_at+interval '2 hours'
  group by c.player_id,c.first_at
 ), returns as (
  select c.player_id,c.first_at,
   bool_or(e.at::date=c.first_at::date+1) as d1,bool_or(e.at::date=c.first_at::date+7) as d7
  from cohort c join vvr.analytics_events e on e.player_id=c.player_id and e.kind='enter'
  group by c.player_id,c.first_at
 )
 select jsonb_build_object(
  'days',extract(day from clock_timestamp()-since)::int,
  'newPlayers',(select count(*) from cohort),
  'funnel',(select jsonb_build_object('m5',count(*) filter (where seconds>=300),'m15',count(*) filter (where seconds>=900),
    'm30',count(*) filter (where seconds>=1800)) from first_session),
  'd1',(select jsonb_build_object('eligible',count(*),'returned',count(*) filter (where d1)) from returns
    where first_at::date+1<current_date),
  'd7',(select jsonb_build_object('eligible',count(*),'returned',count(*) filter (where d7)) from returns
    where first_at::date+7<current_date),
  'activePlayers',(select count(distinct player_id) from vvr.analytics_events where at>=since),
  'battles',(select coalesce(jsonb_object_agg(mode,jsonb_build_object('count',n,'wins',w)),'{}'::jsonb) from (
    select data->>'mode' mode,count(*) n,count(*) filter (where (data->>'win')::boolean) w
    from vvr.analytics_events where kind='battle' and at>=since group by 1) b),
  'purchases',(select coalesce(jsonb_agg(jsonb_build_object('sku',sku,'currency',currency,'count',n,'total',total) order by n desc),'[]'::jsonb) from (
    select data->>'sku' sku,data->>'currency' currency,count(*) n,sum((data->>'price')::numeric) total
    from vvr.analytics_events where kind='purchase' and at>=since group by 1,2 order by 3 desc limit 20) p),
  'errors',(select coalesce(jsonb_agg(jsonb_build_object('code',code,'count',n,'players',players,'example',example) order by n desc),'[]'::jsonb) from (
    select data->>'code' code,count(*) n,count(distinct player_id) players,max(data->>'message') example
    from vvr.analytics_events where kind='error' and at>=since group by 1 order by 2 desc limit 10) r)
 ) into result;
 return result;
end;
$$;

revoke all on function vvr.analytics_token(jsonb,int),vvr.analytics_int(jsonb,bigint,bigint) from public,anon,authenticated,service_role;
revoke all on function public.vvr_track(uuid,jsonb),public.vvr_analytics_report(uuid,int) from public,anon,authenticated,service_role;
grant execute on function public.vvr_track(uuid,jsonb),public.vvr_analytics_report(uuid,int) to service_role;
notify pgrst,'reload schema';
