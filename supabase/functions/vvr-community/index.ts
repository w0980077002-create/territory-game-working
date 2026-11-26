import {issueVvrSession,readVvrSession,verifyTelegramIdentity} from '../_shared/vvr-identity.ts';
import {makeSecretReader} from '../_shared/w066-secrets.ts';

const project=Deno.env.get('SUPABASE_URL');
const roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const readSecrets=makeSecretReader(project??'',roleKey??'',{
 sessionKey:Deno.env.get('VVR_SESSION_SECRET')??'',botToken:Deno.env.get('TELEGRAM_BOT_TOKEN')??'',
});
const origin=Deno.env.get('VVR_WEB_ORIGIN')??'https://w0980077002-create.github.io';
const actions=new Set(['login','auction','trade','chat','post','hide','ranking','guild','guild_roster','guild_boss_claim','referrals','brotherhood_claim','brotherhood_admin','equip','unequip','enhance']);
const maxInput=16_384;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

const isUuid=(id:unknown):id is string=>typeof id==='string'&&uuid.test(id);
function isRecord(value:unknown):value is Record<string,unknown>{
 return !!value&&typeof value==='object'&&!Array.isArray(value);
}

function valid(action:string,body:Record<string,unknown>){
 const keys=Object.keys(body).length;
 switch(action){
  case 'login':return keys===1&&typeof body.initData==='string';
  case 'auction':case 'chat':case 'guild':return keys===0;
  case 'referrals':return keys===0||(keys===1&&isUuid(body.before));
  case 'brotherhood_claim':return keys===1&&isUuid(body.award);
  case 'brotherhood_admin':return keys===0||(keys===1&&typeof body.enabled==='boolean');
  case 'trade':
   if(!isUuid(body.operationId))return false;
   return body.kind==='list'?keys===4&&isUuid(body.itemId)&&typeof body.price==='number'&&
    Number.isSafeInteger(body.price)&&body.price>=1&&body.price<=1_000_000_000:
    keys===3&&(body.kind==='buy'||body.kind==='cancel')&&isUuid(body.listingId);
  case 'enhance':return keys===3&&isUuid(body.item)&&isUuid(body.operationId)&&
   Number.isSafeInteger(body.expectedRank)&&Number(body.expectedRank)>=0&&Number(body.expectedRank)<62;
  case 'equip':case 'unequip':return keys===1&&isUuid(body.item);
  case 'guild_boss_claim':return keys===1&&isUuid(body.eventId);
  case 'guild_roster':
   switch(body.kind){
    case 'create':return keys===2&&typeof body.name==='string'&&body.name.trim().length>=3&&body.name.length<=64;
    case 'apply':case 'withdraw':return keys===2&&isUuid(body.guild);
    case 'accept':case 'reject':return keys===3&&isUuid(body.guild)&&isUuid(body.applicant);
    case 'leave':return keys===1;
    default:return false;
   }
  case 'post':return keys===2&&isUuid(body.operationId)&&typeof body.text==='string'&&body.text.length<=960;
  case 'hide':return keys===1&&typeof body.message==='number'&&Number.isSafeInteger(body.message)&&body.message>0;
  case 'ranking':return (keys===1&&body.season===undefined||keys===2&&isUuid(body.season))&&
   (body.metric==='world_boss_damage'||body.metric==='arena_wins');
  default:return false;
 }
}

async function input(request:Request,limit=maxInput){
 const stream=request.body?.getReader();
 if(!stream)throw new Error('missing_body');
 const decoder=new TextDecoder(),parts:string[]=[];
 let size=0;
 try{
  for(;;){
   const {done,value}=await stream.read();
   if(done)break;
   size+=value.length;
   if(size>limit){await stream.cancel();throw new Error('body_too_large');}
   parts.push(decoder.decode(value,{stream:true}));
  }
  return JSON.parse(parts.join('')+decoder.decode()) as unknown;
 }finally{stream.releaseLock();}
}

async function rpc(name:string,body:unknown){
 const response=await fetch(project+'/rest/v1/rpc/'+name,{
  method:'POST',headers:{'Content-Type':'application/json',apikey:roleKey!,Authorization:'Bearer '+roleKey},
  body:JSON.stringify(body),
 });
 return {ok:response.ok,data:await response.json() as unknown};
}

function rpcError(data:unknown){
 const code=isRecord(data)?data.code:undefined;
 if(code==='42501')return 403;
 if(code==='P0429')return 429;
 if(code==='23505'||code==='23514')return 409;
 if(typeof code==='string'&&code.startsWith('22'))return 400;
 return 503;
}

async function backup(request:Request,sessionKey:string,reply:(status:number,body:unknown)=>Response){
 const bearer=request.headers.get('authorization');
 const player=bearer?.startsWith('Bearer ')?await readVvrSession(bearer.slice(7),sessionKey,Date.now()):undefined;
 if(!player)return reply(401,{error:'session_required'});
 let data:unknown;
 try{data=await input(request,4_300_000);}catch{return reply(400,{error:'invalid_snapshot'});}
 if(!isRecord(data))return reply(400,{error:'invalid_snapshot'});
 let result:{ok:boolean;data:unknown};
 if(Object.keys(data).length===1&&typeof data.previous==='boolean'){
  result=await rpc('vvr_snapshot_read',{p_player:player,p_previous:data.previous});
 }else if(Object.keys(data).length===3&&isUuid(data.requestId)&&typeof data.raw==='string'&&
  typeof data.expected==='number'&&Number.isInteger(data.expected)&&data.expected>=0&&data.expected<2_147_483_647){
  result=await rpc('vvr_snapshot_store',{p_player:player,p_expected:data.expected,p_request:data.requestId,p_raw:data.raw});
 }else return reply(400,{error:'invalid_snapshot'});
 return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'snapshot_request_rejected'});
}

async function arenaPublisher(request:Request,kind:'profile'|'team'|'duel'|'potions',reply:(status:number,body:unknown)=>Response){
 const bearer=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 if(!bearer)return reply(401,{error:'arena_publisher_required'});
 let data:unknown;
 try{data=await input(request,kind==='team'?16384:2048);}catch{return reply(400,{error:'invalid_arena_result'});}
 if(!isRecord(data))return reply(400,{error:'invalid_arena_result'});
 const validDate=(time:unknown)=>typeof time==='string'&&Number.isFinite(Date.parse(time));
 if(kind==='team'){
  if((Object.keys(data).length!==7&&!(Object.keys(data).length===8&&data.local===true))||!isUuid(data.match)||!['team','chaos'].includes(String(data.mode))||
   !validDate(data.startedAt)||!validDate(data.finishedAt)||!['hp','time','afk'].includes(String(data.reason))||
   ![0,1,null].includes(data.winner as number|null)||!Array.isArray(data.members))
   return reply(400,{error:'invalid_arena_result'});
 }else if((kind==='potions'?
   ![2,5].includes(Object.keys(data).length)||Object.keys(data).length===5&&
    (!isUuid(data.operation)||!Number.isSafeInteger(data.stage)||!Number.isSafeInteger(data.price)):
   Object.keys(data).length!==(kind==='profile'?2:4))||typeof data.telegram!=='string'||
  !/^[1-9][0-9]{0,15}$/.test(data.telegram)||typeof data.name!=='string'||
  Array.from(data.name).length<1||Array.from(data.name).length>32||
  (kind==='duel'&&(!isUuid(data.match)||!validDate(data.finishedAt)))){
  return reply(400,{error:'invalid_arena_result'});
 }
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bearer)));
 const tokenHash=Array.from(hash,byte=>byte.toString(16).padStart(2,'0')).join('');
 if(kind==='team'){
  if(data.local===true){
   const result=await rpc('vvr_ingest_arena_oath',{
    p_token_hash:tokenHash,p_match:data.match,p_mode:data.mode,p_started:data.startedAt,p_finished:data.finishedAt,
    p_reason:data.reason,p_members:data.members,
   });
   return result.ok&&result.data===true?reply(200,{accepted:true}):reply(rpcError(result.data),{error:'arena_oath_rejected'});
  }
  const result=await rpc('vvr_ingest_arena_team',{
   p_token_hash:tokenHash,p_match:data.match,p_mode:data.mode,p_started:data.startedAt,p_finished:data.finishedAt,
   p_reason:data.reason,p_winner:data.winner,p_members:data.members,
  });
  return result.ok&&result.data===true?reply(200,{accepted:true}):reply(rpcError(result.data),{error:'arena_result_rejected'});
 }
 if(kind==='potions'){
  const result=await rpc('vvr_arena_potions',{
   p_token_hash:tokenHash,p_telegram:data.telegram,p_name:data.name,
   p_operation:data.operation??null,p_stage:data.stage??null,p_price:data.price??null,
  });
  return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'arena_potions_rejected'});
 }
 if(kind==='profile'){
  const result=await rpc('vvr_arena_hero',{p_token_hash:tokenHash,p_telegram:data.telegram,p_name:data.name});
  return result.ok?reply(200,{attack:result.data}):reply(rpcError(result.data),{error:'arena_profile_rejected'});
 }
 const result=await rpc('vvr_ingest_arena_result',{
  p_token_hash:tokenHash,p_match:data.match,
  p_telegram:data.telegram,p_name:data.name,p_finished:data.finishedAt,
 });
 return result.ok?reply(200,{accepted:true}):reply(rpcError(result.data),{error:'arena_result_rejected'});
}

Deno.serve(async request=>{
 const requestedOrigin=request.headers.get('origin'),allowed=requestedOrigin===null||requestedOrigin===origin;
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,authorization',
  'Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json',Vary:'Origin'};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(!allowed)return reply(403,{error:'origin_forbidden'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
 const path=new URL(request.url).pathname;
 if(path.endsWith('/arena-result')||path.endsWith('/arena-profile')||path.endsWith('/arena-team-result')||path.endsWith('/arena-potions')){
  if(!project||!roleKey)return reply(503,{error:'unavailable'});
  try{return await arenaPublisher(request,path.endsWith('/arena-profile')?'profile':path.endsWith('/arena-team-result')?'team':path.endsWith('/arena-potions')?'potions':'duel',reply);}catch{return reply(503,{error:'unavailable'});}
 }
 const {botToken,sessionKey}=await readSecrets();
 if(!project||!roleKey||!botToken||sessionKey.length<32||sessionKey===botToken)return reply(503,{error:'unavailable'});
 if(new URL(request.url).pathname.endsWith('/backup')){
  try{return await backup(request,sessionKey,reply);}catch{return reply(503,{error:'unavailable'});}
 }
 let value:unknown;
 try{value=await input(request);}catch{return reply(400,{error:'invalid_request'});}
 if(!isRecord(value)||Object.keys(value).length!==2||typeof value.action!=='string'||!actions.has(value.action)||
   !isRecord(value.body)||!valid(value.action,value.body))return reply(400,{error:'invalid_request'});
 try{
  const now=Date.now();
  if(value.action==='login'){
   const identity=await verifyTelegramIdentity(value.body.initData as string,botToken,now);
   if(!identity)return reply(401,{error:'telegram_required'});
   const inviter=identity.startParam?.startsWith('ref_')?identity.startParam.slice(4):undefined;
   const args={p_telegram:identity.telegramId,p_name:identity.displayName};
   const {ok,data}=isUuid(inviter)
    ?await rpc('vvr_resolve_referred_player',{...args,p_inviter:inviter})
    :await rpc('vvr_resolve_player',args);
   if(!ok||!isUuid(data))return reply(503,{error:'unavailable'});
   return reply(200,{token:await issueVvrSession(data,sessionKey,now)});
  }
  const auth=request.headers.get('authorization');
  const player=auth?.startsWith('Bearer ')?await readVvrSession(auth.slice(7),sessionKey,now):undefined;
  if(!player)return reply(401,{error:'session_required'});
  if(value.action==='referrals'){
   const result=await rpc('vvr_referrals',{p_player:player,p_before:value.body.before??null});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'referrals_unavailable'});
  }
  if(value.action==='brotherhood_claim'||value.action==='brotherhood_admin'){
   const result=value.action==='brotherhood_claim'
    ?await rpc('vvr_brotherhood_claim',{p_player:player,p_award:value.body.award})
    :await rpc('vvr_brotherhood_admin',{p_player:player,p_enabled:value.body.enabled??null});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'brotherhood_unavailable'});
  }
  if(value.action==='enhance'){
   const result=await rpc('vvr_enhance_item',{p_player:player,p_item:value.body.item,
    p_expected:value.body.expectedRank,p_operation:value.body.operationId});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'enhancement_rejected'});
  }
  if(value.action==='equip'||value.action==='unequip'){
   const result=await rpc('vvr_equipment',{p_player:player,p_action:value.action,p_item:value.body.item});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'equipment_request_rejected'});
  }
  if(value.action==='auction'){
   const [market,equipment]=await Promise.all([
    rpc('vvr_community',{p_player:player,p_action:'auction',p_body:{}}),
    rpc('vvr_equipment',{p_player:player,p_action:'equipment',p_item:null}),
   ]);
   if(!market.ok)return reply(rpcError(market.data),{error:'community_request_rejected'});
   if(!equipment.ok)return reply(rpcError(equipment.data),{error:'equipment_request_rejected'});
   if(!isRecord(market.data))return reply(503,{error:'unavailable'});
   return reply(200,{...market.data,equipment:equipment.data});
  }
  const endpoint=value.action.startsWith('guild')?'vvr_guild_community':'vvr_community';
  const {ok,data}=await rpc(endpoint,{p_player:player,p_action:value.action,p_body:value.body});
  return ok?reply(200,data):reply(rpcError(data),{error:'community_request_rejected'});
 }catch{return reply(503,{error:'unavailable'});}
});
