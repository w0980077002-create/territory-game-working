import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proofPayload,verifyProof,TON_DOMAIN} from '../supabase/functions/_shared/ton';

const encoder=new TextEncoder();
const concat=(...parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length}return out};
const sha=async(b:Uint8Array)=>new Uint8Array(await crypto.subtle.digest('SHA-256',b as Uint8Array<ArrayBuffer>));

/** Signs exactly as a TON Connect wallet does (ton-proof-item-v2). */
async function sign(keys:CryptoKeyPair,address:string,payload:string,timestamp:number,domain=TON_DOMAIN){
 const [wc,hash]=address.split(':');
 const b=(n:number,size:number,le:boolean,signed=false)=>{const a=new Uint8Array(size),v=new DataView(a.buffer);
  if(size===4)signed?v.setInt32(0,n,le):v.setUint32(0,n,le);else v.setBigUint64(0,BigInt(n),le);return a};
 const message=concat(encoder.encode('ton-proof-item-v2/'),b(Number(wc),4,false,true),Uint8Array.from(hash.match(/../g)!,x=>parseInt(x,16)),
  b(encoder.encode(domain).length,4,true),encoder.encode(domain),b(timestamp,8,true),encoder.encode(payload));
 const full=await sha(concat(new Uint8Array([0xff,0xff]),encoder.encode('ton-connect'),await sha(message)));
 const signature=new Uint8Array(await crypto.subtle.sign({name:'Ed25519'},keys.privateKey,full));
 return {timestamp,domain:{lengthBytes:encoder.encode(domain).length,value:domain},payload,signature:btoa(String.fromCharCode(...signature))};
}

test('ton_proof links only a wallet whose on-chain key signed our fresh payload for our domain',async t=>{
 const keys=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
 const raw=new Uint8Array(await crypto.subtle.exportKey('raw',keys.publicKey));
 const pubHex=Array.from(raw,x=>x.toString(16).padStart(2,'0')).join('');
 let chainKey:string|undefined='0x'+pubHex;
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(chainKey?{exit_code:0,stack:[{type:'num',value:chainKey}]}:{exit_code:-13,stack:[]})));
 const address='0:'+'ab'.repeat(32),secret='s'.repeat(40),now=Date.now();
 const payload=await proofPayload(secret,'player-a',now);
 const proof=await sign(keys,address,payload,Math.floor(now/1000));
 assert.equal(await verifyProof(secret,'player-a',address,proof,now),'ok');
 assert.equal(await verifyProof(secret,'player-b',address,proof,now),'expired','payload is bound to the player');
 assert.equal(await verifyProof(secret,'player-a','0:'+'cd'.repeat(32),proof,now),'signature','another address');
 assert.equal(await verifyProof(secret,'player-a',address,await sign(keys,address,payload,Math.floor(now/1000),'evil.example'),now),'domain');
 assert.equal(await verifyProof(secret,'player-a',address,proof,now+16*60_000),'expired');
 assert.equal(await verifyProof(secret,'player-a',address,{...proof,payload:payload.slice(0,-1)+'0'},now),'expired','forged payload');
 const other=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
 assert.equal(await verifyProof(secret,'player-a',address,await sign(other,address,payload,Math.floor(now/1000)),now),'signature','key that does not own the wallet');
 chainKey=undefined;
 assert.equal(await verifyProof(secret,'player-a',address,proof,now),'inactive_wallet');
});

test('the treasury transfer comment is a valid one-cell BOC that TON libraries read back',async()=>{
 const {Cell}=await import('@ton/core');
 const {commentBoc}=await import('../src/core/tonComment');
 const cell=Cell.fromBase64(commentBoc('vvr-test-abc'));
 const slice=cell.beginParse();
 assert.equal(slice.loadUint(32),0);
 assert.equal(slice.loadStringTail(),'vvr-test-abc');
});
