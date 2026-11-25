import {parseProofCommands} from '../../../src/game/campaignProof.ts';
import type {HeroClass} from '../../../src/core/types.ts';

type Rpc=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
type ReadPlayer=(token:string)=>Promise<string|undefined>;
type Verify=(hero:HeroClass,seed:number,commands:NonNullable<ReturnType<typeof parseProofCommands>>,startedAt:number)=>number|null;

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const isUuid=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
const isHero=(value:unknown):value is HeroClass=>value==='berserker'||value==='ranger'||value==='runologist';
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

async function jsonInput(request:Request){
 const reader=request.body?.getReader();
 if(!reader)return null;
 let bytes=0,body='';
 const decoder=new TextDecoder();
 try{
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   bytes+=value.length;
   if(bytes>8192){await reader.cancel();return null;}
   body+=decoder.decode(value,{stream:true});
  }
  return JSON.parse(body+decoder.decode()) as unknown;
 }catch{return null;}
 finally{reader.releaseLock();}
}

export function makeCampaignHandler(rpc:Rpc,readPlayer:ReadPlayer,verify:Verify,origin:string){
 return async (request:Request):Promise<Response>=>{
  const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,authorization',
   'Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json',Vary:'Origin'};
  const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
  const requested=request.headers.get('origin');
  if(requested&&requested!==origin)return reply(403,{error:'origin_forbidden'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  try{
   const auth=request.headers.get('authorization');
   const player=auth?.startsWith('Bearer ')?await readPlayer(auth.slice(7)):undefined;
   if(!player)return reply(401,{error:'session_required'});
   const input=await jsonInput(request);
   if(!record(input)||Object.keys(input).length!==3)return reply(400,{error:'invalid_request'});
   if(input.action==='begin'&&isUuid(input.client)&&isHero(input.hero)){
    return reply(200,await rpc('vvr_campaign_boss_begin',{p_player:player,p_client:input.client,p_hero:input.hero}));
   }
   const commands=parseProofCommands(input.commands);
   if(input.action!=='replay'||!isUuid(input.ticket)||!commands)return reply(400,{error:'invalid_request'});
   const args={p_player:player,p_ticket:input.ticket};
   const checked=await rpc('vvr_campaign_boss_check',args);
   if(!record(checked))return reply(503,{error:'campaign_proof_unavailable'});
   if(checked.status!=='check')return reply(200,checked);
   const {hero,seed,startedAt}=checked;
   if(!isHero(hero)||typeof seed!=='number'||!Number.isSafeInteger(seed)||typeof startedAt!=='number'||!Number.isSafeInteger(startedAt))
    return reply(503,{error:'campaign_proof_unavailable'});
   const ticks=verify(hero,seed,commands,startedAt);
   if(ticks===null)return reply(200,{status:'unverified'});
   return reply(200,await rpc('vvr_campaign_boss_finish',{...args,p_victory_ticks:ticks}));
  }catch{return reply(503,{error:'campaign_proof_unavailable'});}
 };
}
