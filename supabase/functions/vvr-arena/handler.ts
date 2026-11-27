import {arenaElixirs,arenaHeroes,zones,type ArenaHero} from '../../../src/arena/protocol.ts';
import {TeamRoomService,type TeamCommand,type Ticket} from '../../../server/arena/team-room.ts';
import {teamArenaSize,type TeamEntrant,type TeamMode} from '../../../server/arena/team.ts';

type Rpc=<T>(name:string,input:Record<string,unknown>)=>Promise<T>;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

async function readInput(request:Request){
 const stream=request.body?.getReader();
 if(!stream)return;
 const decoder=new TextDecoder();
 let bytes=0,text='';
 try{
  for(;;){
   const part=await stream.read();
   if(part.done)break;
   bytes+=part.value.byteLength;
   if(bytes>4096){await stream.cancel();return;}
   text+=decoder.decode(part.value,{stream:true});
  }
  return JSON.parse(text+decoder.decode()) as unknown;
 }catch{return undefined;}
 finally{stream.releaseLock();}
}

function command(value:unknown):TeamCommand|undefined{
 if(!record(value)||!Number.isSafeInteger(value.sequence)||Number(value.sequence)<1)return;
 const sequence=Number(value.sequence),size=Object.keys(value).length;
 if(value.kind==='auto'&&size===3&&typeof value.enabled==='boolean')return {kind:'auto',sequence,enabled:value.enabled};
 if(value.kind==='item'&&size===3&&typeof value.item==='string'&&Object.hasOwn(arenaElixirs,value.item))
  return {kind:'item',sequence,item:value.item as keyof typeof arenaElixirs};
 if(value.kind==='chat'&&size===3&&typeof value.text==='string'&&value.text.length<=800)
  return {kind:'chat',sequence,text:value.text};
 if(value.kind==='strike'&&size===5&&uuidOrBot(value.target)&&zone(value.attack)&&Array.isArray(value.blocks)&&
   value.blocks.length===2&&zone(value.blocks[0])&&zone(value.blocks[1])&&value.blocks[0]!==value.blocks[1])
  return {kind:'strike',sequence,target:value.target,attack:value.attack,blocks:[value.blocks[0],value.blocks[1]]};
}
const zone=(value:unknown):value is keyof typeof zones=>typeof value==='string'&&Object.hasOwn(zones,value);
const uuidOrBot=(value:unknown):value is string=>uuid(value)||typeof value==='string'&&/^bot-[0-9]{1,2}$/.test(value);

function buildRoster(mode:TeamMode,players:readonly string[],profiles:Ticket['roster']):TeamEntrant[]{
 if(!profiles||profiles.length!==players.length||profiles.some((entry,i)=>entry.id!==players[i]||
   !Number.isSafeInteger(entry.attackPower)||!arenaHeroes.includes(entry.hero)))throw new Error('arena_roster_changed');
 const roster:TeamEntrant[]=profiles.map(profile=>({
  id:profile.id,name:profile.name,hero:profile.hero,trustedAttack:profile.attackPower,controller:'',
  level:1,rating:1000,kit:'balanced',
 }));
 const capacity=teamArenaSize[mode]*2;
 while(roster.length<capacity){
  const seat=roster.length,hero=arenaHeroes[seat%arenaHeroes.length];
  roster.push({id:'bot-'+seat,name:'Тренировочный бот '+(seat+1),hero,controller:'',
   level:1,rating:1000,kit:'balanced',bot:true});
 }
 return roster;
}

export function makeArenaHandler(rpc:Rpc,session:(token:string,now:number)=>Promise<string|undefined>,origin:string,clock=Date.now,rng=Math.random,networkPolicy=false){
 const rooms=new TeamRoomService({
  read:(player,room)=>rpc<Ticket>('vvr_arena_room',{p_player:player,p_room:room}),
  checkpoint:(room,expected,snapshot,finished)=>rpc<number|null>('vvr_arena_checkpoint',{
   p_room:room,p_revision:expected,p_snapshot:snapshot,p_finished:finished,
  }),
 },async(mode,players,profiles)=>buildRoster(mode,players,profiles),rng);
 return async(request:Request)=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin',
   'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,authorization',
   'Access-Control-Allow-Methods':'POST,OPTIONS'};
  const reply=(status:number,value:unknown)=>Response.json(value,{status,headers});
  const requestOrigin=request.headers.get('origin');
  if(requestOrigin&&requestOrigin!==origin)return reply(403,{error:'origin_forbidden'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  const token=request.headers.get('authorization')?.match(/^Bearer (.{1,512})$/)?.[1];
  const now=clock();
  try{
   const player=token?await session(token,now):undefined;
   if(!uuid(player))return reply(401,{error:'session_required'});
   const data=await readInput(request);
   if(!record(data))return reply(400,{error:'invalid_arena_request'});
   const size=Object.keys(data).length;
   if(data.action==='podium'&&size===1)return reply(200,await rpc('vvr_arena_podium',{p_player:player}));
   if(data.action==='current'&&size===1){
    const room=await rpc<Ticket|null>('vvr_arena_current',{p_player:player});
    return reply(200,room?await rooms.interact(player,room.id,now):null);
   }
   if(data.action==='join'&&size===3&&(data.mode==='team'||data.mode==='chaos')&&
     typeof data.hero==='string'&&arenaHeroes.includes(data.hero as ArenaHero)){
    if(networkPolicy&&!await rpc<boolean>('vvr_network_policy',{p_player:player,p_feature:'arena_team'}))
     return reply(403,{error:'network_feature_restricted'});
    const ticket=await rpc<Ticket>('vvr_arena_join',{p_player:player,p_mode:data.mode,p_hero:data.hero});
    return reply(200,await rooms.interact(player,ticket.id,now));
   }
   if(data.action==='cancel'&&size===2&&uuid(data.room)){
    return reply(200,{accepted:await rpc('vvr_arena_cancel',{p_player:player,p_room:data.room})});
   }
   if(data.action==='room'&&size===2&&uuid(data.room))return reply(200,await rooms.interact(player,data.room,now));
   if(data.action==='command'&&size===3&&uuid(data.room)){
    const move=command(data.command);
    if(move?.kind==='chat'&&networkPolicy&&!await rpc<boolean>('vvr_network_policy',{p_player:player,p_feature:'arena_chat'}))
     return reply(403,{error:'network_feature_restricted'});
    if(move)return reply(200,await rooms.interact(player,data.room,now,move));
   }
   return reply(400,{error:'invalid_arena_request'});
  }catch(error){
   const code=error instanceof Error?error.message:'';
   if(code==='42501'||code==='arena_not_member')return reply(403,{error:'arena_not_member'});
   if(code==='arena_room_changed')return reply(409,{error:code});
   return reply(503,{error:'arena_unavailable'});
  }
 };
}
