/**
 * World boss API, shared by the Supabase Edge Function (Deno) and the local QA server (Node).
 * Runtime-neutral: WebCrypto + fetch-free core. The caller supplies `rpc` (service-role access to
 * the public.vvr_world_boss_* functions) and the bot token. Telegram initData is verified exactly
 * like the Arena server (HMAC-SHA256 with "WebAppData"); the browser never supplies a player id.
 */
export interface Identity {telegramId:string;name:string}
export type Rpc=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
export interface Deps {botToken:string;rpc:Rpc;now?:()=>number}
export interface Reply {status:number;body:unknown}

const INIT_MAX_AGE=24*60*60; // Mini App sessions stay open for long; the signature still binds the user.
const enc=new TextEncoder();
async function hmac(key:Uint8Array|ArrayBuffer,text:string){
 const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(text)));
}
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
function sameHex(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}

export async function verifyInitData(raw:unknown,botToken:string,nowMs:number):Promise<Identity|undefined>{
 if(typeof raw!=='string'||!botToken||!raw||raw.length>8192)return;
 const fields=new URLSearchParams(raw),hash=fields.get('hash');
 if(!hash||!/^[a-f\d]{64}$/i.test(hash)||new Set(fields.keys()).size!==[...fields.keys()].length)return;
 fields.delete('hash');
 const text=[...fields].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
 const secret=await hmac(enc.encode('WebAppData'),botToken);
 if(!sameHex(hex(await hmac(secret,text)),hash.toLowerCase()))return;
 const date=fields.get('auth_date');
 if(!date||!/^\d+$/.test(date))return;
 const age=Math.floor(nowMs/1000)-Number(date);
 if(age<-30||age>INIT_MAX_AGE)return;
 try{
  const {id,first_name}=JSON.parse(fields.get('user')??'null');
  if(Number.isSafeInteger(id)&&id>0){
   const name=typeof first_name==='string'?first_name.replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,32):'';
   return {telegramId:String(id),name:name||'Северный страж'};
  }
 }catch{/* malformed user: no identity */}
}

/** Signs initData for local QA only (the same format Telegram produces). */
export async function signInitData(user:{id:number;first_name:string},botToken:string,nowMs:number){
 const fields=new URLSearchParams({auth_date:String(Math.floor(nowMs/1000)),query_id:'local',user:JSON.stringify(user)});
 const text=[...fields].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
 fields.set('hash',hex(await hmac(await hmac(enc.encode('WebAppData'),botToken),text)));
 return fields.toString();
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS=['participation','rank','last_hit'];
const BOSSES=['minotaur_echo','fire_abyss_lord','spider_queen','fungal_king','capybara_bruiser','senior_driller','moss_eater'];
/** Known game errors are returned to the player; anything else stays a generic server error. */
export const ERRORS=['world_boss_auth_required','world_boss_no_event','world_boss_not_started','world_boss_cooldown',
 'world_boss_daily_limit','world_boss_no_reward','world_boss_admin_only','world_boss_bad_config','world_boss_already_open',
 'world_boss_not_open','world_boss_bad_duration','world_boss_bad_request'] as const;
function gameError(e:unknown){const text=String((e as {message?:string})?.message??e);return ERRORS.find(code=>text.includes(code))}

export async function handle(input:unknown,deps:Deps):Promise<Reply>{
 const body=(input&&typeof input==='object'?input:{}) as Record<string,unknown>;
 const who=await verifyInitData(body.initData,deps.botToken,(deps.now??Date.now)());
 if(!who)return {status:401,body:{error:'world_boss_auth_required'}};
 const id=who.telegramId;
 try{
  switch(body.action){
   case 'state':return ok(await deps.rpc('vvr_world_boss_state',{p_telegram_id:id}));
   case 'attack':
    if(typeof body.requestId!=='string'||!UUID.test(body.requestId))return bad();
    return ok(await deps.rpc('vvr_world_boss_attack',{p_telegram_id:id,p_name:who.name,p_request_id:body.requestId}));
   case 'claim':
    if(typeof body.eventId!=='string'||!UUID.test(body.eventId)||!KINDS.includes(String(body.kind)))return bad();
    return ok(await deps.rpc('vvr_world_boss_claim',{p_telegram_id:id,p_event:body.eventId,p_kind:body.kind}));
   case 'admin_start':{
    const minutes=Number(body.minutes),hp=Number(body.maxHp);
    if(typeof body.title!=='string'||!BOSSES.includes(String(body.boss))||!Number.isInteger(minutes)||!Number.isSafeInteger(hp)
     ||(body.config!==undefined&&(typeof body.config!=='object'||body.config===null||Array.isArray(body.config))))return bad();
    const startsAt=typeof body.startsAt==='string'&&!Number.isNaN(Date.parse(body.startsAt))?new Date(body.startsAt).toISOString():null;
    return ok(await deps.rpc('vvr_world_boss_admin_start',{p_telegram_id:id,p_title:body.title.slice(0,60),p_boss:body.boss,
     p_starts_at:startsAt,p_minutes:minutes,p_max_hp:hp,p_config:body.config??{}}));
   }
   case 'admin_end':
    if(typeof body.eventId!=='string'||!UUID.test(body.eventId))return bad();
    return ok(await deps.rpc('vvr_world_boss_admin_end',{p_telegram_id:id,p_event:body.eventId}));
   case 'admin_report':
    if(typeof body.eventId!=='string'||!UUID.test(body.eventId))return bad();
    return ok(await deps.rpc('vvr_world_boss_admin_report',{p_telegram_id:id,p_event:body.eventId}));
   default:return bad();
  }
 }catch(e){
  const code=gameError(e);
  return code?{status:409,body:{error:code}}:{status:500,body:{error:'world_boss_unavailable'}};
 }
}
const ok=(body:unknown):Reply=>({status:200,body});
const bad=():Reply=>({status:400,body:{error:'world_boss_bad_request'}});
