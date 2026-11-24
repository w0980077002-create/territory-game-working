create table vvr.auction_listings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references vvr.network_items(id),
  seller_id uuid not null references vvr.players(id),
  buyer_id uuid references vvr.players(id),
  price integer not null check (price between 1 and 1000000000),
  status text not null default 'open' check (status in ('open','sold','cancelled')),
  opened_at timestamptz not null default now()
);
create unique index auction_active_item on vvr.auction_listings(item_id) where status='open';
create index auction_items on vvr.auction_listings(item_id);
create index auction_open_feed on vvr.auction_listings(opened_at desc,id) where status='open';
create index auction_sellers on vvr.auction_listings(seller_id);
create index auction_buyers on vvr.auction_listings(buyer_id) where buyer_id is not null;
alter table vvr.auction_listings enable row level security;

create table vvr.auction_operations (
  actor_id uuid not null references vvr.players(id),
  operation_id uuid not null,
  command jsonb not null,
  result jsonb not null,
  other_player_id uuid references vvr.players(id),
  at timestamptz not null default now(),
  primary key (actor_id,operation_id)
);
create index auction_other_operations on vvr.auction_operations(other_player_id,at desc) where other_player_id is not null;
alter table vvr.auction_operations enable row level security;

create function vvr.auction_trade(p_player uuid,p_operation uuid,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog
as $$
declare
  verb text := p_command->>'kind';
  listing vvr.auction_listings%rowtype;
  old vvr.auction_operations%rowtype;
  asset uuid;
  other_player uuid;
  price integer;
  reply jsonb;
begin
  if p_operation is null or verb is null or verb not in ('list','buy','cancel') then
    raise exception 'invalid_trade' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_player::text || ':' || p_operation::text,811));
  select * into old from vvr.auction_operations where actor_id=p_player and operation_id=p_operation;
  if found then
    if old.command<>p_command then raise exception 'operation_conflict' using errcode='23505'; end if;
    return old.result;
  end if;

  if verb='list' then
    asset := (p_command->>'itemId')::uuid;
    price := (p_command->>'price')::integer;
    if price is null or price<1 or price>1000000000 then
      raise exception 'invalid_price' using errcode='22023';
    end if;
    perform 1 from vvr.network_items where id=asset and owner_id=p_player for update;
    if not found or exists(select 1 from vvr.auction_listings where item_id=asset and status='open') then
      raise exception 'item_unavailable' using errcode='23505';
    end if;
    insert into vvr.wallets(player_id,resource,balance) values(p_player,'gold',0) on conflict do nothing;
    insert into vvr.auction_listings(item_id,seller_id,price)
      values(asset,p_player,price) returning * into listing;
  else
    select * into listing from vvr.auction_listings where id=(p_command->>'listingId')::uuid for update;
    if not found or listing.status<>'open' then raise exception 'listing_unavailable' using errcode='23505'; end if;
    if verb='cancel' then
      if listing.seller_id<>p_player then raise exception 'seller_required' using errcode='42501'; end if;
      update vvr.auction_listings set status='cancelled' where id=listing.id;
    else
      if listing.seller_id=p_player then raise exception 'self_purchase' using errcode='42501'; end if;
      -- All sales lock the two wallets in the same order, including reciprocal purchases.
      perform 1 from vvr.wallets where resource='gold' and player_id in (p_player,listing.seller_id)
        order by player_id for update;
      update vvr.wallets set balance=balance-listing.price
        where resource='gold' and player_id=p_player and balance>=listing.price;
      if not found then raise exception 'insufficient_gold' using errcode='23505'; end if;
      update vvr.wallets set balance=balance+listing.price
        where resource='gold' and player_id=listing.seller_id and balance<=1000000000-listing.price;
      if not found then raise exception 'seller_wallet_full' using errcode='23505'; end if;
      update vvr.network_items set owner_id=p_player where id=listing.item_id and owner_id=listing.seller_id;
      if not found then raise exception 'item_unavailable' using errcode='23505'; end if;
      update vvr.auction_listings set status='sold',buyer_id=p_player where id=listing.id;
      other_player:=listing.seller_id;
    end if;
  end if;
  reply:=jsonb_build_object('operationId',p_operation,'kind',verb,'listingId',listing.id,
    'itemId',listing.item_id,'price',listing.price,'at',statement_timestamp());
  insert into vvr.auction_operations(actor_id,operation_id,command,result,other_player_id)
    values(p_player,p_operation,p_command,reply,other_player);
  return reply;
end;
$$;

create function vvr.auction_state(p_player uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'gold',coalesce((select balance from vvr.wallets where player_id=p_player and resource='gold'),0),
    'items',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select i.id,i.catalog_id as "catalogId" from vvr.network_items i where i.owner_id=p_player
        and not exists(select 1 from vvr.auction_listings l where l.item_id=i.id and l.status='open')
        order by i.id limit 100) q),'[]'::jsonb),
    'listings',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select l.id,l.price,i.catalog_id as "catalogId",l.seller_id=p_player as mine
        from vvr.auction_listings l join vvr.network_items i on i.id=l.item_id
        where l.status='open' order by l.opened_at desc,l.id limit 50) q),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(q.result) from (
      select result from vvr.auction_operations where actor_id=p_player or other_player_id=p_player
        order by at desc,operation_id limit 100) q),'[]'::jsonb));
$$;

create table vvr.chat_moderators (
  player_id uuid primary key references vvr.players(id)
);
create table vvr.chat_messages (
  id bigint generated always as identity primary key,
  player_id uuid not null references vvr.players(id),
  operation_id uuid not null,
  display_name text not null,
  body text not null check(char_length(body) between 1 and 240),
  sent_at timestamptz not null default clock_timestamp(),
  hidden_by uuid references vvr.players(id),
  hidden_at timestamptz,
  unique(player_id,operation_id)
);
create index chat_visible on vvr.chat_messages(id desc) where hidden_at is null;
create index chat_player_recent on vvr.chat_messages(player_id,sent_at desc);
create index chat_hider on vvr.chat_messages(hidden_by) where hidden_by is not null;
alter table vvr.chat_moderators enable row level security;
alter table vvr.chat_messages enable row level security;

create function vvr.chat_post(p_player uuid,p_operation uuid,p_text text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog
as $$
declare
  message vvr.chat_messages%rowtype;
  body text := btrim(regexp_replace(regexp_replace(normalize(p_text,NFKC),
    U&'[\200B-\200F\202A-\202E\2060-\206F\FEFF]', '', 'g'), '[[:space:][:cntrl:]]+', ' ', 'g'));
  author text;
begin
  if p_operation is null or body is null or char_length(body) not between 1 and 240
     or body ~* '(https?://|www\.|t\.me/|telegram\.me/|startapp[[:space:]]*=)' then
    raise exception 'invalid_message' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_player::text,812));
  select * into message from vvr.chat_messages where player_id=p_player and operation_id=p_operation;
  if found then
    if message.body<>body or message.hidden_at is not null then
      raise exception 'message_unavailable' using errcode='23505';
    end if;
  else
    if exists(select 1 from vvr.chat_messages where player_id=p_player and sent_at>clock_timestamp()-interval '2 seconds') then
      raise exception 'chat_rate' using errcode='P0429';
    end if;
    select display_name into strict author from vvr.players where id=p_player;
    insert into vvr.chat_messages(player_id,operation_id,display_name,body)
      values(p_player,p_operation,author,body) returning * into message;
  end if;
  return jsonb_build_object('id',message.id,'name',message.display_name,'text',message.body,'at',message.sent_at);
end;
$$;

create function vvr.chat_state(p_player uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog
as $$
  select jsonb_build_object('moderator',exists(select 1 from vvr.chat_moderators where player_id=p_player),
    'messages',coalesce((select jsonb_agg(to_jsonb(q) order by q.id) from (
      select id,display_name as name,body as text,sent_at as at from vvr.chat_messages
        where hidden_at is null order by id desc limit 50) q),'[]'::jsonb));
$$;

create table vvr.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(name) between 1 and 64),
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at>starts_at),
  exclude using gist (tstzrange(starts_at,ends_at,'[)') with &&)
);
create table vvr.score_events (
  player_id uuid not null references vvr.players(id),
  metric text not null check(metric in ('world_boss_damage','arena_wins')),
  source_id uuid not null,
  season_id uuid not null references vvr.seasons(id),
  points bigint not null check(points between 1 and 1000000000),
  occurred_at timestamptz not null,
  primary key (player_id,metric,source_id)
);
create index scores_event_season on vvr.score_events(season_id);
create table vvr.season_totals (
  season_id uuid not null references vvr.seasons(id),
  metric text not null,
  player_id uuid not null references vvr.players(id),
  points bigint not null check(points>0),
  primary key (season_id,metric,player_id)
);
create index scores_top on vvr.season_totals(season_id,metric,points desc,player_id);
create index scores_pl on vvr.season_totals(player_id);
alter table vvr.seasons enable row level security;
alter table vvr.score_events enable row level security;
alter table vvr.season_totals enable row level security;

-- Called by the trusted boss or Arena result writer with a stable verified event id.
create function vvr.record_score(p_player uuid,p_metric text,p_event uuid,p_points bigint,p_occurred_at timestamptz)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare active uuid;
begin
  if p_player is null or p_event is null or p_metric is null or p_metric not in ('world_boss_damage','arena_wins') or
    p_points is null or p_points not between 1 and 1000000000 or (p_metric='arena_wins' and p_points<>1) or
    p_occurred_at is null or p_occurred_at>clock_timestamp() then
    raise exception 'invalid_score' using errcode='22023';
  end if;
  select id into active from vvr.seasons where p_occurred_at>=starts_at and p_occurred_at<ends_at;
  if not found then return false; end if;
  insert into vvr.score_events values (p_player,p_metric,p_event,active,p_points,p_occurred_at) on conflict do nothing;
  if not found then
    if not exists(select 1 from vvr.score_events where player_id=p_player and metric=p_metric and source_id=p_event
      and points=p_points and occurred_at=p_occurred_at and season_id=active) then
      raise exception 'score_conflict' using errcode='23505';
    end if;
    return false;
  end if;
  insert into vvr.season_totals values(active,p_metric,p_player,p_points)
    on conflict(season_id,metric,player_id) do update set points=vvr.season_totals.points+excluded.points;
  return true;
end;
$$;

create function vvr.ranking_state(p_player uuid,p_metric text,p_season uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog
as $$
  with season as (
    select id,name,starts_at,ends_at from vvr.seasons
      where (p_season is not null and id=p_season)
      or (p_season is null and now()>=starts_at and now()<ends_at) limit 1
  )
  select jsonb_build_object(
    'season',(select to_jsonb(season) from season),
    'seasons',coalesce((select jsonb_agg(to_jsonb(s)) from (
      select id,name,starts_at,ends_at from vvr.seasons where starts_at<=now()
        order by starts_at desc limit 12) s),'[]'::jsonb),
    'rows',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select rank() over(order by top.points desc) as rank, p.display_name as name,
        top.points,top.player_id=p_player as mine
      from (select t.player_id,t.points from vvr.season_totals t join season s on s.id=t.season_id
        where t.metric=p_metric order by t.points desc,t.player_id limit 50) top
      join vvr.players p on p.id=top.player_id order by top.points desc,top.player_id) q),'[]'::jsonb));
$$;

create role vvr_score_writer nologin nosuperuser nobypassrls;
grant usage on schema vvr to vvr_score_writer;
revoke all on function vvr.record_score(uuid,text,uuid,bigint,timestamptz) from public,anon,authenticated,service_role;
grant execute on function vvr.record_score(uuid,text,uuid,bigint,timestamptz) to vvr_score_writer;

-- This private dispatch is executable only through the verified Edge boundary.
create function vvr.community(p_player uuid,p_action text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if p_player is null or not exists(select 1 from vvr.players where id=p_player) then
    raise exception 'verified_player_required' using errcode='42501';
  end if;
  case p_action
    when 'auction' then return vvr.auction_state(p_player);
    when 'trade' then return vvr.auction_trade(p_player,(p_body->>'operationId')::uuid,p_body-'operationId');
    when 'chat' then return vvr.chat_state(p_player);
    when 'post' then return vvr.chat_post(p_player,(p_body->>'operationId')::uuid,p_body->>'text');
    when 'hide' then
      if not exists(select 1 from vvr.chat_moderators where player_id=p_player) then
        raise exception 'moderator_required' using errcode='42501';
      end if;
      update vvr.chat_messages set hidden_at=now(),hidden_by=p_player
        where id=(p_body->>'message')::bigint and hidden_at is null;
      return jsonb_build_object('hidden',found);
    when 'ranking' then
      if p_body->>'metric' is null or p_body->>'metric' not in ('world_boss_damage','arena_wins') then
        raise exception 'invalid_metric' using errcode='22023';
      end if;
      return vvr.ranking_state(p_player,p_body->>'metric',(p_body->>'season')::uuid);
    else raise exception 'invalid_action' using errcode='22023';
  end case;
end;
$$;

revoke all on vvr.auction_listings,vvr.auction_operations,vvr.chat_moderators,vvr.chat_messages,
  vvr.seasons,vvr.score_events,vvr.season_totals from public,anon,authenticated,service_role;
revoke all on function vvr.auction_trade(uuid,uuid,jsonb),vvr.auction_state(uuid),
  vvr.chat_post(uuid,uuid,text),vvr.chat_state(uuid),vvr.ranking_state(uuid,text,uuid),
  vvr.community(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function vvr.community(uuid,text,jsonb) to service_role;

-- The Data API exposes only invoker wrappers. Browser roles cannot execute either wrapper.
create function public.vvr_resolve_player(p_telegram text,p_name text)
returns uuid language sql security invoker set search_path=pg_catalog
as $$ select vvr.resolve_player(p_telegram,p_name); $$;

create function public.vvr_community(p_player uuid,p_action text,p_body jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select vvr.community(p_player,p_action,p_body); $$;

revoke all on function public.vvr_resolve_player(text,text),public.vvr_community(uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.vvr_resolve_player(text,text),public.vvr_community(uuid,text,jsonb) to service_role;
