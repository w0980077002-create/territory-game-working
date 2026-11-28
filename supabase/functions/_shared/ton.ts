// TON wallets: proof of ownership (TON Connect ton_proof) and treasury income sync. Moves no funds.
type Rpc=(name:string,body:unknown)=>Promise<{ok:boolean;data:unknown}>;
type Reply=(status:number,body:unknown)=>Response;
const encoder=new TextEncoder();
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=(text:string):Uint8Array<ArrayBuffer>=>Uint8Array.from(text.match(/../g)??[],b=>parseInt(b,16));
const PROOF_TTL_MS=15*60_000;
export const TON_DOMAIN='w0980077002-create.github.io';
const TONCENTER='https://toncenter.com/api/v3/';

async function mac(key:string,text:string){
 const k=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',k,encoder.encode(text)));
}
/** Stateless proof payload bound to the player: expiry (hex) + truncated HMAC. */
export async function proofPayload(sessionKey:string,player:string,now=Date.now()){
 const expiry=(now+PROOF_TTL_MS).toString(16).padStart(12,'0');
 return expiry+hex((await mac(sessionKey,'ton-proof:'+player+':'+expiry)).slice(0,16));
}
async function payloadValid(sessionKey:string,player:string,payload:string,now:number){
 if(!/^[0-9a-f]{44}$/.test(payload))return false;
 const expiry=payload.slice(0,12);
 if(parseInt(expiry,16)<now)return false;
 return payload.slice(12)===hex((await mac(sessionKey,'ton-proof:'+player+':'+expiry)).slice(0,16));
}
const sha256=async(bytes:Uint8Array)=>new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>));
const concat=(...parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length}return out};
const u32le=(n:number)=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b};
const i32be=(n:number)=>{const b=new Uint8Array(4);new DataView(b.buffer).setInt32(0,n,false);return b};
const u64le=(n:number)=>{const b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,BigInt(n),true);return b};

/** The public key the wallet contract itself reports; undeployed wallets cannot prove ownership. */
async function walletKey(address:string){
 const r=await fetch(TONCENTER+'runGetMethod',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({address,method:'get_public_key',stack:[]}),signal:AbortSignal.timeout(8000)});
 if(!r.ok)return;
 const data=await r.json();
 const value=data?.exit_code===0?data.stack?.[0]?.value:undefined;
 return typeof value==='string'?BigInt(value).toString(16).padStart(64,'0'):undefined;
}

/** TON Connect ton_proof v2: signature over the address, app domain, time and our payload. */
export async function verifyProof(sessionKey:string,player:string,address:string,proof:Record<string,unknown>,now=Date.now()){
 const domain=isRecord(proof.domain)?proof.domain:{};
 const payload=String(proof.payload??''),timestamp=Number(proof.timestamp),domainValue=String(domain.value??'');
 if(!await payloadValid(sessionKey,player,payload,now))return 'expired';
 if(domainValue!==TON_DOMAIN||Number(domain.lengthBytes)!==encoder.encode(domainValue).length)return 'domain';
 if(!Number.isSafeInteger(timestamp)||Math.abs(now/1000-timestamp)>PROOF_TTL_MS/1000)return 'expired';
 const key=await walletKey(address);
 if(!key)return 'inactive_wallet';
 const [wc,hash]=address.split(':');
 const message=concat(encoder.encode('ton-proof-item-v2/'),i32be(Number(wc)),fromHex(hash),u32le(Number(domain.lengthBytes)),
  encoder.encode(domainValue),u64le(timestamp),encoder.encode(payload));
 const full=await sha256(concat(new Uint8Array([0xff,0xff]),encoder.encode('ton-connect'),await sha256(message)));
 let signature:Uint8Array;
 try{signature=Uint8Array.from(atob(String(proof.signature)),c=>c.charCodeAt(0));}catch{return 'signature'}
 const pub=await crypto.subtle.importKey('raw',fromHex(key) as Uint8Array<ArrayBuffer>,{name:'Ed25519'},false,['verify']);
 return await crypto.subtle.verify({name:'Ed25519'},pub,signature as Uint8Array<ArrayBuffer>,full as Uint8Array<ArrayBuffer>)?'ok':'signature';
}

/** Incoming treasury transfers with a `vvr-` comment become crypto_income ledger rows (idempotent by tx hash). */
async function treasuryIncome(treasury:string){
 const r=await fetch(TONCENTER+'transactions?limit=50&sort=desc&account='+encodeURIComponent(treasury),{signal:AbortSignal.timeout(8000)});
 if(!r.ok)return;
 const data=await r.json();
 const out:{hash:string;ton:number;comment:string;at:string}[]=[];
 for(const tx of data?.transactions??[]){
  const msg=tx?.in_msg,comment=msg?.message_content?.decoded?.comment;
  if(typeof comment==='string'&&comment.startsWith('vvr-')&&Number(msg?.value)>0)
   out.push({hash:String(tx.hash),ton:Number(msg.value)/1e9,comment:comment.slice(0,64),at:new Date(Number(tx.now)*1000).toISOString()});
 }
 return out;
}

export async function handleTonAction(action:string,body:Record<string,unknown>,player:string,sessionKey:string,rpc:Rpc,reply:Reply,rpcError:(d:unknown)=>number){
 if(action==='ton_proof_payload')return reply(200,{payload:await proofPayload(sessionKey,player),domain:TON_DOMAIN});
 if(action==='ton_wallet'){
  let verified=false;
  if(body.action==='link'){
   const result=await verifyProof(sessionKey,player,String(body.address),isRecord(body.proof)?body.proof:{}).catch(()=>'signature');
   if(result!=='ok')return reply(200,{status:'proof_'+result});
   verified=true;
  }
  const r=await rpc('vvr_ton_wallet',{p_player:player,p_action:body.action,p_address:body.address??null,p_verified:verified});
  return r.ok?reply(200,r.data):reply(rpcError(r.data),{error:'wallet_rejected'});
 }
 if(action==='admin_crypto_sync'){
  const t=await rpc('vvr_treasury',{p_actor:player});
  if(!t.ok)return reply(rpcError(t.data),{error:'admin_request_rejected'});
  const treasury=isRecord(t.data)?String(t.data.ton??''):'';
  const entries=await treasuryIncome(treasury).catch(()=>undefined);
  if(!entries)return reply(503,{error:'toncenter_unavailable'});
  const r=await rpc('vvr_crypto_income',{p_actor:player,p_entries:entries});
  return r.ok?reply(200,r.data):reply(rpcError(r.data),{error:'admin_request_rejected'});
 }
 return reply(400,{error:'invalid_request'});
}
