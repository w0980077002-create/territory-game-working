-- VIKING VS ROME · cooperative world boss on the independent VVR database (Supabase W066).
-- Adapted from TERRITORY territory_halloween_boss_2026 (one locked HP row, server damage, cooldown,
-- daily limit, ranked participants) and its staged top-10 mail grants (one row per player and reward).
--
-- Contract (shared with PR #94, created here only if it does not exist yet, with identical definitions):
--   vvr.players            — one row per Telegram user, identified by the verified telegram_id.
--   vvr.resource_receipts  — the single trusted journal of online grants, one receipt per source.
--   vvr.issue_resource()   — idempotent writer for that journal.
-- No wallet, profile or alternative ledger is created. Rewards are game-only gold, Chaosite and Arena tokens.
--
-- Callers: the vvr-world-boss Edge Function verifies Telegram initData and calls the public RPCs below
-- with the service role. Browsers never get table access or a callable function.
-- Admins: insert a verified Telegram user id into vvr.world_boss_admins (manual, by the owner).

create schema if not exists vvr;
revoke all on schema vvr from public;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'vvr_save_api') then
    create role vvr_save_api nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'vvr_reward_writer') then
    create role vvr_reward_writer nologin nosuperuser nobypassrls;
  end if;
end $$;
grant usage on schema vvr to vvr_save_api, vvr_reward_writer;

create table if not exists vvr.players (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null unique check (telegram_id ~ '^[1-9][0-9]{0,15}$'),
  created_at timestamptz not null default now()
);
alter table vvr.players enable row level security;
alter table vvr.players force row level security;

create table if not exists vvr.resource_receipts (
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

create or replace function vvr.issue_resource(player uuid, kind text, event uuid, currency text, quantity integer)
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
revoke all on function vvr.issue_resource(uuid, text, uuid, text, integer) from public;

-- ───────────────────────── World boss tables ─────────────────────────
create table if not exists vvr.world_boss_admins (
  telegram_id text primary key check (telegram_id ~ '^[1-9][0-9]{0,15}$'),
  added_at timestamptz not null default now()
);

create table if not exists vvr.world_boss_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  boss text not null check (boss ~ '^[a-z0-9_]{1,40}$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_hp bigint not null check (max_hp between 1000 and 100000000000),
  hp bigint not null check (hp >= 0 and hp <= max_hp),
  status text not null default 'open' check (status in ('open', 'defeated', 'expired')),
  config jsonb not null,
  last_hit_player uuid references vvr.players (id),
  last_hit_name text,
  last_hit_damage bigint,
  finished_at timestamptz,
  settled_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((status = 'open') = (finished_at is null)),
  check (status <> 'defeated' or (hp = 0 and last_hit_player is not null))
);
-- At most one open event: the boss is a single shared world encounter.
create unique index if not exists world_boss_one_open on vvr.world_boss_events ((true)) where status = 'open';
create index if not exists world_boss_finished_idx on vvr.world_boss_events (finished_at desc) where status <> 'open';

create table if not exists vvr.world_boss_participants (
  event_id uuid not null references vvr.world_boss_events (id),
  player_id uuid not null references vvr.players (id),
  display_name text not null,
  total_damage bigint not null default 0 check (total_damage >= 0),
  total_hits integer not null default 0 check (total_hits >= 0),
  hit_day date,
  hits_today integer not null default 0 check (hits_today >= 0),
  last_hit_at timestamptz,
  primary key (event_id, player_id)
);
create index if not exists world_boss_rank_idx
  on vvr.world_boss_participants (event_id, total_damage desc, last_hit_at asc, player_id);

-- Every accepted hit, keyed by the client's request id: a retried request returns the same result.
create table if not exists vvr.world_boss_hits (
  event_id uuid not null references vvr.world_boss_events (id),
  player_id uuid not null references vvr.players (id),
  request_id uuid not null,
  damage bigint not null check (damage > 0),
  critical boolean not null,
  killing boolean not null,
  hit_at timestamptz not null,
  primary key (event_id, player_id, request_id)
);
create unique index if not exists world_boss_one_kill on vvr.world_boss_hits (event_id) where killing;

-- Reward letters: one per player, event and kind. Claiming writes trusted receipts exactly once.
create table if not exists vvr.world_boss_rewards (
  event_id uuid not null references vvr.world_boss_events (id),
  player_id uuid not null references vvr.players (id),
  kind text not null check (kind in ('participation', 'rank', 'last_hit')),
  place integer check (place is null or place >= 1),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  primary key (event_id, player_id, kind)
);
create index if not exists world_boss_rewards_player_idx on vvr.world_boss_rewards (player_id, claimed_at);

alter table vvr.world_boss_admins enable row level security;
alter table vvr.world_boss_events enable row level security;
alter table vvr.world_boss_participants enable row level security;
alter table vvr.world_boss_hits enable row level security;
alter table vvr.world_boss_rewards enable row level security;
alter table vvr.world_boss_admins force row level security;
alter table vvr.world_boss_events force row level security;
alter table vvr.world_boss_participants force row level security;
alter table vvr.world_boss_hits force row level security;
alter table vvr.world_boss_rewards force row level security;
revoke all on all tables in schema vvr from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on all tables in schema vvr from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on all tables in schema vvr from authenticated'; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'revoke all on all tables in schema vvr from service_role'; end if;
end $$;

-- ───────────────────────── Helpers ─────────────────────────
create or replace function vvr.world_boss_default_config()
returns jsonb language sql immutable set search_path = ''
as $$ select '{
  "cooldownSeconds": 8, "dailyHits": 40,
  "damageMin": 900, "damageMax": 1400, "critChance": 0.12, "critMultiplier": 2,
  "minHitsForReward": 1, "expiredMultiplier": 0.5,
  "rewards": {
    "participation": {"gold": 5000, "chaosite": 20},
    "lastHit": {"gold": 10000, "tokens": 50},
    "ranks": [
      {"upTo": 1,  "reward": {"gold": 30000, "chaosite": 120, "tokens": 150}},
      {"upTo": 3,  "reward": {"gold": 20000, "chaosite": 80,  "tokens": 100}},
      {"upTo": 10, "reward": {"gold": 12000, "chaosite": 50,  "tokens": 60}},
      {"upTo": 50, "reward": {"gold": 6000,  "chaosite": 25,  "tokens": 30}}
    ]
  }
}'::jsonb $$;

create or replace function vvr.world_boss_valid_payload(p jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_each(p) e where e.key not in ('gold', 'chaosite', 'tokens')
      or jsonb_typeof(e.value) <> 'number' or (e.value)::numeric <> floor((e.value)::numeric)
      or (e.value)::numeric < 0 or (e.value)::numeric > 1000000)
$$;

/** Merges admin overrides over the defaults and rejects anything outside safe bounds. */
create or replace function vvr.world_boss_config(p_override jsonb)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  c jsonb := vvr.world_boss_default_config() || coalesce(p_override, '{}'::jsonb);
  r jsonb;
  prev integer := 0;
begin
  if coalesce(p_override, '{}'::jsonb) ? 'rewards' then
    c := jsonb_set(c, '{rewards}', vvr.world_boss_default_config() -> 'rewards' || (p_override -> 'rewards'));
  end if;
  if (c ->> 'cooldownSeconds')::numeric not between 1 and 3600
    or (c ->> 'dailyHits')::numeric not between 1 and 10000
    or (c ->> 'damageMin')::numeric not between 1 and 10000000
    or (c ->> 'damageMax')::numeric < (c ->> 'damageMin')::numeric
    or (c ->> 'damageMax')::numeric > 10000000
    or (c ->> 'critChance')::numeric not between 0 and 1
    or (c ->> 'critMultiplier')::numeric not between 1 and 10
    or (c ->> 'minHitsForReward')::numeric not between 1 and 10000
    or (c ->> 'expiredMultiplier')::numeric not between 0 and 1
    or not vvr.world_boss_valid_payload(c #> '{rewards,participation}')
    or not vvr.world_boss_valid_payload(c #> '{rewards,lastHit}')
    or jsonb_typeof(c #> '{rewards,ranks}') <> 'array'
  then
    raise exception 'world_boss_bad_config';
  end if;
  for r in select value from jsonb_array_elements(c #> '{rewards,ranks}') loop
    if (r ->> 'upTo')::numeric is null or (r ->> 'upTo')::integer <= prev or (r ->> 'upTo')::integer > 10000
      or not vvr.world_boss_valid_payload(r -> 'reward') then
      raise exception 'world_boss_bad_config';
    end if;
    prev := (r ->> 'upTo')::integer;
  end loop;
  return c;
end;
$$;

create or replace function vvr.world_boss_scale(p jsonb, k numeric)
returns jsonb language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.key, floor((e.value)::numeric * k)::bigint)
    filter (where floor((e.value)::numeric * k) >= 1), '{}'::jsonb)
  from jsonb_each(p) e
$$;

create or replace function vvr.world_boss_player(p_telegram_id text)
returns uuid language plpgsql set search_path = ''
as $$
declare v_id uuid;
begin
  if p_telegram_id is null or p_telegram_id !~ '^[1-9][0-9]{0,15}$' then
    raise exception 'world_boss_auth_required';
  end if;
  insert into vvr.players (telegram_id) values (p_telegram_id) on conflict (telegram_id) do nothing;
  select id into v_id from vvr.players where telegram_id = p_telegram_id;
  return v_id;
end;
$$;

create or replace function vvr.world_boss_name(p_name text)
returns text language sql immutable set search_path = ''
as $$ select coalesce(nullif(left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 32), ''), 'Северный страж') $$;

/** Creates the reward letters of a finished event exactly once. Caller holds the event row lock. */
create or replace function vvr.world_boss_settle(p_event uuid)
returns void language plpgsql set search_path = ''
as $$
declare
  e vvr.world_boss_events%rowtype;
  k numeric;
  min_hits integer;
begin
  select * into e from vvr.world_boss_events where id = p_event;
  if e.status = 'open' or e.settled_at is not null then return; end if;
  k := case when e.status = 'defeated' then 1 else (e.config ->> 'expiredMultiplier')::numeric end;
  min_hits := (e.config ->> 'minHitsForReward')::integer;

  insert into vvr.world_boss_rewards (event_id, player_id, kind, place, payload)
  select e.id, p.player_id, 'participation', null, vvr.world_boss_scale(e.config #> '{rewards,participation}', k)
  from vvr.world_boss_participants p
  where p.event_id = e.id and p.total_hits >= min_hits and p.total_damage > 0
    and vvr.world_boss_scale(e.config #> '{rewards,participation}', k) <> '{}'::jsonb
  on conflict do nothing;

  insert into vvr.world_boss_rewards (event_id, player_id, kind, place, payload)
  select e.id, ranked.player_id, 'rank', ranked.place, vvr.world_boss_scale(tier.reward, k)
  from (
    select player_id, row_number() over (order by total_damage desc, last_hit_at asc nulls last, player_id) as place
    from vvr.world_boss_participants
    where event_id = e.id and total_hits >= min_hits and total_damage > 0
  ) ranked
  cross join lateral (
    select r -> 'reward' as reward from jsonb_array_elements(e.config #> '{rewards,ranks}') r
    where (r ->> 'upTo')::integer >= ranked.place order by (r ->> 'upTo')::integer limit 1
  ) tier
  where vvr.world_boss_scale(tier.reward, k) <> '{}'::jsonb
  on conflict do nothing;

  if e.status = 'defeated' and vvr.world_boss_scale(e.config #> '{rewards,lastHit}', 1) <> '{}'::jsonb then
    insert into vvr.world_boss_rewards (event_id, player_id, kind, place, payload)
    values (e.id, e.last_hit_player, 'last_hit', null, vvr.world_boss_scale(e.config #> '{rewards,lastHit}', 1))
    on conflict do nothing;
  end if;

  update vvr.world_boss_events set settled_at = clock_timestamp(), updated_at = clock_timestamp() where id = e.id;
end;
$$;

/** Closes an open event whose time ran out. Caller holds the event row lock. */
create or replace function vvr.world_boss_expire_if_due(p_event uuid)
returns void language plpgsql set search_path = ''
as $$
begin
  update vvr.world_boss_events
     set status = 'expired', finished_at = ends_at, updated_at = clock_timestamp()
   where id = p_event and status = 'open' and clock_timestamp() >= ends_at;
  if found then perform vvr.world_boss_settle(p_event); end if;
end;
$$;

-- ───────────────────────── Player RPCs (service role only) ─────────────────────────
create or replace function public.vvr_world_boss_state(p_telegram_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_player uuid := vvr.world_boss_player(p_telegram_id);
  v_now timestamptz := clock_timestamp();
  e vvr.world_boss_events%rowtype;
  me vvr.world_boss_participants%rowtype;
  v_rank integer;
  v_top jsonb := '[]'::jsonb;
  v_count bigint := 0;
  v_event jsonb := null;
  v_history jsonb;
  v_mail jsonb;
begin
  -- Lazily close a finished open event so everyone sees one consistent result.
  -- Only an event that is due to close takes the row lock; ordinary polling never blocks hits.
  if exists (select 1 from vvr.world_boss_events where status = 'open' and ends_at <= v_now) then
    select * into e from vvr.world_boss_events where status = 'open' for update;
    if found then perform vvr.world_boss_expire_if_due(e.id); end if;
  end if;

  select * into e from vvr.world_boss_events
   order by (status = 'open') desc, coalesce(finished_at, starts_at) desc limit 1;
  if found then
    select * into me from vvr.world_boss_participants where event_id = e.id and player_id = v_player;
    select ranked.place into v_rank from (
      select player_id, row_number() over (order by total_damage desc, last_hit_at asc nulls last, player_id) as place
      from vvr.world_boss_participants where event_id = e.id and total_damage > 0
    ) ranked where ranked.player_id = v_player;
    select count(*) into v_count from vvr.world_boss_participants where event_id = e.id and total_damage > 0;
    select coalesce(jsonb_agg(jsonb_build_object('place', t.place, 'name', t.display_name, 'damage', t.total_damage,
             'hits', t.total_hits, 'me', t.player_id = v_player) order by t.place), '[]'::jsonb)
      into v_top
    from (
      select player_id, display_name, total_damage, total_hits,
             row_number() over (order by total_damage desc, last_hit_at asc nulls last, player_id) as place
      from vvr.world_boss_participants where event_id = e.id and total_damage > 0
      order by total_damage desc, last_hit_at asc nulls last, player_id limit 10
    ) t;
    v_event := jsonb_build_object(
      'id', e.id, 'title', e.title, 'boss', e.boss, 'startsAt', e.starts_at, 'endsAt', e.ends_at,
      'maxHp', e.max_hp, 'hp', e.hp, 'status', e.status,
      'active', e.status = 'open' and v_now >= e.starts_at and v_now < e.ends_at and e.hp > 0,
      'cooldownSeconds', (e.config ->> 'cooldownSeconds')::integer, 'dailyHits', (e.config ->> 'dailyHits')::integer,
      'damageMin', (e.config ->> 'damageMin')::integer, 'damageMax', (e.config ->> 'damageMax')::integer,
      'rewards', e.config -> 'rewards', 'expiredMultiplier', (e.config ->> 'expiredMultiplier')::numeric,
      'finishedAt', e.finished_at, 'participants', v_count,
      'lastHit', case when e.last_hit_player is null then null else
        jsonb_build_object('name', e.last_hit_name, 'damage', e.last_hit_damage, 'me', e.last_hit_player = v_player) end,
      'me', jsonb_build_object(
        'damage', coalesce(me.total_damage, 0), 'hits', coalesce(me.total_hits, 0), 'rank', v_rank,
        'hitsToday', case when me.hit_day = (v_now at time zone 'UTC')::date then me.hits_today else 0 end,
        'nextHitAt', case when me.last_hit_at is null then null
          else me.last_hit_at + make_interval(secs => (e.config ->> 'cooldownSeconds')::integer) end),
      'top', v_top);
  end if;

  select coalesce(jsonb_agg(h order by h ->> 'finishedAt' desc), '[]'::jsonb) into v_history from (
    select jsonb_build_object('id', x.id, 'title', x.title, 'boss', x.boss, 'status', x.status, 'maxHp', x.max_hp,
      'hp', x.hp, 'finishedAt', x.finished_at, 'lastHitName', x.last_hit_name,
      'participants', (select count(*) from vvr.world_boss_participants p where p.event_id = x.id and p.total_damage > 0),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('name', t.display_name, 'damage', t.total_damage) order by t.total_damage desc, t.last_hit_at, t.player_id), '[]'::jsonb)
              from (select * from vvr.world_boss_participants p where p.event_id = x.id and p.total_damage > 0
                    order by total_damage desc, last_hit_at asc nulls last, player_id limit 3) t),
      'myDamage', coalesce((select total_damage from vvr.world_boss_participants p where p.event_id = x.id and p.player_id = v_player), 0)) as h
    from vvr.world_boss_events x where x.status <> 'open' order by x.finished_at desc limit 8
  ) hist;

  select coalesce(jsonb_agg(jsonb_build_object('eventId', r.event_id, 'kind', r.kind, 'place', r.place, 'payload', r.payload,
           'title', ev.title, 'boss', ev.boss, 'status', ev.status, 'createdAt', r.created_at, 'claimed', r.claimed_at is not null)
           order by r.created_at desc, r.kind), '[]'::jsonb)
    into v_mail
  from vvr.world_boss_rewards r join vvr.world_boss_events ev on ev.id = r.event_id
  where r.player_id = v_player and (r.claimed_at is null or r.claimed_at > v_now - interval '30 days');

  return jsonb_build_object('serverNow', v_now, 'event', v_event, 'history', v_history, 'mail', v_mail,
    'isAdmin', exists (select 1 from vvr.world_boss_admins a where a.telegram_id = p_telegram_id));
end;
$$;

create or replace function public.vvr_world_boss_attack(p_telegram_id text, p_name text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_player uuid := vvr.world_boss_player(p_telegram_id);
  v_now timestamptz;
  v_day date;
  e vvr.world_boss_events%rowtype;
  prev vvr.world_boss_participants%rowtype;
  old vvr.world_boss_hits%rowtype;
  v_hits integer;
  v_damage bigint;
  v_crit boolean;
  v_kill boolean;
  v_name text := vvr.world_boss_name(p_name);
begin
  if p_request_id is null then raise exception 'world_boss_bad_request'; end if;
  -- Serialize every hit on the one shared HP pool (also two parallel taps of one account).
  select * into e from vvr.world_boss_events where status = 'open' for update;
  if not found then
    -- A retry of a request that already finished the boss still gets its stored result.
    select h.* into old from vvr.world_boss_hits h where h.player_id = v_player and h.request_id = p_request_id
      order by h.hit_at desc limit 1;
    if found then
      return public.vvr_world_boss_state(p_telegram_id) || jsonb_build_object('hit',
        jsonb_build_object('damage', old.damage, 'critical', old.critical, 'killing', old.killing, 'repeated', true));
    end if;
    raise exception 'world_boss_no_event';
  end if;
  v_now := clock_timestamp();
  v_day := (v_now at time zone 'UTC')::date;

  select * into old from vvr.world_boss_hits where event_id = e.id and player_id = v_player and request_id = p_request_id;
  if found then
    return public.vvr_world_boss_state(p_telegram_id) || jsonb_build_object('hit',
      jsonb_build_object('damage', old.damage, 'critical', old.critical, 'killing', old.killing, 'repeated', true));
  end if;

  if v_now >= e.ends_at then
    perform vvr.world_boss_expire_if_due(e.id);
    return public.vvr_world_boss_state(p_telegram_id) || jsonb_build_object('error', 'world_boss_event_ended');
  end if;
  if v_now < e.starts_at then raise exception 'world_boss_not_started'; end if;

  select * into prev from vvr.world_boss_participants where event_id = e.id and player_id = v_player;
  v_hits := case when prev.hit_day = v_day then coalesce(prev.hits_today, 0) else 0 end;
  if v_hits >= (e.config ->> 'dailyHits')::integer then raise exception 'world_boss_daily_limit'; end if;
  if prev.last_hit_at is not null
     and v_now < prev.last_hit_at + make_interval(secs => (e.config ->> 'cooldownSeconds')::integer) then
    raise exception 'world_boss_cooldown';
  end if;

  -- Damage comes only from the server's configured range; the client never reports damage or stats.
  v_damage := (e.config ->> 'damageMin')::bigint
    + floor(random() * ((e.config ->> 'damageMax')::bigint - (e.config ->> 'damageMin')::bigint + 1))::bigint;
  v_crit := random() < (e.config ->> 'critChance')::numeric;
  if v_crit then v_damage := floor(v_damage * (e.config ->> 'critMultiplier')::numeric)::bigint; end if;
  v_damage := least(e.hp, v_damage);
  v_kill := v_damage >= e.hp;

  insert into vvr.world_boss_participants (event_id, player_id, display_name, total_damage, total_hits, hit_day, hits_today, last_hit_at)
  values (e.id, v_player, v_name, v_damage, 1, v_day, 1, v_now)
  on conflict (event_id, player_id) do update
    set total_damage = vvr.world_boss_participants.total_damage + excluded.total_damage,
        total_hits = vvr.world_boss_participants.total_hits + 1,
        display_name = excluded.display_name,
        hit_day = v_day, hits_today = v_hits + 1, last_hit_at = v_now;
  insert into vvr.world_boss_hits (event_id, player_id, request_id, damage, critical, killing, hit_at)
  values (e.id, v_player, p_request_id, v_damage, v_crit, v_kill, v_now);

  if v_kill then
    update vvr.world_boss_events
       set hp = 0, status = 'defeated', finished_at = v_now, last_hit_player = v_player,
           last_hit_name = v_name, last_hit_damage = v_damage, updated_at = v_now
     where id = e.id;
    perform vvr.world_boss_settle(e.id);
  else
    update vvr.world_boss_events set hp = hp - v_damage, updated_at = v_now where id = e.id;
  end if;

  return public.vvr_world_boss_state(p_telegram_id) || jsonb_build_object('hit',
    jsonb_build_object('damage', v_damage, 'critical', v_crit, 'killing', v_kill, 'repeated', false));
end;
$$;

/** Claims one reward letter: writes the trusted receipts once and always returns the letter's payload. */
create or replace function public.vvr_world_boss_claim(p_telegram_id text, p_event uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_player uuid := vvr.world_boss_player(p_telegram_id);
  r vvr.world_boss_rewards%rowtype;
  item record;
  v_first boolean := false;
begin
  select * into r from vvr.world_boss_rewards
   where event_id = p_event and player_id = v_player and kind = p_kind for update;
  if not found then raise exception 'world_boss_no_reward'; end if;
  if r.claimed_at is null then
    for item in select key, (value)::integer as amount from jsonb_each(r.payload) where (value)::integer > 0 loop
      perform vvr.issue_resource(v_player, 'world_boss_' || r.kind,
        md5(r.event_id::text || ':' || r.kind || ':' || item.key)::uuid, item.key, item.amount);
    end loop;
    update vvr.world_boss_rewards set claimed_at = clock_timestamp()
     where event_id = r.event_id and player_id = v_player and kind = r.kind;
    v_first := true;
  end if;
  return jsonb_build_object('eventId', r.event_id, 'kind', r.kind, 'payload', r.payload, 'firstClaim', v_first);
end;
$$;

-- ───────────────────────── Admin RPCs (service role + listed admin) ─────────────────────────
create or replace function vvr.world_boss_require_admin(p_telegram_id text)
returns void language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from vvr.world_boss_admins where telegram_id = p_telegram_id) then
    raise exception 'world_boss_admin_only';
  end if;
end;
$$;

create or replace function public.vvr_world_boss_admin_start(
  p_telegram_id text, p_title text, p_boss text, p_starts_at timestamptz, p_minutes integer, p_max_hp bigint, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_start timestamptz := coalesce(p_starts_at, clock_timestamp());
begin
  perform vvr.world_boss_require_admin(p_telegram_id);
  if p_minutes is null or p_minutes not between 5 and 20160 then raise exception 'world_boss_bad_duration'; end if;
  perform 1 from vvr.world_boss_events where status = 'open' for update;
  perform vvr.world_boss_expire_if_due(id) from vvr.world_boss_events where status = 'open';
  if exists (select 1 from vvr.world_boss_events where status = 'open') then raise exception 'world_boss_already_open'; end if;
  insert into vvr.world_boss_events (title, boss, starts_at, ends_at, max_hp, hp, config, created_by)
  values (left(btrim(coalesce(p_title, '')), 60), p_boss, v_start, v_start + make_interval(mins => p_minutes),
          p_max_hp, p_max_hp, vvr.world_boss_config(p_config), p_telegram_id)
  returning id into v_id;
  return public.vvr_world_boss_state(p_telegram_id);
end;
$$;

/** Ends the open event now: it settles like an expired event (participation and ranks, scaled). */
create or replace function public.vvr_world_boss_admin_end(p_telegram_id text, p_event uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform vvr.world_boss_require_admin(p_telegram_id);
  perform 1 from vvr.world_boss_events where id = p_event for update;
  update vvr.world_boss_events set status = 'expired', finished_at = clock_timestamp(), updated_at = clock_timestamp()
   where id = p_event and status = 'open';
  if not found then raise exception 'world_boss_not_open'; end if;
  perform vvr.world_boss_settle(p_event);
  return public.vvr_world_boss_state(p_telegram_id);
end;
$$;

create or replace function public.vvr_world_boss_admin_report(p_telegram_id text, p_event uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform vvr.world_boss_require_admin(p_telegram_id);
  select jsonb_build_object(
    'event', to_jsonb(e) - 'config', 'config', e.config,
    'participants', (select count(*) from vvr.world_boss_participants p where p.event_id = e.id),
    'hits', (select count(*) from vvr.world_boss_hits h where h.event_id = e.id),
    'damage', (select coalesce(sum(damage), 0) from vvr.world_boss_hits h where h.event_id = e.id),
    'rewards', (select count(*) from vvr.world_boss_rewards r where r.event_id = e.id),
    'claimed', (select count(*) from vvr.world_boss_rewards r where r.event_id = e.id and r.claimed_at is not null),
    'consistent', e.max_hp - e.hp = (select coalesce(sum(damage), 0) from vvr.world_boss_hits h where h.event_id = e.id))
  into v from vvr.world_boss_events e where e.id = p_event;
  if v is null then raise exception 'world_boss_no_event'; end if;
  return v;
end;
$$;

revoke all on all functions in schema vvr from public;

do $$
declare f text;
begin
  foreach f in array array[
    'public.vvr_world_boss_state(text)',
    'public.vvr_world_boss_attack(text, text, uuid)',
    'public.vvr_world_boss_claim(text, uuid, text)',
    'public.vvr_world_boss_admin_start(text, text, text, timestamptz, integer, bigint, jsonb)',
    'public.vvr_world_boss_admin_end(text, uuid)',
    'public.vvr_world_boss_admin_report(text, uuid)'] loop
    execute 'revoke all on function ' || f || ' from public';
    if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function ' || f || ' from anon'; end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on function ' || f || ' from authenticated'; end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant execute on function ' || f || ' to service_role'; end if;
  end loop;
end $$;
