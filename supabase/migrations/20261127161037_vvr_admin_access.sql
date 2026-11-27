create table vvr.admin_access (
  player_id uuid primary key references vvr.players(id),
  role text not null unique check (role in ('owner','operator','project_lead')),
  granted_at timestamptz not null default now()
);
create table vvr.admin_actions (
  id bigint generated always as identity primary key,
  operation uuid unique,
  actor_telegram text not null,
  actor_role text not null,
  kind text not null,
  reason text not null,
  args jsonb not null,
  result jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);
create table vvr.network_sanctions (
  player_id uuid not null references vvr.players(id),
  kind text not null check (kind in ('chat_mute','trade_ban','network_ban')),
  assigned_role text not null,
  reason text not null,
  expires_at timestamptz,
  primary key (player_id,kind)
);
create table vvr.network_features (
  name text primary key,
  enabled boolean not null
);
insert into vvr.network_features values
 ('arena_ranked',true),('arena_team',true),('auction_trade',true),('chat',true),
 ('world_boss',true),('premium_shop',false);

alter table vvr.admin_access enable row level security;
alter table vvr.admin_actions enable row level security;
alter table vvr.network_sanctions enable row level security;
alter table vvr.network_features enable row level security;
revoke all on vvr.admin_access, vvr.admin_actions, vvr.network_sanctions, vvr.network_features
 from public, anon, authenticated, service_role;
alter table vvr.premium_purchase_orders
 add column refunded_at timestamptz,
 add column refundable_charges integer check (refundable_charges between 0 and amount),
 alter column created_at set default clock_timestamp();

create function vvr.init_order_refund()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
 if new.resource='horn' then new.refundable_charges:=new.amount; end if;
 return new;
end;
$$;
create trigger premium_order_refund before insert on vvr.premium_purchase_orders
 for each row execute function vvr.init_order_refund();

-- The shared Horn balance spends untracked charges first, then paid lots in
-- purchase order. Only Horn debits need to touch order attribution.
create function vvr.record_horn_order_spend()
returns trigger language plpgsql set search_path=pg_catalog
as $$
declare
 spent bigint;
 lot record;
 qty integer;
begin
 select greatest(0,coalesce(sum(refundable_charges),0)-new.balance) into spent
  from vvr.premium_purchase_orders where player_id=new.player_id and refundable_charges>0;
 if spent=0 then return new; end if;
 for lot in select operation_id,refundable_charges from vvr.premium_purchase_orders
   where player_id=new.player_id and refundable_charges>0 order by created_at,operation_id
 loop
  qty:=least(spent,lot.refundable_charges);
  update vvr.premium_purchase_orders set refundable_charges=refundable_charges-qty
   where player_id=new.player_id and operation_id=lot.operation_id;
  spent:=spent-qty;
  exit when spent=0;
 end loop;
 return new;
end;
$$;
create trigger horn_debit_refund_tracking before update of balance on vvr.wallets
 for each row when (old.resource='horn' and new.balance<old.balance)
 execute function vvr.record_horn_order_spend();
revoke all on function vvr.init_order_refund(),vvr.record_horn_order_spend()
 from public,anon,authenticated,service_role;

create function vvr.require_admin(p_actor uuid)
returns text language plpgsql stable set search_path=pg_catalog
as $$
declare admin_role text;
begin
  select role into admin_role from vvr.admin_access where player_id=p_actor;
  if not found then
    raise exception 'admin_access_required' using errcode='42501';
  end if;
  return admin_role;
end;
$$;

create function vvr.network_allowed(p_player uuid,p_feature text)
returns boolean language sql stable set search_path=pg_catalog
as $$
 select coalesce(
   (select enabled from vvr.network_features where name=p_feature),
   p_feature in ('brotherhood','arena_chat','chat_view')
 ) and not exists (
  select from vvr.network_sanctions s
  where s.player_id=p_player and (s.expires_at is null or s.expires_at>statement_timestamp())
    and (
      (s.kind='chat_mute' and p_feature in ('chat','arena_chat'))
      or (s.kind='trade_ban' and p_feature='auction_trade')
      or (s.kind='network_ban' and p_feature in
          ('chat','arena_chat','chat_view','auction_trade','arena_ranked','arena_team','brotherhood','premium_shop'))
    )
 ) and (p_feature not in ('arena_chat','chat_view') or (select enabled from vvr.network_features where name='chat'))
   and (p_feature<>'arena_team' or (select enabled from vvr.network_features where name='arena_ranked'));
$$;

-- Calls originate from Edge Functions after identity verification, or from the
-- existing Railway publisher. Session and Telegram identifiers are never taken
-- from an unsigned browser payload.
create function public.vvr_network_policy(
 p_feature text,p_player uuid default null,p_telegram text default null,p_token_hash text default null
)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$
begin
 if p_token_hash is not null and not exists(
  select from vvr.arena_publishers where name='railway' and token_hash=p_token_hash
 ) then raise exception 'publisher_required' using errcode='42501'; end if;
 if p_telegram is not null then
  select id into p_player from vvr.players where telegram_id=p_telegram;
 end if;
 return coalesce(vvr.network_allowed(p_player,p_feature),false);
end;
$$;

create function public.vvr_admin_find_player(p_actor uuid,p_telegram text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
 admin_role text:=vvr.require_admin(p_actor);
 result jsonb;
begin
 if p_telegram is null or p_telegram !~ '^[1-9][0-9]{0,15}$' then
  raise exception 'invalid_telegram_id' using errcode='22023';
 end if;
 select jsonb_build_object(
  'id',p.id,'name',p.display_name,'paidGems',coalesce(w.balance,0),
  'orders',(select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc),'[]'::jsonb)
   from (select operation_id,sku,price,amount,created_at,refunded_at,refundable_charges
    from vvr.premium_purchase_orders where player_id=p.id order by created_at desc limit 20) o),
  'sanctions',(select coalesce(jsonb_agg(to_jsonb(s) - 'player_id' order by s.kind),'[]'::jsonb)
   from vvr.network_sanctions s where s.player_id=p.id and (s.expires_at is null or s.expires_at>statement_timestamp()))
 ) into result
 from vvr.players p
 left join vvr.wallets w on w.player_id=p.id and w.resource='paid_gems'
 where p.telegram_id=p_telegram;
 insert into vvr.admin_actions(actor_telegram,actor_role,kind,reason,args)
  select telegram_id,admin_role,'search','player_lookup',jsonb_build_object('telegramId',p_telegram)
  from vvr.players where id=p_actor;
 return result;
end;
$$;

create function public.vvr_admin_status(p_actor uuid,p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare admin_role text:=vvr.require_admin(p_actor);
begin
 return jsonb_build_object(
  'role',admin_role,
  'flags',(select jsonb_object_agg(name,enabled) from vvr.network_features),
  'history',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc),'[]'::jsonb)
    from (select id,actor_telegram,actor_role,kind,reason,args,result,occurred_at
     from vvr.admin_actions where p_before is null or id<p_before order by id desc limit 30) a));
end;
$$;

create function public.vvr_admin_apply(
 p_actor uuid,p_operation uuid,p_kind text,p_reason text,p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
 admin_role text:=vvr.require_admin(p_actor);
 actor_telegram text;
 target uuid;
 order_row vvr.premium_purchase_orders;
 old_action vvr.admin_actions;
 result jsonb:='{"status":"ok"}';
 sanction text;
 expiry timestamptz;
 reason text:=btrim(p_reason);
begin
 if p_operation is null or reason is null or char_length(reason) not between 3 and 280
  or jsonb_typeof(p_payload) is distinct from 'object' or p_kind is null then
  raise exception 'invalid_admin_command' using errcode='22023';
 end if;
 select telegram_id into actor_telegram from vvr.players where id=p_actor;
 perform pg_advisory_xact_lock(hashtextextended('vvr.admin:'||p_operation::text,0));
 select * into old_action from vvr.admin_actions where operation=p_operation;
 if found then
  if old_action.actor_telegram<>actor_telegram or old_action.kind<>p_kind
   or old_action.reason<>reason or old_action.args<>p_payload then
   raise exception 'admin_operation_conflict' using errcode='23505';
  end if;
  return old_action.result;
 end if;
 if p_kind in ('credit','cancel_purchase','sanction','lift') then
  target:=(p_payload->>'player')::uuid;
  perform 1 from vvr.players where id=target for no key update;
  if not found then raise exception 'unknown_player' using errcode='22023'; end if;
 end if;
 case p_kind
 when 'credit' then
  if jsonb_typeof(p_payload->'amount') is distinct from 'number' or (p_payload->>'amount')::integer not between 1 and 1000000 then
   raise exception 'invalid_admin_amount' using errcode='22023';
  end if;
  if not public.vvr_premium_credit(target,p_operation,(p_payload->>'amount')::integer) then
   raise exception 'admin_receipt_conflict' using errcode='23505';
  end if;
 when 'cancel_purchase' then
  select * into order_row from vvr.premium_purchase_orders
   where player_id=target and operation_id=(p_payload->>'purchase')::uuid;
  if not found then
   result:='{"status":"unknown_purchase"}';
  elsif order_row.refunded_at is not null then
   result:='{"status":"already_refunded"}';
  elsif order_row.resource<>'horn' or order_row.refundable_charges<order_row.amount
   or (order_row.refundable_charges is null and exists (
   -- Orders older than the tracking trigger can only be refunded if there
   -- are no openings after their issuance.
   select from vvr.brotherhood_horn_openings
    where player_id=target and kind='horn' and opened_at>=order_row.created_at
  )) then
   result:='{"status":"resource_spent"}';
  else
   perform 1 from vvr.wallets where player_id=target and resource=order_row.resource
    and balance>=order_row.amount for update;
   if not found then
    result:='{"status":"resource_spent"}';
   else
    update vvr.premium_purchase_orders set refunded_at=clock_timestamp(),refundable_charges=0
     where player_id=target and operation_id=order_row.operation_id;
    update vvr.wallets set balance=balance-order_row.amount where player_id=target and resource=order_row.resource;
    if not public.vvr_premium_credit(target,p_operation,order_row.price) then
     raise exception 'admin_receipt_conflict' using errcode='23505';
    end if;
   end if;
  end if;
 when 'sanction','lift' then
  sanction:=p_payload->>'kind';
  if sanction is null or sanction not in ('chat_mute','trade_ban','network_ban') then
    raise exception 'invalid_sanction' using errcode='22023';
  end if;
  if exists(select from vvr.admin_access where player_id=target) then
   raise exception 'admin_target_protected' using errcode='42501';
  end if;
  if p_kind='lift' then
   delete from vvr.network_sanctions where player_id=target and kind=sanction and assigned_role=admin_role;
   if not found then result:='{"status":"sanction_role_mismatch"}'; end if;
  else
   expiry:=(p_payload->>'expiresAt')::timestamptz;
   if expiry is not null and (not isfinite(expiry) or expiry<=clock_timestamp()) then
    raise exception 'invalid_sanction_expiry' using errcode='22023';
   end if;
   insert into vvr.network_sanctions as old values(target,sanction,admin_role,reason,expiry)
    on conflict(player_id,kind) do update set reason=excluded.reason,expires_at=excluded.expires_at,assigned_role=excluded.assigned_role
    where old.assigned_role=admin_role or old.expires_at<=clock_timestamp();
   if not found then result:='{"status":"sanction_role_mismatch"}'; end if;
  end if;
 when 'flag' then
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then
   raise exception 'invalid_network_flag' using errcode='22023';
  end if;
  if p_payload->>'name'='premium_shop' and (p_payload->>'enabled')::boolean then
   result:='{"status":"premium_requires_b5"}';
  else
   update vvr.network_features set enabled=(p_payload->>'enabled')::boolean where name=p_payload->>'name';
   if not found then raise exception 'invalid_network_flag' using errcode='22023'; end if;
  end if;
 else raise exception 'invalid_admin_command' using errcode='22023';
 end case;
 insert into vvr.admin_actions(operation,actor_telegram,actor_role,kind,reason,args,result)
  values(p_operation,actor_telegram,admin_role,p_kind,reason,p_payload,result);
 return result;
end;
$$;

revoke all on function vvr.require_admin(uuid),vvr.network_allowed(uuid,text)
 from public,anon,authenticated,service_role;
revoke all on function public.vvr_admin_find_player(uuid,text),public.vvr_admin_status(uuid,bigint),
 public.vvr_admin_apply(uuid,uuid,text,text,jsonb),public.vvr_network_policy(text,uuid,text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.vvr_admin_find_player(uuid,text),public.vvr_admin_status(uuid,bigint),
 public.vvr_admin_apply(uuid,uuid,text,text,jsonb),public.vvr_network_policy(text,uuid,text,text)
 to service_role;

alter function public.vvr_premium_wallet(uuid,uuid,text) rename to vvr_premium_wallet_internal;
alter function public.vvr_premium_wallet_internal(uuid,uuid,text) set schema vvr;
revoke all on function vvr.vvr_premium_wallet_internal(uuid,uuid,text)
 from public,anon,authenticated,service_role;

create function public.vvr_premium_wallet(p_player uuid,p_operation uuid default null,p_sku text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare refunded_sku text;
begin
 if p_operation is null then
  return vvr.vvr_premium_wallet_internal(p_player,p_operation,p_sku)
   || jsonb_build_object('purchaseAvailable',vvr.network_allowed(p_player,'premium_shop'));
 end if;
 perform 1 from vvr.players where id=p_player for no key update;
 select sku into refunded_sku from vvr.premium_purchase_orders
  where player_id=p_player and operation_id=p_operation and refunded_at is not null;
 if found then
  if refunded_sku is distinct from p_sku then
   raise exception 'premium_operation_conflict' using errcode='23505';
  end if;
  return jsonb_build_object('status','refunded','balance',coalesce((
   select balance from vvr.wallets where player_id=p_player and resource='paid_gems'
  ),0));
 end if;
 if not vvr.network_allowed(p_player,'premium_shop') then
  return jsonb_build_object('status','unavailable','balance',coalesce((
   select balance from vvr.wallets where player_id=p_player and resource='paid_gems'
  ),0));
 end if;
 return vvr.vvr_premium_wallet_internal(p_player,p_operation,p_sku);
end;
$$;
revoke all on function public.vvr_premium_wallet(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.vvr_premium_wallet(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
