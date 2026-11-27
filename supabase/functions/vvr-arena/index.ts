import {readVvrSession} from '../_shared/vvr-identity.ts';
import {makeSecretReader} from '../_shared/w066-secrets.ts';
import {makeArenaHandler} from './handler.ts';

const project=Deno.env.get('SUPABASE_URL')??'';
const role=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const origin=Deno.env.get('VVR_WEB_ORIGIN')??'https://w0980077002-create.github.io';
const secrets=makeSecretReader(project,role,{
 sessionKey:Deno.env.get('VVR_SESSION_SECRET')??'',botToken:Deno.env.get('TELEGRAM_BOT_TOKEN')??'',
});

async function rpc<T>(name:string,body:Record<string,unknown>):Promise<T>{
 const response=await fetch(project+'/rest/v1/rpc/'+name,{
  method:'POST',headers:{'Content-Type':'application/json',apikey:role,Authorization:'Bearer '+role},
  body:JSON.stringify(body),signal:AbortSignal.timeout(4500),
 });
 const result=await response.json();
 if(!response.ok)throw new Error(result?.code??'arena_unavailable');
 return result as T;
}

Deno.serve(makeArenaHandler(rpc,async(token,now)=>{
 const {sessionKey,botToken}=await secrets();
 if(!project||!role||sessionKey.length<32||sessionKey===botToken)throw new Error('arena_unavailable');
 return readVvrSession(token,sessionKey,now);
},origin,undefined,undefined,true));
