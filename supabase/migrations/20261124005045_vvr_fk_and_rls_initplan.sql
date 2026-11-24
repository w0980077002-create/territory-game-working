set local lock_timeout = '5s';

create index solo_snapshots_player_id_restored_from_idx
  on vvr.solo_snapshots (player_id, restored_from);

alter policy player_owner on vvr.players
  using (telegram_id = (select current_setting('vvr.telegram_id', true)))
  with check (telegram_id = (select current_setting('vvr.telegram_id', true)));

alter policy snapshot_owner on vvr.solo_snapshots
  using (player_id = (
    select id from vvr.players
    where telegram_id = (select current_setting('vvr.telegram_id', true))
  ))
  with check (player_id = (
    select id from vvr.players
    where telegram_id = (select current_setting('vvr.telegram_id', true))
  ));
