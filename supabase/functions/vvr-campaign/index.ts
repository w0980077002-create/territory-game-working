import {readVvrSession} from '../_shared/vvr-identity.ts';
import {makeSecretReader} from '../_shared/w066-secrets.ts';
import {makeCampaignHandler} from './handler.ts';
import {giftHornItem} from '../../../server/campaign/giftHorn.ts';
import {firstBossVictory,replayCampaign} from '../../../server/campaign/firstBoss.ts';

const project=Deno.env.get('SUPABASE_URL')??'';
const role=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const origin=Deno.env.get('VVR_WEB_ORIGIN')??'https://w0980077002-create.github.io';
const secrets=makeSecretReader(project,role,{
 sessionKey:Deno.env.get('VVR_SESSION_SECRET')??'',botToken:Deno.env.get('TELEGRAM_BOT_TOKEN')??'',
});

async function rpc(name:string,body:Record<string,unknown>):Promise<unknown>{
 const response=await fetch(project+'/rest/v1/rpc/'+name,{
  method:'POST',headers:{'Content-Type':'application/json',apikey:role,Authorization:'Bearer '+role},
  body:JSON.stringify(body),signal:AbortSignal.timeout(4500),
 });
 if(!response.ok)throw new Error('campaign_proof_database_unavailable');
 return response.json();
}

Deno.serve(makeCampaignHandler(rpc,async token=>{
 const {sessionKey,botToken}=await secrets();
 if(!project||!role||sessionKey.length<32||sessionKey===botToken)throw new Error('campaign_session_unavailable');
 return readVvrSession(token,sessionKey,Date.now());
},firstBossVictory,origin,giftHornItem,replayCampaign));
