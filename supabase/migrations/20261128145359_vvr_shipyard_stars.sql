-- The Stars pilot has its own closed gate and never imports Solo balances.
insert into vvr.network_features(name,enabled) values ('shipyard_stars',false) on conflict do nothing;
alter table vvr.stars_offers drop constraint stars_offers_kind_check,
  add constraint stars_offers_kind_check check(kind in ('gems','support','test','ship'));
insert into vvr.stars_offers(sku,kind,title,stars,gems,sort,active) values
 ('ship-scout','ship','Разведывательный корабль',250,0,30,false),
 ('ship-merchant','ship','Торговый корабль',250,0,31,false),
 ('ship-warship','ship','Боевой корабль',250,0,32,false),
 ('ship-dragon','ship','Северный дракон',250,0,33,false),
 ('ship-odin','ship','Флагман Одина',250,0,34,false);

create table vvr.paid_hulls (
  order_id uuid primary key references vvr.stars_orders(id),
  player_id uuid not null references vvr.players(id),
  hull text not null check(hull in ('scout','merchant','warship','dragon','odin')),
  state text not null default 'pending' check(state in ('pending','active','expired','refunding','refunded','salvaged','disputed')),
  checkout_at timestamptz,
  checkout_id text,
  used boolean not null default false,
  level integer not null default 1 check(level between 1 and 5),
  version integer not null default 1,
  voyage jsonb,
  repair integer not null default 0 check(repair>=0),
  rig text check(rig in ('sails','nets','pennant')),
  compensation integer check(compensation in (600,625,650,675,700))
);
create index paid_hulls_player on vvr.paid_hulls(player_id);
create unique index paid_hulls_live on vvr.paid_hulls(player_id) where state in ('pending','active','refunding');
create table vvr.paid_harbor (
  player_id uuid primary key references vvr.players(id),
  gold bigint not null default 0 check(gold between 0 and 1000000000),
  materials bigint not null default 0 check(materials between 0 and 1000000000),
  seals bigint not null default 0 check(seals between 0 and 1000000000)
);
alter table vvr.paid_hulls enable row level security;
alter table vvr.paid_harbor enable row level security;
revoke all on vvr.paid_hulls,vvr.paid_harbor from public,anon,authenticated,service_role;

create function vvr.shipyard_sales_open(p_player uuid)
returns boolean language sql stable set search_path=pg_catalog as $$
 select vvr.network_allowed(p_player,'shipyard_stars') and vvr.network_allowed(p_player,'stars_shop')
  and not exists(select from vvr.paid_hulls where player_id=p_player and state='disputed')
$$;
revoke all on function vvr.shipyard_sales_open(uuid) from public,anon,authenticated,service_role;

create function public.vvr_shipyard_order(p_player uuid,p_hull text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare ship vvr.paid_hulls; offer vvr.stars_offers; order_id uuid; issued timestamptz;
begin
 perform 1 from vvr.players where id=p_player for no key update;
 if not found or not vvr.shipyard_sales_open(p_player) then return '{"status":"unavailable"}'; end if;
 select * into offer from vvr.stars_offers where sku='ship-'||p_hull and kind='ship' and stars=250 and gems=0 and not active;
 if not found then return '{"status":"unknown_offer"}'; end if;
 select * into ship from vvr.paid_hulls where player_id=p_player and state in ('pending','active','refunding') for update;
 if found then
  if ship.state<>'pending' then return '{"status":"occupied"}'; end if;
  if ship.checkout_at is not null then return '{"status":"awaiting_payment"}'; end if;
  select created_at into issued from vvr.stars_orders where id=ship.order_id;
  if issued>clock_timestamp()-interval '15 minutes' then
   if ship.hull<>p_hull then return '{"status":"invoice_pending"}'; end if;
   order_id:=ship.order_id;
  else
   update vvr.paid_hulls set state='expired' where paid_hulls.order_id=ship.order_id;
  end if;
 end if;
 if order_id is null then
  insert into vvr.stars_orders(player_id,sku,stars,gems) values(p_player,offer.sku,250,0) returning id into order_id;
  insert into vvr.paid_hulls(order_id,player_id,hull) values(order_id,p_player,p_hull);
 end if;
 return jsonb_build_object('status','ok','order',order_id,'title',offer.title,'stars',250,'kind','ship');
end;
$$;

-- A pre-check locks the same order then hull as settlement. An abandoned unconfirmed invoice expires.
create function public.vvr_shipyard_precheck(p_order uuid,p_telegram text,p_stars integer,p_query text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare order_row vvr.stars_orders;
begin
 select o.* into order_row from vvr.stars_orders o join vvr.players p on p.id=o.player_id
  where o.id=p_order and o.status='pending' and p.telegram_id=p_telegram and o.stars=p_stars for update of o;
 if not found then return false; end if;
 if order_row.sku not like 'ship-%' then return true; end if;
 if p_stars<>250 or p_query is null or char_length(p_query) not between 1 and 128 then return false; end if;
 if exists(select from vvr.paid_hulls where order_id=p_order and state='pending' and checkout_id=p_query) then return true; end if;
 if not vvr.shipyard_sales_open(order_row.player_id) then return false; end if;
 update vvr.paid_hulls set checkout_at=clock_timestamp(),checkout_id=p_query where order_id=p_order and state='pending'
   and checkout_at is null and order_row.created_at>clock_timestamp()-interval '15 minutes';
 return found;
end;
$$;

-- Existing signed Stars settlement records one unique charge and moves its ship in the same transaction.
create function vvr.paid_hull_order_transition()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare ship vvr.paid_hulls; next_state text;
begin
 if new.sku not like 'ship-%' or new.status=old.status then return new; end if;
 select * into strict ship from vvr.paid_hulls where order_id=new.id for update;
 if old.status='pending' and new.status='paid' and ship.state='pending' and ship.checkout_at is not null and new.charge_id is not null then
  next_state:='active';
 elsif old.status='paid' and new.status='refunding' and ship.state='active' and not ship.used
    and old.paid_at>clock_timestamp()-interval '14 days' then
  next_state:='refunding';
 elsif old.status='refunding' and new.status='paid' and ship.state='refunding' then
  next_state:='active';
 elsif new.status='refunded' and new.refunded_at is not null and ship.state in ('active','refunding','salvaged') then
  next_state:=case when ship.state='salvaged' then 'disputed' else 'refunded' end;
 else
  raise exception 'shipyard_order_transition_rejected' using errcode='22023';
 end if;
 update vvr.paid_hulls set state=next_state,version=version+1 where order_id=new.id;
 return new;
end;
$$;
revoke all on function vvr.paid_hull_order_transition() from public,anon,authenticated,service_role;
create trigger paid_hull_order_transition before update of status on vvr.stars_orders
 for each row execute function vvr.paid_hull_order_transition();

-- A signed Telegram refund receipt resolves an interrupted refund without another provider call.
create function public.vvr_shipyard_refunded(p_order uuid,p_telegram text,p_charge text,p_stars integer)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare paid vvr.stars_orders;
begin
 select o.* into paid from vvr.stars_orders o join vvr.players p on p.id=o.player_id
  where o.id=p_order and o.sku like 'ship-%' and o.charge_id=p_charge and o.stars=p_stars
    and p_stars=250 and p.telegram_id=p_telegram for update of o;
 if not found then return false; end if;
 if paid.status='refunded' then return true; end if;
 if paid.status not in ('paid','refunding') then return false; end if;
 update vvr.stars_orders set status='refunded',refunded_at=clock_timestamp() where id=paid.id;
 insert into vvr.finance_ledger(kind,amount,unit,player_id,ref,note)
  values('stars_refund',-250,'XTR',paid.player_id,paid.charge_id,'shipyard Telegram receipt')
  on conflict do nothing;
 return true;
end;
$$;

create function public.vvr_shipyard_refund_begin(p_actor uuid,p_order uuid)
returns jsonb language sql security definer set search_path=pg_catalog as $$
 select public.vvr_stars_refund_begin(p_actor,p_order)||jsonb_build_object('ship',
   exists(select from vvr.paid_hulls where order_id=p_order))
$$;

create function vvr.shipyard_voyage(p_hull text,p_level integer,p_hours integer,p_rig text)
returns jsonb language sql immutable set search_path=pg_catalog as $$
 with route(hours,gold,materials,seals) as (values (1,110,1,0),(4,380,2,1),(8,680,3,2),(12,960,4,3),(24,1680,6,5)),
 hull(kind,gold,materials,seals) as (values ('scout',100,120,100),('merchant',120,100,100),('warship',100,115,110),('dragon',105,110,110),('odin',105,105,120)),
 reward as (select
   r.gold*h.gold*(100+12*(p_level-1))*(100+case when p_rig='sails' then 10 else 0 end+
     case when p_hull='dragon' and p_hours>=12 then 10 else 0 end)/1000000 gold,
   r.materials*h.materials*(100+12*(p_level-1))*(case when p_rig='nets' then 125 else 100 end)/1000000 materials,
   r.seals*h.seals*(100+12*(p_level-1))*(case when p_rig='pennant' then 125 else 100 end)/1000000 seals
  from route r cross join hull h where r.hours=p_hours and h.kind=p_hull and p_level between 1 and 5)
 select jsonb_build_object('gold',gold,'materials',materials,'seals',seals,'hours',p_hours,
  'repair',gold*(case when p_hull='warship' then 225 else 250 end)/1000) from reward
$$;
revoke all on function vvr.shipyard_voyage(text,integer,integer,text) from public,anon,authenticated,service_role;

create function public.vvr_shipyard_paid(p_player uuid,p_action text,p_order uuid default null,p_version integer default null,
 p_hours integer default null,p_rig text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare paid vvr.stars_orders; ship vvr.paid_hulls; bag vvr.paid_harbor; reward jsonb;
 fee_gold integer; fee_materials integer; payout integer; opened boolean:=vvr.shipyard_sales_open(p_player);
begin
 if p_action='state' then
  select * into ship from vvr.paid_hulls where player_id=p_player and state in ('pending','active','refunding');
  select * into bag from vvr.paid_harbor where player_id=p_player;
  select * into paid from vvr.stars_orders where id=ship.order_id;
  return jsonb_build_object('status','ok','open',opened,'ship',case when ship.order_id is not null then
   jsonb_build_object('order',ship.order_id,'state',ship.state,'hull',ship.hull,'level',ship.level,
     'version',ship.version,'repair',ship.repair,'voyage',ship.voyage,'rig',ship.rig,
     'salvageAt',paid.paid_at+interval '21 days') end,
   'gold',coalesce(bag.gold,0),'materials',coalesce(bag.materials,0),'seals',coalesce(bag.seals,0));
 end if;
 if p_action is null or p_action not in ('launch','claim','repair','outfit','upgrade','salvage') or p_version is null then
  return '{"status":"invalid"}';
 end if;
 select * into paid from vvr.stars_orders where id=p_order and player_id=p_player for update;
 if not found or paid.status<>'paid' then return '{"status":"unavailable"}'; end if;
 select * into ship from vvr.paid_hulls where order_id=p_order and player_id=p_player for update;
 if not found then return '{"status":"unavailable"}'; end if;
 if p_action='salvage' and ship.state='salvaged' then
  return jsonb_build_object('status','ok','compensation',ship.compensation);
 end if;
 if ship.state<>'active' or ship.version<>p_version then return '{"status":"stale"}'; end if;
 insert into vvr.paid_harbor(player_id) values(p_player) on conflict do nothing;
 select * into strict bag from vvr.paid_harbor where player_id=p_player for update;
 if p_action='claim' then
  if ship.voyage is null or (ship.voyage->>'endsAt')::timestamptz>clock_timestamp() then return '{"status":"not_ready"}'; end if;
  update vvr.paid_harbor set gold=gold+(ship.voyage->>'gold')::integer,
   materials=materials+(ship.voyage->>'materials')::integer,seals=seals+(ship.voyage->>'seals')::integer where player_id=p_player;
  ship.repair:=(ship.voyage->>'repair')::integer;
  ship.voyage:=null;
 elsif p_action='repair' then
  if ship.repair=0 or bag.gold<ship.repair then return '{"status":"unavailable"}'; end if;
  update vvr.paid_harbor set gold=gold-ship.repair where player_id=p_player;
  ship.repair:=0;
 else
  if ship.voyage is not null or ship.repair>0 then return '{"status":"busy"}'; end if;
  case p_action
   when 'launch' then
    reward:=vvr.shipyard_voyage(ship.hull,ship.level,p_hours,ship.rig);
    if reward is null then return '{"status":"invalid"}'; end if;
    ship.voyage:=reward||jsonb_build_object('endsAt',clock_timestamp()+make_interval(hours=>p_hours));
   when 'upgrade' then
    if ship.level>=5 then return '{"status":"max_level"}'; end if;
    fee_gold:=(array[800,2000,4300,8000])[ship.level];
    fee_materials:=(array[6,10,18,30])[ship.level];
    if bag.gold<fee_gold or bag.materials<fee_materials then return '{"status":"insufficient"}'; end if;
    update vvr.paid_harbor set gold=gold-fee_gold,materials=materials-fee_materials where player_id=p_player;
    ship.level:=ship.level+1;
   when 'outfit' then
    if p_rig is null or p_rig not in ('sails','nets','pennant') or p_rig is not distinct from ship.rig then return '{"status":"invalid"}'; end if;
    if bag.seals<4 or bag.materials<8 then return '{"status":"insufficient"}'; end if;
    update vvr.paid_harbor set seals=seals-4,materials=materials-8 where player_id=p_player;
    ship.rig:=p_rig;
   when 'salvage' then
    if paid.paid_at is null or paid.paid_at+interval '21 days'>clock_timestamp() then return '{"status":"hold"}'; end if;
    payout:=575+25*ship.level;
    perform public.vvr_premium_credit(p_player,p_order,payout);
    ship.state:='salvaged';
  end case;
 end if;
 update vvr.paid_hulls set state=ship.state,used=true,level=ship.level,version=ship.version+1,voyage=ship.voyage,
  repair=ship.repair,rig=ship.rig,compensation=payout where order_id=p_order;
 return jsonb_build_object('status','ok','compensation',payout);
end;
$$;

revoke all on function public.vvr_shipyard_order(uuid,text),public.vvr_shipyard_precheck(uuid,text,int,text),public.vvr_shipyard_refunded(uuid,text,text,int),
 public.vvr_shipyard_refund_begin(uuid,uuid),public.vvr_shipyard_paid(uuid,text,uuid,int,int,text) from public,anon,authenticated,service_role;
grant execute on function public.vvr_shipyard_order(uuid,text),public.vvr_shipyard_precheck(uuid,text,int,text),public.vvr_shipyard_refunded(uuid,text,text,int),
 public.vvr_shipyard_refund_begin(uuid,uuid),public.vvr_shipyard_paid(uuid,text,uuid,int,int,text) to service_role;
notify pgrst,'reload schema';
