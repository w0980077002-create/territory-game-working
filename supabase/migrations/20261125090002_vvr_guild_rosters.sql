create table vvr.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 32 and name=btrim(name) and name !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);
create unique index guild_name_key on vvr.guilds(lower(name));

create table vvr.guild_members (
  player_id uuid primary key references vvr.players(id),
  guild_id uuid not null references vvr.guilds(id) on delete cascade,
  role text not null check (role in ('leader','member')),
  joined_at timestamptz not null default now()
);
create index guild_members_roster on vvr.guild_members(guild_id,joined_at,player_id);
create unique index guild_single_leader on vvr.guild_members(guild_id) where role='leader';

create table vvr.guild_applications (
  guild_id uuid not null references vvr.guilds(id) on delete cascade,
  player_id uuid not null references vvr.players(id),
  created_at timestamptz not null default now(),
  primary key (guild_id,player_id)
);
create index guild_applications_player on vvr.guild_applications(player_id);

alter table vvr.guilds enable row level security;
alter table vvr.guild_members enable row level security;
alter table vvr.guild_applications enable row level security;
revoke all on vvr.guilds,vvr.guild_members,vvr.guild_applications from public,anon,authenticated,service_role;

-- The Edge boundary supplies p_player from the verified community session.
-- Changes to membership always lock the affected player before the guild.
create function vvr.change_guild_roster(
  p_player uuid,p_action text,p_guild uuid default null,p_applicant uuid default null,p_name text default null
) returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare
  affected uuid := case when p_action in ('accept','reject') then p_applicant else p_player end;
  guild uuid := p_guild;
  current_guild uuid;
  membership_role text;
  successor uuid;
begin
  if p_action is null or p_action not in ('create','apply','withdraw','accept','reject','leave') then
    raise exception 'invalid_guild_action' using errcode='22023';
  end if;
  perform 1 from vvr.players where id=affected for update;
  if not found then raise exception 'unknown_guild_player' using errcode='22023'; end if;
  select guild_id into current_guild from vvr.guild_members where player_id=affected;

  if p_action='create' then
    if current_guild is not null then raise exception 'already_in_guild' using errcode='23505'; end if;
    insert into vvr.guilds(name) values (btrim(p_name)) returning id into guild;
    insert into vvr.guild_members(player_id,guild_id,role) values (p_player,guild,'leader');
    delete from vvr.guild_applications where player_id=p_player;
    return guild;
  end if;

  if p_action='leave' then guild:=current_guild; end if;
  perform 1 from vvr.guilds where id=guild for update;
  if not found then raise exception 'unknown_guild' using errcode='22023'; end if;

  case p_action
    when 'apply' then
      if current_guild is not null then raise exception 'already_in_guild' using errcode='23505'; end if;
      insert into vvr.guild_applications(guild_id,player_id) values (guild,p_player) on conflict do nothing;
    when 'withdraw' then
      delete from vvr.guild_applications where guild_id=guild and player_id=p_player;
    when 'accept','reject' then
      if not exists (select 1 from vvr.guild_members where guild_id=guild and player_id=p_player and role='leader') then
        raise exception 'guild_leader_required' using errcode='42501';
      end if;
      if p_action='accept' and current_guild=guild then return guild; end if;
      delete from vvr.guild_applications where guild_id=guild and player_id=p_applicant;
      if p_action='accept' then
        if not found then raise exception 'guild_application_required' using errcode='23505'; end if;
        insert into vvr.guild_members(guild_id,player_id,role) values (guild,p_applicant,'member');
        delete from vvr.guild_applications where player_id=p_applicant;
      end if;
    when 'leave' then
      select role into membership_role from vvr.guild_members where player_id=p_player;
      delete from vvr.guild_members where player_id=p_player;
      if membership_role='leader' then
        select player_id into successor from vvr.guild_members where guild_id=guild order by joined_at,player_id limit 1;
        if found then
          update vvr.guild_members set role='leader' where player_id=successor;
        else
          delete from vvr.guilds where id=guild;
        end if;
      end if;
  end case;
  return guild;
end;
$$;

-- The next guild UI increment can route this through the existing community dispatcher.
revoke all on function vvr.change_guild_roster(uuid,text,uuid,uuid,text) from public,anon,authenticated,service_role;
