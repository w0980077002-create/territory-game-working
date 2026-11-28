import {readVvrSession} from '../_shared/vvr-identity.ts';
import {makeSecretReader} from '../_shared/w066-secrets.ts';

const project = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const origin = Deno.env.get('VVR_WEB_ORIGIN') ?? 'https://w0980077002-create.github.io';
const readSecrets = makeSecretReader(project ?? '', serviceKey ?? '', {botToken:'', sessionKey:Deno.env.get('VVR_SESSION_SECRET') ?? ''});
const headers = {
  'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization,content-type',
};
const reply = (status:number, body:unknown) => new Response(JSON.stringify(body),{status,headers});
const record = (value:unknown):value is Record<string,unknown> =>
  !!value && typeof value==='object' && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const txid = /^[a-f0-9]{64}$/;
const units = /^(?:0|[1-9][0-9]{0,15})$/;
const commandFields:Record<string,readonly string[]> = {
  state:[],admin_state:[],fund:['txid'],fund_fee:['txid'],award:['source','event','player','units'],
  request:['units','destination'],approve:['request','fee_cap'],reject:['request'],dispatch:['request'],settle:['request','txid'],
};

function validCommand(value:unknown) {
  if (!record(value) || typeof value.kind!=='string' || !Object.hasOwn(commandFields,value.kind)) return false;
  const fields=commandFields[value.kind];
  const reading=value.kind==='state'||value.kind==='admin_state';
  if (Object.keys(value).length!==fields.length+(reading?1:2) || (!reading &&
    (typeof value.operation!=='string'||!uuid.test(value.operation)))) return false;
  return fields.every(field=>{
    const item=value[field];
    if (typeof item!=='string'||item.length===0||item.length>96) return false;
    if (field==='txid') return txid.test(item);
    if (field==='units'||field==='fee_cap') return units.test(item);
    if (field==='event'||field==='player'||field==='request') return uuid.test(item);
    return true;
  });
}

async function readBody(request:Request):Promise<Uint8Array> {
  const reader=request.body?.getReader();
  if (!reader) throw Error('body_required');
  const buffer=new Uint8Array(8192);
  let length=0;
  try {
    for (;;) {
      const part=await reader.read();
      if (part.done) return buffer.slice(0,length);
      if (length+part.value.length>buffer.byteLength) {
        await reader.cancel();
        throw Error('body_limit');
      }
      buffer.set(part.value,length);
      length+=part.value.length;
    }
  } finally {reader.releaseLock();}
}

async function verifyReceipt(request:Request, data:Uint8Array<ArrayBuffer>, secret:string|null) {
  const signature=request.headers.get('x-vvr-red-signature') ?? '';
  if (!secret||!txid.test(signature)) return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const mac=Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16));
  return crypto.subtle.verify('HMAC',key,mac,data);
}

async function rpc(name:string, body:object) {
  const response=await fetch(project+'/rest/v1/rpc/'+name,{method:'POST',headers:{
    authorization:'Bearer '+serviceKey,apikey:serviceKey!,'content-type':'application/json',
  },body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
  const value:unknown=await response.json();
  if (response.ok) return reply(200,value);
  const code=record(value)?value.code:undefined;
  return reply(code==='42501'?403:code==='23505'?409:typeof code==='string'&&code.startsWith('22')?400:503,
    {error:'ledger_request_rejected'});
}

Deno.serve(async request=>{
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers});
  if (request.method!=='POST') return reply(405,{error:'method_not_allowed'});
  if (!project||!serviceKey) return reply(503,{error:'unavailable'});
  const receipt=new URL(request.url).pathname.endsWith('/receipt');
  let raw:Uint8Array<ArrayBuffer>;
  let value:unknown;
  try {
    raw=await readBody(request) as Uint8Array<ArrayBuffer>;
    value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  } catch {return reply(400,{error:'invalid_body'});}
  try {
    if (receipt) {
      if (!await verifyReceipt(request,raw,Deno.env.get('VVR_RED_VERIFIER_SECRET')??null)) {
        return reply(403,{error:'verifier_required'});
      }
      const fields=['txid','kind','network','asset','source','destination','units','fee_units','occurred_at','request'];
      if (!record(value)||Object.keys(value).length!==fields.length||
        fields.some(k=>typeof value[k]!=='string'||String(value[k]).length>96)||
        !txid.test(String(value.txid))||!units.test(String(value.units))||!units.test(String(value.fee_units))||
        (value.kind==='payout'?!uuid.test(String(value.request)):value.request!=='')) {
        return reply(400,{error:'invalid_receipt'});
      }
      return await rpc('vvr_red_observe',{p_receipt:value});
    }
    const token=request.headers.get('authorization')?.match(/^Bearer ([^ ]+)$/)?.[1];
    if (!token) return reply(401,{error:'session_required'});
    const {sessionKey}=await readSecrets();
    const actor=sessionKey?await readVvrSession(token,sessionKey,Date.now()):undefined;
    if (!actor) return reply(401,{error:'session_required'});
    if (!validCommand(value)) return reply(400,{error:'invalid_command'});
    return await rpc('vvr_red_action',{p_actor:actor,p_command:value});
  } catch {return reply(503,{error:'unavailable'});}
});
