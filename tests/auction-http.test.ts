import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {issueSession} from '../server/arena/auth';
import {createAuctionServer} from '../server/auction/http';
import {AuctionLedger} from '../server/auction/ledger';

test('auction HTTP takes the actor from the session and the price from server ownership',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'vvr-auction-http-'));
 const path=join(directory,'auction.sqlite'),itemId=randomUUID();
 const key='isolated-test-session-key-at-least-32';
 const now=100_000_000;
 const seed=new AuctionLedger(path);
 try{
  seed.provisionWallet('1');
  seed.provisionWallet('2',100);
  seed.grantItem(itemId,'1','shield');
 }finally{seed.close()}
 const server=createAuctionServer({path,sessionKey:key,clock:()=>now});
 try{
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Missing test address');
  const ask=(route:string,token?:string,body?:unknown)=>fetch(`http://127.0.0.1:${address.port}/auction-api/${route}`,{
   method:body===undefined?'GET':'POST',headers:{
    ...(token?{Authorization:`Bearer ${token}`} : {}),
    ...(body===undefined?{}:{'Content-Type':'application/json'}),
   },body:body===undefined?undefined:JSON.stringify(body),
  });
  const seller=issueSession('1',key,now),buyer=issueSession('2',key,now);
  assert.equal((await ask('state')).status,401);
  assert.equal((await ask('state',issueSession('3','different signing key',now))).status,401);
  const list={operationId:randomUUID(),kind:'list',itemId,price:70};
  assert.equal((await ask('trade',buyer,{...list,actor:'1'})).status,400);
  assert.equal((await ask('trade',buyer,list)).status,409);
  const listed=await ask('trade',seller,list);
  assert.equal(listed.status,200);
  const {listingId}=await listed.json() as {listingId:string};
  const purchase={operationId:randomUUID(),kind:'buy',listingId};
  assert.equal((await ask('trade',buyer,{...purchase,price:1})).status,400);
  const response=await ask('trade',buyer,purchase);
  assert.equal(response.status,200);
  assert.deepEqual(await (await ask('trade',buyer,purchase)).json(),await response.json());
  const state=await (await ask('state',buyer)).json() as {balance:number;items:unknown[];listings:unknown[]};
  assert.equal(state.balance,30);
  assert.deepEqual(state.items,[{id:itemId,catalogId:'shield'}]);
  assert.deepEqual(state.listings,[]);
  assert.equal((await ask('trade',buyer,{...purchase,body:'x'.repeat(2049)})).status,400);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  rmSync(directory,{recursive:true,force:true});
 }
});
