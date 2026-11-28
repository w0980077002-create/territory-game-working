-- B5: Telegram Stars. Invoices are created by the server, Telegram's payment updates arrive at the
-- signed bot webhook, and each Telegram charge credits exactly once. Sales stay closed for players
-- until the owner enables `stars_shop`; admins can always buy (closed 1-Star test).
insert into vvr.network_features values ('stars_shop',false) on conflict do nothing;

create table vvr.stars_offers (
  sku text primary key check (sku ~ '^[a-z0-9-]{1,32}$'),
  kind text not null check (kind in ('gems','support','test')),
  title text not null,
  stars integer not null check (stars between 1 and 100000),
  gems integer not null check (gems>=0),
  first_bonus boolean not null default false,
  sort integer not null,
  active boolean not null default true
);
insert into vvr.stars_offers values
 ('test-1','test','Проверка оплаты · 10 самоцветов',1,10,false,0,true),
 ('gems-100','gems','100 самоцветов',50,100,true,1,true),
 ('gems-320','gems','320 самоцветов',150,320,true,2,true),
 ('gems-550','gems','550 самоцветов',250,550,true,3,true),
 ('gems-1150','gems','1150 самоцветов',500,1150,true,4,true),
 ('gems-2400','gems','2400 самоцветов',1000,2400,true,5,true),
 ('gems-6200','gems','6200 самоцветов',2500,6200,true,6,true),
 ('gems-13000','gems','13000 самоцветов',5000,13000,true,7,true),
 ('support-50','support','Поддержать проект',50,0,false,10,true),
 ('support-250','support','Поддержать проект',250,0,false,11,true),
 ('support-1000','support','Поддержать проект',1000,0,false,12,true);

create table vvr.stars_orders (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references vvr.players(id),
  sku text not null references vvr.stars_offers(sku),
  stars integer not null,
  gems integer not null,
  status text not null default 'pending' check (status in ('pending','paid','refunding','refunded')),
  charge_id text unique,
  created_at timestamptz not null default clock_timestamp(),
  paid_at timestamptz,
  refunded_at timestamptz
);
create index stars_orders_player on vvr.stars_orders(player_id,created_at desc);

-- Money movements, one row each. Stars are the unit for Telegram income; other kinds are reserved
-- for crypto, prizes and payouts so the report already separates them.
create table vvr.finance_ledger (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('stars_sale','stars_support','stars_refund','crypto_income','marketplace_fee',
    'ad_income','referral_reward','prize_fund','player_payout','reserve','operating_cost')),
  amount numeric not null,
  unit text not null check (unit in ('XTR','TON','USDT','USD')),
  player_id uuid,
  ref text,
  note text
);
create unique index finance_ledger_ref_once on vvr.finance_ledger(kind,ref) where ref is not null;

create table vvr.premium_transfers (
  operation_id uuid primary key,
  player_id uuid not null references vvr.players(id),
  amount integer not null check (amount>0),
  at timestamptz not null default clock_timestamp()
);

alter table vvr.stars_offers enable row level security;
alter table vvr.stars_orders enable row level security;
alter table vvr.finance_ledger enable row level security;
alter table vvr.premium_transfers enable row level security;
revoke all on vvr.stars_offers,vvr.stars_orders,vvr.finance_ledger,vvr.premium_transfers from public,anon,authenticated,service_role;

create function vvr.paid_gems(p_player uuid) returns bigint language sql stable set search_path=pg_catalog
as $$ select coalesce((select balance from vvr.wallets where player_id=p_player and resource='paid_gems'),0) $$;

/** Catalog for the shop: open flag, bonus eligibility and the account balance. */
create function public.vvr_stars_offers(p_player uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare admin boolean:=exists(select from vvr.admin_access where player_id=p_player);
begin
 return jsonb_build_object(
  'open',vvr.network_allowed(p_player,'stars_shop'),
  'admin',admin,
  'balance',vvr.paid_gems(p_player),
  'offers',(select coalesce(jsonb_agg(jsonb_build_object('sku',o.sku,'kind',o.kind,'title',o.title,'stars',o.stars,
     'gems',o.gems*case when o.first_bonus and not exists(select from vvr.stars_orders s where s.player_id=p_player
       and s.sku=o.sku and s.status in ('paid','refunding')) then 2 else 1 end) order by o.sort),'[]'::jsonb)
   from vvr.stars_offers o where o.active and (o.kind<>'test' or admin)));
end;
$$;

/** A pending order; the edge function turns it into a Telegram invoice link (payload = order id). */
create function public.vvr_stars_order(p_player uuid,p_sku text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
 offer vvr.stars_offers;
 admin boolean:=exists(select from vvr.admin_access where player_id=p_player);
 order_id uuid;
 gems integer;
begin
 select * into offer from vvr.stars_offers where sku=p_sku and active;
 if not found or (offer.kind='test' and not admin) then return '{"status":"unknown_offer"}'; end if;
 if not admin and not vvr.network_allowed(p_player,'stars_shop') then return '{"status":"unavailable"}'; end if;
 perform 1 from vvr.players where id=p_player for no key update;
 if (select count(*) from vvr.stars_orders where player_id=p_player and status='pending'
   and created_at>clock_timestamp()-interval '1 hour')>=20 then return '{"status":"too_many_orders"}'; end if;
 gems:=offer.gems*case when offer.first_bonus and not exists(select from vvr.stars_orders s where s.player_id=p_player
   and s.sku=offer.sku and s.status in ('paid','refunding')) then 2 else 1 end;
 insert into vvr.stars_orders(player_id,sku,stars,gems) values(p_player,offer.sku,offer.stars,gems) returning id into order_id;
 return jsonb_build_object('status','ok','order',order_id,'title',offer.title,'stars',offer.stars,'gems',gems,'kind',offer.kind);
end;
$$;

/** pre_checkout_query: the order exists, is unpaid, belongs to this Telegram user and has this price. */
create function public.vvr_stars_precheck(p_order uuid,p_telegram text,p_stars integer)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
 select exists(select from vvr.stars_orders o join vvr.players p on p.id=o.player_id
  where o.id=p_order and o.status='pending' and p.telegram_id=p_telegram and o.stars=p_stars)
$$;

/** successful_payment: idempotent by Telegram charge id. Credits the account wallet once. */
create function public.vvr_stars_paid(p_order uuid,p_telegram text,p_stars integer,p_charge text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare o vvr.stars_orders; kind text;
begin
 if p_charge is null or char_length(p_charge) not between 1 and 256 then raise exception 'invalid_charge' using errcode='22023'; end if;
 select * into o from vvr.stars_orders where charge_id=p_charge;
 if found then return jsonb_build_object('status','duplicate','order',o.id); end if;
 select s.* into o from vvr.stars_orders s join vvr.players p on p.id=s.player_id
  where s.id=p_order and p.telegram_id=p_telegram and s.stars=p_stars for update of s;
 if not found then
  -- Telegram took the payment but the order does not match: keep a trace for a manual refund.
  insert into vvr.finance_ledger(kind,amount,unit,ref,note) values('stars_sale',p_stars,'XTR',p_charge,'unmatched order '||coalesce(p_order::text,'?'));
  return '{"status":"unmatched"}';
 end if;
 if o.status<>'pending' then return jsonb_build_object('status','not_pending','order',o.id); end if;
 update vvr.stars_orders set status='paid',charge_id=p_charge,paid_at=clock_timestamp() where id=o.id;
 if o.gems>0 then perform public.vvr_premium_credit(o.player_id,o.id,o.gems); end if;
 kind:=(select case when s.kind='support' then 'stars_support' else 'stars_sale' end from vvr.stars_offers s where s.sku=o.sku);
 insert into vvr.finance_ledger(kind,amount,unit,player_id,ref,note) values(kind,o.stars,'XTR',o.player_id,p_charge,o.sku);
 return jsonb_build_object('status','ok','order',o.id,'gems',o.gems);
end;
$$;

/** Admin refund, step 1: only while the credited gems are still unspent; debits them and returns the charge. */
create function public.vvr_stars_refund_begin(p_actor uuid,p_order uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare admin_role text:=vvr.require_admin(p_actor); o vvr.stars_orders; telegram text;
begin
 if admin_role<>'owner' then raise exception 'owner_required' using errcode='42501'; end if;
 select * into o from vvr.stars_orders where id=p_order for update;
 if not found then return '{"status":"unknown_order"}'; end if;
 if o.status<>'paid' then return jsonb_build_object('status','not_paid','current',o.status); end if;
 if o.gems>0 then
  update vvr.wallets set balance=balance-o.gems where player_id=o.player_id and resource='paid_gems' and balance>=o.gems;
  if not found then return '{"status":"gems_spent"}'; end if;
 end if;
 update vvr.stars_orders set status='refunding' where id=o.id;
 select telegram_id into telegram from vvr.players where id=o.player_id;
 return jsonb_build_object('status','ok','telegram',telegram,'charge',o.charge_id,'stars',o.stars);
end;
$$;

/** Admin refund, step 2: Telegram's answer. A failed refund restores the gems with a fresh receipt. */
create function public.vvr_stars_refund_finish(p_actor uuid,p_order uuid,p_ok boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare admin_role text:=vvr.require_admin(p_actor); o vvr.stars_orders;
begin
 select * into o from vvr.stars_orders where id=p_order and status='refunding' for update;
 if not found then return '{"status":"not_refunding"}'; end if;
 if p_ok then
  update vvr.stars_orders set status='refunded',refunded_at=clock_timestamp() where id=o.id;
  insert into vvr.finance_ledger(kind,amount,unit,player_id,ref,note) values('stars_refund',-o.stars,'XTR',o.player_id,o.charge_id,o.sku);
  insert into vvr.admin_actions(operation,actor_telegram,actor_role,kind,reason,args,result)
   select gen_random_uuid(),telegram_id,admin_role,'stars_refund','owner_refund',jsonb_build_object('order',o.id),'{"status":"ok"}'
   from vvr.players where id=p_actor;
  return '{"status":"refunded"}';
 end if;
 update vvr.stars_orders set status='paid' where id=o.id;
 if o.gems>0 then perform public.vvr_premium_credit(o.player_id,gen_random_uuid(),o.gems); end if;
 return '{"status":"restored"}';
end;
$$;

/** Moves account gems to the hero's save. Idempotent per operation; the client records the receipt once. */
create function public.vvr_premium_transfer(p_player uuid,p_operation uuid,p_amount integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare t vvr.premium_transfers;
begin
 if p_operation is null or p_amount is null or p_amount not between 1 and 1000000 then
  raise exception 'invalid_transfer' using errcode='22023';
 end if;
 perform 1 from vvr.players where id=p_player for no key update;
 select * into t from vvr.premium_transfers where operation_id=p_operation;
 if found then
  if t.player_id<>p_player or t.amount<>p_amount then raise exception 'transfer_conflict' using errcode='23505'; end if;
  return jsonb_build_object('status','ok','amount',t.amount,'balance',vvr.paid_gems(p_player));
 end if;
 update vvr.wallets set balance=balance-p_amount where player_id=p_player and resource='paid_gems' and balance>=p_amount;
 if not found then return jsonb_build_object('status','insufficient','balance',vvr.paid_gems(p_player)); end if;
 insert into vvr.premium_transfers(operation_id,player_id,amount) values(p_operation,p_player,p_amount);
 return jsonb_build_object('status','ok','amount',p_amount,'balance',vvr.paid_gems(p_player));
end;
$$;

/** Finance section of the admin panel. Owner revenue in USD is an estimate at the given Stars rate. */
create function public.vvr_finance_report(p_actor uuid,p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare admin_role text:=vvr.require_admin(p_actor);
 since timestamptz:=clock_timestamp()-make_interval(days=>least(greatest(coalesce(p_days,30),1),3650));
begin
 return jsonb_build_object(
  'totals',(select coalesce(jsonb_object_agg(kind||':'||unit,total),'{}'::jsonb) from
    (select kind,unit,sum(amount) total from vvr.finance_ledger where at>=since group by 1,2) t),
  'orders',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) from
    (select o.id,o.sku,o.stars,o.gems,o.status,o.created_at,o.paid_at,p.telegram_id as telegram
     from vvr.stars_orders o join vvr.players p on p.id=o.player_id
     where o.status<>'pending' and o.created_at>=since order by o.created_at desc limit 50) r),
  'payers',(select count(distinct player_id) from vvr.stars_orders where status='paid' and paid_at>=since),
  'pending',(select count(*) from vvr.stars_orders where status='pending' and created_at>=since));
end;
$$;

-- Owner-controlled opening: both premium flags can now be switched on from the admin panel.
create or replace function public.vvr_stars_owner_telegram()
returns text language sql stable security definer set search_path=pg_catalog
as $$ select p.telegram_id from vvr.admin_access a join vvr.players p on p.id=a.player_id where a.role='owner' $$;

revoke all on function vvr.paid_gems(uuid) from public,anon,authenticated,service_role;
revoke all on function public.vvr_stars_offers(uuid),public.vvr_stars_order(uuid,text),public.vvr_stars_precheck(uuid,text,integer),
 public.vvr_stars_paid(uuid,text,integer,text),public.vvr_stars_refund_begin(uuid,uuid),public.vvr_stars_refund_finish(uuid,uuid,boolean),
 public.vvr_premium_transfer(uuid,uuid,integer),public.vvr_finance_report(uuid,int),public.vvr_stars_owner_telegram()
 from public,anon,authenticated,service_role;
grant execute on function public.vvr_stars_offers(uuid),public.vvr_stars_order(uuid,text),public.vvr_stars_precheck(uuid,text,integer),
 public.vvr_stars_paid(uuid,text,integer,text),public.vvr_stars_refund_begin(uuid,uuid),public.vvr_stars_refund_finish(uuid,uuid,boolean),
 public.vvr_premium_transfer(uuid,uuid,integer),public.vvr_finance_report(uuid,int),public.vvr_stars_owner_telegram()
 to service_role;
notify pgrst,'reload schema';
