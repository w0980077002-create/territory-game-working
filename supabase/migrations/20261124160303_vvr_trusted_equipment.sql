create table vvr.hero_equipment (
  player_id uuid primary key references vvr.players(id),
  item_id uuid not null unique references vvr.network_items(id)
);
alter table vvr.hero_equipment enable row level security;
revoke all on vvr.hero_equipment from public,anon,authenticated,service_role;

create function vvr.item_attack_bonus(p_catalog text)
returns integer language sql immutable set search_path=pg_catalog
as $$ select case when p_catalog='world-boss-trophy' then 10 else 0 end; $$;

create function vvr.world_boss_award_trophy()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  perform vvr.issue_item(new.player_id,'world_boss_trophy',new.event_id,'world-boss-trophy');
  return new;
end;
$$;
create trigger world_boss_award_trophy
  after update of claimed_at on vvr.world_boss_rewards for each row
  when (old.claimed_at is null and new.claimed_at is not null and new.kind='last_hit')
  execute function vvr.world_boss_award_trophy();

create function vvr.reject_equipped_listing()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if exists(select from vvr.hero_equipment where item_id=new.item_id) then
    raise exception 'equipped_item_unavailable' using errcode='23505';
  end if;
  return new;
end;
$$;
-- The existing listing RPC holds the same network item row lock as equip.
create trigger reject_equipped_listing before insert on vvr.auction_listings
  for each row execute function vvr.reject_equipped_listing();

create function vvr.hero_attack(p_player uuid)
returns integer language sql stable set search_path=pg_catalog
as $$
  select coalesce((select attack_power from vvr.hero_combat_stats where player_id=p_player),100)
    + coalesce((select vvr.item_attack_bonus(i.catalog_id) from vvr.hero_equipment e
      join vvr.network_items i on i.id=e.item_id and i.owner_id=e.player_id where e.player_id=p_player),0);
$$;

create or replace function vvr.world_boss_attack_multiplier(p_player uuid)
returns numeric language sql stable security invoker set search_path=pg_catalog
as $$ select least(2.0,greatest(0.5,vvr.hero_attack(p_player)/100.0)); $$;

create function vvr.equipment(p_player uuid,p_action text,p_item uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  catalog text;
begin
  if not exists(select from vvr.players where id=p_player) then
    raise exception 'verified_player_required' using errcode='42501';
  end if;
  case p_action
    when 'equipment' then null;
    when 'equip' then
      select catalog_id into catalog from vvr.network_items where id=p_item and owner_id=p_player for update;
      if not found or vvr.item_attack_bonus(catalog)=0
        or exists(select from vvr.auction_listings where item_id=p_item and status='open') then
        raise exception 'item_unavailable' using errcode='23505';
      end if;
      insert into vvr.hero_equipment(player_id,item_id) values(p_player,p_item)
        on conflict(player_id) do update set item_id=excluded.item_id;
    when 'unequip' then
      delete from vvr.hero_equipment where player_id=p_player and item_id=p_item;
    else raise exception 'invalid_equipment_action' using errcode='22023';
  end case;
  return jsonb_build_object('attack',vvr.hero_attack(p_player),'equipped',
    (select item_id from vvr.hero_equipment where player_id=p_player));
end;
$$;

create function public.vvr_equipment(p_player uuid,p_action text,p_item uuid)
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select vvr.equipment(p_player,p_action,p_item); $$;

revoke all on function vvr.item_attack_bonus(text),vvr.world_boss_award_trophy(),vvr.reject_equipped_listing(),
  vvr.hero_attack(uuid),vvr.equipment(uuid,text,uuid),public.vvr_equipment(uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function vvr.equipment(uuid,text,uuid),public.vvr_equipment(uuid,text,uuid) to service_role;
