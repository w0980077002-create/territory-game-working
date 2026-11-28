-- TON Connect: optional player wallets and the project treasury address. Nothing here moves funds:
-- the address is display and future-payout data; payments for game goods stay on Telegram Stars.
create table vvr.player_ton_wallets (
  player_id uuid primary key references vvr.players(id),
  address text not null check (address ~ '^-?[0-9]:[0-9a-f]{64}$'),
  linked_at timestamptz not null default clock_timestamp()
);
create table vvr.finance_settings (
  key text primary key check (key in ('treasury_ton')),
  value text not null,
  updated_at timestamptz not null default clock_timestamp()
);
-- Temporary treasury (owner's address, mainnet, checksum verified 28.11); replaceable from SQL/admin later.
insert into vvr.finance_settings(key,value) values('treasury_ton','UQBpuFeBH5dta_DU4OgQUKiRRqQHtpBqISuYef9e_zvNSkbQ');
alter table vvr.player_ton_wallets enable row level security;
alter table vvr.finance_settings enable row level security;
revoke all on vvr.player_ton_wallets,vvr.finance_settings from public,anon,authenticated,service_role;

/** get | link | unlink the player's wallet; returns the wallet and the player's game payment history. */
create function public.vvr_ton_wallet(p_player uuid,p_action text,p_address text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
begin
 if p_action='link' then
  if p_address is null or p_address !~ '^-?[0-9]:[0-9a-f]{64}$' then raise exception 'invalid_address' using errcode='22023'; end if;
  insert into vvr.player_ton_wallets(player_id,address) values(p_player,p_address)
   on conflict(player_id) do update set address=excluded.address,linked_at=clock_timestamp();
 elsif p_action='unlink' then
  delete from vvr.player_ton_wallets where player_id=p_player;
 elsif p_action<>'get' then raise exception 'invalid_action' using errcode='22023';
 end if;
 return jsonb_build_object(
  'address',(select address from vvr.player_ton_wallets where player_id=p_player),
  'history',(select coalesce(jsonb_agg(h order by h->>'at' desc),'[]'::jsonb) from (
    select h from (
     select jsonb_build_object('at',coalesce(paid_at,created_at),'kind','stars','title',sku,'stars',stars,'gems',gems,'status',status) h
      from vvr.stars_orders where player_id=p_player and status<>'pending'
     union all
     select jsonb_build_object('at',at,'kind','transfer','gems',amount,'status','ok')
      from vvr.premium_transfers where player_id=p_player) u
    order by h->>'at' desc limit 30) x));
end;
$$;

create function public.vvr_treasury(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare admin_role text:=vvr.require_admin(p_actor);
begin
 return jsonb_build_object('ton',(select value from vvr.finance_settings where key='treasury_ton'),
  'linkedWallets',(select count(*) from vvr.player_ton_wallets));
end;
$$;
revoke all on function public.vvr_ton_wallet(uuid,text,text),public.vvr_treasury(uuid) from public,anon,authenticated,service_role;
grant execute on function public.vvr_ton_wallet(uuid,text,text),public.vvr_treasury(uuid) to service_role;
notify pgrst,'reload schema';
