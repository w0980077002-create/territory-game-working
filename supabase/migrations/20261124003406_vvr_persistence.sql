-- Apply only to the independent VVR database. Runtime credentials are provisioned separately.
create schema vvr;
revoke all on schema vvr from public, anon, authenticated, service_role;

create role vvr_save_api nologin nosuperuser nobypassrls;
create role vvr_reward_writer nologin nosuperuser nobypassrls;
grant usage on schema vvr to vvr_save_api, vvr_reward_writer;

create table vvr.players (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null unique check (telegram_id ~ '^[1-9][0-9]{0,15}$'),
  created_at timestamptz not null default now()
);
alter table vvr.players enable row level security;
alter table vvr.players force row level security;
create policy player_owner on vvr.players to vvr_save_api
  using (telegram_id = current_setting('vvr.telegram_id', true))
  with check (telegram_id = current_setting('vvr.telegram_id', true));
grant select (id, telegram_id), insert (telegram_id) on vvr.players to vvr_save_api;

-- Old revisions are immutable backups. This table never grants or spends online resources.
create table vvr.solo_snapshots (
  player_id uuid not null references vvr.players (id),
  revision integer not null check (revision > 0),
  request_id uuid not null,
  raw text not null check (octet_length(raw) between 2 and 2097152),
  checksum text not null check (checksum = encode(sha256(convert_to(raw, 'UTF8')), 'hex')),
  restored_from integer,
  created_at timestamptz not null default now(),
  primary key (player_id, revision),
  unique (player_id, request_id),
  foreign key (player_id, restored_from) references vvr.solo_snapshots (player_id, revision),
  check (restored_from is null or restored_from < revision)
);
alter table vvr.solo_snapshots enable row level security;
alter table vvr.solo_snapshots force row level security;
create policy snapshot_owner on vvr.solo_snapshots to vvr_save_api
  using (player_id = (select id from vvr.players where telegram_id = current_setting('vvr.telegram_id', true)))
  with check (player_id = (select id from vvr.players where telegram_id = current_setting('vvr.telegram_id', true)));
grant select, insert on vvr.solo_snapshots to vvr_save_api;

-- One authoritative receipt per player and source event. No currency mirror or Arena settlement.
create table vvr.resource_receipts (
  player_id uuid not null references vvr.players (id),
  source_kind text not null check (source_kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  source_id uuid not null,
  resource text not null check (resource in ('gold', 'chaosite', 'tokens')),
  amount integer not null check (amount between 1 and 1000000),
  issued_at timestamptz not null default now(),
  primary key (player_id, source_kind, source_id)
);
alter table vvr.resource_receipts enable row level security;
alter table vvr.resource_receipts force row level security;
create policy trusted_issuer on vvr.resource_receipts to vvr_reward_writer using (true) with check (true);
revoke all on all tables in schema vvr from public, anon, authenticated, service_role;
grant select, insert (player_id, source_kind, source_id, resource, amount)
  on vvr.resource_receipts to vvr_reward_writer;

-- Trusted callers supply a stable business event ID, not a request ID chosen by the browser.
create function vvr.issue_resource(player uuid, kind text, event uuid, currency text, quantity integer)
returns boolean language plpgsql security invoker set search_path = pg_catalog
as $$
begin
  insert into vvr.resource_receipts (player_id, source_kind, source_id, resource, amount)
    values (player, kind, event, currency, quantity)
    on conflict do nothing;
  if found then return true; end if;
  if not exists (
    select 1 from vvr.resource_receipts
    where player_id = player and source_kind = kind and source_id = event
      and resource = currency and amount = quantity
  ) then
    raise exception 'Reward receipt does not match' using errcode = '23505';
  end if;
  return false;
end;
$$;
revoke all on function vvr.issue_resource(uuid, text, uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function vvr.issue_resource(uuid, text, uuid, text, integer) to vvr_reward_writer;
