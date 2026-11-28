-- Privately gated pilot. Existing Stars and paid gem balances keep their contracts.
insert into vvr.network_features(name,enabled) values ('stars_assortment',false),('rewarded_ads',false) on conflict do nothing;
insert into vvr.stars_offers(sku,kind,title,stars,gems,sort,active) values
 ('edition-north','gems','Северный набор',150,0,40,false),
 ('edition-rome','gems','Римский набор',150,0,41,false),
 ('edition-vip','gems','VIP на 30 дней',250,0,42,false),
 ('edition-pass','gems','Сезонный пропуск',500,0,43,false),
 ('edition-flag','gems','Флаг морехода',100,0,44,false);

create table vvr.assortment_seasons (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 check(starts_at<ends_at)
);
create table vvr.assortment_orders (
 order_id uuid primary key references vvr.stars_orders(id),
 season_id uuid references vvr.assortment_seasons(id),
 checkout_query text
);
create table vvr.rewarded_impressions (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references vvr.players(id),
 created_at timestamptz not null default clock_timestamp(),
 completed_on date,
 provider_receipt text unique
);
create index rewarded_impressions_player on vvr.rewarded_impressions(player_id,completed_on,created_at);
alter table vvr.assortment_seasons enable row level security;
alter table vvr.assortment_orders enable row level security;
alter table vvr.rewarded_impressions enable row level security;
revoke all on vvr.assortment_seasons,vvr.assortment_orders,vvr.rewarded_impressions from public,anon,authenticated,service_role;

create function vvr.assortment_open(p_player uuid)
returns boolean language sql stable set search_path=pg_catalog as $$
 select vvr.network_allowed(p_player,'stars_assortment') and vvr.network_allowed(p_player,'stars_shop')
$$;
revoke all on function vvr.assortment_open(uuid) from public,anon,authenticated,service_role;

create function public.vvr_assortment_order(p_player uuid,p_sku text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare offer vvr.stars_offers; current_season uuid; active_order uuid; checkout text;
begin
 perform 1 from vvr.players where id=p_player for no key update;
 if not found or not vvr.assortment_open(p_player) then return '{"status":"unavailable"}'; end if;
 select * into offer from vvr.stars_offers where sku=p_sku and sku like 'edition-%' and not active and gems=0;
 if not found then return '{"status":"unknown_offer"}'; end if;
 if offer.sku='edition-pass' then
  select id into current_season from vvr.assortment_seasons
   where starts_at<=clock_timestamp() and ends_at>clock_timestamp() order by starts_at desc,id limit 1;
  if not found then return '{"status":"season_closed"}'; end if;
 end if;
 if exists(select from vvr.stars_orders o join vvr.assortment_orders a on a.order_id=o.id
    where o.player_id=p_player and o.sku=offer.sku and o.status in ('paid','refunding')
      and a.season_id is not distinct from current_season
      and (offer.sku<>'edition-vip' or o.paid_at+interval '30 days'>clock_timestamp())) then
  return '{"status":"owned"}';
 end if;
 select o.id,a.checkout_query into active_order,checkout from vvr.stars_orders o join vvr.assortment_orders a on a.order_id=o.id
  where o.player_id=p_player and o.sku=offer.sku and o.status='pending' and a.season_id is not distinct from current_season
    and (a.checkout_query is not null or o.created_at>clock_timestamp()-interval '15 minutes')
  order by o.created_at desc limit 1;
 if checkout is not null then return '{"status":"awaiting_payment"}'; end if;
 if active_order is null then
  insert into vvr.stars_orders(player_id,sku,stars,gems) values(p_player,offer.sku,offer.stars,0) returning id into active_order;
  insert into vvr.assortment_orders values(active_order,current_season,null);
 end if;
 return jsonb_build_object('status','ok','order',active_order,'title',offer.title,'stars',offer.stars,'kind','edition');
end;
$$;

-- The signed Telegram action uses this route only for assortment orders. Null hands off legacy orders.
create function public.vvr_assortment_precheck(p_order uuid,p_telegram text,p_stars integer,p_query text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare paid vvr.stars_orders; sale vvr.assortment_orders;
begin
 if not exists(select from vvr.assortment_orders where order_id=p_order) then return null; end if;
 select * into paid from vvr.stars_orders where id=p_order for update;
 if not found or paid.status<>'pending' or paid.stars<>p_stars or not exists(
  select from vvr.players where id=paid.player_id and telegram_id=p_telegram
 ) or p_query is null or char_length(p_query) not between 1 and 128 then return false; end if;
 select * into strict sale from vvr.assortment_orders where order_id=p_order for update;
 if sale.checkout_query is not null then return sale.checkout_query=p_query; end if;
 if paid.created_at<=clock_timestamp()-interval '15 minutes' or not vvr.assortment_open(paid.player_id) then return false; end if;
 if sale.season_id is not null and not exists(select from vvr.assortment_seasons
   where id=sale.season_id and starts_at<=clock_timestamp() and ends_at>clock_timestamp()) then return false; end if;
 update vvr.assortment_orders set checkout_query=p_query where order_id=p_order;
 return true;
end;
$$;

create function public.vvr_assortment_refunded(p_order uuid,p_telegram text,p_stars int,p_charge text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare sale vvr.stars_orders;
begin
 if not exists(select from vvr.assortment_orders where order_id=p_order) then return null; end if;
 select o.* into sale from vvr.stars_orders o join vvr.players p on p.id=o.player_id
 where o.id=p_order and p.telegram_id=p_telegram and o.charge_id=p_charge and o.stars=p_stars for update of o;
 if not found then return false; end if;
 if sale.status='refunded' then return true; end if;
 if sale.status not in ('paid','refunding') then return false; end if;
 update vvr.stars_orders set status='refunded',refunded_at=clock_timestamp() where id=p_order;
 insert into vvr.finance_ledger(kind,amount,unit,player_id,ref,note)
 values('stars_refund',-p_stars,'XTR',sale.player_id,p_charge,'assortment Telegram receipt') on conflict do nothing;
 return true;
end;
$$;

create function vvr.assortment_accept_order()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.status='pending' and new.status='paid' and new.sku like 'edition-%' and
    not exists(select from vvr.assortment_orders where order_id=new.id and checkout_query is not null) then
  raise exception 'assortment_checkout_required' using errcode='22023';
 end if;
 return new;
end;
$$;
revoke all on function vvr.assortment_accept_order() from public,anon,authenticated,service_role;
create trigger assortment_accept_order before update of status on vvr.stars_orders
 for each row execute function vvr.assortment_accept_order();

create function public.vvr_assortment_state(p_player uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with season as (select * from vvr.assortment_seasons where starts_at<=statement_timestamp()
   and ends_at>statement_timestamp() order by starts_at desc,id limit 1)
 select jsonb_build_object('open',vvr.assortment_open(p_player),
  'vipUntil',(select max(o.paid_at+interval '30 days') from vvr.stars_orders o join vvr.assortment_orders a on a.order_id=o.id
    where o.player_id=p_player and o.sku='edition-vip' and o.status='paid' and o.paid_at+interval '30 days'>statement_timestamp()),
  'season',(select jsonb_build_object('title',s.title,'endsAt',s.ends_at,
    'freeGoal',exists(select from vvr.score_events e where e.player_id=p_player and e.occurred_at>=s.starts_at and e.occurred_at<s.ends_at),
    'pass',exists(select from vvr.stars_orders o join vvr.assortment_orders a on a.order_id=o.id
      where a.season_id=s.id and o.player_id=p_player and o.sku='edition-pass' and o.status='paid')) from season s),
  'owned',coalesce((select jsonb_agg(distinct o.sku) from vvr.stars_orders o join vvr.assortment_orders a on a.order_id=o.id
   where o.player_id=p_player and o.status='paid' and o.sku in ('edition-north','edition-rome','edition-flag')),'[]'::jsonb),
  'adsOpen',vvr.network_allowed(p_player,'rewarded_ads'),
  'adTokens',(select count(*) from vvr.rewarded_impressions where player_id=p_player and completed_on is not null),
  'offers',(select jsonb_agg(jsonb_build_object('sku',sku,'title',title,'stars',stars) order by sort)
    from vvr.stars_offers where sku like 'edition-%'))
$$;

create function public.vvr_rewarded_ad_begin(p_player uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare attempt uuid; today date:=(clock_timestamp() at time zone 'UTC')::date;
begin
 perform 1 from vvr.players where id=p_player for no key update;
 if not found or not vvr.network_allowed(p_player,'rewarded_ads') then return null; end if;
 if (select count(*) from vvr.rewarded_impressions where player_id=p_player and completed_on=today)>=3 then return null; end if;
 select id into attempt from vvr.rewarded_impressions where player_id=p_player and completed_on is null
  and created_at>clock_timestamp()-interval '10 minutes' order by created_at desc limit 1;
 if found then return attempt; end if;
 insert into vvr.rewarded_impressions(player_id) values(p_player) returning id into attempt;
 return attempt;
end;
$$;

create function public.vvr_rewarded_ad_finish(p_attempt uuid,p_receipt text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare player uuid; impression vvr.rewarded_impressions; today date:=(clock_timestamp() at time zone 'UTC')::date;
begin
 if p_receipt is null or char_length(p_receipt) not between 1 and 128 then return false; end if;
 select player_id into player from vvr.rewarded_impressions where id=p_attempt;
 if not found then return false; end if;
 perform 1 from vvr.players where id=player for no key update;
 select * into strict impression from vvr.rewarded_impressions where id=p_attempt for update;
 if impression.completed_on is not null then return impression.provider_receipt=p_receipt; end if;
 if not vvr.network_allowed(player,'rewarded_ads') or impression.created_at<clock_timestamp()-interval '10 minutes'
  or (select count(*) from vvr.rewarded_impressions where player_id=player and completed_on=today)>=3 then return false; end if;
 begin
  update vvr.rewarded_impressions set completed_on=today,provider_receipt=p_receipt where id=p_attempt;
 exception when unique_violation then return false;
 end;
 return true;
end;
$$;

revoke all on function public.vvr_assortment_order(uuid,text),public.vvr_assortment_precheck(uuid,text,int,text),
 public.vvr_assortment_refunded(uuid,text,int,text),public.vvr_assortment_state(uuid),public.vvr_rewarded_ad_begin(uuid),public.vvr_rewarded_ad_finish(uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function public.vvr_assortment_order(uuid,text),public.vvr_assortment_precheck(uuid,text,int,text),
 public.vvr_assortment_refunded(uuid,text,int,text),public.vvr_assortment_state(uuid),public.vvr_rewarded_ad_begin(uuid),public.vvr_rewarded_ad_finish(uuid,text) to service_role;
notify pgrst,'reload schema';
