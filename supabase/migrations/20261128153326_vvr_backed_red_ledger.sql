-- Closed financial pilot. Principal is counted in 0.0001 USDT units, fees in the configured native asset.
create table vvr.red_treasury (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 issue_enabled boolean not null default false,
 withdrawals_enabled boolean not null default false,
 network text, asset text, fee_asset text, treasury_address text, fee_address text,
 address_pattern text,
 minimum bigint not null default 50000 check(minimum>=30000),
 reserve bigint not null default 0 check(reserve>=0),
 fund bigint not null default 0 check(fund>=0),
 outstanding bigint not null default 0 check(outstanding>=0),
 fees bigint not null default 0 check(fees>=0),
 fees_held bigint not null default 0 check(fees_held between 0 and fees),
 check(reserve=fund+outstanding),
 check(not enabled or (network is not null and asset is not null and fee_asset is not null
  and treasury_address is not null and fee_address is not null and address_pattern is not null))
);
insert into vvr.red_treasury(id) values(true);
create table vvr.red_wallets (
 player_id uuid primary key references vvr.players(id),
 available bigint not null default 0 check(available>=0),
 held bigint not null default 0 check(held>=0)
);
create table vvr.red_withdrawals (
 id uuid primary key,
 player_id uuid not null references vvr.players(id),
 units bigint not null check(units>0),
 destination text not null,
 network text not null,
 asset text not null,
 status text not null default 'requested' check(status in ('requested','approved','sending','rejected','paid')),
 created_at timestamptz not null default clock_timestamp(),
 reviewed_at timestamptz,
 reviewed_by uuid references vvr.players(id),
 fee_cap bigint check(fee_cap>=0),
 dispatch_at timestamptz,
 dispatched_by uuid references vvr.players(id),
 txid text unique,
 settled_at timestamptz
);
create unique index red_open_withdrawal on vvr.red_withdrawals(player_id) where status in ('requested','approved','sending');
create index red_player_history on vvr.red_withdrawals(player_id,created_at desc);
create index red_review_queue on vvr.red_withdrawals(status,created_at,id);
create table vvr.red_commands (
 operation uuid primary key,
 actor uuid not null references vvr.players(id),
 command jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create table vvr.red_awards (
 source text not null,
 event uuid not null,
 player_id uuid not null references vvr.players(id),
 operation uuid not null unique references vvr.red_commands(operation) deferrable initially deferred,
 primary key(source,event,player_id)
);
create table vvr.red_chain_receipts (
 txid text primary key check(txid ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in ('fund','fund_fee','payout')),
 network text not null,
 asset text not null,
 source text not null,
 destination text not null,
 units bigint not null check(units>0),
 withdrawal_id uuid references vvr.red_withdrawals(id),
 fee_units bigint not null check(fee_units>=0),
 occurred_at timestamptz not null,
 verified_at timestamptz not null default clock_timestamp(),
 consumed_by uuid unique references vvr.red_commands(operation) deferrable initially deferred
);
alter table vvr.red_treasury enable row level security;
alter table vvr.red_wallets enable row level security;
alter table vvr.red_withdrawals enable row level security;
alter table vvr.red_commands enable row level security;
alter table vvr.red_awards enable row level security;
alter table vvr.red_chain_receipts enable row level security;
revoke all on vvr.red_treasury,vvr.red_wallets,vvr.red_withdrawals,vvr.red_commands,vvr.red_awards,vvr.red_chain_receipts
 from public,anon,authenticated,service_role;

-- Trusted verifier sends only final, independently validated transfers. No player/admin command can create proof.
create function public.vvr_red_observe(p_receipt jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare policy vvr.red_treasury; prior vvr.red_chain_receipts;
 tx text:=p_receipt->>'txid'; kind text:=p_receipt->>'kind';
 net text:=p_receipt->>'network'; token text:=p_receipt->>'asset';
 sender text:=p_receipt->>'source'; target text:=p_receipt->>'destination';
 units bigint:=(p_receipt->>'units')::bigint; fee bigint:=(p_receipt->>'fee_units')::bigint;
 occurred timestamptz:=(p_receipt->>'occurred_at')::timestamptz;
 related uuid:=nullif(p_receipt->>'request','')::uuid;
begin
 select * into strict policy from vvr.red_treasury where id for update;
 if not policy.enabled then return false; end if;
 if tx is null or tx !~ '^[a-f0-9]{64}$' or kind is null or kind not in ('fund','fund_fee','payout')
    or net is distinct from policy.network or token is distinct from
    (case when kind='fund_fee' then policy.fee_asset else policy.asset end)
    or sender is null or target is null or char_length(sender) not between 4 and 96
    or char_length(target) not between 4 and 96 or sender !~ policy.address_pattern or target !~ policy.address_pattern
    or units is null or units<=0 or fee is null or fee<0 or (kind<>'payout' and fee<>0)
    or occurred is null or not isfinite(occurred) or occurred>clock_timestamp() then return false; end if;
 if (kind='payout')<>(related is not null) then return false; end if;
 if (kind='fund' and target is distinct from policy.treasury_address)
    or (kind='fund_fee' and target is distinct from policy.fee_address)
    or (kind='payout' and sender is distinct from policy.treasury_address) then return false; end if;
 select * into prior from vvr.red_chain_receipts where txid=tx;
 if found then return (prior.kind,prior.network,prior.asset,prior.source,prior.destination,prior.units,prior.fee_units,prior.occurred_at,prior.withdrawal_id)
  is not distinct from (kind,net,token,sender,target,units,fee,occurred,related); end if;
 insert into vvr.red_chain_receipts(txid,kind,network,asset,source,destination,units,fee_units,occurred_at,withdrawal_id)
 values(tx,kind,net,token,sender,target,units,fee,occurred,related);
 return true;
end;
$$;

create function public.vvr_red_action(p_actor uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare policy vvr.red_treasury; old vvr.red_commands; wallet vvr.red_wallets;
 request vvr.red_withdrawals; receipt vvr.red_chain_receipts;
 action text:=p_command->>'kind'; op uuid; player uuid:=p_actor; request_id uuid;
 units bigint; cap bigint; destination text; source text; tx text; reply jsonb;
begin
 if p_actor is null or not exists(select from vvr.players where id=p_actor) then
  raise exception 'red_session_required' using errcode='42501';
 end if;
 if action is null or action not in ('state','admin_state','fund','fund_fee','award','request','approve','reject','dispatch','settle') then
  raise exception 'red_invalid_action' using errcode='22023';
 end if;
 if action not in ('state','request') and vvr.require_admin(p_actor)<>'owner' then
  raise exception 'red_owner_required' using errcode='42501';
 end if;
 if action in ('state','admin_state') then
  select * into strict policy from vvr.red_treasury where id;
  if action='admin_state' then
   return jsonb_build_object('enabled',policy.enabled,'issuance',policy.issue_enabled,'withdrawals',policy.withdrawals_enabled,
    'reserve',policy.reserve::text,'outstanding',policy.outstanding::text,'fund',policy.fund::text,
    'fees',policy.fees::text,'feesHeld',policy.fees_held::text,'feeAsset',policy.fee_asset,
    'queue',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at) from (
     select w.id,w.player_id,w.units::text,w.destination,w.network,w.asset,w.status,w.created_at,w.fee_cap::text
     from vvr.red_withdrawals w where w.status in ('requested','approved','sending') order by w.created_at,w.id limit 100
    ) q),'[]'::jsonb),
    'journal',coalesce((select jsonb_agg(to_jsonb(j) order by j.created_at desc) from (
      select operation,actor,command,result,created_at from vvr.red_commands order by created_at desc,operation limit 50
    ) j),'[]'::jsonb));
  end if;
  if not policy.enabled then return '{"status":"closed"}'; end if;
  select * into wallet from vvr.red_wallets where player_id=p_actor;
  return jsonb_build_object('status','ok','available',coalesce(wallet.available,0)::text,'held',coalesce(wallet.held,0)::text,
   'scale',10000,'minimum',policy.minimum::text,'network',policy.network,'withdrawals',policy.withdrawals_enabled,
   'requests',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
    select w.id,w.units::text,w.status,w.created_at,w.txid from vvr.red_withdrawals w where w.player_id=p_actor order by w.created_at desc,w.id limit 20
   ) q),'[]'::jsonb));
 end if;

 op:=(p_command->>'operation')::uuid;
 if op is null then raise exception 'red_operation_required' using errcode='22023'; end if;
 -- Every mutating transition locks the same treasury row before wallet or request locks.
 select * into strict policy from vvr.red_treasury where id for update;
 select * into old from vvr.red_commands where operation=op;
 if found then
  if old.actor<>p_actor or old.command<>p_command then raise exception 'red_operation_conflict' using errcode='23505'; end if;
  if action='dispatch' then return jsonb_build_object('status','already_claimed','request',old.result->>'request'); end if;
  return old.result;
 end if;
 if not policy.enabled then return '{"status":"closed"}'; end if;

 if action in ('fund','fund_fee') then
  tx:=p_command->>'txid';
  select * into receipt from vvr.red_chain_receipts where txid=tx;
  if not found or receipt.kind<>action or receipt.consumed_by is not null then return '{"status":"proof_required"}'; end if;
  if action='fund' then
   if receipt.network<>policy.network or receipt.asset<>policy.asset or receipt.destination<>policy.treasury_address then
    return '{"status":"proof_mismatch"}';
   end if;
   update vvr.red_treasury set reserve=reserve+receipt.units,fund=fund+receipt.units where id;
  else
   if receipt.network<>policy.network or receipt.asset<>policy.fee_asset or receipt.destination<>policy.fee_address then
    return '{"status":"proof_mismatch"}';
   end if;
   update vvr.red_treasury set fees=fees+receipt.units where id;
  end if;
 elsif action='award' then
  if not policy.issue_enabled then return '{"status":"closed"}'; end if;
  source:=p_command->>'source'; player:=(p_command->>'player')::uuid; units:=(p_command->>'units')::bigint;
  if source is null or source not in ('free_world_boss','free_tournament','free_achievement')
    or units is null or units<=0 or player is null or p_command->>'event' is null then
   raise exception 'red_invalid_award' using errcode='22023';
  end if;
  if policy.fund<units then return '{"status":"unfunded"}'; end if;
  insert into vvr.red_awards values(source,(p_command->>'event')::uuid,player,op)
   on conflict on constraint red_awards_pkey do nothing;
  if not found then return '{"status":"duplicate_event"}'; end if;
  update vvr.red_treasury set fund=fund-units,outstanding=outstanding+units where id;
  insert into vvr.red_wallets(player_id,available) values(player,units)
   on conflict(player_id) do update set available=vvr.red_wallets.available+excluded.available;
 elsif action='request' then
  if not policy.withdrawals_enabled then return '{"status":"closed"}'; end if;
  units:=(p_command->>'units')::bigint; destination:=p_command->>'destination';
  if units is null or units<policy.minimum or destination is null or char_length(destination) not between 4 and 96
   or destination !~ policy.address_pattern then raise exception 'red_invalid_request' using errcode='22023'; end if;
  if exists(select from vvr.red_withdrawals where player_id=p_actor and status in ('requested','approved','sending')) then
   return '{"status":"request_pending"}';
  end if;
  update vvr.red_wallets set available=available-units,held=held+units where player_id=p_actor and available>=units;
  if not found then return '{"status":"insufficient"}'; end if;
  insert into vvr.red_withdrawals(id,player_id,units,destination,network,asset)
   values(op,p_actor,units,destination,policy.network,policy.asset);
  request_id:=op;
 else
  request_id:=(p_command->>'request')::uuid;
  select * into request from vvr.red_withdrawals where id=request_id for update;
  if not found then return '{"status":"unknown_request"}'; end if;
  if action='approve' then
   if not policy.withdrawals_enabled then return '{"status":"closed"}'; end if;
   cap:=(p_command->>'fee_cap')::bigint;
   if request.status<>'requested' or request.created_at+interval '14 days'<clock_timestamp()
     or request.network<>policy.network or request.asset<>policy.asset then return '{"status":"invalid_transition"}'; end if;
   if cap is null or cap<0 or cap>policy.fees-policy.fees_held then return '{"status":"fee_reserve_required"}'; end if;
   update vvr.red_withdrawals set status='approved',reviewed_at=clock_timestamp(),reviewed_by=p_actor,fee_cap=cap where id=request_id;
   update vvr.red_treasury set fees_held=fees_held+cap where id;
  elsif action='reject' then
   if request.status<>'requested' then return '{"status":"invalid_transition"}'; end if;
   update vvr.red_withdrawals set status='rejected',reviewed_at=clock_timestamp(),reviewed_by=p_actor where id=request_id;
   update vvr.red_wallets set available=available+request.units,held=held-request.units where player_id=request.player_id;
  elsif action='dispatch' then
   if not policy.withdrawals_enabled then return '{"status":"closed"}'; end if;
   if request.status<>'approved' or request.network<>policy.network or request.asset<>policy.asset then
    return '{"status":"invalid_transition"}';
   end if;
   update vvr.red_withdrawals set status='sending',dispatch_at=clock_timestamp(),dispatched_by=p_actor where id=request_id;
  else
   if request.status<>'sending' then return '{"status":"invalid_transition"}'; end if;
   tx:=p_command->>'txid';
   select * into receipt from vvr.red_chain_receipts where txid=tx;
   if not found or receipt.kind<>'payout' or receipt.consumed_by is not null then return '{"status":"proof_required"}'; end if;
   if receipt.network<>request.network or receipt.asset<>request.asset or receipt.destination<>request.destination
     or receipt.units<>request.units or receipt.withdrawal_id is distinct from request_id
     or receipt.fee_units>request.fee_cap or receipt.occurred_at<date_trunc('second',request.dispatch_at)
     or receipt.source<>policy.treasury_address then return '{"status":"proof_mismatch"}'; end if;
   update vvr.red_withdrawals set status='paid',txid=tx,settled_at=clock_timestamp() where id=request_id;
   update vvr.red_wallets set held=held-request.units where player_id=request.player_id;
   update vvr.red_treasury set reserve=reserve-request.units,outstanding=outstanding-request.units,
    fees=fees-receipt.fee_units,fees_held=fees_held-request.fee_cap where id;
  end if;
 end if;
 reply:=jsonb_strip_nulls(jsonb_build_object('status','ok','request',request_id,'txid',tx));
 insert into vvr.red_commands(operation,actor,command,result) values(op,p_actor,p_command,reply);
 if tx is not null then update vvr.red_chain_receipts set consumed_by=op where txid=tx; end if;
 return reply;
end;
$$;

revoke all on function public.vvr_red_observe(jsonb),public.vvr_red_action(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.vvr_red_observe(jsonb),public.vvr_red_action(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
