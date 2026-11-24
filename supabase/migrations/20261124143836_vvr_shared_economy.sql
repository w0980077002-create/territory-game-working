-- W066 shared contract. Verify Telegram initData at the server boundary before resolving a player.
-- The UUID returned here is the existing vvr.players.id and is shared by all online modules.
alter table vvr.players add column display_name text not null default 'Северный страж'
  check (char_length(display_name) between 1 and 32);

create function vvr.resolve_player(p_telegram text, p_name text)
returns uuid language plpgsql security definer set search_path = pg_catalog
as $$
declare player uuid;
begin
  if p_telegram is null or p_telegram !~ '^[1-9][0-9]{0,15}$' or
     p_name is null or char_length(p_name) not between 1 and 32 then
    raise exception 'invalid_identity' using errcode = '22023';
  end if;
  insert into vvr.players (telegram_id, display_name) values (p_telegram, p_name)
    on conflict (telegram_id) do update set display_name = excluded.display_name
    returning id into player;
  return player;
end;
$$;
revoke all on function vvr.resolve_player(text,text) from public, anon, authenticated;
grant execute on function vvr.resolve_player(text,text) to service_role, vvr_reward_writer;
grant usage on schema vvr to service_role;

create table vvr.wallets (
  player_id uuid not null references vvr.players(id),
  resource text not null check (resource in ('gold', 'chaosite', 'tokens')),
  balance bigint not null check (balance between 0 and 1000000000),
  primary key (player_id, resource)
);
alter table vvr.wallets enable row level security;
revoke all on vvr.wallets from public, anon, authenticated, service_role;

-- The existing issue_resource function remains the only reward entry point.
-- A boss supplies a stable event UUID for each reward line. Retries for that line must reuse it.
insert into vvr.wallets(player_id,resource,balance)
  select player_id,resource,sum(amount) from vvr.resource_receipts group by player_id,resource;

create function vvr.credit_receipt()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  insert into vvr.wallets (player_id,resource,balance)
    values (new.player_id,new.resource,new.amount)
    on conflict (player_id,resource) do update set balance = vvr.wallets.balance + excluded.balance;
  return new;
end;
$$;
revoke all on function vvr.credit_receipt() from public, anon, authenticated, service_role;
create trigger credit_resource_receipt after insert on vvr.resource_receipts
  for each row execute function vvr.credit_receipt();

create table vvr.network_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references vvr.players(id),
  issued_to uuid not null references vvr.players(id),
  source_kind text not null check (source_kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  source_id uuid not null,
  catalog_id text not null check (catalog_id ~ '^[-a-z0-9:]{1,48}$'),
  unique (issued_to,source_kind,source_id)
);
create index network_items_owner on vvr.network_items(owner_id,id);
alter table vvr.network_items enable row level security;
revoke all on vvr.network_items from public, anon, authenticated, service_role;

-- Catalog ids are chosen by the trusted grantor. This function never imports a Solo item.
create function vvr.issue_item(p_player uuid,p_kind text,p_event uuid,p_catalog text)
returns uuid language plpgsql security definer set search_path = pg_catalog
as $$
declare item vvr.network_items%rowtype;
begin
  insert into vvr.network_items(owner_id,issued_to,source_kind,source_id,catalog_id)
    values(p_player,p_player,p_kind,p_event,p_catalog)
    on conflict(issued_to,source_kind,source_id) do nothing returning * into item;
  if not found then
    select * into strict item from vvr.network_items
      where issued_to=p_player and source_kind=p_kind and source_id=p_event;
    if item.catalog_id is distinct from p_catalog then
      raise exception 'reward_conflict' using errcode='23505';
    end if;
  end if;
  return item.id;
end;
$$;
revoke all on function vvr.issue_item(uuid,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function vvr.issue_item(uuid,text,uuid,text) to vvr_reward_writer;
