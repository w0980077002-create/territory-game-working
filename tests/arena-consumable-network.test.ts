import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {createServer,type Server} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {test} from 'node:test';
import {createArenaServer} from '../server/arena/http';
import {arenaBuild} from '../src/arena/hero';
import {capacities,type LiveAction,type LiveBattle} from '../src/arena/match';
import {consumableIds,consumablePrice,type ConsumableId,type ConsumableStock} from '../src/arena/potion';
import {freshPlayer} from '../src/core/store';

const sessionKey='session-key-only-for-server-consumable-tests';
const secret='publisher-token-only-for-consumable-tests';
const groups:ConsumableId[][]=[
 ['potion','tear','berserk','thor','odin','minerva','aegis'],
 ['niflheim','muspel','mars','mercury','venom','fenrir','hel'],
 ['neptune','steel','loki','apollo','valkyrie','bifrost'],
];

async function listen(server:Server){
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const address=server.address();
 assert.ok(address&&typeof address!=='string');
 return 'http://127.0.0.1:'+address.port;
}
const close=(server:Server)=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));

test('all 20 kinds spend exactly once through authenticated 1×1, 3×3 and 20×20 HTTP battles', {timeout:30_000},async()=>{
 let now=1_800_000_000_000,stockReads=0,arenaUrl='';
 const accounts=new Map<string,{issued:ConsumableStock;spent:ConsumableStock;gold:number;receipts:Map<string,ConsumableId>}>();
 const account=(id:string)=>{
  if(!accounts.has(id))accounts.set(id,{issued:{},spent:{},gold:1000,receipts:new Map()});
  return accounts.get(id)!;
 };
 const publisher=createServer(async (req,res)=>{
  assert.equal(req.headers.authorization,'Bearer '+secret);
  let raw='';for await(const chunk of req)raw+=chunk;
  const input=JSON.parse(raw);
  const reply=(data:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data))};
  if(req.url==='/arena-consumable-spending'){
   for(const {telegram,item,total} of input.entries as {telegram:string;item:ConsumableId;total:number}[]){
    const {issued,spent}=account(telegram);
    assert.ok(total<=(issued[item]??0));
    spent[item]=Math.max(spent[item]??0,total);
   }
   return reply({accepted:true});
  }
  if(req.url!=='/arena-consumables')return reply({accepted:true});
  stockReads++;
  const wallet=account(input.telegram);
  if(input.operation){
   const item=input.item as ConsumableId;
   if(wallet.receipts.has(input.operation)&&wallet.receipts.get(input.operation)!==item)return reply({},409);
   if(!wallet.receipts.has(input.operation)){
    wallet.receipts.set(input.operation,item);
    wallet.gold-=input.price;
    wallet.issued[item]=(wallet.issued[item]??0)+1;
   }
  }
  reply({status:'ok',gold:wallet.gold,stage:1,attack:12,issued:wallet.issued,spent:wallet.spent});
 });
 const root=mkdtempSync(join(tmpdir(),'arena-consumables-http-'));
 const publisherUrl=await listen(publisher);
 const options={dbPath:join(root,'arena.sqlite'),clock:()=>now,rng:()=>.8,sessionKey,
  botToken:'test-telegram-bot-token',scorePublisher:{url:publisherUrl+'/arena-result',token:secret}};
 let server=createArenaServer(options);
 let loginCount=0;
 const newClient=async(number:number)=>{
  if(loginCount++%25===0)now+=61_000;
  const id=String(number),tab=randomUUID();
  const fields=new URLSearchParams({auth_date:String(Math.floor(now/1000)),user:JSON.stringify({id:number,first_name:'Hero '+id})});
  const key=createHmac('sha256','WebAppData').update(options.botToken).digest();
  fields.set('hash',createHmac('sha256',key).update([...fields].map(([name,value])=>name+'='+value).join('\n')).digest('hex'));
  const auth=await fetch(arenaUrl+'/arena-api/auth',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({initData:fields.toString()})});
  assert.equal(auth.status,200);
  const {token}=await auth.json();
  const request=async(path:string,data?:object,activeTab:string=tab)=>{
   const response=await fetch(arenaUrl+'/arena-api/live/'+path,{method:data?'POST':'GET',headers:{
    Authorization:'Bearer '+token,'X-Arena-Tab':activeTab,...(data?{'Content-Type':'application/json'}:{})},
    body:data?JSON.stringify(data):undefined});
   return {status:response.status,data:await response.json()};
  };
  return {id,request};
 };
 type Client=Awaited<ReturnType<typeof newClient>>;
 const battle=async(client:Client,tab?:string)=>(await client.request('state',undefined,tab)).data.battle as LiveBattle;
 const act=(client:Client,view:LiveBattle,action:LiveAction,tab?:string)=>client.request('act',{
  target:view.id,revision:view.revision,round:view.round??0,sequence:view.nextSequence,action,
 },tab);
 try{
  arenaUrl=await listen(server);
  const build=arenaBuild(freshPlayer());
  const expected:{id:string;items:readonly ConsumableId[]}[]=[];
  let firstId=1000;
  for(const mode of ['duel','team','chaos'] as const){
   const used=new Set<ConsumableId>();
   for(const assigned of [groups.slice(0,2),groups.slice(2)]){
    const clients:Client[]=[];
    for(let index=0;index<capacities[mode];index++)clients.push(await newClient(firstId+index));
    firstId+=capacities[mode];
    const [left,right]=clients;
    for(const [index,kinds] of assigned.entries()){
     const client=clients[index],wallet=account(client.id);
     for(const item of kinds)wallet.issued[item]=1;
     expected.push({id:client.id,items:kinds});
    }
    if(mode==='duel'&&assigned.length===2){
     const item='aegis',purchase={operation:randomUUID(),stage:1,price:consumablePrice(item,1),item};
     assert.equal((await left.request('consumables',{...purchase,price:1})).status,400);
     const replies=await Promise.all([left.request('consumables',purchase),left.request('consumables',purchase)]);
     for(const reply of replies){
      assert.equal(reply.status,200);
      assert.equal(reply.data.stock.aegis,2);
      assert.equal(reply.data.gold,1000-purchase.price);
     }
     assert.equal((await left.request('consumables',{...purchase,item:'thor',price:consumablePrice('thor',1)})).status,409);
    }
    for(const [index,client] of clients.entries()){
     const kinds=assigned[index]??['odin'];
     const slots=[...kinds,...Array(7-kinds.length).fill(null)];
     const result=await client.request('join',{mode,build,stage:1,localPotions:99,belt:slots,stock:{odin:99}});
     assert.equal(result.status,200);
    }
    const opened=await battle(left);
    assert.equal(opened.mode,mode);
    assert.equal(opened.players.length,capacities[mode]);
    assert.equal(opened.ranked,true);
    const rightView=await battle(right);
    if(assigned.length===1)assert.equal(rightView.belt.odin,0,'Solo inventory is never reserved in PvP');

    const initial=(target:string):LiveAction=>mode==='duel'?
     {kind:'move',move:{attack:'head',blocks:['belly','legs'],skill:null}}:
     {kind:'strike',target,attack:'head',blocks:['belly','legs']};
    assert.equal((await act(left,opened,initial(right.id))).data.accepted,true);
    assert.equal((await act(right,rightView,initial(left.id))).data.accepted,true);
    assert.ok((await battle(left)).you.hp<opened.you.hp);
    if(assigned.length===1)assert.equal((await act(right,await battle(right),{kind:'item',item:'odin'})).data.accepted,false);

    const newTab=randomUUID(),oldView=await battle(left);
    assert.equal((await battle(left,newTab)).control,false);
    const resumed=(await left.request('resume',{target:opened.id,revision:oldView.revision},newTab)).data.battle as LiveBattle;
    assert.equal(resumed.revision,oldView.revision+1);
    assert.equal((await act(left,oldView,{kind:'item',item:assigned[0][0]})).data.accepted,false);
    const readsBeforeMoves=stockReads;
    for(let index=0;index<Math.max(...assigned.map(items=>items.length));index++){
     const attempts=assigned.map(async (items,side)=>{
      const item=items[index];
      if(!item)return;
      const client=clients[side],tab=side===0?newTab:undefined,view=await battle(client,tab);
      const action={kind:'item',item} as const;
      const replies=await Promise.all([act(client,view,action,tab),act(client,view,action,tab)]);
      assert.deepEqual(replies.map(reply=>reply.data.accepted).sort(),[false,true],mode+' '+item);
      used.add(item);
      const after=await battle(client,tab);
      assert.equal(after.belt[item],(view.belt[item]??0)-1);
      if(items[index+1]){
       const rejected=await act(client,after,{kind:'item',item:items[index+1]},tab);
       assert.equal(rejected.data.accepted,false,'shared cooldown must not spend another item');
      }
     });
     await Promise.all(attempts);
     now+=2100;
    }
    assert.equal(stockReads,readsBeforeMoves,'combat uses SQLite, not a W066 quote for every hit');
    if(mode==='duel'&&assigned.length===2){
     const before=(await left.request('consumables')).data;
     assert.equal(before.stock.aegis,1);
     await close(server);
     server=createArenaServer(options);
     arenaUrl=await listen(server);
     const reopened=await battle(left,newTab);
     assert.equal(reopened.belt.aegis,1);
     assert.equal(reopened.control,true);
     assert.equal((await left.request('consumables')).data.stock.aegis,1);
    }
    for(const client of clients.filter((_,index)=>index%2===1)){
     const view=await battle(client);
     assert.equal((await act(client,view,{kind:'leave'})).data.accepted,true);
    }
    assert.ok((await battle(left,newTab)).result);
    const remaining=(await left.request('consumables')).data;
    assert.equal(remaining.reserved[assigned[0][0]]??0,0);
    assert.equal(remaining.stock[assigned[0][0]],0);
    now+=61_000;
   }
   assert.deepEqual([...used].sort(),[...consumableIds].sort(),mode);
  }
  const deadline=Date.now()+7000;
  while(Date.now()<deadline&&!expected.every(({id,items})=>items.every(item=>account(id).spent[item]===1)))await wait(100);
  for(const {id,items} of expected)for(const item of items)assert.equal(account(id).spent[item],1,'outbox '+id+' '+item);
 }finally{
  if(server.listening)await close(server);
  await close(publisher);
  rmSync(root,{recursive:true,force:true});
 }
});
