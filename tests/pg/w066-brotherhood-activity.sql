-- These are separate server-authenticated players and rooms in the scratch database.
select vvr.resolve_player('79701','Oath inviter') as inviter \gset
select public.vvr_resolve_referred_player('79702','Oath novice',:'inviter') as invitee \gset
insert into vvr.arena_rooms(id,mode,opened_at,closes_at,ready_at) values
  ('79700000-0000-4000-8000-000000000001','team',now(),now(),now()),
  ('79700000-0000-4000-8000-000000000002','chaos',now(),now(),now()),
  ('79700000-0000-4000-8000-000000000003','team',now(),now(),now()),
  ('79700000-0000-4000-8000-000000000004','team',now(),now(),now());
insert into vvr.arena_room_seats(room_id,player_id,hero,attack_power,seat,released) values
  ('79700000-0000-4000-8000-000000000001',:'inviter','ranger',100,0,false),
  ('79700000-0000-4000-8000-000000000002',:'invitee','berserker',100,0,false),
  ('79700000-0000-4000-8000-000000000003',:'invitee','berserker',100,0,true),
  ('79700000-0000-4000-8000-000000000004',:'invitee','berserker',100,0,true);

do $$
declare
  invitee uuid:=(select id from vvr.players where telegram_id='79702');
  afk_room uuid:='79700000-0000-4000-8000-000000000003';
  idle_room uuid:='79700000-0000-4000-8000-000000000004';
begin
  assert public.vvr_arena_checkpoint(afk_room,0,jsonb_build_object('id',afk_room,
    'result',jsonb_build_object('reason','afk'),'players',jsonb_build_array(jsonb_build_object('id',invitee,'fought',true))),true)=1;
  assert public.vvr_arena_checkpoint(idle_room,0,jsonb_build_object('id',idle_room,
    'result',jsonb_build_object('reason','hp'),'players',jsonb_build_array(jsonb_build_object('id',invitee,'fought',false))),true)=1;
  assert not exists(select from vvr.brotherhood_activity_days(invitee,'2000-01-01'));
  assert public.vvr_referrals(invitee,null)#>>'{brotherhood,incoming,days}'='0';
  assert not has_function_privilege('authenticated','public.vvr_arena_checkpoint(uuid,bigint,jsonb,boolean)','EXECUTE');
  assert not has_function_privilege('authenticated','vvr.brotherhood_arena_finished()','EXECUTE');
end;
$$;
