import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {verifyTelegram,issueSession,readSession} from '../server/arena/auth';
import {createArenaServer} from '../server/arena/http';
import {ArenaService} from '../server/arena/service';
import {readArenaLevels} from '../server/arena/roster';
import {soloArenaPreview} from '../src/arena/soloPreview';
import {freshPlayer} from '../src/core/store';
import {advance,applyCommand,compatible,entrantStats,newMatch,viewMatch,type Entrant} from '../server/arena/duel';
import {CHAT_MS,ITEM_COOLDOWN_MS,MATCH_WAIT_MS,ROUND_MS,type ArenaCommand} from '../src/arena/protocol';

const start=1_800_000_000_000;
const botToken='telegram-token-only-for-tests';
const sessionKey='session-key-only-for-control-tests-32-bytes';
const sign=(id:number,now=start)=>{
 const fields=new URLSearchParams({user:JSON.stringify({id,first_name:'Герой '+id}),auth_date:String(Math.floor(now/1000)),query_id:'1234'});
 const check=[...fields].sort().map(([k,v])=>k+'='+v).join('\n');
 const key=createHmac('sha256','WebAppData').update(botToken).digest();
 fields.set('hash',createHmac('sha256',key).update(check).digest('hex'));
 return fields.toString();
};
const alice={id:'1',controller:'first-view'};
const boris={id:'2',controller:'second-view'};
const a:Entrant={...alice,hero:'ranger',kit:'offensive',level:1,rating:1000,name:'Алиса'};
const b:Entrant={...boris,hero:'berserker',kit:'defensive',level:1,rating:1000,name:'Борис'};
const head: ArenaCommand={kind:'move',move:{attack:'head',blocks:['belly','legs'],skill:null}};
const legs: ArenaCommand={kind:'move',move:{attack:'legs',blocks:['chest','belly'],skill:null}};
const block: ArenaCommand={kind:'move',move:{attack:'legs',blocks:['head','chest'],skill:null}};

test('only current Telegram signatures from the staging bot authenticate',()=>{
 const raw=sign(1);
 assert.deepEqual(verifyTelegram(raw,botToken,start),{id:'1',name:'Герой 1'});
 assert.equal(verifyTelegram(raw,botToken+'different',start),undefined);
 const bad=new URLSearchParams(raw);
 bad.set('user',JSON.stringify({id:2,first_name:'Другой игрок'}));
 assert.equal(verifyTelegram(bad.toString(),botToken,start),undefined);
 assert.equal(verifyTelegram(raw+'&auth_date=0',botToken,start),undefined);
 assert.equal(verifyTelegram(raw,botToken,start+601_000),undefined);
 assert.equal(verifyTelegram(sign(1,start+31_000),botToken,start),undefined);
 const token=issueSession('1',sessionKey,start);
 assert.equal(readSession(token,sessionKey,start)?.id,'1');
 assert.equal(readSession(token,sessionKey+'other',start),undefined);
 assert.equal(readSession(token,sessionKey,start+12*60*60_000),undefined);
});

test('matchmaking uses the exact seven-level window along with rating and power limits',()=>{
 assert.equal(compatible(a,{...b,level:8}),true);
 assert.equal(compatible(a,{...b,level:9}),false);
 assert.equal(compatible(a,{...b,rating:1701}),false);
 assert.equal(compatible(a,{...a}),false);
 assert.equal(compatible({...a,level:40},{...b,level:40}),true);
});

test('Solo projection compares ordinary gear, an upgrade and legacy power without touching the save',()=>{
 const player=freshPlayer();
 const weapon={...player.equipment.weapon!,attack:12};
 player.equipment.weapon=weapon;
 const previous=structuredClone(player);
 const ordinary=soloArenaPreview(player);
 assert.deepEqual(player,previous);
 assert.equal(ordinary.gear.length,7);
 assert.equal(ordinary.gear[0].contribution,3);
 assert.equal(ordinary.hero,'berserker');
 const upgraded=soloArenaPreview({...player,heroClass:'ranger',skills:[5,2,1],equipment:{...player.equipment,weapon:{...weapon,attack:20,upgrade:1}}});
 assert.equal(upgraded.gear[0].contribution,5);
 assert.ok(upgraded.attack>ordinary.attack);
 assert.equal(upgraded.hero,'ranger');
 assert.deepEqual(upgraded.skillLevels,[5,2,1]);
 const legacy=soloArenaPreview({...player,equipment:{...player.equipment,weapon:{...weapon,attack:1e100,upgrade:9000}}});
 assert.equal(legacy.gear[0].contribution,8);
 assert.equal(legacy.attack,250);
 assert.ok(legacy.gear.every(item=>item.contribution>=0&&item.contribution<=item.cap));
});

test('Arena server without a test allowlist only runs in local mode',()=>{
 assert.throws(()=>createArenaServer({dbPath:':memory:',botToken,sessionKey}),/allowlisted test accounts/);
 assert.throws(()=>createArenaServer({dbPath:':memory:',botToken,sessionKey,allowedUsers:new Set(['1'])}),/allowlisted test accounts/);
});

test('server roster assigns distinct Arena levels without importing Solo and locks them into the fight',()=>{
 const root=mkdtempSync(join(tmpdir(),'vvr-roster-')),dbPath=join(root,'arena.sqlite');
 const allowed=new Set(['1','2','3']);
 const levels=readArenaLevels('{"1":6,"2":13,"3":14}',allowed);
 for(const raw of ['{"4":2}','{"1":3.5}','{"1":101}','{"1":"4"}','[]','null'])
  assert.throws(()=>readArenaLevels(raw,allowed),/ARENA_TEST_LEVELS/);
 let service=new ArenaService(dbPath,()=>.5,levels);
 const other={id:'3',controller:'third-view'};
 try{
  for(const id of allowed)service.authenticate({id,name:'Игрок '+id});
  const queue=service.join(alice,'ranger','offensive',start).queued!;
  const tooFar=service.join(other,'ranger','offensive',start).queued!;
  assert.ok(tooFar.id!==queue.id);
  assert.equal(service.read(alice,start).match,undefined);
  const opening=service.join(boris,'berserker','balanced',start).match!;
  assert.equal(opening.bot,false);
  assert.equal(opening.you.level,13);
  assert.equal(opening.opponent.level,6);
  assert.equal(opening.opponent.maxHp,entrantStats({...a,level:6}).maxHp);
  service.close();
  service=new ArenaService(dbPath,()=>.5,readArenaLevels('{"1":9,"2":20,"3":15}',allowed));
  const recovered=service.read(alice,start+1000);
  assert.equal(recovered.level,9);
  assert.equal(recovered.match?.id,opening.id);
  assert.equal(recovered.match?.you.level,6);
  assert.equal(recovered.match?.opponent.level,13);
  assert.equal(service.read(other,start+1000).queued,undefined,'changed assignment invalidates the old search');
 }finally{
  service.close();
  rmSync(root,{recursive:true,force:true});
 }
});

test('a delayed cancellation cannot cancel a new search or reclaim control',()=>{
 const service=new ArenaService(':memory:');
 const tab={...alice,controller:'new-view'};
 try{
  service.authenticate(a);
  const first=service.join(alice,'ranger','balanced',start).queued!;
  const old={target:first.id,revision:first.controlRevision};
  assert.equal(service.leave(alice,old,start).queued,undefined);
  const second=service.join(alice,'ranger','balanced',start).queued!;
  assert.notEqual(first.id,second.id);
  assert.equal(service.leave(alice,old,start).queued?.id,second.id);
  assert.equal(service.takeover(tab,old,start).queued?.control,false);
  const current={target:second.id,revision:second.controlRevision};
  assert.equal(service.takeover(tab,current,start).queued?.control,true);
  assert.equal(service.takeover(alice,current,start).queued?.control,false);
 }finally{service.close()}
});

test('20 seconds is the queue window, the bot is explicit, and a duel round lasts 60 seconds',()=>{
 const service=new ArenaService(':memory:');
 try{
  service.authenticate(a);
  assert.ok(service.join(alice,'ranger','balanced',start).queued);
  service.read(alice,start+8000);
  service.read(alice,start+16000);
  assert.equal(service.read(alice,start+MATCH_WAIT_MS-1).match,undefined);
  const match=service.read(alice,start+MATCH_WAIT_MS).match!;
  assert.equal(match.bot,true);
  assert.equal(match.deadline,start+MATCH_WAIT_MS+ROUND_MS);
  assert.equal(match.opponent.name,'Тренировочный бот');
  assert.equal(match.you.maxHp,match.opponent.maxHp);
  const done=service.read(alice,match.deadline).match!;
  assert.equal(done.result?.reason,'disconnect');
  assert.equal(done.result?.points,0);
 }finally{service.close()}
});

test('zones, hidden turns, auto, power kits and cooldowns are applied only on the server',()=>{
 const match=newMatch('zone',a,b,start,false,()=>.5);
 assert.ok(applyCommand(match,a.id,head,1,1,start,()=>.5));
 assert.equal(viewMatch(match,b.id,b.controller,start).opponent.moved,true);
 assert.equal('turn' in viewMatch(match,b.id,b.controller,start).opponent,false);
 assert.ok(applyCommand(match,b.id,block,1,1,start,()=>.5));
 assert.equal(match.round,2);
 assert.equal(match.players[1].hp,match.players[1].maxHp);
 assert.ok(match.log.some(event=>event.text.includes('блок удара в голову')));
 assert.equal(applyCommand(match,b.id,block,1,2,start+1,()=>.5),false);
 assert.equal(applyCommand(match,b.id,block,2,1,start+1,()=>.5),false);
 assert.ok(applyCommand(match,a.id,{kind:'item',item:'attack'},2,2,start+1,()=>.5));
 assert.ok(applyCommand(match,a.id,{kind:'item',item:'defense'},2,3,start+1,()=>.5));
 assert.equal(match.players[0].gear.length,7);
 assert.equal(match.players[0].itemAt.attack,start+1+ITEM_COOLDOWN_MS);
 assert.equal(applyCommand(match,b.id,{kind:'item',item:'adrenaline'},2,2,start+1,()=>.5),false);
 assert.ok(applyCommand(match,b.id,{kind:'item',item:'time'},2,2,start+2,()=>.5));
 assert.equal(match.deadline,start+50_000);
 assert.ok(applyCommand(match,a.id,{kind:'auto',enabled:true},2,4,start+4,()=>.5));
 advance(match,start+2504,()=>.5);
 assert.ok(viewMatch(match,a.id,a.controller,start+2504).you.moved);
 assert.ok(applyCommand(match,b.id,legs,2,3,start+2504,()=>.5));
 assert.equal(match.round,3);
});

test('a missing move loses at the server deadline, a short disconnect can resume',()=>{
 const match=newMatch('afk',a,b,start);
 const near=match.deadline-1000;
 assert.ok(applyCommand(match,a.id,head,1,1,near));
 match.players[1].seenAt=near;
 advance(match,match.deadline-1);
 assert.equal(match.result,undefined);
 advance(match,match.deadline);
 const view=viewMatch(match,b.id,b.controller,match.deadline);
 assert.equal(view.result?.reason,'afk');
 assert.equal(view.result?.outcome,'loss');
 assert.equal(view.result?.points,0);
});

test('two authenticated HTTP identities finish a real duel, rejoin, and keep room chat for exactly 30 minutes',async()=>{
 const root=mkdtempSync(join(tmpdir(),'vvr-duel-')),dbPath=join(root,'arena.sqlite');
 let now=start;
 const options={dbPath,botToken,sessionKey,clock:()=>now,rng:()=>.5,allowedUsers:new Set(['1','2','3'])};
 let server=createArenaServer(options);
 const listen=async()=>{
  await new Promise<void>((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Missing test address');
  return 'http://127.0.0.1:'+address.port+'/arena-api/';
 };
 const close=()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 try{
  let base=await listen();
  const request=async(path:string,data?:Record<string,unknown>,token?:string,tab=randomUUID())=>{
   const response=await fetch(base+path,{method:data?'POST':'GET',headers:{
    ...(data?{'Content-Type':'application/json'}:{}),
    ...(token?{Authorization:'Bearer '+token,'X-Arena-Tab':tab}:{}),
   },body:data?JSON.stringify(data):undefined});
   return {status:response.status,data:await response.json()};
  };
  assert.equal((await fetch(new URL('/health',base))).status,200);
  assert.equal((await request('auth',{initData:'user=1'})).status,401);
  assert.equal((await request('auth',{initData:sign(4)})).status,403);
  assert.equal((await request('local?user=alice')).status,401);
  const actor=async(id:number)=>{
   const token=(await request('auth',{initData:sign(id)})).data.token as string;
   const tab=randomUUID();
   return (path:string,data?:Record<string,unknown>,newTab=tab)=>request(path,data,token,newTab);
  };
  const one=await actor(1),two=await actor(2),stranger=await actor(3);
  const forged={hero:'ranger',kit:'offensive',level:9999,cp:1e40,
  equipment:{weapon:{attack:1e30,upgrade:9999}},revision:12,stats:{hp:1e40}};
 assert.equal((await one('join',forged)).status,400);
 assert.equal((await one('join',{...forged,revision:1})).status,400);
 assert.equal((await one('state')).data.queued,undefined);
 assert.equal((await one('state')).data.level,1);
  assert.ok((await one('join',{hero:'ranger',kit:'offensive'})).data.queued);
  const opening=(await two('join',{hero:'berserker',kit:'balanced'})).data.match;
  const id=opening.id;
  assert.equal(opening.bot,false);
 assert.equal(opening.opponent.level,1);
 assert.deepEqual(opening.opponent.gear,[8,0,8,2,4,2,6]);
  assert.equal(opening.opponent.name,'Герой 1');
  assert.equal((await one('state')).data.match.opponent.name,'Герой 2');
  assert.equal((await stranger('room?match='+id)).status,404);
  assert.equal((await stranger('chat',{match:id,text:'Вне комнаты'})).status,404);
  assert.equal((await one('chat',{match:id,text:'https://t.me/abc'})).status,400);
  const chatReplies=await Promise.all([1,2].map(()=>one('chat',{match:id,text:'Хорошего боя'})));
  assert.deepEqual(chatReplies.map(reply=>reply.status).sort(),[200,429]);
  assert.equal((await two('state')).data.match.chat[0].text,'Хорошего боя');

  const newTab=randomUUID();
  const restored=(path:string,data?:Record<string,unknown>)=>one(path,data,newTab);
  const originalControl={target:id,revision:opening.controlRevision};
  assert.equal((await restored('state')).data.match.control,false);
  assert.equal((await restored('act',{...originalControl,action:head,round:1,sequence:1})).data.accepted,false);
  now+=1000;
  const switched=(await restored('resume',originalControl)).data.match;
  assert.equal(switched.control,true);
  assert.equal(switched.controlRevision,1);
  assert.equal((await one('resume',originalControl)).data.match.control,false);
  assert.equal((await one('leave',originalControl)).data.match.result,undefined);
  const firstAction={target:id,revision:switched.controlRevision,action:head,round:1,sequence:1};
  assert.equal((await one('act',firstAction)).data.accepted,false);
  assert.equal((await restored('act',{...firstAction,revision:0})).data.accepted,false);
  assert.equal((await restored('act',{...firstAction,action:{...head,damage:1e30,hp:1e30}})).status,400);
  assert.equal((await restored('act',{...firstAction,action:{kind:'move',move:{attack:'head',blocks:['head','head'],skill:null}}})).status,400);
  const duplicates=await Promise.all([restored('act',firstAction),restored('act',firstAction)]);
  assert.deepEqual(duplicates.map(reply=>reply.data.accepted).sort(),[false,true]);
  assert.equal((await restored('act',firstAction)).data.accepted,false);

  let oneState=(await restored('state')).data, twoState=(await two('state')).data;
  while(!twoState.match.result){
   const current=twoState.match.round;
   assert.ok(current<=60);
   if(!oneState.match.you.moved){
    const attack={kind:'move',move:{attack:'head',blocks:['belly','legs'],skill:current===2?'hammer':null}};
    const reply=await restored('act',{target:id,revision:oneState.match.controlRevision,action:attack,round:current,sequence:oneState.match.nextSequence});
    assert.ok(reply.data.accepted);
   }
   const replyBatch=await Promise.all([1,2].map(()=>two('act',{
    target:id,revision:twoState.match.controlRevision,action:legs,round:current,sequence:twoState.match.nextSequence,
   })));
   assert.equal(replyBatch.filter(reply=>reply.data.accepted).length,1);
   const reply=replyBatch.find(reply=>reply.data.accepted)!;
   twoState=reply.data.view;
   oneState=(await restored('state')).data;
   now+=1000;
  }
  assert.equal(oneState.match.result.outcome,'win');
  assert.equal(oneState.points,1);
  assert.equal(twoState.points,0);
  const finishedAt=oneState.match.result.finishedAt, deadline=finishedAt+CHAT_MS;
  assert.equal(oneState.match.chatDeadline,deadline);
  assert.equal((await two('chat',{match:id,text:'Спасибо за бой'})).status,200);

  await close();
  server=createArenaServer(options);
  base=await listen();
  now=deadline-1;
  const after=(await restored('state')).data;
  assert.equal(after.points,1);
  assert.equal(after.match.chatDeadline,deadline);
  assert.equal(after.match.chat.at(-1).text,'Спасибо за бой');
  assert.equal((await restored('act',firstAction)).data.accepted,false);
  assert.equal((await one('result',{match:id,winner:'1',points:20})).status,404);
  assert.equal((await two('chat',{match:id,text:'До встречи'})).status,200);
  now=deadline;
  assert.equal((await two('chat',{match:id,text:'Поздно'})).status,404);
  assert.equal((await restored('state')).data.points,1);
  const db=new DatabaseSync(dbPath);
  try{
  assert.equal(db.prepare('SELECT count(*) AS count FROM settlements').get()?.count,1);
  db.prepare('UPDATE profiles SET wins=100 WHERE id=1').run();
  assert.equal((await restored('state')).data.level,1,'training wins never raise fighter power');
 }
  finally{db.close()}
 }finally{
  if(server.listening)await close();
  rmSync(root,{recursive:true,force:true});
 }
});
