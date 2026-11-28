-- Wallet ownership is proven with TON Connect ton_proof (verified in the edge function); payouts will
-- require verified_at. Treasury income with a vvr- comment is booked once per transaction hash.
alter table vvr.player_ton_wallets add column verified_at timestamptz;

drop function public.vvr_ton_wallet(uuid,text,text);
create function public.vvr_ton_wallet(p_player uuid,p_action text,p_address text default null,p_verified boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
begin
 if p_action='link' then
  if p_address is null or p_address !~ '^-?[0-9]:[0-9a-f]{64}$' or not p_verified then raise exception 'invalid_address' using errcode='22023'; end if;
  insert into vvr.player_ton_wallets(player_id,address,verified_at) values(p_player,p_address,clock_timestamp())
   on conflict(player_id) do update set address=excluded.address,linked_at=clock_timestamp(),verified_at=clock_timestamp();
 elsif p_action='unlink' then
  delete from vvr.player_ton_wallets where player_id=p_player;
 elsif p_action<>'get' then raise exception 'invalid_action' using errcode='22023';
 end if;
 return jsonb_build_object(
  'address',(select address from vvr.player_ton_wallets where player_id=p_player),
  'verified',(select verified_at is not null from vvr.player_ton_wallets where player_id=p_player),
  'owner',exists(select from vvr.admin_access where player_id=p_player and role='owner'),
  'treasury',case when exists(select from vvr.admin_access where player_id=p_player and role='owner')
    then (select value from vvr.finance_settings where key='treasury_ton') end,
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

create function public.vvr_crypto_income(p_actor uuid,p_entries jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare admin_role text:=vvr.require_admin(p_actor); e jsonb; added int:=0;
begin
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)>100 then
  raise exception 'invalid_entries' using errcode='22023';
 end if;
 for e in select value from jsonb_array_elements(p_entries) loop
  continue when jsonb_typeof(e->'ton') is distinct from 'number' or (e->>'ton')::numeric<=0
   or coalesce(e->>'hash','')='' or char_length(e->>'hash')>100;
  insert into vvr.finance_ledger(at,kind,amount,unit,ref,note)
   values(coalesce((e->>'at')::timestamptz,clock_timestamp()),'crypto_income',(e->>'ton')::numeric,'TON',e->>'hash',left(e->>'comment',64))
   on conflict (kind,ref) where ref is not null do nothing;
  if found then added:=added+1; end if;
 end loop;
 return jsonb_build_object('added',added,
  'total',(select coalesce(sum(amount),0) from vvr.finance_ledger where kind='crypto_income' and unit='TON'));
end;
$$;
create or replace function public.vvr_treasury(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare admin_role text:=vvr.require_admin(p_actor);
begin
 return jsonb_build_object('ton',(select value from vvr.finance_settings where key='treasury_ton'),
  'linkedWallets',(select count(*) from vvr.player_ton_wallets),
  'verifiedWallets',(select count(*) from vvr.player_ton_wallets where verified_at is not null),
  'cryptoTon',(select coalesce(sum(amount),0) from vvr.finance_ledger where kind='crypto_income' and unit='TON'));
end;
$$;
revoke all on function public.vvr_ton_wallet(uuid,text,text,boolean),public.vvr_crypto_income(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.vvr_ton_wallet(uuid,text,text,boolean),public.vvr_crypto_income(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
