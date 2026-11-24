import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {issueVvrSession,readVvrSession} from '../../supabase/functions/_shared/vvr-identity.ts';
import {makeArenaHandler} from '../../supabase/functions/vvr-arena/handler.ts';

const box=process.argv[2];
if(!box?.startsWith('vvr-w066-qa-'))throw new Error('An isolated W066 test container is required');

function sql(statement:string,params:Record<string,string>={}){
 const variables=Object.entries(params).flatMap(([name,value])=>['-v',`${name}=${value}`]);
 return new Promise<string>((resolve,reject)=>{
  const child=spawn('docker',['exec','-i',box,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1',...variables]);
  let output='',error='';
  child.stdout.setEncoding('utf8').on('data',chunk=>{output+=chunk});
  child.stderr.setEncoding('utf8').on('data',chunk=>{error+=chunk});
  child.on('error',reject);
  child.on('close',code=>code===0?resolve(output.trim()):reject(new Error(error)));
  child.stdin.end(statement);
 });
}

const methods={
 vvr_arena_join:"(:'p_player',:'p_mode',:'p_hero')",
 vvr_arena_room:"(:'p_player',:'p_room')",
 vvr_arena_checkpoint:"(:'p_room',:'p_revision',:'p_snapshot',:'p_finished')",
 vvr_arena_current:"(:'p_player')",
 vvr_arena_cancel:"(:'p_player',:'p_room')",
 vvr_arena_podium:"(:'p_player')",
};
async function rpc<T>(name:string,input:Record<string,unknown>):Promise<T>{
 if(!Object.hasOwn(methods,name))throw new Error('Unexpected RPC');
 const args=Object.fromEntries(Object.entries(input).map(([key,value])=>[key,typeof value==='string'?value:JSON.stringify(value)]));
 try{
  const data=await sql(`set role service_role;\nselect public.${name}${methods[name as keyof typeof methods]};`,args);
  return JSON.parse(data||'null') as T;
 }catch(error){
  if(String(error).includes('arena_not_member'))throw new Error('42501');
  throw error;
 }
}
const origin='https://test.invalid', secret='ephemeral-arena-test-key-keep-isolated';
let now=Date.now();
const makeHandler=()=>makeArenaHandler(rpc,(token,time)=>readVvrSession(token,secret,time),origin,()=>now,()=>.5);
let handler=makeHandler();

async function client(id:string){
 const token=await issueVvrSession(id,secret,now);
 return async(payload:object,status=200)=>{
  const response=await handler(new Request(origin+'/vvr-arena',{
   method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},
   body:JSON.stringify(payload),
  }));
  const data=await response.json();
  assert.equal(response.status,status,JSON.stringify(data));
  return data;
 };
}

await sql("insert into vvr.seasons(id,name,starts_at,ends_at) values(gen_random_uuid(),'Arena QA',now()-interval '1 day',now()+interval '1 day');");
const story=async(mode:'team'|'chaos',size:number,startId:number)=>{
 const ids=(await sql("select vvr.resolve_player((:'start'::int+i)::text,'Match client '||i) from generate_series(0,:'last'::int) i;",
  {start:String(startId),last:String(size-1)})).split('\n');
 await sql("select vvr.set_hero_attack(:'player',1,200);",{player:ids[0]});
 const clients=await Promise.all(ids.map(client));
 assert.equal((await clients[0]({action:'join',mode,hero:'ranger',attack:100000},400)).error,'invalid_arena_request');
 const first=(await clients[0]({action:'join',mode,hero:'ranger'})).view;
 assert.equal(first.queued,1);
 const room=first.id;
 for(const caller of clients.slice(1))assert.equal((await caller({action:'join',mode,hero:'ranger'})).view.id,room);
 const get=(index:number)=>clients[index]({action:'room',room});
 const send=(index:number,command:object)=>clients[index]({action:'command',room,command});
 const outsider=await client('00000000-0000-0000-0000-000000000010');
 await outsider({action:'room',room},403);
 const ready=(await get(0)).view;
 assert.equal(ready.players.length,size);
 assert.equal(ready.training,false);
 const ordered=ready.players.map(({id}:{id:string})=>ids.indexOf(id));
 const fighter=(battle:any,index:number)=>battle.players.find((entry:any)=>entry.id===ids[index]);
 const move=(target:string,sequence:number)=>({kind:'strike',attack:'head',blocks:['chest','legs'],target,sequence});
 const readyAt=Number(await sql("select floor(extract(epoch from ready_at)*1000) from vvr.arena_rooms where id=:'room';",{room}));
 now=Math.max(now,readyAt)+1000;
 const pairs=await Promise.all([send(0,move(ids[1],1)),send(0,move(ids[1],1))]);
 assert.equal(pairs.filter(reply=>reply.accepted).length,1);
 let battle=pairs.find(reply=>reply.accepted).view;
 assert.ok(fighter(battle,0).damage>0);
 handler=makeHandler();
 assert.equal((await get(0)).view.you.nextSequence,2);
 const seqs=ids.map((_,i)=>i===0?2:1);
 for(let seat=1;seat<ordered.length;seat++){
  const actor=ordered[seat],opponent=ordered[seat^1];
  const turn=await send(actor,move(ids[opponent],seqs[actor]));
  assert.equal(turn.accepted,true,'opening move '+actor);
  seqs[actor]++;
  battle=turn.view;
 }
 assert.ok(fighter(battle,0).damage>fighter(battle,1).damage,'trusted hero revision increases server damage');
 for(let volley=0;volley<15&&!battle.result;volley++){
  now+=3000;
  for(const actor of ordered.filter((_,index)=>index%2===0)){
   if(battle.result)break;
   const enemy=battle.players.find((entry:any)=>entry.side===1&&entry.hp>0);
   const turn=await send(actor,move(enemy.id,seqs[actor]));
   assert.equal(turn.accepted,true,'strike '+actor);
   seqs[actor]++;
   battle=turn.view;
  }
 }
 assert.equal(battle.result?.reason,'hp');
 assert.equal(battle.result?.winner,0);
 const before=await clients[0]({action:'podium'});
 assert.equal(before.wins,1);
 assert.equal((await get(0)).view.rankAwarded,true);
 assert.equal((await clients[1]({action:'podium'})).teamLosses,1);
 assert.equal(await sql("select count(*) from vvr.arena_room_seats where room_id=:'room' and outcome='win';",{room}),String(size/2));
 assert.equal(await sql("select count(*) from vvr.score_events e join vvr.arena_room_seats s on s.player_id=e.player_id where s.room_id=:'room' and e.metric='arena_wins';",{room}),String(size/2));
 now+=1000;
 const chat=await send(0,{kind:'chat',text:'Хороший бой!',sequence:seqs[0]});
 assert.equal(chat.accepted,true);
 assert.equal((await get(1)).view.chat.at(-1).text,'Хороший бой!');
 assert.equal((await send(0,{kind:'chat',text:'Повтор',sequence:seqs[0]})).accepted,false);
 assert.equal((await clients[0]({action:'podium'})).wins,before.wins);
 await sql("update vvr.arena_rooms set finished_at=clock_timestamp()-interval '31 minutes' where id=:'room';",{room});
 await clients[1]({action:'room',room},403);
 console.log(`Arena ${size/2}×${size/2}: all fighters acted, authoritative HP result, reconnect, replay, chat and ranking verified`);
};

await story('team',6,74000);
await story('chaos',40,75000);

const player=await sql("select vvr.resolve_player('76000','Training player');");
now=Date.now();
const solo=await client(player);
const queue=(await solo({action:'join',mode:'team',hero:'ranger'})).view;
await sql("update vvr.arena_rooms set closes_at=clock_timestamp()-interval '1 second' where id=:'room';",{room:queue.id});
now=Math.max(now,Date.now());
const practice=(await solo({action:'room',room:queue.id})).view;
assert.equal(practice.training,true);
assert.equal(practice.players.filter((fighter:any)=>fighter.bot).length,5);
assert.equal((await solo({action:'command',room:queue.id,command:{kind:'auto',enabled:true,sequence:1}})).accepted,true);
now+=9000;
assert.ok((await solo({action:'room',room:queue.id})).view.log.length>0);
let random=391;
handler=makeArenaHandler(rpc,(token,time)=>readVvrSession(token,secret,time),origin,()=>now,()=>{
 random=(Math.imul(1664525,random)+1013904223)>>>0;
 return random/4294967296;
});
let trainingView;
for(let tick=0;tick<85;tick++){
 now+=4_000;
 trainingView=(await solo({action:'room',room:queue.id})).view;
 if(trainingView.result)break;
}
if(!trainingView.result){
 now+=60_000; // Also exercise settling the practice room after everyone stops polling.
 trainingView=(await solo({action:'room',room:queue.id})).view;
}
assert.ok(trainingView.result,'training fight must reach a terminal outcome');
assert.equal((await solo({action:'podium'})).wins,0);
console.log('Arena bot fallback: five training bots, Auto and no ranked award verified');
