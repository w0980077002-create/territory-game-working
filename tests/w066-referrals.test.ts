import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {issueVvrSession} from '../supabase/functions/_shared/vvr-identity';

test('W066 Edge attributes only a signed start parameter and reads only the session owner',async()=>{
 const now=Date.now();
 const bot='isolated-telegram-bot-token',secret='isolated-community-session-secret';
 const inviter='11111111-1111-4111-8111-111111111111',player='22222222-2222-4222-8222-222222222222';
 const env:Record<string,string>={TELEGRAM_BOT_TOKEN:bot,VVR_SESSION_SECRET:secret,
  SUPABASE_URL:'https://isolated-w066.example',SUPABASE_SERVICE_ROLE_KEY:'isolated-service-role'};
 let handle!:(request:Request)=>Promise<Response>;
 const rpcCalls:{name:string;args:unknown}[]=[];
 const network=globalThis.fetch;
 Object.assign(globalThis,{Deno:{env:{get:(name:string)=>env[name]},serve:(handler:typeof handle)=>{handle=handler;}}});
 globalThis.fetch=async (url,init)=>{
  const name=String(url).split('/').at(-1)!;
  rpcCalls.push({name,args:JSON.parse(String(init?.body))});
  return Response.json(name==='vvr_referrals'?{startParam:'ref_'+player,rows:[],next:null}:player);
 };
 try{
  // Load the Deno entry point at test runtime, outside the browser type-check.
  await import(new URL('../supabase/functions/vvr-community/index.ts',import.meta.url).href);
  const app='https://isolated-w066.example/functions/v1/vvr-community';
  const post=(action:string,body:object,token?:string)=>handle(new Request(app+'?tgWebAppStartParam=ref_'+inviter,{
   method:'POST',body:JSON.stringify({action,body}),headers:token?{Authorization:'Bearer '+token}:{},
  }));
  const signed=(startParam?:string)=>{
   const fields=new URLSearchParams({auth_date:String(Math.floor(now/1000)),user:JSON.stringify({id:801,first_name:'Friend'})});
   if(startParam)fields.set('start_param',startParam);
   fields.sort();
   const seed=createHmac('sha256','WebAppData').update(bot).digest();
   fields.set('hash',createHmac('sha256',seed).update([...fields].map(([key,value])=>key+'='+value).join('\n')).digest('hex'));
   return fields;
  };

  const modified=signed('ref_'+inviter);
  modified.set('start_param','ref_'+player);
  assert.equal((await post('login',{initData:String(modified)})).status,401);
  assert.equal((await post('login',{initData:String(signed()),inviter})).status,400);
  assert.equal(rpcCalls.length,0);
  assert.equal((await post('login',{initData:String(signed('ref_'+inviter))})).status,200);
  assert.deepEqual(rpcCalls.shift(),{name:'vvr_resolve_referred_player',
   args:{p_telegram:'801',p_name:'Friend',p_inviter:inviter}});
  for(const parameter of [undefined,'ref_invalid','mail_acceptance']){
   assert.equal((await post('login',{initData:String(signed(parameter))})).status,200);
   assert.deepEqual(rpcCalls.shift(),{name:'vvr_resolve_player',args:{p_telegram:'801',p_name:'Friend'}});
  }
  const session=await issueVvrSession(player,secret,now);
  assert.equal((await post('referrals',{})).status,401);
  assert.equal((await post('referrals',{player:inviter},session)).status,400);
  assert.equal((await post('referral_reward',{invitee:player},session)).status,400);
  assert.equal(rpcCalls.length,0);
  const state=await post('referrals',{},session);
  assert.equal(state.status,200);
  assert.deepEqual(await state.json(),{startParam:'ref_'+player,rows:[],next:null});
  assert.deepEqual(rpcCalls.shift(),{name:'vvr_referrals',args:{p_player:player,p_before:null}});
 }finally{
  globalThis.fetch=network;
  Reflect.deleteProperty(globalThis,'Deno');
 }
});
