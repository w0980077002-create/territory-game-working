import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {AuctionLedger,TradeError} from '../server/auction/ledger';

test('auction serializes escrow, wallet and ownership across independent connections and retries',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vvr-auction-'));
 const path=join(dir,'trade.sqlite');
 const seller=new AuctionLedger(path),buyer=new AuctionLedger(path);
 const item=randomUUID(),listId=randomUUID(),buyId=randomUUID();
 const denied=(action:()=>unknown,code:TradeError['code'])=>assert.throws(action,error=>error instanceof TradeError&&error.code===code);
 try{
  seller.provisionWallet('1',15);
  seller.provisionWallet('2',500);
  seller.provisionWallet('3',100);
  seller.grantItem(item,'1','masterwork:shield');
  seller.grantItem(item,'1','masterwork:shield');
  const list={kind:'list',itemId:item,price:200} as const;
  denied(()=>buyer.transact('2',randomUUID(),list),'unavailable');
  const listed=seller.transact('1',listId,list,1000);
  assert.deepEqual(buyer.openListings(),[{id:listed.listingId,price:200,catalogId:'masterwork:shield'}]);
  assert.deepEqual(buyer.transact('1',listId,list,1001),listed);
  denied(()=>buyer.transact('1',listId,{...list,price:201}),'operation_conflict');
  denied(()=>buyer.transact('1',randomUUID(),list),'unavailable');
  assert.deepEqual(seller.ownedItems('1'),[]);
  const buy={kind:'buy',listingId:listed.listingId} as const;
  denied(()=>buyer.transact('1',randomUUID(),buy),'forbidden');
  denied(()=>buyer.transact('3',randomUUID(),buy),'funds');
  denied(()=>buyer.transact('2',randomUUID(),{...buy,kind:'cancel'}),'forbidden');
  assert.equal(buyer.balance('3'),100);
  const purchased=buyer.transact('2',buyId,buy,1002);
  assert.deepEqual(seller.transact('2',buyId,buy,1003),purchased);
  denied(()=>buyer.transact('3',randomUUID(),buy),'unavailable');
  assert.equal(seller.balance('1'),215);
  assert.equal(buyer.balance('2'),300);
  seller.provisionWallet('1',15);
  seller.grantItem(item,'1','masterwork:shield');
  assert.equal(seller.balance('1'),215);
  assert.deepEqual(buyer.ownedItems('2'),[{id:item,catalogId:'masterwork:shield'}]);
  assert.deepEqual(buyer.openListings(),[]);
  denied(()=>seller.grantItem(item,'2','masterwork:shield'),'operation_conflict');
  assert.deepEqual(seller.history('1'),[purchased,listed]);
  const reopened=new AuctionLedger(path);
  try{
   assert.deepEqual(reopened.history('2'),[purchased]);
   assert.equal(reopened.balance('2'),300);
  }finally{reopened.close()}
 }finally{
  buyer.close();seller.close();rmSync(dir,{recursive:true,force:true});
 }
});

test('simultaneous buyers can settle a listing only once',{timeout:10_000},async({signal})=>{
 const dir=mkdtempSync(join(tmpdir(),'vvr-auction-race-'));
 const path=join(dir,'race.sqlite'),ledger=new AuctionLedger(path);
 const workers:Worker[]=[];
 try{
  for(const player of ['1','2','3'])ledger.provisionWallet(player,100);
  const item=randomUUID();
  ledger.grantItem(item,'1','weapon');
  const {listingId}=ledger.transact('1',randomUUID(),{kind:'list',itemId:item,price:60});
  const modulePath=fileURLToPath(new URL('../server/auction/ledger.ts',import.meta.url));
  const start=new Int32Array(new SharedArrayBuffer(4));
  for(const actor of ['2','3']){
   const worker=new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    const {randomUUID}=require('node:crypto');
    require('tsx/cjs');
    const {AuctionLedger}=require(workerData.modulePath);
    const ledger=new AuctionLedger(workerData.path);
    parentPort.postMessage('ready');
    Atomics.wait(workerData.start,0,0);
    let result='sold';
    try{ledger.transact(workerData.actor,randomUUID(),{kind:'buy',listingId:workerData.listingId})}
    catch(error){result=error.code??String(error)}
    finally{ledger.close()}
    parentPort.postMessage(result);
   `,{eval:true,workerData:{actor,modulePath,path,listingId,start}});
   workers.push(worker);
  }
  const ready=await Promise.all(workers.map(worker=>once(worker,'message',{signal})));
  assert.deepEqual(ready,[['ready'],['ready']]);
  const results=workers.map(worker=>once(worker,'message',{signal}));
  Atomics.store(start,0,1);Atomics.notify(start,0);
  const replies=await Promise.all(results);
  assert.deepEqual(replies.map(([message])=>message).sort(),['sold','unavailable']);
  assert.equal(ledger.balance('1'),160);
  assert.deepEqual([ledger.balance('2'),ledger.balance('3')].sort(),[100,40]);
  assert.equal(ledger.ownedItems('2').length+ledger.ownedItems('3').length,1);
 }finally{
  await Promise.all(workers.map(worker=>worker.terminate()));
  ledger.close();rmSync(dir,{recursive:true,force:true});
 }
});

test('failed credit rolls back the debit, and cancellation releases the item exactly once',()=>{
 const ledger=new AuctionLedger(':memory:');
 try{
  ledger.provisionWallet('1',1_000_000_000);
  ledger.provisionWallet('2',100);
  const item=randomUUID(),cancelId=randomUUID();
  ledger.grantItem(item,'1','ring');
  const {listingId}=ledger.transact('1',randomUUID(),{kind:'list',itemId:item,price:50});
  assert.throws(()=>ledger.transact('2',randomUUID(),{kind:'buy',listingId}),/funds/);
  assert.equal(ledger.balance('2'),100);
  assert.deepEqual(ledger.history('2'),[]);
  assert.deepEqual(ledger.ownedItems('1'),[]);
  const cancelled=ledger.transact('1',cancelId,{kind:'cancel',listingId});
  assert.deepEqual(ledger.transact('1',cancelId,{kind:'cancel',listingId}),cancelled);
  assert.deepEqual(ledger.ownedItems('1'),[{id:item,catalogId:'ring'}]);
  assert.throws(()=>ledger.transact('2',randomUUID(),{kind:'buy',listingId}),/unavailable/);
 }finally{ledger.close()}
});
