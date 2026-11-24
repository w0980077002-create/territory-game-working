import {issueVvrSession,readVvrSession,verifyTelegramIdentity} from '../_shared/vvr-identity.ts';

const project=Deno.env.get('SUPABASE_URL');
const roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const sessionKey=Deno.env.get('VVR_SESSION_SECRET')??'';
const botToken=Deno.env.get('TELEGRAM_BOT_TOKEN')??'';
const origin=Deno.env.get('VVR_WEB_ORIGIN')??'https://w0980077002-create.github.io';
const actions=new Set(['login','auction','trade','chat','post','hide','ranking']);
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
  case 'auction':case 'chat':return keys===0;
  case 'trade':
   if(!isUuid(body.operationId))return false;
   return body.kind==='list'?keys===4&&isUuid(body.itemId)&&typeof body.price==='number'&&
    Number.isSafeInteger(body.price)&&body.price>=1&&body.price<=1_000_000_000:
    keys===3&&(body.kind==='buy'||body.kind==='cancel')&&isUuid(body.listingId);
  case 'post':return keys===2&&isUuid(body.operationId)&&typeof body.text==='string'&&body.text.length<=960;
  case 'hide':return keys===1&&typeof body.message==='number'&&Number.isSafeInteger(body.message)&&body.message>0;
  case 'ranking':return (keys===1&&body.season===undefined||keys===2&&isUuid(body.season))&&
   (body.metric==='world_boss_damage'||body.metric==='arena_wins');
  default:return false;
 }
}

async function input(request:Request){
 const stream=request.body?.getReader();
 if(!stream)throw new Error('missing_body');
 const decoder=new TextDecoder(),parts:string[]=[];
 let size=0;
 try{
  for(;;){
   const {done,value}=await stream.read();
   if(done)break;
   size+=value.length;
   if(size>maxInput){await stream.cancel();throw new Error('body_too_large');}
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

Deno.serve(async request=>{
 const requestedOrigin=request.headers.get('origin'),allowed=requestedOrigin===null||requestedOrigin===origin;
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,authorization',
  'Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json',Vary:'Origin'};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(!allowed)return reply(403,{error:'origin_forbidden'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
 if(!project||!roleKey||!botToken||sessionKey.length<32||sessionKey===botToken)return reply(503,{error:'unavailable'});
 let value:unknown;
 try{value=await input(request);}catch{return reply(400,{error:'invalid_request'});}
 if(!isRecord(value)||Object.keys(value).length!==2||typeof value.action!=='string'||!actions.has(value.action)||
   !isRecord(value.body)||!valid(value.action,value.body))return reply(400,{error:'invalid_request'});
 try{
  const now=Date.now();
  if(value.action==='login'){
   const identity=await verifyTelegramIdentity(value.body.initData as string,botToken,now);
   if(!identity)return reply(401,{error:'telegram_required'});
   const {ok,data}=await rpc('vvr_resolve_player',{p_telegram:identity.telegramId,p_name:identity.displayName});
   if(!ok||!isUuid(data))return reply(503,{error:'unavailable'});
   return reply(200,{token:await issueVvrSession(data,sessionKey,now)});
  }
  const auth=request.headers.get('authorization');
  const player=auth?.startsWith('Bearer ')?await readVvrSession(auth.slice(7),sessionKey,now):undefined;
  if(!player)return reply(401,{error:'session_required'});
  const {ok,data}=await rpc('vvr_community',{p_player:player,p_action:value.action,p_body:value.body});
  return ok?reply(200,data):reply(rpcError(data),{error:'community_request_rejected'});
 }catch{return reply(503,{error:'unavailable'});}
});
