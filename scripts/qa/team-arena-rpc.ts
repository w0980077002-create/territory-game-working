import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {TeamRoomService} from '../../server/arena/team-room';
import type {TeamMatch,TeamEntrant} from '../../server/arena/team';

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

const ids=(await sql(`select vvr.resolve_player((74000+i)::text,'Match client '||i) from generate_series(1,6) i;`)).split('\n');
let room='';
for(const player of ids){
 const ticket=JSON.parse(await sql("set role service_role;\nselect public.vvr_arena_join(:'player','team');",{player}));
 room ||= ticket.id;
 assert.equal(ticket.id,room);
}
const store={
 async read(player:string,id:string){
  return JSON.parse(await sql("set role service_role;\nselect public.vvr_arena_room(:'player',:'id');",{player,id}));
 },
 async checkpoint(id:string,expected:number,snapshot:TeamMatch,finished:boolean){
  const next=await sql("set role service_role;\nselect public.vvr_arena_checkpoint(:'id',:'expected',:'snapshot',:'finished');",{
   id,expected:String(expected),snapshot:JSON.stringify(snapshot),finished:String(finished),
  });
  return next?Number(next):null;
 },
};
const roster=async (_mode:string,players:readonly string[]):Promise<TeamEntrant[]>=>players.map((id,index)=>({
 id,name:`Клиент ${index+1}`,level:1,rating:1000,hero:'berserker',kit:'balanced',controller:`session-${index}`,
}));
const server=new TeamRoomService(store,roster,()=>0.5);
const [a,b]=ids;
const joined=await store.read(a,room);
assert.deepEqual(joined.players,ids);
const start=Date.parse(joined.readyAt);
const attack={kind:'strike',target:b,attack:'head',sequence:1,blocks:['chest','legs']} as const;
const replies=await Promise.all(Array.from({length:2},()=>server.interact(a,room,start+1,{...attack,blocks:[...attack.blocks]})));
assert.equal(replies.filter(reply=>reply.accepted).length,1);
const reconnected=new TeamRoomService(store,roster,()=>0.5);
const {view}=await reconnected.interact(a,room,start+61_000);
assert.deepEqual(view.result,{reason:'afk',winner:0,finishedAt:start+60_000});
const saved=await store.read(b,room);
assert.equal(saved.snapshot.players[0].sequence,1);
assert.equal(saved.snapshot.log.length,1);
assert.ok(saved.finishedAt);
await assert.rejects(store.read(ids[0],'00000000-0000-0000-0000-000000000000'),/arena_not_member/);
console.log('Arena 3×3: PostgreSQL admission, concurrent command, reconnect and AFK settlement verified');
