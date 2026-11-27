begin;
do $$
declare
  owner_id uuid := vvr.resolve_player('30001','Analytics owner');
  a uuid := vvr.resolve_player('30002','Player A');
  b uuid := vvr.resolve_player('30003','Player B');
  s1 uuid := gen_random_uuid();
  s2 uuid := gen_random_uuid();
  report jsonb;
begin
  insert into vvr.admin_access(player_id,role) values(owner_id,'owner');
  insert into vvr.admin_credentials(player_id,login,password_hash,unlocked_until)
   values(owner_id,'analyst',extensions.crypt('analytics-pass',extensions.gen_salt('bf',4)),clock_timestamp()+interval '1 hour');
  assert not has_table_privilege('service_role','vvr.analytics_events','SELECT');
  assert not has_function_privilege('anon','public.vvr_track(uuid,jsonb)','EXECUTE');

  set local role service_role;
  -- Valid events of every kind are stored; malformed fields drop the event, not the batch.
  report:=public.vvr_track(a,jsonb_build_array(
   jsonb_build_object('kind','enter','session',s1,'ago',0,'first',true,'version','1.0.0','stage',1),
   jsonb_build_object('kind','stage','session',s1,'ago',0,'stage',2,'level',3),
   jsonb_build_object('kind','battle','session',s1,'ago',0,'mode','campaign','win',true,'seconds',14,'stage',2),
   jsonb_build_object('kind','purchase','session',s1,'ago',0,'sku','arena-potion','currency','gold','price',120),
   jsonb_build_object('kind','error','session',s1,'ago',0,'code','type_error','message','x is undefined at 1234567'),
   jsonb_build_object('kind','session','session',s1,'ago',0,'seconds',1000),
   jsonb_build_object('kind','battle','session',s1,'ago',0,'mode','Campaign!','win',true,'seconds',14,'stage',2),
   jsonb_build_object('kind','purchase','session',s1,'ago',0,'sku','x','currency','gold','price',-5),
   jsonb_build_object('kind','enter','session','not-a-uuid','ago',0,'first',true),
   jsonb_build_object('kind','telegram_id','session',s1,'ago',0),
   jsonb_build_object('kind','stage','session',s1,'ago',9999999,'stage',3,'level',3)));
  assert report->>'stored'='6',report::text;
  begin
    perform public.vvr_track(a,'{}'::jsonb);
    raise exception 'object accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.vvr_track(b,jsonb_build_array(jsonb_build_object('kind','enter','session',s2,'ago',100,'first',true)));

  reset role;
  assert (select data->>'message' from vvr.analytics_events where kind='error')='x is undefined at #';
  assert not exists(select from vvr.analytics_events where data::text like '%30002%');
  -- Player A came back the next day and a week later; B did not.
  update vvr.analytics_events set at=at-interval '8 days' where player_id in (a,b);
  insert into vvr.analytics_events(player_id,session_id,kind,at,data) values
   (a,gen_random_uuid(),'enter',clock_timestamp()-interval '7 days','{"first":false}'),
   (a,gen_random_uuid(),'enter',clock_timestamp()-interval '1 day','{"first":false}');
  -- Rate limit: at most 600 events per player per hour.
  insert into vvr.analytics_events(player_id,session_id,kind,at,data)
   select b,gen_random_uuid(),'stage',clock_timestamp(),'{"stage":1,"level":1}' from generate_series(1,600);

  set local role service_role;
  assert public.vvr_track(b,jsonb_build_array(jsonb_build_object('kind','stage','session',s2,'ago',0,'stage',2,'level',2)))->>'stored'='0';
  report:=public.vvr_analytics_report(owner_id,14);
  assert (report->>'newPlayers')::int=2,report::text;
  assert report->'funnel'->>'m15'='1' and report->'funnel'->>'m30'='0',report::text;
  assert report->'d1'->>'eligible'='2' and report->'d1'->>'returned'='1',report::text;
  assert report->'d7'->>'returned'='1',report::text;
  assert report->'battles'->'campaign'->>'wins'='1',report::text;
  assert report->'purchases'->0->>'sku'='arena-potion',report::text;
  assert report->'errors'->0->>'code'='type_error',report::text;
  begin
    perform public.vvr_analytics_report(a,14);
    raise exception 'player read analytics';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
