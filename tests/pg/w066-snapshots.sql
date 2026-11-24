begin;
select vvr.resolve_player('73001','Snapshot owner') as owner_id,
       vvr.resolve_player('73002','Other profile') as other_id \gset
select set_config('test.snapshot_profiles',jsonb_build_array(:'owner_id',:'other_id')::text,true) as settings \gset
set local role service_role;
do $$
declare
  ids jsonb:=current_setting('test.snapshot_profiles')::jsonb;
  player uuid:=(ids->>0)::uuid;
  other_player uuid:=(ids->>1)::uuid;
  first_request uuid:=gen_random_uuid();
begin
  assert public.vvr_snapshot_read(player,false) is null;
  assert public.vvr_snapshot_store(player,0,first_request,'{"level":1}')=1;
  assert public.vvr_snapshot_store(player,0,first_request,'{"level":1}')=1;
  assert public.vvr_snapshot_store(player,1,gen_random_uuid(),'{"level":2,"gold":999999}')=2;
  begin
    perform public.vvr_snapshot_store(player,1,gen_random_uuid(),'{"level":3}');
    raise exception 'Accepted a stale write';
  exception when unique_violation then null;
  end;
  assert public.vvr_snapshot_read(player,false)->>'raw'='{"level":2,"gold":999999}';
  assert public.vvr_snapshot_read(player,true)->>'raw'='{"level":1}';
  assert public.vvr_snapshot_read(other_player,false) is null;
  assert (public.vvr_community(player,'auction','{}')->>'gold')::integer=0;
  assert not has_function_privilege('authenticated','public.vvr_snapshot_read(uuid,boolean)','EXECUTE');
  assert not has_table_privilege('service_role','vvr.solo_snapshots','UPDATE');
end;
$$;
rollback;
