/**
 * World boss SQL on a real PostgreSQL. Needs VVR_PG_HOST/VVR_PG_PORT (a scratch cluster with superuser
 * `postgres`); scripts/qa/world-boss-pg.sh starts one. Without it the suite is skipped.
 */
import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
const run=promisify(execFile);
const host=process.env.VVR_PG_HOST,port=process.env.VVR_PG_PORT??'5432',user=process.env.VVR_PG_USER??'postgres';
const skip=!host&&'set VVR_PG_HOST to run the world boss SQL tests';
const migration=new URL('../../supabase/migrations/20261124155539_vvr_world_boss.sql',import.meta.url);
async function psql(db:string,sql:string){
 const {stdout}=await run('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',host!,'-p',port,'-U',user,'-d',db,'-c',sql],{maxBuffer:1<<24});
 return stdout.trim();
}
const json=async(db:string,sql:string)=>JSON.parse(await psql(db,sql));
async function fails(db:string,sql:string,code:RegExp){await assert.rejects(psql(db,sql),(e:Error&{stderr?:string})=>code.test(e.stderr??e.message))}
let seq=0;
async function freshDb(){const name='wb_'+process.pid+'_'+(++seq);await psql('postgres',`drop database if exists ${name}`);await psql('postgres',`create database ${name} template wb_template`);return name}
const lit=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
const ADMIN='111111';
async function start(db:string,config:object={},hp=100000,minutes=60){
 return json(db,`select public.vvr_world_boss_admin_start('${ADMIN}','Йотун','minotaur_echo',null,${minutes},${hp},${lit(config)})`);
}
const attack=(db:string,tg:string,req=randomUUID(),name='Воин '+tg)=>json(db,`select public.vvr_world_boss_attack('${tg}','${name}','${req}')`);
const state=(db:string,tg:string)=>json(db,`select public.vvr_world_boss_state('${tg}')`);
/** Lets a player hit again without waiting for the real cooldown. */
const rewind=(db:string,tg:string)=>psql(db,`update vvr.world_boss_participants set last_hit_at=last_hit_at-interval '1 hour' where player_id=(select id from vvr.players where telegram_id='${tg}')`);

before(async()=>{
 if(skip)return;
 await psql('postgres',`do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$`);
 await psql('postgres','drop database if exists wb_template');
 await psql('postgres','create database wb_template');
 await run('psql',['-X','-q','-v','ON_ERROR_STOP=1','-h',host!,'-p',port,'-U',user,'-d','wb_template','-f',migration.pathname]);
 await psql('wb_template',`insert into vvr.world_boss_admins values ('${ADMIN}')`);
 assert.ok(readFileSync(migration,'utf8').includes('for update'));
});

test('only admins start an event; config is validated; one open event at a time',{skip},async()=>{
 const db=await freshDb();
 assert.equal((await state(db,'5')).event,null);
 await fails(db,`select public.vvr_world_boss_attack('5','x','${randomUUID()}')`,/world_boss_no_event/);
 await fails(db,`select public.vvr_world_boss_admin_start('5','Йотун','minotaur_echo',null,60,100000,'{}')`,/world_boss_admin_only/);
 await fails(db,`select public.vvr_world_boss_admin_start('${ADMIN}','Йотун','minotaur_echo',null,60,100000,${lit({damageMin:500,damageMax:100})})`,/world_boss_bad_config/);
 await fails(db,`select public.vvr_world_boss_admin_start('${ADMIN}','Йотун','minotaur_echo',null,60,100000,${lit({rewards:{participation:{gems:5}}})})`,/world_boss_bad_config/);
 const s=await start(db,{cooldownSeconds:30,rewards:{lastHit:{gold:777}}});
 assert.equal(s.event.active,true);assert.equal(s.event.hp,100000);assert.equal(s.event.cooldownSeconds,30);
 assert.equal(s.event.rewards.lastHit.gold,777);assert.ok(s.event.rewards.ranks.length>0,'unspecified parts keep defaults');
 assert.equal(s.isAdmin,true);assert.equal((await state(db,'5')).isAdmin,false);
 await fails(db,`select public.vvr_world_boss_admin_start('${ADMIN}','Второй','minotaur_echo',null,60,100000,'{}')`,/world_boss_already_open/);
});

test('damage is server-side and bounded; cooldown, daily limit and retried requests cannot add damage',{skip},async()=>{
 const db=await freshDb();
 await start(db,{damageMin:1000,damageMax:1200,critChance:0,cooldownSeconds:60,dailyHits:3});
 const req=randomUUID();
 const a=await attack(db,'7',req);
 assert.ok(a.hit.damage>=1000&&a.hit.damage<=1200);assert.equal(a.event.hp,100000-a.hit.damage);
 const again=await attack(db,'7',req);
 assert.equal(again.hit.repeated,true);assert.equal(again.hit.damage,a.hit.damage);assert.equal(again.event.hp,a.event.hp,'retry is not a new hit');
 await fails(db,`select public.vvr_world_boss_attack('7','x','${randomUUID()}')`,/world_boss_cooldown/);
 await rewind(db,'7');await attack(db,'7');await rewind(db,'7');await attack(db,'7');await rewind(db,'7');
 await fails(db,`select public.vvr_world_boss_attack('7','x','${randomUUID()}')`,/world_boss_daily_limit/);
 const me=(await state(db,'7')).event.me;assert.equal(me.hits,3);assert.equal(me.hitsToday,3);assert.equal(me.rank,1);
 await fails(db,`select public.vvr_world_boss_attack('abc','x','${randomUUID()}')`,/world_boss_auth_required/);
});

test('parallel taps of one account count once inside the cooldown',{skip},async()=>{
 const db=await freshDb();
 await start(db,{cooldownSeconds:60,critChance:0});
 const results=await Promise.allSettled(Array.from({length:6},()=>attack(db,'9')));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const s=await state(db,'9');assert.equal(s.event.me.hits,1);
});

test('a crowd attacking at once: exact shared HP, one last hit, rewards created once',{skip},async()=>{
 const db=await freshDb();
 await start(db,{damageMin:900,damageMax:1400,critChance:.2,cooldownSeconds:1},20000);
 const players=Array.from({length:30},(_,i)=>String(1000+i));
 const results=await Promise.allSettled(players.map(tg=>attack(db,tg)));
 const ok=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
 const report=await json(db,`select public.vvr_world_boss_admin_report('${ADMIN}',(select id from vvr.world_boss_events limit 1))`);
 assert.equal(report.consistent,true,'max HP − HP equals the sum of accepted hits');
 assert.equal(report.event.hp,0);assert.equal(report.event.status,'defeated');
 const kills=ok.filter(r=>r.hit.killing);assert.equal(kills.length,1,'exactly one killing blow');
 const rejected=results.filter(r=>r.status==='rejected');
 for(const r of rejected)assert.match(String((r as PromiseRejectedResult).reason.stderr),/world_boss_no_event|world_boss_event_ended/);
 const killer=await psql(db,`select p.telegram_id from vvr.world_boss_hits h join vvr.players p on p.id=h.player_id where h.killing`);
 const lastHit=await psql(db,`select p.telegram_id from vvr.world_boss_events e join vvr.players p on p.id=e.last_hit_player`);
 assert.equal(lastHit,killer);
 const counts=await json(db,`select jsonb_build_object('part',count(*) filter (where kind='participation'),'rank',count(*) filter (where kind='rank'),'last',count(*) filter (where kind='last_hit'),'participants',(select count(*) from vvr.world_boss_participants)) from vvr.world_boss_rewards`);
 assert.equal(counts.part,counts.participants);assert.equal(counts.rank,counts.participants);assert.equal(counts.last,1);
 await psql(db,`select vvr.world_boss_settle(id) from vvr.world_boss_events`);
 assert.equal(Number(await psql(db,'select count(*) from vvr.world_boss_rewards')),counts.part+counts.rank+1,'settling again adds nothing');
 const top=(await state(db,killer)).event.top;assert.ok(top.length<=10);for(let i=1;i<top.length;i++)assert.ok(top[i-1].damage>=top[i].damage);
});

test('rewards are claimed into the trusted journal exactly once and only by their owner',{skip},async()=>{
 const db=await freshDb();
 await start(db,{damageMin:1000,damageMax:1000,critChance:0},1000);
 await attack(db,'42');
 const mail=(await state(db,'42')).mail;
 assert.deepEqual(mail.map((m:{kind:string})=>m.kind).sort(),['last_hit','participation','rank']);
 const ev=mail[0].eventId;
 const first=await json(db,`select public.vvr_world_boss_claim('42','${ev}','rank')`);
 assert.equal(first.firstClaim,true);
 const receipts=await psql(db,`select count(*) from vvr.resource_receipts`);
 const second=await json(db,`select public.vvr_world_boss_claim('42','${ev}','rank')`);
 assert.equal(second.firstClaim,false);assert.deepEqual(second.payload,first.payload);
 assert.equal(await psql(db,`select count(*) from vvr.resource_receipts`),receipts,'no second grant');
 assert.equal(Number(receipts),Object.keys(first.payload).length);
 await fails(db,`select public.vvr_world_boss_claim('43','${ev}','rank')`,/world_boss_no_reward/);
 const parallel=await Promise.allSettled(Array.from({length:5},()=>json(db,`select public.vvr_world_boss_claim('42','${ev}','participation')`)));
 assert.equal(parallel.filter(r=>r.status==='fulfilled'&&r.value.firstClaim).length,1,'concurrent claims grant once');
});

test('an event that runs out of time expires, settles scaled rewards and enters history',{skip},async()=>{
 const db=await freshDb();
 await start(db,{damageMin:1000,damageMax:1000,critChance:0,expiredMultiplier:.5,rewards:{participation:{gold:4000}}});
 await attack(db,'50');
 await psql(db,`update vvr.world_boss_events set starts_at=now()-interval '2 hours', ends_at=now()-interval '1 second'`);
 const s=await state(db,'50');
 assert.equal(s.event.status,'expired');assert.equal(s.event.active,false);
 assert.equal(s.history.length,1);assert.equal(s.history[0].myDamage,1000);
 const part=s.mail.find((m:{kind:string})=>m.kind==='participation');assert.equal(part.payload.gold,2000);
 assert.equal(s.mail.some((m:{kind:string})=>m.kind==='last_hit'),false);
 await fails(db,`select public.vvr_world_boss_attack('50','x','${randomUUID()}')`,/world_boss_no_event/);
 const next=await start(db);assert.equal(next.event.status,'open','a new event can start after the old one closed');
});

test('admin can end the event early; it settles once',{skip},async()=>{
 const db=await freshDb();
 const s=await start(db);await attack(db,'60');
 await fails(db,`select public.vvr_world_boss_admin_end('60','${s.event.id}')`,/world_boss_admin_only/);
 const ended=await json(db,`select public.vvr_world_boss_admin_end('${ADMIN}','${s.event.id}')`);
 assert.equal(ended.event.status,'expired');
 await fails(db,`select public.vvr_world_boss_admin_end('${ADMIN}','${s.event.id}')`,/world_boss_not_open/);
 assert.equal(Number(await psql(db,'select count(*) from vvr.world_boss_rewards')),2);
});
