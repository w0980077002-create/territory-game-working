import {issueVvrSession,readVvrSession,verifyTelegramIdentity} from '../_shared/vvr-identity.ts';
import {makeSecretReader} from '../_shared/w066-secrets.ts';
import {handleStarsAction,handleWebhook} from '../_shared/stars.ts';

const project=Deno.env.get('SUPABASE_URL');
const roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const readSecrets=makeSecretReader(project??'',roleKey??'',{
 sessionKey:Deno.env.get('VVR_SESSION_SECRET')??'',botToken:Deno.env.get('TELEGRAM_BOT_TOKEN')??'',
});
const origin=Deno.env.get('VVR_WEB_ORIGIN')??'https://w0980077002-create.github.io';
const actions=new Set(['login','auction','trade','chat','post','hide','ranking','guild','guild_roster','guild_boss_claim','referrals','brotherhood_claim','brotherhood_admin','admin_unlock','admin_lock','admin_password','admin_find_player','admin_status','admin_apply','admin_analytics','track','stars_offers','stars_invoice','shipyard_invoice','shipyard_paid','premium_transfer','admin_finance','admin_bot','admin_stars_refund','ton_wallet','admin_treasury','premium_wallet','equip','unequip','enhance']);
const sanctions=['chat_mute','trade_ban','network_ban'];
const flagNames=['arena_ranked','arena_team','auction_trade','chat','world_boss','premium_shop','stars_shop'];
const starsActions=new Set(['stars_offers','stars_invoice','shipyard_invoice','shipyard_paid','premium_transfer','admin_finance','admin_bot','admin_stars_refund','ton_wallet','admin_treasury']);
const networkActions:Partial<Record<string,string>>={
 auction:'auction_trade',trade:'auction_trade',market_workshop:'auction_trade',chat:'chat_view',post:'chat',hide:'chat',
 referrals:'brotherhood',brotherhood_claim:'brotherhood',
};
actions.add('market_workshop');
const maxInput=16_384;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

const isUuid=(id:unknown):id is string=>typeof id==='string'&&uuid.test(id);
function isRecord(value:unknown):value is Record<string,unknown>{
 return !!value&&typeof value==='object'&&!Array.isArray(value);
}

const text=(value:unknown,max:number)=>typeof value==='string'&&value.length>0&&value.length<=max;

function validAdmin(body:Record<string,unknown>){
 if(Object.keys(body).length!==4||!isUuid(body.operationId)||typeof body.reason!=='string'||
  body.reason.trim().length<3||body.reason.length>280||!isRecord(body.payload))return false;
 const p=body.payload,keys=Object.keys(p).length;
 if(body.kind==='flag')return keys===2&&typeof p.name==='string'&&flagNames.includes(p.name)&&typeof p.enabled==='boolean';
 if(!isUuid(p.player))return false;
 if(body.kind==='credit')return keys===2&&Number.isSafeInteger(p.amount)&&Number(p.amount)>0&&Number(p.amount)<=1_000_000;
 if(body.kind==='cancel_purchase')return keys===2&&isUuid(p.purchase);
 if(typeof p.kind!=='string'||!sanctions.includes(p.kind))return false;
 if(body.kind==='lift')return keys===2;
 return body.kind==='sanction'&&keys===3&&(p.expiresAt===null||typeof p.expiresAt==='string'&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(p.expiresAt)&&Number.isFinite(Date.parse(p.expiresAt)));
}

function valid(action:string,body:Record<string,unknown>){
 const keys=Object.keys(body).length;
 switch(action){
  case 'login':return keys===1&&typeof body.initData==='string';
  case 'auction':case 'chat':case 'guild':return keys===0;
  case 'referrals':return keys===0||(keys===1&&isUuid(body.before));
  case 'brotherhood_claim':return keys===1&&isUuid(body.award);
  case 'premium_wallet':return keys===0||(keys===2&&isUuid(body.operationId)&&typeof body.sku==='string'&&/^[a-z0-9-]{1,48}$/.test(body.sku));
  case 'brotherhood_admin':return keys===0||(keys===1&&typeof body.enabled==='boolean');
  case 'admin_find_player':return keys===1&&typeof body.telegramId==='string'&&/^[1-9][0-9]{0,15}$/.test(body.telegramId);
  case 'admin_status':return keys===0||keys===1&&Number.isSafeInteger(body.before)&&Number(body.before)>0;
  case 'admin_apply':return validAdmin(body);
  case 'admin_unlock':return keys===2&&text(body.login,32)&&text(body.password,72);
  case 'admin_lock':return keys===0;
  case 'admin_analytics':return keys===0||keys===1&&Number.isSafeInteger(body.days)&&Number(body.days)>=1&&Number(body.days)<=90;
  case 'stars_offers':return keys===0;
  case 'stars_invoice':return keys===1&&typeof body.sku==='string'&&/^[a-z0-9-]{1,32}$/.test(body.sku);
  case 'shipyard_invoice':return keys===1&&typeof body.hull==='string'&&['scout','merchant','warship','dragon','odin'].includes(body.hull);
  case 'shipyard_paid':
   if(body.kind==='state')return keys===1;
   if(body.kind==='cosmetic'||body.kind==='planner')return keys===2&&isUuid(body.order);
   if(!isUuid(body.order)||!Number.isSafeInteger(body.version)||Number(body.version)<1||Number(body.version)>2147483647)return false;
   if(body.kind==='launch')return keys===4&&[1,4,8,12,24].includes(Number(body.hours))&&typeof body.hours==='number';
   if(body.kind==='outfit')return keys===4&&typeof body.rig==='string'&&['sails','nets','pennant'].includes(body.rig);
   return keys===3&&typeof body.kind==='string'&&['claim','repair','upgrade','salvage'].includes(body.kind);
  case 'premium_transfer':return keys===2&&isUuid(body.operationId)&&Number.isSafeInteger(body.amount)&&Number(body.amount)>=1&&Number(body.amount)<=1_000_000;
  case 'admin_finance':return keys===0||keys===1&&Number.isSafeInteger(body.days)&&Number(body.days)>=1&&Number(body.days)<=3650;
  case 'admin_bot':return keys===0||keys===1&&body.connect===true;
  case 'admin_stars_refund':return keys===1&&isUuid(body.order);
  case 'ton_wallet':return keys===1&&(body.action==='get'||body.action==='unlink')||keys===2&&body.action==='link'&&typeof body.address==='string'&&/^-?[0-9]:[0-9a-f]{64}$/.test(body.address);
  case 'admin_treasury':return keys===0;
  case 'track':return keys===1&&Array.isArray(body.events)&&body.events.length>=1&&body.events.length<=25;
  case 'admin_password':return keys===3&&text(body.oldPassword,72)&&text(body.login,32)&&text(body.password,72);
  case 'market_workshop':
   if(keys===0)return true;
   if(!isUuid(body.operationId))return false;
   if(body.kind==='choose')return keys===3&&typeof body.profession==='string'&&['smith','leatherworker','tailor','jeweler'].includes(body.profession);
   if(body.kind==='gather')return keys===2;
   return body.kind==='craft'&&keys===4&&isUuid(body.own)&&isUuid(body.partner);
  case 'trade':
   if(!isUuid(body.operationId))return false;
   if(body.kind==='request')return keys===4&&typeof body.catalogId==='string'&&/^[-a-z0-9:]{1,48}$/.test(body.catalogId)
    &&Number.isSafeInteger(body.price)&&Number(body.price)>=10&&Number(body.price)<=1_000_000_000;
   if(body.kind==='withdraw')return keys===3&&isUuid(body.requestId);
   if(body.kind==='fulfill')return keys===4&&isUuid(body.requestId)&&isUuid(body.itemId);
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

async function arenaPublisher(request:Request,kind:'profile'|'team'|'duel'|'potions'|'consumables'|'spending'|'policy',reply:(status:number,body:unknown)=>Response){
 const bearer=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 if(!bearer)return reply(401,{error:'arena_publisher_required'});
 let data:unknown;
 try{data=await input(request,kind==='team'||kind==='spending'?16384:2048);}catch{return reply(400,{error:'invalid_arena_result'});}
 if(!isRecord(data))return reply(400,{error:'invalid_arena_result'});
 const validDate=(time:unknown)=>typeof time==='string'&&Number.isFinite(Date.parse(time));
 if(kind==='policy'){
  if(Object.keys(data).length!==2||typeof data.telegram!=='string'||!/^[1-9][0-9]{0,15}$/.test(data.telegram)||
   typeof data.feature!=='string'||!['arena_ranked','arena_team','arena_chat','brotherhood'].includes(data.feature))
   return reply(400,{error:'invalid_arena_policy'});
 }else if(kind==='team'){
  if((Object.keys(data).length!==7&&!(Object.keys(data).length===8&&data.local===true))||!isUuid(data.match)||!['team','chaos'].includes(String(data.mode))||
   !validDate(data.startedAt)||!validDate(data.finishedAt)||!['hp','time','afk'].includes(String(data.reason))||
   ![0,1,null].includes(data.winner as number|null)||!Array.isArray(data.members))
   return reply(400,{error:'invalid_arena_result'});
 }else if(kind==='spending'){
  if(Object.keys(data).length!==1||!Array.isArray(data.entries)||data.entries.length<1||data.entries.length>100)
   return reply(400,{error:'invalid_arena_spending'});
 }else if((kind==='potions'||kind==='consumables'?
   ![2,kind==='potions'?5:6].includes(Object.keys(data).length)||Object.keys(data).length!==2&&
    (!isUuid(data.operation)||!Number.isSafeInteger(data.stage)||!Number.isSafeInteger(data.price)||
     kind==='consumables'&&typeof data.item!=='string'):
   Object.keys(data).length!==(kind==='profile'?2:4))||typeof data.telegram!=='string'||
  !/^[1-9][0-9]{0,15}$/.test(data.telegram)||typeof data.name!=='string'||
  Array.from(data.name).length<1||Array.from(data.name).length>32||
  (kind==='duel'&&(!isUuid(data.match)||!validDate(data.finishedAt)))){
  return reply(400,{error:'invalid_arena_result'});
 }
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bearer)));
 const tokenHash=Array.from(hash,byte=>byte.toString(16).padStart(2,'0')).join('');
 if(kind==='policy'){
  const result=await rpc('vvr_network_policy',{p_feature:data.feature,p_telegram:data.telegram,p_token_hash:tokenHash});
  return result.ok?reply(200,{allowed:result.data===true}):reply(rpcError(result.data),{error:'arena_policy_rejected'});
 }
 if(kind==='team'){
  if(data.local===true){
   const member=data.members[0];
   if(data.members.length!==1||!isRecord(member)||typeof member.telegram!=='string'||
    !/^[1-9][0-9]{0,15}$/.test(member.telegram))return reply(400,{error:'invalid_arena_result'});
   const policy=await rpc('vvr_network_policy',{p_feature:'brotherhood',p_telegram:member.telegram,p_token_hash:tokenHash});
   if(!policy.ok)return reply(rpcError(policy.data),{error:'arena_policy_rejected'});
   if(policy.data!==true)return reply(200,{accepted:true});
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
 if(kind==='spending'){
  const result=await rpc('vvr_arena_consumable_spending',{p_token_hash:tokenHash,p_entries:data.entries});
  return result.ok&&result.data===true?reply(200,{accepted:true}):reply(rpcError(result.data),{error:'arena_spending_rejected'});
 }
 if(kind==='potions'||kind==='consumables'){
  const result=await rpc(kind==='potions'?'vvr_arena_potions':'vvr_arena_consumables',{
   p_token_hash:tokenHash,p_telegram:data.telegram,p_name:data.name,
   p_operation:data.operation??null,p_stage:data.stage??null,p_price:data.price??null,
   ...(kind==='consumables'?{p_item:data.item??null}:{}),
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
 const publisherRoutes={
  'arena-result':'duel','arena-profile':'profile','arena-team-result':'team','arena-potions':'potions',
  'arena-consumables':'consumables','arena-consumable-spending':'spending','arena-policy':'policy',
 } as const;
 const route=path.slice(path.lastIndexOf('/')+1);
 if(Object.hasOwn(publisherRoutes,route)){
  if(!project||!roleKey)return reply(503,{error:'unavailable'});
  try{return await arenaPublisher(request,publisherRoutes[route as keyof typeof publisherRoutes],reply);}catch{return reply(503,{error:'unavailable'});}
 }
 const {botToken,sessionKey}=await readSecrets();
 if(!project||!roleKey||!botToken||sessionKey.length<32||sessionKey===botToken)return reply(503,{error:'unavailable'});
 if(new URL(request.url).pathname.endsWith('/backup')){
  try{return await backup(request,sessionKey,reply);}catch{return reply(503,{error:'unavailable'});}
 }
 if(route==='stars-webhook'){
  try{return await handleWebhook(request,sessionKey,botToken,rpc);}catch{return new Response('{}',{status:500});}
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
   const canRefer=isUuid(inviter)&&await rpc('vvr_network_policy',{
    p_feature:'brotherhood',p_telegram:identity.telegramId,
   }).then(policy=>policy.ok&&policy.data===true,()=>false);
   const {ok,data}=canRefer
    ?await rpc('vvr_resolve_referred_player',{...args,p_inviter:inviter})
    :await rpc('vvr_resolve_player',args);
   if(!ok||!isUuid(data))return reply(503,{error:'unavailable'});
   return reply(200,{token:await issueVvrSession(data,sessionKey,now)});
  }
  const auth=request.headers.get('authorization');
  const player=auth?.startsWith('Bearer ')?await readVvrSession(auth.slice(7),sessionKey,now):undefined;
  if(!player)return reply(401,{error:'session_required'});
  const feature=networkActions[value.action];
  if(feature){
   const policy=await rpc('vvr_network_policy',{p_feature:feature,p_player:player});
   if(!policy.ok)return reply(503,{error:'network_policy_unavailable'});
   if(policy.data!==true)return reply(403,{error:'network_feature_restricted'});
  }
  if(value.action==='admin_unlock'||value.action==='admin_lock'||value.action==='admin_password'){
   const result=value.action==='admin_unlock'
    ?await rpc('vvr_admin_unlock',{p_actor:player,p_login:value.body.login,p_password:value.body.password})
    :value.action==='admin_lock'?await rpc('vvr_admin_lock',{p_actor:player})
    :await rpc('vvr_admin_password',{p_actor:player,p_old:value.body.oldPassword,p_login:value.body.login,p_password:value.body.password});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'admin_request_rejected'});
  }
  if(starsActions.has(value.action))return await handleStarsAction(value.action,value.body,player,botToken,sessionKey,project,rpc,reply,rpcError);
  if(value.action==='track'){
   const result=await rpc('vvr_track',{p_player:player,p_events:value.body.events});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'track_rejected'});
  }
  if(value.action==='admin_analytics'){
   const result=await rpc('vvr_analytics_report',{p_actor:player,p_days:value.body.days??14});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'admin_request_rejected'});
  }
  if(value.action==='admin_find_player'){
   const result=await rpc('vvr_admin_find_player',{p_actor:player,p_telegram:value.body.telegramId});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'admin_search_rejected'});
  }
  if(value.action==='admin_status'||value.action==='admin_apply'){
   const result=value.action==='admin_status'
    ?await rpc('vvr_admin_status',{p_actor:player,p_before:value.body.before??null})
    :await rpc('vvr_admin_apply',{p_actor:player,p_operation:value.body.operationId,
      p_kind:value.body.kind,p_reason:value.body.reason,p_payload:value.body.payload});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'admin_request_rejected'});
  }
  if(value.action==='premium_wallet'){
   const result=await rpc('vvr_premium_wallet',{p_player:player,p_operation:value.body.operationId??null,p_sku:value.body.sku??null});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'premium_wallet_request_rejected'});
  }
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
  if(value.action==='market_workshop'){
   const {operationId,...command}=value.body;
   const result=await rpc('vvr_market_workshop',{p_player:player,p_operation:operationId??null,p_body:command});
   return result.ok?reply(200,result.data):reply(rpcError(result.data),{error:'workshop_rejected'});
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
