// Supabase Edge Function: vvr-world-boss (W066). Deploy: supabase functions deploy vvr-world-boss --no-verify-jwt
// Secrets (never in the repo): TELEGRAM_BOT_TOKEN, WORLD_BOSS_ALLOWED_ORIGINS (comma-separated, e.g. the Pages origin).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import {handle} from '../_shared/worldBoss.ts';
import {makeSecretReader} from '../_shared/w066-secrets.ts';

declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(req:Request)=>Response|Promise<Response>):void};
const url=Deno.env.get('SUPABASE_URL')??'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const explicitBotToken=Deno.env.get('TELEGRAM_BOT_TOKEN')??'';
const readSecrets=makeSecretReader(url,key,{botToken:explicitBotToken,sessionKey:Deno.env.get('VVR_SESSION_SECRET')??''});
const origins=(Deno.env.get('WORLD_BOSS_ALLOWED_ORIGINS')??'https://w0980077002-create.github.io').split(',').map(s=>s.trim()).filter(Boolean);

async function rpc(name:string,args:Record<string,unknown>){
 const res=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
 const text=await res.text();
 if(!res.ok)throw new Error(text.slice(0,500));
 return text?JSON.parse(text):null;
}
function cors(origin:string|null):Record<string,string>{
 const allowed=origin&&origins.includes(origin)?origin:origins[0]??'';
 return {'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type, apikey, authorization','Vary':'Origin'};
}
Deno.serve(async req=>{
 const headers=cors(req.headers.get('origin'));
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return new Response('{"error":"world_boss_bad_request"}',{status:405,headers});
 const raw=await req.text();
 if(raw.length>12_000)return new Response('{"error":"world_boss_bad_request"}',{status:413,headers});
 let input:unknown=null;try{input=JSON.parse(raw)}catch{/* handled as bad request */}
 const botToken=explicitBotToken||(await readSecrets()).botToken;
 const reply=await handle(input,{botToken,rpc});
 return new Response(JSON.stringify(reply.body),{status:reply.status,headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-store'}});
});
